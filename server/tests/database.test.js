import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { isDemoMode } from '../config/persistence.js';
import Incident from '../models/Incident.js';
import TrustedContact from '../models/TrustedContact.js';
import User from '../models/User.js';

async function withEnvironment(values, callback) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('only explicit local demo mode can start without MongoDB', async () => {
  await withEnvironment({ MONGODB_URI: '', DEMO_MODE: 'true', NODE_ENV: 'development' }, async () => {
    assert.equal(isDemoMode(), true);
    assert.equal(await connectDb(), false);
  });
  await withEnvironment({ MONGODB_URI: '', DEMO_MODE: 'false', NODE_ENV: 'development' }, async () => {
    await assert.rejects(connectDb(), /MONGODB_URI is required/);
  });
  await withEnvironment({ MONGODB_URI: '', DEMO_MODE: 'true', NODE_ENV: 'production' }, async () => {
    await assert.rejects(connectDb(), /in-memory demo mode is not allowed/);
  });
});

test('persistent models require hashed passwords and valid owner-linked fields', async () => {
  const user = new User({ name: 'Test User', email: 'test@example.test' });
  const userError = await user.validate().then(() => null, (error) => error);
  assert.ok(userError.errors.passwordHash);

  const userId = new mongoose.Types.ObjectId();
  const invalidSmsContact = new TrustedContact({
    userId,
    name: 'Test Contact',
    phone: '555-0100',
    smsConsent: true,
    notificationPreference: 'sms',
  });
  const contactError = await invalidSmsContact.validate().then(() => null, (error) => error);
  assert.ok(contactError.errors.phone);

  const invalidIncident = new Incident({
    userId,
    description: 'Help',
    category: 'other',
    source: 'manual_sos',
    location: { latitude: 91, longitude: 0 },
  });
  const incidentError = await invalidIncident.validate().then(() => null, (error) => error);
  assert.ok(incidentError.errors.description);
  assert.ok(incidentError.errors['location.latitude']);
});
