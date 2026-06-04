import { request } from '../client.js';

export const userManagement = {
  /**
   * Create a new user (Reviewer or Subject Expert)
   * @param {Object} userData - User creation data
   * @returns {Promise<Object>} Created user info
   */
  createUser: async (userData) => {
    return request('/api/org/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  /**
   * List all users in organization
   * @returns {Promise<Object>} List of users
   */
  listUsers: async () => {
    return request('/api/org/users', {
      method: 'GET',
    });
  },

  /**
   * Update org user (Reviewer / Subject Expert)
   * @param {string} orgUserId
   * @param {Object} userData
   */
  updateUser: async (orgUserId, userData) => {
    return request(`/api/org/users/${orgUserId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete org user (Reviewer / Subject Expert)
   * @param {string} orgUserId
   */
  deleteUser: async (orgUserId) => {
    return request(`/api/org/users/${orgUserId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Organization Dashboard APIs
 */
