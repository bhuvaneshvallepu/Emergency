import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { resolveApiBaseUrl } from './apiConfig.js';

test('production requires an explicit absolute backend URL', () => {
  assert.throws(
    () => resolveApiBaseUrl('', true),
    /VITE_API_BASE_URL must be set/,
  );
  assert.throws(
    () => resolveApiBaseUrl('/api/v1', true),
    /absolute HTTP or HTTPS backend URL/,
  );
});

test('configures the API prefix exactly once for backend root or prefixed URLs', () => {
  const expectedBase = 'https://emergency-kyl5.onrender.com/api/v1';
  const urls = [
    'https://emergency-kyl5.onrender.com',
    'https://emergency-kyl5.onrender.com/',
    'https://emergency-kyl5.onrender.com/api/v1',
    'https://emergency-kyl5.onrender.com/api/v1/',
    'https://emergency-kyl5.onrender.com/api/v1/api/v1',
  ];

  for (const url of urls) {
    const api = axios.create({ baseURL: resolveApiBaseUrl(url, true) });
    assert.equal(api.getUri({ url: '/auth/register' }), `${expectedBase}/auth/register`);
  }
});

test('keeps the Vite proxy URL as the development default', () => {
  assert.equal(resolveApiBaseUrl('', false), '/api/v1');
});

test('rejects credentials, query strings, and non-HTTP protocols in the API URL', () => {
  for (const url of [
    'https://user:password@backend.example.com',
    'https://backend.example.com?token=secret',
    'file:///backend',
  ]) {
    assert.throws(() => resolveApiBaseUrl(url, true), /VITE_API_BASE_URL must be/);
  }
});
