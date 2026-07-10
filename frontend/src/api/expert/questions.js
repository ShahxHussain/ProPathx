import { request } from '../client.js';

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

  getContributions: async () => {
    return request('/api/questions/dashboard/contributions', {
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

  downloadBulkTemplate: async ({
    format = 'csv',
    examId,
    subjectId,
    chapterId,
    topicId,
    defaultDifficulty,
    defaultSource,
    defaultQuestionType,
  } = {}) => {
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('authToken');
    const normalized = String(format || 'csv').toLowerCase();
    const params = new URLSearchParams({ format: normalized });
    if (examId) params.set('examId', examId);
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    if (topicId) params.set('topicId', topicId);
    if (defaultDifficulty) params.set('defaultDifficulty', defaultDifficulty);
    if (defaultSource) params.set('defaultSource', defaultSource);
    if (defaultQuestionType) params.set('defaultQuestionType', defaultQuestionType);

    const res = await fetch(`${API_BASE_URL}/api/questions/bulk/template?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const contentType = res.headers.get('Content-Type') || '';

    if (!res.ok) {
      const data = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : { error: await res.text().catch(() => '') };
      throw new Error(data.error || 'Failed to download template');
    }

    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to download template');
    }

    const blob = await res.blob();
    if (!blob?.size) {
      throw new Error('Downloaded file is empty');
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/i);
    const mode = res.headers.get('X-Template-Mode') || null;
    return {
      blob,
      filename: filenameMatch?.[1] || `propath-template.${normalized === 'docx' ? 'docx' : 'csv'}`,
      mode,
    };
  },

  parseBulkUpload: async ({ csv, docxBase64, context }) => {
    return request('/api/questions/bulk/parse', {
      method: 'POST',
      body: JSON.stringify({ csv, docxBase64, context }),
    });
  },

  /** @deprecated Use parseBulkUpload */
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
