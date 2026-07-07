// Google Calendar sync via OAuth 2.0. Pulls your Google events into Tempo's
// unified calendar (reusing the same cal_events pipeline as ICS feeds).
//
// Requires a Google Cloud OAuth client — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
// Without them the feature stays dormant and the UI shows "not configured".
// Tasks flow back to Google via Tempo's published ICS feed (Settings → feed URL),
// so no calendar write scope is requested here (read-only, least privilege).
import db from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email';
const GOOGLE_URL = 'google:primary'; // marker url for the calendars row holding Google events

export function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
const settings = () => db.prepare('SELECT * FROM settings WHERE id = 1').get();
const setSettings = (obj) => {
  const keys = Object.keys(obj);
  db.prepare(`UPDATE settings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...keys.map((k) => obj[k]));
};

export function status() {
  const s = settings();
  return { configured: isConfigured(), connected: !!s.google_refresh_token, email: s.google_email || null };
}

// Build the consent URL; store a state nonce to verify the callback.
export function authUrl(base, state) {
  setSettings({ google_state: state });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${base}/api/google/callback`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(base, code, state) {
  const s = settings();
  if (!s.google_state || state !== s.google_state) throw new Error('State mismatch');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${base}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error(tok.error_description || 'Token exchange failed');
  const expiry = Date.now() + (tok.expires_in || 3600) * 1000;
  const patch = { google_access_token: tok.access_token, google_token_expiry: expiry, google_state: null };
  if (tok.refresh_token) patch.google_refresh_token = tok.refresh_token;
  setSettings(patch);
  // best-effort: record the account email
  try {
    const who = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } }).then((r) => r.json());
    if (who.email) setSettings({ google_email: who.email });
  } catch { /* non-fatal */ }
  ensureGoogleCalendarRow();
}

export function disconnect() {
  setSettings({ google_refresh_token: null, google_access_token: null, google_token_expiry: null, google_email: null, google_state: null });
  db.prepare('DELETE FROM calendars WHERE url = ?').run(GOOGLE_URL);
}

async function accessToken() {
  const s = settings();
  if (!s.google_refresh_token) throw new Error('Not connected');
  if (s.google_access_token && s.google_token_expiry && s.google_token_expiry > Date.now() + 60000) return s.google_access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: s.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error(tok.error_description || 'Token refresh failed');
  setSettings({ google_access_token: tok.access_token, google_token_expiry: Date.now() + (tok.expires_in || 3600) * 1000 });
  return tok.access_token;
}

export function ensureGoogleCalendarRow() {
  let row = db.prepare('SELECT * FROM calendars WHERE url = ?').get(GOOGLE_URL);
  if (!row) {
    const info = db.prepare('INSERT INTO calendars (name, url, color) VALUES (?, ?, ?)').run('Google Calendar', GOOGLE_URL, '#4285F4');
    row = db.prepare('SELECT * FROM calendars WHERE id = ?').get(info.lastInsertRowid);
  }
  return row;
}

// Google returns times like "2026-07-07T14:00:00+01:00" or all-day "date".
function toLocalIso(obj) {
  if (obj.date) return { iso: obj.date, allDay: true };
  const d = new Date(obj.dateTime);
  const p = (n) => String(n).padStart(2, '0');
  return { iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, allDay: false };
}

// Pull events into cal_events for the Google calendars row. singleEvents=true
// makes Google expand recurring events for us, so no RRULE handling is needed.
export async function syncGoogleInto(calId) {
  const token = await accessToken();
  const timeMin = new Date(Date.now() - 14 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 120 * 86400000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Google API ' + res.status);
  const data = await res.json();
  const items = (data.items || []).filter((e) => e.start && (e.start.dateTime || e.start.date));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cal_events WHERE calendar_id = ?').run(calId);
    const ins = db.prepare('INSERT INTO cal_events (calendar_id, uid, title, start, end, all_day, rrule) VALUES (?, ?, ?, ?, ?, ?, NULL)');
    for (const e of items) {
      const s = toLocalIso(e.start); const en = e.end ? toLocalIso(e.end) : null;
      ins.run(calId, e.id || null, e.summary || '(busy)', s.iso, en ? en.iso : null, s.allDay ? 1 : 0);
    }
    db.prepare("UPDATE calendars SET last_synced = datetime('now'), last_error = NULL WHERE id = ?").run(calId);
  });
  tx();
  return { ok: true, count: items.length };
}

export const GOOGLE_MARKER = GOOGLE_URL;
