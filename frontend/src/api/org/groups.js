import { request } from '../client.js';

export const groupAPI = {
  /**
   * Get all student groups
   * @param {Object} filters - Filter options (page, limit, search)
   * @returns {Promise<Object>} List of groups with pagination
   */
  getGroups: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);

    const queryString = params.toString();
    return request(`/api/org/groups${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get group details with members
   * @param {string} groupId - Group ID
   * @returns {Promise<Object>} Group details
   */
  getGroupDetails: async (groupId) => {
    return request(`/api/org/groups/${groupId}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new group
   * @param {Object} groupData - Group creation data
   * @returns {Promise<Object>} Created group info
   */
  createGroup: async (groupData) => {
    return request('/api/org/groups', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
  },

  /**
   * Update group
   * @param {string} groupId - Group ID
   * @param {Object} groupData - Group update data
   * @returns {Promise<Object>} Updated group info
   */
  updateGroup: async (groupId, groupData) => {
    return request(`/api/org/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(groupData),
    });
  },

  /**
   * Delete group
   * @param {string} groupId - Group ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  deleteGroup: async (groupId) => {
    return request(`/api/org/groups/${groupId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Add students to group
   * @param {string} groupId - Group ID
   * @param {Array<string>} studentIds - Array of student IDs
   * @returns {Promise<Object>} Addition confirmation
   */
  addMembersToGroup: async (groupId, studentIds) => {
    return request(`/api/org/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ studentIds }),
    });
  },

  /**
   * Remove student from group
   * @param {string} groupId - Group ID
   * @param {string} studentId - Student ID
   * @returns {Promise<Object>} Removal confirmation
   */
  removeMemberFromGroup: async (groupId, studentId) => {
    return request(`/api/org/groups/${groupId}/members/${studentId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Super Admin APIs
 */
