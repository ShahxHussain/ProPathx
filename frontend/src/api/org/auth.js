import { request } from '../client.js';

export const orgAuth = {
  /**
   * Sign up a new organization
   * @param {Object} signupData - Organization signup data
   * @returns {Promise<Object>} Response with organization and admin info
   */
  signup: async (signupData) => {
    return request('/api/org/auth/signup', {
      method: 'POST',
      body: JSON.stringify(signupData),
    });
  },

  /**
   * Login organization user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Response with token and user info
   */
  login: async (email, password) => {
    const response = await request('/api/org/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    console.log('API login response:', response);

    // Store token
    if (response.token) {
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      console.log('Token and user stored in localStorage');
      console.log('Stored user:', response.user);
    } else {
      console.error('No token in response');
    }

    return response;
  },

  /**
   * Logout current user
   */
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  /**
   * Get current user from localStorage
   * @returns {Object|null} User object or null
   */
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated: () => {
    return !!localStorage.getItem('authToken');
  },

  /**
   * Whether the current org user must set a password before using the portal
   * @returns {boolean}
   */
  mustChangePassword: () => {
    const user = orgAuth.getCurrentUser();
    if (user?.mustChangePassword) return true;

    const token = localStorage.getItem('authToken');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Boolean(payload.mustChangePassword);
    } catch {
      return false;
    }
  },

  /**
   * Set password on first login (admin-provisioned accounts)
   * @param {string} newPassword
   * @param {string} confirmPassword
   */
  completeFirstPassword: async (newPassword, confirmPassword) => {
    const response = await request('/api/org/auth/first-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword, confirmPassword }),
    });

    if (response.token) {
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  },
};

/** Merge profile fields into stored session user (all portals share authToken + user). */
