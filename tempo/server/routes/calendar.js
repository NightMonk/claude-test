import express from 'express';
import db from '../db.js';
import { parseICS, expandEvents } from '../ical.js';
import { syncGoogleInto, GOOGLE_MARKER } from '../google.js';

const router = express.Router();

// Fetch a feed and replace its cached events. Never throws — records last_error.
export async function syncCalendar(id) {
  const cal = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
  if (!cal) return;
  // Google calendars sync via the API instead of fetching an ICS URL.
  if (cal.url && cal.url.startsWith(GOOGLE_MARKER.split(':')[0] + ':')) {
    try { return await syncGoogleInto(id); }
    catch (e) { db.prepare('UPDATE calendars SET last_error = ? WHERE id = ?').run(String(e.message || e), id); return { ok: false, error: String(e.message || e) }; }
  }
  try {
    const res = await fetch(cal.url.replace(/^webcal:/i, 'https:'), { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const events = parseICS(text);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM cal_events WHERE calendar_id = ?').run(id);
      const ins = db.prepare('INSERT INTO cal_events (calendar_id, uid, title, start, end, all_day, rrule) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const e of events) ins.run(id, e.uid || null, e.title || null, e.start, e.end || null, e.allDay ? 1 : 0, e.rrule || null);
      db.prepare("UPDATE calendars SET last_synced = datetime('now'), last_error = NULL WHERE id = ?").run(id);
    });
    tx();
    return { ok: true, count: events.length };
  } catch (e) {
    db.prepare('UPDATE calendars SET last_error = ? WHERE id = ?').run(String(e.message || e), id);
    return { ok: false, error: String(e.message || e) };
  }
}

router.get('/', (req, res) => res.json(db.prepare('SELECT * FROM calendars ORDER BY id').all()));

router.post('/', async (req, res) => {
  const { name, url, color } = req.body || {};
  if (!url || !/^(https?|webcal):/i.test(url)) return res.status(400).json({ error: 'A calendar URL (https or webcal) is required' });
  const info = db.prepare('INSERT INTO calendars (name, url, color) VALUES (?, ?, ?)')
    .run((name || 'Calendar').trim(), url.trim(), color || '#8b8fa8');
  const r = await syncCalendar(info.lastInsertRowid);
  res.status(201).json({ calendar: db.prepare('SELECT * FROM calendars WHERE id = ?').get(info.lastInsertRowid), sync: r });
});

router.post('/:id/sync', async (req, res) => res.json(await syncCalendar(Number(req.params.id))));

router.delete('/:id', (req, res) => { db.prepare('DELETE FROM calendars WHERE id = ?').run(req.params.id); res.json({ ok: true }); });

// Keep every subscribed calendar fresh in the background (every 30 minutes).
export function startCalendarRefresh() {
  const tick = async () => {
    const cals = db.prepare('SELECT id FROM calendars').all();
    for (const c of cals) { try { await syncCalendar(c.id); } catch { /* keep going */ } }
  };
  setInterval(tick, 30 * 60 * 1000);
  setTimeout(tick, 10000); // once shortly after boot
}

// Expanded event instances across all feeds within a date range.
router.get('/events', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const rows = db.prepare(`SELECT ce.*, c.color FROM cal_events ce JOIN calendars c ON c.id = ce.calendar_id`).all();
  res.json(expandEvents(rows, from, to));
});

export default router;
