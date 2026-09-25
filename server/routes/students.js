const express = require('express');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Payment = require('../models/Payment');

const router = express.Router();

function bad(res, msg) {
  return res.status(400).json({ error: msg });
}

// GET /api/students?search=&grade=
router.get('/', async (req, res, next) => {
  try {
    const { search = '', grade = '' } = req.query;
    const q = {};
    if (search) q.name = { $regex: String(search).slice(0, 80), $options: 'i' };
    if (grade) q.grade = String(grade).slice(0, 60);
    const students = await Student.find(q).sort({ name: 1 }).lean();
    res.json(students);
  } catch (e) { next(e); }
});

// GET distinct grades for filter
router.get('/meta/grades', async (req, res, next) => {
  try {
    const grades = await Student.distinct('grade');
    res.json(grades.filter(Boolean).sort());
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, grade, subjects, ratePerHour } = req.body || {};
    if (!name || !String(name).trim()) return bad(res, 'Full name is required.');
    if (!grade || !String(grade).trim()) return bad(res, 'Grade is required.');
    if (!subjects || !String(subjects).trim()) return bad(res, 'Subjects are required.');
    const rate = Number(ratePerHour);
    if (!Number.isFinite(rate) || rate <= 0) return bad(res, 'Cost per hour must be a positive number.');
    const s = await Student.create({
      name: String(name).trim(),
      grade: String(grade).trim(),
      subjects: String(subjects).trim(),
      ratePerHour: rate
    });
    res.status(201).json(s);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, grade, subjects, ratePerHour } = req.body || {};
    if (!name || !String(name).trim()) return bad(res, 'Full name is required.');
    if (!grade || !String(grade).trim()) return bad(res, 'Grade is required.');
    if (!subjects || !String(subjects).trim()) return bad(res, 'Subjects are required.');
    const rate = Number(ratePerHour);
    if (!Number.isFinite(rate) || rate <= 0) return bad(res, 'Cost per hour must be a positive number.');
    const s = await Student.findByIdAndUpdate(
      req.params.id,
      { name: String(name).trim(), grade: String(grade).trim(), subjects: String(subjects).trim(), ratePerHour: rate },
      { new: true, runValidators: true }
    );
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    res.json(s);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const s = await Student.findByIdAndDelete(req.params.id);
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    await Session.deleteMany({ studentId: s._id });
    await Payment.deleteMany({ studentId: s._id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
