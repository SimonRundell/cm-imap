/**
 * @module api/client
 * @fileoverview Configured Axios instance used by every API module.
 *
 * Responsibilities:
 *  - Attaches the current Bearer access token to every outgoing request.
 *  - Handles 401 responses by transparently refreshing the token pair and
 *    retrying the original request. While a refresh is in-flight, subsequent
 *    401s are queued and resolved once the refresh settles.
 *  - On refresh failure (no token or server error), clears localStorage and
 *    redirects to /login.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach access token to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 → token refresh
let refreshing = false;
let refreshQueue = [];

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => client(original)).catch(Promise.reject);
      }

      original._retry = true;
      refreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
        localStorage.setItem('access_token',  data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        refreshQueue.forEach(({ resolve }) => resolve());
        refreshQueue = [];
        return client(original);
      } catch (e) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(e);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default client;
