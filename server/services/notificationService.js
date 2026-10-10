import { demoStore } from '../data/store.js';

export function createAlertWorkflow(incident, contact) {
  const alert = {
    id: `alert-${Date.now()}`,
    incidentId: incident.id,
    contactId: contact.id,
    channel: contact.notificationPreference || 'sms',
    status: 'queued',
    providerMessageId: `demo-${Math.random().toString(36).slice(2, 8)}`,
    sentAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    failureReason: null,
    escalationLevel: 1,
    createdAt: new Date().toISOString(),
  };

  demoStore.alertEvents.push(alert);

  setTimeout(() => {
    alert.status = 'sent';
    alert.sentAt = new Date().toISOString();
  }, 1200);

  setTimeout(() => {
    alert.status = 'delivered';
    alert.deliveredAt = new Date().toISOString();
  }, 2400);

  return alert;
}

export function createIncidentTimelineEntry(incidentId, eventType, metadata = {}) {
  const entry = {
    id: `timeline-${Date.now()}`,
    incidentId,
    eventType,
    timestamp: new Date().toISOString(),
    sanitizedMetadata: metadata,
  };

  demoStore.timeline.push(entry);
  return entry;
}
