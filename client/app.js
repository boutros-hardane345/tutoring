/* TutorTrack frontend — vanilla ES6+, API-only (MongoDB Atlas via Express) */
'use strict';

const $ = (id) => document.getElementById(id);
const els = {};
[
  'monthPicker', 'dbStatus', 'backupBtn', 'restoreBtn', 'restoreFile',
  'statStudents', 'statHours', 'statBilled', 'statCollected',
  'searchInput', 'gradeFilter', 'addStudentBtn',
  'loadingBar', 'errorBar', 'studentGrid', 'emptyState', 'noResultState', 'emptyAddBtn',
  'studentModal', 'studentModalTitle', 'studentForm', 'studentId', 'fName', 'fGrade', 'fSubjects', 'fRate',
  'sessionModal', 'sessionModalTitle', 'sessionForm', 'sId', 'sStudentId', 'sDatetime', 'sDuration',
  'sessionStudentLine', 'sessionCostPreview', 'hourChips',
  'paymentModal', 'paymentForm', 'pStudentId', 'pStudentName', 'pDate', 'pAmount', 'pNote',
  'historyModal', 'historyTitle', 'historySub', 'historyList',
  'statementModal', 'statementTitle', 'statementBody', 'copyStatementBtn',
  'confirmModal', 'confirmTitle', 'confirmText', 'confirmYes', 'toasts',
  'plannerStudentFilter', 'plannerGrid', 'plannerEmpty', 'plannerHint', 'addSlotBtn',
  'slotModal', 'slotModalTitle', 'slotForm', 'slotId', 'slotStudent', 'slotDay', 'slotStart', 'slotEnd',
  'pendingCards', 'paymentsList', 'onlyDueCheck', 'pendingMonthLabel', 'paymentsMonthLabel', 'pendingCount'
].forEach((id) => { els[id] = $(id); });

const state = { students: [], sessionsMonth: [], paymentsMonth: [], schedules: [], statement: null, view: 'students', sessionStudent: null };
let confirmCb = null;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const PALETTE = ['#6366f1', '#059669', '#d97706', '#db2777', '#0891b2', '#7c3aed', '#dc2626', '#65a30d'];

function colorFor(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function getMonth() { return (els.monthPicker && els.monthPicker.value) || currentMonthKey(); }
function fmtUSD(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDay(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, type) {
  if (!els.toasts) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  els.toasts.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function showError(msg) {
  if (!els.errorBar) return;
  if (!msg) { els.errorBar.hidden = true; els.errorBar.textContent = ''; return; }
  els.errorBar.hidden = false;
  els.errorBar.textContent = msg;
}
function setLoading(on) { if (els.loadingBar) els.loadingBar.hidden = !on; }

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function openModal(m) { if (m) m.hidden = false; }
function closeModal(m) { if (m) m.hidden = true; }
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => b.closest('.overlay').hidden = true);
});
document.querySelectorAll('.overlay').forEach((o) => {
  o.addEventListener('click', (e) => { if (e.target === o) o.hidden = true; });
});

function askConfirm(title, text, cb) {
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  confirmCb = cb;
  openModal(els.confirmModal);
}
if (els.confirmYes) els.confirmYes.addEventListener('click', () => {
  closeModal(els.confirmModal);
  if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); }
});

// ---- View tabs ----
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchView(t.dataset.view));
});
function switchView(v) {
  state.view = v;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  if ($('studentsView')) $('studentsView').hidden = v !== 'students';
  if ($('plannerView')) $('plannerView').hidden = v !== 'planner';
  if ($('pendingView')) $('pendingView').hidden = v !== 'pending';
  if (v === 'planner') loadPlanner();
  if (v === 'pending') renderPending();
}

async function checkHealth() {
  try {
    const h = await api('/api/health');
    const ok = h && h.db === 'connected';
    if (els.dbStatus) {
      els.dbStatus.textContent = ok ? '● DB connected' : '● DB: ' + (h.db || 'unknown');
      els.dbStatus.className = 'db-badge ' + (ok ? 'ok' : 'down');
    }
    return ok;
  } catch (e) {
    if (els.dbStatus) { els.dbStatus.textContent = '● API offline'; els.dbStatus.className = 'db-badge down'; }
    return false;
  }
}

async function loadAll() {
  setLoading(true);
  showError('');
  try {
    const month = getMonth();
    const search = (els.searchInput && els.searchInput.value || '').trim();
    const grade = (els.gradeFilter && els.gradeFilter.value) || '';
    const qs = new URLSearchParams({ month });
    const [stats, students, sessions, payments] = await Promise.all([
      api('/api/stats?' + qs.toString()),
      api('/api/students?' + new URLSearchParams({ search, ...(grade ? { grade } : {}) }).toString()),
      api('/api/sessions?' + qs.toString()),
      api('/api/payments?' + qs.toString())
    ]);
    state.students = students;
    state.sessionsMonth = sessions; // STRICTLY this month — no accumulation
    state.paymentsMonth = payments; // STRICTLY this month
    renderStats(stats);
    renderStudents();
    syncStudentSelects();
    if (state.view === 'pending') renderPending();
    if (state.view === 'planner') loadPlanner(true);
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

function renderStats(s) {
  if (!s) return;
  if (els.statStudents) els.statStudents.textContent = s.activeStudents;
  if (els.statHours) els.statHours.textContent = Number(s.hours).toFixed(1) + 'h';
  if (els.statBilled) els.statBilled.textContent = fmtUSD(s.billed);
  if (els.statCollected) els.statCollected.textContent = `${fmtUSD(s.collected)} / ${fmtUSD(s.pending)}`;
  if (els.pendingMonthLabel) els.pendingMonthLabel.textContent = getMonth();
  if (els.paymentsMonthLabel) els.paymentsMonthLabel.textContent = '· ' + getMonth();
}

async function loadGrades() {
  try {
    const grades = await api('/api/students/meta/grades');
    if (!els.gradeFilter) return;
    const cur = els.gradeFilter.value;
    els.gradeFilter.innerHTML = '<option value="">All grades</option>' +
      grades.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (grades.includes(cur)) els.gradeFilter.value = cur;
  } catch (e) { /* non-fatal */ }
}

function syncStudentSelects() {
  if (els.plannerStudentFilter) {
    const cur = els.plannerStudentFilter.value;
    els.plannerStudentFilter.innerHTML = '<option value="">All students</option>' +
      state.students.map((s) => `<option value="${s._id}">${esc(s.name)}</option>`).join('');
    if (state.students.some((s) => String(s._id) === String(cur))) els.plannerStudentFilter.value = cur;
  }
  if (els.slotStudent) {
    const cur = els.slotStudent.value;
    els.slotStudent.innerHTML = state.students.map((s) => `<option value="${s._id}">${esc(s.name)} — ${esc(s.grade)}</option>`).join('');
    if (cur && state.students.some((s) => String(s._id) === String(cur))) els.slotStudent.value = cur;
  }
}

function perStudentBalance(id) {
  // Month-scoped only: sessionsMonth + paymentsMonth already filtered by month
  const sess = state.sessionsMonth.filter((s) => String(s.studentId) === String(id));
  const pays = state.paymentsMonth.filter((p) => String(p.studentId) === String(id));
  const hrs = sess.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const billed = sess.reduce((a, s) => a + (Number(s.costSnapshot) || 0), 0);
  const paid = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { hrs, billed, paid, due: billed - paid, count: sess.length };
}

function studentById(id) {
  return state.students.find((s) => String(s._id) === String(id));
}

function renderStudents() {
  if (!els.studentGrid) return;
  const list = state.students;
  els.studentGrid.innerHTML = '';
  const showEmpty = list.length === 0;
  if (els.emptyState) els.emptyState.hidden = !showEmpty;
  if (els.noResultState) {
    const filtering = ((els.searchInput && els.searchInput.value) || (els.gradeFilter && els.gradeFilter.value));
    els.noResultState.hidden = !(list.length === 0 && filtering);
    if (els.emptyState && filtering) els.emptyState.hidden = true;
  }
  const month = getMonth();
  list.forEach((st) => {
    const b = perStudentBalance(st._id);
    const color = colorFor(st._id);
    const card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--accent', color);
    card.innerHTML = `
      <h3>${esc(st.name)}</h3>
      <div class="meta">
        <span class="badge">${esc(st.grade)}</span>
        <span class="badge rate">${fmtUSD(st.ratePerHour)}/hr</span>
        <span class="badge month-tag">${esc(month)}</span>
      </div>
      <div class="meta"><i class="fa-solid fa-book"></i> ${esc(st.subjects)}</div>
      <div class="balance">
        <div><span>Hours</span><strong>${b.hrs.toFixed(1)}</strong></div>
        <div><span>Billed</span><strong>${esc(fmtUSD(b.billed))}</strong></div>
        <div><span>Paid</span><strong>${esc(fmtUSD(b.paid))}</strong></div>
        <div class="due"><span>Due</span><strong>${esc(fmtUSD(b.due))}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn small primary" data-act="session"><i class="fa-solid fa-plus"></i> Log Session</button>
        <button class="btn small ghost" data-act="pay"><i class="fa-solid fa-money-bill"></i> Payment</button>
        <button class="btn small ghost" data-act="statement"><i class="fa-solid fa-file-lines"></i> Statement</button>
        <button class="btn small ghost" data-act="history"><i class="fa-solid fa-clock-rotate-left"></i> History</button>
        <button class="btn small ghost" data-act="edit"><i class="fa-solid fa-pen"></i></button>
        <button class="btn small ghost" data-act="del"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    card.querySelector('[data-act="session"]').addEventListener('click', () => openSessionModal(st));
    card.querySelector('[data-act="pay"]').addEventListener('click', () => openPaymentModal(st));
    card.querySelector('[data-act="statement"]').addEventListener('click', () => openStatement(st));
    card.querySelector('[data-act="history"]').addEventListener('click', () => openHistory(st));
    card.querySelector('[data-act="edit"]').addEventListener('click', () => openStudentModal(st));
    card.querySelector('[data-act="del"]').addEventListener('click', () => {
      askConfirm('Delete student?', `Remove ${st.name} and ALL their sessions/payments/schedule?`, async () => {
        try { await api('/api/students/' + st._id, { method: 'DELETE' }); toast('Student deleted.', 'success'); await loadGrades(); await loadAll(); }
        catch (e) { toast(e.message, 'error'); }
      });
    });
    els.studentGrid.appendChild(card);
  });
}

// ---- Students ----
function openStudentModal(st) {
  if (els.studentModalTitle) els.studentModalTitle.textContent = st ? 'Edit Student' : 'Add Student';
  els.studentId.value = st ? st._id : '';
  els.fName.value = st ? st.name : '';
  els.fGrade.value = st ? st.grade : '';
  els.fSubjects.value = st ? st.subjects : '';
  els.fRate.value = st ? st.ratePerHour : '';
  openModal(els.studentModal);
}
if (els.studentForm) els.studentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = els.studentId.value;
  const body = {
    name: els.fName.value.trim(),
    grade: els.fGrade.value.trim(),
    subjects: els.fSubjects.value.trim(),
    ratePerHour: Number(els.fRate.value)
  };
  if (!body.name || !body.grade || !body.subjects) return toast('All fields are required.', 'error');
  if (!Number.isFinite(body.ratePerHour) || body.ratePerHour <= 0) return toast('Cost per hour must be positive.', 'error');
  try {
    if (id) await api('/api/students/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/students', { method: 'POST', body: JSON.stringify(body) });
    closeModal(els.studentModal);
    toast('Student saved.', 'success');
    await loadGrades(); await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

// ---- Sessions: SIMPLIFIED Day + Hours ----
function todayInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toISODateOnly(dateStr) {
  return new Date(dateStr + 'T12:00:00').toISOString();
}
function updateCostPreview() {
  if (!els.sessionCostPreview) return;
  const st = state.sessionStudent;
  const h = Number(els.sDuration.value);
  if (!st || !Number.isFinite(h) || h <= 0) { els.sessionCostPreview.textContent = 'Pick hours to see cost…'; return; }
  const cost = Math.round(h * Number(st.ratePerHour) * 100) / 100;
  els.sessionCostPreview.innerHTML = `💰 <strong>${Number(h).toFixed(2)}h</strong> × ${esc(fmtUSD(st.ratePerHour))}/hr = <strong>${esc(fmtUSD(cost))}</strong>`;
}
function openSessionModal(st, sess) {
  state.sessionStudent = st || (sess ? studentById(sess.studentId) : null);
  const name = state.sessionStudent ? state.sessionStudent.name : '';
  els.sessionModalTitle.textContent = sess ? 'Edit Session' : `Log Session — ${name}`;
  if (els.sessionStudentLine && state.sessionStudent) {
    els.sessionStudentLine.textContent = `${name} · ${fmtUSD(state.sessionStudent.ratePerHour)}/hr · ${getMonth()} (this month only)`;
  }
  els.sId.value = sess ? sess._id : '';
  els.sStudentId.value = sess ? sess.studentId : (state.sessionStudent ? state.sessionStudent._id : '');
  els.sDatetime.value = sess ? new Date(sess.datetimeISO).toISOString().slice(0, 10) : todayInput();
  els.sDuration.value = sess ? sess.duration : '';
  updateCostPreview();
  openModal(els.sessionModal);
  setTimeout(() => els.sDuration && els.sDuration.focus(), 50);
}
if (els.sDuration) els.sDuration.addEventListener('input', () => {
  document.querySelectorAll('#hourChips .chip').forEach((c) => {
    c.classList.toggle('on', Number(c.dataset.h) === Number(els.sDuration.value));
  });
  updateCostPreview();
});
document.querySelectorAll('#hourChips .chip').forEach((c) => {
  c.addEventListener('click', () => {
    els.sDuration.value = c.dataset.h;
    document.querySelectorAll('#hourChips .chip').forEach((x) => x.classList.toggle('on', x === c));
    updateCostPreview();
    els.sDuration.focus();
  });
});
if (els.sessionForm) els.sessionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = els.sId.value;
  const dur = Number(els.sDuration.value);
  if (!els.sDatetime.value) return toast('Day is required — pick a date.', 'error');
  if (!Number.isFinite(dur) || dur <= 0 || dur > 24) return toast('Hours must be 0.25–24.', 'error');
  const body = {
    studentId: els.sStudentId.value,
    datetimeISO: toISODateOnly(els.sDatetime.value),
    duration: dur
  };
  try {
    if (id) await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });
    closeModal(els.sessionModal);
    toast(`Saved ${dur}h on ${els.sDatetime.value}.`, 'success');
    await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

// ---- Planner ----
if (els.plannerStudentFilter) els.plannerStudentFilter.addEventListener('change', renderPlanner);
if (els.addSlotBtn) els.addSlotBtn.addEventListener('click', () => openSlotModal(null));
if (els.onlyDueCheck) els.onlyDueCheck.addEventListener('change', renderPending);

async function loadPlanner(keepFilter) {
  try {
    const filter = els.plannerStudentFilter ? els.plannerStudentFilter.value : '';
    const qs = filter ? '?studentId=' + filter : '';
    // Always fetch all, filter client-side so switching filter is instant
    const all = await api('/api/schedules' + (keepFilter && filter ? '?studentId=' + filter : ''));
    state.schedules = all;
    renderPlanner();
  } catch (e) { toast(e.message, 'error'); }
}

function toMin(t) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function toHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderPlanner() {
  if (!els.plannerGrid) return;
  const filter = els.plannerStudentFilter ? els.plannerStudentFilter.value : '';
  const sidOf = (s) => String((s.studentId && s.studentId._id) || s.studentId);
  const slots = (filter ? state.schedules.filter((s) => sidOf(s) === String(filter)) : state.schedules)
    .filter((s) => toMin(s.start) != null && toMin(s.end) != null)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  els.plannerGrid.innerHTML = '';
  if (els.plannerEmpty) els.plannerEmpty.hidden = slots.length > 0;
  const todayDow = new Date().getDay();

  // Time range: snap to 30min, default 08:00–22:00, auto-extend for out-of-range slots
  let minT = 8 * 60, maxT = 22 * 60;
  slots.forEach((s) => {
    const a = toMin(s.start), b = toMin(s.end);
    if (a != null) minT = Math.min(minT, Math.floor(a / 30) * 30);
    if (b != null) maxT = Math.max(maxT, Math.ceil(b / 30) * 30);
  });
  if (maxT <= minT) maxT = minT + 60;

  const table = document.createElement('table');
  table.className = 'week-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.innerHTML = '<th class="tt-time">Time</th>';
  DAY_ORDER.forEach((d) => {
    const th = document.createElement('th');
    th.className = todayDow === d ? 'tt-day is-today' : 'tt-day';
    th.innerHTML = `<span>${DAY_NAMES[d]}${todayDow === d ? ' • today' : ''}</span> `;
    const plus = document.createElement('button');
    plus.className = 'btn small ghost tt-add';
    plus.innerHTML = '<i class="fa-solid fa-plus"></i>';
    plus.title = 'Add slot on ' + DAY_NAMES[d];
    plus.addEventListener('click', () => openSlotModal(null, d, filter || undefined));
    th.appendChild(plus);
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!slots.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="tt-time">—</td>` + DAY_ORDER.map(() => '<td class="tt-cell"><span class="muted">—</span></td>').join('');
    tbody.appendChild(tr);
  }
  for (let r = minT; r < maxT; r += 30) {
    const tr = document.createElement('tr');
    const timeTd = document.createElement('td');
    timeTd.className = 'tt-time';
    timeTd.textContent = toHHMM(r);
    tr.appendChild(timeTd);
    DAY_ORDER.forEach((d) => {
      const td = document.createElement('td');
      td.className = 'tt-cell';
      const starting = slots
        .filter((s) => Number(s.dayOfWeek) === d)
        .filter((s) => { const a = toMin(s.start); return a >= r && a < r + 30; });
      starting.forEach((s) => {
        const sid = sidOf(s);
        const st = studentById(sid);
        const name = (s.studentId && s.studentId.name) || (st && st.name) || 'Student';
        const color = colorFor(sid);
        const durMin = toMin(s.end) - toMin(s.start);
        const block = document.createElement('div');
        block.className = 'tt-block';
        block.style.borderLeftColor = color;
        block.style.minHeight = Math.max(44, Math.round((durMin / 30) * 40)) + 'px';
        block.innerHTML = `
          <strong>${esc(name)}</strong>
          <span class="tt-hours">${esc(s.start)} – ${esc(s.end)}</span>
          <span class="tt-actions">
            <button class="icon-btn" data-a="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn" data-a="log" title="Log session"><i class="fa-solid fa-plus"></i></button>
            <button class="icon-btn danger" data-a="del" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </span>`;
        block.querySelector('[data-a="edit"]').addEventListener('click', () => openSlotModal(s));
        block.querySelector('[data-a="del"]').addEventListener('click', () => {
          askConfirm('Delete slot?', `${name} · ${DAY_NAMES[d]} ${s.start}–${s.end}?`, async () => {
            try { await api('/api/schedules/' + s._id, { method: 'DELETE' }); toast('Slot deleted.', 'success'); loadPlanner(true); }
            catch (err) { toast(err.message, 'error'); }
          });
        });
        block.querySelector('[data-a="log"]').addEventListener('click', () => {
          const target = studentById(sid);
          if (target) openSessionModal(target, null);
          else toast('Student not found.', 'error');
        });
        td.appendChild(block);
      });
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  els.plannerGrid.appendChild(table);
}

function openSlotModal(slot, presetDay, presetStudent) {
  els.slotModalTitle.textContent = slot ? 'Edit time slot' : 'Add time slot';
  els.slotId.value = slot ? slot._id : '';
  const sid = slot ? (slot.studentId && slot.studentId._id ? slot.studentId._id : slot.studentId) : (presetStudent || (els.plannerStudentFilter && els.plannerStudentFilter.value) || (state.students[0] && state.students[0]._id) || '');
  if (els.slotStudent) els.slotStudent.value = sid;
  if (els.slotDay) els.slotDay.value = String(slot ? slot.dayOfWeek : (presetDay != null ? presetDay : 1));
  if (els.slotStart) els.slotStart.value = slot ? slot.start : '16:00';
  if (els.slotEnd) els.slotEnd.value = slot ? slot.end : '17:30';
  openModal(els.slotModal);
}
if (els.slotForm) els.slotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = els.slotId.value;
  const body = { studentId: els.slotStudent.value, dayOfWeek: Number(els.slotDay.value), start: els.slotStart.value, end: els.slotEnd.value };
  if (!body.studentId) return toast('Pick a student.', 'error');
  try {
    if (id) await api('/api/schedules/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/schedules', { method: 'POST', body: JSON.stringify(body) });
    closeModal(els.slotModal);
    toast('Schedule saved.', 'success');
    await loadPlanner(true);
  } catch (err) { toast(err.message, 'error'); }
});

// ---- Pending payments page (month-scoped, manageable) ----
function renderPending() {
  if (!els.pendingCards) return;
  const month = getMonth();
  const onlyDue = els.onlyDueCheck ? els.onlyDueCheck.checked : true;
  let list = state.students.map((st) => ({ st, b: perStudentBalance(st._id) }));
  const dueCount = list.filter((x) => x.b.due > 0.005).length;
  if (els.pendingCount) {
    els.pendingCount.hidden = dueCount === 0;
    els.pendingCount.textContent = dueCount;
  }
  if (onlyDue) list = list.filter((x) => x.b.due > 0.005);
  els.pendingCards.innerHTML = '';
  if (!list.length) {
    els.pendingCards.innerHTML = `<div class="empty"><i class="fa-solid fa-circle-check"></i><h3>All settled for ${esc(month)}</h3><p>No pending dues this month. Uncheck the filter to see everyone.</p></div>`;
  }
  list.forEach(({ st, b }) => {
    const color = colorFor(st._id);
    const card = document.createElement('div');
    card.className = 'card' + (b.due > 0.005 ? ' is-due' : ' is-paid');
    card.style.setProperty('--accent', color);
    card.innerHTML = `
      <h3>${esc(st.name)}</h3>
      <div class="meta"><span class="badge">${esc(st.grade)}</span><span class="badge month-tag">${esc(month)}</span>
      <span class="badge ${b.due > 0.005 ? 'badge-pending' : 'badge-done'}">${b.due > 0.005 ? 'Due ' + esc(fmtUSD(b.due)) : 'Paid ✓'}</span></div>
      <div class="balance">
        <div><span>Hours</span><strong>${b.hrs.toFixed(1)}</strong></div>
        <div><span>Billed</span><strong>${esc(fmtUSD(b.billed))}</strong></div>
        <div><span>Paid</span><strong>${esc(fmtUSD(b.paid))}</strong></div>
        <div class="due"><span>Due</span><strong>${esc(fmtUSD(b.due))}</strong></div>
      </div>
      <div class="card-actions">
        <button class="btn small primary" data-a="pay"><i class="fa-solid fa-money-bill"></i> Record payment</button>
        <button class="btn small ghost" data-a="stmt"><i class="fa-solid fa-file-lines"></i> Statement</button>
        <button class="btn small ghost" data-a="hist"><i class="fa-solid fa-clock-rotate-left"></i> Sessions</button>
      </div>`;
    card.querySelector('[data-a="pay"]').addEventListener('click', () => openPaymentModal(st));
    card.querySelector('[data-a="stmt"]').addEventListener('click', () => openStatement(st));
    card.querySelector('[data-a="hist"]').addEventListener('click', () => openHistory(st));
    els.pendingCards.appendChild(card);
  });
  // payments list for this month with delete/manage
  els.paymentsList.innerHTML = '';
  const pays = [...state.paymentsMonth].sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  if (!pays.length) {
    els.paymentsList.innerHTML = `<p class="muted">No payments recorded in ${esc(month)}.</p>`;
    return;
  }
  pays.forEach((p) => {
    const st = studentById(p.studentId);
    const div = document.createElement('div');
    div.className = 'hist-item';
    div.innerHTML = `
      <div class="row"><strong>${esc(st ? st.name : '—')}</strong><span class="badge rate">${esc(fmtUSD(p.amount))}</span></div>
      <div class="muted">${esc(fmtDay(p.dateISO))}${p.note ? ' · ' + esc(p.note) : ''}</div>
      <div class="row"><span></span><button class="btn small ghost" data-d="del"><i class="fa-solid fa-trash"></i> Remove</button></div>`;
    div.querySelector('[data-d="del"]').addEventListener('click', () => {
      askConfirm('Remove payment?', `${fmtUSD(p.amount)} on ${fmtDay(p.dateISO)}?`, async () => {
        try { await api('/api/payments/' + p._id, { method: 'DELETE' }); toast('Payment removed.', 'success'); await loadAll(); }
        catch (err) { toast(err.message, 'error'); }
      });
    });
    els.paymentsList.appendChild(div);
  });
}

// ---- Payments ----
function openPaymentModal(st) {
  els.pStudentId.value = st._id;
  if (els.pStudentName) els.pStudentName.textContent = `${st.name} — due this month (${getMonth()}): ${fmtUSD(perStudentBalance(st._id).due)}`;
  els.pDate.value = new Date().toISOString().slice(0, 10);
  els.pAmount.value = '';
  els.pNote.value = '';
  openModal(els.paymentModal);
}
if (els.paymentForm) els.paymentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const amt = Number(els.pAmount.value);
  if (!els.pDate.value) return toast('Payment date is required.', 'error');
  if (!Number.isFinite(amt) || amt <= 0) return toast('Amount must be positive.', 'error');
  try {
    await api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({
        studentId: els.pStudentId.value,
        dateISO: new Date(els.pDate.value + 'T12:00:00').toISOString(),
        amount: amt,
        note: els.pNote.value.trim()
      })
    });
    closeModal(els.paymentModal);
    toast('Payment recorded.', 'success');
    await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

// ---- History (STRICT month filter) ----
async function openHistory(st) {
  const month = getMonth();
  els.historyTitle.textContent = `History — ${st.name}`;
  if (els.historySub) els.historySub.textContent = `Showing only ${month} · no accumulation from other months`;
  els.historyList.innerHTML = '<p class="muted">Loading…</p>';
  openModal(els.historyModal);
  try {
    const items = await api(`/api/sessions?studentId=${st._id}&month=${month}`);
    if (!items.length) { els.historyList.innerHTML = `<p class="muted">No sessions in ${esc(month)}.</p>`; return; }
    els.historyList.innerHTML = '';
    items.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'hist-item';
      div.innerHTML = `
        <div class="row"><strong>📅 ${esc(fmtDate(s.datetimeISO))}</strong>
          <span class="badge rate">${Number(s.duration).toFixed(2)}h · ${esc(fmtUSD(s.costSnapshot))}</span></div>
        <div class="row">
          <span></span>
          <span>
            <button class="btn small ghost" data-h="edit"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn small ghost" data-h="del"><i class="fa-solid fa-trash"></i></button>
          </span>
        </div>`;
      div.querySelector('[data-h="edit"]').addEventListener('click', () => { closeModal(els.historyModal); openSessionModal(st, s); });
      div.querySelector('[data-h="del"]').addEventListener('click', () => {
        askConfirm('Delete session?', 'Remove this session permanently?', async () => {
          try { await api('/api/sessions/' + s._id, { method: 'DELETE' }); toast('Session deleted.', 'success'); closeModal(els.historyModal); loadAll(); }
          catch (err) { toast(err.message, 'error'); }
        });
      });
      els.historyList.appendChild(div);
    });
  } catch (err) { els.historyList.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}

// ---- Statement (month-scoped) ----
async function openStatement(st) {
  const month = getMonth();
  els.statementTitle.textContent = `Statement — ${st.name} · ${month}`;
  els.statementBody.innerHTML = '<p class="muted">Loading…</p>';
  openModal(els.statementModal);
  try {
    const d = await api(`/api/statements/statement?studentId=${st._id}&month=${month}`);
    state.statement = d;
    const rows = d.sessions.map((s) => `
      <tr>
        <td>${esc(fmtDay(s.datetimeISO))}</td>
        <td>${Number(s.duration).toFixed(2)}h</td>
        <td>${esc(fmtUSD(s.costSnapshot))}</td>
      </tr>`).join('') || '<tr><td colspan="3" class="muted">No sessions this month.</td></tr>';
    const payRows = d.payments.map((p) => `<div>${esc(fmtDay(p.dateISO))} — ${esc(fmtUSD(p.amount))}${p.note ? ' (' + esc(p.note) + ')' : ''}</div>`).join('') || '<div class="muted">No payments this month.</div>';
    els.statementBody.innerHTML = `
      <div class="stmt-total">
        <div>Month: <strong>${esc(d.month)}</strong> (no carry-over)</div>
        <div>Total hours: <strong>${Number(d.hours).toFixed(2)}h</strong></div>
        <div>Billed: <strong>${esc(fmtUSD(d.billed))}</strong> · Paid: <strong>${esc(fmtUSD(d.paid))}</strong> · Due: <strong>${esc(fmtUSD(d.due))}</strong></div>
      </div>
      <table class="stmt-table"><thead><tr><th>Day</th><th>Hours</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table>
      <h4>Payments</h4>${payRows}`;
  } catch (err) { els.statementBody.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}
function statementText() {
  const d = state.statement;
  if (!d) return '';
  const lines = [
    `Monthly Statement — ${d.student.name} (${d.month})`,
    `Grade: ${d.student.grade} | Rate: ${fmtUSD(d.student.ratePerHour)}/hr`,
    `Hours: ${Number(d.hours).toFixed(2)}h | Billed: ${fmtUSD(d.billed)} | Paid: ${fmtUSD(d.paid)} | DUE: ${fmtUSD(d.due)}`,
    '— Sessions (this month only) —'
  ];
  d.sessions.forEach((s) => {
    lines.push(`• ${fmtDay(s.datetimeISO)} | ${Number(s.duration).toFixed(2)}h | ${fmtUSD(s.costSnapshot)}`);
  });
  lines.push('— Payments (this month only) —');
  if (!d.payments.length) lines.push('(none)');
  d.payments.forEach((p) => lines.push(`• ${fmtDay(p.dateISO)} — ${fmtUSD(p.amount)}${p.note ? ' (' + p.note + ')' : ''}`));
  lines.push(`Balance due (${d.month}): ${fmtUSD(d.due)}`);
  return lines.join('\n');
}
if (els.copyStatementBtn) els.copyStatementBtn.addEventListener('click', async () => {
  const txt = statementText();
  if (!txt) return toast('Nothing to copy.', 'error');
  try {
    await navigator.clipboard.writeText(txt);
    toast('Statement copied — paste into WhatsApp/SMS.', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Statement copied.', 'success'); }
    catch (err) { toast('Copy failed — select text manually.', 'error'); }
    ta.remove();
  }
});

// ---- Backup / Restore ----
if (els.backupBtn) els.backupBtn.addEventListener('click', async () => {
  try {
    const data = await api('/api/backup/backup');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tutor-backup-${getMonth()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded.', 'success');
  } catch (e) { toast(e.message, 'error'); }
});
if (els.restoreBtn) els.restoreBtn.addEventListener('click', () => els.restoreFile.click());
if (els.restoreFile) els.restoreFile.addEventListener('change', async () => {
  const f = els.restoreFile.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    askConfirm('Restore backup?', `This REPLACES all current data with ${f.name}. Continue?`, async () => {
      try {
        const r = await api('/api/backup/restore', { method: 'POST', body: JSON.stringify(data) });
        toast(`Restored: ${r.students} students, ${r.sessions} sessions, ${r.schedules || 0} slots.`, 'success');
        await loadGrades(); await loadAll();
      } catch (e) { toast(e.message, 'error'); }
    });
  } catch (e) { toast('Invalid backup file.', 'error'); }
  els.restoreFile.value = '';
});

// ---- Toolbar events ----
let searchTimer = null;
if (els.searchInput) els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadAll, 300);
});
if (els.gradeFilter) els.gradeFilter.addEventListener('change', loadAll);
if (els.monthPicker) els.monthPicker.addEventListener('change', loadAll);
if (els.addStudentBtn) els.addStudentBtn.addEventListener('click', () => openStudentModal(null));
if (els.emptyAddBtn) els.emptyAddBtn.addEventListener('click', () => openStudentModal(null));

// ---- Init ----
(function init() {
  if (els.monthPicker && !els.monthPicker.value) els.monthPicker.value = currentMonthKey();
  checkHealth().then(() => { loadGrades().then(loadAll); });
})();
