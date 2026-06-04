import { request } from '../client.js';

export const studentAuth = {
  /**
   * Student self-signup (public). Creates an individual (platform) student with no OrgID.
   * @param {Object} data - { fullName, email, password, phone? }
   */
  signup: async (data) => {
    return request('/api/student/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Student login
   * @param {string} email - Student email
   * @param {string} password - Student password
   * @returns {Promise<Object>} Login response with token and user info
   */
  login: async (email, password) => {
    const response = await request('/api/student/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.token) {
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  },

  /**
   * Get current student info
   * @returns {Promise<Object>} Current student info
   */
  getCurrentUser: async () => {
    return request('/api/student/auth/me', {
      method: 'GET',
    });
  },

  /**
   * Logout student
   */
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  /**
   * Check if student is authenticated
   * @returns {boolean}
   */
  isAuthenticated: () => {
    return !!localStorage.getItem('authToken');
  },

  /**
   * Get current user from localStorage
   * @returns {Object|null}
   */
  getCurrentUserSync: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
};

/**
 * Student Dashboard API (for students themselves)
 */
