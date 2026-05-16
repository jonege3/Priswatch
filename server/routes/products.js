const express = require('express');
const { all, get, run } = require('../db');
const { scrapeProduct, importPrisjaktHistory } = require('../scraper');
const { runOnce, isRunning } = require('../scheduler');
const router = express.Router();

router.get('/', (req, res) => {
  const { category_id } = req.query;
  let sql = `
    SELECT p.*,
      (SELECT price FROM price_history
       WHERE product_id = p.id
       AND scraped_at <= datetime('now', '-7 days')
       ORDER BY scraped_at DESC LIMIT 1) AS price_7d_ago,
      (SELECT price FROM price_history
       WHERE product_id = p.id
       AND price != p.current_price
       ORDER BY scraped_at DESC LIMIT 1) AS price_last_different,
      (SELECT scraped_at FROM price_history
       WHERE product_id = p.id
       AND price != p.current_price
       ORDER BY scraped_at DESC LIMIT 1) AS price_last_changed_at,
      (SELECT MIN(price) FROM price_history
       WHERE product_id = p.id) AS price_all_time_low,
      (SELECT MAX(price) FROM price_history
       WHERE product_id = p.id) AS price_all_time_high,
      (SELECT ROUND(AVG(price)) FROM price_history
       WHERE product_id = p.id
       AND scraped_at >= datetime('now', '-90 days')) AS price_90d_avg,
      (SELECT MIN(price) FROM price_history
       WHERE product_id = p.id
       AND scraped_at >= datetime('now', '-30 days')) AS price_30d_low,
      (SELECT MAX(price) FROM price_history
       WHERE product_id = p.id
       AND scraped_at >= datetime('now', '-30 days')) AS price_30d_high
    FROM products p
  `;
  const params = [];
  if (category_id) { sql += ' WHERE p.category_id = ?'; params.push(category_id); }
  res.json(all(sql + ' ORDER BY p.name', params));
});

router.get('/:id/history', (req, res) => {
  const rows = all(
    'SELECT price, shop, scraped_at FROM price_history WHERE product_id = ? ORDER BY scraped_at ASC',
    [req.params.id]
  );
  console.log(`[api] History for product ${req.params.id}: ${rows.length} rows`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { url, category_id } = req.body;
  if (!url?.trim() || !category_id) return res.status(400).json({ error: 'url and category_id are required' });

  if (get('SELECT id FROM products WHERE url = ?', [url.trim()])) {
    return res.status(409).json({ error: 'Already tracking this product' });
  }

  let name = null, price = null, shop = null, imageUrl = null, prisjaktHistory = [];
  try {
    const scraped = await scrapeProduct(url.trim());
    if (scraped) {
      name = scraped.name;
      price = scraped.price;
      shop = scraped.shop;
      imageUrl = scraped.imageUrl;
      prisjaktHistory = scraped.prisjaktHistory || [];
    }
  } catch (e) {
    console.error('[api] scrape error:', e.message);
  }
  if (!name) { try { name = new URL(url).hostname; } catch(_) { name = url; } }

  const result = run(
    'INSERT INTO products (category_id, name, url, current_price, shop, image_url, last_scraped) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [category_id, name, url.trim(), price, shop, imageUrl, new Date().toISOString()]
  );
  const productId = result.lastInsertRowid;

  // Import Prisjakt history first (oldest data), then add today's price
  const historyImported = importPrisjaktHistory(productId, prisjaktHistory);
  if (price) run('INSERT INTO price_history (product_id, price, shop) VALUES (?, ?, ?)', [productId, price, shop]);

  console.log(`[api] Added product ${productId} "${name}" — ${historyImported} historical points, current price: ${price}`);
  res.status(201).json({ id: productId, category_id, name, url: url.trim(), current_price: price, shop, image_url: imageUrl, historyImported });
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM price_history WHERE product_id = ?', [req.params.id]);
  run('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/scrape', (req, res) => {
  if (isRunning()) return res.json({ ok: false, message: 'Already running' });
  runOnce();
  res.json({ ok: true });
});

module.exports = router;

// PATCH /api/products/:id — move to different category
router.patch('/:id', (req, res) => {
  const { category_id } = req.body
  if (!category_id) return res.status(400).json({ error: 'category_id required' })
  run('UPDATE products SET category_id = ? WHERE id = ?', [category_id, req.params.id])
  res.json({ ok: true })
})

// GET /api/products/preview?url=... — fetch name+image for a URL without saving
router.get('/preview', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url required' })
  try {
    const { scrapeProduct } = require('../scraper')
    const result = await scrapeProduct(url)
    res.json({
      name:      result?.name || null,
      image_url: result?.imageUrl || null,
      price:     result?.price || null,
      shop:      result?.shop || null,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
