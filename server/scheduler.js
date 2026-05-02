const cron = require('node-cron');
const { scrapeAll } = require('./scraper');

let running = false;

function startScheduler() {
  // Every 4 hours: 0 */4 * * *
  cron.schedule('0 */8 * * *', async () => {
    if (running) {
      console.log('[scheduler] Skipping — previous scrape still running');
      return;
    }
    running = true;
    try {
      console.log('[scheduler] Triggered scrape');
      await scrapeAll();
    } finally {
      running = false;
    }
  });

  console.log('[scheduler] Active — scrapes every 8 hours');
}

// Allow manually triggering a scrape via POST /api/scrape
async function runOnce() {
  if (running) return { ok: false, message: 'Already running' };
  running = true;
  try {
    await scrapeAll();
    return { ok: true };
  } finally {
    running = false;
  }
}

function isRunning() {
  return running;
}

module.exports = { startScheduler, runOnce, isRunning };
