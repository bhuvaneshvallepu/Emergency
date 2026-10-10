import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { classifyIncident } from '../services/aiService.js';
import { createAlertWorkflow, createIncidentTimelineEntry } from '../services/notificationService.js';

const router = express.Router();
const idempotencyKeys = new Map();

function validCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

router.use(authenticate);

router.post('/', async (req, res) => {
  const { description, category = 'other', latitude, longitude, source = 'manual_sos' } = req.body || {};
  const idempotencyKey = req.headers['x-idempotency-key'];

  if (!description || String(description).trim().length < 5) {
    return res.status(400).json({ message: 'An incident description is required.' });
  }

  if (latitude !== undefined && longitude !== undefined && !validCoordinates(latitude, longitude)) {
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
      latitude: validCoordinates(latitude, longitude) ? Number(latitude) : 0,
      longitude: validCoordinates(latitude, longitude) ? Number(longitude) : 0,
      capturedAt: new Date().toISOString(),
    },
    status: 'active',
    recommendedActions: ['Contact emergency services if immediate intervention is needed', 'Share your location with a trusted contact', 'Keep yourself in a safe place if possible'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
  };

  idempotencyKeys.set(idempotencyKey || incident.id, incident);
  demoStore.incidents.unshift(incident);
  createIncidentTimelineEntry(incident.id, 'sos_created', { source, category });

  const primaryContact = demoStore.contacts.find((contact) => contact.userId === req.user.id && contact.priority === 1) || demoStore.contacts.find((contact) => contact.userId === req.user.id);
  if (primaryContact) {
    const alert = createAlertWorkflow(incident, primaryContact);
    createIncidentTimelineEntry(incident.id, 'alert_sent', { contactId: primaryContact.id, status: alert.status });
  }

  const classificationPromise = classifyIncident(incident.description, { category, latitude: incident.location.latitude, longitude: incident.location.longitude })
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
      return classification;
    })
    .catch(() => null);

  const classification = await classificationPromise;
  return res.status(201).json({ incident, classification, duplicate: false });
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

router.post('/:id/alerts', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  const contacts = demoStore.contacts.filter((contact) => contact.userId === req.user.id);
  const alerts = contacts.map((contact) => createAlertWorkflow(incident, contact));
  return res.json({ alerts });
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
  return res.json({ alert, message: 'Alert acknowledged.' });
});

router.post('/:id/resolve', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'resolved';
  incident.resolvedAt = new Date().toISOString();
  incident.updatedAt = new Date().toISOString();
  createIncidentTimelineEntry(incident.id, 'resolved', { status: 'resolved' });
  return res.json({ incident });
});

router.post('/:id/cancel', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'cancelled';
  incident.updatedAt = new Date().toISOString();
  createIncidentTimelineEntry(incident.id, 'cancelled', { status: 'cancelled' });
  return res.json({ incident });
});

router.get('/:id/timeline', (req, res) => {
  const timeline = demoStore.timeline.filter((event) => event.incidentId === req.params.id);
  return res.json({ timeline });
});

export default router;
