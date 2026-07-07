# Tempo — an ADHD-first to-do, reminder & goals app

A calm, private, phone-first task app that helps you **start** and **remember**,
not just store. A crossover of TickTick and Any.do, rebuilt around how an ADHD
brain actually works. This folder is the **runnable reference implementation** of
the design in [`../design/`](../design) — a self-hosted PWA that works on
**iPhone** (Add to Home Screen) and **Windows** (browser / installable).

> Why a web app and not native Flutter (as the design recommends)? This is the
> fastest way to a *real, usable* app you can run today across both devices from
> one codebase. Native wrappers — for lock-screen push, widgets and Live
> Activities — remain the Phase-2 step described in the design.

## What it does

- **Today** — a deliberately small, achievable home. A momentum ring, your few
  tasks, a kind "carried over" roll-forward, and a "done today · your wins" list.
- **Quick capture** — natural language: `Call dentist tomorrow 3pm !high #work`
  parses the date, time, priority and list for you. Nothing required but the words.
- **Sub-tasks** — break any task into small steps (the ADHD "just start" trick).
- **Focus mode** — one task, a big shrinking timer ring, and a **"Just start · 2
  min"** button on every task.
- **Calendar** — **Day / Week / Month / Year** views of everything by due date.
- **Goals** — each shows live progress and the single **next action**, so a goal
  always reaches down to something concrete today.
- **Lists**, **priorities**, **energy tags**, **time estimates**, **recurring
  tasks** (daily/weekly/monthly/annual — completing one spawns the next).
- **Reminders** — best-effort browser notifications while the app is open.
- **Private** — passcode-gated, your own server, local SQLite. Export a full JSON
  backup any time from **⋯ → Export**.

## Run it

Requires [Node.js](https://nodejs.org) 18+.

```bash
cd tempo
npm install
cp .env.example .env        # then set PASSCODE and SESSION_SECRET
npm start
```

Open <http://localhost:3000> and unlock with your passcode.

> Strong session secret:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### On your phone / across devices

Host the single Node server somewhere private over **HTTPS** (a small VPS, or
Railway / Render / Fly.io). Use the same `PASSCODE`, `SESSION_SECRET` and a
persistent `DB_PATH`. Every device you log into reads and writes the same
database — one instance *is* your private cloud. Then "Add to Home Screen".

## How it's built

```
server/            Node + Express API
  index.js         entry, auth gate, static hosting, JSON export
  db.js            SQLite schema (lists, goals, tasks + sub-tasks)
  auth.js          passcode login + stateless signed tokens
  env.js           tiny .env loader
  routes/          tasks, goals, lists
public/            phone-first PWA (vanilla JS, no build step)
  index.html  app.js  styles.css  manifest.webmanifest  sw.js  icon.svg
```

Two dependencies (`express`, `better-sqlite3`), no build tooling. Your database
lives in `data/` and is git-ignored — it never gets committed.

## Design principles it follows

Kindness over nagging (no red overdue pile, gentle roll-forward), anti-overwhelm
(Today stays small), initiation help (sub-tasks + "just start"), time made visible
(focus ring, estimates), and reward (satisfying completion + a visible wins list).
The full rationale is in [`../design/02-adhd-design-principles.md`](../design/02-adhd-design-principles.md).
