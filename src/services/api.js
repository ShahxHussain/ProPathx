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
  getDashboardStats: async () => {
    return request('/api/admin/dashboard/stats', {
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
};

export default { orgAuth, userManagement, orgDashboard, adminAPI, examAPI, questionAPI, reviewerAPI, notificationAPI, testAPI, studentAPI, studentAuth, studentDashboardAPI };

