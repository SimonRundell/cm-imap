import client from './client';

export const getMessages = (params) =>
  client.get('/messages', { params }).then(r => r.data.data);

export const getMessage = (id) =>
  client.get(`/messages/${id}`).then(r => r.data.data);

export const updateMessage = (id, data) =>
  client.put(`/messages/${id}`, data).then(r => r.data);

export const deleteMessage = (id) =>
  client.delete(`/messages/${id}`).then(r => r.data);

export const moveMessage = (id, folderId) =>
  client.post(`/messages/${id}/move`, { folder_id: folderId }).then(r => r.data);

export const updateMessageLabels = (id, labelIds) =>
  client.post(`/messages/${id}/labels`, { label_ids: labelIds }).then(r => r.data);

export const sendMessage = (data) =>
  client.post('/messages/send', data).then(r => r.data);

export const pollNewMessages = (since) =>
  client.get('/messages/poll', { params: { since } }).then(r => r.data.data);

export const uploadAttachment = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
  }).then(r => r.data.data);
};

export const getAttachmentUrl = (id, inline = false) =>
  `/api/attachments/${id}${inline ? '?inline=1' : ''}`;
