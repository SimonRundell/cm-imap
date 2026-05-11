import client from './client';

export const getFolders = (accountId) =>
  client.get('/folders', { params: { account_id: accountId } }).then(r => r.data.data);

export const getAllFolders = () =>
  client.get('/folders').then(r => r.data.data);

export const syncFolders = (accountId) =>
  client.post('/folders/sync', null, { params: { account_id: accountId } }).then(r => r.data.data);

export const createFolder = (accountId, name) =>
  client.post('/folders', { account_id: accountId, name }).then(r => r.data);

export const updateFolder = (id, data) =>
  client.put(`/folders/${id}`, data).then(r => r.data);
