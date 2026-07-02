import { useEffect, useState, Fragment } from 'react';
import {
  FileText,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Filter,
  Calendar,
  BookOpen,
  X,
} from 'lucide-react';
import { orgDashboard } from '../../../services/api';
import './QuestionBank.css';

const QuestionBank = () => {
  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exams, setExams] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    orgDashboard.getSubscriptionExams().then((res) => setExams(res.exams || [])).catch(() => setExams([]));
  }, []);

  const loadQuestions = async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = {
        page,
        limit: 25,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchTerm || undefined,
        examId: examFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const response = await orgDashboard.getQuestions(params);
      setQuestions(response.questions || []);
      setPagination(response.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError(err.message || 'Failed to load questions');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchTerm, examFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      loadQuestions(newPage);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const getStatusBadge = (status) => {
    const normalized = status === 'approved' ? 'verified' : status;
    const config = {
      draft: { icon: FileText, label: 'Draft', className: 'status-draft' },
      verified: { icon: CheckCircle, label: 'Verified', className: 'status-approved' },
      approved: { icon: CheckCircle, label: 'Verified', className: 'status-approved' },
      pending: { icon: Clock, label: 'Pending', className: 'status-pending' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'status-rejected' },
    };
    const { icon: Icon, label, className } = config[normalized] || config.pending;
    return (
      <span className={`status-badge ${className}`}>
        <Icon size={14} />
        <span>{label}</span>
      </span>
    );
  };

  const handleDeleteClick = (q) => {
    setDeleteConfirm(q);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      await orgDashboard.deleteQuestion(deleteConfirm.questionId);
      setDeleteConfirm(null);
      setSuccessMessage('Question deleted successfully.');
      await loadQuestions(pagination.page);
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getCreatorDisplay = (q) => {
    const userName = q.createdByOrgUserName;
    const userEmail = q.createdByOrgUserEmail;
    if (userName || userEmail) {
      return (
        <span className="creator-cell">
          <span className="creator-name">{userName || '—'}</span>
          {userEmail && <span className="creator-email">{userEmail}</span>}
        </span>
      );
    }
    return <span className="creator-not-recorded">Creator not recorded</span>;
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setExamFilter('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchTerm || examFilter || dateFrom || dateTo || statusFilter !== 'all';

  return (
    <div className="org-question-bank-page">
      <div className="qb-header">
        <div className="qb-header-inner">
          <div className="qb-header-icon">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="qb-title">Question Bank</h1>
            <p className="qb-subtitle">Your organization&apos;s questions created by Subject Experts</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="qb-notice qb-notice-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="qb-notice qb-notice-success">
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      <div className="qb-filters-card">
        <div className="qb-filters-head">
          <Filter size={18} />
          <span>Filters</span>
          {hasActiveFilters && (
            <button type="button" className="qb-clear-filters" onClick={clearFilters}>
              <X size={14} />
              Clear all
            </button>
          )}
        </div>
        <div className="qb-filters-grid">
          <form className="qb-search-wrap" onSubmit={handleSearch}>
            <Search size={18} className="qb-search-icon" />
            <input
              type="text"
              placeholder="Search question text..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="qb-search-input"
              aria-label="Search questions"
            />
          </form>
          <div className="qb-filter-field">
            <label className="qb-filter-label">Status</label>
            <select
              className="qb-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="qb-filter-field">
            <label className="qb-filter-label">Exam</label>
            <select
              className="qb-select"
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              aria-label="Filter by exam"
            >
              <option value="">All exams</option>
              {exams.map((exam) => (
                <option key={exam.ExamID || exam.examId} value={exam.ExamID || exam.examId}>
                  {exam.ExamName || exam.examName || '—'}
                </option>
              ))}
            </select>
          </div>
          <div className="qb-filter-field qb-date-range">
            <label className="qb-filter-label">
              <Calendar size={14} />
              Date range
            </label>
            <div className="qb-date-inputs">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="qb-date-input"
                aria-label="From date"
              />
              <span className="qb-date-sep">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="qb-date-input"
                aria-label="To date"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="qb-loading">
          <FileText size={40} className="qb-loading-icon" />
          <p>Loading questions...</p>
        </div>
      ) : (
        <>
          <div className="qb-stats">
            <div className="qb-stat">
              <span className="qb-stat-label">This page</span>
              <span className="qb-stat-value">{questions.length}</span>
            </div>
            <div className="qb-stat">
              <span className="qb-stat-label">Total</span>
              <span className="qb-stat-value">{pagination.total}</span>
            </div>
          </div>

          <div className="qb-table-card">
            <div className="qb-table-scroll">
            <table className="qb-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Created by</th>
                  <th>Exam / Subject / Chapter / Topic</th>
                  <th>Difficulty</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-cell">
                      No questions found. Adjust filters or search.
                    </td>
                  </tr>
                ) : (
                  questions.map((q) => (
                    <Fragment key={q.questionId}>
                      <tr className={expandedId === q.questionId ? 'row-expanded' : ''}>
                        <td className="cell-question">
                          <span className="question-snippet" title={q.questionText}>
                            {q.questionTextSnippet || '—'}
                          </span>
                        </td>
                        <td className="cell-creator">{getCreatorDisplay(q)}</td>
                        <td className="cell-context">
                          <span className="context-exam">{q.examName}</span>
                          <span className="context-subject">{q.subjectName}</span>
                          <span className="context-chapter">{q.chapterName || '—'}</span>
                          <span className="context-topic">{q.topicName}</span>
                        </td>
                        <td><span className="difficulty-badge">{q.difficultyLevel || '—'}</span></td>
                        <td><span className="type-badge">{q.questionType || '—'}</span></td>
                        <td>{getStatusBadge(q.status)}</td>
                        <td className="cell-date">{formatDate(q.createdAt)}</td>
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="expand-btn"
                            onClick={() => setExpandedId(expandedId === q.questionId ? null : q.questionId)}
                            aria-label={expandedId === q.questionId ? 'Collapse' : 'Expand'}
                            title={expandedId === q.questionId ? 'Collapse' : 'Expand details'}
                          >
                            {expandedId === q.questionId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          <button
                            type="button"
                            className="delete-btn"
                            onClick={() => handleDeleteClick(q)}
                            aria-label="Delete question"
                            title="Delete question"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                      {expandedId === q.questionId && (
                        <tr key={`${q.questionId}-detail`} className="detail-row">
                          <td colSpan={9} className="detail-cell">
                            <div className="detail-content">
                              <div className="detail-section">
                                <strong>Created by</strong>
                                <p>
                                  {(q.createdByOrgUserName || q.createdByOrgUserEmail) ? (
                                    <span>{q.createdByOrgUserName || '—'}{q.createdByOrgUserEmail && ` (${q.createdByOrgUserEmail})`}</span>
                                  ) : (
                                    <span className="creator-not-recorded">Creator not recorded</span>
                                  )}
                                </p>
                              </div>
                              <div className="detail-section">
                                <strong>Full question text</strong>
                                <p className="detail-question-text">{q.questionText || '—'}</p>
                              </div>
                              {q.explanation && (
                                <div className="detail-section">
                                  <strong>Explanation</strong>
                                  <p>{q.explanation}</p>
                                </div>
                              )}
                              {q.verifiedBy && (
                                <div className="detail-section">
                                  <strong>Verified by</strong>
                                  <p>{q.verifiedBy.fullName} {q.verifiedBy.email && `(${q.verifiedBy.email})`} — {formatDate(q.verifiedAt)}</p>
                                </div>
                              )}
                              {q.reviewerComments && (
                                <div className="detail-section reviewer-comments">
                                  <strong>Reviewer comments (rejection)</strong>
                                  <p>{q.reviewerComments}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>

          {pagination.totalPages > 1 && (
            <div className="qb-pagination">
              <button
                type="button"
                className="qb-pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Previous
              </button>
              <span className="qb-pagination-info">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                type="button"
                className="qb-pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}

          {deleteConfirm && (
            <div className="qb-modal-overlay" onClick={() => !deleteLoading && setDeleteConfirm(null)}>
              <div className="qb-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Delete question?</h3>
                <p>
                  This will permanently delete the question. This action cannot be undone.
                  {deleteConfirm.questionText && (
                    <span className="qb-modal-snippet"> &quot;{(deleteConfirm.questionText || '').slice(0, 60)}...&quot;</span>
                  )}
                </p>
                <p className="qb-modal-warning">Questions that are used in tests cannot be deleted. Remove them from tests first.</p>
                <div className="qb-modal-actions">
                  <button
                    type="button"
                    className="qb-btn-cancel"
                    onClick={() => !deleteLoading && setDeleteConfirm(null)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="qb-btn-delete"
                    onClick={handleDeleteConfirm}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default QuestionBank;
