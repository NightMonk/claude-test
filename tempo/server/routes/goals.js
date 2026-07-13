import express from 'express';
import db from '../db.js';

const router = express.Router();

// Attach computed progress + the single next action to a goal.
function enrich(goal) {
  if (!goal) return goal;
  const tasks = db
    .prepare('SELECT * FROM tasks WHERE goal_id = ? AND parent_id IS NULL ORDER BY done, due_at IS NULL, due_at, sort, id')
    .all(goal.id);
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  goal.total = total;
  goal.done_count = done;
  goal.progress = total ? Math.round((done / total) * 100) : 0;
  goal.next_action = tasks.find((t) => !t.done) || null; // the crucial next physical step
  return goal;
}

router.get('/', (req, res) => {
  const goals = db.prepare('SELECT * FROM goals WHERE done = 0 ORDER BY sort, id').all();
  res.json(goals.map(enrich));
});

router.get('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  res.json(enrich(goal));
});

router.post('/', (req, res) => {
  const { name, notes, color, target_date } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name is required' });
  const info = db
    .prepare('INSERT INTO goals (name, notes, color, target_date) VALUES (?, ?, ?, ?)')
    .run(name.trim(), notes || null, color || '#5C6470', target_date || null);
  res.status(201).json(enrich(db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!goal) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'notes', 'color', 'target_date', 'done', 'sort'];
  const set = fields.filter((f) => f in (req.body || {}));
  if (set.length) {
    db.prepare(`UPDATE goals SET ${set.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...set.map((f) => (req.body[f] === '' ? null : req.body[f])), req.params.id);
  }
  res.json(enrich(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id); // tasks keep, goal_id set null
  res.json({ ok: true });
});

export default router;
