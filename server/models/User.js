import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String },
  preferredLanguage: { type: String, default: 'en' },
  trustedContactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TrustedContact' }],
  medicalNotes: { type: String },
  consent: {
    locationSharing: { type: Boolean, default: false },
    medicalSharing: { type: Boolean, default: false },
  },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', userSchema);
