const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Payment = require('../models/Payment');

const router = express.Router();

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
  const [y, m] = String(month).split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}
function bad(res, msg) { return res.status(400).json({ error: msg }); }

// GET /api/payments?studentId=&month=
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
      q.dateISO = { $gte: r.start, $lt: r.end };
    }
    res.json(await Payment.find(q).sort({ dateISO: -1 }).lean());
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { studentId, dateISO, amount, note } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) return bad(res, 'Valid student is required.');
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const d = dateISO ? new Date(dateISO) : new Date();
    if (isNaN(d.getTime())) return bad(res, 'Valid payment date is required.');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return bad(res, 'Amount must be a positive number.');
    const p = await Payment.create({ studentId, dateISO: d, amount: Math.round(amt * 100) / 100, note: String(note || '').trim() });
    res.status(201).json(p);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const p = await Payment.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
