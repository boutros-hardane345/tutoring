const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Session = require('../models/Session');

const router = express.Router();

function monthRange(month) {
  // month = YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
  const [y, m] = String(month).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

function bad(res, msg) {
  return res.status(400).json({ error: msg });
}

// GET /api/sessions?studentId=&month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const q = {};
    if (req.query.studentId) {
      if (!mongoose.isValidObjectId(req.query.studentId)) return bad(res, 'Invalid studentId.');
      q.studentId = req.query.studentId;
    }
    if (req.query.month) {
      const r = monthRange(req.query.month);
      if (!r) return bad(res, 'Invalid month. Use YYYY-MM.');
      q.datetimeISO = { $gte: r.start, $lt: r.end };
    }
    const sessions = await Session.find(q).sort({ datetimeISO: -1 }).lean();
    res.json(sessions);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { studentId, datetimeISO, duration, subject, taught, homework } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) return bad(res, 'Valid student is required.');
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const dt = new Date(datetimeISO);
    if (isNaN(dt.getTime())) return bad(res, 'Valid date & time is required.');
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 24) return bad(res, 'Duration must be between 0.01 and 24 hours.');
    if (!taught || !String(taught).trim()) return bad(res, 'What was taught is required.');
    const s = await Session.create({
      studentId,
      datetimeISO: dt,
      duration: dur,
      subject: String(subject || '').trim(),
      taught: String(taught).trim(),
      homework: String(homework || '').trim(),
      homeworkDone: false,
      costSnapshot: Math.round(dur * student.ratePerHour * 100) / 100
    });
    res.status(201).json(s);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await Session.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Session not found.' });
    const { datetimeISO, duration, subject, taught, homework } = req.body || {};
    const dt = new Date(datetimeISO);
    if (isNaN(dt.getTime())) return bad(res, 'Valid date & time is required.');
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 24) return bad(res, 'Duration must be between 0.01 and 24 hours.');
    if (!taught || !String(taught).trim()) return bad(res, 'What was taught is required.');
    const student = await Student.findById(existing.studentId);
    existing.datetimeISO = dt;
    existing.duration = dur;
    existing.subject = String(subject || '').trim();
    existing.taught = String(taught).trim();
    existing.homework = String(homework || '').trim();
    if (student) existing.costSnapshot = Math.round(dur * student.ratePerHour * 100) / 100;
    await existing.save();
    res.json(existing);
  } catch (e) { next(e); }
});

// Toggle homework Done / Not Done
router.patch('/:id/homework', async (req, res, next) => {
  try {
    const s = await Session.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found.' });
    if (typeof req.body.homeworkDone === 'boolean') s.homeworkDone = req.body.homeworkDone;
    else s.homeworkDone = !s.homeworkDone;
    await s.save();
    res.json(s);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const s = await Session.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
