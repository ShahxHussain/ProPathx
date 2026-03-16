import { useEffect, useState, Fragment } from 'react';
import {
  FileText,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Building2,
  User,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Questions.css';

const AdminQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const loadQuestions = async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = {
        page,
        limit: 25,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchTerm || undefined,
      };
      const response = await adminAPI.getQuestions(params);
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
  }, [sourceFilter, statusFilter, searchTerm]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

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
    const config = {
      approved: { icon: CheckCircle, label: 'Approved', className: 'status-approved' },
      pending: { icon: Clock, label: 'Pending', className: 'status-pending' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'status-rejected' },
    };
    const { icon: Icon, label, className } = config[status] || config.pending;
    return (
      <span className={`status-badge ${className}`}>
        <Icon size={14} />
        <span>{label}</span>
      </span>
    );
  };

  const getSourceBadge = (q) => {
    if (q.sourceType === 'platform') {
      return (
        <span className="source-badge source-platform">
          <User size={14} />
          <span>Platform</span>
        </span>
      );
    }
    return (
      <span className="source-badge source-org" title={q.createdByOrgName}>
        <Building2 size={14} />
        <span>{q.createdByOrgName || 'Organization'}</span>
      </span>
    );
  };

  const getCreatorDisplay = (q) => {
    if (q.sourceType === 'platform') {
      return (
        <span className="creator-cell">
          <span className="creator-name">{q.createdByName || '—'}</span>
          {q.createdByEmail && <span className="creator-email">{q.createdByEmail}</span>}
        </span>
      );
    }
    if (q.sourceType === 'organization') {
      const orgName = q.createdByOrgName || '—';
      const userName = q.createdByOrgUserName ?? q.createdByName;
      const userEmail = q.createdByOrgUserEmail ?? q.createdByEmail;
      return (
        <span className="creator-cell creator-org-cell">
          <span className="creator-org-name">{orgName}</span>
          <span className="creator-org-user">
            {(userName || userEmail) ? (
              <>
                {userName || '—'}
                {userEmail && <span className="creator-email"> · {userEmail}</span>}
              </>
            ) : (
              <span className="creator-not-recorded">Creator not recorded</span>
            )}
          </span>
        </span>
      );
    }
    return '—';
  };

  return (
    <div className="questions-admin-page">
      <div className="page-header">
        <div>
          <h1>Question Bank</h1>
          <p className="page-subtitle">
            View all questions (platform and organization) with status and creator details
          </p>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="filters-row">
        <form className="search-box" onSubmit={handleSearch}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search question text..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
        <div className="filter-group">
          <select
            className="filter-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">All sources</option>
            <option value="platform">Platform only</option>
            <option value="organization">Organizations only</option>
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <FileText size={32} className="loading-icon" />
          <p>Loading questions...</p>
        </div>
      ) : (
        <>
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-label">Total (this page)</span>
              <span className="stat-value">{questions.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total in result</span>
              <span className="stat-value">{pagination.total}</span>
            </div>
          </div>

          <div className="questions-table-container">
            <table className="questions-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Source</th>
                  <th>Created by</th>
                  <th>Exam / Subject / Topic</th>
                  <th>Difficulty</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="th-expand"></th>
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
                        <td>{getSourceBadge(q)}</td>
                        <td className="cell-creator">{getCreatorDisplay(q)}</td>
                        <td className="cell-context">
                          <span className="context-exam">{q.examName}</span>
                          <span className="context-subject">{q.subjectName}</span>
                          <span className="context-topic">{q.topicName}</span>
                        </td>
                        <td><span className="difficulty-badge">{q.difficultyLevel || '—'}</span></td>
                        <td><span className="type-badge">{q.questionType || '—'}</span></td>
                        <td>{getStatusBadge(q.status)}</td>
                        <td className="cell-date">{formatDate(q.createdAt)}</td>
                        <td className="cell-expand">
                          <button
                            type="button"
                            className="expand-btn"
                            onClick={() => setExpandedId(expandedId === q.questionId ? null : q.questionId)}
                            aria-label={expandedId === q.questionId ? 'Collapse' : 'Expand'}
                          >
                            {expandedId === q.questionId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
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
                                  {q.sourceType === 'organization' && (
                                    <>
                                      {q.createdByOrgName && <span className="detail-org-name">{q.createdByOrgName}</span>}
                                      {((q.createdByOrgUserName ?? q.createdByName) || (q.createdByOrgUserEmail ?? q.createdByEmail)) ? (
                                        <span> — <span className="detail-org-user">
                                          {(q.createdByOrgUserName ?? q.createdByName) || '—'}
                                          {(q.createdByOrgUserEmail ?? q.createdByEmail) && ` (${q.createdByOrgUserEmail ?? q.createdByEmail})`}
                                        </span></span>
                                      ) : q.createdByOrgName ? (
                                        <span className="creator-not-recorded"> — Creator not recorded</span>
                                      ) : null}
                                  </>
                                  )}
                                  {q.sourceType === 'platform' && (
                                    <span>{q.createdByName || '—'}{q.createdByEmail && ` (${q.createdByEmail})`}</span>
                                  )}
                                  {!q.sourceType && '—'}
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

          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminQuestions;
