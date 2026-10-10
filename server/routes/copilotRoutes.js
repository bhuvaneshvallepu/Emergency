import express from 'express';
import Incident from '../models/Incident.js';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { isDemoMode, handlePersistenceError, isObjectId } from '../config/persistence.js';
import { chatWithCopilot, generateBrief } from '../services/aiService.js';

const router = express.Router();
router.use(authenticate);

async function findOwnedIncident(incidentId, userId) {
  if (isDemoMode()) {
    return demoStore.incidents.find((item) => item.id === incidentId && item.userId === userId) || null;
  }
  return isObjectId(incidentId) ? Incident.findOne({ _id: incidentId, userId }) : null;
}

router.post('/chat', async (req, res) => {
  const { message, incidentId } = req.body || {};
  if (!message) {
    return res.status(400).json({ message: 'A message is required.' });
  }

  try {
    const incident = incidentId ? await findOwnedIncident(incidentId, req.user.id) : null;
    if (incidentId && !incident) return res.status(404).json({ message: 'Incident not found.' });
    const result = await chatWithCopilot(message, incident
      ? { incidentCategory: incident.category, description: incident.description }
      : {});
    return res.json({ response: result.answer });
  } catch (error) {
    return handlePersistenceError(res, error, 'Copilot request');
  }
});

router.post('/summary', async (req, res) => {
  const { incidentId } = req.body || {};
  if (!incidentId) return res.status(400).json({ message: 'An incident ID is required.' });
  try {
    const incident = await findOwnedIncident(incidentId, req.user.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found.' });
    const summary = await generateBrief(incident);
    return res.json({ summary });
  } catch (error) {
    return handlePersistenceError(res, error, 'Incident summary');
  }
});

export default router;
