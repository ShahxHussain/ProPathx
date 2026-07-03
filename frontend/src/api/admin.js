import { request } from './client.js';

export const adminAPI = {
  /**
   * Get dashboard statistics
   * @returns {Promise<Object>} Dashboard stats
   */
  getDashboardStats: async (revenueDays = '7') => {
    const q = new URLSearchParams();
    if (revenueDays != null && revenueDays !== '') q.set('revenueDays', String(revenueDays));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return request(`/api/admin/dashboard/stats${suffix}`, {
      method: 'GET',
    });
  },

  getRevenueStats: async (days = '30') => {
    return request(`/api/admin/revenue/stats?days=${encodeURIComponent(days)}`, {
      method: 'GET',
    });
  },

  /**
   * Get system health (status, uptime, series for charts). SuperAdmin only.
   * @returns {Promise<Object>} { status, api, apiLatency, db, dbLatency, uptime, series }
   */
  getHealth: async () => {
    return request('/api/admin/health', {
      method: 'GET',
    });
  },

  /**
   * Get all organizations with details
   * @returns {Promise<Object>} Organizations list
   */
  getOrganizations: async () => {
    return request('/api/admin/organizations', {
      method: 'GET',
    });
  },

  /**
   * Get all users (platform + organization users) with details
   * @returns {Promise<Object>} Users list
   */
  getUsers: async () => {
    return request('/api/admin/users', {
      method: 'GET',
    });
  },

  /**
   * Create a platform-level user (Reviewer or Subject Expert)
   * @param {Object} userData - User creation data
   * @returns {Promise<Object>} Created user info
   */
  createPlatformUser: async (userData) => {
    return request('/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Update a platform-level user
   * @param {string} userId - User ID
   * @param {Object} userData - User update data
   * @returns {Promise<Object>} Updated user info
   */
  updatePlatformUser: async (userId, userData) => {
    return request(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete a platform-level user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Success message
   */
  deletePlatformUser: async (userId) => {
    return request(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update an organization user
   * @param {string} orgUserId - Organization User ID
   * @param {Object} userData - User update data
   * @returns {Promise<Object>} Updated user info
   */
  updateOrgUser: async (orgUserId, userData) => {
    return request(`/api/admin/users/org/${orgUserId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Delete an organization user
   * @param {string} orgUserId - Organization User ID
   * @returns {Promise<Object>} Success message
   */
  deleteOrgUser: async (orgUserId) => {
    return request(`/api/admin/users/org/${orgUserId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update an organization
   * @param {string} orgId - Organization ID
   * @param {Object} orgData - Organization update data
   * @returns {Promise<Object>} Updated organization info
   */
  updateOrganization: async (orgId, orgData) => {
    return request(`/api/admin/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(orgData),
    });
  },

  /**
   * Create a new organization with OrgAdmin user (SuperAdmin only)
   * @param {Object} orgData - Organization creation data
   * @returns {Promise<Object>} Created organization and admin info
   */
  createOrganization: async (orgData) => {
    return request('/api/admin/organizations/create', {
      method: 'POST',
      body: JSON.stringify(orgData),
    });
  },

  /**
   * Delete an organization
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Success message
   */
  deleteOrganization: async (orgId) => {
    return request(`/api/admin/organizations/${orgId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get all exams (SuperAdmin only)
   * @returns {Promise<Object>} List of exams
   */
  getExams: async () => {
    return request('/api/admin/exams', {
      method: 'GET',
    });
  },

  /**
   * Get exam details with subjects and topics (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} Exam with subjects and topics
   */
  getExamDetails: async (examId) => {
    return request(`/api/admin/exams/${examId}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new exam (SuperAdmin only)
   * @param {Object} examData - Exam creation data
   * @returns {Promise<Object>} Created exam info
   */
  createExam: async (examData) => {
    return request('/api/admin/exams', {
      method: 'POST',
      body: JSON.stringify(examData),
    });
  },

  /**
   * Update an exam (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {Object} examData - Exam update data
   * @returns {Promise<Object>} Updated exam info
   */
  updateExam: async (examId, examData) => {
    return request(`/api/admin/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify(examData),
    });
  },

  /**
   * Delete an exam (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} Success message
   */
  deleteExam: async (examId) => {
    return request(`/api/admin/exams/${examId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create a subject for an exam (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {Object} subjectData - Subject creation data
   * @returns {Promise<Object>} Created subject info
   */
  createSubject: async (examId, subjectData) => {
    return request(`/api/admin/exams/${examId}/subjects`, {
      method: 'POST',
      body: JSON.stringify(subjectData),
    });
  },

  /**
   * Update a subject (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {Object} subjectData - Subject update data
   * @returns {Promise<Object>} Updated subject info
   */
  updateSubject: async (examId, subjectId, subjectData) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}`, {
      method: 'PUT',
      body: JSON.stringify(subjectData),
    });
  },

  /**
   * Delete a subject (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @returns {Promise<Object>} Success message
   */
  deleteSubject: async (examId, subjectId) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create a topic for a subject (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {Object} topicData - Topic creation data
   * @returns {Promise<Object>} Created topic info
   */
  createTopic: async (examId, subjectId, topicData) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/topics`, {
      method: 'POST',
      body: JSON.stringify(topicData),
    });
  },

  /**
   * Update a topic (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {string} topicId - Topic ID
   * @param {Object} topicData - Topic update data
   * @returns {Promise<Object>} Updated topic info
   */
  updateTopic: async (examId, subjectId, topicId, topicData) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify(topicData),
    });
  },

  /**
   * Delete a topic (SuperAdmin only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {string} topicId - Topic ID
   * @returns {Promise<Object>} Success message
   */
  deleteTopic: async (examId, subjectId, topicId) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/topics/${topicId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Chapters (per subject) - SuperAdmin only
   */
  getChapters: async (examId, subjectId) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/chapters`);
  },
  createChapter: async (examId, subjectId, data) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateChapter: async (examId, subjectId, chapterId, data) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteChapter: async (examId, subjectId, chapterId) => {
    return request(`/api/admin/exams/${examId}/subjects/${subjectId}/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get system logs with filtering (SuperAdmin only)
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
    return request(`/api/admin/logs${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get log statistics (SuperAdmin only)
   * @param {Object} filters - Filter options
   * @param {string} filters.startDate - Start date (ISO string)
   * @param {string} filters.endDate - End date (ISO string)
   * @returns {Promise<Object>} Log statistics
   */
  getLogStats: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const queryString = params.toString();
    return request(`/api/admin/logs/stats${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get all questions for SuperAdmin (platform + org) with details
   * @param {Object} params - source (all|platform|organization), status (all|approved|pending|rejected), page, limit, search
   * @returns {Promise<Object>} Questions list and pagination
   */
  getQuestions: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.source) searchParams.append('source', params.source);
    if (params.status) searchParams.append('status', params.status);
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.search) searchParams.append('search', params.search);
    const queryString = searchParams.toString();
    return request(`/api/admin/questions${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * ============================================
   * SUBSCRIPTION PLANS MANAGEMENT
   * ============================================
   */

  /**
   * Get all subscription plans (SuperAdmin only)
   * @returns {Promise<Object>} Subscription plans list
   */
  getSubscriptionPlans: async () => {
    return request('/api/admin/subscription-plans', {
      method: 'GET',
    });
  },

  /**
   * Get subscription plan details with linked exams (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} Plan details with linked exams
   */
  getSubscriptionPlan: async (planId) => {
    return request(`/api/admin/subscription-plans/${planId}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new subscription plan (SuperAdmin only)
   * @param {Object} planData - Plan creation data
   * @param {string} planData.planName - Plan name
   * @param {number} planData.price - Plan price
   * @param {number} planData.durationMonths - Duration in months
   * @param {Object} planData.features - Additional features (JSON)
   * @returns {Promise<Object>} Created plan info
   */
  createSubscriptionPlan: async (planData) => {
    return request('/api/admin/subscription-plans', {
      method: 'POST',
      body: JSON.stringify(planData),
    });
  },

  /**
   * Update a subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @param {Object} planData - Plan update data
   * @returns {Promise<Object>} Updated plan info
   */
  updateSubscriptionPlan: async (planId, planData) => {
    return request(`/api/admin/subscription-plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify(planData),
    });
  },

  /**
   * Delete a subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} Success message
   */
  deleteSubscriptionPlan: async (planId) => {
    return request(`/api/admin/subscription-plans/${planId}`, {
      method: 'DELETE',
    });
  },

  /**
   * ============================================
   * PLATFORM SETTINGS (SuperAdmin)
   * ============================================
   */

  /**
   * Get maintenance settings (SuperAdmin only)
   */
  getMaintenanceSettings: async () => {
    return request('/api/admin/settings/maintenance', {
      method: 'GET',
    });
  },

  /**
   * Update maintenance settings (SuperAdmin only)
   * @param {Object} settings
   */
  updateMaintenanceSettings: async (settings) => {
    return request('/api/admin/settings/maintenance', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  /**
   * Get all announcements (SuperAdmin only)
   */
  getAnnouncements: async () => {
    return request('/api/admin/settings/announcements', {
      method: 'GET',
    });
  },

  /**
   * Create announcement (SuperAdmin only)
   */
  createAnnouncement: async (announcement) => {
    return request('/api/admin/settings/announcements', {
      method: 'POST',
      body: JSON.stringify(announcement),
    });
  },

  /**
   * Update announcement (SuperAdmin only)
   */
  updateAnnouncement: async (id, announcement) => {
    return request(`/api/admin/settings/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(announcement),
    });
  },

  /**
   * Delete announcement (SuperAdmin only)
   */
  deleteAnnouncement: async (id) => {
    return request(`/api/admin/settings/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Public maintenance settings (no auth) – used to redirect users to maintenance page on login.
   */
  getPublicMaintenanceSettings: async () => {
    return request('/api/org/auth/maintenance-public', {
      method: 'GET',
    });
  },

  /**
   * Public active announcements for a role (no auth required).
   */
  getActiveAnnouncements: async (role) => {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    return request(`/api/org/auth/announcements/active${query}`, {
      method: 'GET',
    });
  },

  /**
   * ============================================
   * SUBSCRIPTION PLAN EXAMS MANAGEMENT
   * ============================================
   */

  /**
   * Get all exams linked to a subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} Linked exams list
   */
  getPlanExams: async (planId) => {
    return request(`/api/admin/subscription-plans/${planId}/exams`, {
      method: 'GET',
    });
  },

  /**
   * Link an exam to a subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @param {Object} linkData - Link configuration data
   * @param {string} linkData.examId - Exam ID
   * @param {boolean} linkData.isMandatory - Whether exam is mandatory
   * @param {number} linkData.maxStudents - Max students limit
   * @param {number} linkData.maxTests - Max tests limit
   * @param {number} linkData.maxQuestionsPerTest - Max questions per test
   * @param {number} linkData.maxTestsPerDay - Max tests per day
   * @param {boolean} linkData.aiSupport - Whether AI support is enabled
   * @param {Object} linkData.extraConfig - Extra configuration (JSON)
   * @returns {Promise<Object>} Created link info
   */
  linkExamToPlan: async (planId, linkData) => {
    return request(`/api/admin/subscription-plans/${planId}/exams`, {
      method: 'POST',
      body: JSON.stringify(linkData),
    });
  },

  /**
   * Update exam limits in subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @param {string} examId - Exam ID
   * @param {Object} linkData - Link update data
   * @returns {Promise<Object>} Updated link info
   */
  updatePlanExam: async (planId, examId, linkData) => {
    return request(`/api/admin/subscription-plans/${planId}/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify(linkData),
    });
  },

  /**
   * Unlink an exam from subscription plan (SuperAdmin only)
   * @param {string} planId - Plan ID
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} Success message
   */
  unlinkExamFromPlan: async (planId, examId) => {
    return request(`/api/admin/subscription-plans/${planId}/exams/${examId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get all subscriptions with details and usage (SuperAdmin only)
   * @param {Object} params - Query parameters (status, entityType, page, limit)
   * @returns {Promise<Object>} Subscriptions list with usage data
   */
  getSubscriptions: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.append('status', params.status);
    if (params.entityType) searchParams.append('entityType', params.entityType);
    if (params.page) searchParams.append('page', params.page);
    if (params.limit) searchParams.append('limit', params.limit);
    const queryString = searchParams.toString();
    return request(`/api/admin/subscriptions${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },
};

/**
 * Exam Management APIs (OrgAdmin only)
 */
