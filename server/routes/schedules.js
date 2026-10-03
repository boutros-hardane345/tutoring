const express = require('express');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Student = require('../models/Student');

const router = express.Router();

function bad(res, msg) { return res.status(400).json({ error: msg }); }
function validTime(t) { return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(t || '').trim()); }

// GET /api/schedules?studentId=
router.get('/', async (req, res, next) => {
  try {
    const q = {};
    if (req.query.studentId) {
      if (!mongoose.isValidObjectId(req.query.studentId)) return bad(res, 'Invalid studentId.');
      q.studentId = req.query.studentId;
    }
    const slots = await Schedule.find(q).populate('studentId', 'name grade ratePerHour').sort({ dayOfWeek: 1, start: 1 }).lean();
    res.json(slots);
  } catch (e) { next(e); }
});

async function validateBody(body) {
  const { studentId, dayOfWeek, start, end } = body || {};
  if (!studentId || !mongoose.isValidObjectId(studentId)) return 'Valid student is required.';
  const st = await Student.findById(studentId);
  if (!st) return 'Student not found.';
  const d = Number(dayOfWeek);
  if (!Number.isInteger(d) || d < 0 || d > 6) return 'Day of week is required (0=Sunday..6=Saturday).';
  if (!validTime(start) || !validTime(end)) return 'Start/End must be HH:MM.';
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if (eh * 60 + em <= sh * 60 + sm) return 'End time must be after start time.';
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const err = await validateBody(req.body);
    if (err) return bad(res, err);
    const { studentId, dayOfWeek, start, end } = req.body;
    const slot = await Schedule.create({
      studentId,
      dayOfWeek: Number(dayOfWeek),
      start: String(start).trim(),
      end: String(end).trim()
    });
    res.status(201).json(await slot.populate('studentId', 'name grade ratePerHour'));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const slot = await Schedule.findById(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Schedule slot not found.' });
    const merged = {
      studentId: req.body.studentId || String(slot.studentId),
      dayOfWeek: req.body.dayOfWeek != null ? req.body.dayOfWeek : slot.dayOfWeek,
      start: req.body.start || slot.start,
      end: req.body.end || slot.end
    };
    const err = await validateBody(merged);
    if (err) return bad(res, err);
    slot.studentId = merged.studentId;
    slot.dayOfWeek = Number(merged.dayOfWeek);
    slot.start = String(merged.start).trim();
    slot.end = String(merged.end).trim();
    await slot.save();
    res.json(await slot.populate('studentId', 'name grade ratePerHour'));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const s = await Schedule.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ error: 'Schedule slot not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
