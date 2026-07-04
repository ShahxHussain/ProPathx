import { request } from '../client.js';

export const reviewerAPI = {
  /**
   * Get dashboard statistics for Reviewer
   * @returns {Promise<Object>} Dashboard stats with charts data
   */
  getDashboardStats: async () => {
    return request('/api/reviewers/dashboard/stats', {
      method: 'GET',
    });
  },

  /**
   * Get questions for review
   * @param {string} status - Filter by status: pending, approved, rejected
   * @param {number} limit - Number of questions to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} List of questions
   */
  getQuestions: async (status = 'pending', limit = 50, offset = 0) => {
    return request(`/api/reviewers/questions?status=${status}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
    });
  },

  /**
   * Get question details with options
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} Question details with options and creator info
   */
  getQuestionDetails: async (questionId) => {
    return request(`/api/reviewers/questions/${questionId}`, {
      method: 'GET',
    });
  },

  /**
   * Approve a question
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} Success message
   */
  approveQuestion: async (questionId) => {
    return request(`/api/reviewers/questions/${questionId}/approve`, {
      method: 'POST',
    });
  },

  /**
   * Reject a question
   * @param {string} questionId - Question ID
   * @param {string} comments - Rejection comments
   * @returns {Promise<Object>} Success message
   */
  rejectQuestion: async (questionId, comments) => {
    return request(`/api/reviewers/questions/${questionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  },

  /**
   * Get Subject Expert performance metrics
   * @returns {Promise<Object>} List of experts with performance data
   */
  getExpertsPerformance: async () => {
    return request('/api/reviewers/experts/performance', {
      method: 'GET',
    });
  },
};

/**
 * Notification APIs
 */
