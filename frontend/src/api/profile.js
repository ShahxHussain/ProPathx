import { request } from './client.js';

export function syncStoredUser(profile) {
  if (!profile) return;
  const userStr = localStorage.getItem('user');
  if (!userStr) return;
  try {
    const prev = JSON.parse(userStr);
    localStorage.setItem(
      'user',
      JSON.stringify({
        ...prev,
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        profileImageUrl: profile.profileImageUrl,
        role: profile.role,
        orgName: profile.orgName ?? prev.orgName,
        orgId: profile.orgId ?? prev.orgId,
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Self-service profile (all authenticated user types)
 */
export const profileAPI = {
  getProfile: async () => request('/api/profile', { method: 'GET' }),

  updateProfile: async (data) =>
    request('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  changePassword: async (currentPassword, newPassword) =>
    request('/api/profile/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

/**
 * User Management APIs (OrgAdmin only)
 */
