import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
    color       TEXT NOT NULL DEFAULT '#5b5bd6',
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
    color       TEXT NOT NULL DEFAULT '#5b5bd6',
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
    sort          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
`);

// Seed a friendly starter set the first time the app runs.
const listCount = db.prepare('SELECT COUNT(*) AS n FROM lists').get().n;
if (listCount === 0) {
  const insert = db.prepare('INSERT INTO lists (name, color, emoji, sort) VALUES (?, ?, ?, ?)');
  insert.run('Inbox', '#8b8fa8', '📥', 0);
  insert.run('Personal', '#34c88a', '🌱', 1);
  insert.run('Work', '#5b5bd6', '💼', 2);
}

export default db;
