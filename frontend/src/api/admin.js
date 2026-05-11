import client from './client';

export const getUsers = () =>
  client.get('/admin/users').then(r => r.data.data);

export const createUser = (data) =>
  client.post('/admin/users', data).then(r => r.data.data);

export const updateUser = (id, data) =>
  client.put(`/admin/users/${id}`, data).then(r => r.data);

export const deleteUser = (id) =>
  client.delete(`/admin/users/${id}`).then(r => r.data);

export const getSettings = () =>
  client.get('/admin/settings').then(r => r.data.data);

export const updateSettings = (data) =>
  client.put('/admin/settings', data).then(r => r.data);

export const getSyncStatus = () =>
  client.get('/admin/sync-status').then(r => r.data.data);
