import { request } from '../client.js';

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
