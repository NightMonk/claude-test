import express from 'express';
import db from '../db.js';

const router = express.Router();

// ---- helpers ----------------------------------------------------------------

const TASK_FIELDS = [
  'title', 'notes', 'list_id', 'goal_id', 'parent_id', 'due_at', 'has_time',
  'priority', 'energy', 'estimate_min', 'repeat', 'sort',
];

// Pull only the writable fields from a body, coercing empties to null.
function pickFields(body) {
  const out = {};
  for (const f of TASK_FIELDS) {
    if (!(f in body)) continue;
    let v = body[f];
    if (v === '' || v === undefined) v = null;
    out[f] = v;
  }
  return out;
}

// Return a top-level task with its sub-tasks nested.
function withSubtasks(task) {
  if (!task) return task;
  task.subtasks = db
    .prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY sort, id')
    .all(task.id);
  return task;
}

// Advance a due date by one repeat period, preserving the stored wall-clock
// format ("YYYY-MM-DD" stays a date; "YYYY-MM-DDTHH:MM" keeps its time). Kept in
// local components throughout so it never drifts through UTC.
function advance(dueIso, repeat) {
  const dateOnly = dueIso.length <= 10;
  const d = new Date(dateOnly ? `${dueIso}T00:00:00` : dueIso);
  if (isNaN(d)) return null;
  switch (repeat) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return dateOnly ? date : `${date}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- list / query -----------------------------------------------------------

// GET /api/tasks?bucket=today|inbox|all|done_today  &list= &goal= &from= &to= &today=
router.get('/', (req, res) => {
  const { bucket, list, goal, from, to, today } = req.query;
  const clauses = ['parent_id IS NULL'];
  const params = [];

  if (list) { clauses.push('list_id = ?'); params.push(Number(list)); }
  if (goal) { clauses.push('goal_id = ?'); params.push(Number(goal)); }

  if (bucket === 'today') {
    clauses.push('done = 0', 'due_at IS NOT NULL', "date(due_at) <= ?");
    params.push(today || new Date().toISOString().slice(0, 10));
  } else if (bucket === 'inbox') {
    clauses.push('done = 0', 'due_at IS NULL', 'goal_id IS NULL');
  } else if (bucket === 'done_today') {
    clauses.push('done = 1', "date(completed_at,'localtime') = ?");
    params.push(today || new Date().toISOString().slice(0, 10));
  } else if (bucket === 'all') {
    clauses.push('done = 0');
  }

  if (from && to) {
    clauses.push('due_at IS NOT NULL', 'date(due_at) >= ?', 'date(due_at) <= ?');
    params.push(from, to);
  }

  const rows = db
    .prepare(`SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY done, due_at IS NULL, due_at, priority DESC, sort, id`)
    .all(...params);
  res.json(rows.map(withSubtasks));
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(withSubtasks(task));
});

// ---- create -----------------------------------------------------------------

router.post('/', (req, res) => {
  const f = pickFields(req.body);
  if (!f.title || !String(f.title).trim()) {
    return res.status(400).json({ error: 'A title is required' });
  }
  const cols = Object.keys(f);
  const stmt = db.prepare(
    `INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  );
  const info = stmt.run(...cols.map((c) => f[c]));
  res.status(201).json(withSubtasks(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid)));
});

// ---- update -----------------------------------------------------------------

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const f = pickFields(req.body);
  const cols = Object.keys(f);
  if (cols.length) {
    db.prepare(
      `UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...cols.map((c) => f[c]), req.params.id);
  }
  res.json(withSubtasks(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)));
});

// ---- complete / uncomplete --------------------------------------------------
// Toggling a repeating task to done spawns the next occurrence automatically.

router.post('/:id/toggle', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  let spawned = null;
  const nowDone = task.done ? 0 : 1;

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE tasks SET done = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(nowDone, nowDone ? new Date().toISOString() : null, task.id);

    // When completing a top-level repeating task, create the next one.
    if (nowDone && task.repeat && task.repeat !== 'none' && task.due_at && !task.parent_id) {
      const nextDue = advance(task.due_at, task.repeat);
      if (nextDue) {
        const next = {
          title: task.title, notes: task.notes, list_id: task.list_id, goal_id: task.goal_id,
          due_at: nextDue, has_time: task.has_time, priority: task.priority, energy: task.energy,
          estimate_min: task.estimate_min, repeat: task.repeat, sort: task.sort,
        };
        const info = db.prepare(
          `INSERT INTO tasks (title, notes, list_id, goal_id, due_at, has_time, priority, energy, estimate_min, repeat, sort)
           VALUES (@title, @notes, @list_id, @goal_id, @due_at, @has_time, @priority, @energy, @estimate_min, @repeat, @sort)`
        ).run(next);
        // Copy sub-tasks over, freshly undone.
        const kids = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY sort, id').all(task.id);
        for (const k of kids) {
          db.prepare('INSERT INTO tasks (title, parent_id, sort) VALUES (?, ?, ?)').run(k.title, info.lastInsertRowid, k.sort);
        }
        spawned = withSubtasks(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
      }
    }
  });
  tx();

  res.json({ task: withSubtasks(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)), spawned });
});

// ---- delete -----------------------------------------------------------------

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id); // sub-tasks cascade
  res.json({ ok: true });
});

// Roll every overdue, unfinished task forward to a given date (kind, no shame).
router.post('/rollover', (req, res) => {
  const to = req.body?.to || new Date().toISOString().slice(0, 10);
  const info = db.prepare(
    `UPDATE tasks SET due_at = ?, has_time = 0, updated_at = datetime('now')
     WHERE parent_id IS NULL AND done = 0 AND due_at IS NOT NULL AND date(due_at) < ?`
  ).run(to, to);
  res.json({ moved: info.changes });
});

export default router;
