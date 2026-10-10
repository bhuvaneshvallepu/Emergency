import express from 'express';
import SafetyJourney from '../models/SafetyJourney.js';
import TrustedContact from '../models/TrustedContact.js';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { isDemoMode, handlePersistenceError, isObjectId } from '../config/persistence.js';

const router = express.Router();
router.use(authenticate);

function serializeJourney(journey) {
  if (isDemoMode()) return journey;
  return typeof journey.toJSON === 'function'
    ? journey.toJSON()
    : { ...journey, id: String(journey._id), userId: String(journey.userId) };
}

async function findOwnedJourney(id, userId) {
  if (isDemoMode()) {
    return demoStore.journeys.find((journey) => journey.id === id && journey.userId === userId) || null;
  }
  return isObjectId(id) ? SafetyJourney.findOne({ _id: id, userId }) : null;
}

router.post('/', async (req, res) => {
  const { destination, expectedArrival, trustedContactId } = req.body || {};
  const arrival = new Date(expectedArrival);
  if (typeof destination !== 'string' || !destination.trim() || !expectedArrival || Number.isNaN(arrival.getTime())) {
    return res.status(400).json({ message: 'A destination and valid expected arrival time are required.' });
  }

  try {
    let contactId = trustedContactId || null;
    if (contactId) {
      const contact = isDemoMode()
        ? demoStore.contacts.find((item) => item.id === contactId && item.userId === req.user.id)
        : isObjectId(contactId)
          ? await TrustedContact.findOne({ _id: contactId, userId: req.user.id }).select('_id')
          : null;
      if (!contact) return res.status(400).json({ message: 'Trusted contact not found for this account.' });
    } else if (isDemoMode()) {
      contactId = demoStore.contacts.find((item) => item.userId === req.user.id)?.id || null;
    }

    const journeyData = {
      userId: req.user.id,
      destination: destination.trim(),
      expectedArrival: arrival,
      nextCheckInAt: new Date(Date.now() + 30 * 60 * 1000),
      status: 'active',
      trustedContactId: contactId,
    };
    if (isDemoMode()) {
      const journey = {
        id: `journey-${Date.now()}`,
        ...journeyData,
        expectedArrival: arrival.toISOString(),
        nextCheckInAt: journeyData.nextCheckInAt.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoStore.journeys.push(journey);
      return res.status(201).json({ journey });
    }
    const journey = await SafetyJourney.create(journeyData);
    return res.status(201).json({ journey: serializeJourney(journey) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Journey creation');
  }
});

router.get('/active', async (req, res) => {
  try {
    const journeys = isDemoMode()
      ? demoStore.journeys.filter((journey) => journey.userId === req.user.id && journey.status === 'active')
      : await SafetyJourney.find({ userId: req.user.id, status: 'active' }).sort({ createdAt: -1 });
    return res.json({ journeys: journeys.map(serializeJourney) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Journey lookup');
  }
});

async function updateJourney(req, res, status) {
  try {
    const journey = await findOwnedJourney(req.params.id, req.user.id);
    if (!journey) return res.status(404).json({ message: 'Journey not found.' });
    journey.status = status;
    journey.updatedAt = new Date();
    if (!isDemoMode()) await journey.save();
    return res.json({ journey: serializeJourney(journey) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Journey update');
  }
}

router.post('/:id/check-in', (req, res) => updateJourney(req, res, 'checked_in'));
router.post('/:id/complete', (req, res) => updateJourney(req, res, 'completed'));
router.post('/:id/cancel', (req, res) => updateJourney(req, res, 'cancelled'));

export default router;
