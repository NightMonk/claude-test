import './env.js'; // must be first: loads .env before db/auth read process.env
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { issueToken, checkPasscode, requireAuth } from './auth.js';
import tasksRouter from './routes/tasks.js';
import goalsRouter from './routes/goals.js';
import listsRouter from './routes/lists.js';
import calendarRouter, { syncCalendar, startCalendarRefresh } from './routes/calendar.js';
import { buildICS } from './ical.js';
import { initPush, publicKey, saveSubscription, removeSubscription, startReminderLoop } from './push.js';
import * as google from './google.js';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1); // behind Railway/Render/Fly HTTPS proxy → correct req.protocol
app.use(express.json({ limit: '4mb' }));

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;

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

// --- Google OAuth callback (public: Google redirects the browser here) ---
app.get('/api/google/callback', async (req, res) => {
  try {
    await google.handleCallback(baseUrl(req), req.query.code, req.query.state);
    const row = google.ensureGoogleCalendarRow();
    syncCalendar(row.id).catch(() => {});
    res.redirect('/?google=connected');
  } catch (e) {
    res.status(400).send(`Google connection failed: ${e.message}. <a href="/">Back to Tempo</a>`);
  }
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

// Google Calendar sync
api.get('/google/status', (req, res) => res.json(google.status()));
api.get('/google/auth', (req, res) => {
  if (!google.isConfigured()) return res.status(400).json({ error: 'Google is not configured on this server' });
  res.json({ url: google.authUrl(baseUrl(req), randomBytes(16).toString('hex')) });
});
api.post('/google/sync', async (req, res) => {
  try { const row = google.ensureGoogleCalendarRow(); res.json(await syncCalendar(row.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/google/disconnect', (req, res) => { google.disconnect(); res.json({ ok: true }); });

// Web Push
api.get('/push/key', (req, res) => res.json({ key: publicKey() }));
api.post('/push/subscribe', (req, res) => { saveSubscription(req.body); res.json({ ok: true }); });
api.post('/push/unsubscribe', (req, res) => { removeSubscription(req.body?.endpoint); res.json({ ok: true }); });

// Full JSON backup + restore. Export includes non-secret settings; secrets
// (VAPID private key, Google tokens, feed token) never leave the server.
api.get('/export', (req, res) => {
  const s = db.prepare('SELECT theme, week_start, quiet_start, quiet_end, review_note, review_at FROM settings WHERE id = 1').get();
  res.json({
    exported_at: new Date().toISOString(),
    settings: s,
    lists: db.prepare('SELECT * FROM lists').all(),
    goals: db.prepare('SELECT * FROM goals').all(),
    tasks: db.prepare('SELECT * FROM tasks').all(),
  });
});
// Import MERGES by id — upserts rows, never deletes anything.
api.post('/import', (req, res) => {
  const { lists, goals, tasks, settings } = req.body || {};
  if (!Array.isArray(tasks)) return res.status(400).json({ error: 'That file does not look like a Tempo backup' });
  const tableCols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const upsertAll = (table, rows) => {
    const known = tableCols(table);
    for (const row of rows || []) {
      const c = Object.keys(row).filter((k) => known.includes(k));
      if (!c.includes('id')) continue;
      const sets = c.filter((k) => k !== 'id').map((k) => `${k} = excluded.${k}`).join(', ');
      db.prepare(`INSERT INTO ${table} (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})
                  ON CONFLICT(id) DO UPDATE SET ${sets}`).run(...c.map((k) => row[k]));
    }
  };
  const tx = db.transaction(() => {
    upsertAll('lists', lists);
    upsertAll('goals', goals);
    upsertAll('tasks', (tasks || []).filter((t) => t.parent_id == null)); // parents first for FK
    upsertAll('tasks', (tasks || []).filter((t) => t.parent_id != null));
    if (settings && typeof settings === 'object') {
      const fields = ['theme', 'week_start', 'quiet_start', 'quiet_end', 'review_note', 'review_at'].filter((f) => f in settings);
      if (fields.length) db.prepare(`UPDATE settings SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = 1`).run(...fields.map((f) => settings[f]));
    }
  });
  try { tx(); res.json({ ok: true, merged: tasks.length }); }
  catch (e) { res.status(400).json({ error: 'Import failed: ' + e.message }); }
});

app.use('/api', api);

// --- Static phone-first front end ---
app.use(express.static(join(__dirname, '..', 'public')));

initPush();
startReminderLoop();
startCalendarRefresh();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tempo running on http://localhost:${PORT}`));
