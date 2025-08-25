import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// In-memory data store (mock). Replace with DB later.
const KEYS = { accounts: 'ERS_ACCOUNTS', reports: 'ERS_REPORTS' };

/** Accounts and session (mock) */
const accounts = [];
const reports = [];

const defaultAdmin = {
  id: 'admin-1',
  name: 'System Admin',
  email: 'admin@ers.local',
  phone: '0000000000',
  role: 'admin',
  password: 'admin123',
};

function ensureSeed() {
  if (!accounts.find(a => a.role === 'admin')) {
    accounts.unshift({ ...defaultAdmin });
  }
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

ensureSeed();

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ers-server', time: Date.now() });
});

// Auth
app.post('/auth/signup', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (accounts.find(a => a.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  const acc = { id: uid('usr'), name, email, phone, role: 'user', password };
  accounts.push(acc);
  res.status(201).json({ user: sanitize(acc) });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const acc = accounts.find(a => a.email.toLowerCase() === String(email).toLowerCase() && a.password === password);
  if (!acc) return res.status(401).json({ error: 'Invalid email or password' });
  // For mock, return user object directly. In real app, issue JWT
  res.json({ user: sanitize(acc) });
});

// Users
app.get('/users', (_req, res) => {
  const nonAdmins = accounts.filter(a => a.role !== 'admin').map(sanitize);
  res.json({ users: nonAdmins });
});

app.post('/users', (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (!['user', 'responder', 'admin'].includes(role || 'user')) return res.status(400).json({ error: 'Invalid role' });
  if (accounts.find(a => a.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  const acc = { id: uid(role === 'responder' ? 'rsp' : 'usr'), name, email, phone, role: role || 'user', password };
  accounts.push(acc);
  res.status(201).json({ user: sanitize(acc) });
});

app.patch('/users/:id', (req, res) => {
  const { id } = req.params;
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found' });
  const current = accounts[idx];
  const patch = req.body || {};
  const updated = { ...current, ...patch, id: current.id };
  accounts[idx] = updated;
  res.json({ user: sanitize(updated) });
});

app.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  const before = accounts.length;
  for (let i = accounts.length - 1; i >= 0; i--) {
    if (accounts[i].id === id) accounts.splice(i, 1);
  }
  if (before === accounts.length) return res.status(404).json({ error: 'Account not found' });
  res.status(204).send();
});

app.get('/responders', (_req, res) => {
  const responders = accounts.filter(a => a.role === 'responder').map(sanitize);
  res.json({ responders });
});

// Reports
app.post('/reports', (req, res) => {
  const input = req.body || {};
  const required = ['type', 'description', 'location', 'responderId'];
  for (const key of required) if (!input[key]) return res.status(400).json({ error: `Missing field: ${key}` });
  const report = { id: uid('rpt'), status: 'Pending', createdAt: Date.now(), ...input };
  reports.unshift(report);
  res.status(201).json({ report });
});

app.get('/reports', (_req, res) => {
  res.json({ reports });
});

app.get('/reports/user/:userId', (req, res) => {
  const { userId } = req.params;
  res.json({ reports: reports.filter(r => r.userId === userId) });
});

app.get('/reports/responder/:responderId', (req, res) => {
  const { responderId } = req.params;
  res.json({ reports: reports.filter(r => r.responderId === responderId) });
});

app.patch('/reports/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const allowed = ['Pending', 'In-progress', 'Resolved'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const idx = reports.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Report not found' });
  reports[idx].status = status;
  res.json({ report: reports[idx] });
});

function sanitize(acc) {
  const { password, ...rest } = acc;
  return rest;
}

app.listen(PORT, () => {
  console.log(`ERS server listening on http://localhost:${PORT}`);
});
