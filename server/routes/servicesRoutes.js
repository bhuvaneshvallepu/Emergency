import express from 'express';
import { findNearbyServices } from '../services/placesService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/nearby', async (req, res) => {
  const { lat, lng, category = 'hospital' } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ message: 'latitude and longitude are required.' });
  }

  try {
    const results = await findNearbyServices({ lat: Number(lat), lng: Number(lng), category });
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch nearby services right now.' });
  }
});

router.get('/:id', (req, res) => {
  return res.json({
    id: req.params.id,
    name: 'Demo facility',
    category: 'hospital',
    latitude: 40.7128,
    longitude: -74.006,
    address: 'Demo address',
    phone: '+1-000-000-0000',
    demo: true,
  });
});

export default router;
