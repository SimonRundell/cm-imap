import client from './client';

export const getRules = (accountId) =>
  client.get('/rules', { params: { account_id: accountId } }).then(r => r.data.data);

export const createRule = (data) =>
  client.post('/rules', data).then(r => r.data.data);

export const updateRule = (id, data) =>
  client.put(`/rules/${id}`, data).then(r => r.data.data);

export const deleteRule = (id) =>
  client.delete(`/rules/${id}`).then(r => r.data);

export const getLabels = (accountId) =>
  client.get('/labels', { params: { account_id: accountId } }).then(r => r.data.data);

export const createLabel = (data) =>
  client.post('/labels', data).then(r => r.data.data);

export const updateLabel = (id, data) =>
  client.put(`/labels/${id}`, data).then(r => r.data);

export const deleteLabel = (id) =>
  client.delete(`/labels/${id}`).then(r => r.data);

export const getAutoreply = (accountId) =>
  client.get('/autoreplies', { params: { account_id: accountId } }).then(r => r.data.data);

export const upsertAutoreply = (data) =>
  client.post('/autoreplies', data).then(r => r.data.data);
