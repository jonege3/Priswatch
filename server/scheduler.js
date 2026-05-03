const cron = require('node-cron');
const { scrapeAll } = require('./scraper');

let running = false;

function ts() {
  return new Date().toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

async function startScheduler() {
  // Scrape on startup — DB is already initialised before this is called
  console.log(`[scheduler ${ts()}] Running startup scrape...`);
  running = true;
  try { await scrapeAll(); } finally { running = false; }

  // Then every 8 hours
  cron.schedule('0 */8 * * *', async () => {
    if (running) {
      console.log(`[scheduler ${ts()}] Skipping — already running`);
      return;
    }
    running = true;
    console.log(`[scheduler ${ts()}] Triggered scheduled scrape`);
    try { await scrapeAll(); } finally { running = false; }
  });

  console.log(`[scheduler ${ts()}] Active — scrapes every 8 hours`);
}

async function runOnce() {
  if (running) return;
  running = true;
  console.log(`[scheduler ${ts()}] Manual scrape triggered`);
  try { await scrapeAll(); } finally { running = false; }
}

function isRunning() { return running; }

module.exports = { startScheduler, runOnce, isRunning };
