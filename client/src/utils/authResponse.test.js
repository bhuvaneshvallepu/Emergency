import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthResponse } from './authResponse.js';

test('accepts the backend authentication response contract', () => {
  const payload = {
    token: 'signed.jwt.token',
    user: { id: 'user-123', name: 'Safe User', email: 'safe@example.test' },
  };

  assert.deepEqual(readAuthResponse(payload), payload);
});

test('rejects successful responses missing a token or complete user profile', () => {
  assert.equal(readAuthResponse({ user: { id: 'user-123', name: 'Safe User', email: 'safe@example.test' } }), null);
  assert.equal(readAuthResponse({ token: 'signed.jwt.token' }), null);
  assert.equal(readAuthResponse({
    token: 'signed.jwt.token',
    user: { id: 'user-123', name: 'Safe User' },
  }), null);
});
