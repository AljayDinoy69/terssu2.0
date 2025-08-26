import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDB from './db.js';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import Account from './models/Account.js';
import Report from './models/Report.js';
import Notification from './models/Notification.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// --- SSE (Server-Sent Events) setup ---
const sseClients = new Set();

function sseBroadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  // Send a comment to establish the stream
  res.write(': connected\n\n');
  sseClients.add(res);
  // Heartbeat to keep proxies from closing the connection
  const hb = setInterval(() => {
    try { res.write(`: hb ${Date.now()}\n\n`); } catch {}
  }, 25000);
  req.on('close', () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
});
// --- End SSE setup ---

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer (memory) for image uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helpers
function sanitizeAccount(acc) {
  if (!acc) return acc;
  if (typeof acc.toSafeJSON === 'function') return acc.toSafeJSON();
  const { password, ...rest } = acc;
  return rest;
}

function withId(obj) {
  if (!obj) return obj;
  const o = { ...obj };
  if (o._id && !o.id) {
    o.id = String(o._id);
    delete o._id;
  }
  delete o.password;
  return o;
}

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ers-server', time: Date.now() });
});

// Upload endpoint (multipart/form-data)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const folder = process.env.CLOUDINARY_FOLDER || 'ers';
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err || !result) {
          console.error('Cloudinary upload error', err);
          return res.status(500).json({ error: 'Failed to upload image' });
        }
        res.status(201).json({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error('Upload endpoint error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    const exists = await Account.findOne({ email: String(email).toLowerCase() }).lean();
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const acc = await Account.create({ name, email, phone, role: 'user', password });
    res.status(201).json({ user: sanitizeAccount(acc) });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const acc = await Account.findOne({ email: String(email).toLowerCase(), password });
    if (!acc) return res.status(401).json({ error: 'Invalid email or password' });
    // For mock, return user object directly. In real app, issue JWT
    res.json({ user: sanitizeAccount(acc) });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users
app.get('/users', async (_req, res) => {
  try {
    const usersRaw = await Account.find({ role: { $ne: 'admin' } }, { password: 0 }).lean();
    const users = usersRaw.map(withId);
    res.json({ users });
  } catch (err) {
    console.error('List users error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    if (!['user', 'responder', 'admin'].includes(role || 'user')) return res.status(400).json({ error: 'Invalid role' });
    const exists = await Account.findOne({ email: String(email).toLowerCase() }).lean();
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const acc = await Account.create({ name, email, phone, role: role || 'user', password });
    res.status(201).json({ user: sanitizeAccount(acc) });
  } catch (err) {
    console.error('Create user error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { ...req.body };
    delete patch.password; // prevent accidental password change here
    const updatedDoc = await Account.findByIdAndUpdate(id, patch, { new: true, projection: { password: 0 } });
    const updated = updatedDoc ? withId(updatedDoc.toObject()) : null;
    if (!updated) return res.status(404).json({ error: 'Account not found' });
    res.json({ user: updated });
  } catch (err) {
    console.error('Update user error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Account.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Delete user error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/responders', async (_req, res) => {
  try {
    const respondersRaw = await Account.find({ role: 'responder' }, { password: 0 }).lean();
    const responders = respondersRaw.map(withId);
    res.json({ responders });
  } catch (err) {
    console.error('List responders error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reports
app.post('/reports', async (req, res) => {
  try {
    const input = req.body || {};
    const required = ['type', 'description', 'location', 'responderId'];
    for (const key of required) if (!input[key]) return res.status(400).json({ error: `Missing field: ${key}` });
    // Allow clients that still send photoUri
    if (!input.photoUrl && input.photoUri) input.photoUrl = input.photoUri;
    const created = await Report.create({ ...input, status: 'Pending' });
    const report = withId(created.toObject());
    res.status(201).json({ report });
    // Broadcast SSE event for new report
    sseBroadcast({ type: 'report:new', report });
    // Create a Notification for the assigned responder
    try {
      if (report.responderId) {
        const notif = await Notification.create({
          userId: String(report.responderId),
          title: 'New report assigned to you',
          reportId: String(report.id),
          kind: 'new',
          read: false,
        });
        // Optional: could broadcast a notification event in future
      }
    } catch (e) { console.error('Create notification error', e); }
  } catch (err) {
    console.error('Create report error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports', async (_req, res) => {
  try {
    const reportsRaw = await Report.find({}).sort({ createdAt: -1 }).lean();
    const reports = reportsRaw.map(withId);
    res.json({ reports });
  } catch (err) {
    console.error('List reports error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const reportsRaw = await Report.find({ userId }).sort({ createdAt: -1 }).lean();
    const reports = reportsRaw.map(withId);
    res.json({ reports });
  } catch (err) {
    console.error('List user reports error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/responder/:responderId', async (req, res) => {
  try {
    const { responderId } = req.params;
    const reportsRaw = await Report.find({ responderId }).sort({ createdAt: -1 }).lean();
    const reports = reportsRaw.map(withId);
    res.json({ reports });
  } catch (err) {
    console.error('List responder reports error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/reports/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ['Pending', 'In-progress', 'Resolved'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const updatedDoc = await Report.findByIdAndUpdate(id, { status }, { new: true });
    if (!updatedDoc) return res.status(404).json({ error: 'Report not found' });
    const report = withId(updatedDoc.toObject());
    res.json({ report });
    // Broadcast SSE event for report status update
    sseBroadcast({ type: 'report:update', report });
    // Do NOT notify the responder on status updates; only notify the reporting user below
    // Also notify the reporting user when their case status changes
    try {
      if (report.userId) {
        let title = 'Your report was updated';
        if (report.status === 'In-progress') title = 'Your report is now in progress (taken)';
        if (report.status === 'Resolved') title = 'Your report has been completed';
        await Notification.create({
          userId: String(report.userId),
          title,
          reportId: String(report.id),
          kind: 'update',
          read: false,
        });
      }
    } catch (e) { console.error('Create user notification error', e); }
  } catch (err) {
    console.error('Update report status error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notifications API
app.get('/notifications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
    const notifications = docs.map(d => ({ ...d, id: String(d._id), _id: undefined }));
    res.json({ notifications });
  } catch (err) {
    console.error('List notifications error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body || {};
    const updated = await Notification.findByIdAndUpdate(id, { read: !!read }, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: 'Notification not found' });
    const notification = { ...updated, id: String(updated._id) };
    delete notification._id;
    res.json({ notification });
  } catch (err) {
    console.error('Update notification read error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Notification not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Delete notification error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/notifications/mark-all-read', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    await Notification.updateMany({ userId, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark all read error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function start() {
  try {
    await connectDB(process.env.MONGODB_URI);
    // Seed default admin if missing
    const adminExists = await Account.findOne({ role: 'admin' }).lean();
    if (!adminExists) {
      await Account.create({
        name: 'System Admin',
        email: 'admin@ers.local',
        phone: '0000000000',
        role: 'admin',
        password: 'admin123',
      });
      console.log('Seeded default admin account (admin@ers.local / admin123)');
    }
    app.listen(PORT, () => {
      console.log(`ERS server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
