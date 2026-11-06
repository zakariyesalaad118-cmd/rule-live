'use strict';
/**
 * Nolol Maamul - backend
 * Zero-dependency Node.js server (http + fs + crypto).
 * Xogta waxaa lagu kaydiyaa data/db.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const SESSION_DAYS = 7;
const MAX_BODY = 1024 * 1024; // 1MB

// ---------------------------------------------------------------- Database
function loadDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], sessions: {} }, null, 2));
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.users = parsed.users || [];
  parsed.sessions = parsed.sessions || {};
  return parsed;
}
const db = loadDb();

function saveDb() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------------------------------------------------------- Helpers
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const round = n => Math.round(n * 100) / 100;
const sumAmt = list => list.reduce((s, t) => s + t.amount, 0);

function emptyData() {
  return { wallets: [], transactions: [], tasks: [], journal: [] };
}
function userData(user) {
  if (!user.data) user.data = emptyData();
  return user.data;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(test, expected);
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}
function adminView(u) {
  const d = userData(u);
  return {
    ...publicUser(u),
    active: u.active,
    counts: {
      wallets: d.wallets.length,
      transactions: d.transactions.length,
      tasks: d.tasks.length,
      journal: d.journal.length
    }
  };
}

// Validators
function str(v, label, max = 120, required = true) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(400, `${label} waa lagama maarmaan`);
  if (s.length > max) fail(400, `${label} aad bay u dheer tahay`);
  return s;
}
function num(v, label) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) fail(400, `${label} waa tiro sax ah`);
  return round(n);
}
function optNum(v, label, def = 0) {
  if (v === '' || v === null || v === undefined) return def;
  return num(v, label);
}
function dateStr(v) {
  const s = v ? String(v) : todayStr();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, 'Taariikhda qaabkeeda waa YYYY-MM-DD');
  return s;
}
function timeStr(v) {
  if (!v) return null;
  if (!/^\d{2}:\d{2}$/.test(v)) fail(400, 'Waqtiga qaabkeeda waa HH:MM');
  return v;
}
function oneOf(v, list, label) {
  if (!list.includes(v)) fail(400, `${label} waa khalad`);
  return v;
}
function findById(list, id, label) {
  const item = list.find(x => x.id === id);
  if (!item) fail(404, `${label} lama helin`);
  return item;
}

function walletBalance(d, w) {
  const mine = d.transactions.filter(t => t.walletId === w.id);
  const income = sumAmt(mine.filter(t => t.type === 'income'));
  const expense = sumAmt(mine.filter(t => t.type === 'expense'));
  return round(w.openingBalance + income - expense);
}

// ---------------------------------------------------------------- Sessions
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: Date.now() };
  return token;
}
function killSessions(userId) {
  for (const [token, s] of Object.entries(db.sessions)) {
    if (s.userId === userId) delete db.sessions[token];
  }
}
function getAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_DAYS * 864e5) {
    delete db.sessions[token];
    return null;
  }
  const user = db.users.find(u => u.id === session.userId);
  if (!user || !user.active) return null;
  return { user, token };
}
function requireAuth(req) {
  const auth = getAuth(req);
  if (!auth) fail(401, 'Fadlan soo gal');
  return auth;
}
function requireAdmin(req) {
  const auth = requireAuth(req);
  if (auth.user.role !== 'admin') fail(403, 'Kaliya admin ayaa ogol');
  return auth;
}

// ---------------------------------------------------------------- Body & response
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Xogta aad soo dirtay way weyn tahay'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON khalad ayaa ku jira'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

// ---------------------------------------------------------------- Router
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const source = '^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$';
  routes.push({ method, re: new RegExp(source), keys, handler });
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
  }
  return null;
}

function createUser({ name, email, password, role }) {
  const cleanName = str(name, 'Magaca', 60);
  const cleanEmail = str(email, 'Emailka', 120).toLowerCase();
  const pw = String(password || '');
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) fail(400, 'Emailka sax ma aha');
  if (pw.length < 6) fail(400, 'Password-ku ugu yaraan 6 xaraf ah');
  if (db.users.some(u => u.email === cleanEmail)) fail(409, 'Emailkan hore ayaa loo diiwaangeliyey');
  const user = {
    id: uid(),
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(pw),
    role: role || (db.users.length === 0 ? 'admin' : 'user'),
    active: true,
    createdAt: nowIso(),
    data: emptyData()
  };
  db.users.push(user);
  return user;
}

// ---- Auth
route('POST', '/api/auth/register', async ({ body }) => {
  const user = createUser(body);
  const token = createSession(user);
  return { status: 201, body: { token, user: publicUser(user) } };
});

route('POST', '/api/auth/login', async ({ body }) => {
  const email = str(body.email, 'Emailka', 120).toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
    fail(401, 'Email ama password khalad ah');
  }
  if (!user.active) fail(403, 'Akoonkaaga waa la joojiyay');
  return { body: { token: createSession(user), user: publicUser(user) } };
});

route('POST', '/api/auth/logout', async ({ req }) => {
  const auth = requireAuth(req);
  delete db.sessions[auth.token];
  return { body: { ok: true } };
});

route('GET', '/api/auth/me', async ({ req }) => {
  const { user } = requireAuth(req);
  return { body: { user: publicUser(user) } };
});

// ---- Dashboard
route('GET', '/api/dashboard', async ({ req }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const month = todayStr().slice(0, 7);

  const totalBalance = d.wallets.reduce((s, w) => s + walletBalance(d, w), 0);
  const monthTx = d.transactions.filter(t => t.date.startsWith(month));
  const monthIncome = sumAmt(monthTx.filter(t => t.type === 'income'));
  const monthExpense = sumAmt(monthTx.filter(t => t.type === 'expense'));

  const catMap = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });
  const byCategory = Object.entries(catMap)
    .map(([category, amount]) => ({ category, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const pending = d.tasks.filter(t => !t.done);
  const upcoming = [...pending]
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 5);

  const lastJournal = [...d.journal]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] || null;

  return {
    body: {
      totalBalance: round(totalBalance),
      monthIncome: round(monthIncome),
      monthExpense: round(monthExpense),
      pendingTasks: pending.length,
      byCategory,
      upcoming,
      lastJournal
    }
  };
});

// ---- Wallets (lacagta / accounts)
route('GET', '/api/wallets', async ({ req }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  return { body: { wallets: d.wallets.map(w => ({ ...w, balance: walletBalance(d, w) })) } };
});

route('POST', '/api/wallets', async ({ req, body }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const wallet = {
    id: uid(),
    name: str(body.name, 'Magaca wallet-ka', 60),
    type: oneOf(body.type || 'cash', ['cash', 'bank', 'mobile', 'savings'], 'Nooca'),
    openingBalance: optNum(body.openingBalance, 'Lacagta bilowga'),
    createdAt: nowIso()
  };
  d.wallets.push(wallet);
  return { status: 201, body: { wallet: { ...wallet, balance: walletBalance(d, wallet) } } };
});

route('PUT', '/api/wallets/:id', async ({ req, body, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const w = findById(d.wallets, params.id, 'Wallet-ka');
  if (body.name !== undefined) w.name = str(body.name, 'Magaca wallet-ka', 60);
  if (body.type !== undefined) w.type = oneOf(body.type, ['cash', 'bank', 'mobile', 'savings'], 'Nooca');
  if (body.openingBalance !== undefined) w.openingBalance = optNum(body.openingBalance, 'Lacagta bilowga');
  return { body: { wallet: { ...w, balance: walletBalance(d, w) } } };
});

route('DELETE', '/api/wallets/:id', async ({ req, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  findById(d.wallets, params.id, 'Wallet-ka');
  d.wallets = d.wallets.filter(w => w.id !== params.id);
  d.transactions = d.transactions.filter(t => t.walletId !== params.id);
  return { body: { ok: true } };
});

// ---- Transactions (dhaqdhaqaaqa)
route('GET', '/api/transactions', async ({ req, query }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const month = query.get('month');
  const walletId = query.get('walletId');
  const list = d.transactions
    .filter(t => (!month || t.date.startsWith(month)) && (!walletId || t.walletId === walletId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map(t => ({
      ...t,
      walletName: (d.wallets.find(w => w.id === t.walletId) || {}).name || '—'
    }));
  return { body: { transactions: list } };
});

route('POST', '/api/transactions', async ({ req, body }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const walletId = str(body.walletId, 'Wallet-ka');
  findById(d.wallets, walletId, 'Wallet-ka');
  const amount = num(body.amount, 'Qadarka');
  if (amount <= 0) fail(400, 'Qadarku waa inuu ka weyn yahay 0');
  const tx = {
    id: uid(),
    walletId,
    type: oneOf(body.type || 'expense', ['income', 'expense'], 'Nooca'),
    amount,
    category: str(body.category || 'Kale', 'Qaybta', 40, false) || 'Kale',
    note: str(body.note || '', 'Fiiradda', 200, false),
    date: dateStr(body.date),
    createdAt: nowIso()
  };
  d.transactions.push(tx);
  return { status: 201, body: { transaction: tx } };
});

route('DELETE', '/api/transactions/:id', async ({ req, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  findById(d.transactions, params.id, 'Dhaqdhaqaaqa');
  d.transactions = d.transactions.filter(t => t.id !== params.id);
  return { body: { ok: true } };
});

// ---- Tasks (jadwalka)
route('GET', '/api/tasks', async ({ req }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const tasks = [...d.tasks].sort((a, b) =>
    (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { body: { tasks } };
});

route('POST', '/api/tasks', async ({ req, body }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const task = {
    id: uid(),
    title: str(body.title, 'Magaca hawsha', 160),
    date: dateStr(body.date),
    time: timeStr(body.time),
    priority: oneOf(body.priority || 'medium', ['low', 'medium', 'high'], 'Muhiimadda'),
    done: false,
    createdAt: nowIso()
  };
  d.tasks.push(task);
  return { status: 201, body: { task } };
});

route('PATCH', '/api/tasks/:id', async ({ req, body, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const task = findById(d.tasks, params.id, 'Hawsha');
  if (body.title !== undefined) task.title = str(body.title, 'Magaca hawsha', 160);
  if (body.date !== undefined) task.date = dateStr(body.date);
  if (body.time !== undefined) task.time = timeStr(body.time);
  if (body.priority !== undefined) task.priority = oneOf(body.priority, ['low', 'medium', 'high'], 'Muhiimadda');
  if (body.done !== undefined) task.done = !!body.done;
  return { body: { task } };
});

route('DELETE', '/api/tasks/:id', async ({ req, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  findById(d.tasks, params.id, 'Hawsha');
  d.tasks = d.tasks.filter(t => t.id !== params.id);
  return { body: { ok: true } };
});

// ---- Journal (wardiga)
route('GET', '/api/journal', async ({ req }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const entries = [...d.journal].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { body: { entries } };
});

route('POST', '/api/journal', async ({ req, body }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  const entry = {
    id: uid(),
    date: dateStr(body.date),
    mood: str(body.mood || '', 'Mood-ka', 30, false),
    text: str(body.text, 'Qoraalka', 5000),
    createdAt: nowIso()
  };
  d.journal.push(entry);
  return { status: 201, body: { entry } };
});

route('DELETE', '/api/journal/:id', async ({ req, params }) => {
  const { user } = requireAuth(req);
  const d = userData(user);
  findById(d.journal, params.id, 'Wardiga');
  d.journal = d.journal.filter(j => j.id !== params.id);
  return { body: { ok: true } };
});

// ---- Admin
route('GET', '/api/admin/stats', async ({ req }) => {
  requireAdmin(req);
  const datas = db.users.map(u => userData(u));
  return {
    body: {
      users: db.users.length,
      activeUsers: db.users.filter(u => u.active).length,
      admins: db.users.filter(u => u.role === 'admin').length,
      wallets: datas.reduce((s, d) => s + d.wallets.length, 0),
      transactions: datas.reduce((s, d) => s + d.transactions.length, 0),
      tasks: datas.reduce((s, d) => s + d.tasks.length, 0),
      journal: datas.reduce((s, d) => s + d.journal.length, 0)
    }
  };
});

route('GET', '/api/admin/users', async ({ req }) => {
  requireAdmin(req);
  return { body: { users: db.users.map(adminView) } };
});

route('POST', '/api/admin/users', async ({ req, body }) => {
  requireAdmin(req);
  const user = createUser({
    ...body,
    role: body.role ? oneOf(body.role, ['user', 'admin'], 'Doorka') : 'user'
  });
  return { status: 201, body: { user: adminView(user) } };
});

route('PATCH', '/api/admin/users/:id', async ({ req, body, params }) => {
  const { user: me } = requireAdmin(req);
  const target = findById(db.users, params.id, 'Isticmaalaha');
  if (body.role !== undefined) {
    const role = oneOf(body.role, ['user', 'admin'], 'Doorka');
    if (target.id === me.id && role !== 'admin') fail(400, 'Adigu ma beddeli kartid doorkaaga');
    target.role = role;
  }
  if (body.active !== undefined) {
    if (target.id === me.id && !body.active) fail(400, 'Adigu ma joojin kartid akoonkaaga');
    target.active = !!body.active;
    if (!target.active) killSessions(target.id);
  }
  return { body: { user: adminView(target) } };
});

route('DELETE', '/api/admin/users/:id', async ({ req, params }) => {
  const { user: me } = requireAdmin(req);
  if (params.id === me.id) fail(400, 'Adigu ma tirtiri kartid akoonkaaga');
  findById(db.users, params.id, 'Isticmaalaha');
  killSessions(params.id);
  db.users = db.users.filter(u => u.id !== params.id);
  return { body: { ok: true } };
});

// ---------------------------------------------------------------- Static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const file = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      // SPA fallback
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------------------------------------------------------------- Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (!url.pathname.startsWith('/api/')) {
    return serveStatic(res, url.pathname);
  }

  const match = matchRoute(req.method, url.pathname);
  if (!match) return send(res, 404, { error: 'Route ma jiro' });

  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    const result = (await match.handler({
      req,
      body,
      params: match.params,
      query: url.searchParams
    })) || {};
    if (req.method !== 'GET') saveDb();
    send(res, result.status || 200, result.body !== undefined ? result.body : { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: 'Server-ka wax ayaa khaldamay' });
  }
});

server.listen(PORT, () => {
  console.log(`Nolol Maamul waa shaqeynayaa: http://localhost:${PORT}`);
});
