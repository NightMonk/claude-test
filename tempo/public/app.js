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
const state = { tab: 'today', lists: [], goals: [], sub: null, calMode: 'month', calDate: new Date(), calSel: todayStr(), todayFilter: 'all' };
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
  render();
}
async function refreshMeta() {
  [state.lists, state.goals] = await Promise.all([api('GET', '/lists'), api('GET', '/goals')]);
}
const listById = (id) => state.lists.find((l) => l.id === id);

// ---------------------------------------------------------------- toast + celebrate
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
function celebrate() {
  const box = $('#confetti'); box.innerHTML = ''; box.classList.remove('hidden');
  const colors = ['var(--primary)', 'var(--now)', 'var(--done)', 'var(--warn)'];
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
  const meta = [];
  const dl = dueLabel(task);
  if (dl) meta.push(`<span class="meta-chip ${dueState(task)}">🗓 ${esc(dl)}</span>`);
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
    </div>` : ''}
  </div>`);

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
  try {
    if (state.sub?.type === 'list') return renderListDetail(state.sub.id);
    if (state.sub?.type === 'goal') return renderGoalDetail(state.sub.id);
    if (state.sub?.type === 'inbox') return renderInbox();
    if (state.tab === 'today') return renderToday();
    if (state.tab === 'calendar') return renderCalendar();
    if (state.tab === 'goals') return renderGoals();
    if (state.tab === 'lists') return renderLists();
  } catch (e) { v.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

async function renderToday() {
  $('#title').textContent = 'Today';
  const [tasks, doneToday] = await Promise.all([
    api('GET', '/tasks?bucket=today&today=' + todayStr()),
    api('GET', '/tasks?bucket=done_today&today=' + todayStr()),
  ]);
  const v = $('#view'); v.innerHTML = '';
  const total = tasks.length + doneToday.length;
  const done = doneToday.length;
  const pct = total ? done / total : 0;
  const mins = tasks.reduce((a, t) => a + (t.estimate_min || 0), 0);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  v.appendChild(el(`<div class="greet">${greet} — ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>`));
  v.appendChild(el(`<div class="momentum">${ring(52, 6, pct, 'var(--done)')}
    <div><b>${done} of ${total || 0} done today</b>
    <div class="sub">${total === 0 ? 'A clear page. Add something small.' : (tasks.length ? `about <span class="accent">${mins ? Math.round(mins / 60 * 10) / 10 + 'h' : 'a bit'}</span> of tasks left` : 'All done. Lovely. 🎉')}</div></div></div>`));

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

  const overdue = tasks.filter((t) => dueState(t) === 'overdue' && passFilter(t));
  if (overdue.length) {
    const roll = el(`<div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
      <span>Carried over (${overdue.length})</span>
      <button class="mini-btn" id="rollover">Move all to today</button></div>`);
    v.appendChild(roll);
    $('#rollover', roll).addEventListener('click', async () => {
      await api('POST', '/tasks/rollover', { to: todayStr() }); toast('Moved to today — fresh start'); render();
    });
    overdue.forEach((t) => v.appendChild(taskCard(t)));
  }

  const rest = tasks.filter((t) => dueState(t) !== 'overdue' && passFilter(t));
  v.appendChild(el(`<div class="section-label">Today</div>`));
  if (!rest.length && !overdue.length) {
    const msg = state.todayFilter !== 'all' ? 'Nothing matches that filter right now.' : 'Nothing scheduled for today.<br>Tap ＋ to capture something.';
    v.appendChild(el(`<div class="empty"><span class="big">🌿</span>${msg}</div>`));
  }
  rest.forEach((t) => v.appendChild(taskCard(t)));

  if (doneToday.length) {
    v.appendChild(el(`<div class="section-label">✓ Done today · your wins</div>`));
    doneToday.forEach((t) => v.appendChild(taskCard(t)));
  }
}

async function renderGoals() {
  $('#title').textContent = 'Goals';
  const goals = state.goals = await api('GET', '/goals');
  const v = $('#view'); v.innerHTML = '';
  if (!goals.length) { v.appendChild(el(`<div class="empty"><span class="big">◈</span>No goals yet.<br>Add one, then break it into small steps.</div>`)); return; }
  for (const g of goals) {
    const next = g.next_action;
    const card = el(`<div class="goal-card" data-goalopen="${g.id}">
      <div class="goal-top"><span class="goal-name">${esc(g.name)}</span><span class="goal-pct" style="color:${esc(g.color)}">${g.progress}%</span></div>
      <div class="bar"><i style="width:${g.progress}%;background:${esc(g.color)}"></i></div>
      ${next ? `<div class="goal-next">Next: <b>${esc(next.title)}</b> →</div>`
             : `<div class="goal-next empty-next">${g.total ? 'All steps done — set a new one' : 'Add the first small step'}</div>`}
    </div>`);
    v.appendChild(card);
  }
}

async function renderLists() {
  $('#title').textContent = 'Lists';
  const [lists, inbox] = await Promise.all([api('GET', '/lists'), api('GET', '/tasks?bucket=inbox')]);
  state.lists = lists;
  const v = $('#view'); v.innerHTML = '';
  v.appendChild(el(`<div class="list-row" data-searchopen style="color:var(--ink-soft)"><span class="list-emoji">🔍</span><span class="list-name">Search</span></div>`));
  v.appendChild(el(`<div class="list-row" data-inboxopen><span class="list-emoji">📥</span><span class="list-name">Inbox</span><span class="list-count">${inbox.length}</span></div>`));
  v.appendChild(el(`<div class="section-label">Your lists</div>`));
  for (const l of lists) {
    v.appendChild(el(`<div class="list-row" data-listopen="${l.id}">
      <span class="list-emoji">${esc(l.emoji || '•')}</span>
      <span class="list-name">${esc(l.name)}</span>
      <span class="list-count">${l.open_count}</span></div>`));
  }
  const add = el(`<div class="list-row" id="add-list" style="color:var(--primary);justify-content:center;font-weight:700">＋ New list</div>`);
  v.appendChild(add);
  $('#add-list').addEventListener('click', () => openListEditor());
}

async function renderListDetail(id) {
  const l = listById(id) || (await api('GET', '/lists')).find((x) => x.id === id);
  $('#title').textContent = (l?.emoji ? l.emoji + ' ' : '') + (l?.name || 'List');
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
  else await calRange(body, 1);
}

function byDate(tasks) { const m = {}; for (const t of tasks) { const k = t.due_at.slice(0, 10); (m[k] = m[k] || []).push(t); } return m; }

async function calMonth(body) {
  const d = state.calDate; const y = d.getFullYear(), mo = d.getMonth();
  const first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - first.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 41);
  const tasks = await api('GET', `/tasks?from=${ymd(start)}&to=${ymd(end)}`);
  const map = byDate(tasks);
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-mo="-1">‹</button>
    <span class="cal-title">${MONTHS[mo]} ${y}</span><button class="navb" data-mo="1">›</button></div>`));
  const grid = el('<div class="month-grid"></div>');
  DOW.forEach((w) => grid.appendChild(el(`<div class="dow">${w[0]}</div>`)));
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start); cur.setDate(start.getDate() + i);
    const k = ymd(cur); const items = map[k] || [];
    const undone = items.filter((t) => !t.done).length;
    const cls = [cur.getMonth() !== mo ? 'other' : '', k === todayStr() ? 'today' : '', k === state.calSel ? 'sel' : ''].join(' ');
    const dots = items.length ? `<div class="day-dots">${items.slice(0, 3).map(() => `<i class="${undone ? '' : 'all-done'}"></i>`).join('')}</div>` : '';
    grid.appendChild(el(`<button class="day-cell ${cls}" data-day="${k}">${cur.getDate()}${dots}</button>`));
  }
  body.appendChild(grid);
  const sel = el('<div id="cal-sel"></div>'); body.appendChild(sel);
  renderDayList(sel, map[state.calSel] || [], state.calSel);
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
  let start = new Date(base);
  if (days === 7) start.setDate(base.getDate() - base.getDay()); // week starts Sunday
  const end = new Date(start); end.setDate(start.getDate() + days - 1);
  const tasks = await api('GET', `/tasks?from=${ymd(start)}&to=${ymd(end)}`);
  const map = byDate(tasks);
  const title = days === 1
    ? start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
  body.appendChild(el(`<div class="cal-head"><button class="navb" data-shift="${-days}">‹</button>
    <span class="cal-title">${title}</span><button class="navb" data-shift="${days}">›</button></div>`));
  for (let i = 0; i < days; i++) {
    const cur = new Date(start); cur.setDate(start.getDate() + i);
    const k = ymd(cur);
    const wrap = el('<div></div>');
    wrap.appendChild(el(`<div class="day-heading"><span>${cur.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${k === todayStr() ? ' · Today' : ''}</span></div>`));
    renderDayList(wrap, map[k] || [], k, true);
    body.appendChild(wrap);
  }
}

function renderDayList(container, items, dayKey, inline) {
  if (!inline) container.appendChild(el(`<div class="day-heading"><span>${parseYmd(dayKey).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="dh-count">${items.length || 'nothing'}</span></div>`));
  if (!items.length) { if (inline) container.appendChild(el(`<div style="color:var(--ink-faint);font-size:13px;padding:2px 2px 10px">—</div>`)); return; }
  items.forEach((t) => container.appendChild(taskCard(t)));
}

// ---------------------------------------------------------------- quick capture
const LIST_RE = /#([\p{L}\d_-]+)/u;
function parseQuick(text) {
  let title = text, due = null, hasTime = false, priority = 0, listId = null, repeat = 'none', estimate = null;
  const now = new Date();

  const lm = title.match(LIST_RE);
  if (lm) { const found = state.lists.find((l) => l.name.toLowerCase().replace(/\s/g, '') === lm[1].toLowerCase()); if (found) { listId = found.id; title = title.replace(lm[0], ''); } }
  const pm = title.match(/!(high|h|med|m|low|l|2|1)\b/i);
  if (pm) { const p = pm[1].toLowerCase(); priority = /h|2/.test(p) ? 2 : /l/.test(p) ? 0 : 1; title = title.replace(pm[0], ''); }
  const em = title.match(/~\s*(\d+)\s*(m|min|h|hr)?/i);
  if (em) { estimate = /h/i.test(em[2] || '') ? Number(em[1]) * 60 : Number(em[1]); title = title.replace(em[0], ''); }
  const rm = title.match(/\bevery\s+(day|week|month|year|morning)\b/i) || title.match(/\b(daily|weekly|monthly|annually|yearly)\b/i);
  if (rm) { const w = (rm[1] || '').toLowerCase(); repeat = /day|dail|morning/.test(w) ? 'daily' : /week/.test(w) ? 'weekly' : /month/.test(w) ? 'monthly' : 'annual'; title = title.replace(rm[0], ''); }

  let base = null;
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
  if (base) due = hasTime ? `${ymd(base)}T${pad(base.getHours())}:${pad(base.getMinutes())}` : ymd(base);

  title = title.replace(/\s{2,}/g, ' ').trim();
  return { title, due_at: due, has_time: hasTime ? 1 : 0, priority, list_id: listId, repeat, estimate_min: estimate };
}

function openCapture() {
  const body = $('#sheet-body');
  body.innerHTML = `<h2>Quick add</h2>
    <input class="capture-input" id="cap" placeholder="e.g. Call dentist tomorrow 3pm !high" autocomplete="off" />
    <div class="parse-hint" id="cap-hint">Type naturally — I'll pick out the date, list &amp; priority.</div>
    <div class="chips" id="cap-quick">
      <button class="chip-btn" data-q="today">Today</button>
      <button class="chip-btn" data-q="tomorrow">Tomorrow</button>
      ${state.lists.map((l) => `<button class="chip-btn" data-ql="${l.id}">${esc(l.emoji || '')} ${esc(l.name)}</button>`).join('')}
    </div>
    <div class="sheet-actions"><button class="btn-primary" id="cap-add">Add task</button></div>`;
  openSheet();
  const input = $('#cap'); const hint = $('#cap-hint');
  let forceList = null, forceDue = null;
  setTimeout(() => input.focus(), 60);
  const preview = () => {
    const p = parseQuick(input.value);
    const bits = [];
    const due = forceDue || p.due_at;
    if (due) bits.push('🗓 ' + esc(dueLabel({ due_at: due, has_time: p.has_time })));
    if (p.priority) bits.push('❗ ' + (p.priority === 2 ? 'high' : 'med'));
    const li = forceList || p.list_id; if (li) bits.push('#' + esc(listById(li)?.name || ''));
    if (p.repeat !== 'none') bits.push('🔁 ' + p.repeat);
    if (p.estimate_min) bits.push('⏱ ' + p.estimate_min + 'm');
    hint.innerHTML = bits.length ? bits.map((b) => `<b>${b}</b>`).join(' &nbsp; ') : 'Type naturally — I\'ll pick out the date, list &amp; priority.';
  };
  input.addEventListener('input', preview);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $('#cap-quick').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#cap-quick .chip-btn').forEach((x) => { if (x.dataset.ql || x.dataset.q === b.dataset.q) {} });
    if (b.dataset.q) { forceDue = b.dataset.q === 'today' ? todayStr() : ymd(new Date(Date.now() + 86400000)); document.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.dataset.ql) { forceList = Number(b.dataset.ql); document.querySelectorAll('[data-ql]').forEach((x) => x.classList.toggle('on', x === b)); }
    preview();
  });
  async function submit() {
    const p = parseQuick(input.value);
    if (!p.title) { toast('Give it a title'); return; }
    if (forceList) p.list_id = forceList;
    if (forceDue && !p.due_at) { p.due_at = forceDue; p.has_time = 0; }
    await api('POST', '/tasks', p);
    closeSheet(); toast('Added ✓'); refreshMeta().then(render);
  }
  $('#cap-add').addEventListener('click', submit);
}

// ---------------------------------------------------------------- task editor
function openTaskEditor(task, defaults = {}) {
  const t = task || { priority: 0, repeat: 'none', list_id: defaults.list_id ?? null, goal_id: defaults.goal_id ?? null, subtasks: [] };
  let subs = (t.subtasks || []).map((s) => ({ id: s.id, title: s.title, done: s.done }));
  const date = t.due_at ? t.due_at.slice(0, 10) : '';
  const time = t.due_at && t.has_time ? t.due_at.split('T')[1] : '';
  const body = $('#sheet-body');
  body.innerHTML = `<h2>${task ? 'Edit task' : 'New task'}</h2>
    <div class="field"><label>Title</label><input type="text" id="f-title" value="${esc(t.title || '')}" placeholder="What needs doing?" /></div>
    <div class="field"><label>Notes</label><textarea id="f-notes" placeholder="Any detail…">${esc(t.notes || '')}</textarea></div>
    <div class="row2">
      <div class="field"><label>Date</label><input type="date" id="f-date" value="${date}" /></div>
      <div class="field"><label>Time (optional)</label><input type="time" id="f-time" value="${time}" /></div>
    </div>
    <div class="field"><label>Priority</label><div class="chips" id="f-prio">
      ${[['None', 0], ['Medium', 1], ['High', 2]].map(([n, v]) => `<button class="chip-btn ${t.priority == v ? 'on' + (v == 2 ? ' now-chip' : '') : ''}" data-prio="${v}">${n}</button>`).join('')}</div></div>
    <div class="field"><label>Energy needed</label><div class="chips" id="f-energy">
      ${[['—', ''], ['⚡ Low', 'low'], ['🔋 Medium', 'med'], ['🔥 High', 'high']].map(([n, v]) => `<button class="chip-btn ${(t.energy || '') === v ? 'on' : ''}" data-energy="${v}">${n}</button>`).join('')}</div></div>
    <div class="field"><label>Rough time</label><div class="chips" id="f-est">
      ${[['—', ''], ['5m', 5], ['15m', 15], ['30m', 30], ['1h', 60], ['2h', 120]].map(([n, v]) => `<button class="chip-btn ${(t.estimate_min || '') == v ? 'on' : ''}" data-est="${v}">${n}</button>`).join('')}</div></div>
    <div class="row2">
      <div class="field"><label>List</label><select id="f-list"><option value="">— None —</option>
        ${state.lists.map((l) => `<option value="${l.id}" ${t.list_id == l.id ? 'selected' : ''}>${esc(l.emoji || '')} ${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Repeat</label><select id="f-repeat">
        ${['none', 'daily', 'weekly', 'monthly', 'annual'].map((r) => `<option value="${r}" ${t.repeat === r ? 'selected' : ''}>${r === 'none' ? 'Never' : r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Goal</label><select id="f-goal"><option value="">— None —</option>
      ${state.goals.map((g) => `<option value="${g.id}" ${t.goal_id == g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Sub-tasks (break it down)</label><div class="sub-editor" id="f-subs"></div></div>
    <div class="sheet-actions">
      <button class="btn-primary" id="f-save">${task ? 'Save' : 'Add task'}</button>
      ${task ? '<button class="btn-ghost btn-danger" id="f-del">Delete</button>' : ''}
    </div>`;
  openSheet();

  // chip groups (single-select)
  body.querySelectorAll('#f-prio, #f-energy, #f-est').forEach((grp) => grp.addEventListener('click', (e) => {
    const b = e.target.closest('.chip-btn'); if (!b) return;
    grp.querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b));
    if (grp.id === 'f-prio') b.classList.toggle('now-chip', b.dataset.prio === '2');
  }));

  const subBox = $('#f-subs');
  function drawSubs() {
    subBox.innerHTML = '';
    subs.forEach((s, i) => {
      const row = el(`<div class="se-row"><input value="${esc(s.title)}" placeholder="Step ${i + 1}" /><button class="se-del" aria-label="remove">×</button></div>`);
      row.querySelector('input').addEventListener('input', (e) => { s.title = e.target.value; });
      row.querySelector('.se-del').addEventListener('click', () => { subs.splice(i, 1); drawSubs(); });
      subBox.appendChild(row);
    });
    const add = el(`<button class="chip-btn" style="align-self:flex-start">＋ Add step</button>`);
    add.addEventListener('click', () => { subs.push({ title: '' }); drawSubs(); subBox.querySelectorAll('input')[subs.length - 1]?.focus(); });
    subBox.appendChild(add);
  }
  drawSubs();

  $('#f-save').addEventListener('click', async () => {
    const title = $('#f-title').value.trim();
    if (!title) { toast('Give it a title'); return; }
    const d = $('#f-date').value, tm = $('#f-time').value;
    const payload = {
      title, notes: $('#f-notes').value.trim() || null,
      due_at: d ? (tm ? `${d}T${tm}` : d) : null, has_time: d && tm ? 1 : 0,
      priority: Number(body.querySelector('#f-prio .on')?.dataset.prio || 0),
      energy: body.querySelector('#f-energy .on')?.dataset.energy || null,
      estimate_min: Number(body.querySelector('#f-est .on')?.dataset.est || 0) || null,
      list_id: $('#f-list').value ? Number($('#f-list').value) : null,
      goal_id: $('#f-goal').value ? Number($('#f-goal').value) : null,
      repeat: $('#f-repeat').value,
    };
    let id = task?.id;
    if (task) await api('PATCH', '/tasks/' + id, payload);
    else id = (await api('POST', '/tasks', payload)).id;
    // reconcile sub-tasks
    const orig = task?.subtasks || [];
    for (const o of orig) if (!subs.find((s) => s.id === o.id)) await api('DELETE', '/tasks/' + o.id);
    for (const s of subs) {
      const title2 = s.title.trim(); if (!title2) continue;
      if (s.id) { const o = orig.find((x) => x.id === s.id); if (o && o.title !== title2) await api('PATCH', '/tasks/' + s.id, { title: title2 }); }
      else await api('POST', '/tasks', { title: title2, parent_id: id });
    }
    closeSheet(); toast(task ? 'Saved' : 'Added ✓'); refreshMeta().then(render);
  });
  $('#f-del')?.addEventListener('click', async () => {
    await api('DELETE', '/tasks/' + task.id); closeSheet(); toast('Deleted'); refreshMeta().then(render);
  });
}

// ---------------------------------------------------------------- goal & list editors
function openGoalEditor(goal) {
  const g = goal || { color: '#5b5bd6' };
  const colors = ['#5b5bd6', '#34c88a', '#ff7a59', '#e0a43b', '#d65db1'];
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
  const l = list || { color: '#5b5bd6', emoji: '' };
  const body = $('#sheet-body');
  body.innerHTML = `<h2>${list ? 'Edit list' : 'New list'}</h2>
    <div class="row2">
      <div class="field"><label>Emoji</label><input type="text" id="l-emoji" value="${esc(l.emoji || '')}" maxlength="2" placeholder="📋" /></div>
      <div class="field"><label>Name</label><input type="text" id="l-name" value="${esc(l.name || '')}" placeholder="e.g. Errands" /></div>
    </div>
    <div class="field"><label>Colour</label><div class="chips" id="l-color">
      ${['#5b5bd6', '#34c88a', '#ff7a59', '#e0a43b', '#d65db1', '#8b8fa8'].map((c) => `<button class="chip-btn ${l.color === c ? 'on' : ''}" data-color="${c}" style="background:${c};color:#fff;border-color:${c}">●</button>`).join('')}</div></div>
    <div class="sheet-actions"><button class="btn-primary" id="l-save">${list ? 'Save' : 'Add list'}</button>
      ${list ? '<button class="btn-ghost btn-danger" id="l-del">Delete</button>' : ''}</div>`;
  openSheet();
  let color = l.color;
  $('#l-color').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.color; $('#l-color').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#l-save').addEventListener('click', async () => {
    const name = $('#l-name').value.trim(); if (!name) { toast('Name it'); return; }
    const payload = { name, emoji: $('#l-emoji').value.trim() || null, color };
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
        <circle id="fx-ring" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--now)" stroke-width="${stroke}"
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
        <button class="btn-primary" style="background:var(--now)" id="pk-start">▶ Just start · 2 min</button>
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
    if (choice === 'today') await api('PATCH', '/tasks/' + t.id, { due_at: todayStr(), has_time: 0 });
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

// ---------------------------------------------------------------- task interactions
async function toggleTask(id, celebrateIt) {
  const { task, spawned } = await api('POST', `/tasks/${id}/toggle`);
  if (task.done && celebrateIt !== false) { celebrate(); toast(spawned ? 'Done ✓ — next one scheduled 🔁' : encourage()); }
  refreshMeta().then(render);
}
function encourage() { const m = ['Done ✓', 'Nice one ✓', 'That\'s a win ✓', 'Momentum 🎉', 'Ticked off ✓']; return m[Math.floor(Math.random() * m.length)]; }

// event delegation for the whole view
$('#view').addEventListener('click', async (e) => {
  const t = e.target;
  const goalOpen = t.closest('[data-goalopen]'); if (goalOpen) { state.sub = { type: 'goal', id: Number(goalOpen.dataset.goalopen) }; return render(); }
  const listOpen = t.closest('[data-listopen]'); if (listOpen) { state.sub = { type: 'list', id: Number(listOpen.dataset.listopen) }; return render(); }
  if (t.closest('[data-inboxopen]')) { state.sub = { type: 'inbox' }; return render(); }
  if (t.closest('[data-searchopen]')) return openSearch();
  const btn = t.closest('button'); if (!btn) { const ttl = t.closest('[data-edit]'); if (ttl) openTaskEditorById(Number(ttl.dataset.edit)); return; }

  if (btn.dataset.toggle) {
    btn.classList.add('pop', 'done');
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
$('#back-btn').addEventListener('click', () => { state.sub = null; render(); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { state.tab = tab.dataset.view; state.sub = null; render(); }));

$('#more-btn').addEventListener('click', () => {
  const body = $('#sheet-body');
  const notifOn = ('Notification' in window) && Notification.permission === 'granted';
  body.innerHTML = `<h2>Tempo</h2>
    <div class="field"><button class="chip-btn" id="m-search" style="width:100%;padding:13px">🔍 Search tasks</button></div>
    <div class="field"><button class="chip-btn" id="m-notif" style="width:100%;padding:13px">${notifOn ? '🔔 Reminders on (while app is open)' : '🔔 Enable reminders'}</button></div>
    <div class="field"><button class="chip-btn" id="m-goal" style="width:100%;padding:13px">◈ New goal</button></div>
    <div class="field"><button class="chip-btn" id="m-export" style="width:100%;padding:13px">⬇ Export a backup (JSON)</button></div>
    <div class="field"><button class="chip-btn btn-danger" id="m-logout" style="width:100%;padding:13px">Log out</button></div>
    <p class="muted" style="font-size:12.5px">Reminders fire while Tempo is open in your browser. For lock-screen alerts, install to your home screen — native push is on the roadmap.</p>`;
  openSheet();
  $('#m-search').addEventListener('click', openSearch);
  $('#m-notif').addEventListener('click', async () => { if ('Notification' in window) { await Notification.requestPermission(); toast(Notification.permission === 'granted' ? 'Reminders on' : 'Permission needed'); closeSheet(); } });
  $('#m-goal').addEventListener('click', () => openGoalEditor());
  $('#m-export').addEventListener('click', async () => {
    const data = await api('GET', '/export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'tempo-backup.json'; a.click(); closeSheet();
  });
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
