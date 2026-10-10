import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { chatWithCopilot, generateBrief } from '../services/aiService.js';

const router = express.Router();
router.use(authenticate);

router.post('/chat', async (req, res) => {
  const { message, incidentId } = req.body || {};
  if (!message) {
    return res.status(400).json({ message: 'A message is required.' });
  }

  const incident = demoStore.incidents.find((item) => item.id === incidentId && item.userId === req.user.id) || demoStore.incidents[0];
  const result = await chatWithCopilot(message, { incidentCategory: incident?.category, description: incident?.description });
  return res.json({ response: result.answer });
});

router.post('/summary', async (req, res) => {
  const { incidentId } = req.body || {};
  const incident = demoStore.incidents.find((item) => item.id === incidentId && item.userId === req.user.id) || demoStore.incidents[0];

  if (!incident) {
    return res.status(404).json({ message: 'Incident not found.' });
  }

  const summary = await generateBrief(incident);
  return res.json({ summary });
});

export default router;
