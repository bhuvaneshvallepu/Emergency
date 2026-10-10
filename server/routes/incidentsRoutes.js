import express from 'express';
import rateLimit from 'express-rate-limit';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { classifyIncident } from '../services/aiService.js';
import { broadcastIncidentUpdate, createAlertWorkflow, createIncidentTimelineEntry, getIncidentAlerts, getNotificationPersistenceMode } from '../services/notificationService.js';

const router = express.Router();
const idempotencyKeys = new Map();
const sosRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const alertRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

function validCoordinates(latitude, longitude) {
  if (latitude === null || longitude === null
    || (typeof latitude === 'string' && !latitude.trim())
    || (typeof longitude === 'string' && !longitude.trim())) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

router.use(authenticate);

router.post('/', sosRateLimit, (req, res) => {
  const { description, category = 'other', latitude, longitude, source = 'manual_sos' } = req.body || {};
  const requestKey = req.headers['x-idempotency-key'];
  const idempotencyKey = requestKey ? `${req.user.id}:${requestKey}` : null;

  if (!description || String(description).trim().length < 5) {
    return res.status(400).json({ message: 'An incident description is required.' });
  }

  if ((latitude !== undefined) !== (longitude !== undefined)
    || (latitude !== undefined && !validCoordinates(latitude, longitude))) {
    return res.status(400).json({ message: 'Latitude and longitude must be valid geographic coordinates.' });
  }

  if (idempotencyKey && idempotencyKeys.has(idempotencyKey)) {
    const duplicate = idempotencyKeys.get(idempotencyKey);
    return res.status(200).json({ incident: duplicate, classification: null, duplicate: true });
  }
  const incident = {
    id: `incident-${Date.now()}`,
    userId: req.user.id,
    category,
    description: description.trim(),
    source,
    urgencyEstimate: 'unknown',
    aiSummary: 'Manual SOS created and notification workflow started without waiting for AI classification.',
    location: {
      latitude: latitude === undefined ? null : Number(latitude),
      longitude: longitude === undefined ? null : Number(longitude),
      capturedAt: latitude === undefined ? null : new Date().toISOString(),
    },
    status: 'active',
    recommendedActions: ['Contact emergency services if immediate intervention is needed', 'Share your location with a trusted contact', 'Keep yourself in a safe place if possible'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
  };

  if (idempotencyKey) {
    idempotencyKeys.set(idempotencyKey, incident);
    if (idempotencyKeys.size > 10000) idempotencyKeys.delete(idempotencyKeys.keys().next().value);
  }
  demoStore.incidents.unshift(incident);
  createIncidentTimelineEntry(incident.id, 'sos_created', { source, category });
  broadcastIncidentUpdate(incident.id, 'incident-created', { incident });

  const contacts = demoStore.contacts
    .filter((contact) => contact.userId === req.user.id)
    .sort((left, right) => (left.priority || 99) - (right.priority || 99));
  const notifications = contacts.map((contact) => createAlertWorkflow(incident, contact));

  void classifyIncident(incident.description, { category, latitude: incident.location.latitude, longitude: incident.location.longitude })
    .then((classification) => {
      incident.category = classification.category || incident.category;
      incident.aiSummary = classification.summary;
      incident.urgencyEstimate = classification.urgency;
      incident.recommendedActions = classification.recommendedActions || incident.recommendedActions;
      incident.updatedAt = new Date().toISOString();
      createIncidentTimelineEntry(incident.id, 'classified', {
        category: incident.category,
        urgency: incident.urgencyEstimate,
        requiresHumanConfirmation: classification.requiresHumanConfirmation,
      });
      broadcastIncidentUpdate(incident.id, 'incident-classified', { incident, classification });
    })
    .catch((error) => {
      createIncidentTimelineEntry(incident.id, 'classification_failed', { reason: 'AI classification unavailable.' });
      console.error('Incident classification failed:', error.name || 'classification_error');
    });

  return res.status(201).json({
    incident,
    classification: null,
    notifications: notifications.map((alert) => ({
      id: alert.id,
      contactId: alert.contactId,
      channel: alert.channel,
      status: alert.status,
      provider: alert.provider,
      failureReason: alert.failureReason,
      createdAt: alert.createdAt,
    })),
    duplicate: false,
    persistence: getNotificationPersistenceMode(),
  });
});

router.get('/', (req, res) => {
  const incidents = demoStore.incidents.filter((incident) => incident.userId === req.user.id);
  return res.json({ incidents });
});

router.get('/:id', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });
  return res.json({ incident });
});

router.post('/:id/classify', async (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  const classification = await classifyIncident(incident.description, incident.location);
  incident.aiSummary = classification.summary;
  incident.urgencyEstimate = classification.urgency;
  incident.recommendedActions = classification.recommendedActions;
  incident.updatedAt = new Date().toISOString();
  return res.json({ classification });
});

router.post('/:id/alerts', alertRateLimit, async (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  const contacts = demoStore.contacts.filter((contact) => contact.userId === req.user.id);
  const existing = await getIncidentAlerts(incident.id, req.user.id);
  const alerts = contacts
    .filter((contact) => !existing.some((alert) => alert.contactId === contact.id))
    .map((contact) => createAlertWorkflow(incident, contact));
  return res.json({
    alerts: [...existing, ...alerts].map((alert) => ({
      id: alert.id,
      contactId: alert.contactId,
      channel: alert.channel,
      status: alert.status,
      provider: alert.provider,
      failureReason: alert.failureReason,
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt,
      sentAt: alert.sentAt,
      deliveredAt: alert.deliveredAt,
    })),
  });
});

router.post('/:id/acknowledge', (req, res) => {
  const { contactId } = req.body || {};
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  const alert = demoStore.alertEvents.find((event) => event.incidentId === incident.id && (contactId ? event.contactId === contactId : true));
  if (!alert) return res.status(404).json({ message: 'No alert found for this incident.' });

  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  createIncidentTimelineEntry(incident.id, 'acknowledged', { contactId: alert.contactId });
  broadcastIncidentUpdate(incident.id, 'alert-acknowledged', { alertId: alert.id, contactId: alert.contactId, status: alert.status });
  return res.json({ alert, message: 'Alert acknowledged.' });
});

router.post('/:id/resolve', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'resolved';
  incident.resolvedAt = new Date().toISOString();
  incident.updatedAt = new Date().toISOString();
  createIncidentTimelineEntry(incident.id, 'resolved', { status: 'resolved' });
  broadcastIncidentUpdate(incident.id, 'incident-resolved', { incident });
  return res.json({ incident });
});

router.post('/:id/cancel', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'cancelled';
  incident.updatedAt = new Date().toISOString();
  createIncidentTimelineEntry(incident.id, 'cancelled', { status: 'cancelled' });
  broadcastIncidentUpdate(incident.id, 'incident-cancelled', { incident });
  return res.json({ incident });
});

router.get('/:id/timeline', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });
  const timeline = demoStore.timeline.filter((event) => event.incidentId === req.params.id);
  return res.json({ timeline });
});

router.get('/:id/alerts', async (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });
  return res.json({ alerts: await getIncidentAlerts(incident.id, req.user.id) });
});

export default router;
