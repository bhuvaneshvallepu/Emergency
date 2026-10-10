import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, enum: ['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster', 'other'], required: true },
  description: { type: String, required: true },
  source: { type: String, enum: ['manual_sos', 'user_report', 'configured_sensor_event'], required: true },
  urgencyEstimate: { type: String, enum: ['critical', 'high', 'moderate', 'unknown'], default: 'unknown' },
  aiSummary: { type: String },
  location: {
    latitude: Number,
    longitude: Number,
    capturedAt: Date,
  },
  status: { type: String, enum: ['active', 'resolved', 'cancelled'], default: 'active' },
  recommendedActions: [{ type: String }],
  resolvedAt: Date,
}, { timestamps: true });

export default mongoose.models.Incident || mongoose.model('Incident', incidentSchema);
