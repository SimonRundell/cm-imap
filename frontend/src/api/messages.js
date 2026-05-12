/**
 * @module api/messages
 * @fileoverview Message retrieval, mutation, sending, polling, and attachment helpers.
 */
import client from './client';

/**
 * Fetch a paginated list of messages.
 * @param {object} params - Query parameters such as folder_id, account_id, unified, search, page, per_page.
 * @returns {Promise<{messages: object[], total: number, last_page: number}>}
 */
export const getMessages = (params) =>
  client.get('/messages', { params }).then(r => r.data.data);

/**
 * Fetch a single message by ID, including its full body and attachments.
 * @param {number} id - Message ID.
 * @returns {Promise<object>} Full message object.
 */
export const getMessage = (id) =>
  client.get(`/messages/${id}`).then(r => r.data.data);

/**
 * Partially update a message's mutable fields (e.g. is_read, is_starred).
 * @param {number} id - Message ID.
 * @param {object} data - Fields to update.
 * @returns {Promise<object>} API response envelope.
 */
export const updateMessage = (id, data) =>
  client.put(`/messages/${id}`, data).then(r => r.data);

/**
 * Delete (trash) a message.
 * @param {number} id - Message ID.
 * @returns {Promise<object>} API response envelope.
 */
export const deleteMessage = (id) =>
  client.delete(`/messages/${id}`).then(r => r.data);

/**
 * Move a message to a different folder.
 * @param {number} id - Message ID.
 * @param {number} folderId - Destination folder ID.
 * @returns {Promise<object>} API response envelope.
 */
export const moveMessage = (id, folderId) =>
  client.post(`/messages/${id}/move`, { folder_id: folderId }).then(r => r.data);

/**
 * Replace the labels assigned to a message.
 * @param {number} id - Message ID.
 * @param {number[]} labelIds - Complete new set of label IDs.
 * @returns {Promise<object>} API response envelope.
 */
export const updateMessageLabels = (id, labelIds) =>
  client.post(`/messages/${id}/labels`, { label_ids: labelIds }).then(r => r.data);

/**
 * Send an outgoing email via the SMTP account specified in the payload.
 * @param {object} data - Message payload including account_id, to, cc, bcc, subject, body_html, attachment_ids, in_reply_to.
 * @returns {Promise<object>} API response envelope.
 */
export const sendMessage = (data) =>
  client.post('/messages/send', data).then(r => r.data);

/**
 * Poll for new messages received after a given ISO timestamp.
 * Used by {@link module:hooks/usePolling} to drive browser notifications.
 * @param {string} since - ISO 8601 datetime string marking the lower bound.
 * @returns {Promise<{new_messages: object[]}>}
 */
export const pollNewMessages = (since) =>
  client.get('/messages/poll', { params: { since } }).then(r => r.data.data);

/**
 * Upload a file attachment and return the server-assigned attachment record.
 * Reports upload progress via an optional callback.
 * @param {File} file - Browser File object to upload.
 * @param {function(number): void} [onProgress] - Called with 0–100 percentage during upload.
 * @returns {Promise<{id: number, filename: string, size: number, mime_type: string}>}
 */
export const uploadAttachment = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
  }).then(r => r.data.data);
};

/**
 * Build the URL to download or inline-preview an attachment.
 * Returns a path relative to the document root — no auth header is needed
 * because the server validates the session cookie for attachment requests.
 * @param {number} id - Attachment ID.
 * @param {boolean} [inline=false] - When true, adds ?inline=1 for browser-native rendering.
 * @returns {string} URL string.
 */
export const getAttachmentUrl = (id, inline = false) =>
  `/api/attachments/${id}${inline ? '?inline=1' : ''}`;
