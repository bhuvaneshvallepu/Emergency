import mongoose from 'mongoose';

const incidentEventSchema = new mongoose.Schema({
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  eventType: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sanitizedMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
});

incidentEventSchema.index({ incidentId: 1, timestamp: 1 });

export default mongoose.models.IncidentEvent || mongoose.model('IncidentEvent', incidentEventSchema);
