import express from 'express';
import db from '../db.js';

const router = express.Router();

// ---- helpers ----------------------------------------------------------------

const TASK_FIELDS = [
  'title', 'notes', 'list_id', 'goal_id', 'parent_id', 'due_at', 'has_time',
  'priority', 'energy', 'estimate_min', 'repeat', 'sort', 'my_day_date',
  'someday', 'source',
];

// The single clock for day boundaries: Europe/London, regardless of server TZ.
const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

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
  const { bucket, list, goal, from, to, today, q } = req.query;

  // Free-text search. bucket=archive searches only completed history; otherwise
  // search across all top-level tasks.
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    const doneClause = bucket === 'archive' ? 'AND done = 1' : '';
    const order = bucket === 'archive' ? 'completed_at DESC' : 'done, due_at IS NULL, due_at';
    const rows = db
      .prepare(`SELECT * FROM tasks WHERE parent_id IS NULL AND (title LIKE ? OR notes LIKE ?) ${doneClause} ORDER BY ${order} LIMIT 100`)
      .all(like, like);
    return res.json(rows.map(withSubtasks));
  }

  const t = today || londonToday();
  const clauses = ['parent_id IS NULL'];
  const params = [];

  if (list) { clauses.push('list_id = ?'); params.push(Number(list)); }
  if (goal) { clauses.push('goal_id = ?'); params.push(Number(goal)); }

  if (bucket === 'today') {
    // "My Day": added to today, OR due today/overdue. Someday is excluded.
    clauses.push('done = 0', 'someday = 0', '((due_at IS NOT NULL AND date(due_at) <= ?) OR my_day_date = ?)');
    params.push(t, t);
  } else if (bucket === 'inbox') {
    clauses.push('done = 0', 'someday = 0', 'due_at IS NULL', 'goal_id IS NULL', '(my_day_date IS NULL OR my_day_date != ?)');
    params.push(t);
  } else if (bucket === 'someday') {
    clauses.push('done = 0', 'someday = 1');
  } else if (bucket === 'done_today') {
    clauses.push('done = 1', "date(completed_at, 'localtime') = ?");
    params.push(t);
  } else if (bucket === 'archive') {
    clauses.push('done = 1');
  } else if (bucket === 'all') {
    clauses.push('done = 0');
  }

  if (from && to) {
    clauses.push('due_at IS NOT NULL', 'date(due_at) >= ?', 'date(due_at) <= ?');
    params.push(from, to);
  }

  const order = bucket === 'archive'
    ? 'completed_at DESC'
    : 'done, due_at IS NULL, due_at, priority DESC, sort, id';
  const limit = bucket === 'archive' ? 'LIMIT 500' : '';
  const rows = db
    .prepare(`SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY ${order} ${limit}`)
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

// Carry every overdue, unfinished (non-someday) task forward to `to`, recording
// the original date once and bumping the rollover counter. Kind, no shame.
export function reconcileRollover(to) {
  const today = to || londonToday();
  const rows = db.prepare(
    `SELECT id, due_at FROM tasks
      WHERE parent_id IS NULL AND done = 0 AND someday = 0
        AND due_at IS NOT NULL AND date(due_at) < ?`
  ).all(today);
  if (!rows.length) return 0;
  const upd = db.prepare(
    `UPDATE tasks SET due_at = ?, has_time = 0,
       carried_from = COALESCE(carried_from, ?), rollover_count = rollover_count + 1,
       updated_at = datetime('now') WHERE id = ?`
  );
  db.transaction(() => { for (const r of rows) upd.run(today, r.due_at.slice(0, 10), r.id); })();
  return rows.length;
}

// Client calls this on app open; a server interval also runs it (see index.js).
router.post('/reconcile', (req, res) => res.json({ moved: reconcileRollover(req.body?.today) }));

// Legacy manual "move all overdue to today" button — same semantics.
router.post('/rollover', (req, res) => res.json({ moved: reconcileRollover(req.body?.to) }));

// Restore an archived task: reopen it, due today, out of Someday.
router.post('/:id/restore', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    `UPDATE tasks SET done = 0, completed_at = NULL, someday = 0,
       due_at = ?, has_time = 0, carried_from = NULL, rollover_count = 0,
       updated_at = datetime('now') WHERE id = ?`
  ).run(londonToday(), task.id);
  res.json(withSubtasks(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)));
});

export default router;
