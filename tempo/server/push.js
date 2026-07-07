// Web Push (VAPID) — real reminders that fire when the app is closed, on
// Windows (Chrome/Edge), Apple (iOS 16.4+ installed PWA, macOS) and desktop
// browsers. Keys are read from env, or generated once and stored in settings so
// the app works out of the box.
import webpush from 'web-push';
import db from './db.js';

let ready = false;

export function initPush() {
  const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  let pub = process.env.VAPID_PUBLIC || s.vapid_public;
  let priv = process.env.VAPID_PRIVATE || s.vapid_private;
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey; priv = keys.privateKey;
    db.prepare('UPDATE settings SET vapid_public = ?, vapid_private = ? WHERE id = 1').run(pub, priv);
  } else if (!s.vapid_public) {
    db.prepare('UPDATE settings SET vapid_public = ?, vapid_private = ? WHERE id = 1').run(pub, priv);
  }
  const subject = process.env.VAPID_SUBJECT || 'mailto:tempo@example.com';
  webpush.setVapidDetails(subject, pub, priv);
  ready = true;
  return pub;
}

export function publicKey() {
  return db.prepare('SELECT vapid_public FROM settings WHERE id = 1').get()?.vapid_public;
}

export function saveSubscription(sub) {
  if (!sub?.endpoint || !sub?.keys) return;
  db.prepare('INSERT OR REPLACE INTO push_subs (endpoint, p256dh, auth) VALUES (?, ?, ?)')
    .run(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

export function removeSubscription(endpoint) {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
}

async function sendToAll(payload) {
  if (!ready) return;
  const subs = db.prepare('SELECT * FROM push_subs').all();
  const data = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, data);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) removeSubscription(sub.endpoint); // expired
    }
  }
}

function withinQuietHours(now, s) {
  if (!s.quiet_start || !s.quiet_end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [qs, qe] = [s.quiet_start, s.quiet_end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return qs <= qe ? (cur >= qs && cur < qe) : (cur >= qs || cur < qe); // handles overnight windows
}

// Poll for tasks whose reminder time has arrived and push once each.
export function startReminderLoop() {
  const tick = async () => {
    try {
      const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
      const now = new Date();
      if (withinQuietHours(now, s)) return;
      const soon = new Date(now.getTime() + 60000).toISOString().slice(0, 16);
      const nowIso = now.toISOString().slice(0, 16);
      const due = db.prepare(`
        SELECT t.* FROM tasks t
        LEFT JOIN reminders_sent r ON r.task_id = t.id
        WHERE t.done = 0 AND t.has_time = 1 AND t.parent_id IS NULL
          AND r.task_id IS NULL AND t.due_at <= ? `).all(soon);
      for (const t of due) {
        // Fire when we're within a couple of minutes of the due time (not for ancient overdue).
        if (t.due_at.slice(0, 16) < new Date(now.getTime() - 6 * 3600000).toISOString().slice(0, 16)) {
          db.prepare('INSERT OR IGNORE INTO reminders_sent (task_id) VALUES (?)').run(t.id); // mark stale, skip
          continue;
        }
        if (t.due_at.slice(0, 16) <= nowIso || t.due_at.slice(0, 16) <= soon) {
          await sendToAll({ title: '⏱ Tempo', body: t.title, tag: 'task-' + t.id, url: '/' });
          db.prepare('INSERT OR IGNORE INTO reminders_sent (task_id) VALUES (?)').run(t.id);
        }
      }
    } catch { /* keep the loop alive */ }
  };
  setInterval(tick, 30000);
  tick();
}
