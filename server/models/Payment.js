const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    dateISO: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0.01, max: 1000000 },
    note: { type: String, trim: true, maxlength: 500, default: '' }
  },
  { timestamps: true }
);

paymentSchema.index({ studentId: 1, dateISO: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
