const API_PREFIX = '/api/v1';

export function resolveApiBaseUrl(configuredUrl, production = false) {
  const value = configuredUrl?.trim();
  if (!value) {
    if (production) {
      throw new Error('VITE_API_BASE_URL must be set to the deployed backend API URL before building for production.');
    }
    return API_PREFIX;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTP or HTTPS backend URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must be an HTTP or HTTPS backend URL without credentials, query, or fragment.');
  }

  const path = url.pathname
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .replace(/(?:\/api\/v1)+\/?$/i, '');

  return `${url.origin}${path}${API_PREFIX}`;
}
