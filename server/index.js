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

// Simple helpers for location parsing and distance (Haversine)
function parseLocation(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split(',');
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function haversineMeters(a, b) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// Duplicate detection across both Report and AnonymousReport
async function findNearbyDuplicate({ chiefComplaint, location }) {
  const loc = parseLocation(location);
  if (!chiefComplaint || !loc) return null;
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours for active reports
  const since = new Date(now - windowMs);
  const statuses = ['Pending', 'In-progress'];

  const [recentAnon, recentReg] = await Promise.all([
    AnonymousReport.find({ chiefComplaint, status: { $in: statuses }, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(50),
    Report.find({ type: chiefComplaint, status: { $in: statuses }, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(50)
  ]);

  const radiusMeters = 500;
  for (const r of [...recentAnon, ...recentReg]) {
    const rLoc = parseLocation(r.location);
    if (!rLoc) continue;
    const d = haversineMeters(loc, rLoc);
    if (d <= radiusMeters) {
      let responderName;
      try {
        if (r.responderId) {
          const acc = await Account.findById(r.responderId).lean();
          responderName = acc?.name;
        }
      } catch {}
      return {
        id: String(r._id),
        status: r.status,
        createdAt: r.createdAt,
        responderName,
      };
    }
  }
  return null;
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
    if (acc.restricted) return res.status(403).json({ error: 'This account has been restricted. Contact your administrator.' });
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

    // Server-side duplicate prevention for registered users too
    try {
      const existing = await findNearbyDuplicate({ chiefComplaint: input.type, location: input.location });
      if (existing) {
        return res.status(409).json({ error: 'Duplicate report detected', isDuplicate: true, existingReport: existing });
      }
    } catch (e) {
      console.warn('Duplicate check failed for /reports:', e?.message || e);
      // Do not block if duplicate check throws; proceed to create
    }

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

// Pre-check for duplicate report (search both registered and anonymous)
app.get('/reports/check-duplicate', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const chiefComplaint = String(req.query.chiefComplaint || '').trim();
    const locationStr = String(req.query.location || '').trim();
    if (!chiefComplaint || !locationStr) {
      return res.status(400).json({ error: 'chiefComplaint and location are required' });
    }

    const loc = parseLocation(locationStr);
    if (!loc) return res.status(400).json({ error: 'Invalid location format. Use "lat, lng"' });

    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // 24 hours for active reports
    const since = new Date(now - windowMs);
    const statuses = ['Pending', 'In-progress'];

    // Query recent reports (both models) with same chiefComplaint/type and active status
    const [recentAnon, recentReg] = await Promise.all([
      AnonymousReport.find({ chiefComplaint, status: { $in: statuses }, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(50),
      Report.find({ type: chiefComplaint, status: { $in: statuses }, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(50)
    ]);

    const radiusMeters = 500; // 500m
    let match = null;
    for (const r of [...recentAnon, ...recentReg]) {
      const rLoc = parseLocation(r.location);
      if (!rLoc) continue;
      const d = haversineMeters(loc, rLoc);
      if (d <= radiusMeters) {
        match = r;
        break;
      }
    }

    if (!match) return res.status(200).json({ isDuplicate: false });

    // Build minimal response, try to include responder name if available
    let responderName;
    try {
      if (match.responderId) {
        const acc = await Account.findById(match.responderId).lean();
        responderName = acc?.name;
      }
    } catch {}

    const existingReport = {
      id: String(match._id),
      status: match.status,
      createdAt: match.createdAt,
      responderName,
    };

    res.status(200).json({ isDuplicate: true, existingReport });
  } catch (err) {
    console.error('Check duplicate error', err);
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

// Create a new anonymous report
app.post('/anonymous-reports', async (req, res) => {
  try {
    const { 
      type, 
      description, 
      location, 
      photoUrl, 
      photoUrls = [], 
      deviceId, 
      contactNo, 
      chiefComplaint, 
      personsInvolved, 
      fullName,
      responderId 
    } = req.body;

    if (!type || !description || !location || !deviceId || !responderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Server-side duplicate prevention for anonymous flow
    try {
      const existing = await findNearbyDuplicate({ chiefComplaint: chiefComplaint || type, location });
      if (existing) {
        return res.status(409).json({ error: 'Duplicate report detected', isDuplicate: true, existingReport: existing });
      }
    } catch (e) {
      console.warn('Duplicate check failed for /anonymous-reports:', e?.message || e);
      // Do not block if duplicate check throws; proceed to create
    }

    const newReport = new AnonymousReport({
      type,
      description,
      location,
      photoUrl,
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [photoUrl].filter(Boolean),
      deviceId,
      contactNo,
      chiefComplaint,
      personsInvolved,
      fullName,
      responderId,
      status: 'Pending',
      isAnonymous: true
    });

    const savedReport = await newReport.save();
    const report = savedReport.toClient();

    // Create notification for the responder
    try {
      await Notification.create({
        userId: responderId,
        title: `New anonymous report: ${type}`,
        reportId: String(report.id),
        kind: 'new',
        read: false,
      });
      console.log('Created responder notification for anonymous report:', report.id);
    } catch (notifErr) {
      console.error('Error creating responder notification:', notifErr);
    }

    // Broadcast new report event
    sseBroadcast({ type: 'report:new', report });

    res.status(201).json({ report });
  } catch (err) {
    console.error('Create anonymous report error', err);
    res.status(500).json({ error: 'Failed to create anonymous report' });
  }
});

// Get anonymous reports for a specific device
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
    const { status, responderId, notes } = req.body || {};
    const allowed = ['Pending', 'In-progress', 'Resolved'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Prepare update object
    const updateData = { status };
    
    // Add responder info if provided
    if (responderId) {
      updateData.handledById = responderId;
      if (status === 'In-progress') {
        updateData.acknowledgedAt = new Date();
      }
    }
    
    // Add responder notes if provided
    if (notes) {
      updateData.responderNotes = notes;
    }

    // Try to find in AnonymousReport first, then regular Report
    let updatedDoc = await AnonymousReport.findByIdAndUpdate(
      id, 
      updateData,
      { new: true }
    );
    
    let report;
    let isAnonymous = false;

    if (updatedDoc) {
      // Found in AnonymousReport
      isAnonymous = true;
      report = updatedDoc.toClient();
      console.log('Updated anonymous report status:', id, 'to', status, 'responder:', responderId || 'none');
    } else {
      // Try regular Report
      updatedDoc = await Report.findByIdAndUpdate(id, updateData, { new: true });
      if (!updatedDoc) return res.status(404).json({ error: 'Report not found' });
      report = withId(updatedDoc.toObject());
      console.log('Updated regular report status:', id, 'to', status, 'responder:', responderId || 'none');
    }

    res.json({ report });

    // Broadcast SSE event for report status update
    sseBroadcast({ type: 'report:update', report });

    // Notify the reporting user about status changes
    try {
      if (isAnonymous && updatedDoc.deviceId) {
        // Only proceed if status has actually changed
        const statusChanged = !updatedDoc.lastNotifiedStatus || updatedDoc.lastNotifiedStatus !== status;
        
        console.log('Processing anonymous notification:', {
          reportId: report.id,
          deviceId: updatedDoc.deviceId,
          currentStatus: status,
          lastNotifiedStatus: updatedDoc.lastNotifiedStatus,
          statusChanged,
          hasDeviceId: !!updatedDoc.deviceId
        });
        
        if (statusChanged) {
          // Build notification message based on status and responder info
          let title, message = '';
          
          switch (status) {
            case 'In-progress':
              title = '🚨 Help is on the way!';
              message = 'A responder has been assigned to your report and is on their way to assist you.';
              if (responderId) {
                // If we have responder info, we could add more details here
                message += ' The responder is now handling your case.';
              }
              break;
              
            case 'Resolved':
              title = '✅ Report Resolved';
              message = 'Your report has been successfully resolved and is now closed.\n\n';
              if (notes) {
                message += `Responder's note: ${notes}\n\n`;
              }
              message += 'Thank you for using our service! If you need further assistance, please submit a new report.';
              break;
              
            case 'Pending':
            default:
              title = '📝 Report Updated';
              message = 'The status of your report has been updated.';
          }
          
          try {
            console.log('Preparing to create notification for device:', updatedDoc.deviceId);
            
            // First, update the report with the new status and notification history
            const updateData = {
              lastNotifiedStatus: status,
              $push: { 
                notificationHistory: { 
                  status, 
                  notifiedAt: new Date(),
                  message: `${status} - ${title}`,
                  responderId: responderId || null
                } 
              }
            };
            
            // If this is a status change to 'In-progress', set acknowledgedAt
            if (status === 'In-progress') {
              updateData.acknowledgedAt = new Date();
              updateData.handledById = responderId || null;
            }
            
            // Update the report first
            await AnonymousReport.findByIdAndUpdate(
              id, 
              updateData,
              { new: true }
            );
            
            console.log('Report updated with new status:', status);
            
            // Create notification for anonymous user using AnonymousNotification model
            const notificationObj = {
              deviceId: String(updatedDoc.deviceId),
              title,
              message,
              reportId: String(report.id),
              kind: 'update',
              read: false,
              priority: status === 'In-progress' || status === 'Resolved' ? 'high' : 'normal',
              category: `report_${status.toLowerCase().replace('-', '_')}`,
              status: status,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            console.log('Creating anonymous notification with data:', notificationObj);
            
            const notification = await AnonymousNotification.create(notificationObj);
            console.log('Notification created successfully:', {
              id: notification._id,
              deviceId: notification.deviceId,
              reportId: notification.reportId,
              status: notification.status,
              createdAt: notification.createdAt
            });
            
            // Prepare the notification data for client
            const notificationData = {
              id: String(notification._id),
              deviceId: String(notification.deviceId),
              title: notification.title,
              message: notification.message,
              reportId: notification.reportId,
              kind: notification.kind,
              read: notification.read,
              priority: notification.priority,
              category: notification.category,
              status: notification.status,
              createdAt: notification.createdAt,
              updatedAt: notification.updatedAt
            };
            
            console.log('Anonymous notification created successfully:', notificationData);
            
            // Broadcast SSE event to all connected clients
            const sseData = {
              type: 'notification:new',
              notification: notificationData
            };
            
            console.log('Broadcasting SSE event:', sseData);
            sseBroadcast(sseData);
            console.log(`SSE event broadcast for device ${updatedDoc.deviceId}`);
            
            // Also send a direct SSE event specifically for this device
            const deviceSseData = {
              type: 'device:notification',
              deviceId: String(updatedDoc.deviceId),
              notification: notificationData
            };
            
            console.log('Sending device-specific SSE event:', deviceSseData);
            sseBroadcast(deviceSseData);
            
          } catch (error) {
            console.error('Failed to create notification:', {
              error: error.message,
              deviceId: updatedDoc.deviceId,
              reportId: report.id,
              status
            });
            throw error; // Re-throw to be caught by the outer try-catch
          }
        } else {
          console.log(`Skipping duplicate status notification for report ${report.id} (${status})`);
        }
      } else {
        // For registered users, create regular notification
        if (report.userId) {
          const statusChanged = !report.lastNotifiedStatus || report.lastNotifiedStatus !== status;
          
          if (statusChanged) {
            let title, message = '';
            
            switch (status) {
              case 'In-progress':
                title = 'Help is on the way!';
                message = 'A responder has been assigned to your report.';
                break;
                
              case 'Resolved':
                title = 'Report Resolved';
                message = 'Your report has been successfully resolved and is now closed.\n\n';
                if (notes) {
                  message += `Responder's note: ${notes}\n\n`;
                }
                message += 'Thank you for using our service! If you need further assistance, please submit a new report.';
                break;
                
              case 'Pending':
              default:
                title = 'Report Updated';
                message = 'The status of your report has been updated.';
            }
            
            await Notification.create({
              userId: String(report.userId),
              title,
              message,
              reportId: String(report.id),
              kind: 'update',
              read: false,
              priority: status === 'In-progress' ? 'high' : 'normal',
              category: 'report_update'
            });
            
            // Update the last notified status
            await Report.findByIdAndUpdate(id, { lastNotifiedStatus: status });
            
            console.log(`Notification sent for user report ${report.id} (${status}) to user ${report.userId}`);
          } else {
            console.log(`Skipping duplicate status notification for user report ${report.id} (${status})`);
          }
        }
      }
    } catch (e) { console.error('Create notification error', e); }
  } catch (err) {
    console.error('Update report status error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Notifications API
// Helper function to get notifications
async function getNotifications(userId, deviceId, limit = 50) {
  try {
    console.log('Getting notifications for:', { userId, deviceId, limit });
    
    if (userId) {
      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 100));
      
      console.log(`Found ${notifications.length} notifications for user ${userId}`);
      return notifications;
    } 
    
    if (deviceId) {
      const notifications = await AnonymousNotification.find({ deviceId })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 100));
      
      console.log(`Found ${notifications.length} anonymous notifications for device ${deviceId}`);
      console.log('Sample notification:', notifications[0] ? {
        id: notifications[0]._id,
        deviceId: notifications[0].deviceId,
        title: notifications[0].title,
        status: notifications[0].status,
        createdAt: notifications[0].createdAt
      } : 'No notifications found');
      
      return notifications;
    }
    
    throw new Error('Either userId or deviceId must be provided');
  } catch (error) {
    console.error('Error in getNotifications:', {
      error: error.message,
      userId,
      deviceId,
      stack: error.stack
    });
    throw error;
  }
}

app.get('/notifications', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    const deviceId = String(req.query.deviceId || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Cap at 100 items
    const skip = parseInt(req.query.skip) || 0;

    console.log('Notification request - userId:', userId, 'deviceId:', deviceId, 'limit:', limit, 'skip:', skip);

    if (!userId && !deviceId) {
      return res.status(400).json({ error: 'Either userId or deviceId is required' });
    }

    let notifications = [];
    let total = 0;
    let docs = [];

    if (userId) {
      // Handle user notifications
      total = await Notification.countDocuments({ userId });
      docs = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      console.log(`Found ${docs.length} notifications for user ${userId}`);
    } else if (deviceId) {
      // Handle anonymous user notifications
      try {
        total = await AnonymousNotification.countDocuments({ deviceId });
        console.log(`Found ${total} total notifications for device ${deviceId}`);
        
        docs = await AnonymousNotification.find({ deviceId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
        
        console.log(`Retrieved ${docs.length} notifications for device ${deviceId}`);
        
        // Log sample notification for debugging
        if (docs.length > 0) {
          console.log('Sample notification data:', {
            id: String(docs[0]._id),
            deviceId: docs[0].deviceId,
            title: docs[0].title,
            status: docs[0].status,
            createdAt: docs[0].createdAt
          });
        }
      } catch (error) {
        console.error('Error fetching anonymous notifications:', {
          error: error.message,
          stack: error.stack,
          deviceId
        });
        throw error;
      }
    }

    // Process notifications to ensure consistent format
    notifications = docs.map(d => ({
      id: String(d._id),
      title: d.title || 'Update',
      message: d.message || '',
      reportId: d.reportId,
      kind: d.kind || 'update',
      read: !!d.read,
      priority: d.priority || 'normal',
      category: d.category || 'report_update',
      status: d.status || 'update',
      createdAt: d.createdAt || new Date(),
      updatedAt: d.updatedAt || new Date(),
      _id: undefined
    }));

    console.log('Found', notifications.length, 'notifications out of', total);
    
    res.json({
      notifications,
      pagination: {
        total,
        limit: Math.min(limit, 100),
        skip,
        hasMore: (skip + notifications.length) < total
      }
    });
  } catch (err) {
    console.error('List notifications error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark notification as read
app.patch('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { read = true } = req.body || {};
    const { userId, deviceId } = req.query;

    // Verify at least one identifier is provided
    if (!userId && !deviceId) {
      return res.status(400).json({ error: 'userId or deviceId query parameter is required' });
    }

    // Try to update in AnonymousNotification first if deviceId is provided
    if (deviceId) {
      const updated = await AnonymousNotification.findOneAndUpdate(
        { _id: id, deviceId },
        { read: !!read, readAt: read ? new Date() : null },
        { new: true }
      );

      if (updated) {
        const notification = updated.toClient ? updated.toClient() : updated;
        console.log('Marked anonymous notification as read:', id, read);
        return res.json({ notification });
      }
    }

    // Try regular Notification if userId is provided
    if (userId) {
      const updated = await Notification.findOneAndUpdate(
        { _id: id, userId },
        { read: !!read, readAt: read ? new Date() : null },
        { new: true }
      );

      if (updated) {
        const notification = updated.toObject ? updated.toObject() : updated;
        notification.id = String(notification._id);
        delete notification._id;
        console.log('Marked regular notification as read:', id, read);
        return res.json({ notification });
      }
    }

    // If we got here, no matching notification was found
    return res.status(404).json({ error: 'Notification not found or access denied' });
  } catch (err) {
    console.error('Update notification read error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all notifications as read
app.patch('/notifications/mark-all-read', async (req, res) => {
  try {
    const { userId, deviceId, isAnonymous } = req.body;
    
    if (!userId && !deviceId) {
      return res.status(400).json({ error: 'Either userId or deviceId is required' });
    }

    const update = { 
      $set: { 
        read: true, 
        readAt: new Date(),
        updatedAt: new Date()
      } 
    };

    if (userId && !isAnonymous) {
      // Update notifications for registered user
      const result = await Notification.updateMany(
        { userId, read: false },
        update
      );
      console.log(`Marked ${result.modifiedCount} user notifications as read for user ${userId}`);
    } else if (deviceId) {
      // Update notifications for anonymous user
      const result = await AnonymousNotification.updateMany(
        { deviceId, read: false },
        update
      );
      console.log(`Marked ${result.modifiedCount} anonymous notifications as read for device ${deviceId}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Mark all notifications read error', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message 
    });
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

