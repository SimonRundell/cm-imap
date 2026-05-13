/**
 * @module api/attachments
 * @fileoverview Attachment download and upload operations.
 */
import client from './client';

/**
 * Download an attachment by fetching it as a binary blob through the
 * authenticated axios client, then triggering a browser save-as dialog.
 * Using axios instead of a plain anchor ensures the Bearer token is sent.
 * @param {number} id       - Attachment ID.
 * @param {string} filename - Suggested save-as filename.
 * @returns {Promise<void>}
 */
export async function downloadAttachment(id, filename) {
  const response = await client.get(`/attachments/${id}`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Upload a file as a pending attachment (for use in compose).
 * @param {File} file - The File object to upload.
 * @returns {Promise<{id: number, filename: string, mime_type: string, size: number}>}
 */
export const uploadAttachment = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return client.post('/attachments', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data.data);
};
