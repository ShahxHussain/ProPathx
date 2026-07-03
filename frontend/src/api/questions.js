import { request } from './client.js';

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

  downloadBulkTemplate: async () => {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('authToken');
    const res = await fetch(`${API_BASE_URL}/api/questions/bulk/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to download template');
    }
    return res.blob();
  },

  parseBulkCsv: async ({ csv, context }) => {
    return request('/api/questions/bulk/parse', {
      method: 'POST',
      body: JSON.stringify({ csv, context }),
    });
  },

  commitBulkQuestions: async ({ rows, status, context }) => {
    return request('/api/questions/bulk/commit', {
      method: 'POST',
      body: JSON.stringify({ rows, status, context }),
    });
  },
};

/**
 * Reviewers API
 */
