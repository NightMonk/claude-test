import { Router } from 'express';
import db from '../db.js';

const router = Router({ mergeParams: true });

const FIELDS = ['label', 'kind', 'on_date', 'recurring', 'importance'];

function pick(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

router.post('/people/:personId/facts', (req, res) => {
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const data = pick(req.body);
  if (!data.label || !data.label.trim()) {
    return res.status(400).json({ error: 'A label is required' });
  }
  data.person_id = person.id;
  const cols = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO facts (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`
  ).run(data);
  res.status(201).json(db.prepare('SELECT * FROM facts WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/facts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM facts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = pick(req.body);
  if (Object.keys(data).length === 0) return res.json(existing);
  data.id = req.params.id;
  const sets = Object.keys(data).filter((k) => k !== 'id').map((k) => `${k} = @${k}`);
  db.prepare(`UPDATE facts SET ${sets.join(', ')} WHERE id = @id`).run(data);
  res.json(db.prepare('SELECT * FROM facts WHERE id = ?').get(req.params.id));
});

router.delete('/facts/:id', (req, res) => {
  db.prepare('DELETE FROM facts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
