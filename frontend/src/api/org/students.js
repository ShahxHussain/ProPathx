import { request } from '../client.js';

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
   * @param {Object} [options] - Optional { examIds: string[] } to enroll new students in exams
   * @returns {Promise<Object>} Registration summary
   */
  registerStudentsBulk: async (students, options = {}) => {
    const examIds = Array.isArray(options.examIds) ? options.examIds : [];
    return request('/api/org/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students, examIds }),
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
    if (filters.fromTs) params.append('fromTs', filters.fromTs);
    if (filters.toTs) params.append('toTs', filters.toTs);
    const qs = params.toString();
    return request(`/api/org/students/exam-enrollments/directory${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
};

/**
 * Groups API (OrgAdmin)
 */
