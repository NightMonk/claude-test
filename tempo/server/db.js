import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const DB_PATH = process.env.DB_PATH || './data/tempo.sqlite';

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Lists group tasks (Inbox, Work, Home…). Kept deliberately flat — no nesting.
  CREATE TABLE IF NOT EXISTS lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#5C6470',
    emoji       TEXT,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Goals: a bigger ambition. Progress + "next action" are computed from the
  -- tasks linked to it, so a goal always reaches down to something concrete.
  CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    notes       TEXT,
    color       TEXT NOT NULL DEFAULT '#5C6470',
    target_date TEXT,                            -- ISO date, optional
    done        INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The core object. Sub-tasks are just tasks with a parent_id (one level deep).
  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    notes         TEXT,
    list_id       INTEGER REFERENCES lists(id) ON DELETE SET NULL,
    goal_id       INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    parent_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    due_at        TEXT,                          -- ISO date, or date+time
    has_time      INTEGER NOT NULL DEFAULT 0,    -- 1 if due_at carries a specific time
    priority      INTEGER NOT NULL DEFAULT 0,    -- 0 none · 1 medium · 2 high
    energy        TEXT,                          -- 'low' | 'med' | 'high'
    estimate_min  INTEGER,                       -- rough time estimate, minutes
    repeat        TEXT NOT NULL DEFAULT 'none',  -- none|daily|weekly|monthly|annual
    done          INTEGER NOT NULL DEFAULT 0,
    completed_at  TEXT,
    my_day_date   TEXT,                          -- date it was added to "My Day"; auto-expires
    someday       INTEGER NOT NULL DEFAULT 0,    -- parked, out of day views + rollover
    carried_from  TEXT,                          -- original due date, if rolled over
    rollover_count INTEGER NOT NULL DEFAULT 0,   -- times auto-carried to a new day
    source        TEXT NOT NULL DEFAULT 'manual',-- manual | note | nlp
    sort          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);

  -- Single-row app settings / secrets (feed token + web-push VAPID keys).
  CREATE TABLE IF NOT EXISTS settings (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    feed_token    TEXT,
    vapid_public  TEXT,
    vapid_private TEXT,
    theme         TEXT NOT NULL DEFAULT 'graphite', -- graphite | paper | eucalyptus
    week_start    INTEGER NOT NULL DEFAULT 1,      -- 0 Sun, 1 Mon (default Monday)
    quiet_start   TEXT,                            -- "HH:MM" no reminders after
    quiet_end     TEXT,
    review_note   TEXT,
    review_at     TEXT,
    google_refresh_token TEXT,
    google_access_token  TEXT,
    google_token_expiry  INTEGER,                  -- epoch ms
    google_email         TEXT,
    google_state         TEXT                       -- pending OAuth state nonce
  );

  -- Subscribed external calendars (read-only ICS feeds).
  CREATE TABLE IF NOT EXISTS calendars (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    url          TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#5C6470',
    last_synced  TEXT,
    last_error   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cached raw VEVENTs from those feeds (expanded to instances at query time).
  CREATE TABLE IF NOT EXISTS cal_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    uid          TEXT,
    title        TEXT,
    start        TEXT,      -- ISO local "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"
    end          TEXT,
    all_day      INTEGER NOT NULL DEFAULT 0,
    rrule        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_calevents_cal ON cal_events(calendar_id);

  -- Web Push subscriptions (one per browser/device).
  CREATE TABLE IF NOT EXISTS push_subs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint     TEXT UNIQUE NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Which task reminders have already been pushed (so we don't repeat).
  CREATE TABLE IF NOT EXISTS reminders_sent (
    task_id      INTEGER PRIMARY KEY,
    sent_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Lightweight migrations for databases created before newer columns existed.
const ensureCol = (table, col, type) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
};
ensureCol('tasks', 'my_day_date', 'TEXT');
ensureCol('tasks', 'someday', 'INTEGER NOT NULL DEFAULT 0');
ensureCol('tasks', 'carried_from', 'TEXT');
ensureCol('tasks', 'rollover_count', 'INTEGER NOT NULL DEFAULT 0');
ensureCol('tasks', 'source', "TEXT NOT NULL DEFAULT 'manual'");
for (const c of ['google_refresh_token', 'google_access_token', 'google_email', 'google_state']) ensureCol('settings', c, 'TEXT');
ensureCol('settings', 'google_token_expiry', 'INTEGER');

// Ensure the single settings row exists, with a random feed token.
if (!db.prepare('SELECT 1 FROM settings WHERE id = 1').get()) {
  const token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO settings (id, feed_token) VALUES (1, ?)').run(token);
}

// Seed a friendly starter set the first time the app runs.
const listCount = db.prepare('SELECT COUNT(*) AS n FROM lists').get().n;
if (listCount === 0) {
  const insert = db.prepare('INSERT INTO lists (name, color, emoji, sort) VALUES (?, ?, ?, ?)');
  insert.run('Inbox', '#5C6470', '📥', 0);
  insert.run('Personal', '#2F6B55', '🌱', 1);
  insert.run('Work', '#6366F1', '💼', 2);
}

export default db;
