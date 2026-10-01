/** Account calls: sign up, sign in, and the email-code password reset. */

import { request } from './api';

export function register({ name, email, password }) {
  return request('/auth/register', { method: 'POST', auth: false, body: { name, email, password } });
}

export function login({ email, password }) {
  return request('/auth/login', { method: 'POST', auth: false, body: { email, password } });
}

export function fetchMe() {
  return request('/auth/me');
}

export function forgotPassword(email) {
  return request('/auth/forgot', { method: 'POST', auth: false, body: { email } });
}

export function verifyResetCode(email, code) {
  return request('/auth/verify-code', { method: 'POST', auth: false, body: { email, code } });
}

export function resetPassword(resetToken, newPassword) {
  return request('/auth/reset-password', { method: 'POST', auth: false, body: { resetToken, newPassword } });
}

export function changePassword(currentPassword, newPassword) {
  return request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
}
