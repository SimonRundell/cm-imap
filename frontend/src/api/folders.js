/**
 * @module api/folders
 * @fileoverview IMAP folder retrieval, creation, update, and synchronisation.
 */
import client from './client';

/**
 * Fetch subscribed folders for a specific account.
 * @param {number} accountId - Account ID to filter folders by.
 * @returns {Promise<object[]>} Array of folder objects.
 */
export const getFolders = (accountId) =>
  client.get('/folders', { params: { account_id: accountId } }).then(r => r.data.data);

/**
 * Fetch all folders across every account owned by the authenticated user.
 * @returns {Promise<object[]>} Array of folder objects.
 */
export const getAllFolders = () =>
  client.get('/folders').then(r => r.data.data);

/**
 * Synchronise the folder list for an account from the IMAP server.
 * This discovers new folders and updates subscription state.
 * @param {number} accountId - Account ID to sync folders for.
 * @returns {Promise<object[]>} Updated array of folder objects.
 */
export const syncFolders = (accountId) =>
  client.post('/folders/sync', null, { params: { account_id: accountId } }).then(r => r.data.data);

/**
 * Create a new IMAP folder on the server.
 * @param {number} accountId - Account to create the folder in.
 * @param {string} name - Folder name (or path, e.g. "Work/Projects").
 * @returns {Promise<object>} API response envelope.
 */
export const createFolder = (accountId, name) =>
  client.post('/folders', { account_id: accountId, name }).then(r => r.data);

/**
 * Update a folder's local metadata (e.g. subscription flag).
 * @param {number} id - Folder ID.
 * @param {object} data - Fields to update.
 * @returns {Promise<object>} API response envelope.
 */
export const updateFolder = (id, data) =>
  client.put(`/folders/${id}`, data).then(r => r.data);
