import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { demoStore } from '../data/store.js';
import NotificationEvent from '../models/NotificationEvent.js';
import { isSmsEnabled, isValidE164, sendSms } from './smsProvider.js';

let socketServer = null;
const persistenceQueues = new WeakMap();

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

export function createIncidentTimelineEntry(incidentId, eventType, metadata = {}) {
  const entry = {
    id: `timeline-${randomUUID()}`,
    incidentId,
    eventType,
    timestamp: new Date().toISOString(),
    sanitizedMetadata: metadata,
  };

  demoStore.timeline.push(entry);
  broadcastIncidentUpdate(incidentId, `timeline-${eventType}`, { entry });
  return entry;
}

function persistenceAvailable() {
  return mongoose.connection.readyState === 1;
}

export function getNotificationPersistenceMode() {
  return persistenceAvailable() ? 'mongodb' : 'in-memory-demo';
}

function alertSnapshot(alert) {
  return {
    id: alert.id,
    incidentId: alert.incidentId,
    contactId: alert.contactId,
    channel: alert.channel,
    provider: alert.provider,
    providerMessageId: alert.providerMessageId,
    status: alert.status,
    failureReason: alert.failureReason,
    failureCode: alert.failureCode,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    sentAt: alert.sentAt,
    deliveredAt: alert.deliveredAt,
  };
}

function broadcastAlert(alert) {
  broadcastIncidentUpdate(alert.incidentId, 'alert-status', {
    alertId: alert.id,
    contactId: alert.contactId,
    status: alert.status,
    channel: alert.channel,
    provider: alert.provider,
    updatedAt: alert.updatedAt,
    failureReason: alert.failureReason,
  });
}

async function writeAlert(alert) {
  if (!persistenceAvailable()) return false;
  try {
    const record = await NotificationEvent.findOne({ id: alert.id });
    const values = {
      ...alertSnapshot(alert),
      userId: alert.userId,
      recipient: alert.recipient,
      providerMessageId: alert.providerMessageId || undefined,
      failureCode: alert.failureCode,
      statusHistory: alert.statusHistory,
    };
    if (record) {
      Object.assign(record, values);
      await record.save();
    } else {
      await NotificationEvent.create(values);
    }
    return true;
  } catch (error) {
    console.error('SMS notification persistence failed:', error.name || 'database_error');
    return false;
  }
}

function persistAlert(alert) {
  const previous = persistenceQueues.get(alert) || Promise.resolve();
  const next = previous.catch(() => false).then(() => writeAlert(alert));
  persistenceQueues.set(alert, next);
  return next;
}

function setAlertStatus(alert, status, { failureReason = null, failureCode = null, providerMessageId, sentAt, deliveredAt } = {}) {
  const now = new Date().toISOString();
  alert.status = status;
  alert.updatedAt = now;
  alert.failureReason = failureReason;
  alert.failureCode = failureCode;
  if (providerMessageId) alert.providerMessageId = providerMessageId;
  if (sentAt) alert.sentAt = sentAt;
  if (deliveredAt) alert.deliveredAt = deliveredAt;
  const previousStatus = alert.statusHistory.at(-1);
  if (previousStatus?.status !== status || previousStatus?.failureCode !== failureCode) {
    alert.statusHistory.push({ status, timestamp: now, failureCode });
    createIncidentTimelineEntry(alert.incidentId, `sms_${status}`, {
      alertId: alert.id,
      contactId: alert.contactId,
      status,
      ...(failureCode ? { failureCode } : {}),
    });
  }
  broadcastAlert(alert);
  void persistAlert(alert);
}

function createAlert(incident, contact, status, failureReason = null, failureCode = null) {
  const now = new Date().toISOString();
  const alert = {
    id: `alert-${randomUUID()}`,
    incidentId: incident.id,
    userId: incident.userId,
    contactId: contact.id,
    recipient: contact.phone || '',
    channel: contact.notificationPreference || 'sms',
    provider: status === 'queued' ? 'twilio' : 'none',
    providerMessageId: null,
    status,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    deliveredAt: null,
    failureReason,
    failureCode,
    statusHistory: [],
  };
  demoStore.alertEvents.push(alert);
  setAlertStatus(alert, status, { failureReason, failureCode });
  return alert;
}

function makeSmsBody(incident) {
  const location = incident.location;
  const coordinates = Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)
    ? ` Location: https://maps.google.com/?q=${Number(location.latitude)},${Number(location.longitude)}.`
    : '';
  const description = String(incident.description || 'Emergency assistance requested.').replace(/\s+/g, ' ').slice(0, 500);
  return `SafeSphere emergency alert: A trusted contact has requested help. Situation: ${description}.${coordinates} Please contact them and local emergency services if needed. This message does not confirm that emergency services were dispatched.`;
}

export function createAlertWorkflow(incident, contact) {
  if (!contact.smsConsent) return createAlert(incident, contact, 'skipped', 'Contact has not consented to emergency SMS alerts.');
  if (contact.notificationPreference !== 'sms') return createAlert(incident, contact, 'skipped', 'Contact notification preference is not SMS.');
  if (!isValidE164(contact.phone)) return createAlert(incident, contact, 'failed', 'Contact phone number is not in E.164 format.', 'INVALID_RECIPIENT');
  if (!isSmsEnabled()) return createAlert(incident, contact, 'disabled', 'SMS delivery is disabled or not configured.');

  const alert = createAlert(incident, contact, 'queued');
  void dispatchSmsAlert(alert, incident);
  return alert;
}

async function dispatchSmsAlert(alert, incident) {
  const persisted = await persistAlert(alert);
  if (persistenceAvailable() && !persisted) {
    setAlertStatus(alert, 'failed', {
      failureReason: 'SMS was not sent because the notification could not be persisted.',
      failureCode: 'PERSISTENCE_ERROR',
    });
    return;
  }
  setAlertStatus(alert, 'sending');
  const sendingPersisted = await persistAlert(alert);
  if (persistenceAvailable() && !sendingPersisted) {
    setAlertStatus(alert, 'failed', {
      failureReason: 'SMS was not sent because the notification status could not be persisted.',
      failureCode: 'PERSISTENCE_ERROR',
    });
    return;
  }
  try {
    const result = await sendSms({ to: alert.recipient, body: makeSmsBody(incident) });
    if (result.status === 'disabled') {
      setAlertStatus(alert, 'disabled', { failureReason: 'SMS delivery is disabled or not configured.' });
      return;
    }
    const providerStatus = ({
      accepted: 'queued',
      queued: 'queued',
      sending: 'sending',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'undelivered',
      failed: 'failed',
      canceled: 'failed',
    })[result.status] || 'failed';
    const timestamp = new Date().toISOString();
    setAlertStatus(alert, providerStatus, {
      providerMessageId: result.sid,
      failureReason: providerStatus === 'failed' ? 'The SMS provider did not accept the message for delivery.' : null,
      sentAt: providerStatus === 'sent' || providerStatus === 'delivered' ? timestamp : undefined,
      deliveredAt: providerStatus === 'delivered' ? timestamp : undefined,
    });
  } catch (error) {
    setAlertStatus(alert, 'failed', {
      failureReason: error.message || 'SMS provider request failed.',
      failureCode: error.code || 'SMS_PROVIDER_ERROR',
    });
  }
}

export async function getIncidentAlerts(incidentId, userId) {
  const inMemoryAlerts = demoStore.alertEvents.filter((alert) => alert.incidentId === incidentId);
  if (!persistenceAvailable()) {
    return inMemoryAlerts.map((alert) => ({ ...alertSnapshot(alert), statusHistory: alert.statusHistory }));
  }

  try {
    const storedAlerts = await NotificationEvent.find({ incidentId, userId }).lean();
    const alertsById = new Map(inMemoryAlerts.map((alert) => [alert.id, alert]));
    for (const record of storedAlerts) alertsById.set(record.id, record);
    return [...alertsById.values()].map((alert) => ({
      ...alertSnapshot(alert),
      statusHistory: alert.statusHistory || [],
    }));
  } catch (error) {
    console.error('SMS notification lookup failed:', error.name || 'database_error');
    return inMemoryAlerts.map((alert) => ({ ...alertSnapshot(alert), statusHistory: alert.statusHistory }));
  }
}

export async function updateAlertFromTwilio({ messageSid, status, errorCode }) {
  const providerStatuses = {
    accepted: 'queued',
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    delivered: 'delivered',
    undelivered: 'undelivered',
    failed: 'failed',
    canceled: 'failed',
  };
  const normalizedStatus = providerStatuses[status];
  if (!messageSid || !normalizedStatus) return { found: false, duplicate: false };

  let alert = demoStore.alertEvents.find((item) => item.providerMessageId === messageSid);
  let record = null;
  if (persistenceAvailable()) {
    record = await NotificationEvent.findOne({ providerMessageId: messageSid });
    if (record) {
      alert ||= {
        id: record.id,
        incidentId: record.incidentId,
        userId: record.userId,
        contactId: record.contactId,
        recipient: record.recipient,
        channel: record.channel,
        provider: record.provider,
        providerMessageId: record.providerMessageId,
        status: record.status,
        failureReason: record.failureReason,
        failureCode: record.failureCode,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        sentAt: record.sentAt?.toISOString() || null,
        deliveredAt: record.deliveredAt?.toISOString() || null,
        statusHistory: record.statusHistory.map((entry) => ({
          status: entry.status,
          timestamp: entry.timestamp.toISOString(),
          failureCode: entry.failureCode,
        })),
      };
      if (!demoStore.alertEvents.some((item) => item.id === alert.id)) demoStore.alertEvents.push(alert);
    }
  }

  if (!alert) return { found: false, duplicate: false };
  const duplicate = alert.status === normalizedStatus && alert.failureCode === (errorCode || null);
  if (duplicate) return { found: true, duplicate: true, alert };
  const terminalStatuses = new Set(['delivered', 'undelivered', 'failed']);
  if (terminalStatuses.has(alert.status) && !terminalStatuses.has(normalizedStatus)) {
    return { found: true, duplicate: true, alert };
  }

  const failureCode = errorCode ? String(errorCode).slice(0, 40) : null;
  setAlertStatus(alert, normalizedStatus, {
    failureCode,
    failureReason: normalizedStatus === 'undelivered' || normalizedStatus === 'failed'
      ? 'The SMS provider reported that delivery failed.'
      : null,
    sentAt: normalizedStatus === 'sent' ? new Date().toISOString() : undefined,
    deliveredAt: normalizedStatus === 'delivered' ? new Date().toISOString() : undefined,
  });
  if (record) {
    record.statusHistory = alert.statusHistory;
    await record.save();
  }
  return { found: true, duplicate: false, alert };
}
