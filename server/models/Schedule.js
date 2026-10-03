const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    start: { type: String, required: true, trim: true },
    end: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

function toMinutes(t) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

scheduleSchema.pre('validate', function (next) {
  const s = toMinutes(this.start);
  const e = toMinutes(this.end);
  if (s == null || e == null) return next(new Error('Start/End must be HH:MM (24h).'));
  if (e <= s) return next(new Error('End time must be after start time.'));
  next();
});

scheduleSchema.index({ studentId: 1, dayOfWeek: 1, start: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
