import { request } from '../client.js';

export const orgSettingsAPI = {
  getSettings: async () => request('/api/org/settings', { method: 'GET' }),

  updateEnrollment: async (payload) =>
    request('/api/org/settings/enrollment', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updateAccount: async (payload) =>
    request('/api/org/settings/account', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updatePassword: async (payload) =>
    request('/api/org/settings/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updateSubscriptionAutoRenew: async (autoRenew) =>
    request('/api/org/settings/subscription/auto-renew', {
      method: 'PATCH',
      body: JSON.stringify({ autoRenew }),
    }),
};
