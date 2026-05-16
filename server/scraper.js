const cheerio = require('cheerio');
const { all, get, run } = require('./db');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  'Accept-Language': 'nb-NO,nb;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};


function ts() {
  return new Date().toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function extractPrisjaktId(url) {
  try {
    const u = new URL(url);
    const qp = u.searchParams.get('p');
    if (qp && /^\d+$/.test(qp)) return qp;
    const match = u.pathname.match(/[-\/](\d{5,})(?:\/|$)/);
    if (match) return match[1];
  } catch (_) {}
  return null;
}

// Try multiple time ranges from longest to shortest
const TIME_RANGES = ['ALL_TIME', 'FIVE_YEARS', 'TWO_YEARS', 'ONE_YEAR'];

async function fetchPrisjaktHistory(productId) {
  if (!productId) return [];

  for (const timeRange of TIME_RANGES) {
    try {
      const res = await fetch('https://www.prisjakt.no/api/price-history', {
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://www.prisjakt.no',
          'Referer': `https://www.prisjakt.no/product.php?p=${productId}`,
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        },
        body: JSON.stringify({
          productId: parseInt(productId, 10),
          timeRange,
          shopIds: [],
        }),
      });

      console.log(`[scraper ${ts()}] price-history API (${timeRange}): HTTP ${res.status}`);
      if (!res.ok) continue;

      const json = await res.json();
      const items = json?.enrichedPriceHistory?.historyItems;
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`[scraper ${ts()}] No items in response for timeRange ${timeRange}`);
        continue;
      }

      // Group by day, keep lowest price per day
      const byDay = {};
      for (const item of items) {
        if (!item.price || !item.date) continue;
        const day = item.date.substring(0, 10);
        const priceKr = Math.round(item.price / 100);
        if (!byDay[day] || priceKr < byDay[day].price) {
          byDay[day] = { price: priceKr, shop: item.shopName, date: item.date };
        }
      }

      const history = Object.values(byDay)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      console.log(`[scraper ${ts()}] Got ${history.length} days of history (${timeRange})`);
      return history; // success — return immediately
    } catch (err) {
      console.log(`[scraper ${ts()}] price-history error (${timeRange}): ${err.message}`);
    }
  }

  console.log('[scraper] All time ranges failed — no historical data imported');
  return [];
}

async function scrapeProduct(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const name     = $('h1').first().text().trim() || null;
    const imageUrl = $('meta[property="og:image"]').attr('content') || null;

    let price = null, shop = null;

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        const offers = json.offers || json.Offers;
        if (!offers) return;
        const list = (Array.isArray(offers) ? offers : [offers])
          .filter(o => o.price || o.lowPrice)
          .map(o => ({
            price: Math.round(parseFloat(o.price || o.lowPrice || 0)),
            shop:  o.seller?.name || o.offeredBy?.name || null,
          }))
          .filter(o => o.price > 0)
          .sort((a, b) => a.price - b.price);
        if (list.length) { price = list[0].price; shop = list[0].shop; }
      } catch (_) {}
    });

    if (!price) {
      for (const sel of ['[data-price]', '[itemprop="price"]', '[class*="price"]']) {
        const el = $(sel).first();
        if (!el.length) continue;
        const raw = el.attr('data-price') || el.attr('content') || el.text();
        const parsed = parseInt(raw.replace(/\D/g, ''), 10);
        if (!isNaN(parsed) && parsed > 100) { price = parsed; break; }
      }
    }

    if (!shop) {
      shop = $('[class*="merchant-name"]').first().text().trim()
          || $('[class*="shop-name"]').first().text().trim()
          || null;
    }

    const productId = extractPrisjaktId(url);
    console.log(`[scraper ${ts()}] Product ID: ${productId}`);
    const prisjaktHistory = await fetchPrisjaktHistory(productId);

    // Use shop from the most recent history entry — much more reliable than JSON-LD
    if (prisjaktHistory.length > 0) {
      const latest = prisjaktHistory[prisjaktHistory.length - 1];
      if (latest.shop) shop = latest.shop;
      if (!price && latest.price) price = latest.price;
    }

    return { name: name || 'Unknown product', price, shop, imageUrl, prisjaktHistory };
  } catch (err) {
    console.error(`[scraper ${ts()}] Failed ${url}: ${err.message}`);
    return null;
  }
}

function importPrisjaktHistory(productId, history) {
  if (!history?.length) return 0;
  let imported = 0;
  for (const entry of history) {
    try {
      run(
        'INSERT INTO price_history (product_id, price, shop, scraped_at) VALUES (?, ?, ?, ?)',
        [productId, entry.price, entry.shop || 'Prisjakt (historical)', new Date(entry.date).toISOString()]
      );
      imported++;
    } catch (_) {}
  }
  console.log(`[scraper ${ts()}] Imported ${imported}/${history.length} historical data points into DB`);
  return imported;
}

async function scrapeAll() {
  const products = all('SELECT id, name, url FROM products');
  if (!products.length) { console.log('[scraper] No products to scrape'); return; }
  console.log(`[scraper ${ts()}] Scraping ${products.length} products...`);

  for (const product of products) {
    const result = await scrapeProduct(product.url);
    if (result?.price) {
      run(
        'UPDATE products SET current_price = ?, shop = ?, image_url = ?, last_scraped = ? WHERE id = ?',
        [result.price, result.shop, result.imageUrl, new Date().toISOString(), product.id]
      );
      run('INSERT INTO price_history (product_id, price, shop) VALUES (?, ?, ?)',
        [product.id, result.price, result.shop]);
      console.log(`[scraper ${ts()}] ${product.name}: ${result.price} kr (${result.shop || '?'})`);
    } else {
      console.warn(`[scraper ${ts()}] No price for "${product.name}"`);
    }
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
  }
  console.log('[scraper] Done');
}

module.exports = { scrapeProduct, scrapeAll, importPrisjaktHistory };
