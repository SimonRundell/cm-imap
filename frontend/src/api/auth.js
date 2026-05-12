/**
 * @module api/auth
 * @fileoverview Authentication API calls — login, register, logout, token refresh and current-user fetch.
 */
import client from './client';

/**
 * Authenticate a user with username/email and password.
 * @param {string} username - Username or email address.
 * @param {string} password - Plain-text password.
 * @returns {Promise<{user: object, access_token: string, refresh_token: string}>}
 */
export const login = (username, password) =>
  client.post('/auth/login', { username, password }).then(r => r.data.data);

/**
 * Register a new user account.
 * @param {string} username - Desired username.
 * @param {string} email - Email address.
 * @param {string} password - Plain-text password (minimum length enforced server-side).
 * @returns {Promise<object>} API response envelope.
 */
export const register = (username, email, password) =>
  client.post('/auth/register', { username, email, password }).then(r => r.data);

/**
 * Invalidate the current refresh token on the server.
 * @param {string} refreshToken - The refresh token to revoke.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const logout = (refreshToken) =>
  client.post('/auth/logout', { refresh_token: refreshToken });

/**
 * Fetch the currently authenticated user's profile.
 * @returns {Promise<object>} User object (id, username, email, role, …).
 */
export const getMe = () =>
  client.get('/auth/me').then(r => r.data.data);

/**
 * Exchange a refresh token for a new access/refresh token pair.
 * The Axios client interceptor calls this automatically; direct use is rarely needed.
 * @param {string} refreshToken - Current valid refresh token.
 * @returns {Promise<{access_token: string, refresh_token: string}>}
 */
export const refresh = (refreshToken) =>
  client.post('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data.data);
