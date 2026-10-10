import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAlertStatus } from './alertStatus.js';

test('frontend presents backend notification states distinctly', () => {
  const expectedLabels = {
    disabled: 'Disabled',
    configuration_error: 'Configuration error',
    skipped: 'Skipped',
    queued: 'Queued',
    sent: 'Sent',
    delivered: 'Delivered',
    failed: 'Failed',
    undelivered: 'Undelivered',
  };

  for (const [status, label] of Object.entries(expectedLabels)) {
    assert.equal(describeAlertStatus(status).label, label);
  }
  assert.match(describeAlertStatus('queued').description, /not confirmed/i);
  assert.match(describeAlertStatus('sent').description, /not confirmed/i);
  assert.match(describeAlertStatus('delivered').description, /confirmed delivery/i);
});
