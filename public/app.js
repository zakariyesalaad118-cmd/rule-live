/* Nolol Maamul - frontend (vanilla JS, SPA) */
'use strict';

const state = {
  token: localStorage.getItem('nolol_token'),
  user: null,
  view: 'dashboard',
  walletMonth: todayStr().slice(0, 7)
};

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'wallet', label: 'Lacagta', icon: '💰' },
  { id: 'schedule', label: 'Jadwalka', icon: '📅' },
  { id: 'journal', label: 'Wardiga', icon: '📓' }
];

const TYPE_LABEL = { cash: 'Lacag gacan', bank: 'Bangi', mobile: 'Mobile money', savings: 'Kaydka' };

// ---------- Utils ----------
function todayStr() { return new Date().toISOString().slice(0, 10); }
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stat = (label, value, cls = '') => `<div class="stat ${cls}"><small>${label}</small><strong>${value}</strong></div>`;
const $ = sel => document.querySelector(sel);

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function groupByDate(items) {
  const m = new Map();
  items.forEach(i => {
    if (!m.has(i.date)) m.set(i.date, []);
    m.get(i.date).push(i);
  });
  return [...m.entries()];
}

function formData(form) {
  return Object.fromEntries(new FormData(form));
}

// ---------- API ----------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) {
    clearSession();
    renderAuth();
  }
  if (!res.ok) throw new Error(data.error || 'Khalad ayaa dhacay');
  return data;
}

// Run an action, show toast, then reload current view
async function act(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    loadView();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function confirmDo(msg, fn, okMsg) {
  if (confirm(msg)) act(fn, okMsg);
}

// ---------- Session ----------
function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('nolol_token', token);
  renderShell();
}
function clearSession() {
  localStorage.removeItem('nolol_token');
  state.token = null;
  state.user = null;
}
async function logout() {
  try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ }
  clearSession();
  renderAuth();
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    const { user } = await api('GET', '/api/auth/me');
    state.user = user;
    renderShell();
  } catch {
    clearSession();
    renderAuth();
  }
}

// ---------- Auth screen ----------
function renderAuth(mode = 'login') {
  $('#app').innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="brand-mark">◉</div>
    <h1>Nolol Maamul</h1>
    <p class="muted">Lacagta, jadwalka iyo wardigaaga hal meel</p>
    <div class="tabs">
      <button data-m="login" class="${mode === 'login' ? 'active' : ''}">Gali</button>
      <button data-m="register" class="${mode === 'register' ? 'active' : ''}">Diiwaan geli</button>
    </div>
    <form id="authForm">
      ${mode === 'register' ? '<input name="name" placeholder="Magacaaga" required>' : ''}
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password (ugu yaraan 6)" required>
      <button class="btn primary block" type="submit">${mode === 'login' ? 'Gali' : 'Akoon samee'}</button>
    </form>
  </div></div>`;

  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/register', formData(e.target));
      setSession(r.token, r.user);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
}

// ---------- Shell ----------
function renderShell() {
  const nav = [...NAV, ...(state.user.role === 'admin' ? [{ id: 'admin', label: 'Maamulka', icon: '🛠️' }] : [])];
  if (!nav.some(n => n.id === state.view)) state.view = 'dashboard';

  $('#app').innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="logo">◉ Nolol</div>
      <nav>
        ${nav.map(n => `<button class="nav-btn ${state.view === n.id ? 'active' : ''}" data-view="${n.id}"><span>${n.icon}</span>${n.label}</button>`).join('')}
      </nav>
      <div class="me">
        <div><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></div>
        <button class="btn ghost" id="logoutBtn">Ka bax</button>
      </div>
    </aside>
    <main id="view" class="main"></main>
  </div>`;

  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    state.view = b.dataset.view;
    renderShell();
  });
  $('#logoutBtn').onclick = logout;
  loadView();
}

const VIEWS = {
  dashboard: viewDashboard,
  wallet: viewWallet,
  schedule: viewSchedule,
  journal: viewJournal,
  admin: viewAdmin
};

async function loadView() {
  const el = $('#view');
  if (!el) return;
  el.innerHTML = '<p class="muted">Wuu soo raraya...</p>';
  try {
    await VIEWS[state.view](el);
  } catch (e) {
    el.innerHTML = `<p class="bad">${esc(e.message)}</p>`;
  }
}

// ---------- Dashboard ----------
async function viewDashboard(el) {
  const d = await api('GET', '/api/dashboard');
  const maxCat = Math.max(1, ...d.byCategory.map(c => c.amount));

  el.innerHTML = `
  <header class="page-head">
    <div><h2>Salaan, ${esc(state.user.name)} 👋</h2><p class="muted">Maanta ${todayStr()}</p></div>
  </header>
  <section class="stats">
    ${stat('Wadarta lacagta', money(d.totalBalance), 'accent')}
    ${stat('Dakhliga bishan', money(d.monthIncome), 'good')}
    ${stat('Kharashka bishan', money(d.monthExpense), 'bad')}
    ${stat('Hawlaha sugaya', d.pendingTasks, 'warn')}
  </section>
  <section class="grid-2">
    <div class="card">
      <h3>Kharashka qaybaha (bishan)</h3>
      ${d.byCategory.length
        ? d.byCategory.map(c => `
          <div class="bar-row">
            <span>${esc(c.category)}</span>
            <div class="bar"><i style="width:${(c.amount / maxCat * 100).toFixed(0)}%"></i></div>
            <b>${money(c.amount)}</b>
          </div>`).join('')
        : '<p class="muted">Weli kharash lama diiwaangelin bishan.</p>'}
    </div>
    <div class="card">
      <h3>Jadwalka soo socota</h3>
      ${d.upcoming.length
        ? d.upcoming.map(t => `
          <div class="list-row">
            <span class="prio ${t.priority}"></span>
            <div><strong>${esc(t.title)}</strong><small>${t.date} ${t.time || ''}</small></div>
          </div>`).join('')
        : '<p class="muted">Ma jiraan hawlo soo socda.</p>'}
    </div>
    <div class="card">
      <h3>Wardigii ugu dambeeyay</h3>
      ${d.lastJournal
        ? `<small>${d.lastJournal.date} ${esc(d.lastJournal.mood)}</small><p>${esc(d.lastJournal.text)}</p>`
        : '<p class="muted">Weli wardi ma qorin.</p>'}
    </div>
  </section>`;
}

// ---------- Wallet & transactions ----------
async function viewWallet(el) {
  const month = state.walletMonth;
  const [{ wallets }, { transactions }] = await Promise.all([
    api('GET', '/api/wallets'),
    api('GET', `/api/transactions?month=${month}`)
  ]);

  const walletOpts = wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
  const txForm = wallets.length ? `
    <form id="txForm" class="form inline">
      <select name="walletId" required>${walletOpts}</select>
      <select name="type">
        <option value="expense">Kharash</option>
        <option value="income">Dakhli</option>
      </select>
      <input name="amount" type="number" step="0.01" min="0.01" placeholder="Qadarka" required>
      <input name="category" placeholder="Qaybta (tusaale: Cunto)">
      <input name="date" type="date" value="${todayStr()}" required>
      <input name="note" placeholder="Fiiro gaar ah">
      <button class="btn primary">Diiwaan geli</button>
    </form>`
    : '<p class="muted">Marka hore wallet samee.</p>';

  el.innerHTML = `
  <header class="page-head">
    <div><h2>Lacagta</h2><p class="muted">Wallet-yadaada iyo dhaqdhaqaaqyadooda</p></div>
    <input type="month" id="monthPick" value="${month}" style="width:auto">
  </header>
  <section class="grid-2">
    <div class="card">
      <h3>Wallet-yada</h3>
      <div class="wallet-grid">
        ${wallets.map(w => `
          <div class="wallet ${w.type}">
            <small>${esc(TYPE_LABEL[w.type] || w.type)}</small>
            <strong>${esc(w.name)}</strong>
            <span>${money(w.balance)}</span>
            <button class="link danger" data-del-wallet="${w.id}">Tirtir</button>
          </div>`).join('') || '<p class="muted">Wallet ma jiro. Mid ku dar hoose.</p>'}
      </div>
      <form id="walletForm" class="form">
        <h4>Wallet cusub</h4>
        <input name="name" placeholder="Magaca (tusaale: Bangiga)" required>
        <select name="type">
          <option value="cash">Lacag gacan</option>
          <option value="bank">Bangi</option>
          <option value="mobile">Mobile money</option>
          <option value="savings">Kaydka</option>
        </select>
        <input name="openingBalance" type="number" step="0.01" placeholder="Lacagta bilowga">
        <button class="btn primary">Ku dar</button>
      </form>
    </div>
    <div class="card">
      <h3>Dhaqdhaqaaqa</h3>
      ${txForm}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Taariikh</th><th>Qaybta</th><th>Wallet</th><th class="r">Qadar</th><th></th></tr></thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td>${esc(t.category)}<small class="block">${esc(t.note)}</small></td>
                <td>${esc(t.walletName)}</td>
                <td class="r ${t.type === 'income' ? 'good' : 'bad'}">${t.type === 'income' ? '+' : '-'}${money(t.amount)}</td>
                <td><button class="link danger" data-del-tx="${t.id}">✕</button></td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted">Dhaqdhaqaaq lama helin bishan.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;

  $('#monthPick').onchange = e => { state.walletMonth = e.target.value; loadView(); };

  $('#walletForm').onsubmit = e => {
    e.preventDefault();
    act(() => api('POST', '/api/wallets', formData(e.target)), 'Wallet waa la sameeyey');
  };

  if ($('#txForm')) {
    $('#txForm').onsubmit = e => {
      e.preventDefault();
      act(() => api('POST', '/api/transactions', formData(e.target)), 'Dhaqdhaqaaqa waa la diiwaangeliyey');
    };
  }

  el.querySelectorAll('[data-del-wallet]').forEach(b => b.onclick = () =>
    confirmDo('Wallet-kan iyo dhaqdhaqaaqyadiisa oo dhan ayaa la tirtiri doonaa. Sii wad?',
      () => api('DELETE', `/api/wallets/${b.dataset.delWallet}`), 'Wallet-ka waa la tirtiray'));

  el.querySelectorAll('[data-del-tx]').forEach(b => b.onclick = () =>
    confirmDo('Dhaqdhaqaaqan ma tirtirtaa?',
      () => api('DELETE', `/api/transactions/${b.dataset.delTx}`), 'La tirtiray'));
}

// ---------- Schedule (jadwalka) ----------
async function viewSchedule(el) {
  const { tasks } = await api('GET', '/api/tasks');

  el.innerHTML = `
  <header class="page-head">
    <div><h2>Jadwalka</h2><p class="muted">Hawlaha, kulamada iyo waxyaabaha maalinta</p></div>
  </header>
  <section class="grid-2">
    <form id="taskForm" class="card form">
      <h3>Hawl cusub</h3>
      <input name="title" placeholder="Maxay tahay hawshu?" required>
      <div class="row">
        <input name="date" type="date" value="${todayStr()}" required>
        <input name="time" type="time">
      </div>
      <select name="priority">
        <option value="medium">Dhexdhexaad</option>
        <option value="high">Muhiim</option>
        <option value="low">Hoose</option>
      </select>
      <button class="btn primary">Ku dar jadwalka</button>
    </form>
    <div class="card">
      <h3>Liiskaaga</h3>
      ${tasks.length
        ? groupByDate(tasks).map(([date, items]) => `
          <h5 class="date-head">${date === todayStr() ? 'Maanta' : date}</h5>
          ${items.map(t => `
            <label class="task ${t.done ? 'done' : ''}">
              <input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''}>
              <span class="prio ${t.priority}"></span>
              <span>${esc(t.title)}<small class="block">${t.time || ''}</small></span>
              <button class="link danger" data-del-task="${t.id}">✕</button>
            </label>`).join('')}`).join('')
        : '<p class="muted">Weli hawl ma jiro.</p>'}
    </div>
  </section>`;

  $('#taskForm').onsubmit = e => {
    e.preventDefault();
    act(() => api('POST', '/api/tasks', formData(e.target)), 'Hawsha waa lagu daray');
  };

  el.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = () =>
    act(() => api('PATCH', `/api/tasks/${cb.dataset.toggle}`, { done: cb.checked })));

  el.querySelectorAll('[data-del-task]').forEach(b => b.onclick = e => {
    e.preventDefault();
    confirmDo('Hawshan ma tirtirtaa?', () => api('DELETE', `/api/tasks/${b.dataset.delTask}`), 'La tirtiray');
  });
}

// ---------- Tasbiixda (adkaarta maalinlaha ah, server-ka ku kaydsan) ----------
const DHIKR_LIST = [
  { id: 'subhanallah',    name: 'Subhaanallaah',           target: 33 },
  { id: 'alhamdulillah',  name: 'Alxamdulillaah',          target: 33 },
  { id: 'allahuakbar',    name: 'Allaahu akbar',           target: 34 },
  { id: 'astaghfirullah', name: 'Astaghfirullaah',         target: 100 },
  { id: 'lailaha',        name: 'Laa ilaha illallaah',     target: 100 },
  { id: 'salawat',        name: 'Salawaadka Nabiga (SCW)', target: 100 }
];

async function renderDhikr(container) {
  container.innerHTML = '<div class="card dhikr-card"><p class="muted">Wuu soo raraya...</p></div>';
  try {
    const { counts } = await api('GET', '/api/dhikr');
    drawDhikr(container, counts);
  } catch (e) {
    container.innerHTML = `<div class="card"><p class="bad">${esc(e.message)}</p></div>`;
  }
}

function drawDhikr(container, counts) {
  container.innerHTML = `
  <div class="card dhikr-card">
    <h3>📿 Tasbiixda maanta</h3>
    <p class="muted">Tirada waxaa lagu kaydiyaa akoonkaaga, sidaas darteed telefoon iyo kombiyuutar isku mid bay yihiin.</p>
    ${DHIKR_LIST.map(d => {
      const count = counts[d.id] || 0;
      const done = count >= d.target;
      const pct = Math.min(100, Math.round((count / d.target) * 100));
      return `
      <div class="dhikr-row ${done ? 'done' : ''}">
        <div class="dhikr-info">
          <strong>${d.name} ${done ? '✅' : ''}</strong>
          <small>${count} / ${d.target}</small>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="dhikr-btns">
          <button class="btn small" data-dhikr="${d.id}" data-step="1">+1</button>
          <button class="btn small outline" data-dhikr="${d.id}" data-step="-1">−1</button>
          <button class="btn small outline" data-dhikr="${d.id}" data-step="reset">↺</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;

  container.querySelectorAll('[data-dhikr]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.dhikr;
      const step = btn.dataset.step;
      const next = { ...counts };
      next[id] = step === 'reset' ? 0 : Math.max(0, (next[id] || 0) + Number(step));
      btn.disabled = true;
      try {
        const r = await api('PUT', '/api/dhikr', { date: todayStr(), counts: next });
        drawDhikr(container, r.counts);
      } catch (e) {
        toast(e.message, 'bad');
        btn.disabled = false;
      }
    };
  });
}

// ---------- Wardiga ----------
async function viewJournal(el) {
  const { entries } = await api('GET', '/api/journal');

  el.innerHTML = `
  <header class="page-head">
    <div><h2>Wardiga</h2><p class="muted">Maalin kasta qor waxa dhacay iyo sida aad dareento</p></div>
  </header>
  <section class="grid-2">
    <div id="dhikrBox"></div>
    <form id="journalForm" class="card form">
      <h3>Wareysi maanta</h3>
      <input name="date" type="date" value="${todayStr()}" required>
      <select name="mood">
        <option value="">Mood-ka (ikhtiyaari)</option>
        <option value="😊 Farxad">😊 Farxad</option>
        <option value="😐 Caadi">😐 Caadi</option>
        <option value="😔 Niyad jab">😔 Niyad jab</option>
        <option value="😤 Cadho">😤 Cadho</option>
        <option value="🙏 Shukri">🙏 Shukri</option>
      </select>
      <textarea name="text" rows="6" placeholder="Maanta waxa dhacay..." required></textarea>
      <button class="btn primary">Kaydi</button>
    </form>
    <div class="card">
      <h3>Wardiyadii hore</h3>
      ${entries.map(j => `
        <article class="entry">
          <header>
            <small>${j.date}</small> <span>${esc(j.mood)}</span>
            <button class="link danger" data-del-j="${j.id}">✕</button>
          </header>
          <p>${esc(j.text).replace(/\n/g, '<br>')}</p>
        </article>`).join('') || '<p class="muted">Weli wardi ma qorin.</p>'}
    </div>
  </section>`;

  renderDhikr(document.getElementById('dhikrBox'));

  $('#journalForm').onsubmit = e => {
    e.preventDefault();
    act(() => api('POST', '/api/journal', formData(e.target)), 'Wardigaaga waa la kaydiyay');
  };

  el.querySelectorAll('[data-del-j]').forEach(b => b.onclick = () =>
    confirmDo('Wardigan ma tirtirtaa?', () => api('DELETE', `/api/journal/${b.dataset.delJ}`), 'La tirtiray'));
}

// ---------- Admin ----------
async function viewAdmin(el) {
  if (state.user.role !== 'admin') {
    el.innerHTML = '<p class="bad">Ogolaansho ma lihid</p>';
    return;
  }
  const [stats, { users }] = await Promise.all([
    api('GET', '/api/admin/stats'),
    api('GET', '/api/admin/users')
  ]);

  el.innerHTML = `
  <header class="page-head">
    <div><h2>Maamulka</h2><p class="muted">Isticmaalayaasha iyo xogta nidaamka</p></div>
  </header>
  <section class="stats">
    ${stat('Isticmaalayaasha', stats.users, 'accent')}
    ${stat('Firfircoon', stats.activeUsers, 'good')}
    ${stat('Wallet-yada', stats.wallets)}
    ${stat('Dhaqdhaqaaqyada', stats.transactions)}
    ${stat('Hawlaha', stats.tasks, 'warn')}
    ${stat('Wardiyada', stats.journal)}
  </section>
  <section class="grid-2">
    <div class="card">
      <h3>Isticmaalayaasha</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Magac</th><th>Email</th><th>Doorka</th><th>Xaalad</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => {
              const self = u.id === state.user.id;
              return `
              <tr>
                <td>${esc(u.name)}<small class="block">${u.counts.transactions} dhaq. · ${u.counts.tasks} hawl</small></td>
                <td>${esc(u.email)}</td>
                <td>
                  <select data-role="${u.id}" ${self ? 'disabled' : ''}>
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                </td>
                <td>
                  <button class="pill ${u.active ? 'good' : 'bad'}" data-active="${u.id}" data-val="${!u.active}" ${self ? 'disabled' : ''}>
                    ${u.active ? 'Firfircoon' : 'Joogsan'}
                  </button>
                </td>
                <td><button class="link danger" data-deluser="${u.id}" ${self ? 'disabled' : ''}>Tirtir</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <form id="userForm" class="card form">
      <h3>Isticmaal cusub ku dar</h3>
      <input name="name" placeholder="Magaca" required>
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password (ugu yaraan 6)" required>
      <select name="role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <button class="btn primary">Abuur</button>
    </form>
  </section>`;

  $('#userForm').onsubmit = e => {
    e.preventDefault();
    act(() => api('POST', '/api/admin/users', formData(e.target)), 'Isticmaalaha waa la abuuray');
  };

  el.querySelectorAll('[data-role]').forEach(s => s.onchange = () =>
    act(() => api('PATCH', `/api/admin/users/${s.dataset.role}`, { role: s.value }), 'Doorka waa la beddelay'));

  el.querySelectorAll('[data-active]').forEach(b => b.onclick = () =>
    act(() => api('PATCH', `/api/admin/users/${b.dataset.active}`, { active: b.dataset.val === 'true' }),
      'Xaaladda waa la beddelay'));

  el.querySelectorAll('[data-deluser]').forEach(b => b.onclick = () =>
    confirmDo('Isticmaalahan iyo xogtiisa oo dhan ayaa la tirtiri doonaa. Sii wad?',
      () => api('DELETE', `/api/admin/users/${b.dataset.deluser}`), 'Isticmaalaha waa la tirtiray'));
}

boot();
