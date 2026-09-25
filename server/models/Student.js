const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    grade: { type: String, required: true, trim: true, maxlength: 60 },
    subjects: { type: String, required: true, trim: true, maxlength: 200 },
    ratePerHour: { type: Number, required: true, min: 0.01, max: 10000 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
