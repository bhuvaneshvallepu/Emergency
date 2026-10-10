import mongoose from 'mongoose';

const trustedContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  priority: { type: Number, default: 1 },
  verified: { type: Boolean, default: false },
  notificationPreference: { type: String, default: 'sms' },
}, { timestamps: true });

export default mongoose.models.TrustedContact || mongoose.model('TrustedContact', trustedContactSchema);
