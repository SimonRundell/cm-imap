/**
 * @module api/rules
 * @fileoverview API calls for email rules, labels, and auto-reply settings.
 */
import client from './client';

/**
 * Fetch all processing rules for a specific account.
 * @param {number} accountId - Account ID.
 * @returns {Promise<object[]>} Array of rule objects, each containing conditions and actions.
 */
export const getRules = (accountId) =>
  client.get('/rules', { params: { account_id: accountId } }).then(r => r.data.data);

/**
 * Create a new email processing rule.
 * @param {object} data - Rule payload (name, conditions, actions, account_id, etc.).
 * @returns {Promise<object>} Created rule object.
 */
export const createRule = (data) =>
  client.post('/rules', data).then(r => r.data.data);

/**
 * Update an existing rule.
 * @param {number} id - Rule ID.
 * @param {object} data - Fields to update.
 * @returns {Promise<object>} Updated rule object.
 */
export const updateRule = (id, data) =>
  client.put(`/rules/${id}`, data).then(r => r.data.data);

/**
 * Delete a rule permanently.
 * @param {number} id - Rule ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteRule = (id) =>
  client.delete(`/rules/${id}`).then(r => r.data);

/**
 * Fetch all labels for a specific account.
 * @param {number} accountId - Account ID.
 * @returns {Promise<object[]>} Array of label objects (id, name, color, message_count).
 */
export const getLabels = (accountId) =>
  client.get('/labels', { params: { account_id: accountId } }).then(r => r.data.data);

/**
 * Create a new label.
 * @param {object} data - Label payload (account_id, name, color).
 * @returns {Promise<object>} Created label object.
 */
export const createLabel = (data) =>
  client.post('/labels', data).then(r => r.data.data);

/**
 * Update a label's name or colour.
 * @param {number} id - Label ID.
 * @param {object} data - Fields to update.
 * @returns {Promise<object>} API response envelope.
 */
export const updateLabel = (id, data) =>
  client.put(`/labels/${id}`, data).then(r => r.data);

/**
 * Delete a label and remove it from all associated messages.
 * @param {number} id - Label ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteLabel = (id) =>
  client.delete(`/labels/${id}`).then(r => r.data);

/**
 * Fetch the auto-reply configuration for a specific account.
 * Returns null/undefined when no auto-reply has been configured yet.
 * @param {number} accountId - Account ID.
 * @returns {Promise<object|null>} Auto-reply record or null.
 */
export const getAutoreply = (accountId) =>
  client.get('/autoreplies', { params: { account_id: accountId } }).then(r => r.data.data);

/**
 * Create or update the auto-reply for an account (upsert semantics).
 * @param {object} data - Auto-reply payload (account_id, is_enabled, subject, html_body, start_date, end_date).
 * @returns {Promise<object>} Saved auto-reply record.
 */
export const upsertAutoreply = (data) =>
  client.post('/autoreplies', data).then(r => r.data.data);
