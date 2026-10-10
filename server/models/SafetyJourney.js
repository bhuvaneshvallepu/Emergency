import mongoose from 'mongoose';

const safetyJourneySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  destination: { type: String, required: true },
  expectedArrival: { type: Date, required: true },
  nextCheckInAt: { type: Date },
  status: { type: String, enum: ['active', 'checked_in', 'completed', 'cancelled'], default: 'active' },
  trustedContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrustedContact' },
}, { timestamps: true });

safetyJourneySchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.models.SafetyJourney || mongoose.model('SafetyJourney', safetyJourneySchema);
