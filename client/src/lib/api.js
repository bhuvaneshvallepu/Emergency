import axios from 'axios';

export const API = axios.create({ baseURL: '/api/v1' });

export function getAuthHeader() {
  const token = localStorage.getItem('safesphere-token') || 'demo-token';
  return { Authorization: `Bearer ${token}` };
}

export async function fetchJson(url, options = {}) {
  const response = await API.get(url, {
    ...options,
    headers: {
      ...getAuthHeader(),
      ...(options.headers || {}),
    },
  });
  return response.data;
}
