import mongoose from 'mongoose';

const alertEventSchema = new mongoose.Schema({
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrustedContact', required: true },
  channel: { type: String, enum: ['sms', 'email', 'push'], required: true },
  status: { type: String, enum: ['queued', 'sent', 'delivered', 'acknowledged', 'failed'], default: 'queued' },
  providerMessageId: { type: String },
  sentAt: Date,
  deliveredAt: Date,
  acknowledgedAt: Date,
  failureReason: { type: String },
  escalationLevel: { type: Number, default: 1 },
}, { timestamps: true });

export default mongoose.models.AlertEvent || mongoose.model('AlertEvent', alertEventSchema);
