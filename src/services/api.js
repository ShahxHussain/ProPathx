const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Make API request with error handling
 */
const request = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Add token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, config);
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || `HTTP error! status: ${response.status}`);
    }

    if (!response.ok) {
      const error = new Error(data.error || `HTTP error! status: ${response.status}`);
      error.status = response.status;
      error.details = data.details || data;
      if (data.code) error.code = data.code;
      // Include all error properties for detailed error display
      if (data.errorCode) error.errorCode = data.errorCode;
      if (data.hint) error.hint = data.hint;
      if (data.errorType) error.errorType = data.errorType;
      if (data.fullError) error.fullError = data.fullError;
      throw error;
    }

    return data;
  } catch (error) {
    // If it's already an Error with status/details, rethrow it
    if (error.status || error.details) {
      throw error;
    }
    // Otherwise wrap it
    const wrappedError = new Error(error.message || 'Network error');
    wrappedError.originalError = error;
    throw wrappedError;
  }
};

/**
 * Organization Authentication APIs
 */
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
};

/**
 * User Management APIs (OrgAdmin only)
 */
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
};

/**
 * Organization Dashboard APIs
 */
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
   * Use for Question Bank filter, test creation, etc.
   * @returns {Promise<Object>} { exams: Array }
   */
  getSubscriptionExams: async () => {
    return request('/api/org/auth/exams/subscription', {
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
};

/**
 * Students API (OrgAdmin)
 */
export const studentAPI = {
  /**
   * Register a single student
   * @param {Object} studentData - Student registration data
   * @returns {Promise<Object>} Created student info
   */
  registerStudent: async (studentData) => {
    return request('/api/org/students', {
      method: 'POST',
      body: JSON.stringify(studentData),
    });
  },

  /**
   * Register multiple students (bulk)
   * @param {Array} students - Array of student objects
   * @returns {Promise<Object>} Registration summary
   */
  registerStudentsBulk: async (students) => {
    return request('/api/org/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
  },

  /**
   * Get all students for the organization
   * @param {Object} filters - Filter options (page, limit, search)
   * @returns {Promise<Object>} List of students with pagination
   */
  getStudents: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);

    const queryString = params.toString();
    return request(`/api/org/students${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
    });
  },

  /**
   * Get student details
   * @param {string} studentId - Student ID
   * @returns {Promise<Object>} Student details
   */
  getStudentDetails: async (studentId) => {
    return request(`/api/org/students/${studentId}`, {
      method: 'GET',
    });
  },

  /**
   * Update student
   * @param {string} studentId - Student ID
   * @param {Object} studentData - Student update data
   * @returns {Promise<Object>} Updated student info
   */
  updateStudent: async (studentId, studentData) => {
    return request(`/api/org/students/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify(studentData),
    });
  },

  /**
   * Delete student
   * @param {string} studentId - Student ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  deleteStudent: async (studentId) => {
    return request(`/api/org/students/${studentId}`, {
      method: 'DELETE',
    });
  },

  getStudentExamEnrollments: async (studentId) => {
    return request(`/api/org/students/${studentId}/exam-enrollments`, { method: 'GET' });
  },

  withdrawStudentExamEnrollment: async (studentId, examId, payload = {}) => {
    return request(`/api/org/students/${studentId}/exam-enrollments/${examId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  activateStudentExamEnrollment: async (studentId, examId) => {
    return request(`/api/org/students/${studentId}/exam-enrollments/${examId}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  rejectStudentExamEnrollment: async (studentId, examId, payload = {}) => {
    return request(`/api/org/students/${studentId}/exam-enrollments/${examId}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  bulkAssignExamEnrollments: async (payload) => {
    return request('/api/org/students/exam-enrollments/bulk-assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getPendingExamEnrollmentRequests: async () => {
    return request('/api/org/students/exam-enrollments/pending-requests', { method: 'GET' });
  },

  getBulkCandidateStudentsForEnrollments: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.search) params.append('search', filters.search);
    if (Array.isArray(filters.examIds) && filters.examIds.length > 0) {
      params.append('examIds', filters.examIds.join(','));
    }
    const qs = params.toString();
    return request(`/api/org/students/exam-enrollments/bulk-students${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },

  getExamEnrollmentDirectory: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.examId) params.append('examId', filters.examId);
    const qs = params.toString();
    return request(`/api/org/students/exam-enrollments/directory${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
};

/**
 * Groups API (OrgAdmin)
 */
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
export const examAPI = {
  /**
   * Get all exams
   * @returns {Promise<Object>} List of exams
   */
  getExams: async () => {
    return request('/api/org/exams', {
      method: 'GET',
    });
  },

  /**
   * Get exam details with subjects and topics
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} Exam with subjects and topics
   */
  getExamDetails: async (examId) => {
    return request(`/api/org/exams/${examId}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new exam
   * @param {Object} examData - Exam creation data
   * @returns {Promise<Object>} Created exam info
   */
  createExam: async (examData) => {
    return request('/api/org/exams', {
      method: 'POST',
      body: JSON.stringify(examData),
    });
  },

  /**
   * Update an exam
   * @param {string} examId - Exam ID
   * @param {Object} examData - Exam update data
   * @returns {Promise<Object>} Updated exam info
   */
  updateExam: async (examId, examData) => {
    return request(`/api/org/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify(examData),
    });
  },

  /**
   * Delete an exam
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} Success message
   */
  deleteExam: async (examId) => {
    return request(`/api/org/exams/${examId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create a subject for an exam
   * @param {string} examId - Exam ID
   * @param {Object} subjectData - Subject creation data
   * @returns {Promise<Object>} Created subject info
   */
  createSubject: async (examId, subjectData) => {
    return request(`/api/org/exams/${examId}/subjects`, {
      method: 'POST',
      body: JSON.stringify(subjectData),
    });
  },

  /**
   * Update a subject
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {Object} subjectData - Subject update data
   * @returns {Promise<Object>} Updated subject info
   */
  updateSubject: async (examId, subjectId, subjectData) => {
    return request(`/api/org/exams/${examId}/subjects/${subjectId}`, {
      method: 'PUT',
      body: JSON.stringify(subjectData),
    });
  },

  /**
   * Delete a subject
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @returns {Promise<Object>} Success message
   */
  deleteSubject: async (examId, subjectId) => {
    return request(`/api/org/exams/${examId}/subjects/${subjectId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Create a topic for a subject
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {Object} topicData - Topic creation data
   * @returns {Promise<Object>} Created topic info
   */
  createTopic: async (examId, subjectId, topicData) => {
    return request(`/api/org/exams/${examId}/subjects/${subjectId}/topics`, {
      method: 'POST',
      body: JSON.stringify(topicData),
    });
  },

  /**
   * Update a topic
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {string} topicId - Topic ID
   * @param {Object} topicData - Topic update data
   * @returns {Promise<Object>} Updated topic info
   */
  updateTopic: async (examId, subjectId, topicId, topicData) => {
    return request(`/api/org/exams/${examId}/subjects/${subjectId}/topics/${topicId}`, {
      method: 'PUT',
      body: JSON.stringify(topicData),
    });
  },

  /**
   * Delete a topic
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {string} topicId - Topic ID
   * @returns {Promise<Object>} Success message
   */
  deleteTopic: async (examId, subjectId, topicId) => {
    return request(`/api/org/exams/${examId}/subjects/${subjectId}/topics/${topicId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Questions API (Subject Expert)
 */
export const questionAPI = {
  /**
   * Get all questions for the logged-in Subject Expert
   * @returns {Promise<Object>} List of questions
   */
  getQuestions: async () => {
    return request('/api/questions', {
      method: 'GET',
    });
  },

  /**
   * Get question details with options
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} Question details with options
   */
  getQuestionDetails: async (questionId) => {
    return request(`/api/questions/${questionId}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new question
   * @param {Object} questionData - Question creation data
   * @returns {Promise<Object>} Created question info
   */
  createQuestion: async (questionData) => {
    return request('/api/questions', {
      method: 'POST',
      body: JSON.stringify(questionData),
    });
  },

  /**
   * Update a question
   * @param {string} questionId - Question ID
   * @param {Object} questionData - Question update data
   * @returns {Promise<Object>} Updated question info
   */
  updateQuestion: async (questionId, questionData) => {
    return request(`/api/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(questionData),
    });
  },

  /**
   * Delete a question
   * @param {string} questionId - Question ID
   * @returns {Promise<Object>} Success message
   */
  deleteQuestion: async (questionId) => {
    return request(`/api/questions/${questionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get list of exams, subjects, and topics for question creation
   * @returns {Promise<Object>} List of exams with subjects and topics
   */
  getExamsList: async () => {
    return request('/api/questions/exams/list', {
      method: 'GET',
    });
  },

  /**
   * Get dashboard statistics for Subject Expert
   * @returns {Promise<Object>} Dashboard stats with charts data
   */
  getDashboardStats: async () => {
    return request('/api/questions/dashboard/stats', {
      method: 'GET',
    });
  },

  /**
   * Get subscription status (Organization Subject Expert only)
   * @returns {Promise<Object>} Subscription status with plan and exam details
   */
  getSubscriptionStatus: async () => {
    return request('/api/questions/subscription/status', {
      method: 'GET',
    });
  },

  /**
   * Create a topic for a subject (Subject Expert only)
   * @param {string} examId - Exam ID
   * @param {string} subjectId - Subject ID
   * @param {Object} topicData - Topic creation data (topicName, description)
   * @returns {Promise<Object>} Created topic info
   */
  createTopic: async (examId, subjectId, topicData) => {
    return request('/api/questions/topics', {
      method: 'POST',
      body: JSON.stringify({
        examId,
        subjectId,
        topicName: topicData.topicName,
        description: topicData.description || null,
        chapterId: topicData.chapterId || null,
      }),
    });
  },
};

/**
 * Reviewers API
 */
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
export const studentDashboardAPI = {
  /**
   * Get student dashboard statistics
   * @returns {Promise<Object>} Dashboard stats
   */
  getDashboardStats: async () => {
    return request('/api/student/dashboard/stats', {
      method: 'GET',
    });
  },

  /**
   * Get all test assignments for the student
   * @returns {Promise<Object>} List of assignments
   */
  getAssignments: async () => {
    return request('/api/student/assignments', {
      method: 'GET',
    });
  },

  /**
   * Get tests currently available for the student to attempt
   * (filtered by assignment + time window + test status)
   */
  getAvailableTests: async () => {
    return request('/api/student/tests', {
      method: 'GET',
    });
  },

  /**
   * Start or resume an attempt for a test
   * @param {string} testId
   */
  startAttempt: async (testId) => {
    return request(`/api/student/tests/${testId}/attempts`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  /**
   * Submit answers for an attempt
   * @param {string} testId
   * @param {string} attemptId
   * @param {Array} answers - [{ questionId, selectedOptionIds: [] }] — ids are Options.OptionID (uuid); legacy option numbers still accepted server-side.
   */
  submitAttempt: async (testId, attemptId, answers) => {
    return request(`/api/student/tests/${testId}/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  },

  /**
   * Full result + analytics for latest completed attempt (StudentAttempts, StudentAnswers, …).
   * @param {string} testId
   */
  getTestResultDetail: async (testId) => {
    return request(`/api/student/tests/${testId}/result-detail`, { method: 'GET' });
  },

  /** Subscription plans visible to students (Audience Student or Both). Individual + org-enrolled students. */
  getSubscriptionPlans: async () => {
    return request('/api/student/subscription-plans', { method: 'GET' });
  },

  getSubscriptions: async () => {
    return request('/api/student/subscriptions', { method: 'GET' });
  },

  createSubscription: async (subscriptionData) => {
    return request('/api/student/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscriptionData),
    });
  },

  cancelSubscription: async (subscriptionId) => {
    return request(`/api/student/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Individual-student self-test builder options (eligible exams + subject pools).
   */
  getIndividualSelfTestOptions: async () => {
    return request('/api/student/individual/self-test/options', { method: 'GET' });
  },

  /**
   * Preview subject-wise distribution for requested self-test.
   * @param {{ examId: string, totalQuestions: number }} payload
   */
  previewIndividualSelfTest: async (payload) => {
    return request('/api/student/individual/self-test/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Create a personal self-test and assignment, ready to attempt.
   * @param {{ examId: string, totalQuestions: number, durationMinutes?: number }} payload
   */
  createIndividualSelfTest: async (payload) => {
    return request('/api/student/individual/self-test/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getExamEnrollments: async () => {
    return request('/api/student/exam-enrollments', { method: 'GET' });
  },

  withdrawExamEnrollment: async (examId, payload = {}) => {
    return request(`/api/student/exam-enrollments/${examId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  activateExamEnrollment: async (examId) => {
    return request(`/api/student/exam-enrollments/${examId}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  requestExamEnrollmentReview: async (examId) => {
    return request(`/api/student/exam-enrollments/${examId}/request`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};

export default { orgAuth, userManagement, orgDashboard, adminAPI, examAPI, questionAPI, reviewerAPI, notificationAPI, testAPI, studentAPI, studentAuth, studentDashboardAPI };

