const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    datetimeISO: { type: Date, required: true },
    duration: { type: Number, required: true, min: 0.01, max: 24 },
    subject: { type: String, trim: true, maxlength: 120, default: '' },
    taught: { type: String, required: true, trim: true, maxlength: 2000 },
    homework: { type: String, trim: true, maxlength: 2000, default: '' },
    homeworkDone: { type: Boolean, default: false },
    costSnapshot: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

sessionSchema.index({ studentId: 1, datetimeISO: 1 });

module.exports = mongoose.model('Session', sessionSchema);
