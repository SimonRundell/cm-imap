/**
 * @module api/admin
 * @fileoverview Admin-only API endpoints for user management, system settings,
 * and account sync status. All functions require the authenticated user to hold
 * the "admin" role; the server enforces this independently.
 */
import client from './client';

/**
 * Fetch all user accounts in the system.
 * @returns {Promise<object[]>} Array of user objects (id, username, email, role, is_active, account_count, created_at).
 */
export const getUsers = () =>
  client.get('/admin/users').then(r => r.data.data);

/**
 * Create a new user account.
 * @param {object} data - User payload (username, email, password, role).
 * @returns {Promise<object>} Created user object.
 */
export const createUser = (data) =>
  client.post('/admin/users', data).then(r => r.data.data);

/**
 * Update an existing user's details or status.
 * @param {number} id - User ID.
 * @param {object} data - Fields to update (e.g. role, is_active, password).
 * @returns {Promise<object>} API response envelope.
 */
export const updateUser = (id, data) =>
  client.put(`/admin/users/${id}`, data).then(r => r.data);

/**
 * Delete a user account and all associated data.
 * @param {number} id - User ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteUser = (id) =>
  client.delete(`/admin/users/${id}`).then(r => r.data);

/**
 * Fetch global system settings (app name, sync interval, attachment path, etc.).
 * @returns {Promise<object>} Key/value settings record.
 */
export const getSettings = () =>
  client.get('/admin/settings').then(r => r.data.data);

/**
 * Persist updated global system settings.
 * @param {object} data - Settings object with keys matching the server's settings schema.
 * @returns {Promise<object>} API response envelope.
 */
export const updateSettings = (data) =>
  client.put('/admin/settings', data).then(r => r.data);

/**
 * Fetch the last-sync timestamp and error state for every account across all users.
 * Used to give administrators a health-check view of the sync pipeline.
 * @returns {Promise<object[]>} Array of account sync status records.
 */
export const getSyncStatus = () =>
  client.get('/admin/sync-status').then(r => r.data.data);
