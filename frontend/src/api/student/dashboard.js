import { request } from '../client.js';

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

/**
 * Organization Settings (OrgAdmin)
 */
