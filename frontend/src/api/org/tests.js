import { request } from '../client.js';

export const testAPI = {
  /**
   * Create a new test
   * @param {Object} testData - Test creation data
   * @returns {Promise<Object>} Created test info
   */
  createTest: async (testData) => {
    return request('/api/org/tests', {
      method: 'POST',
      body: JSON.stringify(testData),
    });
  },

  /**
   * Get all tests for the organization
   * @param {Object} filters - Filter options (page, limit)
   * @returns {Promise<Object>} List of tests with pagination
   */
  getTests: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    return request(`/api/org/tests${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get test details
   * @param {string} testId - Test ID
   * @returns {Promise<Object>} Test details
   */
  getTestDetails: async (testId) => {
    return request(`/api/org/tests/${testId}`, {
      method: 'GET',
    });
  },

  /**
   * Update test metadata (name, type, duration, totals, schedule, status).
   * @param {string} testId
   * @param {Object} payload - camelCase fields matching backend PUT body
   */
  updateTest: async (testId, payload) => {
    return request(`/api/org/tests/${testId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get question binding config for a test (custom | auto | hybrid, autoPercent for hybrid)
   * @param {string} testId - Test ID
   * @returns {Promise<Object>} { bindingType, autoPercent }
   */
  getBindingConfig: async (testId) => {
    return request(`/api/org/tests/${testId}/binding-config`, { method: 'GET' });
  },

  /**
   * Set question binding config (persisted on Tests.QuestionBindingMode / HybridAutoPercent).
   * @param {string} testId - Test ID
   * @param {Object} config - { bindingType: 'custom'|'auto'|'hybrid', autoPercent?: number }
   * @returns {Promise<Object>} { bindingType, autoPercent }
   */
  setBindingConfig: async (testId, config) => {
    return request(`/api/org/tests/${testId}/binding-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  /**
   * Assign test to a single student
   * @param {string} testId - Test ID
   * @param {string} studentId - Student ID
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignToSingle: async (testId, studentId, dueDate, replaceExisting = false) => {
    return request(`/api/org/tests/${testId}/assign/single`, {
      method: 'POST',
      body: JSON.stringify({ studentId, dueDate, replaceExisting }),
    });
  },

  /**
   * Assign test to multiple students
   * @param {string} testId - Test ID
   * @param {Array<string>} studentIds - Array of student IDs
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignToMultiple: async (testId, studentIds, dueDate, replaceExisting = false) => {
    return request(`/api/org/tests/${testId}/assign/multiple`, {
      method: 'POST',
      body: JSON.stringify({ studentIds, dueDate, replaceExisting }),
    });
  },

  /**
   * Assign test to a group
   * @param {string} testId - Test ID
   * @param {string} groupId - Group ID
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignToGroup: async (testId, groupId, dueDate, replaceExisting = false) => {
    return request(`/api/org/tests/${testId}/assign/group`, {
      method: 'POST',
      body: JSON.stringify({ groupId, dueDate, replaceExisting }),
    });
  },

  /**
   * Assign test to multiple groups
   * @param {string} testId - Test ID
   * @param {Array<string>} groupIds - Array of group IDs
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignToGroups: async (testId, groupIds, dueDate, replaceExisting = false) => {
    return request(`/api/org/tests/${testId}/assign/groups`, {
      method: 'POST',
      body: JSON.stringify({ groupIds, dueDate, replaceExisting }),
    });
  },

  /**
   * Assign test to all students
   * @param {string} testId - Test ID
   * @returns {Promise<Object>} Assignment confirmation
   */
  assignToAll: async (testId, dueDate, replaceExisting = false) => {
    return request(`/api/org/tests/${testId}/assign/all`, {
      method: 'POST',
      body: JSON.stringify({ dueDate, replaceExisting }),
    });
  },

  /**
   * Get all assignments for a test
   * @param {string} testId - Test ID
   * @returns {Promise<Object>} List of assignments
   */
  getAssignments: async (testId) => {
    return request(`/api/org/tests/${testId}/assignments`, {
      method: 'GET',
    });
  },

  getEligibleStudents: async (testId, filters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.limit) params.append('limit', String(filters.limit));
    const qs = params.toString();
    return request(`/api/org/tests/${testId}/eligible-students${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Update test status (enable/disable)
   * @param {string} testId - Test ID
   * @param {string} status - 'Active' or 'Inactive'
   * @returns {Promise<Object>} Updated test
   */
  updateStatus: async (testId, status) => {
    return request(`/api/org/tests/${testId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  /**
   * Get questions available to add to a test (same exam, org, not already in test)
   * @param {string} testId - Test ID
   * @param {Object} params - subjectId, topicId, difficulty, approvedOnly, search, page, limit
   * @returns {Promise<Object>} { questions, currentCount, maxQuestionsPerTest, canAddMore, pagination }
   */
  getAvailableQuestions: async (testId, params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.subjectId) searchParams.append('subjectId', params.subjectId);
    if (params.topicId) searchParams.append('topicId', params.topicId);
    if (params.difficulty) searchParams.append('difficulty', params.difficulty);
    if (params.approvedOnly) searchParams.append('approvedOnly', params.approvedOnly);
    if (params.search) searchParams.append('search', params.search);
    if (params.customOnly) searchParams.append('customOnly', '1');
    if (params.questionType) searchParams.append('questionType', params.questionType);
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    const qs = searchParams.toString();
    return request(`/api/org/tests/${testId}/questions/available${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  /**
   * Add questions to a test
   * @param {string} testId - Test ID
   * @param {string[]} questionIds - Array of question UUIDs
   * @returns {Promise<Object>} { message, added, linkedQuestionCount } — Tests.TotalQuestions stays the configured paper size.
   */
  addQuestionsToTest: async (testId, questionIds) => {
    return request(`/api/org/tests/${testId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ questionIds }),
    });
  },

  /**
   * Remove a question from a test
   * @param {string} testId - Test ID
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} { message, linkedQuestionCount? }
   */
  removeQuestionFromTest: async (testId, questionId) => {
    return request(`/api/org/tests/${testId}/questions/${questionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Bulk add N questions by topic/criteria
   * @param {string} testId - Test ID
   * @param {Object} params - topicId?, subjectId?, difficulty?, approvedOnly?, count
   * @returns {Promise<Object>} { message, added, linkedQuestionCount }
   */
  bulkAddQuestions: async (testId, params) => {
    return request(`/api/org/tests/${testId}/questions/bulk`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Copy questions from another test (same org, same exam)
   * @param {string} testId - Target test ID
   * @param {string} sourceTestId - Source test ID
   * @param {string[]} [questionIds] - Optional subset; if omitted, copy all
   * @returns {Promise<Object>} { message, added, linkedQuestionCount }
   */
  copyQuestionsFromTest: async (testId, sourceTestId, questionIds) => {
    return request(`/api/org/tests/${testId}/questions/copy-from`, {
      method: 'POST',
      body: JSON.stringify({ sourceTestId, questionIds: questionIds || undefined }),
    });
  },

  /**
   * Reorder questions in test
   * @param {string} testId - Test ID
   * @param {string[]} questionIds - Full list of question IDs in desired order
   * @returns {Promise<Object>} { message, questionIds }
   */
  reorderQuestions: async (testId, questionIds) => {
    return request(`/api/org/tests/${testId}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ questionIds }),
    });
  },

  getAnalyticsSummary: async (type = 'all') => {
    return request(`/api/org/tests/analytics/summary?type=${encodeURIComponent(type)}`, { method: 'GET' });
  },

  getAnalyticsTests: async (params = {}) => {
    const sp = new URLSearchParams();
    if (params.type) sp.append('type', params.type);
    if (params.sort) sp.append('sort', params.sort);
    if (params.order) sp.append('order', params.order);
    if (params.page) sp.append('page', String(params.page));
    if (params.limit) sp.append('limit', String(params.limit));
    if (params.search) sp.append('search', params.search);
    const qs = sp.toString();
    return request(`/api/org/tests/analytics/tests${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  getAnalyticsDetail: async (testId) => {
    return request(`/api/org/tests/${testId}/analytics/detail`, { method: 'GET' });
  },

  getAttemptsTrend: async (type = 'all', days = 30) => {
    return request(`/api/org/tests/analytics/attempts-trend?type=${encodeURIComponent(type)}&days=${days}`, { method: 'GET' });
  },

  getScoreDistribution: async (type = 'all') => {
    return request(`/api/org/tests/analytics/score-distribution?type=${encodeURIComponent(type)}`, { method: 'GET' });
  },
};

/**
 * Students API (OrgAdmin)
 */
