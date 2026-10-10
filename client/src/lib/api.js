import axios from 'axios';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API = axios.create({
  baseURL: configuredApiBaseUrl || '/api/v1',
});

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
