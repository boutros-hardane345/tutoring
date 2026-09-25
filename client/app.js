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
  'sessionModal', 'sessionModalTitle', 'sessionForm', 'sId', 'sStudentId', 'sDatetime', 'sDuration', 'sSubject', 'sTaught', 'sHomework',
  'paymentModal', 'paymentForm', 'pStudentId', 'pStudentName', 'pDate', 'pAmount', 'pNote',
  'historyModal', 'historyTitle', 'historyList',
  'statementModal', 'statementTitle', 'statementBody', 'copyStatementBtn',
  'confirmModal', 'confirmTitle', 'confirmText', 'confirmYes', 'toasts'
].forEach((id) => { els[id] = $(id); });

const state = { students: [], sessionsMonth: [], paymentsMonth: [], statement: null };
let confirmCb = null;

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
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    state.sessionsMonth = sessions;
    state.paymentsMonth = payments;
    renderStats(stats);
    renderStudents();
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

function perStudentBalance(id) {
  const sess = state.sessionsMonth.filter((s) => String(s.studentId) === String(id));
  const pays = state.paymentsMonth.filter((p) => String(p.studentId) === String(id));
  const hrs = sess.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const billed = sess.reduce((a, s) => a + (Number(s.costSnapshot) || 0), 0);
  const paid = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { hrs, billed, paid, due: billed - paid };
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
  list.forEach((st) => {
    const b = perStudentBalance(st._id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${esc(st.name)}</h3>
      <div class="meta">
        <span class="badge">${esc(st.grade)}</span>
        <span class="badge rate">${fmtUSD(st.ratePerHour)}/hr</span>
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
      askConfirm('Delete student?', `Remove ${st.name} and ALL their sessions/payments?`, async () => {
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

// ---- Sessions ----
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function openSessionModal(st, sess) {
  els.sessionModalTitle.textContent = sess ? 'Edit Session' : `Log Session — ${st ? st.name : ''}`;
  els.sId.value = sess ? sess._id : '';
  els.sStudentId.value = sess ? sess.studentId : (st ? st._id : '');
  els.sDatetime.value = toLocalInput(sess ? sess.datetimeISO : new Date());
  els.sDuration.value = sess ? sess.duration : '';
  els.sSubject.value = sess ? (sess.subject || '') : '';
  els.sTaught.value = sess ? sess.taught : '';
  els.sHomework.value = sess ? (sess.homework || '') : '';
  openModal(els.sessionModal);
}
if (els.sessionForm) els.sessionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = els.sId.value;
  const dur = Number(els.sDuration.value);
  if (!els.sDatetime.value) return toast('Date & time is required.', 'error');
  if (!Number.isFinite(dur) || dur <= 0 || dur > 24) return toast('Duration must be 0.01–24 hours.', 'error');
  if (!els.sTaught.value.trim()) return toast('What was taught is required.', 'error');
  const body = {
    studentId: els.sStudentId.value,
    datetimeISO: new Date(els.sDatetime.value).toISOString(),
    duration: dur,
    subject: els.sSubject.value.trim(),
    taught: els.sTaught.value.trim(),
    homework: els.sHomework.value.trim()
  };
  try {
    if (id) await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });
    closeModal(els.sessionModal);
    toast('Session saved.', 'success');
    await loadAll();
  } catch (err) { toast(err.message, 'error'); }
});

// ---- Payments ----
function openPaymentModal(st) {
  els.pStudentId.value = st._id;
  if (els.pStudentName) els.pStudentName.textContent = `${st.name} — due this month: ${fmtUSD(perStudentBalance(st._id).due)}`;
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

// ---- History ----
async function openHistory(st) {
  els.historyTitle.textContent = `History — ${st.name}`;
  els.historyList.innerHTML = '<p class="muted">Loading…</p>';
  openModal(els.historyModal);
  try {
    const items = await api('/api/sessions?studentId=' + st._id);
    if (!items.length) { els.historyList.innerHTML = '<p class="muted">No sessions yet.</p>'; return; }
    els.historyList.innerHTML = '';
    items.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'hist-item';
      const hwBadge = s.homework
        ? `<span class="badge ${s.homeworkDone ? 'badge-done' : 'badge-pending'}">${s.homeworkDone ? 'Done' : 'Not Done'}</span>`
        : '<span class="muted">No homework</span>';
      div.innerHTML = `
        <div class="row"><strong>${esc(fmtDate(s.datetimeISO))}</strong>
          <span class="badge rate">${Number(s.duration).toFixed(2)}h · ${esc(fmtUSD(s.costSnapshot))}</span></div>
        <div><strong>Subject:</strong> ${esc(s.subject || '—')}</div>
        <div><strong>Given:</strong> ${esc(s.taught)}</div>
        <div><strong>To prepare:</strong> ${esc(s.homework || '—')}</div>
        <div class="row">
          <label class="hw-toggle"><input type="checkbox" ${s.homeworkDone ? 'checked' : ''} ${s.homework ? '' : 'disabled'} /> ${hwBadge}</label>
          <span>
            <button class="btn small ghost" data-h="edit"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn small ghost" data-h="del"><i class="fa-solid fa-trash"></i></button>
          </span>
        </div>`;
      const cb = div.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', async () => {
        try {
          await api(`/api/sessions/${s._id}/homework`, { method: 'PATCH', body: JSON.stringify({ homeworkDone: cb.checked }) });
          toast(cb.checked ? 'Marked Done.' : 'Marked Not Done.', 'success');
          s.homeworkDone = cb.checked;
          openHistoryRefresh(st);
          loadAll();
        } catch (err) { toast(err.message, 'error'); cb.checked = !cb.checked; }
      });
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
async function openHistoryRefresh(st) {
  // lightweight: just re-open if modal still open (badge update handled on next open anyway)
}

// ---- Statement ----
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
        <td>${esc(s.subject || '—')}</td>
        <td>${esc(s.taught)}<br/><span class="muted">HW: ${esc(s.homework || '—')}</span>
          ${s.homework ? `<span class="badge ${s.homeworkDone ? 'badge-done' : 'badge-pending'}">${s.homeworkDone ? 'Done' : 'Not Done'}</span>` : ''}</td>
        <td>${Number(s.duration).toFixed(2)}h</td>
        <td>${esc(fmtUSD(s.costSnapshot))}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No sessions this month.</td></tr>';
    const payRows = d.payments.map((p) => `<div>${esc(fmtDay(p.dateISO))} — ${esc(fmtUSD(p.amount))}${p.note ? ' (' + esc(p.note) + ')' : ''}</div>`).join('') || '<div class="muted">No payments this month.</div>';
    els.statementBody.innerHTML = `
      <div class="stmt-total">
        <div>Total hours: <strong>${Number(d.hours).toFixed(2)}h</strong></div>
        <div>Billed: <strong>${esc(fmtUSD(d.billed))}</strong> · Paid: <strong>${esc(fmtUSD(d.paid))}</strong> · Due: <strong>${esc(fmtUSD(d.due))}</strong></div>
      </div>
      <table class="stmt-table"><thead><tr><th>Date</th><th>Subject</th><th>Material / Homework</th><th>Dur.</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table>
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
    '— Sessions —'
  ];
  d.sessions.forEach((s) => {
    lines.push(`• ${fmtDay(s.datetimeISO)} | ${s.subject || '—'} | ${Number(s.duration).toFixed(2)}h | ${fmtUSD(s.costSnapshot)}`);
    lines.push(`  Taught: ${s.taught}`);
    if (s.homework) lines.push(`  Homework [${s.homeworkDone ? 'Done' : 'Not Done'}]: ${s.homework}`);
  });
  lines.push('— Payments —');
  if (!d.payments.length) lines.push('(none)');
  d.payments.forEach((p) => lines.push(`• ${fmtDay(p.dateISO)} — ${fmtUSD(p.amount)}${p.note ? ' (' + p.note + ')' : ''}`));
  lines.push(`Balance due: ${fmtUSD(d.due)}`);
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
        toast(`Restored: ${r.students} students, ${r.sessions} sessions.`, 'success');
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
