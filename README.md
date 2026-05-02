# Priswatch 🔍

Personal price tracker for Prisjakt.no. Tracks prices on a schedule, imports historical data automatically, and shows you when prices drop.

---

## Running locally (development)

### Requirements
- Node.js 20+
- npm
- Windows: run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` in PowerShell once before anything else

### Setup

```bash
cd priswatch

npm install
npm install --prefix client

npm run dev
```

- **App**: http://localhost:5173
- **API**: http://localhost:3001/api

The SQLite database is created automatically at `data/priswatch.db` on first run.

---

## Deploying to TrueNAS Scale

### Requirements
- TrueNAS Scale with Docker / Apps enabled
- SSH access to your NAS

### Steps

```bash
# 1. Copy the project to your NAS (run this from your PC)
scp -r ./priswatch user@truenas-ip:/mnt/pool/priswatch

# 2. SSH into TrueNAS
ssh user@truenas-ip

# 3. Go to the project folder
cd /mnt/pool/priswatch

# 4. Build and start
docker compose up -d --build
```

Access at **http://truenas-ip:3001** from any device on your network.

The database is stored at `./data/priswatch.db` on the NAS — persists across container restarts and updates.

### Updating

```bash
cd /mnt/pool/priswatch
# copy in changed files, then:
docker compose up -d --build
```

---

## How scraping works

- **On server start** — scrapes all tracked products immediately
- **Every 8 hours** — scrapes again automatically
- **When you add a product** — scrapes immediately for current price + imports up to 2 years of historical data from Prisjakt's API
- **Manual** — hit "Refresh prices" in the UI anytime

Scraper waits 1.5–3 seconds between requests to avoid being blocked.

---

## Features

- **Categories** — expandable/collapsible groups, folder icon, coloured pills showing drop/up counts
- **Products** — image, name, cheapest shop, current price, 30d high, drop/stable/up badge
- **Price history chart** — 3M / 6M / 1Y / All range selector, imports Prisjakt's own historical data on add
- **Price drop detection** — compares current price to 30-day high, flags if 3%+ below peak
- **Search** — searches across all categories by name or shop
- **Sort** — A–Z, biggest drop %, highest saving kr, price low/high, recently updated
- **Bulk import** — paste multiple URLs, assign each to a category, imports all at once
- **Move product** — reassign a product to a different category from the detail panel
- **Mobile responsive** — works on phone without breaking the desktop layout

---

## API endpoints

```
GET    /api/categories              List all categories with product counts
POST   /api/categories              Add a category  { name }
PATCH  /api/categories/:id          Rename          { name }
DELETE /api/categories/:id          Delete + all its products

GET    /api/products                List all products with 30d stats
POST   /api/products                Add by URL      { url, category_id }
PATCH  /api/products/:id            Move category   { category_id }
DELETE /api/products/:id            Stop tracking
GET    /api/products/:id/history    Full price history
POST   /api/products/scrape         Trigger manual scrape
```

---

## Project structure

```
priswatch/
├── server/
│   ├── index.js          Express entry point
│   ├── db.js             SQLite schema (sql.js — no compilation needed)
│   ├── scraper.js        Prisjakt scraper + history import
│   ├── scheduler.js      Scrapes on boot + every 8 hours
│   └── routes/
│       ├── categories.js
│       └── products.js
├── client/
│   └── src/
│       ├── App.jsx               State + getStatus logic
│       ├── hooks/api.js          fetch wrapper
│       └── components/
│           ├── Dashboard.jsx     Layout, search, sort, stats
│           ├── CategoryRow.jsx   Expandable category accordion
│           ├── ProductRow.jsx    Product row + chart
│           └── BulkImport.jsx    Bulk URL import modal
├── data/                 SQLite DB (gitignored)
├── Dockerfile
├── docker-compose.yml
└── package.json
```
