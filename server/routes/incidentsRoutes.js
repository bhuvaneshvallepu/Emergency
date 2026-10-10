import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { classifyIncident } from '../services/aiService.js';
import { createAlertWorkflow, createIncidentTimelineEntry } from '../services/notificationService.js';

const router = express.Router();
router.use(authenticate);

router.post('/', async (req, res) => {
  const { description, category = 'other', latitude, longitude, source = 'user_report' } = req.body || {};

  if (!description) {
    return res.status(400).json({ message: 'Incident description is required.' });
  }

  const classification = await classifyIncident(description, { category, latitude, longitude });
  const incident = {
    id: `incident-${Date.now()}`,
    userId: req.user.id,
    category: classification.category || category,
    description,
    source,
    urgencyEstimate: classification.urgency,
    aiSummary: classification.summary,
    location: {
      latitude: latitude || 40.7128,
      longitude: longitude || -74.006,
      capturedAt: new Date().toISOString(),
    },
    status: 'active',
    recommendedActions: classification.recommendedActions || ['Call emergency services'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
  };

  demoStore.incidents.unshift(incident);
  demoStore.timeline.unshift({
    id: `timeline-${Date.now()}`,
    incidentId: incident.id,
    eventType: 'created',
    timestamp: new Date().toISOString(),
    sanitizedMetadata: { source },
  });

  const primaryContact = demoStore.contacts.find((contact) => contact.userId === req.user.id && contact.priority === 1) || demoStore.contacts.find((contact) => contact.userId === req.user.id);
  if (primaryContact) {
    const alert = createAlertWorkflow(incident, primaryContact);
    createIncidentTimelineEntry(incident.id, 'alert_sent', { contactId: primaryContact.id, status: alert.status });
  }

  return res.status(201).json({ incident, classification });
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
  return res.json({ alert, message: 'Alert acknowledged.' });
});

router.post('/:id/resolve', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'resolved';
  incident.resolvedAt = new Date().toISOString();
  incident.updatedAt = new Date().toISOString();
  return res.json({ incident });
});

router.post('/:id/cancel', (req, res) => {
  const incident = demoStore.incidents.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!incident) return res.status(404).json({ message: 'Incident not found.' });

  incident.status = 'cancelled';
  incident.updatedAt = new Date().toISOString();
  return res.json({ incident });
});

router.get('/:id/timeline', (req, res) => {
  const timeline = demoStore.timeline.filter((event) => event.incidentId === req.params.id);
  return res.json({ timeline });
});

export default router;
