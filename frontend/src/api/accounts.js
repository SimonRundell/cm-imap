import client from './client';

export const getAccounts = () =>
  client.get('/accounts').then(r => r.data.data);

export const createAccount = (data) =>
  client.post('/accounts', data).then(r => r.data.data);

export const updateAccount = (id, data) =>
  client.put(`/accounts/${id}`, data).then(r => r.data);

export const deleteAccount = (id) =>
  client.delete(`/accounts/${id}`).then(r => r.data);

export const syncAccount = (id) =>
  client.post(`/accounts/${id}/sync`).then(r => r.data.data);

export const testAccount = (id, type = 'imap') =>
  client.post(`/accounts/${id}/test`, { type }).then(r => r.data);
