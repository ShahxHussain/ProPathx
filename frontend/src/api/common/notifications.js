import { request } from '../client.js';

export const notificationAPI = {
  /**
   * Get all notifications for the logged-in user
   * @returns {Promise<Object>} List of notifications
   */
  getNotifications: async () => {
    return request('/api/notifications', {
      method: 'GET',
    });
  },

  /**
   * Get unread notification count
   * @returns {Promise<Object>} Unread count
   */
  getUnreadCount: async () => {
    return request('/api/notifications/unread-count', {
      method: 'GET',
    });
  },

  /**
   * Mark a notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<Object>} Success message
   */
  markAsRead: async (notificationId) => {
    return request(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  },

  /**
   * Mark all notifications as read
   * @returns {Promise<Object>} Success message
   */
  markAllAsRead: async () => {
    return request('/api/notifications/mark-all-read', {
      method: 'PUT',
    });
  },

  /**
   * Delete a notification
   * @param {string} notificationId - Notification ID
   * @returns {Promise<Object>} Success message
   */
  deleteNotification: async (notificationId) => {
    return request(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create notification (SuperAdmin only)
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification info
   */
  createNotification: async (notificationData) => {
    return request('/api/notifications/admin/create', {
      method: 'POST',
      body: JSON.stringify(notificationData),
    });
  },

  /**
   * Create notification (OrgAdmin only)
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification info
   */
  createOrgNotification: async (notificationData) => {
    return request('/api/notifications/org/create', {
      method: 'POST',
      body: JSON.stringify(notificationData),
    });
  },
};

/**
 * Student Authentication API
 */
