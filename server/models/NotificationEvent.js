import mongoose from 'mongoose';

const notificationEventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  incidentId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  contactId: { type: String, required: true },
  recipient: { type: String, required: true },
  channel: { type: String, required: true, default: 'sms' },
  provider: { type: String, required: true, default: 'none' },
  providerMessageId: { type: String, default: undefined, unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
  status: { type: String, required: true, index: true },
  failureReason: { type: String, default: null },
  failureCode: { type: String, default: null },
  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  statusHistory: [{
    status: { type: String, required: true },
    timestamp: { type: Date, required: true },
    failureCode: { type: String, default: null },
  }],
}, { timestamps: true });

notificationEventSchema.index({ incidentId: 1, contactId: 1, channel: 1 });

export default mongoose.models.NotificationEvent || mongoose.model('NotificationEvent', notificationEventSchema);
