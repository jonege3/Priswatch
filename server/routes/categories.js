const express = require('express');
const { all, get, run } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(all(`
    SELECT c.*, COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.name
  `));
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const result = run('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), product_count: 0 });
});

router.patch('/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  run('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const products = all('SELECT id FROM products WHERE category_id = ?', [req.params.id]);
  for (const p of products) run('DELETE FROM price_history WHERE product_id = ?', [p.id]);
  run('DELETE FROM products WHERE category_id = ?', [req.params.id]);
  run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
