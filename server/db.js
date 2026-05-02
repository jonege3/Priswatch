const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/prisvakt.db');
let db;

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id   INTEGER NOT NULL,
    name          TEXT NOT NULL,
    url           TEXT NOT NULL UNIQUE,
    current_price INTEGER,
    list_price    INTEGER,
    shop          TEXT,
    image_url     TEXT,
    last_scraped  DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS price_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    price      INTEGER NOT NULL,
    shop       TEXT,
    scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_history_product ON price_history(product_id, scraped_at)');

  // Migrate: add new columns to existing DBs if they don't exist yet
  try { db.run('ALTER TABLE products ADD COLUMN list_price INTEGER'); } catch(_) {}
  try { db.run('ALTER TABLE products ADD COLUMN image_url TEXT'); } catch(_) {}
  try { db.run('ALTER TABLE categories DROP COLUMN icon'); } catch(_) {}

  const result = db.exec('SELECT COUNT(*) as n FROM categories');
  const count = result[0]?.values[0][0] ?? 0;
  if (count === 0) {
    for (const name of ['Graphics cards', 'Processors', 'TVs', 'Headphones & audio', 'Storage & SSDs']) {
      db.run('INSERT INTO categories (name) VALUES (?)', [name]);
    }
    save();
  }
  console.log('Database ready');
}

function save() {
  if (!db) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] ?? null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const row = get('SELECT last_insert_rowid() as id');
  save();
  return { lastInsertRowid: row?.id ?? null };
}

module.exports = { initDb, all, get, run, save };
