import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { classifyIncident } from '../services/aiService.js';
import { findNearbyServices } from '../services/placesService.js';

const demoHash = '$2b$10$GstmdhnSbFpLqcHPd6nX8.i0ZC/E4oQ97B5GCF0DVZYrjTBmvTsD6';

test('demo password hash matches the demo password', () => {
  assert.equal(bcrypt.compareSync('demo123', demoHash), true);
});

test('incident classification falls back to a medical category when symptoms are described', async () => {
  const result = await classifyIncident('A person has collapsed and is not responding.');
  assert.equal(result.category, 'medical');
  assert.equal(result.urgency, 'critical');
  assert.ok(Array.isArray(result.recommendedActions));
});

test('service lookup rejects invalid coordinates', async () => {
  await assert.rejects(() => findNearbyServices({ lat: 91, lng: 0, category: 'hospital' }), /Latitude and longitude/);
});

test('service lookup returns explicit demo status when no provider key is configured', async () => {
  const original = process.env.PLACES_API_KEY;
  delete process.env.PLACES_API_KEY;
  const result = await findNearbyServices({ lat: 12.97, lng: 77.59, category: 'hospital' });
  assert.equal(result.mode, 'demo');
  assert.match(result.label, /Demo data/i);
  assert.ok(Array.isArray(result.facilities));
  if (original) process.env.PLACES_API_KEY = original;
});

test('demo reference data stays anchored to KPHB Hyderabad service names', async () => {
  const original = process.env.PLACES_API_KEY;
  delete process.env.PLACES_API_KEY;
  const result = await findNearbyServices({ lat: 17.4474, lng: 78.3911, category: 'all' });

  assert.ok(result.facilities.some((item) => /KPHB Colony Multi-Speciality Hospital/i.test(item.name)));
  assert.ok(result.facilities.some((item) => /KPHB Police Station/i.test(item.name)));
  assert.ok(result.facilities.some((item) => /KPHB Fire Station/i.test(item.name)));

  if (original) process.env.PLACES_API_KEY = original;
});
