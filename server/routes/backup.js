const express = require('express');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Payment = require('../models/Payment');
const Schedule = require('../models/Schedule');

const router = express.Router();

// GET /api/backup — full JSON dump
router.get('/backup', async (req, res, next) => {
  try {
    const [students, sessions, payments, schedules] = await Promise.all([
      Student.find({}).lean(), Session.find({}).lean(), Payment.find({}).lean(), Schedule.find({}).lean()
    ]);
    res.json({ app: 'tutor-management', version: 2, exportedAt: new Date().toISOString(), students, sessions, payments, schedules });
  } catch (e) { next(e); }
});

// POST /api/backup/restore — { students:[], sessions:[], payments:[], schedules:[] }
router.post('/restore', async (req, res, next) => {
  try {
    const { students = [], sessions = [], payments = [], schedules = [] } = req.body || {};
    if (!Array.isArray(students) || !Array.isArray(sessions) || !Array.isArray(payments)) {
      return res.status(400).json({ error: 'Invalid backup file format.' });
    }
    await Promise.all([Student.deleteMany({}), Session.deleteMany({}), Payment.deleteMany({}), Schedule.deleteMany({})]);
    if (students.length) await Student.insertMany(students);
    if (sessions.length) await Session.insertMany(sessions);
    if (payments.length) await Payment.insertMany(payments);
    if (Array.isArray(schedules) && schedules.length) await Schedule.insertMany(schedules);
    res.json({ ok: true, students: students.length, sessions: sessions.length, payments: payments.length, schedules: Array.isArray(schedules) ? schedules.length : 0 });
  } catch (e) { next(e); }
});

module.exports = router;
