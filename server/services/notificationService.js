import { demoStore } from '../data/store.js';

let socketServer = null;

export function setSocketServer(server) {
  socketServer = server;
}

function roomName(incidentId) {
  return `incident-${incidentId}`;
}

export function broadcastIncidentUpdate(incidentId, eventType, payload = {}) {
  if (!socketServer || !incidentId) return;

  socketServer.to(roomName(incidentId)).emit('incident-update', {
    incidentId,
    eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

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
  broadcastIncidentUpdate(incident.id, 'alert-queued', { alertId: alert.id, contactId: contact.id, status: alert.status });

  setTimeout(() => {
    alert.status = 'sent';
    alert.sentAt = new Date().toISOString();
    broadcastIncidentUpdate(incident.id, 'alert-sent', { alertId: alert.id, contactId: alert.contactId, status: alert.status });
  }, 1200);

  setTimeout(() => {
    alert.status = 'delivered';
    alert.deliveredAt = new Date().toISOString();
    broadcastIncidentUpdate(incident.id, 'alert-delivered', { alertId: alert.id, contactId: alert.contactId, status: alert.status });
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
  broadcastIncidentUpdate(incidentId, `timeline-${eventType}`, { entry });
  return entry;
}
