import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import twilio from 'twilio';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import User from '../models/User.js';
import TrustedContact from '../models/TrustedContact.js';
import Incident from '../models/Incident.js';
import IncidentEvent from '../models/IncidentEvent.js';
import NotificationEvent from '../models/NotificationEvent.js';
import SafetyJourney from '../models/SafetyJourney.js';
import { connectDb } from '../config/db.js';
import authRoutes from '../routes/authRoutes.js';
import contactsRoutes from '../routes/contactsRoutes.js';
import incidentsRoutes from '../routes/incidentsRoutes.js';
import journeysRoutes from '../routes/journeysRoutes.js';
import smsWebhookRoutes from '../routes/smsWebhookRoutes.js';
import { resetSmsClientFactory, setSmsClientFactory } from '../services/smsProvider.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(projectRoot, '.env');
const localEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
dotenv.config({ path: envPath });
const mongoUri = process.env.MONGODB_URI?.trim() || localEnv.MONGODB_URI?.trim();
const callbackUrl = 'https://safesphere-integration.example.test/api/v1/webhooks/twilio/sms-status';

test('Atlas-backed auth, contacts, incidents, journeys, callbacks, and ownership persist', {
  skip: !mongoUri,
  timeout: 60000,
}, async () => {
  const previous = {
    DEMO_MODE: process.env.DEMO_MODE,
    JWT_SECRET: process.env.JWT_SECRET,
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    SMS_ENABLED: process.env.SMS_ENABLED,
    SMS_ACCOUNT_ID: process.env.SMS_ACCOUNT_ID,
    SMS_AUTH_TOKEN: process.env.SMS_AUTH_TOKEN,
    SMS_FROM_NUMBER: process.env.SMS_FROM_NUMBER,
    SMS_STATUS_CALLBACK_URL: process.env.SMS_STATUS_CALLBACK_URL,
  };
  let server;
  let ownerId;
  let otherUserId;
  let contactId;
  let incidentId;
  let messageSid;

  try {
    process.env.DEMO_MODE = 'false';
    process.env.JWT_SECRET = 'integration-test-jwt-secret-longer-than-thirty-two-characters';
    process.env.SMS_PROVIDER = 'twilio';
    process.env.SMS_ENABLED = 'true';
    process.env.SMS_ACCOUNT_ID = `AC${'a'.repeat(32)}`;
    process.env.SMS_AUTH_TOKEN = 'integration-test-provider-token';
    process.env.SMS_FROM_NUMBER = '+14155550000';
    process.env.SMS_STATUS_CALLBACK_URL = callbackUrl;
    await connectDb();

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/contacts', contactsRoutes);
    app.use('/api/v1/incidents', incidentsRoutes);
    app.use('/api/v1/journeys', journeysRoutes);
    app.use('/api/v1/webhooks', smsWebhookRoutes);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const register = async (name) => {
      const email = `atlas-test-${randomUUID()}@example.test`;
      const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password: 'test-password-123' }),
      });
      assert.equal(response.status, 201);
      const result = await response.json();
      const user = await User.findOne({ email }).select('+passwordHash');
      assert.ok(user);
      assert.notEqual(user.passwordHash, 'test-password-123');
      return { email, id: user._id.toString(), token: result.token };
    };

    const owner = await register('Atlas Integration Owner');
    ownerId = owner.id;
    const other = await register('Atlas Integration Other');
    otherUserId = other.id;

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: owner.email, password: 'test-password-123' }),
    });
    assert.equal(login.status, 200);

    const ownerHeaders = { Authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' };
    const createdContact = await fetch(`${baseUrl}/api/v1/contacts`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        name: 'Consenting Atlas Contact',
        phone: '+14155552671',
        notificationPreference: 'sms',
        smsConsent: true,
      }),
    });
    assert.equal(createdContact.status, 201);
    const contactPayload = await createdContact.json();
    contactId = contactPayload.contact.id;
    assert.equal(await TrustedContact.countDocuments({ _id: contactId, userId: ownerId }), 1);
    assert.equal((await fetch(`${baseUrl}/api/v1/contacts`, { headers: ownerHeaders })).status, 200);

    const createdJourney = await fetch(`${baseUrl}/api/v1/journeys`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        destination: 'Integration test destination',
        expectedArrival: new Date(Date.now() + 3600000).toISOString(),
        trustedContactId: contactId,
      }),
    });
    assert.equal(createdJourney.status, 201);
    const journeyId = (await createdJourney.json()).journey.id;
    assert.equal(await SafetyJourney.countDocuments({ _id: journeyId, userId: ownerId }), 1);

    setSmsClientFactory(() => ({
      messages: {
        create: async () => {
          messageSid = `SM${randomUUID().replaceAll('-', '')}`;
          return { sid: messageSid, status: 'queued' };
        },
      },
    }));
    const createdIncident = await fetch(`${baseUrl}/api/v1/incidents`, {
      method: 'POST',
      headers: { ...ownerHeaders, 'X-Idempotency-Key': randomUUID() },
      body: JSON.stringify({ description: 'Database-backed integration SOS', category: 'medical' }),
    });
    assert.equal(createdIncident.status, 201);
    const incidentPayload = await createdIncident.json();
    incidentId = incidentPayload.incident.id;
    assert.equal(await Incident.countDocuments({ _id: incidentId, userId: ownerId }), 1);

    const deadline = Date.now() + 5000;
    let notification;
    while (Date.now() < deadline) {
      notification = await NotificationEvent.findOne({ incidentId, contactId });
      if (notification?.providerMessageId) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(notification?.providerMessageId);
    assert.equal(notification.providerMessageId, messageSid);

    const params = { MessageSid: messageSid, MessageStatus: 'delivered' };
    const signature = twilio.getExpectedTwilioSignature(process.env.SMS_AUTH_TOKEN, callbackUrl, params);
    const callback = await fetch(`${baseUrl}/api/v1/webhooks/twilio/sms-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(params),
    });
    assert.equal(callback.status, 200);
    assert.equal((await NotificationEvent.findOne({ providerMessageId: messageSid })).status, 'delivered');
    assert.ok(await IncidentEvent.exists({ incidentId, eventType: 'sms_delivered' }));

    const otherHeaders = { Authorization: `Bearer ${other.token}` };
    const privateAlerts = await fetch(`${baseUrl}/api/v1/incidents/${incidentId}/alerts`, { headers: otherHeaders });
    assert.equal(privateAlerts.status, 404);
    const otherContacts = await fetch(`${baseUrl}/api/v1/contacts`, { headers: otherHeaders });
    assert.equal(otherContacts.status, 200);
    assert.equal((await otherContacts.json()).contacts.length, 0);
  } finally {
    resetSmsClientFactory();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (ownerId) {
      const cleanup = [
        NotificationEvent.deleteMany({ userId: ownerId }),
        TrustedContact.deleteMany({ userId: ownerId }),
        SafetyJourney.deleteMany({ userId: ownerId }),
        User.deleteMany({ _id: ownerId }),
      ];
      if (incidentId) {
        cleanup.push(IncidentEvent.deleteMany({ incidentId }));
        cleanup.push(Incident.deleteMany({ _id: incidentId }));
      }
      await Promise.all(cleanup);
    }
    if (otherUserId) await User.deleteMany({ _id: otherUserId });
    if (mongoose.connection.readyState) await mongoose.disconnect();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
