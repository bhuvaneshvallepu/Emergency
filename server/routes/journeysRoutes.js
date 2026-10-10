import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.post('/', (req, res) => {
  const { destination, expectedArrival, trustedContactId } = req.body || {};
  if (!destination || !expectedArrival) {
    return res.status(400).json({ message: 'Destination and expected arrival are required.' });
  }

  const journey = {
    id: `journey-${Date.now()}`,
    userId: req.user.id,
    destination,
    expectedArrival,
    nextCheckInAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    status: 'active',
    trustedContactId: trustedContactId || demoStore.contacts[0]?.id || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  demoStore.journeys.push(journey);
  return res.status(201).json({ journey });
});

router.get('/active', (req, res) => {
  const journeys = demoStore.journeys.filter((journey) => journey.userId === req.user.id && journey.status === 'active');
  return res.json({ journeys });
});

router.post('/:id/check-in', (req, res) => {
  const journey = demoStore.journeys.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!journey) return res.status(404).json({ message: 'Journey not found.' });

  journey.status = 'checked_in';
  journey.updatedAt = new Date().toISOString();
  return res.json({ journey });
});

router.post('/:id/complete', (req, res) => {
  const journey = demoStore.journeys.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!journey) return res.status(404).json({ message: 'Journey not found.' });

  journey.status = 'completed';
  journey.updatedAt = new Date().toISOString();
  return res.json({ journey });
});

router.post('/:id/cancel', (req, res) => {
  const journey = demoStore.journeys.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!journey) return res.status(404).json({ message: 'Journey not found.' });

  journey.status = 'cancelled';
  journey.updatedAt = new Date().toISOString();
  return res.json({ journey });
});

export default router;
