/**
 * @module api/accounts
 * @fileoverview CRUD and utility operations for IMAP/SMTP email accounts.
 */
import client from './client';

/**
 * Fetch all email accounts belonging to the authenticated user.
 * @returns {Promise<object[]>} Array of account objects.
 */
export const getAccounts = () =>
  client.get('/accounts').then(r => r.data.data);

/**
 * Create a new IMAP/SMTP account.
 * @param {object} data - Account payload (display_name, email_address, imap_*, smtp_* fields).
 * @returns {Promise<object>} Created account object.
 */
export const createAccount = (data) =>
  client.post('/accounts', data).then(r => r.data.data);

/**
 * Update an existing account's settings.
 * @param {number} id - Account ID.
 * @param {object} data - Partial or full account fields to update.
 * @returns {Promise<object>} API response envelope.
 */
export const updateAccount = (id, data) =>
  client.put(`/accounts/${id}`, data).then(r => r.data);

/**
 * Delete an account and all its associated mail.
 * @param {number} id - Account ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteAccount = (id) =>
  client.delete(`/accounts/${id}`).then(r => r.data);

/**
 * Trigger an immediate IMAP sync for the given account.
 * @param {number} id - Account ID.
 * @returns {Promise<{new_messages: number}>} Sync result including the count of newly fetched messages.
 */
export const syncAccount = (id) =>
  client.post(`/accounts/${id}/sync`).then(r => r.data.data);

/**
 * Test the IMAP or SMTP connection for an account without saving anything.
 * @param {number} id - Account ID.
 * @param {'imap'|'smtp'} [type='imap'] - Which connection to test.
 * @returns {Promise<{message: string}>} Result message from the server.
 */
export const testAccount = (id, type = 'imap') =>
  client.post(`/accounts/${id}/test`, { type }).then(r => r.data);
