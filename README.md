# People — your personal databank

A private, phone-first web app for quickly recording details of the people you
meet, and being reminded of what matters before you see them again.

It captures **when**, **where**, and **how** you met someone automatically (all
overridable), keeps a growing dossier on each person — what you discussed, key
facts, birthdays — and surfaces the important things *before* your next meeting.

## What it does

- **Quick capture.** Tap ＋, type a name, pick a section. Time is recorded
  automatically; your location is captured via GPS and turned into a place name;
  you're prompted for *how* you met.
- **Four sections** (plus a catch-all): Friends & Family, Acquaintances,
  Colleagues, Dating, Other.
- **A databank per person.** A timeline of every interaction, key facts &
  reminders, birthday, and a polished profile.
- **"Brief me" home screen.** Set a *next meeting* date on someone and the home
  screen shows you their key facts and dates beforehand. Upcoming birthdays and
  important dates appear for the next 30 days.
- **Brief notes → readable profiles.** Jot rough notes anywhere; bring them to
  Claude in chat to expand into a polished write-up, then paste it back into the
  Profile or interaction summary. (See *Working with Claude* below.)
- **Private.** Passcode-protected, runs on your own server with a local SQLite
  database. Your data never goes to a third party. Export a full JSON backup any
  time from **More → Export**.
- **Installable.** Open it in your phone browser and "Add to Home Screen" — it
  behaves like a native app.

## Getting started

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp .env.example .env      # then edit .env and set your PASSCODE + SESSION_SECRET
npm start
```

Open <http://localhost:3000> and unlock with your passcode.

> Generate a strong session secret with:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Using it on your phone (private cloud sync)

To reach it from your phone and sync across devices, host the server somewhere
private that only you use — e.g. a small VPS, or a platform like Railway, Render,
or Fly.io. Set the same `PASSCODE`, `SESSION_SECRET`, and a persistent
`DB_PATH`, and make sure it's served over **HTTPS** (geolocation and installing
to the home screen require it). Then open the URL on your phone and add it to
your home screen.

Because it's a single Node server plus a SQLite file, one instance *is* your
private cloud: every device you log into reads and writes the same database.

## Working with Claude — turning notes into profiles

This app deliberately keeps the rough notes and the polished write-up separate:

1. In the app, jot **Brief notes** on a person (or in an interaction's notes).
2. Copy them and paste to Claude in chat: *"Expand these into a readable profile."*
3. Paste Claude's tidy version back into the **Profile** field (or an
   interaction's **Polished summary**).

You can also ask Claude things like *"Summarise everything I know about Alex
before I see them on Friday."* using your exported backup.

## How it's built

```
server/            Node + Express API
  index.js         app entry, auth gate, static hosting, JSON export
  db.js            SQLite schema (people, encounters, facts)
  auth.js          passcode login + stateless signed tokens
  routes/          people, encounters, facts, dashboard (reminders/briefs)
public/            phone-first PWA (vanilla JS, no build step)
  index.html  app.js  styles.css  manifest.webmanifest  sw.js  icon.svg
```

No build tooling, two npm dependencies (`express`, `better-sqlite3`). Your
database lives in `data/` and is git-ignored — it never gets committed.

## Privacy notes

- Place names are resolved with OpenStreetMap's free reverse-geocoder; only the
  coordinates of where you tap "use my location" are sent, and only the
  resulting text is stored. If it fails, raw coordinates are kept instead.
- The passcode gate is a single shared secret suitable for a personal tool. If
  you host this publicly, always use HTTPS and a strong `SESSION_SECRET`.
