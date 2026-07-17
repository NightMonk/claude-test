import express from 'express';
import db from '../db.js';

const router = express.Router();

// Lists, each with a live count of its unfinished tasks.
router.get('/', (req, res) => {
  const lists = db.prepare('SELECT * FROM lists ORDER BY sort, id').all();
  for (const l of lists) {
    l.open_count = db
      .prepare('SELECT COUNT(*) AS n FROM tasks WHERE list_id = ? AND parent_id IS NULL AND done = 0')
      .get(l.id).n;
  }
  res.json(lists);
});

router.post('/', (req, res) => {
  const { name, color, emoji } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name is required' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM lists').get().m;
  const info = db
    .prepare('INSERT INTO lists (name, color, emoji, sort) VALUES (?, ?, ?, ?)')
    .run(name.trim(), color || '#5C6470', emoji || null, maxSort + 1);
  res.status(201).json(db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'color', 'emoji', 'sort'];
  const set = fields.filter((f) => f in (req.body || {}));
  if (set.length) {
    db.prepare(`UPDATE lists SET ${set.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
      .run(...set.map((f) => req.body[f]), req.params.id);
  }
  res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id); // tasks keep, list_id set null
  res.json({ ok: true });
});

export default router;
