import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, enum: ['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster', 'other'], required: true },
  description: { type: String, required: true, minlength: 5, maxlength: 2000 },
  source: { type: String, enum: ['manual_sos', 'user_report', 'configured_sensor_event'], required: true },
  idempotencyKey: { type: String },
  urgencyEstimate: { type: String, enum: ['critical', 'high', 'moderate', 'unknown'], default: 'unknown' },
  aiSummary: { type: String },
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    capturedAt: Date,
  },
  status: { type: String, enum: ['active', 'resolved', 'cancelled'], default: 'active' },
  recommendedActions: [{ type: String }],
  resolvedAt: Date,
}, { timestamps: true });

incidentSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
incidentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Incident || mongoose.model('Incident', incidentSchema);
