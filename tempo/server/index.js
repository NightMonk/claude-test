import './env.js'; // must be first: loads .env before db/auth read process.env
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { issueToken, checkPasscode, requireAuth } from './auth.js';
import tasksRouter from './routes/tasks.js';
import goalsRouter from './routes/goals.js';
import listsRouter from './routes/lists.js';
import calendarRouter from './routes/calendar.js';
import { buildICS } from './ical.js';
import { initPush, publicKey, saveSubscription, removeSubscription, startReminderLoop } from './push.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '4mb' }));

// --- Health check (for deploy platforms) ---
app.get('/healthz', (req, res) => res.json({ ok: true }));

// --- Auth ---
app.post('/api/login', (req, res) => {
  if (!checkPasscode(req.body?.passcode)) return res.status(401).json({ error: 'Incorrect passcode' });
  res.json({ token: issueToken() });
});

// --- Public, token-gated ICS feed so calendar apps can subscribe to your tasks ---
app.get('/feed/:token.ics', (req, res) => {
  const s = db.prepare('SELECT feed_token FROM settings WHERE id = 1').get();
  if (!s.feed_token || req.params.token !== s.feed_token) return res.status(404).send('Not found');
  const tasks = db.prepare("SELECT * FROM tasks WHERE parent_id IS NULL AND due_at IS NOT NULL").all();
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.send(buildICS(tasks, 'Tempo tasks'));
});

// Everything under /api (except /api/login) requires a valid token.
const api = express.Router();
api.use(requireAuth);
api.use('/tasks', tasksRouter);
api.use('/goals', goalsRouter);
api.use('/lists', listsRouter);
api.use('/calendars', calendarRouter);

// Settings (single row). Never leak the private VAPID key.
api.get('/settings', (req, res) => {
  const s = db.prepare('SELECT id, feed_token, theme, week_start, quiet_start, quiet_end, review_note, review_at FROM settings WHERE id = 1').get();
  const host = `${req.protocol}://${req.get('host')}`;
  res.json({ ...s, feed_url: `${host}/feed/${s.feed_token}.ics`, vapid_public: publicKey() });
});
api.patch('/settings', (req, res) => {
  const fields = ['theme', 'week_start', 'quiet_start', 'quiet_end', 'review_note', 'review_at'];
  const set = fields.filter((f) => f in (req.body || {}));
  if (set.length) db.prepare(`UPDATE settings SET ${set.map((f) => `${f} = ?`).join(', ')} WHERE id = 1`).run(...set.map((f) => (req.body[f] === '' ? null : req.body[f])));
  res.json({ ok: true });
});

// Web Push
api.get('/push/key', (req, res) => res.json({ key: publicKey() }));
api.post('/push/subscribe', (req, res) => { saveSubscription(req.body); res.json({ ok: true }); });
api.post('/push/unsubscribe', (req, res) => { removeSubscription(req.body?.endpoint); res.json({ ok: true }); });

// Full JSON backup + restore.
api.get('/export', (req, res) => {
  res.json({
    exported_at: new Date().toISOString(),
    lists: db.prepare('SELECT * FROM lists').all(),
    goals: db.prepare('SELECT * FROM goals').all(),
    tasks: db.prepare('SELECT * FROM tasks').all(),
  });
});
api.post('/import', (req, res) => {
  const { lists, goals, tasks } = req.body || {};
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'That file does not look like a Tempo backup' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM goals').run();
    db.prepare('DELETE FROM lists').run();
    const cols = (row) => Object.keys(row);
    const insertAll = (table, rows) => {
      for (const row of rows || []) {
        const c = cols(row);
        db.prepare(`INSERT INTO ${table} (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`).run(...c.map((k) => row[k]));
      }
    };
    insertAll('lists', lists);
    insertAll('goals', goals);
    insertAll('tasks', (tasks || []).filter((t) => t.parent_id == null)); // parents first for FK
    insertAll('tasks', (tasks || []).filter((t) => t.parent_id != null));
  });
  try { tx(); res.json({ ok: true, tasks: tasks.length }); }
  catch (e) { res.status(400).json({ error: 'Import failed: ' + e.message }); }
});

app.use('/api', api);

// --- Static phone-first front end ---
app.use(express.static(join(__dirname, '..', 'public')));

initPush();
startReminderLoop();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tempo running on http://localhost:${PORT}`));
