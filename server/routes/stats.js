const express = require('express');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Payment = require('../models/Payment');

const router = express.Router();

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
  const [y, m] = String(month).split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

// GET /api/stats?month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month;
    const r = month ? monthRange(month) : null;
    if (month && !r) return res.status(400).json({ error: 'Invalid month. Use YYYY-MM.' });
    const activeStudents = await Student.countDocuments();
    const sessQ = r ? { datetimeISO: { $gte: r.start, $lt: r.end } } : {};
    const payQ = r ? { dateISO: { $gte: r.start, $lt: r.end } } : {};
    const sessions = await Session.find(sessQ, { duration: 1, costSnapshot: 1 }).lean();
    const payments = await Payment.find(payQ, { amount: 1 }).lean();
    const hours = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);
    const billed = sessions.reduce((a, s) => a + (Number(s.costSnapshot) || 0), 0);
    const collected = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    res.json({
      activeStudents,
      hours: Math.round(hours * 100) / 100,
      billed: Math.round(billed * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      pending: Math.round((billed - collected) * 100) / 100
    });
  } catch (e) { next(e); }
});

// GET /api/statements?studentId=&month=YYYY-MM
router.get('/statement', async (req, res, next) => {
  try {
    const { studentId, month } = req.query;
    const r = monthRange(month);
    if (!studentId) return res.status(400).json({ error: 'studentId is required.' });
    if (!r) return res.status(400).json({ error: 'month (YYYY-MM) is required.' });
    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const sessions = await Session.find({ studentId, datetimeISO: { $gte: r.start, $lt: r.end } }).sort({ datetimeISO: 1 }).lean();
    const payments = await Payment.find({ studentId, dateISO: { $gte: r.start, $lt: r.end } }).sort({ dateISO: 1 }).lean();
    const hours = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);
    const billed = sessions.reduce((a, s) => a + (Number(s.costSnapshot) || 0), 0);
    const paid = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    res.json({
      student, month,
      hours: Math.round(hours * 100) / 100,
      billed: Math.round(billed * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      due: Math.round((billed - paid) * 100) / 100,
      sessions, payments
    });
  } catch (e) { next(e); }
});

module.exports = router;
