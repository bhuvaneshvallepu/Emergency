import mongoose from 'mongoose';

const trustedContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 16,
    validate: {
      validator(value) {
        return this.notificationPreference !== 'sms' || /^\+[1-9]\d{7,14}$/.test(value);
      },
      message: 'SMS phone numbers must use E.164 format.',
    },
  },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  priority: { type: Number, default: 1, min: 1 },
  verified: { type: Boolean, default: false },
  smsConsent: { type: Boolean, default: false },
  notificationPreference: { type: String, enum: ['sms', 'email', 'push'], default: 'sms' },
}, { timestamps: true });

trustedContactSchema.index({ userId: 1, priority: 1 });

export default mongoose.models.TrustedContact || mongoose.model('TrustedContact', trustedContactSchema);
