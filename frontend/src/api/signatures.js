/**
 * @module api/signatures
 * @fileoverview CRUD operations for HTML email signatures.
 */
import client from './client';

/**
 * Fetch all signatures for the authenticated user.
 * @returns {Promise<object[]>} Array of signature objects (id, name, html_content, is_default, account_id).
 */
export const getSignatures = () =>
  client.get('/signatures').then(r => r.data.data);

/**
 * Create a new HTML email signature.
 * @param {object} data - Signature payload (name, html_content, is_default, account_id).
 * @returns {Promise<object>} Created signature object.
 */
export const createSignature = (data) =>
  client.post('/signatures', data).then(r => r.data.data);

/**
 * Update an existing signature.
 * @param {number} id - Signature ID.
 * @param {object} data - Fields to update.
 * @returns {Promise<object>} API response envelope.
 */
export const updateSignature = (id, data) =>
  client.put(`/signatures/${id}`, data).then(r => r.data);

/**
 * Delete a signature permanently.
 * @param {number} id - Signature ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteSignature = (id) =>
  client.delete(`/signatures/${id}`).then(r => r.data);
