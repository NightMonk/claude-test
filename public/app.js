'use strict';

// ---------- Tiny helpers ----------
const $ = (sel) => document.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CATS = {
  friends_family: 'Friends & Family',
  acquaintances: 'Acquaintances',
  colleagues: 'Colleagues',
  dating: 'Dating',
  other: 'Other',
};
const CAT_ORDER = ['friends_family', 'acquaintances', 'colleagues', 'dating', 'other'];

const state = {
  token: localStorage.getItem('token') || null,
  view: 'home',
  history: [],
};

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { logout(); throw new Error('Unauthorised'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}

// ---------- Auth ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.classList.add('hidden');
  try {
    const { token } = await api('/login', { method: 'POST', body: JSON.stringify({ passcode: $('#passcode').value }) });
    state.token = token;
    localStorage.setItem('token', token);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

function logout() {
  state.token = null;
  localStorage.removeItem('token');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  navigate('home');
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- Navigation ----------
function setTitle(title, showBack) {
  $('#title').textContent = title;
  $('#back-btn').classList.toggle('hidden', !showBack);
}

function navigate(view, opts = {}) {
  if (!opts.back) state.history.push({ view: state.view, ...state.viewMeta });
  state.view = view;
  state.viewMeta = opts;
  $('#search-bar').classList.add('hidden');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  render();
}

$('#back-btn').addEventListener('click', () => {
  const prev = state.history.pop();
  if (prev) { state.view = prev.view; state.viewMeta = prev; render(); }
  else navigate('home', { back: true });
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.history = [];
    navigate(tab.dataset.view, { back: true });
  });
});

$('#fab').addEventListener('click', () => openPersonForm());

// Search toggle
$('#search-btn').addEventListener('click', () => {
  const bar = $('#search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) $('#search-input').focus();
});
let searchTimer;
$('#search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => navigate('search', { q, back: true }), 250);
});

// ---------- Rendering ----------
async function render() {
  const view = state.view;
  const meta = state.viewMeta || {};
  const root = $('#view');
  $('#fab').classList.toggle('hidden', view === 'person');
  try {
    if (view === 'home') return renderHome(root);
    if (view === 'more') return renderMore(root);
    if (view === 'search') return renderList(root, { q: meta.q, title: meta.q ? `“${meta.q}”` : 'Search' });
    if (view === 'person') return renderPerson(root, meta.id);
    if (CATS[view]) return renderList(root, { category: view, title: CATS[view] });
  } catch (err) {
    root.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

function avatar(p) {
  const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return `<div class="avatar cat-${esc(p.category)}" style="--c:var(--c)">${esc(initials)}</div>`;
}

function personRow(p, { showCategory = true } = {}) {
  const sub = [showCategory ? CATS[p.category] : null, p.met_place].filter(Boolean).join(' · ');
  const pill = showCategory ? `<span class="pill cat-${esc(p.category)}">${esc(CATS[p.category])}</span>` : '';
  const row = el(`<div class="card cat-${esc(p.category)}"><div class="person-row">
    ${avatar(p)}
    <div class="meta"><div class="name">${esc(p.name)}</div><div class="sub">${esc(sub)}</div></div>
    ${pill}
  </div></div>`);
  row.addEventListener('click', () => navigate('person', { id: p.id }));
  return row;
}

async function renderHome(root) {
  setTitle('People', false);
  root.innerHTML = '<p class="empty">Loading…</p>';
  const data = await api('/dashboard');
  root.innerHTML = '';

  // Counts
  setTitle('People', false);
  const counts = el('<div class="counts"></div>');
  for (const c of CAT_ORDER) {
    counts.appendChild(el(`<div class="count-card cat-${c}"><div class="n">${data.counts[c] || 0}</div><div class="l">${CATS[c]}</div></div>`));
  }
  root.appendChild(counts);

  // Upcoming meetings — the "brief me before I see them" feature
  if (data.upcomingMeetings.length) {
    root.appendChild(el('<div class="section-title">Before you next meet…</div>'));
    for (const m of data.upcomingMeetings) {
      const when = new Date(m.next_meeting_at);
      const facts = (m.brief || []).filter((f) => f.importance || f.kind === 'date').slice(0, 4);
      const card = el(`<div class="card cat-${esc(m.category)}">
        <div class="person-row" style="margin-bottom:8px">
          <div class="meta"><div class="name">${esc(m.person_name)}</div>
          <div class="sub">${when.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div></div>
          <span class="pill cat-${esc(m.category)}">${esc(CATS[m.category])}</span>
        </div>
        ${facts.length ? '<div class="brief-facts">' + facts.map((f) => `<div class="kv">• ${esc(f.label)}${f.on_date ? ' <span class="muted">(' + esc(f.on_date) + ')</span>' : ''}</div>`).join('') + '</div>' : '<div class="kv muted">No key facts recorded yet.</div>'}
      </div>`);
      card.querySelector('.person-row').style.cursor = 'pointer';
      card.querySelector('.person-row').addEventListener('click', () => navigate('person', { id: m.person_id }));
      root.appendChild(card);
    }
  }

  // Reminders
  root.appendChild(el('<div class="section-title">Coming up (next 30 days)</div>'));
  if (!data.reminders.length) {
    root.appendChild(el('<div class="card"><div class="kv muted">No birthdays or events coming up.</div></div>'));
  } else {
    for (const r of data.reminders) {
      const label = r.days_until === 0 ? 'TODAY' : r.days_until === 1 ? '1 day' : r.days_until + ' days';
      const icon = r.type === 'birthday' ? '🎂' : '📌';
      const card = el(`<div class="card"><div class="reminder">
        <div class="when ${r.days_until <= 3 ? 'soon' : ''}">${esc(label)}<small>${r.type === 'birthday' ? 'birthday' : 'event'}</small></div>
        <div class="meta"><div class="name">${icon} ${esc(r.person_name)}</div><div class="sub">${esc(r.label)}</div></div>
      </div></div>`);
      card.addEventListener('click', () => navigate('person', { id: r.person_id }));
      root.appendChild(card);
    }
  }

  // Recently added
  if (data.recentlyAdded.length) {
    root.appendChild(el('<div class="section-title">Recently added</div>'));
    for (const p of data.recentlyAdded) root.appendChild(personRow(p));
  }
}

async function renderList(root, { category, q, title }) {
  setTitle(title, false);
  root.innerHTML = '<p class="empty">Loading…</p>';
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const people = await api('/people?' + params.toString());
  root.innerHTML = '';
  if (!people.length) {
    root.appendChild(el(`<div class="empty">${q ? 'No matches.' : 'No one here yet. Tap ＋ to add someone.'}</div>`));
    return;
  }
  for (const p of people) root.appendChild(personRow(p, { showCategory: !category }));
}

function fmtDate(iso, withTime) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], withTime
    ? { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' });
}

async function renderPerson(root, id) {
  root.innerHTML = '<p class="empty">Loading…</p>';
  const p = await api('/people/' + id);
  setTitle(p.name, true);
  root.innerHTML = '';

  root.appendChild(el(`<div class="detail-head">
    ${avatar(p)}
    <div><h2>${esc(p.name)}</h2><span class="pill cat-${esc(p.category)}">${esc(CATS[p.category])}</span></div>
  </div>`));

  // How we met
  const metBits = [];
  if (p.met_at) metBits.push(`<div class="kv"><b>When:</b> ${esc(fmtDate(p.met_at, true))}</div>`);
  if (p.met_place) metBits.push(`<div class="kv"><b>Where:</b> ${esc(p.met_place)}</div>`);
  if (p.met_how) metBits.push(`<div class="kv"><b>How:</b> ${esc(p.met_how)}</div>`);
  if (p.birthday) metBits.push(`<div class="kv"><b>Birthday:</b> ${esc(p.birthday)}</div>`);
  if (p.next_meeting_at) metBits.push(`<div class="kv"><b>Next meeting:</b> ${esc(fmtDate(p.next_meeting_at, true))}</div>`);
  if (metBits.length) root.appendChild(el(`<div class="card">${metBits.join('')}</div>`));

  // Profile summary (polished by Claude) + raw notes
  const summaryCard = el(`<div class="card">
    <div class="section-title" style="margin:0 0 8px">Profile</div>
    ${p.summary ? `<div class="summary-block">${esc(p.summary)}</div>` : '<div class="kv muted">No polished profile yet.</div>'}
    ${p.raw_notes ? `<details style="margin-top:10px"><summary class="muted">Brief notes</summary><div class="summary-block" style="margin-top:8px">${esc(p.raw_notes)}</div></details>` : ''}
  </div>`);
  root.appendChild(summaryCard);

  // Key facts / reminders
  const factsCard = el(`<div class="card"><div class="section-title" style="margin:0 0 8px">Key facts & reminders</div></div>`);
  if (p.facts.length) {
    for (const f of p.facts) {
      const fr = el(`<div class="fact">
        <span class="star">${f.importance ? '★' : f.kind === 'date' ? '📅' : '•'}</span>
        <div style="flex:1"><div>${esc(f.label)}</div>${f.on_date ? `<div class="kv muted">${esc(f.on_date)}${f.recurring ? ' · yearly' : ''}</div>` : ''}</div>
        <button class="ghost" data-del-fact="${f.id}">✕</button>
      </div>`);
      fr.querySelector('[data-del-fact]').addEventListener('click', async () => {
        await api('/facts/' + f.id, { method: 'DELETE' });
        renderPerson(root, id);
      });
      factsCard.appendChild(fr);
    }
  } else {
    factsCard.appendChild(el('<div class="kv muted">Nothing recorded yet.</div>'));
  }
  const addFactBtn = el('<button class="secondary" style="margin-top:10px">＋ Add a fact / reminder</button>');
  addFactBtn.addEventListener('click', () => openFactForm(p.id, () => renderPerson(root, id)));
  factsCard.appendChild(addFactBtn);
  root.appendChild(factsCard);

  // Encounter timeline
  const tl = el(`<div class="card"><div class="section-title" style="margin:0 0 8px">History (${p.encounters.length})</div></div>`);
  for (const e of p.encounters) {
    const item = el(`<div class="timeline-item">
      <div class="date">${esc(fmtDate(e.occurred_at, true))}${e.place ? ' · ' + esc(e.place) : ''}</div>
      <div class="summary-block">${esc(e.summary || e.raw_notes || '')}</div>
      ${e.summary && e.raw_notes ? `<details><summary class="muted" style="font-size:12px">notes</summary><div class="summary-block">${esc(e.raw_notes)}</div></details>` : ''}
      <button class="ghost" style="font-size:12px" data-del-enc="${e.id}">delete</button>
    </div>`);
    item.querySelector('[data-del-enc]').addEventListener('click', async () => {
      await api('/encounters/' + e.id, { method: 'DELETE' });
      renderPerson(root, id);
    });
    tl.appendChild(item);
  }
  const addEncBtn = el('<button class="secondary" style="margin-top:6px">＋ Log an interaction</button>');
  addEncBtn.addEventListener('click', () => openEncounterForm(p.id, () => renderPerson(root, id)));
  tl.appendChild(addEncBtn);
  root.appendChild(tl);

  // Actions
  const actions = el('<div class="row-actions"></div>');
  const editBtn = el('<button class="secondary">Edit details</button>');
  editBtn.addEventListener('click', () => openPersonForm(p));
  const delBtn = el('<button class="danger">Delete</button>');
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete ' + p.name + ' and all their history?')) return;
    await api('/people/' + p.id, { method: 'DELETE' });
    toast('Deleted');
    navigate('home', { back: true });
  });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  root.appendChild(actions);
}

function renderMore(root) {
  setTitle('More', false);
  root.innerHTML = '';
  for (const c of ['acquaintances', 'other']) {
    const b = el(`<div class="card person-row"><div class="meta"><div class="name">${CATS[c]}</div><div class="sub">Browse this section</div></div><span>›</span></div>`);
    b.addEventListener('click', () => navigate(c, { back: true }));
    root.appendChild(b);
  }
  const exp = el(`<div class="card person-row"><div class="meta"><div class="name">Export a backup</div><div class="sub">Download all your data as JSON</div></div><span>⤓</span></div>`);
  exp.addEventListener('click', exportBackup);
  root.appendChild(exp);

  const out = el(`<div class="card person-row"><div class="meta"><div class="name">Lock app</div><div class="sub">Sign out on this device</div></div><span>⏻</span></div>`);
  out.addEventListener('click', logout);
  root.appendChild(out);

  root.appendChild(el(`<div class="note-hint" style="margin-top:16px">💡 <b>Turning notes into profiles:</b> jot brief notes in any "notes" field, then paste them to Claude in chat and ask for a polished write-up. Paste the result back into the Profile or interaction summary.</div>`));
}

async function exportBackup() {
  const data = await api('/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'people-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Geolocation ----------
function captureLocation(statusEl, onDone) {
  if (!navigator.geolocation) { statusEl.textContent = 'Location not available on this device.'; return; }
  statusEl.textContent = '📍 Getting your location…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    let place = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
      // Reverse-geocode via OpenStreetMap (best effort; falls back to coords).
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`, { headers: { 'Accept-Language': 'en' } });
      const j = await r.json();
      const a = j.address || {};
      place = [a.amenity || a.shop || a.building, a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village]
        .filter(Boolean).slice(0, 3).join(', ') || j.display_name || place;
    } catch { /* keep coords */ }
    statusEl.textContent = '📍 ' + place;
    onDone({ lat, lng, place });
  }, () => {
    statusEl.textContent = 'Could not get location (permission denied).';
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// ---------- Sheet / forms ----------
function openSheet(bodyEl) {
  $('#sheet-body').innerHTML = '';
  $('#sheet-body').appendChild(bodyEl);
  $('#sheet').classList.remove('hidden');
}
function closeSheet() { $('#sheet').classList.add('hidden'); }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

function openPersonForm(existing) {
  const editing = !!existing;
  const p = existing || {};
  let chosenCat = p.category || 'acquaintances';
  const captured = { lat: p.met_lat, lng: p.met_lng, place: p.met_place };

  const body = el(`<div>
    <h3>${editing ? 'Edit person' : 'Add someone new'}</h3>
    <div class="field"><label>Name</label><input id="f-name" value="${esc(p.name || '')}" placeholder="Full name" /></div>
    <div class="field"><label>Section</label><div class="chip-row" id="f-cats"></div></div>
    <div class="field"><label>How you met</label><input id="f-how" value="${esc(p.met_how || '')}" placeholder="e.g. Through Sarah, at a conference" />
      <div class="chip-row" id="f-how-chips" style="margin-top:8px"></div></div>
    <div class="field"><label>Where ${editing ? '' : '(auto)'}</label>
      <input id="f-place" value="${esc(p.met_place || '')}" placeholder="Place you met" />
      <div class="geo-status" id="f-geo"></div>
      ${editing ? '' : '<button type="button" class="ghost" id="f-geo-btn" style="padding:6px 0">📍 Use my current location</button>'}
    </div>
    <div class="field"><label>Birthday (optional)</label><input id="f-bday" type="text" value="${esc(p.birthday || '')}" placeholder="YYYY-MM-DD or --MM-DD" /></div>
    <div class="field"><label>Brief notes</label><textarea id="f-notes" placeholder="Jot anything — you can polish it with Claude later">${esc(p.raw_notes || '')}</textarea></div>
    <div class="field"><label>Profile (polished write-up)</label><textarea id="f-summary" placeholder="Paste the readable version here">${esc(p.summary || '')}</textarea></div>
    <div class="sheet-actions">
      <button class="secondary" id="f-cancel" type="button">Cancel</button>
      <button id="f-save" type="button">${editing ? 'Save' : 'Add person'}</button>
    </div>
  </div>`);

  // Category chips
  const catRow = body.querySelector('#f-cats');
  for (const c of CAT_ORDER) {
    const chip = el(`<button type="button" class="chip ${c === chosenCat ? 'active' : ''}" data-c="${c}">${CATS[c]}</button>`);
    chip.addEventListener('click', () => {
      chosenCat = c;
      catRow.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.dataset.c === c));
    });
    catRow.appendChild(chip);
  }
  // Quick "how" suggestions
  const howRow = body.querySelector('#f-how-chips');
  for (const h of ['In person', 'Through a friend', 'At work', 'Dating app', 'Event / conference', 'Online']) {
    const chip = el(`<button type="button" class="chip" data-h="${esc(h)}">${esc(h)}</button>`);
    chip.addEventListener('click', () => { body.querySelector('#f-how').value = h; });
    howRow.appendChild(chip);
  }

  const geoStatus = body.querySelector('#f-geo');
  const placeInput = body.querySelector('#f-place');
  const triggerGeo = () => captureLocation(geoStatus, ({ lat, lng, place }) => {
    captured.lat = lat; captured.lng = lng; captured.place = place;
    if (!placeInput.value) placeInput.value = place;
  });
  if (!editing) {
    body.querySelector('#f-geo-btn').addEventListener('click', triggerGeo);
    triggerGeo(); // auto-capture on open (browser will prompt for permission)
  }

  body.querySelector('#f-cancel').addEventListener('click', closeSheet);
  body.querySelector('#f-save').addEventListener('click', async () => {
    const name = body.querySelector('#f-name').value.trim();
    if (!name) { toast('Please enter a name'); return; }
    const payload = {
      name,
      category: chosenCat,
      met_how: body.querySelector('#f-how').value.trim() || null,
      met_place: placeInput.value.trim() || captured.place || null,
      met_lat: captured.lat ?? null,
      met_lng: captured.lng ?? null,
      birthday: body.querySelector('#f-bday').value.trim() || null,
      raw_notes: body.querySelector('#f-notes').value.trim() || null,
      summary: body.querySelector('#f-summary').value.trim() || null,
    };
    try {
      let saved;
      if (editing) saved = await api('/people/' + p.id, { method: 'PATCH', body: JSON.stringify(payload) });
      else saved = await api('/people', { method: 'POST', body: JSON.stringify(payload) });
      closeSheet();
      toast(editing ? 'Saved' : 'Added ' + name);
      navigate('person', { id: saved.id, back: true });
    } catch (err) { toast(err.message); }
  });

  openSheet(body);
}

function openEncounterForm(personId, onDone) {
  const captured = {};
  const body = el(`<div>
    <h3>Log an interaction</h3>
    <div class="note-hint">Time is recorded automatically. Jot brief notes — polish with Claude later.</div>
    <div class="field"><label>Where</label><input id="e-place" placeholder="Place" />
      <div class="geo-status" id="e-geo"></div>
      <button type="button" class="ghost" id="e-geo-btn" style="padding:6px 0">📍 Use my current location</button></div>
    <div class="field"><label>What happened / what you discussed</label><textarea id="e-notes" placeholder="Brief notes"></textarea></div>
    <div class="field"><label>Polished summary (optional)</label><textarea id="e-summary" placeholder="Paste a tidy version here"></textarea></div>
    <div class="sheet-actions"><button class="secondary" id="e-cancel" type="button">Cancel</button><button id="e-save" type="button">Save</button></div>
  </div>`);
  const geoStatus = body.querySelector('#e-geo');
  body.querySelector('#e-geo-btn').addEventListener('click', () => captureLocation(geoStatus, ({ lat, lng, place }) => {
    captured.lat = lat; captured.lng = lng; captured.place = place;
    if (!body.querySelector('#e-place').value) body.querySelector('#e-place').value = place;
  }));
  body.querySelector('#e-cancel').addEventListener('click', closeSheet);
  body.querySelector('#e-save').addEventListener('click', async () => {
    await api('/people/' + personId + '/encounters', {
      method: 'POST',
      body: JSON.stringify({
        place: body.querySelector('#e-place').value.trim() || captured.place || null,
        lat: captured.lat ?? null, lng: captured.lng ?? null,
        raw_notes: body.querySelector('#e-notes').value.trim() || null,
        summary: body.querySelector('#e-summary').value.trim() || null,
      }),
    });
    closeSheet();
    toast('Logged');
    onDone();
  });
  openSheet(body);
}

function openFactForm(personId, onDone) {
  let kind = 'fact';
  const body = el(`<div>
    <h3>Add a fact or reminder</h3>
    <div class="field"><label>Type</label><div class="chip-row" id="k-row">
      <button type="button" class="chip active" data-k="fact">Fact to remember</button>
      <button type="button" class="chip" data-k="date">Important date</button>
    </div></div>
    <div class="field"><label>Detail</label><input id="k-label" placeholder="e.g. Allergic to nuts / Daughter's wedding" /></div>
    <div class="field" id="k-date-wrap" style="display:none">
      <label>Date</label><input id="k-date" type="text" placeholder="YYYY-MM-DD or --MM-DD" />
      <label style="margin-top:8px"><input type="checkbox" id="k-recur" style="width:auto;margin-right:6px" />Repeats every year</label>
    </div>
    <div class="field"><label><input type="checkbox" id="k-imp" style="width:auto;margin-right:6px" />Mark as important (shows in your briefs)</label></div>
    <div class="sheet-actions"><button class="secondary" id="k-cancel" type="button">Cancel</button><button id="k-save" type="button">Save</button></div>
  </div>`);
  body.querySelectorAll('#k-row .chip').forEach((c) => c.addEventListener('click', () => {
    kind = c.dataset.k;
    body.querySelectorAll('#k-row .chip').forEach((x) => x.classList.toggle('active', x === c));
    body.querySelector('#k-date-wrap').style.display = kind === 'date' ? 'block' : 'none';
  }));
  body.querySelector('#k-cancel').addEventListener('click', closeSheet);
  body.querySelector('#k-save').addEventListener('click', async () => {
    const label = body.querySelector('#k-label').value.trim();
    if (!label) { toast('Please enter a detail'); return; }
    await api('/people/' + personId + '/facts', {
      method: 'POST',
      body: JSON.stringify({
        label, kind,
        on_date: kind === 'date' ? (body.querySelector('#k-date').value.trim() || null) : null,
        recurring: kind === 'date' && body.querySelector('#k-recur').checked ? 1 : 0,
        importance: body.querySelector('#k-imp').checked ? 1 : 0,
      }),
    });
    closeSheet();
    toast('Saved');
    onDone();
  });
  openSheet(body);
}

// ---------- Boot ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
if (state.token) showApp(); else $('#login').classList.remove('hidden');
