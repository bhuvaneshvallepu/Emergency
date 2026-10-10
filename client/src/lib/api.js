import axios from 'axios';
import { resolveApiBaseUrl } from './apiConfig.js';

export const API = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD),
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
