require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const students = require('./routes/students');
const sessions = require('./routes/sessions');
const payments = require('./routes/payments');
const stats = require('./routes/stats');
const backup = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

let dbStatus = 'disconnected';
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => { dbStatus = 'connected'; console.log('Connected to MongoDB Atlas'); })
    .catch((err) => { dbStatus = 'error'; console.error('MongoDB connection error:', err.message); });
} else {
  console.warn('MONGODB_URI not set — API will return 503 for DB routes.');
}

function requireDb(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected. Check MONGODB_URI / Atlas network access.' });
  }
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : dbStatus, time: new Date().toISOString() });
});

app.use('/api/students', requireDb, students);
app.use('/api/sessions', requireDb, sessions);
app.use('/api/payments', requireDb, payments);
app.use('/api/stats', requireDb, stats);
app.use('/api/statements', requireDb, stats);
app.use('/api/backup', requireDb, backup);

// Serve frontend
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Error handler (must be last — zero unhandled console errors for clients)
app.use((err, req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error.' });
});

app.listen(PORT, () => console.log(`Tutor app listening on port ${PORT}`));
