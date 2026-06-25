import { Router } from 'express';
import db, { CATEGORIES } from '../db.js';

const router = Router();

// Fields a client is allowed to set on a person.
const PERSON_FIELDS = [
  'name', 'category', 'met_at', 'met_how', 'met_place', 'met_lat', 'met_lng',
  'birthday', 'raw_notes', 'summary', 'next_meeting_at', 'archived',
];

function pick(body) {
  const out = {};
  for (const f of PERSON_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  if (out.category && !CATEGORIES.includes(out.category)) {
    out.category = 'other';
  }
  return out;
}

// List people, optionally filtered by category or a search query.
router.get('/', (req, res) => {
  const { category, q, archived } = req.query;
  const clauses = [];
  const params = {};
  clauses.push(`archived = @archived`);
  params.archived = archived === '1' ? 1 : 0;
  if (category && CATEGORIES.includes(category)) {
    clauses.push(`category = @category`);
    params.category = category;
  }
  if (q) {
    clauses.push(`(name LIKE @q OR raw_notes LIKE @q OR summary LIKE @q OR met_how LIKE @q OR met_place LIKE @q)`);
    params.q = `%${q}%`;
  }
  const rows = db.prepare(
    `SELECT * FROM people WHERE ${clauses.join(' AND ')} ORDER BY name COLLATE NOCASE`
  ).all(params);
  res.json(rows);
});

// Full person record, including encounters and facts.
router.get('/:id', (req, res) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Not found' });
  person.encounters = db.prepare(
    'SELECT * FROM encounters WHERE person_id = ? ORDER BY occurred_at DESC, id DESC'
  ).all(person.id);
  person.facts = db.prepare(
    'SELECT * FROM facts WHERE person_id = ? ORDER BY importance DESC, id ASC'
  ).all(person.id);
  res.json(person);
});

router.post('/', (req, res) => {
  const data = pick(req.body);
  if (!data.name || !data.name.trim()) {
    return res.status(400).json({ error: 'A name is required' });
  }
  // Auto-capture "when met" if the client did not supply it.
  if (!data.met_at) data.met_at = new Date().toISOString();
  if (!data.category) data.category = 'acquaintances';

  const cols = Object.keys(data);
  const stmt = db.prepare(
    `INSERT INTO people (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`
  );
  const info = stmt.run(data);
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(person);
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = pick(req.body);
  if (Object.keys(data).length === 0) return res.json(existing);
  data.id = req.params.id;
  const sets = Object.keys(data)
    .filter((k) => k !== 'id')
    .map((k) => `${k} = @${k}`);
  sets.push(`updated_at = datetime('now')`);
  db.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id = @id`).run(data);
  res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
