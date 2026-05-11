import client from './client';

export const getSignatures = () =>
  client.get('/signatures').then(r => r.data.data);

export const createSignature = (data) =>
  client.post('/signatures', data).then(r => r.data.data);

export const updateSignature = (id, data) =>
  client.put(`/signatures/${id}`, data).then(r => r.data);

export const deleteSignature = (id) =>
  client.delete(`/signatures/${id}`).then(r => r.data);
