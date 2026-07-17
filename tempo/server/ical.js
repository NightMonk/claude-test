// Minimal, dependency-free iCalendar (RFC 5545) support: enough to subscribe to
// Google / Apple / Outlook feeds and to publish Tempo's tasks back out.
//
// Deliberate limitations (documented for honesty):
//  - Times with a TZID are treated as wall-clock local; UTC ("Z") times are
//    converted to the server's local zone. No full IANA tz database.
//  - RRULE handles FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL,
//    repeating on the start date's weekday/day. BYDAY lists etc. are approximated.

const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Parse a DTSTART/DTEND value into { iso, allDay }.
function parseDT(raw, params) {
  const isDate = /VALUE=DATE(?!-TIME)/.test(params) || /^\d{8}$/.test(raw);
  if (isDate) {
    const y = +raw.slice(0, 4), mo = +raw.slice(4, 6), d = +raw.slice(6, 8);
    return { iso: `${pad(y)}-${pad(mo)}-${pad(d)}`, allDay: true };
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (z === 'Z') { // UTC → server local wall clock
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { iso: isoLocal(dt), allDay: false };
  }
  return { iso: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

// Unfold folded lines, then split BEGIN:VEVENT…END:VEVENT blocks.
export function parseICS(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur && cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx), value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(';');
    const params = paramParts.join(';');
    if (name === 'SUMMARY') cur.title = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\;/g, ';').trim();
    else if (name === 'UID') cur.uid = value;
    else if (name === 'RRULE') cur.rrule = value;
    else if (name === 'DTSTART') { const p = parseDT(value, params); if (p) { cur.start = p.iso; cur.allDay = p.allDay ? 1 : 0; } }
    else if (name === 'DTEND') { const p = parseDT(value, params); if (p) cur.end = p.iso; }
  }
  return events;
}

function addFreq(d, freq, n) {
  if (freq === 'DAILY') d.setDate(d.getDate() + n);
  else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7 * n);
  else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + n);
  else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + n);
}

// Expand stored events into concrete instances within [fromStr, toStr] (dates).
export function expandEvents(events, fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T23:59:59');
  const out = [];
  for (const ev of events) {
    const base = new Date(ev.start.length <= 10 ? ev.start + 'T00:00:00' : ev.start);
    const durMs = ev.end ? (new Date(ev.end.length <= 10 ? ev.end + 'T00:00:00' : ev.end) - base) : 0;
    // DB rows use snake_case `all_day`; tolerate camelCase too for safety.
    const allDay = ev.all_day ?? ev.allDay;
    const push = (startDate) => {
      const iso = allDay ? isoDate(startDate) : isoLocal(startDate);
      const endIso = ev.end ? (allDay ? isoDate(new Date(startDate.getTime() + durMs)) : isoLocal(new Date(startDate.getTime() + durMs))) : null;
      out.push({ title: ev.title || '(untitled)', start: iso, end: endIso, all_day: allDay, calendar_id: ev.calendar_id, color: ev.color });
    };
    if (!ev.rrule) {
      if (base <= to && new Date(base.getTime() + durMs) >= from) push(base);
      continue;
    }
    const rule = Object.fromEntries(ev.rrule.split(';').map((kv) => kv.split('=')));
    const freq = rule.FREQ, interval = +rule.INTERVAL || 1;
    const count = rule.COUNT ? +rule.COUNT : Infinity;
    const until = rule.UNTIL ? new Date(rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3T23:59:59')) : null;
    if (!freq) { if (base <= to) push(base); continue; }
    const cursor = new Date(base);
    let n = 0;
    for (let guard = 0; guard < 750 && n < count; guard++) {
      if (until && cursor > until) break;
      if (cursor > to) break;
      if (new Date(cursor.getTime() + durMs) >= from) push(new Date(cursor));
      addFreq(cursor, freq, interval);
      n++;
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// Build an ICS document that publishes Tempo tasks (those with a due date).
export function buildICS(tasks, calName = 'Tempo') {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const toUTC = (local) => { const d = new Date(local); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tempo//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const t of tasks) {
    if (!t.due_at) continue;
    lines.push('BEGIN:VEVENT', `UID:tempo-task-${t.id}@tempo`, `DTSTAMP:${dtstamp}`, `SUMMARY:${esc(t.title)}${t.done ? ' ✓' : ''}`);
    if (t.has_time) lines.push(`DTSTART:${toUTC(t.due_at)}`, `DTEND:${toUTC(new Date(new Date(t.due_at).getTime() + (t.estimate_min || 30) * 60000).toISOString())}`);
    else { const d = t.due_at.slice(0, 10).replace(/-/g, ''); lines.push(`DTSTART;VALUE=DATE:${d}`); }
    if (t.notes) lines.push(`DESCRIPTION:${esc(t.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // Fold at 75 octets per RFC 5545 (simple char-based fold is fine here).
  return lines.map((l) => (l.length <= 74 ? l : l.replace(/(.{74})/g, '$1\r\n ')).replace(/\r\n $/, '')).join('\r\n') + '\r\n';
}
