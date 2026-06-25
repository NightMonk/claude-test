import { Router } from 'express';
import db from '../db.js';

const router = Router();

const DAY = 1000 * 60 * 60 * 24;

// Parse an ISO date that may or may not include a year (e.g. "1990-04-23" or "--04-23").
function monthDay(iso) {
  if (!iso) return null;
  const m = iso.match(/(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { month: Number(m[1]), day: Number(m[2]) };
}

// Days from today until the next (possibly recurring) occurrence of a date.
function daysUntil(iso, recurring, today) {
  if (!iso) return null;
  if (recurring) {
    const md = monthDay(iso);
    if (!md) return null;
    let next = new Date(today.getFullYear(), md.month - 1, md.day);
    if (next < today) next = new Date(today.getFullYear() + 1, md.month - 1, md.day);
    return Math.round((next - today) / DAY);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - today) / DAY);
}

router.get('/', (req, res) => {
  const horizon = Number(req.query.days) || 30;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const people = db.prepare('SELECT * FROM people WHERE archived = 0').all();
  const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));

  const reminders = [];

  // Birthdays (recurring) from the dedicated field.
  for (const p of people) {
    const d = daysUntil(p.birthday, true, today);
    if (d !== null && d <= horizon) {
      reminders.push({
        type: 'birthday',
        days_until: d,
        person_id: p.id,
        person_name: p.name,
        label: 'Birthday',
        date: p.birthday,
      });
    }
  }

  // Date-kind facts (recurring anniversaries or one-off events).
  const dateFacts = db.prepare("SELECT * FROM facts WHERE kind = 'date'").all();
  for (const f of dateFacts) {
    const p = peopleById[f.person_id];
    if (!p) continue;
    const d = daysUntil(f.on_date, !!f.recurring, today);
    if (d !== null && d >= 0 && d <= horizon) {
      reminders.push({
        type: 'event',
        days_until: d,
        person_id: p.id,
        person_name: p.name,
        label: f.label,
        date: f.on_date,
        importance: f.importance,
      });
    }
  }

  reminders.sort((a, b) => a.days_until - b.days_until);

  // People you have a meeting planned with soon — each with a "brief".
  const upcomingMeetings = people
    .filter((p) => p.next_meeting_at)
    .map((p) => ({ p, when: new Date(p.next_meeting_at) }))
    .filter(({ when }) => !Number.isNaN(when.getTime()) && when >= today)
    .sort((a, b) => a.when - b.when)
    .slice(0, 20)
    .map(({ p }) => ({
      person_id: p.id,
      person_name: p.name,
      category: p.category,
      next_meeting_at: p.next_meeting_at,
      summary: p.summary,
      // The "remember before you see them" facts.
      brief: db.prepare(
        'SELECT label, kind, on_date, importance FROM facts WHERE person_id = ? ORDER BY importance DESC, id ASC'
      ).all(p.id),
    }));

  const recentlyAdded = db.prepare(
    'SELECT id, name, category, met_at, met_place FROM people WHERE archived = 0 ORDER BY id DESC LIMIT 8'
  ).all();

  const counts = {};
  for (const row of db.prepare(
    'SELECT category, COUNT(*) n FROM people WHERE archived = 0 GROUP BY category'
  ).all()) {
    counts[row.category] = row.n;
  }
  counts.total = people.length;

  res.json({ reminders, upcomingMeetings, recentlyAdded, counts });
});

export default router;
