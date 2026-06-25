import { Router } from 'express';
import db from '../db.js';

// Mounted at /api/people/:personId/encounters and /api/encounters/:id
const router = Router({ mergeParams: true });

const FIELDS = ['occurred_at', 'place', 'lat', 'lng', 'raw_notes', 'summary'];

function pick(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Add an encounter to a person.
router.post('/people/:personId/encounters', (req, res) => {
  const person = db.prepare('SELECT id FROM people WHERE id = ?').get(req.params.personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });
  const data = pick(req.body);
  if (!data.occurred_at) data.occurred_at = new Date().toISOString(); // auto "when"
  data.person_id = person.id;
  const cols = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO encounters (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`
  ).run(data);
  res.status(201).json(db.prepare('SELECT * FROM encounters WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/encounters/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = pick(req.body);
  if (Object.keys(data).length === 0) return res.json(existing);
  data.id = req.params.id;
  const sets = Object.keys(data).filter((k) => k !== 'id').map((k) => `${k} = @${k}`);
  db.prepare(`UPDATE encounters SET ${sets.join(', ')} WHERE id = @id`).run(data);
  res.json(db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id));
});

router.delete('/encounters/:id', (req, res) => {
  db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
