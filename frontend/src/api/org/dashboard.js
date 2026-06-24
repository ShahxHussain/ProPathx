import { request } from '../client.js';

export const orgDashboard = {
  /**
   * Get dashboard statistics
   * @returns {Promise<Object>} Dashboard stats
   */
  getDashboardStats: async () => {
    return request('/api/org/auth/dashboard/stats', {
      method: 'GET',
    });
  },

  /**
   * Explore all exams (read-only view for OrgAdmin)
   * @returns {Promise<Object>} List of all exams
   */
  exploreExams: async () => {
    return request('/api/org/auth/exams/explore', {
      method: 'GET',
    });
  },

  /**
   * Get exams included in this organization's active subscription(s) only (OrgAdmin).
   * Pass subscriptionId to limit to one availed subscription's plan (test wizard).
   * @param {{ subscriptionId?: string }} [params]
   * @returns {Promise<Object>} { exams: Array }
   */
  getSubscriptionExams: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.subscriptionId) searchParams.set('subscriptionId', params.subscriptionId);
    const queryString = searchParams.toString();
    return request(`/api/org/auth/exams/subscription${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get exam details with subjects and topics (OrgAdmin only)
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} { exam, subjects }
   */
  getExamDetails: async (examId) => {
    return request(`/api/org/auth/exams/${examId}`, {
      method: 'GET',
    });
  },

  /**
   * Get organization logs with filtering (OrgAdmin only)
   * @param {Object} filters - Filter options
   * @param {string} filters.startDate - Start date (ISO string)
   * @param {string} filters.endDate - End date (ISO string)
   * @param {string} filters.actorType - Filter by actor type
   * @param {string} filters.actionType - Filter by action type
   * @param {string} filters.entityType - Filter by entity type
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Items per page
   * @returns {Promise<Object>} Logs with pagination
   */
  getLogs: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.actorType) params.append('actorType', filters.actorType);
    if (filters.actionType) params.append('actionType', filters.actionType);
    if (filters.entityType) params.append('entityType', filters.entityType);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    return request(`/api/org/auth/logs${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get all available subscription plans with exam details (OrgAdmin only)
   * @returns {Promise<Object>} List of subscription plans with linked exams
   */
  getSubscriptionPlans: async () => {
    return request('/api/org/auth/subscription-plans', {
      method: 'GET',
    });
  },

  /**
   * Create a new subscription for the organization
   * @param {Object} subscriptionData - Subscription data (planId, autoRenew)
   * @returns {Promise<Object>} Created subscription info
   */
  createSubscription: async (subscriptionData) => {
    return request('/api/org/auth/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscriptionData),
    });
  },

  /**
   * Get all subscriptions for the organization
   * @returns {Promise<Object>} List of subscriptions
   */
  getSubscriptions: async () => {
    return request('/api/org/auth/subscriptions', {
      method: 'GET',
    });
  },

  /**
   * Cancel/Unsubscribe from a subscription (OrgAdmin only)
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Success message
   */
  cancelSubscription: async (subscriptionId) => {
    return request(`/api/org/auth/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get this organization's question bank (OrgAdmin only)
   * @param {Object} params - status, page, limit, search, examId, dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD)
   * @returns {Promise<Object>} Questions list and pagination
   */
  getQuestions: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.append('status', params.status);
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.search) searchParams.append('search', params.search);
    if (params.examId) searchParams.append('examId', params.examId);
    if (params.dateFrom) searchParams.append('dateFrom', params.dateFrom);
    if (params.dateTo) searchParams.append('dateTo', params.dateTo);
    const queryString = searchParams.toString();
    return request(`/api/org/auth/questions${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Delete an organization question (OrgAdmin only). Fails if question is used in any test.
   * @param {string} questionId - Question UUID
   * @returns {Promise<Object>} Success message
   */
  deleteQuestion: async (questionId) => {
    return request(`/api/org/auth/questions/${questionId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Tests API (OrgAdmin)
 */
