import client from './client';

export const login = (username, password) =>
  client.post('/auth/login', { username, password }).then(r => r.data.data);

export const register = (username, email, password) =>
  client.post('/auth/register', { username, email, password }).then(r => r.data);

export const logout = (refreshToken) =>
  client.post('/auth/logout', { refresh_token: refreshToken });

export const getMe = () =>
  client.get('/auth/me').then(r => r.data.data);

export const refresh = (refreshToken) =>
  client.post('/auth/refresh', { refresh_token: refreshToken }).then(r => r.data.data);
