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
import AnonymousReport from './models/AnonymousReport.js';
import AnonymousNotification from './models/AnonymousNotification.js';

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

// Profile self-management endpoints
app.get('/auth/me', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    
    const acc = await Account.findOne({ email: String(email).toLowerCase(), password });
    if (!acc) return res.status(401).json({ error: 'Invalid credentials' });
    
    res.json({ user: sanitizeAccount(acc) });
  } catch (err) {
    console.error('Get profile error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/auth/me', async (req, res) => {
  try {
    const { id, email, password, authEmail, authPassword, newEmail, newPassword, name, phone, photoUrl, avatarUrl, ...rest } = req.body || {};
    
    // Determine auth creds (support both legacy email/password and authEmail/authPassword)
    const aEmail = authEmail || email;
    const aPass = authPassword || password;

    // For sensitive updates (newEmail, newPassword), require authentication
    if ((newEmail || newPassword) && (!aEmail || !aPass)) {
      return res.status(400).json({ error: 'Email and password both required for sensitive updates' });
    }
    
    let acc;
    if (aEmail && aPass) {
      // Authenticate for sensitive updates
      acc = await Account.findOne({ email: String(aEmail).toLowerCase(), password: aPass });
      if (!acc) return res.status(401).json({ error: 'Invalid credentials' });
    } else {
      // For non-sensitive updates, require a valid user id
      if (!id) return res.status(400).json({ error: 'User id is required for profile updates' });
      acc = await Account.findById(id);
      if (!acc) return res.status(404).json({ error: 'User not found' });
    }
    
    // Update allowed fields
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    
    // Only update email/password if provided (and already authenticated)
    if (newEmail) updates.email = String(newEmail).toLowerCase();
    if (newPassword) updates.password = newPassword;
    
    const updatedDoc = await Account.findByIdAndUpdate(acc._id, updates, { 
      new: true, 
      projection: { password: 0 } 
    });
    
    const updated = updatedDoc ? withId(updatedDoc.toObject()) : null;
    
    // Broadcast update to all connected clients
    if (updated) {
      sseBroadcast({ type: 'user:update', user: updated });
    }
    
    res.json({ user: updated });
  } catch (err) {
    console.error('Update profile error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/auth/me', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required for authentication' });
    
    const acc = await Account.findOne({ email: String(email).toLowerCase(), password });
    if (!acc) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Delete the account
    await Account.findByIdAndDelete(acc._id);
    
    res.status(204).send();
  } catch (err) {
    console.error('Delete profile error', err);
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

app.get('/admins', async (_req, res) => {
  try {
    const adminsRaw = await Account.find({ role: 'admin' }, { password: 0 }).lean();
    const admins = adminsRaw.map(withId);
    res.json({ admins });
  } catch (err) {
    console.error('List admins error', err);
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

    let created;
    let report;
    let isAnonymousReport = !input.userId && input.deviceId;

    if (isAnonymousReport) {
      // Use AnonymousReport model for anonymous reports
      console.log('Creating anonymous report for deviceId:', input.deviceId);
      created = await AnonymousReport.create({
        ...input,
        status: 'Pending',
        isAnonymous: true
      });
      report = created.toClient();
      console.log('Anonymous report created with ID:', report.id);
    } else {
      // Use regular Report model for registered users
      console.log('Creating regular report for userId:', input.userId);
      created = await Report.create({ ...input, status: 'Pending' });
      report = withId(created.toObject());
      console.log('Regular report created with ID:', report.id);
    }

    res.status(201).json({ report });

    // Broadcast SSE event for new report
    sseBroadcast({ type: 'report:new', report });

    // Create a Notification for the assigned responder and all admins
    try {
      if (report.responderId) {
        const notif = await Notification.create({
          userId: String(report.responderId),
          title: 'New report assigned to you',
          reportId: String(report.id),
          kind: 'new',
          read: false,
        });
        console.log('Created responder notification for report:', report.id, 'responder:', report.responderId);
      }

      // Notify all admins so they see the new report in their notifications
      try {
        const admins = await Account.find({ role: 'admin' }).lean();
        for (const admin of admins) {
          await Notification.create({
            userId: String(admin._id),
            title: 'New report submitted',
            reportId: String(report.id),
            kind: 'new',
            read: false,
          });
        }
        console.log('Created admin notifications for new report:', report.id, 'adminCount:', admins?.length || 0);
      } catch (e) {
        console.error('Create admin notifications error', e);
      }
    } catch (e) { console.error('Create notification error', e); }
  } catch (err) {
    console.error('Create report error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports', async (_req, res) => {
  try {
    // Get both regular and anonymous reports
    const [regularReports, anonymousReports] = await Promise.all([
      Report.find({}).sort({ createdAt: -1 }).lean(),
      AnonymousReport.find({}).sort({ createdAt: -1 })
    ]);

    const regularReportsMapped = regularReports.map(withId);
    const anonymousReportsMapped = anonymousReports.map(r => r.toClient());

    const allReports = [...regularReportsMapped, ...anonymousReportsMapped];
    res.json({ reports: allReports });
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

// Anonymous Reports API
app.get('/anonymous-reports', async (_req, res) => {
  try {
    const reportsRaw = await AnonymousReport.find({}).sort({ createdAt: -1 });
    const reports = reportsRaw.map(r => r.toClient());
    res.json({ reports });
  } catch (err) {
    console.error('List anonymous reports error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/anonymous-reports/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const reportsRaw = await AnonymousReport.find({ deviceId }).sort({ createdAt: -1 });
    const reports = reportsRaw.map(r => r.toClient());
    res.json({ reports });
  } catch (err) {
    console.error('List anonymous device reports error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/responder/:responderId', async (req, res) => {
  try {
    const { responderId } = req.params;

    // Get both regular and anonymous reports for this responder
    const [regularReports, anonymousReports] = await Promise.all([
      Report.find({ responderId }).sort({ createdAt: -1 }).lean(),
      AnonymousReport.find({ responderId }).sort({ createdAt: -1 })
    ]);

    const regularReportsMapped = regularReports.map(withId);
    const anonymousReportsMapped = anonymousReports.map(r => r.toClient());

    const allReports = [...regularReportsMapped, ...anonymousReportsMapped];
    res.json({ reports: allReports });
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

    // Try to find in AnonymousReport first, then regular Report
    let updatedDoc = await AnonymousReport.findByIdAndUpdate(id, { status }, { new: true });
    let report;
    let isAnonymous = false;

    if (updatedDoc) {
      // Found in AnonymousReport
      report = updatedDoc.toClient();
      isAnonymous = true;
      console.log('Updated anonymous report status:', id, 'to', status);
    } else {
      // Try regular Report
      updatedDoc = await Report.findByIdAndUpdate(id, { status }, { new: true });
      if (!updatedDoc) return res.status(404).json({ error: 'Report not found' });
      report = withId(updatedDoc.toObject());
      console.log('Updated regular report status:', id, 'to', status);
    }

    res.json({ report });

    // Broadcast SSE event for report status update
    sseBroadcast({ type: 'report:update', report });

    // Do NOT notify the responder on status updates; only notify the reporting user below
    // Also notify the reporting user when their case status changes
    try {
      if (isAnonymous) {
        // For anonymous reports, create AnonymousNotification
        if (report.deviceId) {
          let title = 'Your report was updated';
          if (report.status === 'In-progress') title = 'Your report is now in progress (taken)';
          if (report.status === 'Resolved') title = 'Your report has been completed';

          await AnonymousNotification.create({
            deviceId: String(report.deviceId),
            title,
            reportId: String(report.id),
            kind: 'update',
            read: false,
          });
          console.log('Created anonymous notification for report:', report.id, 'deviceId:', report.deviceId, 'status:', report.status);
        }
      } else {
        // For registered users, create regular notification
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
          console.log('Created user notification for report:', report.id, 'user:', report.userId, 'status:', report.status);
        }
      }
    } catch (e) { console.error('Create notification error', e); }
  } catch (err) {
    console.error('Update report status error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notifications API
app.get('/notifications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    const deviceId = String(req.query.deviceId || '').trim();

    console.log('Notification request - userId:', userId, 'deviceId:', deviceId);

    if (!userId && !deviceId) return res.status(400).json({ error: 'userId or deviceId is required' });

    let notifications = [];

    if (userId) {
      // Fetch regular notifications for registered users
      console.log('Fetching regular notifications for userId:', userId);
      const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
      notifications = docs.map(d => ({ ...d, id: String(d._id), _id: undefined }));
    } else if (deviceId) {
      // Fetch anonymous notifications for anonymous users
      console.log('Fetching anonymous notifications for deviceId:', deviceId);
      const docs = await AnonymousNotification.find({ deviceId }).sort({ createdAt: -1 });
      notifications = docs.map(d => d.toClient());
    }

    console.log('Found', notifications.length, 'notifications');
    console.log('Notification titles:', notifications.map(n => ({ id: n.id, title: n.title, kind: n.kind })));

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

    // Try to update in AnonymousNotification first, then regular Notification
    let updated = await AnonymousNotification.findByIdAndUpdate(id, { read: !!read }, { new: true });

    if (updated) {
      // Found in AnonymousNotification
      const notification = updated.toClient();
      console.log('Marked anonymous notification as read:', id, read);
      res.json({ notification });
    } else {
      // Try regular Notification
      updated = await Notification.findByIdAndUpdate(id, { read: !!read }, { new: true }).lean();
      if (!updated) return res.status(404).json({ error: 'Notification not found' });

      const notification = { ...updated, id: String(updated._id) };
      delete notification._id;
      console.log('Marked regular notification as read:', id, read);
      res.json({ notification });
    }
  } catch (err) {
    console.error('Update notification read error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Try to delete from AnonymousNotification first, then regular Notification
    let deleted = await AnonymousNotification.findByIdAndDelete(id);

    if (deleted) {
      console.log('Deleted anonymous notification:', id);
      res.status(204).send();
    } else {
      // Try regular Notification
      deleted = await Notification.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ error: 'Notification not found' });
      console.log('Deleted regular notification:', id);
      res.status(204).send();
    }
  } catch (err) {
    console.error('Delete notification error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/notifications/mark-all-read', async (req, res) => {
  try {
    const { userId, deviceId } = req.body || {};
    if (!userId && !deviceId) return res.status(400).json({ error: 'userId or deviceId is required' });

    if (userId) {
      // Mark all regular notifications as read for registered user
      console.log('Marking all regular notifications as read for userId:', userId);
      await Notification.updateMany({ userId, read: false }, { read: true });
    } else if (deviceId) {
      // Mark all anonymous notifications as read for anonymous user
      console.log('Marking all anonymous notifications as read for deviceId:', deviceId);
      await AnonymousNotification.updateMany({ deviceId, read: false }, { read: true });
    }

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
