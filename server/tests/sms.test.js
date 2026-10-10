import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import { randomUUID } from 'node:crypto';
import { demoStore } from '../data/store.js';
import contactsRoutes from '../routes/contactsRoutes.js';
import incidentsRoutes from '../routes/incidentsRoutes.js';
import smsWebhookRoutes from '../routes/smsWebhookRoutes.js';
import {
  createAlertWorkflow,
  getIncidentAlerts,
  updateAlertFromTwilio,
} from '../services/notificationService.js';
import {
  isSmsEnabled,
  resetSmsClientFactory,
  sendSms,
  setSmsClientFactory,
} from '../services/smsProvider.js';

process.env.DEMO_MODE = 'true';
process.env.JWT_SECRET = 'sms-tests-use-a-random-secret-with-more-than-32-characters';
const callbackUrl = 'https://safe.example.test/api/v1/webhooks/twilio/sms-status';

async function withServer(routes, callback) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/v1/contacts', contactsRoutes);
  app.use('/api/v1/incidents', incidentsRoutes);
  app.use('/api/v1/webhooks', smsWebhookRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function authenticated(token = 'demo-token') {
  return { Authorization: `Bearer ${token}` };
}

function testContact(overrides = {}) {
  return {
    id: `sms-test-${randomUUID()}`,
    userId: demoStore.user.id,
    name: 'SMS Test Contact',
    phone: '+14155552671',
    email: '',
    priority: 10,
    verified: false,
    smsConsent: true,
    notificationPreference: 'sms',
    ...overrides,
  };
}

function configureSmsEnvironment({ enabled = true } = {}) {
  process.env.SMS_PROVIDER = 'twilio';
  process.env.SMS_ENABLED = String(enabled);
  process.env.SMS_ACCOUNT_ID = 'AC' + 'a'.repeat(32);
  process.env.SMS_AUTH_TOKEN = 'test-auth-token';
  process.env.SMS_FROM_NUMBER = '+14155550000';
  process.env.SMS_STATUS_CALLBACK_URL = callbackUrl;
}

test('SMS is disabled unless both provider and enable flag are set', async () => {
  configureSmsEnvironment({ enabled: false });
  assert.equal(isSmsEnabled(), false);
  const result = await sendSms({ to: '+14155552671', body: 'Emergency alert.' });
  assert.equal(result.status, 'disabled');
  assert.equal(result.sid, null);

  const incident = { id: `sms-disabled-${randomUUID()}`, userId: demoStore.user.id, description: 'Need help', location: {} };
  const contact = testContact();
  const alert = await createAlertWorkflow(incident, contact);
  assert.equal(alert.status, 'disabled');
  assert.match(alert.failureReason, /SMS_ENABLED/i);
  assert.equal(demoStore.alertEvents.includes(alert), true);
  demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.id !== alert.id);
  demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incident.id);
});

test('enabled SMS identifies each missing required Twilio setting', async () => {
  for (const setting of ['SMS_ACCOUNT_ID', 'SMS_AUTH_TOKEN', 'SMS_FROM_NUMBER']) {
    configureSmsEnvironment();
    delete process.env[setting];
    await assert.rejects(
      () => sendSms({ to: '+14155552671', body: 'Emergency alert.' }),
      (error) => error.code === 'SMS_CONFIGURATION_ERROR'
        && error.message.includes(setting)
        && !error.message.includes('test-auth-token'),
    );
  }
});

test('enabled SMS reports missing Twilio settings as a configuration error before dispatch', async () => {
  configureSmsEnvironment();
  delete process.env.SMS_ACCOUNT_ID;
  const incident = { id: `sms-config-${randomUUID()}`, userId: demoStore.user.id, description: 'Need help', location: {} };
  const contact = testContact();
  const alert = await createAlertWorkflow(incident, contact);
  assert.equal(alert.status, 'configuration_error');
  assert.match(alert.failureReason, /SMS_ACCOUNT_ID/);
  assert.equal(alert.provider, 'twilio');
  demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.id !== alert.id);
  demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incident.id);
});

test('SMS rejects invalid phone numbers and empty or oversized bodies', async () => {
  configureSmsEnvironment();
  await assert.rejects(() => sendSms({ to: '4155552671', body: 'Emergency alert.' }), { code: 'INVALID_RECIPIENT' });
  await assert.rejects(() => sendSms({ to: '+14155552671', body: ' ' }), { code: 'INVALID_MESSAGE' });

  const incident = { id: `sms-invalid-${randomUUID()}`, userId: demoStore.user.id, description: 'Need help', location: {} };
  const alert = await createAlertWorkflow(incident, testContact({ phone: '4155552671' }));
  assert.equal(alert.status, 'failed');
  assert.equal(alert.failureCode, 'INVALID_RECIPIENT');
  demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.id !== alert.id);
  demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incident.id);
});

test('valid opted-in contact invokes the Twilio client without exposing its auth token', async () => {
  configureSmsEnvironment();
  let call;
  setSmsClientFactory((sid, token) => {
    assert.equal(sid, process.env.SMS_ACCOUNT_ID);
    assert.equal(token, process.env.SMS_AUTH_TOKEN);
    return { messages: { create: async (options) => { call = options; return { sid: 'SMtest123', status: 'queued' }; } } };
  });
  try {
    const result = await sendSms({ to: '+14155552671', body: 'Emergency alert.' });
    assert.equal(result.provider, 'twilio');
    assert.equal(result.sid, 'SMtest123');
    assert.equal(result.status, 'queued');
    assert.equal(call.statusCallback, callbackUrl);
    assert.equal(JSON.stringify(result).includes(process.env.SMS_AUTH_TOKEN), false);
  } finally {
    resetSmsClientFactory();
  }
});

test('contacts require E.164 for SMS and record consent as false by default', async () => {
  await withServer([], async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/v1/contacts`, {
      method: 'POST',
      headers: { ...authenticated(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test', phone: '555-1234' }),
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/v1/contacts`, {
      method: 'POST',
      headers: { ...authenticated(), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test', phone: '+14155552672' }),
    });
    const { contact } = await response.json();
    assert.equal(response.status, 201);
    assert.equal(contact.smsConsent, false);
    assert.equal(contact.verified, false);
    demoStore.contacts.splice(demoStore.contacts.findIndex((item) => item.id === contact.id), 1);
  });
});

test('contact without SMS consent is skipped and never reaches the provider', async () => {
  const incident = { id: `sms-test-incident-${randomUUID()}`, userId: demoStore.user.id, description: 'Need help', location: {} };
  configureSmsEnvironment();
  let invoked = false;
  setSmsClientFactory(() => {
    invoked = true;
    return { messages: { create: async () => ({ sid: 'SMnot-sent', status: 'queued' }) } };
  });
  try {
    const alerts = await Promise.all([false, 'true'].map((smsConsent) => createAlertWorkflow(
      incident,
      testContact({ smsConsent }),
    )));
    assert.deepEqual(alerts.map((alert) => alert.status), ['skipped', 'skipped']);
    assert.ok(alerts.every((alert) => /not consented/i.test(alert.failureReason)));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(invoked, false);
  } finally {
    resetSmsClientFactory();
    demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.incidentId !== incident.id);
    demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incident.id);
  }
});

test('an API response alone never marks an alert delivered', async () => {
  configureSmsEnvironment();
  const incident = { id: `sms-initial-delivery-${randomUUID()}`, userId: demoStore.user.id, description: 'Need help', location: {} };
  const contact = testContact();
  setSmsClientFactory(() => ({
    messages: { create: async () => ({ sid: 'SMinitial-status-test', status: 'delivered' }) },
  }));
  try {
    const alert = await createAlertWorkflow(incident, contact);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(alert.status, 'sent');
    assert.equal(alert.deliveredAt, null);
    assert.equal(alert.providerMessageId, 'SMinitial-status-test');
  } finally {
    resetSmsClientFactory();
    demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.incidentId !== incident.id);
    demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incident.id);
  }
});

test('one provider failure does not block other recipients or incident creation', async () => {
  configureSmsEnvironment();
  const first = testContact({ phone: '+14155552673' });
  const second = testContact({ phone: '+14155552674' });
  demoStore.contacts.push(first, second);
  const originalIncidentCount = demoStore.incidents.length;
  const attempted = [];
  setSmsClientFactory(() => ({
    messages: {
      create: async ({ to }) => {
        attempted.push(to);
        if (to === first.phone) throw Object.assign(new Error('provider unavailable'), { code: 21211 });
        return { sid: 'SM' + randomUUID().replaceAll('-', '').slice(0, 32), status: 'queued' };
      },
    },
  }));

  try {
    await withServer([], async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/incidents`, {
        method: 'POST',
        headers: { ...authenticated(), 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Emergency test incident',
          category: 'medical',
          latitude: 17.4474,
          longitude: 78.3911,
        }),
      });
      const payload = await response.json();
      assert.equal(response.status, 201);
      assert.ok(payload.incident.id);
      assert.equal(payload.notifications.length, 4);
      assert.equal(payload.notifications.some((item) => 'recipient' in item), false);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const alerts = await getIncidentAlerts(payload.incident.id, demoStore.user.id);
      assert.equal(alerts.find((item) => item.contactId === first.id).status, 'failed');
      assert.equal(alerts.find((item) => item.contactId === first.id).failureCode, '21211');
      assert.equal(alerts.find((item) => item.contactId === first.id).failureReason.includes('provider unavailable'), false);
      assert.equal(alerts.find((item) => item.contactId === second.id).status, 'queued');
      assert.deepEqual(attempted.sort(), [first.phone, second.phone].sort());
      assert.equal(demoStore.incidents.length, originalIncidentCount + 1);
      demoStore.incidents.splice(demoStore.incidents.findIndex((item) => item.id === payload.incident.id), 1);
      demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.incidentId !== payload.incident.id);
      demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== payload.incident.id);
    });
  } finally {
    resetSmsClientFactory();
    demoStore.contacts = demoStore.contacts.filter((item) => item.id !== first.id && item.id !== second.id);
  }
});

test('SOS works without GPS and does not send a fake map location', async () => {
  configureSmsEnvironment();
  const contact = testContact({ phone: '+14155552675' });
  demoStore.contacts.push(contact);
  let sentBody = '';
  setSmsClientFactory(() => ({
    messages: {
      create: async ({ body }) => {
        sentBody = body;
        return { sid: 'SMno-location-test', status: 'queued' };
      },
    },
  }));
  let incidentId;
  try {
    await withServer([], async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/incidents`, {
        method: 'POST',
        headers: { ...authenticated(), 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'Need emergency help now' }),
      });
      const payload = await response.json();
      incidentId = payload.incident.id;
      assert.equal(response.status, 201);
      assert.equal(payload.incident.location.latitude, null);
      assert.equal(payload.incident.location.longitude, null);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const alerts = await getIncidentAlerts(incidentId, demoStore.user.id);
      assert.equal(alerts.find((item) => item.contactId === contact.id).status, 'queued');
      assert.equal(alerts.find((item) => item.contactId === contact.id).providerMessageId, 'SMno-location-test');
      assert.match(sentBody, /has requested help/);
      assert.equal(sentBody.includes('maps.google.com'), false);
    });
  } finally {
    resetSmsClientFactory();
    demoStore.contacts = demoStore.contacts.filter((item) => item.id !== contact.id);
    demoStore.incidents = demoStore.incidents.filter((item) => item.id !== incidentId);
    demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.incidentId !== incidentId);
    demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incidentId);
  }
});

test('a user cannot send alerts for another owner’s incident', async () => {
  const foreignToken = jwt.sign({ id: 'another-user', email: 'other@example.test' }, process.env.JWT_SECRET);
  const alertCount = demoStore.alertEvents.length;
  await withServer([], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/incidents/incident-1/alerts`, {
      method: 'POST',
      headers: authenticated(foreignToken),
    });
    assert.equal(response.status, 404);
    assert.equal(demoStore.alertEvents.length, alertCount);
  });
});

test('invalid Twilio signatures are rejected and unknown SIDs create no alert', async () => {
  process.env.SMS_AUTH_TOKEN = 'test-auth-token';
  process.env.SMS_STATUS_CALLBACK_URL = callbackUrl;
  await withServer([], async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/v1/webhooks/twilio/sms-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'invalid' },
      body: new URLSearchParams({ MessageSid: 'SMunknown', MessageStatus: 'delivered' }),
    });
    assert.equal(invalid.status, 403);

    const params = { MessageSid: 'SMunknown', MessageStatus: 'delivered' };
    const signature = twilio.getExpectedTwilioSignature(process.env.SMS_AUTH_TOKEN, callbackUrl, params);
    const unknown = await fetch(`${baseUrl}/api/v1/webhooks/twilio/sms-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(params),
    });
    assert.equal(unknown.status, 404);
  });
});

test('valid Twilio callback updates the matching alert once and ignores duplicates', async () => {
  const incidentId = `sms-webhook-${randomUUID()}`;
  const alert = {
    id: `alert-${randomUUID()}`,
    incidentId,
    userId: demoStore.user.id,
    contactId: 'consented-contact',
    recipient: '+14155552671',
    channel: 'sms',
    provider: 'twilio',
    providerMessageId: 'SMcallback123',
    status: 'sent',
    failureReason: null,
    failureCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    statusHistory: [{ status: 'sent', timestamp: new Date().toISOString(), failureCode: null }],
  };
  demoStore.alertEvents.push(alert);
  const params = { MessageSid: alert.providerMessageId, MessageStatus: 'delivered' };
  const signature = twilio.getExpectedTwilioSignature(process.env.SMS_AUTH_TOKEN, callbackUrl, params);
  const priorTimelineCount = demoStore.timeline.filter((item) => item.incidentId === incidentId).length;

  try {
    await withServer([], async (baseUrl) => {
      const sendCallback = () => fetch(`${baseUrl}/api/v1/webhooks/twilio/sms-status`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
        body: new URLSearchParams(params),
      });
      const first = await sendCallback();
      assert.equal(first.status, 200);
      assert.equal((await first.json()).duplicate, false);
      assert.equal(alert.status, 'delivered');
      assert.ok(alert.deliveredAt);
      const timelineCountAfterFirst = demoStore.timeline.filter((item) => item.incidentId === incidentId).length;
      const repeated = await sendCallback();
      assert.equal(repeated.status, 200);
      assert.equal((await repeated.json()).duplicate, true);
      assert.equal(demoStore.timeline.filter((item) => item.incidentId === incidentId).length, timelineCountAfterFirst);
    });
  } finally {
    demoStore.alertEvents = demoStore.alertEvents.filter((item) => item.id !== alert.id);
    demoStore.timeline = demoStore.timeline.filter((item) => item.incidentId !== incidentId);
  }
  assert.equal(priorTimelineCount, 0);
});
