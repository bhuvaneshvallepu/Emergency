import express from 'express';
import { randomUUID } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import Incident from '../models/Incident.js';
import IncidentEvent from '../models/IncidentEvent.js';
import TrustedContact from '../models/TrustedContact.js';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { isDemoMode, handlePersistenceError, isObjectId } from '../config/persistence.js';
import { classifyIncident } from '../services/aiService.js';
import {
  acknowledgeIncidentAlert,
  broadcastIncidentUpdate,
  createAlertWorkflow,
  createIncidentTimelineEntry,
  getIncidentAlerts,
  getNotificationPersistenceMode,
} from '../services/notificationService.js';

const router = express.Router();
const idempotencyKeys = new Map();
const sosRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const alertRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const categories = ['medical', 'personal_safety', 'accident', 'fire', 'natural_disaster', 'other'];
const sources = ['manual_sos', 'user_report', 'configured_sensor_event'];

function validCoordinates(latitude, longitude) {
  if (latitude === null || longitude === null
    || (typeof latitude === 'string' && !latitude.trim())
    || (typeof longitude === 'string' && !longitude.trim())) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function serializeIncident(incident) {
  if (isDemoMode()) return incident;
  const value = incident.toObject({ virtuals: true });
  return {
    ...value,
    id: String(incident._id),
    userId: String(incident.userId),
    location: {
      latitude: incident.location?.latitude ?? null,
      longitude: incident.location?.longitude ?? null,
      capturedAt: incident.location?.capturedAt ?? null,
    },
  };
}

async function findOwnedIncident(id, userId) {
  if (isDemoMode()) {
    return demoStore.incidents.find((incident) => incident.id === id && incident.userId === userId) || null;
  }
  if (!isObjectId(id)) return null;
  return Incident.findOne({ _id: id, userId });
}

function notificationResponse(alert) {
  return {
    id: alert.id,
    contactId: String(alert.contactId),
    channel: alert.channel,
    status: alert.status,
    provider: alert.provider,
    failureReason: alert.failureReason,
    failureCode: alert.failureCode,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    sentAt: alert.sentAt,
    deliveredAt: alert.deliveredAt,
  };
}

router.use(authenticate);

router.post('/', sosRateLimit, async (req, res) => {
  const { description, category = 'other', latitude, longitude, source = 'manual_sos' } = req.body || {};
  const requestKey = req.headers['x-idempotency-key'];
  if (requestKey && (typeof requestKey !== 'string' || requestKey.length > 200)) {
    return res.status(400).json({ message: 'Idempotency key must be at most 200 characters.' });
  }
  if (!description || String(description).trim().length < 5) {
    return res.status(400).json({ message: 'An incident description is required.' });
  }
  if (!categories.includes(category) || !sources.includes(source)) {
    return res.status(400).json({ message: 'Incident category or source is invalid.' });
  }
  if ((latitude !== undefined) !== (longitude !== undefined)
    || (latitude !== undefined && !validCoordinates(latitude, longitude))) {
    return res.status(400).json({ message: 'Latitude and longitude must be valid geographic coordinates.' });
  }

  const idempotencyKey = requestKey ? `${req.user.id}:${requestKey}` : null;
  try {
    if (idempotencyKey && isDemoMode() && idempotencyKeys.has(idempotencyKey)) {
      return res.status(200).json({ incident: idempotencyKeys.get(idempotencyKey), classification: null, duplicate: true });
    }
    if (requestKey && !isDemoMode()) {
      const duplicate = await Incident.findOne({ userId: req.user.id, idempotencyKey: requestKey });
      if (duplicate) return res.status(200).json({ incident: serializeIncident(duplicate), classification: null, duplicate: true });
    }

    const now = new Date();
    const incidentData = {
      userId: req.user.id,
      category,
      description: String(description).trim(),
      source,
      urgencyEstimate: 'unknown',
      aiSummary: 'Manual SOS created and notification workflow started without waiting for AI classification.',
      location: {
        latitude: latitude === undefined ? null : Number(latitude),
        longitude: longitude === undefined ? null : Number(longitude),
        capturedAt: latitude === undefined ? null : now,
      },
      status: 'active',
      recommendedActions: [
        'Contact emergency services if immediate intervention is needed',
        'Share your location with a trusted contact',
        'Keep yourself in a safe place if possible',
      ],
      ...(requestKey && !isDemoMode() ? { idempotencyKey: requestKey } : {}),
    };
    const incident = isDemoMode()
      ? {
        id: `incident-${randomUUID()}`,
        ...incidentData,
        userId: req.user.id,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        resolvedAt: null,
      }
      : await Incident.create(incidentData);
    const incidentId = String(incident.id || incident._id);

    if (idempotencyKey && isDemoMode()) {
      idempotencyKeys.set(idempotencyKey, incident);
      if (idempotencyKeys.size > 10000) idempotencyKeys.delete(idempotencyKeys.keys().next().value);
    }
    if (isDemoMode()) demoStore.incidents.unshift(incident);

    const responseIncident = serializeIncident(incident);
    broadcastIncidentUpdate(incidentId, 'incident-created', { incident: responseIncident });
    try {
      await createIncidentTimelineEntry(incidentId, 'sos_created', { source, category });
    } catch (error) {
      console.error('SOS timeline persistence failed:', error.name || 'database_error');
    }

    let contacts;
    try {
      contacts = isDemoMode()
        ? demoStore.contacts
          .filter((contact) => contact.userId === req.user.id)
          .sort((left, right) => (left.priority || 99) - (right.priority || 99))
        : await TrustedContact.find({ userId: req.user.id }).sort({ priority: 1 }).lean();
    } catch (error) {
      return res.status(201).json({
        incident: responseIncident,
        classification: null,
        notifications: [],
        notificationError: 'The incident was saved, but trusted contacts could not be loaded. Review the incident and retry notifications.',
        duplicate: false,
        persistence: getNotificationPersistenceMode(),
      });
    }

    const notificationResults = await Promise.all(contacts.map(async (contact) => {
      try {
        const alert = await createAlertWorkflow(incident, contact);
        return notificationResponse(alert);
      } catch (error) {
        console.error('SOS notification could not be recorded:', error.name || 'database_error');
        return {
          id: `unrecorded-${randomUUID()}`,
          contactId: String(contact.id || contact._id),
          channel: contact.notificationPreference || 'sms',
          status: 'failed',
          provider: 'none',
          failureReason: 'Notification could not be recorded; no delivery is confirmed.',
          failureCode: 'PERSISTENCE_ERROR',
          createdAt: new Date(),
        };
      }
    }));

    void classifyIncident(incidentData.description, {
      category,
      latitude: incidentData.location.latitude,
      longitude: incidentData.location.longitude,
    })
      .then(async (classification) => {
        if (isDemoMode()) {
          incident.category = classification.category || incident.category;
          incident.aiSummary = classification.summary;
          incident.urgencyEstimate = classification.urgency;
          incident.recommendedActions = classification.recommendedActions || incident.recommendedActions;
          incident.updatedAt = new Date().toISOString();
        } else {
          incident.category = classification.category || incident.category;
          incident.aiSummary = classification.summary;
          incident.urgencyEstimate = classification.urgency;
          incident.recommendedActions = classification.recommendedActions || incident.recommendedActions;
          await incident.save();
        }
        await createIncidentTimelineEntry(incidentId, 'classified', {
          category: incident.category,
          urgency: incident.urgencyEstimate,
          requiresHumanConfirmation: classification.requiresHumanConfirmation,
        });
        broadcastIncidentUpdate(incidentId, 'incident-classified', {
          incident: serializeIncident(incident),
          classification,
        });
      })
      .catch(async (error) => {
        try {
          await createIncidentTimelineEntry(incidentId, 'classification_failed', { reason: 'AI classification unavailable.' });
        } catch (timelineError) {
          console.error('Classification failure timeline could not be saved:', timelineError.name || 'database_error');
        }
        console.error('Incident classification failed:', error.name || 'classification_error');
      });

    return res.status(201).json({
      incident: responseIncident,
      classification: null,
      notifications: notificationResults,
      duplicate: false,
      persistence: getNotificationPersistenceMode(),
    });
  } catch (error) {
    if (error?.code === 11000 && requestKey && !isDemoMode()) {
      const duplicate = await Incident.findOne({ userId: req.user.id, idempotencyKey: requestKey });
      if (duplicate) return res.status(200).json({ incident: serializeIncident(duplicate), classification: null, duplicate: true });
    }
    return handlePersistenceError(res, error, 'SOS creation');
  }
});

router.get('/', async (req, res) => {
  try {
    const incidents = isDemoMode()
      ? demoStore.incidents.filter((incident) => incident.userId === req.user.id)
      : await Incident.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ incidents: isDemoMode() ? incidents : incidents.map(serializeIncident) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident lookup');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    return res.json({ incident: serializeIncident(incident) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident lookup');
  }
});

router.post('/:id/classify', async (req, res) => {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    const classification = await classifyIncident(incident.description, incident.location);
    incident.aiSummary = classification.summary;
    incident.urgencyEstimate = classification.urgency;
    incident.recommendedActions = classification.recommendedActions;
    incident.updatedAt = new Date();
    if (!isDemoMode()) await incident.save();
    return res.json({ classification });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident classification');
  }
});

router.post('/:id/alerts', alertRateLimit, async (req, res) => {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    const incidentId = String(incident.id || incident._id);
    const contacts = isDemoMode()
      ? demoStore.contacts.filter((contact) => contact.userId === req.user.id)
      : await TrustedContact.find({ userId: req.user.id });
    const existing = await getIncidentAlerts(incidentId, req.user.id);
    const alerts = await Promise.all(contacts
      .filter((contact) => !existing.some((alert) => alert.contactId === String(contact.id || contact._id)))
      .map((contact) => createAlertWorkflow(incident, contact)));
    return res.json({ alerts: [...existing, ...alerts.map(notificationResponse)] });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident notification');
  }
});

router.post('/:id/acknowledge', async (req, res) => {
  const { contactId } = req.body || {};
  if (contactId && !isDemoMode() && !isObjectId(contactId)) {
    return res.status(400).json({ message: 'Contact ID is invalid.' });
  }
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    const incidentId = String(incident.id || incident._id);
    const alert = await acknowledgeIncidentAlert(incidentId, req.user.id, contactId);
    if (!alert) return res.status(404).json({ message: 'No alert found for this incident.' });
    try {
      await createIncidentTimelineEntry(incidentId, 'acknowledged', { contactId: String(alert.contactId) });
    } catch (error) {
      console.error('Acknowledgement timeline persistence failed:', error.name || 'database_error');
    }
    broadcastIncidentUpdate(incidentId, 'alert-acknowledged', {
      alertId: alert.id,
      contactId: String(alert.contactId),
      status: alert.status,
    });
    return res.json({ alert: notificationResponse(alert), message: 'Alert acknowledged.' });
  } catch (error) {
    return handlePersistenceError(res, error, 'Alert acknowledgement');
  }
});

async function updateIncidentStatus(req, res, status) {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    incident.status = status;
    incident.updatedAt = new Date();
    if (status === 'resolved') incident.resolvedAt = new Date();
    if (!isDemoMode()) await incident.save();
    const incidentId = String(incident.id || incident._id);
    await createIncidentTimelineEntry(incidentId, status, { status });
    const serialized = serializeIncident(incident);
    broadcastIncidentUpdate(incidentId, `incident-${status}`, { incident: serialized });
    return res.json({ incident: serialized });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident status update');
  }
}

router.post('/:id/resolve', (req, res) => updateIncidentStatus(req, res, 'resolved'));
router.post('/:id/cancel', (req, res) => updateIncidentStatus(req, res, 'cancelled'));

router.get('/:id/timeline', async (req, res) => {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    const incidentId = String(incident.id || incident._id);
    const timeline = isDemoMode()
      ? demoStore.timeline.filter((event) => event.incidentId === incidentId)
      : await IncidentEvent.find({ incidentId }).sort({ timestamp: 1 }).lean();
    return res.json({
      timeline: isDemoMode()
        ? timeline
        : timeline.map((event) => ({
          id: String(event._id),
          incidentId: String(event.incidentId),
          eventType: event.eventType,
          timestamp: event.timestamp,
          sanitizedMetadata: event.sanitizedMetadata,
        })),
    });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident timeline lookup');
  }
});

router.get('/:id/alerts', async (req, res) => {
  try {
    const incident = await findOwnedIncident(req.params.id, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    return res.json({ alerts: await getIncidentAlerts(String(incident.id || incident._id), req.user.id) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident alert lookup');
  }
});

export default router;
