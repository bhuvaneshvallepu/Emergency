import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthResponseIssue, readAuthResponse } from './authResponse.js';

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

test('reports safe diagnostic reasons for malformed successful responses', () => {
  assert.equal(getAuthResponseIssue({ user: { id: 'id', name: 'name', email: 'email' } }), 'Missing token');
  assert.equal(getAuthResponseIssue({ token: 'token' }), 'Missing user profile');
  assert.equal(
    getAuthResponseIssue({ token: 'token', user: { id: 'id', name: '', email: 1 } }),
    'Missing user profile fields: name, email',
  );
  assert.equal(getAuthResponseIssue({
    token: 'token',
    user: { id: 'id', name: 'name', email: 'email' },
  }), null);
});
