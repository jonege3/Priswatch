const express = require('express');
const path = require('path');
const { initDb } = require('./db');
const categoriesRouter = require('./routes/categories');
const productsRouter = require('./routes/products');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);

// In production, serve the built React app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

async function start() {
  await initDb();
  startScheduler();
  app.listen(PORT, '0.0.0.0', () => {
    const now = new Date().toLocaleString('nb-NO');
    console.log(`\n🔍 Priswatch started at ${now}`);
    console.log(`   Running at http://localhost:${PORT}\n`);
  });
}

start().catch(console.error);
