import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { demoStore } from '../data/store.js';
import IncidentEvent from '../models/IncidentEvent.js';
import NotificationEvent from '../models/NotificationEvent.js';
import { isDemoMode, isDatabaseReady } from '../config/persistence.js';
import { getSmsConfigurationError, getSmsConfigurationStatus, isValidE164, sendSms, SmsProviderError } from './smsProvider.js';

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

function assertPersistenceAvailable() {
  if (!isDemoMode() && !isDatabaseReady()) {
    throw new Error('MongoDB is unavailable; notification and timeline data were not saved.');
  }
}

export async function createIncidentTimelineEntry(incidentId, eventType, metadata = {}) {
  assertPersistenceAvailable();
  incidentId = String(incidentId);
  const timestamp = new Date();
  let entry;
  if (isDemoMode()) {
    entry = {
      id: `timeline-${randomUUID()}`,
      incidentId,
      eventType,
      timestamp: timestamp.toISOString(),
      sanitizedMetadata: metadata,
    };
    demoStore.timeline.push(entry);
  } else {
    const record = await IncidentEvent.create({
      incidentId,
      eventType,
      timestamp,
      sanitizedMetadata: metadata,
    });
    entry = {
      id: record.id,
      incidentId: String(record.incidentId),
      eventType: record.eventType,
      timestamp: record.timestamp.toISOString(),
      sanitizedMetadata: record.sanitizedMetadata,
    };
  }
  broadcastIncidentUpdate(incidentId, `timeline-${eventType}`, { entry });
  return entry;
}

export function getNotificationPersistenceMode() {
  if (isDatabaseReady()) return 'mongodb';
  if (isDemoMode()) return 'in-memory-demo';
  return 'unavailable';
}

function alertSnapshot(alert) {
  return {
    id: String(alert.id || alert._id),
    incidentId: String(alert.incidentId),
    contactId: String(alert.contactId),
    channel: alert.channel,
    provider: alert.provider,
    providerMessageId: alert.providerMessageId || null,
    status: alert.status,
    failureReason: alert.failureReason || null,
    failureCode: alert.failureCode || null,
    createdAt: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : alert.createdAt,
    updatedAt: alert.updatedAt instanceof Date ? alert.updatedAt.toISOString() : alert.updatedAt,
    sentAt: alert.sentAt instanceof Date ? alert.sentAt.toISOString() : alert.sentAt || null,
    deliveredAt: alert.deliveredAt instanceof Date ? alert.deliveredAt.toISOString() : alert.deliveredAt || null,
  };
}

async function saveAlert(alert) {
  assertPersistenceAvailable();
  if (isDemoMode()) return;

  await NotificationEvent.updateOne(
    { id: alert.id },
    {
      $set: {
        incidentId: alert.incidentId,
        userId: alert.userId,
        contactId: alert.contactId,
        recipient: alert.recipient,
        channel: alert.channel,
        provider: alert.provider,
        providerMessageId: alert.providerMessageId || undefined,
        status: alert.status,
        failureReason: alert.failureReason,
        failureCode: alert.failureCode,
        sentAt: alert.sentAt,
        deliveredAt: alert.deliveredAt,
        statusHistory: alert.statusHistory,
      },
      $setOnInsert: { createdAt: alert.createdAt },
    },
    { upsert: true, runValidators: true },
  );
}

function broadcastAlert(alert) {
  broadcastIncidentUpdate(String(alert.incidentId), 'alert-status', {
    alertId: alert.id,
    contactId: String(alert.contactId),
    status: alert.status,
    channel: alert.channel,
    provider: alert.provider,
    updatedAt: alert.updatedAt,
    failureReason: alert.failureReason,
  });
}

async function setAlertStatus(alert, status, {
  failureReason = null,
  failureCode = null,
  providerMessageId,
  sentAt,
  deliveredAt,
} = {}) {
  const now = new Date();
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
    await createIncidentTimelineEntry(alert.incidentId, `sms_${status}`, {
      alertId: alert.id,
      contactId: String(alert.contactId),
      status,
      ...(failureCode ? { failureCode } : {}),
    });
  }
  await saveAlert(alert);
  broadcastAlert(alert);
}

async function createAlert(incident, contact, status, failureReason = null, failureCode = null, provider = 'none') {
  assertPersistenceAvailable();
  const now = new Date();
  const alert = {
    id: `alert-${randomUUID()}`,
    incidentId: String(incident.id || incident._id),
    userId: String(incident.userId),
    contactId: String(contact.id || contact._id),
    recipient: contact.phone || '',
    channel: contact.notificationPreference || 'sms',
    provider,
    providerMessageId: null,
    status,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    deliveredAt: null,
    failureReason,
    failureCode,
    statusHistory: [{ status, timestamp: now, failureCode }],
  };

  if (isDemoMode()) {
    demoStore.alertEvents.push(alert);
    await createIncidentTimelineEntry(alert.incidentId, `sms_${status}`, {
      alertId: alert.id,
      contactId: alert.contactId,
      status,
      ...(failureCode ? { failureCode } : {}),
    });
  } else {
    await NotificationEvent.create(alert);
    await createIncidentTimelineEntry(alert.incidentId, `sms_${status}`, {
      alertId: alert.id,
      contactId: alert.contactId,
      status,
      ...(failureCode ? { failureCode } : {}),
    });
  }
  broadcastAlert(alert);
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

export async function createAlertWorkflow(incident, contact) {
  if (contact.smsConsent !== true) {
    return createAlert(incident, contact, 'skipped', 'Contact has not consented to emergency SMS alerts.');
  }
  if (contact.notificationPreference !== 'sms') {
    return createAlert(incident, contact, 'skipped', 'Contact notification preference is not SMS.');
  }
  if (!isValidE164(contact.phone)) {
    return createAlert(incident, contact, 'failed', 'Contact phone number is not in E.164 format.', 'INVALID_RECIPIENT');
  }
  if (!getSmsConfigurationStatus().smsEnabled) {
    return createAlert(incident, contact, 'disabled', 'SMS is turned off because SMS_ENABLED is not "true". Configure Twilio and recipient consent before enabling it.');
  }
  const configurationError = getSmsConfigurationError();
  if (configurationError) {
    return createAlert(
      incident,
      contact,
      'configuration_error',
      configurationError.message,
      configurationError.code,
      getSmsConfigurationStatus().providerConfigured ? 'twilio' : 'none',
    );
  }

  const alert = await createAlert(incident, contact, 'queued', null, null, 'twilio');
  void dispatchSmsAlert(alert, incident);
  return alert;
}

async function dispatchSmsAlert(alert, incident) {
  try {
    await setAlertStatus(alert, 'sending');
    const result = await sendSms({ to: alert.recipient, body: makeSmsBody(incident) });
    if (result.status === 'disabled') {
      await setAlertStatus(alert, 'disabled', {
        failureReason: 'SMS is turned off because SMS_ENABLED is not "true". Configure Twilio and recipient consent before enabling it.',
      });
      return;
    }

    const providerStatus = ({
      accepted: 'queued',
      queued: 'queued',
      sending: 'sending',
      sent: 'sent',
      delivered: 'sent',
      undelivered: 'undelivered',
      failed: 'failed',
      canceled: 'failed',
    })[result.status] || 'failed';
    const timestamp = new Date();
    await setAlertStatus(alert, providerStatus, {
      providerMessageId: result.sid,
      failureReason: providerStatus === 'failed' ? 'The SMS provider did not accept the message for delivery.' : null,
      sentAt: providerStatus === 'sent' ? timestamp : undefined,
    });
  } catch (error) {
    const configurationFailure = error instanceof SmsProviderError && error.code === 'SMS_CONFIGURATION_ERROR';
    const safeFailureReason = error instanceof SmsProviderError
      ? error.message
      : 'The SMS request or its status could not be recorded because of a database error.';
    const safeFailureCode = error instanceof SmsProviderError ? error.code : 'PERSISTENCE_ERROR';
    if (!configurationFailure) console.error('SMS notification processing failed:', safeFailureCode);
    try {
      await setAlertStatus(alert, configurationFailure ? 'configuration_error' : 'failed', {
        failureReason: safeFailureReason,
        failureCode: safeFailureCode,
      });
    } catch (persistenceError) {
      console.error('SMS notification status could not be persisted:', persistenceError.name || 'database_error');
    }
  }
}

export async function getIncidentAlerts(incidentId, userId) {
  assertPersistenceAvailable();
  if (isDemoMode()) {
    return demoStore.alertEvents
      .filter((alert) => alert.incidentId === incidentId)
      .map((alert) => ({ ...alertSnapshot(alert), statusHistory: alert.statusHistory }));
  }
  const alerts = await NotificationEvent.find({ incidentId, userId }).sort({ createdAt: 1 }).lean();
  return alerts.map((alert) => ({
    ...alertSnapshot(alert),
    statusHistory: (alert.statusHistory || []).map((entry) => ({
      status: entry.status,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
      failureCode: entry.failureCode || null,
    })),
  }));
}

export async function acknowledgeIncidentAlert(incidentId, userId, contactId) {
  assertPersistenceAvailable();
  const alert = isDemoMode()
    ? demoStore.alertEvents.find((event) => event.incidentId === incidentId
      && (!contactId || event.contactId === contactId))
    : await NotificationEvent.findOne({
      incidentId,
      userId,
      ...(contactId ? { contactId } : {}),
    });
  if (!alert) return null;
  alert.acknowledgedAt = new Date();
  await setAlertStatus(alert, 'acknowledged');
  return alert;
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
  assertPersistenceAvailable();

  let alert;
  if (isDemoMode()) {
    alert = demoStore.alertEvents.find((item) => item.providerMessageId === messageSid);
  } else {
    alert = await NotificationEvent.findOne({ providerMessageId: messageSid });
  }
  if (!alert) return { found: false, duplicate: false };

  const duplicate = alert.status === normalizedStatus && alert.failureCode === (errorCode || null);
  if (duplicate) return { found: true, duplicate: true, alert };
  const terminalStatuses = new Set(['delivered', 'undelivered', 'failed']);
  if (terminalStatuses.has(alert.status) && !terminalStatuses.has(normalizedStatus)) {
    return { found: true, duplicate: true, alert };
  }

  const failureCode = errorCode ? String(errorCode).slice(0, 40) : null;
  await setAlertStatus(alert, normalizedStatus, {
    failureCode,
    failureReason: normalizedStatus === 'undelivered' || normalizedStatus === 'failed'
      ? 'The SMS provider reported that delivery failed.'
      : null,
    sentAt: normalizedStatus === 'sent' ? new Date() : undefined,
    deliveredAt: normalizedStatus === 'delivered' ? new Date() : undefined,
  });
  return { found: true, duplicate: false, alert };
}
