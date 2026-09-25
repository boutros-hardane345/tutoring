const express = require('express');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Payment = require('../models/Payment');

const router = express.Router();

// GET /api/backup — full JSON dump
router.get('/backup', async (req, res, next) => {
  try {
    const [students, sessions, payments] = await Promise.all([
      Student.find({}).lean(), Session.find({}).lean(), Payment.find({}).lean()
    ]);
    res.json({ app: 'tutor-management', version: 1, exportedAt: new Date().toISOString(), students, sessions, payments });
  } catch (e) { next(e); }
});

// POST /api/backup/restore — { students:[], sessions:[], payments:[] }
router.post('/restore', async (req, res, next) => {
  try {
    const { students = [], sessions = [], payments = [] } = req.body || {};
    if (!Array.isArray(students) || !Array.isArray(sessions) || !Array.isArray(payments)) {
      return res.status(400).json({ error: 'Invalid backup file format.' });
    }
    await Promise.all([Student.deleteMany({}), Session.deleteMany({}), Payment.deleteMany({})]);
    if (students.length) await Student.insertMany(students);
    if (sessions.length) await Session.insertMany(sessions);
    if (payments.length) await Payment.insertMany(payments);
    res.json({ ok: true, students: students.length, sessions: sessions.length, payments: payments.length });
  } catch (e) { next(e); }
});

module.exports = router;
