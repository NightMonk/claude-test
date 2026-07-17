'use strict';
/* Tempo — ADHD-first task app. Vanilla JS single-page front end. */

// ---------------------------------------------------------------- utilities
const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let TOKEN = localStorage.getItem('tempo_token') || '';
const state = { tab: 'today', lists: [], goals: [], sub: null, calMode: 'month', calDate: new Date(), calSel: todayStr(), todayFilter: 'all', settings: {}, completedOpen: false, aiEnabled: false };
const expanded = new Set();       // task ids showing their sub-tasks
const notified = new Set();       // reminder ids already fired this session

// ---------------------------------------------------------------- API
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('unauthorised'); }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Something went wrong'); }
  return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------- auth
function logout() { TOKEN = ''; localStorage.removeItem('tempo_token'); showLogin(); }
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

// Lock keyboard preference (per device): default full text keyboard; optional
// numeric PIN pad for numeric-only passcodes. Applied before iOS decides which
// keyboard to raise.
function applyLockKeyboard() {
  const input = $('#passcode');
  if (localStorage.getItem('tempo_pin_mode') === '1') input.setAttribute('inputmode', 'numeric');
  else input.removeAttribute('inputmode');
}
applyLockKeyboard();
$('#pass-toggle').addEventListener('click', () => {
  const input = $('#passcode');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('#pass-toggle').textContent = show ? '🙈' : '👁';
  input.focus();
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.classList.add('hidden');
  try {
    const { token } = await (await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: $('#passcode').value }),
    }).then((r) => { if (!r.ok) throw new Error('Incorrect passcode'); return r; })).json();
    TOKEN = token; localStorage.setItem('tempo_token', token);
    $('#passcode').value = '';
    boot();
  } catch (e2) { err.textContent = e2.message; err.classList.remove('hidden'); }
});

// ---------------------------------------------------------------- boot
async function boot() {
  showApp();
  await refreshMeta();
  applyTheme();
  api('POST', '/tasks/reconcile', { today: todayStr() }).catch(() => {}); // carry overdue → today on open
  if (new URLSearchParams(location.search).get('google') === 'connected') {
    history.replaceState(null, '', '/');
    state.sub = { type: 'settings' }; toast('Google Calendar connected ✓');
  }
  render();
}
async function refreshMeta() {
  const [lists, goals, settings, ai] = await Promise.all([
    api('GET', '/lists'), api('GET', '/goals'), api('GET', '/settings'),
    api('GET', '/ai/status').catch(() => ({ configured: false })),
  ]);
  state.lists = lists; state.goals = goals; state.settings = settings; state.aiEnabled = !!ai.configured;
}
// Three themes (Phase 1). Legacy values (auto/light/dark) map to Graphite.
const THEMES = [
  { id: 'graphite', name: 'Graphite' },
  { id: 'paper', name: 'Warm Paper' },
  { id: 'eucalyptus', name: 'Eucalyptus' },
];
const themeId = () => (THEMES.some((t) => t.id === state.settings.theme) ? state.settings.theme : 'graphite');
function applyTheme() {
  document.documentElement.setAttribute('data-theme', themeId());
  // Keep the browser/PWA chrome in step with the theme's background token.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
async function setTheme(id) {
  state.settings.theme = id;
  applyTheme();
  api('PATCH', '/settings', { theme: id }).catch(() => {});
}
// Quick-switch: long-press the header title to cycle themes while deciding.
(function themeQuickSwitch() {
  let timer = null;
  const el = $('#title');
  const start = () => {
    timer = setTimeout(() => {
      const next = THEMES[(THEMES.findIndex((t) => t.id === themeId()) + 1) % THEMES.length];
      setTheme(next.id);
      toast('Theme: ' + next.name);
      if (state.sub?.type === 'settings') render();
    }, 550);
  };
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
})();
const listById = (id) => state.lists.find((l) => l.id === id);

// ---------------------------------------------------------------- toast + celebrate
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
// Toast with an inline action button (e.g. Undo). Auto-hides after `ms`.
function toastAction(msg, label, fn, ms = 5000) {
  const t = $('#toast'); t.innerHTML = '';
  t.appendChild(el(`<span>${esc(msg)}</span>`));
  const b = el(`<button class="toast-btn">${esc(label)}</button>`);
  b.addEventListener('click', () => { t.classList.add('hidden'); clearTimeout(toastTimer); fn(); });
  t.appendChild(b);
  t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.classList.add('hidden'); t.textContent = ''; }, ms);
}
function celebrate() {
  const box = $('#confetti'); box.innerHTML = ''; box.classList.remove('hidden');
  const colors = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--focus)'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.style.left = (44 + Math.random() * 12) + '%';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
    s.style.setProperty('--dy', (Math.random() * -180 - 40) + 'px');
    box.appendChild(s);
  }
  setTimeout(() => { box.classList.add('hidden'); box.innerHTML = ''; }, 950);
}

// ---------------------------------------------------------------- date formatting
function dueLabel(task) {
  if (!task.due_at) return null;
  const d = parseYmd(task.due_at);
  const t = parseYmd(todayStr());
  const diff = Math.round((d - t) / 86400000);
  let day;
  if (diff === 0) day = 'Today';
  else if (diff === 1) day = 'Tomorrow';
  else if (diff === -1) day = 'Yesterday';
  else if (diff > 1 && diff < 7) day = DOW[d.getDay()];
  else if (diff < 0) day = `${-diff}d ago`;
  else day = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  if (task.has_time) { const [, hm] = task.due_at.split('T'); day += ' · ' + fmt12(hm); }
  return day;
}
function fmt12(hm) {
  if (!hm) return '';
  let [h, m] = hm.split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return m ? `${h}:${pad(m)}${ap}` : `${h}${ap}`;
}
function dueState(task) {
  if (!task.due_at || task.done) return '';
  const diff = Math.round((parseYmd(task.due_at) - parseYmd(todayStr())) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due-today';
  return '';
}
const ENERGY = { low: '⚡ low', med: '🔋 med', high: '🔥 high' };

// ---------------------------------------------------------------- task card
function ring(size, stroke, pct, color) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - pct);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

function taskCard(task) {
  const list = listById(task.list_id);
  const subs = task.subtasks || [];
  const doneSubs = subs.filter((s) => s.done).length;
  const inMyDay = task.my_day_date === todayStr();
  const meta = [];
  const dl = dueLabel(task);
  if (dl) meta.push(`<span class="meta-chip ${dueState(task)}">🗓 ${esc(dl)}</span>`);
  if (task.carried_from && !task.done) {
    const wd = parseYmd(task.carried_from).toLocaleDateString(undefined, { weekday: 'short' });
    meta.push(`<span class="meta-chip carried">↩ Carried over · was ${esc(wd)}</span>`);
  }
  if (inMyDay && !task.done) meta.push(`<span class="meta-chip myday-chip">◎ My Day</span>`);
  if (list) meta.push(`<span class="meta-chip"><i class="list-dot" style="background:${esc(list.color)}"></i>${esc(list.name)}</span>`);
  if (task.energy) meta.push(`<span class="meta-chip">${ENERGY[task.energy] || ''}</span>`);
  if (task.estimate_min) meta.push(`<span class="meta-chip">⏱ ${task.estimate_min < 60 ? task.estimate_min + 'm' : (task.estimate_min / 60) + 'h'}</span>`);
  if (task.repeat && task.repeat !== 'none') meta.push(`<span class="meta-chip">🔁 ${esc(task.repeat)}</span>`);
  if (subs.length) meta.push(`<span class="meta-chip expander" data-exp="${task.id}">☑ ${doneSubs}/${subs.length} ${expanded.has(task.id) ? '▾' : '▸'}</span>`);

  const card = el(`<div class="task ${task.done ? 'is-done' : ''}" data-id="${task.id}">
    <div class="task-main">
      <button class="check ${task.done ? 'done' : ''} ${task.priority ? 'p' + task.priority : ''}" data-toggle="${task.id}" aria-label="Complete">✓</button>
      <div class="task-body">
        <div class="task-title" data-edit="${task.id}">${esc(task.title)}</div>
        ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
      </div>
    </div>
    ${!task.done ? `<div class="task-actions">
      <button class="mini-btn now" data-start="${task.id}">▶ Just start · 2 min</button>
      <button class="mini-btn" data-focus="${task.id}">Focus</button>
      <button class="mini-btn" data-myday="${task.id}" data-on="${inMyDay ? '1' : '0'}">${inMyDay ? '◎ In My Day' : '◎ My Day'}</button>
    </div>` : ''}
  </div>`);

  // Amnesty: after 3 carries, offer a gentle way out — never a guilt pile.
  if (!task.done && (task.rollover_count || 0) >= 3) {
    card.appendChild(el(`<div class="amnesty">
      <span>Carried ${task.rollover_count}× — still want it?</span>
      <div class="amnesty-btns">
        <button class="mini-btn" data-amnesty="reschedule" data-id="${task.id}">Reschedule</button>
        <button class="mini-btn" data-amnesty="someday" data-id="${task.id}">Someday</button>
        <button class="mini-btn amnesty-del" data-amnesty="delete" data-id="${task.id}">Delete</button>
      </div></div>`));
  }
  if (expanded.has(task.id)) card.appendChild(renderSubs(task));
  if (!task.done && !task.parent_id) attachSwipe(card, task);
  return card;
}

// Swipe right → complete · swipe left → move to tomorrow. touch-action:pan-y in
// CSS lets vertical scrolling stay native while we own the horizontal drag.
function attachSwipe(card, task) {
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, horiz = false;
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, a')) return;
    startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; decided = false; horiz = false;
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX; const dy = e.clientY - startY;
    if (!decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { decided = true; horiz = Math.abs(dx) > Math.abs(dy); }
    if (horiz) {
      e.preventDefault();
      card.style.transition = 'none';
      card.style.transform = `translateX(${dx}px)`;
      card.classList.toggle('swipe-complete', dx > 60);
      card.classList.toggle('swipe-snooze', dx < -60);
    }
  });
  const end = async () => {
    if (!dragging) return; dragging = false;
    card.style.transition = ''; card.style.transform = '';
    card.classList.remove('swipe-complete', 'swipe-snooze');
    if (horiz && dx > 90) { card.querySelector('.check')?.classList.add('done'); await toggleTask(task.id); }
    else if (horiz && dx < -90) { await snoozeTask(task); }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', () => { dragging = false; card.style.transition = ''; card.style.transform = ''; card.classList.remove('swipe-complete', 'swipe-snooze'); });
  card.addEventListener('click', (e) => { if (horiz && Math.abs(dx) > 10) { e.stopPropagation(); e.preventDefault(); } }, true);
}

async function snoozeTask(task, when = 'tomorrow') {
  const d = new Date();
  if (when === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (when === 'weekend') { const add = (6 - d.getDay() + 7) % 7 || 6; d.setDate(d.getDate() + add); }
  else if (when === 'nextweek') d.setDate(d.getDate() + 7);
  await api('PATCH', '/tasks/' + task.id, { due_at: ymd(d), has_time: 0 });
  toast(when === 'tomorrow' ? 'Moved to tomorrow →' : 'Rescheduled →');
  refreshMeta().then(render);
}

function renderSubs(task) {
  const wrap = el('<div class="subtasks-wrap"></div>');
  const box = el('<div class="subtasks"></div>');
  for (const s of task.subtasks) {
    const row = el(`<div class="subtask ${s.done ? 'is-done' : ''}">
      <button class="check ${s.done ? 'done' : ''}" data-subtoggle="${s.id}">✓</button>
      <span>${esc(s.title)}</span>
      <button class="se-del" data-subdel="${s.id}" aria-label="Delete">×</button>
    </div>`);
    box.appendChild(row);
  }
  const add = el(`<div class="subtask-add"><input placeholder="Add a step…" data-subadd="${task.id}" /></div>`);
  wrap.appendChild(box); wrap.appendChild(add);
  return wrap;
}

// ---------------------------------------------------------------- views
async function render() {
  const v = $('#view');
  $('#back-btn').classList.toggle('hidden', !state.sub);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === state.tab && !state.sub));
  renderSidebar(); // keep the >=768 sidebar's active state + lists in sync
  // Week-grid view wants full width, so >=1200 it drops the reserved detail
  // column (detail falls back to a slide-over there). Phase 4.
  document.getElementById('app').classList.toggle('week-mode', state.tab === 'upcoming' && !state.sub);
  try {
    if (state.sub?.type === 'list') return renderListDetail(state.sub.id);
    if (state.sub?.type === 'goal') return renderGoalDetail(state.sub.id);
    if (state.sub?.type === 'inbox') return renderInbox();
    if (state.sub?.type === 'someday') return renderSomeday();
    if (state.sub?.type === 'archive') return renderArchive();
    if (state.sub?.type === 'settings') return renderSettings();
    if (state.tab === 'today') return renderToday();
    if (state.tab === 'upcoming') return renderUpcoming();
    if (state.tab === 'calendar') return renderCalendar();
    if (state.tab === 'goals') return renderGoals();
    if (state.tab === 'lists') return renderLists();
  } catch (e) { v.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

// A TickTick-style horizontal week strip; tap another day to open its timeline.
function weekStrip() {
  const start = parseYmd(todayStr());
  const ws = state.settings.week_start || 0;
  start.setDate(start.getDate() - ((start.getDay() - ws + 7) % 7));
  const strip = el('<div class="week-strip"></div>');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = ymd(d); const isToday = k === todayStr();
    const cell = el(`<button class="ws-day ${isToday ? 'today' : ''}" data-daynav="${k}">
      <span class="ws-dow">${DOW[d.getDay()][0]}</span><span class="ws-num">${d.getDate()}</span></button>`);
    strip.appendChild(cell);
  }
  return strip;
}

async function renderToday() {
  $('#title').textContent = 'My Day';
  const [tasks, doneToday, events] = await Promise.all([
    api('GET', '/tasks?bucket=today&today=' + todayStr()),
    api('GET', '/tasks?bucket=done_today&today=' + todayStr()),
    getEvents(todayStr(), todayStr()),
  ]);
  const v = $('#view'); v.innerHTML = '';
  const total = tasks.length + doneToday.length;
  const done = doneToday.length;
  const pct = total ? done / total : 0;
  const mins = tasks.reduce((a, t) => a + (t.estimate_min || 0), 0);

  v.appendChild(weekStrip());

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  v.appendChild(el(`<div class="greet">${greet} — ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>`));
  const leftBits = [];
  if (tasks.length) leftBits.push(`about <span class="accent">${mins ? Math.round(mins / 60 * 10) / 10 + 'h' : 'a bit'}</span> of tasks left`);
  if (events.length) leftBits.push(`${events.length} event${events.length > 1 ? 's' : ''} on your calendar`);
  const subLine = total === 0 && !events.length ? 'A clear page. Add something small.'
    : (leftBits.length ? leftBits.join(' · ') : 'All done. Lovely. 🎉');
  v.appendChild(el(`<div class="momentum">${ring(52, 6, pct, 'var(--ok)')}
    <div><b>${done} of ${total || 0} done today</b>
    <div class="sub">${subLine}</div></div></div>`));

  // Today's calendar events, folded into the day (My Day polish 4.2).
  if (events.length) {
    v.appendChild(el(`<div class="section-label">On your calendar</div>`));
    [...events].sort((a, b) => (a.all_day ? '' : a.start).localeCompare(b.all_day ? '' : b.start)).forEach((e) => v.appendChild(el(eventChip(e))));
  }

  // Signature actions: plan the day, or let Tempo choose one to beat choice paralysis.
  const actions = el(`<div class="today-actions">
    <button class="pill-action" data-plan>🗂 Plan my day</button>
    ${tasks.length ? '<button class="pill-action accent" data-pick>✨ Pick one for me</button>' : ''}
  </div>`);
  v.appendChild(actions);

  if (tasks.length > 1) {
    const f = state.todayFilter;
    v.appendChild(el(`<div class="filters">
      <button class="chip-btn ${f === 'all' ? 'on' : ''}" data-filter="all">All</button>
      <button class="chip-btn ${f === 'quick' ? 'on' : ''}" data-filter="quick">⏱ Quick (≤15m)</button>
      <button class="chip-btn ${f === 'low' ? 'on' : ''}" data-filter="low">⚡ Low energy</button>
    </div>`));
  }
  const passFilter = (t) => state.todayFilter === 'all'
    || (state.todayFilter === 'quick' && t.estimate_min && t.estimate_min <= 15)
    || (state.todayFilter === 'low' && t.energy === 'low');

  // Sort (Phase 2.2): carried-over first (4.2), then priority ↓, timed ↑ (untimed
  // last), then manual order. Overdue no longer needs its own section — the server
  // reconcile has already carried it to today with a badge.
  const timeKey = (t) => (t.has_time && String(t.due_at).includes('T')) ? t.due_at.split('T')[1] : '~';
  const byTime = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const cmp = (a, b) => (b.priority - a.priority) || byTime(timeKey(a), timeKey(b)) || (a.sort - b.sort) || (a.id - b.id);
  const open = tasks.filter(passFilter);
  const ordered = [...open.filter((t) => t.carried_from).sort(cmp), ...open.filter((t) => !t.carried_from).sort(cmp)];

  v.appendChild(el(`<div class="section-label">Today</div>`));
  if (!ordered.length) {
    const msg = state.todayFilter !== 'all' ? 'Nothing matches that filter right now.' : 'You have a free day.<br><span class="muted">Take it easy — or tap ＋ to add something.</span>';
    v.appendChild(el(`<div class="empty"><span class="big">🌿</span>${msg}</div>`));
  }
  ordered.forEach((t) => v.appendChild(taskCard(t)));

  // Completed today — collapsible group at the bottom of the day.
  if (doneToday.length) {
    const openC = state.completedOpen;
    v.appendChild(el(`<button class="completed-head" data-completed-toggle><span>✓ Completed today (${doneToday.length})</span><span class="chev">${openC ? '▾' : '▸'}</span></button>`));
    if (openC) doneToday.forEach((t) => v.appendChild(taskCard(t)));
  }
}

// Any.do-style agenda for the next seven days (4.1). One section per day —
// Today, Tomorrow, then weekdays — each with its tasks and calendar events, and
// a ＋ to drop something straight onto that day. Undated captures sit in Inbox.
async function renderUpcoming() {
  $('#title').textContent = 'Upcoming';
  const start = parseYmd(todayStr());
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const tomorrow = new Date(start); tomorrow.setDate(start.getDate() + 1);
  const [todayTasks, rangeTasks, events, inbox] = await Promise.all([
    api('GET', '/tasks?bucket=today&today=' + todayStr()),
    api('GET', `/tasks?from=${ymd(tomorrow)}&to=${ymd(end)}`),
    getEvents(todayStr(), ymd(end)),
    api('GET', '/tasks?bucket=inbox'),
  ]);
  const v = $('#view'); v.innerHTML = '';
  const emap = byDate(events, 'start');
  const rmap = byDate(rangeTasks);
  // Plain string compare, not localeCompare — the latter's punctuation weighting
  // would sort the untimed "~" sentinel before real times.
  const timeKey = (t) => (t.has_time && String(t.due_at).includes('T')) ? t.due_at.split('T')[1] : '~';
  const byTime = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const cmp = (a, b) => byTime(timeKey(a), timeKey(b)) || (b.priority - a.priority) || (a.sort - b.sort) || (a.id - b.id);

  const ahead = todayTasks.filter((t) => !t.done).length + rangeTasks.filter((t) => !t.done).length;
  v.appendChild(el(`<div class="greet">Next 7 days · ${ahead} task${ahead !== 1 ? 's' : ''} ahead</div>`));

  // The 7 day sections live in a wrapper that is `display: contents` on mobile
  // (they stack exactly as before) and a 7-column grid at >=1024px (Phase 4).
  const grid = el('<div class="up-grid"></div>');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = ymd(d);
    const isToday = i === 0;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' });
    const dayTasks = (isToday ? todayTasks.filter((t) => !t.done) : (rmap[k] || []).filter((t) => !t.done)).sort(cmp);
    const evs = (emap[k] || []).slice().sort((a, b) => (a.all_day ? '' : a.start).localeCompare(b.all_day ? '' : b.start));

    const section = el(`<div class="up-day ${isToday ? 'is-today' : ''}"></div>`);
    section.appendChild(el(`<div class="up-head" data-addday="${k}">
      <div><span class="up-label">${label}</span> <span class="up-date">${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</span></div>
      <button class="up-add" data-addday="${k}" aria-label="Add to ${esc(label)}">＋</button></div>`));
    evs.forEach((e) => section.appendChild(el(eventChip(e))));
    dayTasks.forEach((t) => section.appendChild(taskCard(t)));
    if (!dayTasks.length && !evs.length) section.appendChild(el(`<div class="up-empty">Nothing planned</div>`));
    grid.appendChild(section);
  }
  v.appendChild(grid);

  if (inbox.length) v.appendChild(el(`<div class="list-row up-inbox" data-inboxopen><span class="list-emoji">📥</span><span class="list-name">Inbox — undated captures</span><span class="list-count">${inbox.length}</span></div>`));
}

async function renderGoals() {
  $('#title').textContent = 'Goals';
  const goals = state.goals = await api('GET', '/goals');
  const v = $('#view'); v.innerHTML = '';
  v.appendChild(el(`<div class="today-actions"><button class="pill-action" id="goals-review">📋 Weekly review</button><button class="pill-action accent" id="goals-add">＋ New goal</button></div>`));
  $('#goals-review').addEventListener('click', openReview);
  $('#goals-add').addEventListener('click', () => openGoalEditor());
  if (!goals.length) { v.appendChild(el(`<div class="empty"><span class="big">◈</span>No goals yet.<br>Add one, then break it into small steps.</div>`)); return; }
  for (const g of goals) {
    const next = g.next_action;
    const card = el(`<div class="goal-card" data-goalopen="${g.id}">
      <div class="goal-top"><span class="goal-dot" style="background:${esc(g.color)}"></span><span class="goal-name">${esc(g.name)}</span><span class="goal-pct" style="color:${esc(g.color)}">${g.progress}%</span></div>
      <div class="bar"><i style="width:${g.progress}%;background:${esc(g.color)}"></i></div>
      ${next ? `<div class="goal-next">Next: <b>${esc(next.title)}</b> →</div>`
             : `<div class="goal-next empty-next">${g.total ? 'All steps done — set a new one' : 'Add the first small step'}</div>`}
    </div>`);
    v.appendChild(card);
  }
}

async function renderLists() {
  $('#title').textContent = 'Lists';
  const [lists, inbox, someday] = await Promise.all([api('GET', '/lists'), api('GET', '/tasks?bucket=inbox'), api('GET', '/tasks?bucket=someday')]);
  state.lists = lists;
  const v = $('#view'); v.innerHTML = '';
  v.appendChild(el(`<div class="list-row" data-searchopen style="color:var(--ink-2)"><span class="list-emoji">🔍</span><span class="list-name">Search</span></div>`));
  v.appendChild(el(`<div class="list-row" data-inboxopen><span class="list-emoji">📥</span><span class="list-name">Inbox</span><span class="list-count">${inbox.length}</span></div>`));
  v.appendChild(el(`<div class="list-row" data-somedayopen><span class="list-emoji">🌙</span><span class="list-name">Someday</span><span class="list-count">${someday.length}</span></div>`));
  v.appendChild(el(`<div class="section-label">Your lists</div>`));
  for (const l of lists) {
    // Colored dot as the list's identity, matching the pickers and task cards.
    v.appendChild(el(`<div class="list-row" data-listopen="${l.id}">
      <span class="list-emoji"><span class="list-dot-lg" style="--dot:${esc(l.color)}"></span></span>
      <span class="list-name">${esc(l.name)}</span>
      <span class="list-count">${l.open_count}</span></div>`));
  }
  const add = el(`<div class="list-row" id="add-list" style="color:var(--accent);justify-content:center;font-weight:700">＋ New list</div>`);
  v.appendChild(add);
  $('#add-list').addEventListener('click', () => openListEditor());
}

async function renderListDetail(id) {
  const l = listById(id) || (await api('GET', '/lists')).find((x) => x.id === id);
  $('#title').innerHTML = `${l?.color ? `<span class="title-dot" style="background:${esc(l.color)}"></span>` : ''}${esc(l?.name || 'List')}`;
  const tasks = await api('GET', '/tasks?list=' + id);
  const v = $('#view'); v.innerHTML = '';
  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  if (!tasks.length) v.appendChild(el(`<div class="empty"><span class="big">📝</span>Nothing here yet.</div>`));
  open.forEach((t) => v.appendChild(taskCard(t)));
  if (done.length) { v.appendChild(el(`<div class="section-label">Done</div>`)); done.forEach((t) => v.appendChild(taskCard(t))); }
  v.appendChild(el(`<div style="margin-top:22px;text-align:center"><button class="btn-ghost" id="edit-list">Edit list</button></div>`));
  $('#edit-list').addEventListener('click', () => openListEditor(l));
}

async function renderInbox() {
  $('#title').textContent = '📥 Inbox';
  const tasks = await api('GET', '/tasks?bucket=inbox');
  const v = $('#view'); v.innerHTML = '';
  if (!tasks.length) { v.appendChild(el(`<div class="empty"><span class="big">📥</span>Inbox zero. Nicely done.</div>`)); return; }
  v.appendChild(el(`<div class="greet">Undated captures. Give each a home — or plan them all at once.</div>`));
  v.appendChild(el(`<div class="today-actions"><button class="pill-action" data-plan>🗂 Plan these now</button></div>`));
  tasks.forEach((t) => v.appendChild(taskCard(t)));
}

async function renderSomeday() {
  $('#title').textContent = '🌙 Someday';
  const tasks = await api('GET', '/tasks?bucket=someday');
  const v = $('#view'); v.innerHTML = '';
  if (!tasks.length) { v.appendChild(el(`<div class="empty"><span class="big">🌙</span>Nothing parked here.<br><span class="muted">Someday holds ideas without a deadline — no pressure, no guilt.</span></div>`)); return; }
  v.appendChild(el(`<div class="greet">Ideas without a deadline. Pull one into My Day when you're ready.</div>`));
  tasks.forEach((t) => {
    const card = taskCard(t);
    // Give each Someday task a one-tap way back into the day.
    card.querySelector('.task-actions')?.appendChild(el(`<button class="mini-btn" data-somedayto="${t.id}">◎ Move to My Day</button>`));
    v.appendChild(card);
  });
}

// History: every completed task, grouped by when it was finished. Restore pulls
// one back into today. This is also where a mistaken "done" tap is undone later.
async function renderArchive() {
  $('#title').textContent = '🗂 History';
  const all = await api('GET', '/tasks?bucket=archive');
  const v = $('#view'); v.innerHTML = '';
  v.appendChild(el(`<div class="list-row" data-archivesearch style="color:var(--ink-2)"><span class="list-emoji">🔍</span><span class="list-name">Search completed…</span></div>`));
  if (!all.length) { v.appendChild(el(`<div class="empty"><span class="big">🗂</span>No completed tasks yet.<br><span class="muted">Finished tasks gather here — you can always restore one.</span></div>`)); return; }

  const q = (state.sub?.q || '').toLowerCase();
  const tasks = q ? all.filter((t) => (t.title || '').toLowerCase().includes(q)) : all;
  v.appendChild(el(`<div class="greet">${tasks.length} completed${q ? ` matching “${esc(state.sub.q)}”` : ''}. Tap a task to reopen, or Restore to bring it back to today.</div>`));

  // Bucket by completion recency (Europe/London day boundaries via the client's
  // local day, which the server already aligns to London).
  const today = parseYmd(todayStr());
  const startOfWeek = new Date(today); const ws = state.settings.week_start || 1;
  startOfWeek.setDate(today.getDate() - ((today.getDay() - ws + 7) % 7));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const groups = [
    { label: 'Today', items: [] },
    { label: 'This week', items: [] },
    { label: 'This month', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const t of tasks) {
    const c = t.completed_at ? new Date(t.completed_at) : null;
    if (!c) { groups[3].items.push(t); continue; }
    const cd = parseYmd(ymd(c));
    if (cd.getTime() === today.getTime()) groups[0].items.push(t);
    else if (cd >= startOfWeek) groups[1].items.push(t);
    else if (cd >= startOfMonth) groups[2].items.push(t);
    else groups[3].items.push(t);
  }
  for (const g of groups) {
    if (!g.items.length) continue;
    v.appendChild(el(`<div class="section-label">${g.label} · ${g.items.length}</div>`));
    for (const t of g.items) {
      const card = taskCard(t);
      // Completed cards have no action row — add a Restore control.
      const stamp = t.completed_at ? new Date(t.completed_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
      card.appendChild(el(`<div class="task-actions archive-actions">
        ${stamp ? `<span class="archive-when">✓ ${esc(stamp)}</span>` : ''}
        <button class="mini-btn" data-restore="${t.id}">↩ Restore</button>
      </div>`));
      v.appendChild(card);
    }
  }
}

async function renderGoalDetail(id) {
  const g = await api('GET', '/goals/' + id);
  $('#title').textContent = g.name;
  const tasks = await api('GET', '/tasks?goal=' + id);
  const v = $('#view'); v.innerHTML = '';
  v.appendChild(el(`<div class="goal-card">
    <div class="goal-top"><span class="goal-name">${esc(g.name)}</span><span class="goal-pct" style="color:${esc(g.color)}">${g.progress}%</span></div>
    <div class="bar"><i style="width:${g.progress}%;background:${esc(g.color)}"></i></div>
    ${g.target_date ? `<div class="goal-next">🎯 by ${esc(dueLabelFromDate(g.target_date))}</div>` : ''}
    ${g.notes ? `<div class="goal-next" style="margin-top:6px">${esc(g.notes)}</div>` : ''}</div>`));
  v.appendChild(el(`<div class="section-label">Steps</div>`));
  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  if (!tasks.length) v.appendChild(el(`<div class="empty">Break this goal into small steps.</div>`));
  open.forEach((t) => v.appendChild(taskCard(t)));
  if (done.length) { v.appendChild(el(`<div class="section-label">Done</div>`)); done.forEach((t) => v.appendChild(taskCard(t))); }
  const bar = el(`<div style="display:flex;gap:10px;margin-top:20px">
    <button class="btn-primary" id="add-step">＋ Add step</button>
    <button class="btn-ghost" id="edit-goal">Edit</button></div>`);
  v.appendChild(bar);
  $('#add-step').addEventListener('click', () => openTaskEditor(null, { goal_id: id }));
  $('#edit-goal').addEventListener('click', () => openGoalEditor(g));
}
function dueLabelFromDate(s) { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }

// Build a Google Calendar "add event" URL from a task. Pure client — no OAuth,
// no server setup; just opens a pre-filled Google Calendar page.
function gcalUrl(task) {
  const enc = encodeURIComponent;
  let dates;
  if (task.has_time && String(task.due_at).includes('T')) {
    const [d, hm] = task.due_at.split('T');
    const base = parseYmd(d); const [h, m] = hm.split(':').map(Number);
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    const end = new Date(start.getTime() + (task.estimate_min || 30) * 60000);
    const fmt = (dt) => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    dates = `${fmt(start)}/${fmt(end)}`;
  } else {
    const d = parseYmd(task.due_at); const next = new Date(d); next.setDate(d.getDate() + 1);
    const fmtD = (dt) => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
    dates = `${fmtD(d)}/${fmtD(next)}`; // all-day span
  }
  const params = ['action=TEMPLATE', `text=${enc(task.title || 'Task')}`, `dates=${dates}`];
  if (task.notes) params.push(`details=${enc(task.notes)}`);
  if (task.location) params.push(`location=${enc(task.location)}`);
  return 'https://calendar.google.com/calendar/render?' + params.join('&');
}

// ---------------------------------------------------------------- settings
async function renderSettings() {
  $('#title').textContent = 'Settings';
  const s = state.settings = await api('GET', '/settings');
  const [cals, gstatus, secrets] = await Promise.all([api('GET', '/calendars'), api('GET', '/google/status'), api('GET', '/secrets/status')]);
  const v = $('#view'); v.innerHTML = '';
  const pushOn = ('Notification' in window) && Notification.permission === 'granted' && await hasPushSub();

  v.appendChild(el(`<div class="section-label">Appearance</div>`));
  const theme = el(`<div class="settings-card"><div class="set-row"><span>Theme<br><small class="muted">Tip: long-press the screen title to flip themes anywhere</small></span><div class="chips" id="set-theme">
    ${THEMES.map((t) => `<button class="chip-btn ${themeId() === t.id ? 'on' : ''}" data-theme-set="${t.id}">${t.name}</button>`).join('')}
  </div></div>
  <div class="set-row"><span>Week starts</span><div class="chips" id="set-week">
    ${[['Sunday', 0], ['Monday', 1]].map(([n, val]) => `<button class="chip-btn ${(s.week_start || 0) == val ? 'on' : ''}" data-week="${val}">${n}</button>`).join('')}
  </div></div>
  <div class="set-row"><span>Lock keyboard<br><small class="muted">PIN shows the number pad — only for all-digit passcodes</small></span><div class="chips" id="set-lockkb">
    ${[['Text', '0'], ['PIN', '1']].map(([n, val]) => `<button class="chip-btn ${(localStorage.getItem('tempo_pin_mode') || '0') === val ? 'on' : ''}" data-lockkb="${val}">${n}</button>`).join('')}
  </div></div></div>`);
  v.appendChild(theme);
  $('#set-lockkb', theme).addEventListener('click', (e) => {
    const b = e.target.closest('[data-lockkb]'); if (!b) return;
    localStorage.setItem('tempo_pin_mode', b.dataset.lockkb);
    applyLockKeyboard();
    $('#set-lockkb').querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b));
    toast(b.dataset.lockkb === '1' ? 'Lock uses the number pad on this device' : 'Lock uses the full keyboard');
  });

  v.appendChild(el(`<div class="section-label">Reminders</div>`));
  const notif = el(`<div class="settings-card">
    <div class="set-row"><span>Push notifications<br><small class="muted">Fire even when Tempo is closed</small></span>
      <button class="chip-btn ${pushOn ? 'on' : ''}" id="set-push">${pushOn ? 'On' : 'Enable'}</button></div>
    <div class="set-row"><span>Quiet hours</span><div style="display:flex;gap:6px;align-items:center">
      <input type="time" id="q-start" value="${s.quiet_start || ''}" style="width:104px"> <span class="muted">to</span>
      <input type="time" id="q-end" value="${s.quiet_end || ''}" style="width:104px"></div></div>
  </div>`);
  v.appendChild(notif);

  // ---- Smart features: paste credentials into the app (nothing committed) ----
  let sec = secrets;
  v.appendChild(el(`<div class="section-label">Smart features</div>`));
  const smart = el(`<div class="settings-card">
    <div class="set-row"><span>✨ AI assistant<br><small class="muted">Suggest steps · Improve wording · Note → tasks</small></span><span id="ai-state"></span></div>
    <div id="ai-entry"></div>
    <div class="set-sub"><b>Google Calendar sync (optional)</b><br>
      <small class="muted">Two-way sync needs a Google OAuth client — see GCAL_SETUP.md. Register this exact redirect URI in Google Cloud:</small>
      <div class="feed-url"><code id="gc-redirect">${esc(location.origin)}/api/google/callback</code><button class="chip-btn" id="copy-redirect">Copy</button></div>
      <div id="gc-entry"></div>
    </div>
  </div>`);
  v.appendChild(smart);
  $('#copy-redirect').addEventListener('click', () => { navigator.clipboard?.writeText(`${location.origin}/api/google/callback`); toast('Redirect URI copied'); });

  function paintAI() {
    const st = $('#ai-state'), entry = $('#ai-entry');
    if (sec.anthropic.set) {
      st.innerHTML = `<span class="key-ok">key set ✓</span>`;
      entry.innerHTML = `<div class="set-row"><span class="muted" style="font-size:13px">Stored: <code>${esc(sec.anthropic.hint || '')}</code> · never shown in full</span>
        <button class="chip-btn btn-danger" id="ai-remove">Remove</button></div>`;
      $('#ai-remove').addEventListener('click', async () => {
        await api('DELETE', '/secrets/anthropic'); const r = await api('GET', '/secrets/status'); sec = r;
        toast('AI key removed'); await refreshMeta(); paintAI();
      });
    } else {
      st.innerHTML = `<span class="muted" style="font-size:13px">off</span>`;
      entry.innerHTML = `<div class="key-entry"><input type="password" id="ai-key" placeholder="Paste Anthropic key (sk-ant-…)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" />
        <button class="btn-primary" id="ai-save">Save</button></div>
        <small class="muted" style="font-size:12px;display:block;margin-top:6px">Get one at console.anthropic.com → API keys. Stored only on your server; never sent back to this screen.</small>`;
      $('#ai-save').addEventListener('click', async () => {
        const key = $('#ai-key').value.trim(); if (!key) { toast('Paste your key first'); return; }
        const btn = $('#ai-save'); btn.disabled = true; btn.textContent = 'Checking…';
        try {
          const r = await api('PATCH', '/secrets', { anthropic_api_key: key });
          sec = r.status; toast((r.notes && r.notes[0]) || 'Saved ✓'); await refreshMeta(); paintAI();
        } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Save'; }
      });
    }
  }

  function paintGC() {
    const g = $('#gc-entry');
    const idSet = sec.google.client_id_set, secSet = sec.google.client_secret_set;
    g.innerHTML = `
      <div class="key-entry"><input type="text" id="gc-id" placeholder="Client ID (…apps.googleusercontent.com)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" /></div>
      <div class="key-entry"><input type="password" id="gc-secret" placeholder="Client secret (GOCSPX-…)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" /></div>
      <div class="set-row"><span class="muted" style="font-size:12px">${idSet ? 'ID set ✓' : 'ID not set'} · ${secSet ? 'secret set ✓' : 'secret not set'}</span>
        <span style="display:flex;gap:6px">${(idSet || secSet) ? '<button class="chip-btn btn-danger" id="gc-remove">Remove</button>' : ''}<button class="btn-primary" id="gc-save">Save</button></span></div>`;
    $('#gc-save').addEventListener('click', async () => {
      const id = $('#gc-id').value.trim(), secret = $('#gc-secret').value.trim();
      if (!id && !secret) { toast('Paste your Client ID and secret'); return; }
      const body = {}; if (id) body.google_client_id = id; if (secret) body.google_client_secret = secret;
      try { await api('PATCH', '/secrets', body); toast('Google credentials saved'); await refreshMeta(); render(); }
      catch (e) { toast(e.message); }
    });
    $('#gc-remove')?.addEventListener('click', async () => {
      await api('DELETE', '/secrets/google'); toast('Google credentials removed'); await refreshMeta(); render();
    });
  }
  paintAI(); paintGC();

  v.appendChild(el(`<div class="section-label">Calendar sync</div>`));
  const googleBlock = gstatus.connected
    ? `<div class="google-row"><span class="g-badge">📅 Google</span><div style="flex:1"><b>Connected</b>${gstatus.email ? `<br><small class="muted">${esc(gstatus.email)}</small>` : ''}</div>
        <button class="chip-btn" id="g-sync">Sync</button><button class="chip-btn btn-danger" id="g-disconnect">Disconnect</button></div>`
    : gstatus.configured
      ? `<div class="google-row"><span class="g-badge">📅 Google</span><div style="flex:1"><b>Google Calendar</b><br><small class="muted">Two-way: see events here, tasks flow back via the feed below.</small></div>
          <button class="chip-btn" id="g-connect">Connect</button></div>`
      : `<div class="google-row"><span class="g-badge">📅 Google</span><div style="flex:1"><b>Google Calendar</b><br><small class="muted">Not set up on this server — see DEPLOY.md, or use ICS below (works with Google too).</small></div></div>`;
  const calCard = el(`<div class="settings-card">
    ${googleBlock}
    <div id="cal-list"></div>
    <button class="chip-btn" id="add-cal" style="width:100%;margin-top:8px">＋ Subscribe to a calendar (ICS)</button>
    <div class="set-sub"><b>Publish your tasks</b><br><small class="muted">Add this URL in Google/Apple/Outlook to see Tempo tasks in your calendar:</small>
      <div class="feed-url"><code id="feed">${esc(s.feed_url || '')}</code><button class="chip-btn" id="copy-feed">Copy</button></div></div>
  </div>`);
  v.appendChild(calCard);
  $('#g-connect', calCard)?.addEventListener('click', async () => { try { const { url } = await api('GET', '/google/auth'); location.href = url; } catch (e) { toast(e.message); } });
  $('#g-sync', calCard)?.addEventListener('click', async () => { toast('Syncing Google…'); const r = await api('POST', '/google/sync'); toast(r.ok ? `Synced — ${r.count} events` : 'Sync failed'); render(); });
  $('#g-disconnect', calCard)?.addEventListener('click', async () => { await api('POST', '/google/disconnect'); toast('Google disconnected'); render(); });
  const cl = $('#cal-list', calCard);
  if (!cals.length) cl.appendChild(el(`<p class="muted" style="font-size:13px;margin:2px 0">No calendars yet.</p>`));
  cals.forEach((c) => {
    const row = el(`<div class="cal-item"><i class="list-dot" style="background:${esc(c.color)}"></i>
      <div style="flex:1"><b>${esc(c.name)}</b>${c.last_error ? `<br><small style="color:var(--danger)">${esc(c.last_error)}</small>` : c.last_synced ? `<br><small class="muted">synced</small>` : ''}</div>
      <button class="chip-btn" data-calsync="${c.id}">↻</button><button class="se-del" data-caldel="${c.id}">×</button></div>`);
    cl.appendChild(row);
  });

  v.appendChild(el(`<div class="section-label">Your data</div>`));
  const data = el(`<div class="settings-card">
    <button class="menu-item" id="s-export">⬇ <span>Export a backup (JSON)</span></button>
    <button class="menu-item" id="s-import">⬆ <span>Restore from a backup</span></button>
    <input type="file" id="import-file" accept="application/json" class="hidden">
  </div>`);
  v.appendChild(data);
  v.appendChild(el(`<p class="muted" style="font-size:12px;text-align:center;margin-top:18px">Tempo · private, self-hosted. One login, every device.</p>`));

  // wire
  $('#set-theme').addEventListener('click', async (e) => { const b = e.target.closest('[data-theme-set]'); if (!b) return; await setTheme(b.dataset.themeSet); render(); });
  $('#set-week').addEventListener('click', async (e) => { const b = e.target.closest('[data-week]'); if (!b) return; await api('PATCH', '/settings', { week_start: Number(b.dataset.week) }); state.settings.week_start = Number(b.dataset.week); render(); });
  $('#set-push').addEventListener('click', enablePush);
  const saveQuiet = async () => { await api('PATCH', '/settings', { quiet_start: $('#q-start').value, quiet_end: $('#q-end').value }); toast('Quiet hours saved'); };
  $('#q-start').addEventListener('change', saveQuiet); $('#q-end').addEventListener('change', saveQuiet);
  $('#add-cal').addEventListener('click', openCalendarAdd);
  $('#copy-feed').addEventListener('click', () => { navigator.clipboard?.writeText(s.feed_url); toast('Feed URL copied'); });
  cl.addEventListener('click', async (e) => {
    const sync = e.target.closest('[data-calsync]'); const del = e.target.closest('[data-caldel]');
    if (sync) { toast('Syncing…'); await api('POST', `/calendars/${sync.dataset.calsync}/sync`); render(); }
    if (del) { await api('DELETE', '/calendars/' + del.dataset.caldel); render(); }
  });
  $('#s-export').addEventListener('click', async () => {
    const d = await api('GET', '/export');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    a.download = 'tempo-backup.json'; a.click();
  });
  $('#s-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('Restore merges the backup into your current data (matching items are updated, nothing is deleted). Continue?')) return;
    try { const data = JSON.parse(await file.text()); await api('POST', '/import', data); toast('Restored ✓'); refreshMeta().then(render); }
    catch (err) { toast('Could not import that file'); }
  });
}

function openCalendarAdd() {
  const colors = ['#5C6470', '#2F6B55', '#C05E3B', '#B98207', '#6366F1', '#C4453C'];
  $('#sheet-body').innerHTML = `<h2>Subscribe to a calendar</h2>
    <p class="muted" style="font-size:13px;margin-top:-6px">Paste the <b>secret ICS address</b> from Google Calendar (Settings → your calendar → “Secret address in iCal format”), Apple iCloud (share → Public Calendar), or Outlook (Publish calendar → ICS).</p>
    <div class="field"><label>Name</label><input type="text" id="cal-name" placeholder="e.g. Work" /></div>
    <div class="field"><label>ICS URL</label><input type="text" id="cal-url" placeholder="https://…/basic.ics or webcal://…" /></div>
    <div class="field"><label>Colour</label><div class="chips" id="cal-color">${colors.map((c, i) => `<button class="chip-btn ${i === 1 ? 'on' : ''}" data-c="${c}" style="background:${c};color:#fff;border-color:${c}">●</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn-primary" id="cal-save">Subscribe</button></div>`;
  openSheet();
  let color = '#2F6B55';
  $('#cal-color').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $('#cal-color').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#cal-save').addEventListener('click', async () => {
    const url = $('#cal-url').value.trim(); if (!url) { toast('Paste the ICS URL'); return; }
    try {
      const r = await api('POST', '/calendars', { name: $('#cal-name').value.trim() || 'Calendar', url, color });
      closeSheet();
      toast(r.sync?.ok ? `Added — ${r.sync.count} events` : 'Added, but sync failed — check the URL');
      render();
    } catch (e) { toast(e.message); }
  });
}

// ---------------------------------------------------------------- web push
async function hasPushSub() {
  try { const reg = await navigator.serviceWorker?.ready; return !!(await reg?.pushManager.getSubscription()); } catch { return false; }
}
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('Push not supported here — try installing to your home screen'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications permission needed'); return; }
    const { key } = await api('GET', '/push/key');
    if (!key) { toast('Push not configured on the server'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    await api('POST', '/push/subscribe', sub.toJSON());
    toast('Push reminders on ✓'); render();
  } catch (e) { toast('Could not enable push: ' + e.message); }
}

// ---------------------------------------------------------------- weekly review
async function openReview() {
  const overlay = $('#review');
  const from = new Date(); from.setDate(from.getDate() - 6);
  const [doneWeek, todayList] = await Promise.all([
    api('GET', `/tasks?from=${ymd(from)}&to=${todayStr()}`),
    api('GET', '/tasks?bucket=today&today=' + todayStr()),
  ]);
  const goals = await api('GET', '/goals');
  const done = doneWeek.filter((t) => t.done).length;
  const openOverdue = todayList.filter((t) => dueState(t) === 'overdue');
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  overlay.innerHTML = `<button class="fx-close" id="rv-x">×</button>
    <div class="review-scroll">
      <h2 style="margin-top:8px">Your week</h2>
      <div class="review-stats">
        <div class="rv-stat"><b>${done}</b><span>done this week</span></div>
        <div class="rv-stat"><b>${openOverdue.length}</b><span>still open</span></div>
        <div class="rv-stat"><b>${goals.length}</b><span>goals live</span></div>
      </div>
      <p class="muted" style="text-align:center">${done >= 5 ? 'Strong week 🎉' : done > 0 ? 'Every one counts.' : 'Fresh start — be kind to yourself.'}</p>
      ${openOverdue.length ? `<div class="section-label">Carry ${openOverdue.length} unfinished forward</div>
        <div class="review-choices"><button class="btn-ghost" id="rv-today">→ Pull into today</button><button class="btn-ghost" id="rv-next">⇥ Next week</button></div>` : ''}
      <div class="section-label">Goals — pull a next step in?</div>
      <div id="rv-goals"></div>
      <div class="section-label">Intention for next week</div>
      <textarea id="rv-note" class="review-note" placeholder="What's the one thing that matters?">${esc(state.settings.review_note || '')}</textarea>
      <button class="btn-primary" id="rv-save" style="margin-top:14px">Save &amp; finish</button>
    </div>`;
  overlay.classList.remove('hidden');
  const gbox = $('#rv-goals', overlay);
  const withNext = goals.filter((g) => g.next_action);
  if (!withNext.length) gbox.appendChild(el(`<p class="muted" style="font-size:13px">No goals with a next step yet.</p>`));
  withNext.forEach((g) => {
    const row = el(`<div class="rv-goal"><div><b>${esc(g.name)}</b><br><small class="muted">${esc(g.next_action.title)}</small></div><button class="chip-btn" data-pull="${g.next_action.id}">Today</button></div>`);
    row.querySelector('[data-pull]').addEventListener('click', async (e) => { await api('PATCH', '/tasks/' + e.target.dataset.pull, { my_day_date: todayStr() }); e.target.textContent = '✓'; e.target.classList.add('on'); });
    gbox.appendChild(row);
  });
  $('#rv-x').addEventListener('click', () => overlay.classList.add('hidden'));
  $('#rv-today')?.addEventListener('click', async (e) => { await api('POST', '/tasks/rollover', { to: todayStr() }); e.target.textContent = 'Pulled in ✓'; });
  $('#rv-next')?.addEventListener('click', async (e) => { for (const t of openOverdue) await api('PATCH', '/tasks/' + t.id, { due_at: ymd(nextWeek), has_time: 0 }); e.target.textContent = 'Moved ✓'; });
  $('#rv-save').addEventListener('click', async () => {
    await api('PATCH', '/settings', { review_note: $('#rv-note').value, review_at: new Date().toISOString() });
    overlay.classList.add('hidden'); toast('Nice reflection. See you next week 🌱'); refreshMeta().then(render);
  });
}

// ---------------------------------------------------------------- calendar
async function renderCalendar() {
  $('#title').textContent = 'Calendar';
  const v = $('#view'); v.innerHTML = '';
  const seg = el(`<div class="segmented">
    ${['day', 'week', 'month', 'year'].map((m) => `<button data-cal="${m}" class="${state.calMode === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
  </div>`);
  v.appendChild(seg);
  const body = el('<div id="cal-body"></div>'); v.appendChild(body);
  if (state.calMode === 'month') await calMonth(body);
  else if (state.calMode === 'year') await calYear(body);
  else if (state.calMode === 'week') await calRange(body, 7);
  else await calTimeline(body);
}

function byDate(items, key = 'due_at') { const m = {}; for (const t of items) { const k = (t[key] || '').slice(0, 10); if (!k) continue; (m[k] = m[k] || []).push(t); } return m; }
async function getEvents(from, to) { try { return await api('GET', `/calendars/events?from=${from}&to=${to}`); } catch { return []; } }
function eventChip(ev) {
  const time = ev.all_day ? 'all day' : fmt12(ev.start.split('T')[1] || '');
  return `<div class="cal-event" style="border-color:${esc(ev.color || 'var(--ink-3)')}"><i style="background:${esc(ev.color || 'var(--ink-3)')}"></i>${time ? `<b>${esc(time)}</b> ` : ''}${esc(ev.title)}</div>`;
}

async function calMonth(body) {
  const d = state.calDate; const y = d.getFullYear(), mo = d.getMonth();
  const first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - first.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 41);
  const [tasks, events] = await Promise.all([api('GET', `/tasks?from=${ymd(start)}&to=${ymd(end)}`), getEvents(ymd(start), ymd(end))]);
  const map = byDate(tasks); const emap = byDate(events, 'start');
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-mo="-1">‹</button>
    <span class="cal-title">${MONTHS[mo]} ${y}</span><button class="navb" data-mo="1">›</button></div>`));
  const grid = el('<div class="month-grid"></div>');
  DOW.forEach((w) => grid.appendChild(el(`<div class="dow">${w[0]}</div>`)));
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start); cur.setDate(start.getDate() + i);
    const k = ymd(cur); const items = map[k] || []; const evs = emap[k] || [];
    const undone = items.filter((t) => !t.done).length;
    const cls = [cur.getMonth() !== mo ? 'other' : '', k === todayStr() ? 'today' : '', k === state.calSel ? 'sel' : ''].join(' ');
    const dots = (items.length || evs.length) ? `<div class="day-dots">${items.slice(0, 3).map(() => `<i class="${undone ? '' : 'all-done'}"></i>`).join('')}${evs.slice(0, 2).map((e) => `<i style="background:${esc(e.color || 'var(--ink-3)')}"></i>`).join('')}</div>` : '';
    grid.appendChild(el(`<button class="day-cell ${cls}" data-day="${k}">${cur.getDate()}${dots}</button>`));
  }
  body.appendChild(grid);
  const sel = el('<div id="cal-sel"></div>'); body.appendChild(sel);
  renderDayList(sel, map[state.calSel] || [], state.calSel, false, emap[state.calSel] || []);
}

async function calYear(body) {
  const y = state.calDate.getFullYear();
  const tasks = await api('GET', `/tasks?from=${y}-01-01&to=${y}-12-31`);
  const counts = Array(12).fill(0), doneC = Array(12).fill(0);
  tasks.forEach((t) => { const m = Number(t.due_at.slice(5, 7)) - 1; counts[m]++; if (t.done) doneC[m]++; });
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-yr="-1">‹</button>
    <span class="cal-title">${y}</span><button class="navb" data-yr="1">›</button></div>`));
  const grid = el('<div class="year-grid"></div>');
  MONTHS.forEach((name, i) => grid.appendChild(el(`<button class="year-month" data-ym="${i}">
    <div class="ym-name">${name.slice(0, 3)}</div><div class="ym-count">${counts[i] || '·'}</div>
    <div class="ym-sub">${counts[i] ? doneC[i] + ' done' : 'clear'}</div></button>`)));
  body.appendChild(grid);
}

async function calRange(body, days) {
  const base = parseYmd(state.calSel);
  const weekStart = state.settings.week_start || 0;
  let start = new Date(base);
  if (days === 7) start.setDate(base.getDate() - ((base.getDay() - weekStart + 7) % 7));
  const end = new Date(start); end.setDate(start.getDate() + days - 1);
  const [tasks, events] = await Promise.all([api('GET', `/tasks?from=${ymd(start)}&to=${ymd(end)}`), getEvents(ymd(start), ymd(end))]);
  const map = byDate(tasks); const emap = byDate(events, 'start');
  const title = `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-shift="${-days}">‹</button>
    <span class="cal-title">${title}</span><button class="navb" data-shift="${days}">›</button></div>`));
  for (let i = 0; i < days; i++) {
    const cur = new Date(start); cur.setDate(start.getDate() + i);
    const k = ymd(cur);
    const wrap = el('<div></div>');
    wrap.appendChild(el(`<div class="day-heading"><span>${cur.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${k === todayStr() ? ' · Today' : ''}</span></div>`));
    renderDayList(wrap, map[k] || [], k, true, emap[k] || []);
    body.appendChild(wrap);
  }
}

function renderDayList(container, items, dayKey, inline, events = []) {
  if (!inline) container.appendChild(el(`<div class="day-heading"><span>${parseYmd(dayKey).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="dh-count">${(items.length + events.length) || 'nothing'}</span></div>`));
  events.forEach((e) => container.appendChild(el(eventChip(e))));
  if (!items.length && !events.length) { if (inline) container.appendChild(el(`<div style="color:var(--ink-3);font-size:13px;padding:2px 2px 10px">—</div>`)); return; }
  items.forEach((t) => container.appendChild(taskCard(t)));
}

// ---- Day timeline: drag unscheduled tasks onto an hourly grid (time-blocking)
const TL_START = 6, TL_END = 23, TL_HOURH = 54;
async function calTimeline(body) {
  const day = state.calSel;
  const [tasks, events] = await Promise.all([api('GET', `/tasks?from=${day}&to=${day}`), getEvents(day, day)]);
  const d = parseYmd(day);
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-shift="-1">‹</button>
    <span class="cal-title">${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}${day === todayStr() ? ' · Today' : ''}</span>
    <button class="navb" data-shift="1">›</button></div>`));

  const untimed = tasks.filter((t) => !t.has_time && !t.done);
  const tray = el(`<div class="tl-tray"><div class="tl-tray-label">Unscheduled — drag onto a time ↓</div><div class="tl-chips" id="tl-tray"></div></div>`);
  if (!untimed.length) $('.tl-tray-label', tray).textContent = 'Everything today has a time. ✨';
  untimed.forEach((t) => { const c = el(`<div class="tl-chip" data-tid="${t.id}">${esc(t.title)}${t.estimate_min ? ` · ${t.estimate_min}m` : ''}</div>`); $('#tl-tray', tray).appendChild(c); dragToSchedule(c, t); });
  body.appendChild(tray);

  const allDayEvents = events.filter((e) => e.all_day);
  if (allDayEvents.length) { const s = el('<div class="tl-allday"></div>'); allDayEvents.forEach((e) => s.appendChild(el(eventChip(e)))); body.appendChild(s); }

  const grid = el(`<div class="tl-grid" id="tl-grid"></div>`);
  for (let h = TL_START; h <= TL_END; h++) {
    grid.appendChild(el(`<div class="tl-hour" style="height:${TL_HOURH}px"><span class="tl-hlabel">${fmt12(pad(h) + ':00')}</span></div>`));
  }
  // now-line
  if (day === todayStr()) {
    const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() >= TL_START && now.getHours() <= TL_END) grid.appendChild(el(`<div class="tl-now" style="top:${((mins - TL_START * 60) / 60) * TL_HOURH}px"></div>`));
  }
  const place = (top, height, cls, html, node) => { const b = node || el(`<div>${html}</div>`); b.className = cls; b.style.top = top + 'px'; b.style.height = Math.max(height, 26) + 'px'; grid.appendChild(b); return b; };
  const topFor = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return ((h - TL_START) * 60 + m) / 60 * TL_HOURH; };

  events.filter((e) => !e.all_day).forEach((e) => {
    const t = e.start.split('T')[1]; if (!t) return;
    const dur = e.end ? (new Date(e.end) - new Date(e.start)) / 60000 : 45;
    place(topFor(t), dur / 60 * TL_HOURH, 'tl-block tl-event', `<b>${esc(fmt12(t))}</b> ${esc(e.title)}`).style.setProperty('--evc', e.color || 'var(--ink-3)');
  });
  tasks.filter((t) => t.has_time && !t.done).forEach((t) => {
    const time = t.due_at.split('T')[1];
    const block = place(topFor(time), (t.estimate_min || 45) / 60 * TL_HOURH, 'tl-block tl-task', `<b>${esc(fmt12(time))}</b> ${esc(t.title)}`);
    dragToSchedule(block, t);
  });
  body.appendChild(grid);
}

function dragToSchedule(elem, task) {
  let sx = 0, sy = 0, moved = false, ghost = null, pid = null;
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 6) { moved = true; ghost = elem.cloneNode(true); ghost.classList.add('tl-ghost'); ghost.style.width = elem.offsetWidth + 'px'; document.body.appendChild(ghost); elem.style.opacity = '.3'; }
    if (moved && ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
  };
  const up = async (ev) => {
    elem.removeEventListener('pointermove', move); elem.removeEventListener('pointerup', up);
    try { elem.releasePointerCapture(pid); } catch {}
    elem.style.opacity = ''; if (ghost) { ghost.remove(); ghost = null; }
    const grid = document.getElementById('tl-grid');
    if (moved && grid) {
      const r = grid.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 6 && ev.clientY <= r.bottom + 6) {
        const mins = Math.min(TL_END * 60 + 45, Math.max(TL_START * 60, Math.round(((ev.clientY - r.top) / TL_HOURH * 60 + TL_START * 60) / 15) * 15));
        const h = Math.floor(mins / 60), m = mins % 60;
        await api('PATCH', '/tasks/' + task.id, { due_at: `${state.calSel}T${pad(h)}:${pad(m)}`, has_time: 1 });
        toast('Scheduled for ' + fmt12(`${pad(h)}:${pad(m)}`)); render();
        return;
      }
    }
    if (!moved) openTaskEditorById(task.id);
  };
  elem.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    sx = e.clientX; sy = e.clientY; moved = false; pid = e.pointerId;
    try { elem.setPointerCapture(pid); } catch {}
    elem.addEventListener('pointermove', move); elem.addEventListener('pointerup', up);
  });
}

// ---------------------------------------------------------------- quick capture
const LIST_RE = /#([\p{L}\d_-]+)/u;
const WEEKDAY_RE = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';

// Natural-language capture. Structured tokens (#list, !priority, ~estimate,
// repeat) are pulled out by hand; the date/time is read by chrono-node (the
// vendored browser bundle), with a small regex fallback if it isn't loaded so
// capture still works offline before the bundle caches.
function parseQuick(text) {
  let title = text, priority = 0, listId = null, repeat = 'none', estimate = null;

  const lm = title.match(LIST_RE);
  if (lm) { const found = state.lists.find((l) => l.name.toLowerCase().replace(/\s/g, '') === lm[1].toLowerCase()); if (found) { listId = found.id; title = title.replace(lm[0], ''); } }
  const pm = title.match(/!(high|h|med|m|low|l|2|1)\b/i);
  if (pm) { const p = pm[1].toLowerCase(); priority = /h|2/.test(p) ? 2 : /l/.test(p) ? 0 : 1; title = title.replace(pm[0], ''); }
  const em = title.match(/~\s*(\d+)\s*(m|min|h|hr)?/i);
  if (em) { estimate = /h/i.test(em[2] || '') ? Number(em[1]) * 60 : Number(em[1]); title = title.replace(em[0], ''); }

  // Repeat. "every <weekday>" sets a weekly repeat but leaves the weekday in
  // place so chrono still schedules the first occurrence (e.g. next Friday).
  const rWeekday = title.match(new RegExp(`\\bevery\\s+(?=(?:${WEEKDAY_RE})\\b)`, 'i'));
  if (rWeekday) { repeat = 'weekly'; title = title.replace(rWeekday[0], ''); }
  else {
    const rm = title.match(/\bevery\s+(day|week|month|year|morning)\b/i) || title.match(/\b(daily|weekly|monthly|annually|yearly)\b/i);
    if (rm) { const w = (rm[1] || '').toLowerCase(); repeat = /day|dail|morning/.test(w) ? 'daily' : /week/.test(w) ? 'weekly' : /month/.test(w) ? 'monthly' : 'annual'; title = title.replace(rm[0], ''); }
  }

  const parsed = parseDateNL(title);
  title = parsed.title.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  return { title, due_at: parsed.due_at, has_time: parsed.has_time, priority, list_id: listId, repeat, estimate_min: estimate };
}

// Date/time extraction. Prefers chrono-node; strips the recognised phrase from
// the title and returns Tempo's wall-clock strings.
function parseDateNL(title) {
  if (window.TempoChrono) {
    try {
      const results = window.TempoChrono.parse(title, new Date(), { forwardDate: true });
      if (results.length) {
        const r = results[0];
        const d = r.start.date();
        const hasTime = r.start.isCertain('hour');
        const due = hasTime ? `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ymd(d);
        const stripped = (title.slice(0, r.index) + title.slice(r.index + r.text.length)).replace(/\b(on|at|by|due)\s*$/i, '');
        return { title: stripped, due_at: due, has_time: hasTime ? 1 : 0 };
      }
    } catch { /* fall through to regex */ }
  }
  return parseDateFallback(title);
}

// Offline fallback: the original hand-rolled parser. Narrow but dependency-free.
function parseDateFallback(title) {
  const now = new Date();
  let base = null, hasTime = false;
  if (/\btoday\b/i.test(title)) { base = new Date(now); title = title.replace(/\btoday\b/i, ''); }
  else if (/\btonight\b/i.test(title)) { base = new Date(now); hasTime = true; base.setHours(20, 0); title = title.replace(/\btonight\b/i, ''); }
  else if (/\b(tomorrow|tmr|tmrw)\b/i.test(title)) { base = new Date(now); base.setDate(now.getDate() + 1); title = title.replace(/\b(tomorrow|tmr|tmrw)\b/i, ''); }
  else if (/\bnext week\b/i.test(title)) { base = new Date(now); base.setDate(now.getDate() + 7); title = title.replace(/\bnext week\b/i, ''); }
  else {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const wd = title.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    if (wd) { const target = days.indexOf(wd[1].toLowerCase().slice(0, 3)); base = new Date(now); let add = (target - now.getDay() + 7) % 7; if (add === 0) add = 7; base.setDate(now.getDate() + add); title = title.replace(wd[0], ''); }
  }
  const tm = title.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || title.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm && base) {
    let h = Number(tm[1]); const min = Number(tm[2] || 0); const ap = (tm[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    base.setHours(h, min); hasTime = true; title = title.replace(tm[0], '');
  }
  const due = base ? (hasTime ? `${ymd(base)}T${pad(base.getHours())}:${pad(base.getMinutes())}` : ymd(base)) : null;
  return { title, due_at: due, has_time: hasTime ? 1 : 0 };
}

// Date detection that also reports the matched span, so a Quick-Add chip can be
// removed and its words returned to the plain title. chrono gives us index/text;
// the offline fallback reports only that a date was found.
function detectDate(text) {
  if (window.TempoChrono) {
    try {
      const r = window.TempoChrono.parse(text, new Date(), { forwardDate: true })[0];
      if (r) {
        const d = r.start.date(); const hasTime = r.start.isCertain('hour');
        return { due_at: hasTime ? `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ymd(d), has_time: hasTime ? 1 : 0, text: r.text, index: r.index };
      }
      return null;
    } catch { /* fall through */ }
  }
  const fb = parseDateFallback(text);
  return fb.due_at ? { due_at: fb.due_at, has_time: fb.has_time, text: null, index: -1, strippedTitle: fb.title } : null;
}

// Parse Quick-Add text into removable tokens. Like parseQuick, but each detected
// thing becomes a chip descriptor. A token whose key is in `dismissed` is left in
// the title as literal text (the user vetoed that parse). Returns the cleaned
// title, the token list, and the resolved field values.
function detectCaptureTokens(text, dismissed) {
  let working = ` ${text} `;
  const tokens = [];
  const parsed = { due_at: null, has_time: 0, priority: 0, list_id: null, repeat: 'none', estimate_min: null };
  const take = (m) => { working = working.replace(m, ' '); };

  const lm = working.match(LIST_RE);
  if (lm) {
    const found = state.lists.find((l) => l.name.toLowerCase().replace(/\s/g, '') === lm[1].toLowerCase());
    if (found) { const key = 'list:' + lm[0].toLowerCase(); if (!dismissed.has(key)) { parsed.list_id = found.id; tokens.push({ key, kind: 'list', label: found.name }); take(lm[0]); } }
  }
  const pm = working.match(/!(high|h|med|m|low|l|2|1)\b/i);
  if (pm) {
    const key = 'prio:' + pm[0].toLowerCase();
    if (!dismissed.has(key)) { const p = pm[1].toLowerCase(); parsed.priority = /h|2/.test(p) ? 2 : /l/.test(p) ? 0 : 1; if (parsed.priority) tokens.push({ key, kind: 'prio', label: '⚡ ' + (parsed.priority === 2 ? 'High' : 'Medium') }); take(pm[0]); }
  }
  const em = working.match(/~\s*(\d+)\s*(m|min|h|hr)?/i);
  if (em) {
    const key = 'est:' + em[0].toLowerCase().replace(/\s/g, '');
    if (!dismissed.has(key)) { parsed.estimate_min = /h/i.test(em[2] || '') ? Number(em[1]) * 60 : Number(em[1]); tokens.push({ key, kind: 'est', label: '⏱ ' + (parsed.estimate_min < 60 ? parsed.estimate_min + 'm' : (parsed.estimate_min / 60) + 'h') }); take(em[0]); }
  }
  const rWeekday = working.match(new RegExp(`\\bevery\\s+(?=(?:${WEEKDAY_RE})\\b)`, 'i'));
  if (rWeekday) { const key = 'repeat:wd'; if (!dismissed.has(key)) { parsed.repeat = 'weekly'; tokens.push({ key, kind: 'repeat', label: '🔁 Weekly' }); take(rWeekday[0]); } }
  else {
    const rm = working.match(/\bevery\s+(day|week|month|year|morning)\b/i) || working.match(/\b(daily|weekly|monthly|annually|yearly)\b/i);
    if (rm) { const key = 'repeat:' + rm[0].toLowerCase(); if (!dismissed.has(key)) { const w = (rm[1] || '').toLowerCase(); parsed.repeat = /day|dail|morning/.test(w) ? 'daily' : /week/.test(w) ? 'weekly' : /month/.test(w) ? 'monthly' : 'annual'; tokens.push({ key, kind: 'repeat', label: '🔁 ' + REPEAT_LABEL[parsed.repeat] }); take(rm[0]); } }
  }
  const dr = detectDate(working);
  if (dr) {
    const key = 'date:' + (dr.text ? dr.text.toLowerCase().trim() : 'set');
    if (!dismissed.has(key)) {
      parsed.due_at = dr.due_at; parsed.has_time = dr.has_time;
      tokens.push({ key, kind: 'date', label: '📅 ' + dueLabel({ due_at: dr.due_at, has_time: dr.has_time }) });
      working = dr.text ? working.slice(0, dr.index) + working.slice(dr.index + dr.text.length) : ` ${dr.strippedTitle} `;
    }
  }
  const title = working.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  return { title, tokens, parsed };
}

// Which "When" segment a date string maps to (else null for a specific date).
function whenSegForDate(dateStr) {
  const d = (dateStr || '').slice(0, 10);
  if (d === todayStr()) return 'today';
  if (d === ymd(new Date(Date.now() + 86400000))) return 'tomorrow';
  return null;
}

function openCapture(opts = {}) {
  const body = $('#sheet-body');
  // Layout, top→bottom: title · input · removable parse chips · helper · When ·
  // List · Add-step · More options · full-width Add. "When" (destination) and
  // "List" carry NO emoji; only the parse chips do (📅/⚡/⏱/🔁).
  body.innerHTML = `<h2 class="cap-h">I want to…</h2>
    <input class="capture-input" id="cap" placeholder="e.g. Call dentist tomorrow 3pm" autocomplete="off" autocapitalize="sentences" />
    <div class="cap-chips" id="cap-chips"></div>
    <div class="cap-help">Just type it out — I'll spot the date, list and priority for you.</div>
    <div class="cap-field">
      <div class="cap-label">When</div>
      <div class="seg" id="cap-when" role="group" aria-label="When">
        <button type="button" class="seg-btn" data-when="today">Today</button>
        <button type="button" class="seg-btn" data-when="tomorrow">Tomorrow</button>
        <button type="button" class="seg-btn" data-when="inbox">Inbox</button>
      </div>
    </div>
    <div class="cap-field">
      <div class="cap-label">List</div>
      <div class="pills" id="cap-lists" role="group" aria-label="List">
        ${state.lists.map((l) => `<button type="button" class="pill" data-list="${l.id}" style="--dot:${esc(l.color)}"><span class="pill-dot"></span>${esc(l.name)}</button>`).join('')}
        <button type="button" class="pill pill-add" id="cap-list-add" aria-label="New list">+</button>
      </div>
    </div>
    <button type="button" class="cap-steps-toggle" id="cap-steps-toggle">＋ Add step</button>
    <div class="cap-steps hidden" id="cap-steps"></div>
    <button type="button" class="cap-more" id="cap-more">More options</button>
    <div class="cap-add-wrap"><button type="button" class="btn-primary cap-add-full" id="cap-add">Add</button></div>`;
  openSheet();
  const input = $('#cap');
  // manualWhen: user tapped a When segment; forceList: a list pill ('none' = the
  // user explicitly cleared it); dismissed: parse tokens the user removed.
  let manualWhen = null, forceList = opts.list ?? null, presetDue = null;
  const dismissed = new Set();
  let steps = [], stepsShown = false, lastTokens = [];
  if (opts.myDay) manualWhen = 'today';
  else if (opts.due) { const seg = whenSegForDate(opts.due); if (seg) manualWhen = seg; else presetDue = opts.due; }

  // Re-derive everything from the current text + user choices.
  function recompute() {
    const { tokens, parsed } = detectCaptureTokens(input.value, dismissed);
    lastTokens = tokens;
    // A live typed date always wins over a previous When tap.
    if (tokens.some((t) => t.kind === 'date')) manualWhen = null;
    // Parse chips (the list token is shown via the List pills instead).
    $('#cap-chips').innerHTML = tokens.filter((t) => t.kind !== 'list')
      .map((t) => `<button type="button" class="cap-chip" data-chipkey="${esc(t.key)}">${esc(t.label)}<span class="cap-chip-x" aria-hidden="true">✕</span></button>`).join('');
    // When highlight: manual tap, else the typed/preset date, else default Today.
    let sel = manualWhen || (parsed.due_at ? whenSegForDate(parsed.due_at) : (presetDue ? whenSegForDate(presetDue) : 'today'));
    $('#cap-when').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.when === sel));
    // List highlight.
    const li = forceList === 'none' ? null : (forceList ?? parsed.list_id);
    $('#cap-lists').querySelectorAll('[data-list]').forEach((b) => b.classList.toggle('on', Number(b.dataset.list) === li));
  }

  input.addEventListener('input', recompute);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  // Remove a parse chip → its words stay in the plain title, unparsed.
  $('#cap-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-chipkey]'); if (!b) return; dismissed.add(b.dataset.chipkey); recompute(); });
  // When: single-select. Tapping overrides any typed date (dismiss its chip).
  $('#cap-when').addEventListener('click', (e) => {
    const b = e.target.closest('[data-when]'); if (!b) return;
    manualWhen = b.dataset.when; presetDue = null;
    const dt = lastTokens.find((t) => t.kind === 'date'); if (dt) dismissed.add(dt.key);
    recompute();
  });
  // List: single-select pills; tapping the selected one clears it.
  $('#cap-lists').addEventListener('click', (e) => {
    const b = e.target.closest('[data-list]'); if (!b) return;
    const id = Number(b.dataset.list); forceList = (forceList === id) ? 'none' : id; recompute();
  });
  // "+" creates a new list (the only additive action here).
  $('#cap-list-add').addEventListener('click', () => openListEditor());

  // Inline steps: a growing list of subtask inputs. Enter on the last blank row
  // adds another; empties are dropped on save.
  function drawSteps(focusLast) {
    const box = $('#cap-steps');
    box.innerHTML = '';
    steps.forEach((s, i) => {
      const row = el(`<div class="cap-step"><span class="se-dot"></span><input value="${esc(s)}" placeholder="Step ${i + 1}" /><button class="se-del" aria-label="remove">×</button></div>`);
      const inp = row.querySelector('input');
      inp.addEventListener('input', (e) => { steps[i] = e.target.value; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === steps.length - 1 && e.target.value.trim()) { steps.push(''); drawSteps(true); } } });
      row.querySelector('.se-del').addEventListener('click', () => { steps.splice(i, 1); if (!steps.length) steps.push(''); drawSteps(); });
      box.appendChild(row);
    });
    if (focusLast) box.querySelector('.cap-step:last-child input')?.focus();
  }
  $('#cap-steps-toggle').addEventListener('click', () => {
    stepsShown = !stepsShown;
    $('#cap-steps').classList.toggle('hidden', !stepsShown);
    $('#cap-steps-toggle').textContent = stepsShown ? '− Hide steps' : '＋ Add step';
    if (stepsShown) { if (!steps.length) steps.push(''); drawSteps(true); }
  });

  // Resolve the typed text + choices into a task payload.
  const buildPayload = () => {
    const { title, parsed } = detectCaptureTokens(input.value, dismissed);
    const p = { title, due_at: parsed.due_at, has_time: parsed.has_time, priority: parsed.priority, repeat: parsed.repeat, estimate_min: parsed.estimate_min, list_id: null, my_day_date: null };
    p.list_id = (forceList === 'none' ? null : (forceList ?? parsed.list_id)) || null;
    if (parsed.due_at) { /* typed date wins; keep p.due_at/has_time */ }
    else if (manualWhen === 'inbox') { /* undated */ }
    else if (manualWhen === 'tomorrow') { p.due_at = ymd(new Date(Date.now() + 86400000)); p.has_time = 0; }
    else if (manualWhen === 'today') { p.my_day_date = todayStr(); }
    else if (presetDue) { if (presetDue.slice(0, 10) === todayStr()) p.my_day_date = todayStr(); else { p.due_at = presetDue; p.has_time = 0; } }
    else { p.my_day_date = todayStr(); } // default = Today
    return p;
  };
  // Hand off everything typed so far to the full editor — no data lost.
  $('#cap-more').addEventListener('click', () => {
    const p = buildPayload();
    if (!p.title) { toast('Give it a title first'); return; }
    openTaskEditor(null, { ...p, subtasks: steps.map((t) => t.trim()).filter(Boolean).map((t) => ({ title: t })) });
  });
  async function submit() {
    const p = buildPayload();
    if (!p.title) { toast('Give it a title'); return; }
    const created = await api('POST', '/tasks', p);
    const clean = steps.map((t) => t.trim()).filter(Boolean);
    for (const t of clean) await api('POST', '/tasks', { title: t, parent_id: created.id });
    closeSheet(); toast(clean.length ? `Added with ${clean.length} step${clean.length > 1 ? 's' : ''} ✓` : 'Added ✓'); refreshMeta().then(render);
  }
  $('#cap-add').addEventListener('click', submit);

  setTimeout(() => { input.focus(); recompute(); }, 60);
}

// ---------------------------------------------------------------- task editor
// Any.do-inspired: every element is a separated chip that expands inline.
const REPEAT_LABEL = { none: 'Repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annual: 'Yearly' };
function openTaskEditor(task, defaults = {}) {
  const draft = task
    ? { ...task }
    : { title: defaults.title || '', notes: defaults.notes || '', priority: defaults.priority || 0,
        repeat: defaults.repeat || 'none', energy: defaults.energy ?? null, estimate_min: defaults.estimate_min ?? null,
        list_id: defaults.list_id ?? null, goal_id: defaults.goal_id ?? null,
        due_at: defaults.due_at ?? null, has_time: defaults.has_time ?? 0, my_day_date: defaults.my_day_date ?? null };
  let subs = (task?.subtasks || defaults.subtasks || []).map((s) => ({ id: s.id, title: s.title, done: s.done }));
  let open = null; // currently expanded chip key
  // >=768px the editor lives in the side detail panel (slide-over / 3rd column);
  // on phones it uses the bottom sheet exactly as before.
  const useDetail = window.matchMedia('(min-width: 768px)').matches;
  if (useDetail) closeSheet(); // dismiss any open modal (e.g. quick-add) first
  const body = useDetail ? $('#detail-body') : $('#sheet-body');
  const openHost = useDetail ? openDetail : openSheet;
  const closeHost = useDetail ? closeDetail : closeSheet;
  const list = () => listById(draft.list_id);
  const goal = () => state.goals.find((g) => g.id == draft.goal_id);

  body.innerHTML = `
    <div class="te-head">
      <span class="te-crumb">🔒 ${list() ? esc((list().emoji || '') + ' ' + list().name) : 'No list'}</span>
      <button class="te-save" id="te-save">${task ? 'Save' : 'Add'}</button>
    </div>
    <div class="te-title-row">
      <input class="te-title" id="te-title" value="${esc(draft.title || '')}" placeholder="What needs doing?" />
      ${state.aiEnabled ? '<button class="te-ai" id="te-ai-title" title="Improve wording">✨</button>' : ''}
    </div>
    <div class="te-chips" id="te-chips"></div>
    <div class="te-expand" id="te-expand"></div>
    <div class="te-section">SUBTASKS <span id="te-subcount"></span>
      ${state.aiEnabled ? '<button class="te-ai-steps" id="te-ai-steps">✨ Suggest steps</button>' : ''}</div>
    <div class="sub-editor" id="te-subs"></div>
    <div class="te-section">NOTES</div>
    <textarea class="te-notes" id="te-notes" placeholder="Add your notes…">${esc(draft.notes || '')}</textarea>
    <button class="te-gcal" id="te-gcal">📅 Add to Google Calendar</button>
    ${task ? '<button class="te-delete" id="te-del">Delete task</button>' : ''}`;
  openHost();

  // Google Calendar "add event" link — pure client, needs no server setup.
  const syncGcalBtn = () => { const b = $('#te-gcal'); if (b) b.classList.toggle('hidden', !draft.due_at); };
  syncGcalBtn();
  $('#te-gcal')?.addEventListener('click', () => {
    if (!draft.due_at) { toast('Give it a date first'); return; }
    window.open(gcalUrl({ title: $('#te-title').value.trim() || draft.title, due_at: draft.due_at, has_time: draft.has_time, notes: $('#te-notes').value.trim(), estimate_min: draft.estimate_min }), '_blank', 'noopener');
  });

  // ✨ Improve wording
  $('#te-ai-title')?.addEventListener('click', async () => {
    const t = $('#te-title').value.trim(); if (!t) { toast('Type a title first'); return; }
    const btn = $('#te-ai-title'); btn.disabled = true; btn.classList.add('busy');
    try { const r = await api('POST', '/ai/rewrite', { title: t }); $('#te-title').value = r.title; draft.title = r.title; toast('Reworded ✨'); }
    catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.classList.remove('busy'); }
  });

  // ✨ Suggest steps — appends AI subtasks to whatever's there.
  $('#te-ai-steps')?.addEventListener('click', async () => {
    const t = $('#te-title').value.trim(); if (!t) { toast('Type a title first'); return; }
    const btn = $('#te-ai-steps'); btn.disabled = true; btn.textContent = '✨ Thinking…';
    try {
      const r = await api('POST', '/ai/breakdown', { title: t, notes: $('#te-notes').value.trim() });
      const existing = new Set(subs.map((s) => s.title.trim().toLowerCase()));
      let added = 0;
      for (const s of r.subtasks || []) { if (!existing.has(s.toLowerCase())) { subs.push({ title: s }); added++; } }
      drawSubs(); toast(added ? `Added ${added} step${added > 1 ? 's' : ''} ✨` : 'No new steps to add');
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = '✨ Suggest steps'; }
  });

  const humanDue = () => draft.due_at ? dueLabel({ due_at: draft.due_at, has_time: draft.has_time }) : null;
  const chipDefs = () => [
    ...(task ? [{ key: 'complete', label: (draft.done ? '↩︎ Mark not done' : '✓ Mark complete'), on: !!draft.done }] : []),
    { key: 'myday', label: draft.my_day_date === todayStr() ? '◎ In My Day' : '◎ Add to My Day', on: draft.my_day_date === todayStr() },
    { key: 'reminder', label: humanDue() ? '🕐 ' + humanDue() : '🕐 Reminder', on: !!draft.due_at },
    { key: 'repeat', label: '🔁 ' + REPEAT_LABEL[draft.repeat], on: draft.repeat !== 'none' },
    { key: 'list', html: list() ? `<span class="te-dot" style="--dot:${esc(list().color)}"></span>${esc(list().name)}` : `<span class="te-dot te-dot-empty"></span>List`, on: !!draft.list_id },
    { key: 'priority', label: draft.priority ? '❗ ' + (draft.priority === 2 ? 'High' : 'Medium') : '➖ Priority', on: !!draft.priority },
    { key: 'energy', label: draft.energy ? ENERGY[draft.energy] : '⚡ Energy', on: !!draft.energy },
    { key: 'time', label: draft.estimate_min ? '⏱ ' + (draft.estimate_min < 60 ? draft.estimate_min + 'm' : draft.estimate_min / 60 + 'h') : '⏱ Time', on: !!draft.estimate_min },
    { key: 'goal', label: goal() ? '◈ ' + goal().name : '◈ Goal', on: !!draft.goal_id },
  ];

  function paintChips() {
    $('#te-chips').innerHTML = chipDefs().map((c) => `<button class="te-chip ${c.on ? 'on' : ''} ${open === c.key ? 'active' : ''}" data-chip="${c.key}">${c.html || esc(c.label)}</button>`).join('');
    syncGcalBtn(); // reveal/hide the Google Calendar link as the date changes
  }

  const optRow = (opts, current, attr) => opts.map(([n, val]) =>
    `<button class="chip-btn ${String(current) === String(val) ? 'on' : ''}" data-${attr}="${val}">${esc(n)}</button>`).join('');

  function paintExpand() {
    const box = $('#te-expand');
    if (!open) { box.innerHTML = ''; box.classList.remove('shown'); return; }
    box.classList.add('shown');
    if (open === 'reminder') {
      const d = draft.due_at ? draft.due_at.slice(0, 10) : '';
      const tm = draft.due_at && draft.has_time ? draft.due_at.split('T')[1] : '';
      box.innerHTML = `<div class="ex-label">Date & reminder time</div>
        <div class="row2"><input type="date" id="ex-date" value="${d}"><input type="time" id="ex-time" value="${tm}"></div>
        <div class="chips" style="margin-top:8px">
          <button class="chip-btn" data-quick="today">Today</button>
          <button class="chip-btn" data-quick="tomorrow">Tomorrow</button>
          ${draft.due_at ? '<button class="chip-btn" data-quick="clear">Clear</button>' : ''}</div>`;
      const apply = () => { const dd = $('#ex-date').value, tt = $('#ex-time').value; draft.due_at = dd ? (tt ? `${dd}T${tt}` : dd) : null; draft.has_time = dd && tt ? 1 : 0; paintChips(); };
      $('#ex-date').addEventListener('change', apply); $('#ex-time').addEventListener('change', apply);
      box.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
        const q = b.dataset.quick;
        if (q === 'clear') { draft.due_at = null; draft.has_time = 0; }
        else draft.due_at = q === 'today' ? todayStr() : ymd(new Date(Date.now() + 86400000));
        open = null; paintChips(); paintExpand();
      }));
    } else if (open === 'repeat') {
      box.innerHTML = `<div class="ex-label">Repeat</div><div class="chips">${optRow([['Never', 'none'], ['Daily', 'daily'], ['Weekly', 'weekly'], ['Monthly', 'monthly'], ['Yearly', 'annual']], draft.repeat, 'rep')}</div>`;
      box.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => { draft.repeat = b.dataset.rep; open = null; paintChips(); paintExpand(); }));
    } else if (open === 'list') {
      // Colored-dot pills, matching the Quick-Add list picker (no emoji).
      const opts = [`<button class="chip-btn ${!draft.list_id ? 'on' : ''}" data-lst="">None</button>`,
        ...state.lists.map((l) => `<button class="chip-btn te-list-opt ${draft.list_id === l.id ? 'on' : ''}" data-lst="${l.id}" style="--dot:${esc(l.color)}"><span class="te-dot"></span>${esc(l.name)}</button>`)];
      box.innerHTML = `<div class="ex-label">List</div><div class="chips">${opts.join('')}</div>`;
      box.querySelectorAll('[data-lst]').forEach((b) => b.addEventListener('click', () => { draft.list_id = b.dataset.lst ? Number(b.dataset.lst) : null; open = null; paintChips(); paintExpand(); }));
    } else if (open === 'priority') {
      box.innerHTML = `<div class="ex-label">Priority</div><div class="chips">${optRow([['None', 0], ['Medium', 1], ['High', 2]], draft.priority, 'pr')}</div>`;
      box.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => { draft.priority = Number(b.dataset.pr); open = null; paintChips(); paintExpand(); }));
    } else if (open === 'energy') {
      box.innerHTML = `<div class="ex-label">Energy needed</div><div class="chips">${optRow([['— none —', ''], ['⚡ Low', 'low'], ['🔋 Medium', 'med'], ['🔥 High', 'high']], draft.energy ?? '', 'en')}</div>`;
      box.querySelectorAll('[data-en]').forEach((b) => b.addEventListener('click', () => { draft.energy = b.dataset.en || null; open = null; paintChips(); paintExpand(); }));
    } else if (open === 'time') {
      box.innerHTML = `<div class="ex-label">Rough time</div><div class="chips">${optRow([['— none —', ''], ['5m', 5], ['15m', 15], ['30m', 30], ['1h', 60], ['2h', 120]], draft.estimate_min ?? '', 'es')}</div>`;
      box.querySelectorAll('[data-es]').forEach((b) => b.addEventListener('click', () => { draft.estimate_min = b.dataset.es ? Number(b.dataset.es) : null; open = null; paintChips(); paintExpand(); }));
    } else if (open === 'goal') {
      box.innerHTML = `<div class="ex-label">Goal</div><div class="chips">${optRow([['— None —', ''], ...state.goals.map((g) => [g.name, g.id])], draft.goal_id ?? '', 'gl')}</div>`;
      box.querySelectorAll('[data-gl]').forEach((b) => b.addEventListener('click', () => { draft.goal_id = b.dataset.gl ? Number(b.dataset.gl) : null; open = null; paintChips(); paintExpand(); }));
    }
  }

  $('#te-chips').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-chip]'); if (!b) return;
    const key = b.dataset.chip;
    if (key === 'complete') { await api('POST', `/tasks/${task.id}/toggle`); closeHost(); if (!draft.done) { celebrate(); toast(encourage()); } refreshMeta().then(render); return; }
    if (key === 'myday') { draft.my_day_date = draft.my_day_date === todayStr() ? null : todayStr(); open = null; paintChips(); paintExpand(); toast(draft.my_day_date ? 'Added to My Day ◎' : 'Removed from My Day'); return; }
    open = open === key ? null : key; paintChips(); paintExpand();
  });

  // Drag a subtask by its handle to reorder. Handle owns the pointer so the
  // sheet keeps scrolling normally everywhere else.
  function attachSubReorder(row, idx) {
    const handle = row.querySelector('.se-handle'); if (!handle) return;
    let dragging = false, startY = 0, targetIdx = idx;
    const onMove = (e) => {
      if (!dragging) return;
      const rows = [...$('#te-subs').querySelectorAll('.se-row:not(.se-add)')];
      const t = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
      targetIdx = t === -1 ? rows.length - 1 : t;
      row.style.transform = `translateY(${e.clientY - startY}px)`;
    };
    const onUp = (e) => {
      if (!dragging) return; dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      handle.removeEventListener('pointermove', onMove); handle.removeEventListener('pointerup', onUp);
      row.classList.remove('dragging'); row.style.transform = '';
      if (targetIdx !== idx && targetIdx >= 0) { const [m] = subs.splice(idx, 1); subs.splice(targetIdx, 0, m); }
      drawSubs();
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); dragging = true; startY = e.clientY; targetIdx = idx;
      row.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch {}
      handle.addEventListener('pointermove', onMove); handle.addEventListener('pointerup', onUp);
    });
  }

  function drawSubs() {
    const subBox = $('#te-subs');
    subBox.innerHTML = '';
    const many = subs.length > 1;
    subs.forEach((s, i) => {
      const row = el(`<div class="se-row ${s.done ? 'is-done' : ''}">
        ${many ? '<button class="se-handle" tabindex="-1" aria-label="Reorder">⠿</button>' : '<span class="se-dot"></span>'}
        <button class="se-check ${s.done ? 'done' : ''}" aria-label="Toggle step">✓</button>
        <input value="${esc(s.title)}" placeholder="Subtask ${i + 1}" />
        <button class="se-del" aria-label="remove">×</button></div>`);
      row.querySelector('input').addEventListener('input', (e) => { s.title = e.target.value; });
      row.querySelector('.se-check').addEventListener('click', () => { s.done = !s.done; drawSubs(); });
      row.querySelector('.se-del').addEventListener('click', () => { subs.splice(i, 1); drawSubs(); });
      attachSubReorder(row, i);
      subBox.appendChild(row);
    });
    const add = el(`<div class="se-row se-add"><span class="se-dot"></span><input placeholder="Add a subtask" id="te-newsub" /></div>`);
    add.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { subs.push({ title: e.target.value.trim() }); drawSubs(); $('#te-newsub')?.focus(); } });
    subBox.appendChild(add);
    $('#te-subcount').textContent = subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : '';
  }

  paintChips(); paintExpand(); drawSubs();

  $('#te-save').addEventListener('click', async () => {
    const title = $('#te-title').value.trim();
    if (!title) { toast('Give it a title'); return; }
    const payload = {
      title, notes: $('#te-notes').value.trim() || null,
      due_at: draft.due_at || null, has_time: draft.has_time ? 1 : 0,
      priority: draft.priority || 0, energy: draft.energy || null, estimate_min: draft.estimate_min || null,
      list_id: draft.list_id || null, goal_id: draft.goal_id || null, repeat: draft.repeat || 'none',
      my_day_date: draft.my_day_date || null,
    };
    let id = task?.id;
    if (task) await api('PATCH', '/tasks/' + id, payload);
    else id = (await api('POST', '/tasks', payload)).id;
    const orig = task?.subtasks || [];
    for (const o of orig) if (!subs.find((s) => s.id === o.id)) await api('DELETE', '/tasks/' + o.id);
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i]; const st = (s.title || '').trim(); if (!st) continue;
      if (s.id) {
        const o = orig.find((x) => x.id === s.id);
        const patch = {};
        if (o && o.title !== st) patch.title = st;
        if (o && o.sort !== i) patch.sort = i;               // persist reordering
        if (Object.keys(patch).length) await api('PATCH', '/tasks/' + s.id, patch);
        if (o && !!o.done !== !!s.done) await api('POST', '/tasks/' + s.id + '/toggle'); // ticked/unticked here
      } else {
        const created = await api('POST', '/tasks', { title: st, parent_id: id, sort: i });
        if (s.done && created?.id) await api('POST', '/tasks/' + created.id + '/toggle');
      }
    }
    closeHost(); toast(task ? 'Saved' : 'Added ✓'); refreshMeta().then(render);
  });
  $('#te-del')?.addEventListener('click', async () => { await api('DELETE', '/tasks/' + task.id); closeHost(); toast('Deleted'); refreshMeta().then(render); });
}

// ---------------------------------------------------------------- goal & list editors
function openGoalEditor(goal) {
  const g = goal || { color: '#5C6470' };
  const colors = ['#5C6470', '#2F6B55', '#C05E3B', '#B98207', '#6366F1'];
  const body = $('#sheet-body');
  body.innerHTML = `<h2>${goal ? 'Edit goal' : 'New goal'}</h2>
    <div class="field"><label>Goal</label><input type="text" id="g-name" value="${esc(g.name || '')}" placeholder="e.g. Learn Spanish" /></div>
    <div class="field"><label>Why / notes</label><textarea id="g-notes" placeholder="What does done look like?">${esc(g.notes || '')}</textarea></div>
    <div class="field"><label>Target date (optional)</label><input type="date" id="g-date" value="${g.target_date || ''}" /></div>
    <div class="field"><label>Colour</label><div class="chips" id="g-color">
      ${colors.map((c) => `<button class="chip-btn ${g.color === c ? 'on' : ''}" data-color="${c}" style="background:${c};color:#fff;border-color:${c}">●</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn-primary" id="g-save">${goal ? 'Save' : 'Add goal'}</button>
      ${goal ? '<button class="btn-ghost btn-danger" id="g-del">Delete</button>' : ''}</div>`;
  openSheet();
  let color = g.color;
  $('#g-color').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.color; $('#g-color').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#g-save').addEventListener('click', async () => {
    const name = $('#g-name').value.trim(); if (!name) { toast('Name it'); return; }
    const payload = { name, notes: $('#g-notes').value.trim() || null, target_date: $('#g-date').value || null, color };
    if (goal) await api('PATCH', '/goals/' + goal.id, payload); else await api('POST', '/goals', payload);
    closeSheet(); toast(goal ? 'Saved' : 'Goal added'); if (goal) state.sub = null; refreshMeta().then(render);
  });
  $('#g-del')?.addEventListener('click', async () => { await api('DELETE', '/goals/' + goal.id); closeSheet(); state.sub = null; toast('Deleted'); refreshMeta().then(render); });
}

function openListEditor(list) {
  const l = list || { color: '#5C6470', emoji: '' };
  const body = $('#sheet-body');
  // Lists identify by colour now (no emoji), consistent with the dot everywhere.
  body.innerHTML = `<h2>${list ? 'Edit list' : 'New list'}</h2>
    <div class="field"><label>Name</label><input type="text" id="l-name" value="${esc(l.name || '')}" placeholder="e.g. Errands" /></div>
    <div class="field"><label>Colour</label><div class="chips" id="l-color">
      ${['#5C6470', '#2F6B55', '#C05E3B', '#B98207', '#6366F1', '#C4453C'].map((c) => `<button class="chip-btn ${l.color === c ? 'on' : ''}" data-color="${c}" style="background:${c};color:#fff;border-color:${c}">●</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn-primary" id="l-save">${list ? 'Save' : 'Add list'}</button>
      ${list ? '<button class="btn-ghost btn-danger" id="l-del">Delete</button>' : ''}</div>`;
  openSheet();
  let color = l.color;
  $('#l-color').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.color; $('#l-color').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#l-save').addEventListener('click', async () => {
    const name = $('#l-name').value.trim(); if (!name) { toast('Name it'); return; }
    const payload = { name, color }; // emoji retired; existing values left untouched
    if (list) await api('PATCH', '/lists/' + list.id, payload); else await api('POST', '/lists', payload);
    closeSheet(); toast(list ? 'Saved' : 'List added'); if (list) state.sub = null; refreshMeta().then(render);
  });
  $('#l-del')?.addEventListener('click', async () => { await api('DELETE', '/lists/' + list.id); closeSheet(); state.sub = null; toast('Deleted'); refreshMeta().then(render); });
}

// ---------------------------------------------------------------- focus mode
let fxTimer = null;
function openFocus(task, minutes) {
  const overlay = $('#focus');
  let total = minutes * 60, left = total, paused = false;
  const size = 220, stroke = 12, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  overlay.innerHTML = `<button class="fx-close" aria-label="Close">×</button>
    <div class="fx-title">${esc(task.title)}</div>
    <div class="fx-timer">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
        <circle id="fx-ring" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <div class="fx-num" id="fx-num"></div>
    </div>
    ${task.subtasks?.length ? `<div class="fx-first">First step: <b>${esc(task.subtasks.find((s) => !s.done)?.title || task.subtasks[0].title)}</b></div>` : ''}
    <div class="fx-presets">${[2, 15, 25].map((m) => `<button data-min="${m}" class="${m === minutes ? 'on' : ''}">${m} min</button>`).join('')}</div>
    <div class="fx-actions"><button class="fx-pause" id="fx-pause">Pause</button><button class="fx-done" id="fx-done">Done ✓</button></div>`;
  overlay.classList.remove('hidden');

  const numEl = $('#fx-num'), ringEl = $('#fx-ring');
  const draw = () => {
    numEl.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    ringEl.setAttribute('stroke-dashoffset', (circ * (1 - left / total)).toFixed(1));
  };
  draw();
  clearInterval(fxTimer);
  fxTimer = setInterval(() => {
    if (paused) return;
    left--; if (left <= 0) { left = 0; draw(); clearInterval(fxTimer); toast('Time — keep going or take a break 🌿'); return; }
    draw();
  }, 1000);

  const close = () => { clearInterval(fxTimer); overlay.classList.add('hidden'); };
  overlay.querySelector('.fx-close').addEventListener('click', close);
  $('#fx-pause').addEventListener('click', (e) => { paused = !paused; e.target.textContent = paused ? 'Resume' : 'Pause'; });
  $('#fx-done').addEventListener('click', async () => { close(); await toggleTask(task.id, true); });
  overlay.querySelector('.fx-presets').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; close(); openFocus(task, Number(b.dataset.min)); });
}

// ---------------------------------------------------------------- pick one for me
async function pickForMe() {
  const pool = await api('GET', '/tasks?bucket=today&today=' + todayStr());
  const open = pool.filter((t) => !t.done);
  if (!open.length) { toast('Nothing to pick — add something first'); return; }
  let filtered = open;
  if (state.todayFilter === 'quick') filtered = open.filter((t) => t.estimate_min && t.estimate_min <= 15);
  if (state.todayFilter === 'low') filtered = open.filter((t) => t.energy === 'low');
  if (!filtered.length) filtered = open;
  // Prefer the quickest — smallest barrier to just starting.
  const sorted = [...filtered].sort((a, b) => (a.estimate_min || 999) - (b.estimate_min || 999));
  let chosen = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
  const show = () => {
    $('#sheet-body').innerHTML = `<h2>Try this one</h2>
      <div class="pick-card">
        <div class="pick-title">${esc(chosen.title)}</div>
        <div class="task-meta" style="justify-content:center;margin-top:8px">
          ${chosen.estimate_min ? `<span class="meta-chip">⏱ ${chosen.estimate_min}m</span>` : ''}
          ${chosen.energy ? `<span class="meta-chip">${ENERGY[chosen.energy]}</span>` : ''}
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn-primary" style="background:var(--accent)" id="pk-start">▶ Just start · 2 min</button>
      </div>
      <div class="sheet-actions" style="margin-top:8px">
        <button class="btn-ghost" id="pk-shuffle" style="flex:1">🔀 Something else</button>
        <button class="btn-ghost" id="pk-done" style="flex:1">✓ Mark done</button>
      </div>`;
    $('#pk-start').addEventListener('click', () => { closeSheet(); openFocus(chosen, 2); });
    $('#pk-shuffle').addEventListener('click', () => { chosen = sorted[Math.floor(Math.random() * sorted.length)]; show(); });
    $('#pk-done').addEventListener('click', async () => { closeSheet(); await toggleTask(chosen.id); });
  };
  show();
  openSheet();
}

// ---------------------------------------------------------------- plan my day
async function openPlanDay() {
  const [todayList, inbox] = await Promise.all([
    api('GET', '/tasks?bucket=today&today=' + todayStr()),
    api('GET', '/tasks?bucket=inbox'),
  ]);
  const seen = new Set(); const queue = [];
  for (const t of [...todayList.filter((x) => dueState(x) === 'overdue'), ...inbox]) {
    if (!seen.has(t.id)) { seen.add(t.id); queue.push(t); }
  }
  const overlay = $('#plan');
  if (!queue.length) { toast('Nothing to plan — you\'re all set ✨'); return; }
  let i = 0, planned = 0;
  const decide = async (choice) => {
    const t = queue[i];
    const d = new Date();
    if (choice === 'today') await api('PATCH', '/tasks/' + t.id, { my_day_date: todayStr() });
    else if (choice === 'tomorrow') { d.setDate(d.getDate() + 1); await api('PATCH', '/tasks/' + t.id, { due_at: ymd(d), has_time: 0 }); }
    else if (choice === 'later') { d.setDate(d.getDate() + 7); await api('PATCH', '/tasks/' + t.id, { due_at: ymd(d), has_time: 0 }); }
    else if (choice === 'done') await api('POST', '/tasks/' + t.id + '/toggle');
    if (choice !== 'skip') planned++;
    i++; draw();
  };
  const draw = () => {
    if (i >= queue.length) {
      overlay.innerHTML = `<div class="fx-title">Day planned ✨</div>
        <p class="muted" style="margin:14px 0 26px">${planned} sorted. Your Today is ready.</p>
        <div class="fx-actions"><button class="fx-done" id="plan-close">See Today</button></div>`;
      $('#plan-close').addEventListener('click', () => { overlay.classList.add('hidden'); refreshMeta().then(render); });
      return;
    }
    const t = queue[i];
    const list = listById(t.list_id);
    const dots = queue.map((_, k) => `<i class="${k < i ? 'fill' : ''}"></i>`).join('');
    overlay.innerHTML = `<button class="fx-close" id="plan-x" aria-label="Close">×</button>
      <div class="plan-progress">${dots}</div>
      <div class="plan-sub">${i + 1} of ${queue.length} · where does this go?</div>
      <div class="plan-card">
        <div class="plan-title">${esc(t.title)}</div>
        <div class="task-meta" style="justify-content:center;margin-top:8px">
          ${dueState(t) === 'overdue' ? '<span class="meta-chip overdue">🗓 ' + esc(dueLabel(t)) + '</span>' : '<span class="meta-chip">📥 Inbox</span>'}
          ${list ? `<span class="meta-chip"><i class="list-dot" style="background:${esc(list.color)}"></i>${esc(list.name)}</span>` : ''}
        </div>
      </div>
      <div class="plan-choices">
        <button data-plan-c="today" class="pc-today">↑ Today</button>
        <button data-plan-c="tomorrow">→ Tomorrow</button>
        <button data-plan-c="later">⇥ Next week</button>
        <button data-plan-c="done" class="pc-done">✓ Done</button>
      </div>
      <button class="plan-skip" data-plan-c="skip">Skip for now</button>`;
    $('#plan-x').addEventListener('click', () => { overlay.classList.add('hidden'); refreshMeta().then(render); });
    overlay.querySelectorAll('[data-plan-c]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.planC)));
  };
  overlay.classList.remove('hidden');
  draw();
}

// ---------------------------------------------------------------- search
function openSearch() {
  $('#sheet-body').innerHTML = `<h2>Search</h2>
    <input class="capture-input" id="sq" placeholder="Find a task…" autocomplete="off" />
    <div id="sq-results" style="margin-top:14px"></div>`;
  openSheet();
  const input = $('#sq'); setTimeout(() => input.focus(), 60);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const box = $('#sq-results');
      if (!q) { box.innerHTML = ''; return; }
      const results = await api('GET', '/tasks?q=' + encodeURIComponent(q));
      box.innerHTML = results.length ? '' : '<p class="muted" style="text-align:center">No matches.</p>';
      results.forEach((t) => {
        const row = el(taskCard(t).outerHTML);
        row.addEventListener('click', () => { closeSheet(); openTaskEditorById(t.id); });
        box.appendChild(row);
      });
    }, 200);
  });
}

// Filter the History view in place. Kept simple: type, and the archive list
// re-renders filtered by title.
function openArchiveSearch() {
  $('#sheet-body').innerHTML = `<h2>Search completed</h2>
    <input class="capture-input" id="aq" placeholder="Find a finished task…" autocomplete="off" value="${esc(state.sub?.q || '')}" />
    <div class="sheet-actions"><button class="btn-primary" id="aq-go">Search</button>
      ${state.sub?.q ? '<button class="btn-ghost" id="aq-clear">Clear</button>' : ''}</div>`;
  openSheet();
  const input = $('#aq'); setTimeout(() => input.focus(), 60);
  const go = () => { state.sub = { type: 'archive', q: input.value.trim() }; closeSheet(); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('#aq-go').addEventListener('click', go);
  $('#aq-clear')?.addEventListener('click', () => { state.sub = { type: 'archive' }; closeSheet(); render(); });
}

// ---------------------------------------------------------------- note → tasks (AI)
function openNoteToTasks() {
  $('#sheet-body').innerHTML = `<h2>Note → tasks</h2>
    <p class="muted" style="font-size:13px;margin-top:-6px">Paste a brain-dump, email, or messy note. Tempo pulls out the to-dos — you pick which to keep.</p>
    <textarea class="te-notes" id="nt-text" placeholder="e.g. Need to book MOT, ring the school about the trip, and finally sort the loft…" style="min-height:120px"></textarea>
    <div class="sheet-actions"><button class="btn-primary" id="nt-go">✨ Find tasks</button></div>
    <div id="nt-results"></div>`;
  openSheet();
  const input = $('#nt-text'); setTimeout(() => input.focus(), 60);
  $('#nt-go').addEventListener('click', async () => {
    const text = input.value.trim(); if (!text) { toast('Paste some text first'); return; }
    const go = $('#nt-go'); go.disabled = true; go.textContent = '✨ Reading…';
    try {
      const { tasks } = await api('POST', '/ai/notes', { text });
      const box = $('#nt-results');
      if (!tasks.length) { box.innerHTML = '<p class="muted" style="text-align:center;margin-top:12px">No clear tasks found — try rephrasing.</p>'; return; }
      box.innerHTML = `<div class="section-label">Found ${tasks.length} — untick any to skip</div>
        <div class="nt-list">${tasks.map((t, i) => `<label class="nt-item"><input type="checkbox" data-i="${i}" checked><span>${esc(t.title)}${t.notes ? `<br><small class="muted">${esc(t.notes)}</small>` : ''}</span></label>`).join('')}</div>
        <div class="chips" style="margin:12px 0"><button class="chip-btn" id="nt-myday">◎ Add to My Day</button></div>
        <div class="sheet-actions"><button class="btn-primary" id="nt-add">Add selected</button></div>`;
      let myDay = false;
      $('#nt-myday').addEventListener('click', (e) => { myDay = !myDay; e.target.classList.toggle('on', myDay); });
      $('#nt-add').addEventListener('click', async () => {
        const chosen = [...box.querySelectorAll('.nt-item input:checked')].map((c) => tasks[Number(c.dataset.i)]);
        if (!chosen.length) { toast('Nothing selected'); return; }
        for (const t of chosen) await api('POST', '/tasks', { title: t.title, notes: t.notes || null, source: 'ai', my_day_date: myDay ? todayStr() : null });
        closeSheet(); toast(`Added ${chosen.length} task${chosen.length > 1 ? 's' : ''} ✨`); refreshMeta().then(render);
      });
    } catch (e) { toast(e.message); }
    finally { go.disabled = false; go.textContent = '✨ Find tasks'; }
  });
}

// ---------------------------------------------------------------- task interactions
async function toggleTask(id, celebrateIt) {
  const { task, spawned } = await api('POST', `/tasks/${id}/toggle`);
  if (task.done && celebrateIt !== false) {
    celebrate();
    if (spawned) toast('Done ✓ — next one scheduled 🔁');
    else toastAction(encourage(), 'Undo', async () => { await api('POST', `/tasks/${id}/toggle`); refreshMeta().then(render); });
  }
  refreshMeta().then(render);
}
function encourage() { const m = ['Done ✓', 'Nice one ✓', 'That\'s a win ✓', 'Momentum 🎉', 'Ticked off ✓']; return m[Math.floor(Math.random() * m.length)]; }

// event delegation for the whole view
$('#view').addEventListener('click', async (e) => {
  const t = e.target;
  const goalOpen = t.closest('[data-goalopen]'); if (goalOpen) { state.sub = { type: 'goal', id: Number(goalOpen.dataset.goalopen) }; return render(); }
  const listOpen = t.closest('[data-listopen]'); if (listOpen) { state.sub = { type: 'list', id: Number(listOpen.dataset.listopen) }; return render(); }
  if (t.closest('[data-inboxopen]')) { state.sub = { type: 'inbox' }; return render(); }
  if (t.closest('[data-somedayopen]')) { state.sub = { type: 'someday' }; return render(); }
  const addDay = t.closest('[data-addday]');
  if (addDay) { const k = addDay.dataset.addday; return k === todayStr() ? openCapture({ myDay: true }) : openCapture({ due: k }); }
  if (t.closest('[data-archivesearch]')) return openArchiveSearch();
  if (t.closest('[data-searchopen]')) return openSearch();
  const btn = t.closest('button'); if (!btn) { const ttl = t.closest('[data-edit]'); if (ttl) openTaskEditorById(Number(ttl.dataset.edit)); return; }

  if (btn.dataset.toggle) {
    btn.classList.add('pop', 'done');
    btn.closest('.task')?.classList.add('settling');
    await toggleTask(Number(btn.dataset.toggle));
  } else if (btn.dataset.subtoggle) { await api('POST', `/tasks/${btn.dataset.subtoggle}/toggle`); render(); }
  else if (btn.dataset.subdel) { await api('DELETE', '/tasks/' + btn.dataset.subdel); render(); }
  else if (btn.dataset.exp) { const id = Number(btn.dataset.exp); expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }
  else if (btn.dataset.start) { const task = await api('GET', '/tasks/' + btn.dataset.start); openFocus(task, 2); }
  else if (btn.dataset.focus) { const task = await api('GET', '/tasks/' + btn.dataset.focus); openFocus(task, 25); }
  else if (btn.dataset.cal) { state.calMode = btn.dataset.cal; render(); }
  else if (btn.dataset.mo) { state.calDate.setMonth(state.calDate.getMonth() + Number(btn.dataset.mo)); render(); }
  else if (btn.dataset.yr) { state.calDate.setFullYear(state.calDate.getFullYear() + Number(btn.dataset.yr)); render(); }
  else if (btn.dataset.day) { state.calSel = btn.dataset.day; render(); }
  else if (btn.dataset.shift) { const d = parseYmd(state.calSel); d.setDate(d.getDate() + Number(btn.dataset.shift)); state.calSel = ymd(d); render(); }
  else if (btn.dataset.ym) { state.calDate.setMonth(Number(btn.dataset.ym)); state.calMode = 'month'; state.calSel = ymd(new Date(state.calDate.getFullYear(), Number(btn.dataset.ym), 1)); render(); }
  else if (btn.hasAttribute('data-plan')) openPlanDay();
  else if (btn.hasAttribute('data-pick')) pickForMe();
  else if (btn.dataset.filter) { state.todayFilter = btn.dataset.filter; render(); }
  else if (btn.dataset.daynav) { const k = btn.dataset.daynav; if (k === todayStr()) { render(); } else { state.tab = 'calendar'; state.calMode = 'day'; state.calSel = k; state.sub = null; render(); } }
  else if (btn.dataset.myday) { const id = Number(btn.dataset.myday); await api('PATCH', '/tasks/' + id, { my_day_date: btn.dataset.on === '1' ? null : todayStr() }); toast(btn.dataset.on === '1' ? 'Removed from My Day' : 'Added to My Day ◎'); render(); }
  else if (btn.hasAttribute('data-completed-toggle')) { state.completedOpen = !state.completedOpen; render(); }
  else if (btn.dataset.amnesty) {
    const id = Number(btn.dataset.id);
    if (btn.dataset.amnesty === 'reschedule') return openTaskEditorById(id);
    if (btn.dataset.amnesty === 'someday') { await api('PATCH', '/tasks/' + id, { someday: 1, due_at: null, my_day_date: null }); toast('Parked in Someday 🌙'); }
    if (btn.dataset.amnesty === 'delete') { await api('DELETE', '/tasks/' + id); toast('Deleted'); }
    render();
  }
  else if (btn.dataset.restore) { await api('POST', `/tasks/${btn.dataset.restore}/restore`); toast('Restored — due today'); render(); }
  else if (btn.dataset.somedayto) { await api('PATCH', '/tasks/' + btn.dataset.somedayto, { someday: 0, my_day_date: todayStr() }); toast('Moved to My Day ◎'); render(); }
});
// add sub-task via inline input (Enter)
$('#view').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && e.target.dataset.subadd) {
    const val = e.target.value.trim(); if (!val) return;
    await api('POST', '/tasks', { title: val, parent_id: Number(e.target.dataset.subadd) });
    e.target.value = ''; render();
  }
});
async function openTaskEditorById(id) { openTaskEditor(await api('GET', '/tasks/' + id)); }

// ---------------------------------------------------------------- sheet + nav
function openSheet() { $('#sheet').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet-body').innerHTML = ''; }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
$('#fab').addEventListener('click', openCapture);
$('#add-btn').addEventListener('click', openCapture); // header "+" (>=768)

// Desktop task-detail panel (Phase 3). `detail-open` drives the slide-over
// (768-1199) and shows the close button; >=1200 the panel is always in the grid.
function openDetail() { document.body.classList.add('detail-open'); }
function closeDetail() { document.body.classList.remove('detail-open'); $('#detail-body').innerHTML = '<div class="detail-empty">Select a task to see its details.</div>'; }
$('#detail-close').addEventListener('click', closeDetail);
$('#detail-scrim').addEventListener('click', closeDetail);

// ---------------------------------------------------------------- sidebar (>=768)
// Rendered on every render() so active state + list counts stay in sync. It's
// display:none below 768px, so this is a no-op on phones.
function renderSidebar() {
  const sb = $('#sidebar'); if (!sb) return;
  const s = state.sub, t = state.tab;
  const prim = (key, ic, label) => `<button class="side-item ${t === key && !s ? 'on' : ''}" data-side="${key}"><span class="side-ic">${ic}</span><span class="side-label">${label}</span></button>`;
  const subItem = (key, ic, label) => `<button class="side-item ${s?.type === key ? 'on' : ''}" data-side="${key}"><span class="side-ic">${ic}</span><span class="side-label">${label}</span></button>`;
  let h = `<div class="side-brand"><img src="/icon.svg" alt=""> Tempo</div>`;
  h += prim('today', '◎', 'My Day');
  h += prim('upcoming', '↗', 'Next 7 Days');
  h += prim('calendar', '▤', 'Calendar');
  h += prim('goals', '◈', 'Goals');
  h += `<div class="side-section">Collect</div>`;
  h += subItem('inbox', '📥', 'Inbox');
  h += subItem('someday', '🌙', 'Someday');
  h += subItem('archive', '🗂', 'History');
  h += `<div class="side-section">Lists</div>`;
  for (const l of state.lists) {
    h += `<button class="side-item ${s?.type === 'list' && s.id === l.id ? 'on' : ''}" data-side="list" data-id="${l.id}"><span class="side-dot" style="--dot:${esc(l.color)}"></span><span class="side-label">${esc(l.name)}</span><span class="side-count">${l.open_count || 0}</span></button>`;
  }
  h += `<button class="side-item" data-side="newlist"><span class="side-ic">＋</span><span class="side-label">New list</span></button>`;
  h += `<div class="side-spacer"></div>`;
  h += `<button class="side-item" data-side="theme"><span class="side-ic">◐</span><span class="side-label">Theme: ${esc(THEMES.find((x) => x.id === themeId())?.name || '')}</span></button>`;
  h += subItem('settings', '⚙', 'Settings');
  sb.innerHTML = h;
}
$('#sidebar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-side]'); if (!b) return;
  const k = b.dataset.side;
  if (k === 'newlist') return openListEditor();
  if (k === 'theme') { const next = THEMES[(THEMES.findIndex((x) => x.id === themeId()) + 1) % THEMES.length]; setTheme(next.id); toast('Theme: ' + next.name); renderSidebar(); return; }
  if (k === 'list') { state.sub = { type: 'list', id: Number(b.dataset.id) }; return render().then(animateView); }
  if (['inbox', 'someday', 'archive', 'settings'].includes(k)) { state.sub = { type: k }; return render().then(animateView); }
  state.tab = k; state.sub = null; render().then(animateView); // primary tab
});
// Replay a gentle entrance on the view after a navigation change (not on
// in-place data refreshes, which would feel busy).
function animateView() { const v = $('#view'); if (!v) return; v.classList.remove('animate-in'); void v.offsetWidth; v.classList.add('animate-in'); }
$('#back-btn').addEventListener('click', () => { state.sub = null; render().then(animateView); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { state.tab = tab.dataset.view; state.sub = null; render().then(animateView); }));

$('#more-btn').addEventListener('click', () => {
  const body = $('#sheet-body');
  body.innerHTML = `<h2>More</h2>
    <div class="menu-list">
      <button class="menu-item" id="m-search">🔍 <span>Search tasks</span></button>
      ${state.aiEnabled ? '<button class="menu-item" id="m-note">✨ <span>Note → tasks</span></button>' : ''}
      <button class="menu-item" id="m-review">📋 <span>Weekly review</span></button>
      <button class="menu-item" id="m-history">🗂 <span>History (completed)</span></button>
      <button class="menu-item" id="m-goal">◈ <span>New goal</span></button>
      <button class="menu-item" id="m-settings">⚙️ <span>Settings</span></button>
      <button class="menu-item" id="m-logout" style="color:var(--danger)">⎋ <span>Log out</span></button>
    </div>`;
  openSheet();
  $('#m-search').addEventListener('click', openSearch);
  $('#m-note')?.addEventListener('click', openNoteToTasks);
  $('#m-review').addEventListener('click', () => { closeSheet(); openReview(); });
  $('#m-history').addEventListener('click', () => { closeSheet(); state.sub = { type: 'archive' }; render(); });
  $('#m-goal').addEventListener('click', () => openGoalEditor());
  $('#m-settings').addEventListener('click', () => { closeSheet(); state.sub = { type: 'settings' }; render(); });
  $('#m-logout').addEventListener('click', logout);
});

// ---------------------------------------------------------------- lightweight reminders (while open)
setInterval(async () => {
  if (!TOKEN || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const tasks = await api('GET', '/tasks?bucket=today&today=' + todayStr());
    const now = new Date();
    for (const t of tasks) {
      if (!t.has_time || t.done || notified.has(t.id)) continue;
      const due = new Date(t.due_at);
      if (due <= now && now - due < 120000) { notified.add(t.id); new Notification('⏱ Tempo', { body: t.title }); }
    }
  } catch { /* offline — ignore */ }
}, 45000);

// ---------------------------------------------------------------- start
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (TOKEN) boot(); else showLogin();
