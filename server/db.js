import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/people.sqlite';

// Make sure the folder for the database exists.
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// The valid relationship sections. "other" is the catch-all.
export const CATEGORIES = [
  'friends_family',
  'acquaintances',
  'colleagues',
  'dating',
  'other',
];

db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'acquaintances',
    -- How/when/where we first met (auto-captured unless stated otherwise)
    met_at        TEXT,                 -- ISO timestamp
    met_how       TEXT,                 -- e.g. "Through Sarah", "Networking event"
    met_place     TEXT,                 -- human readable place name
    met_lat       REAL,
    met_lng       REAL,
    birthday      TEXT,                 -- ISO date (year optional, stored as --MM-DD or YYYY-MM-DD)
    -- Brief notes the user jots; "summary" is the polished writeup produced with Claude.
    raw_notes     TEXT,
    summary       TEXT,
    next_meeting_at TEXT,               -- ISO timestamp of the next planned encounter
    archived      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- The growing log of every time you interact with a person.
  CREATE TABLE IF NOT EXISTS encounters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    occurred_at   TEXT,                 -- ISO timestamp (auto = now)
    place         TEXT,
    lat           REAL,
    lng           REAL,
    raw_notes     TEXT,                 -- what you jotted
    summary       TEXT,                 -- polished version (via Claude)
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Key facts & reminders: things to remember, optionally tied to a date.
  CREATE TABLE IF NOT EXISTS facts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,        -- "Loves single malt", "Daughter's wedding"
    kind          TEXT NOT NULL DEFAULT 'fact',   -- 'fact' | 'date'
    on_date       TEXT,                 -- ISO date for 'date' kind
    recurring     INTEGER NOT NULL DEFAULT 0,     -- annual (e.g. birthdays/anniversaries)
    importance    INTEGER NOT NULL DEFAULT 1,     -- 0 normal, 1 important
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_people_category ON people(category);
  CREATE INDEX IF NOT EXISTS idx_encounters_person ON encounters(person_id);
  CREATE INDEX IF NOT EXISTS idx_facts_person ON facts(person_id);
`);

export default db;
