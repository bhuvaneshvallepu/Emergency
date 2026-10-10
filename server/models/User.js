import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
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
