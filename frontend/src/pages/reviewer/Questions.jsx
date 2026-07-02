import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  FileCheck,
  MessageSquare,
  Search,
  Filter,
  X,
  Loader2,
  Zap,
} from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import LaTeXRenderer from '../../components/LaTeXRenderer';
import QuestionViewModal from './QuestionViewModal';
import './Questions.css';

const STATUS_TABS = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'verified', label: 'Verified', icon: CheckCircle },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

const VALID_STATUS_FILTERS = ['pending', 'verified', 'approved', 'rejected'];

const normalizeStatusFilter = (status) => (status === 'approved' ? 'verified' : status);

const Questions = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const initialFilter = VALID_STATUS_FILTERS.includes(statusFromUrl)
    ? normalizeStatusFilter(statusFromUrl)
    : 'pending';
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [error, setError] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [examFilter, setExamFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const detailCache = useRef(new Map());

  useEffect(() => {
    const status = searchParams.get('status');
    const normalized = normalizeStatusFilter(status);
    if (status && VALID_STATUS_FILTERS.includes(status) && normalized !== filter) {
      setFilter(normalized);
    }
  }, [searchParams, filter]);

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
        loadQuestions();
      }, 4000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await reviewerAPI.getQuestions(filter);
      setQuestions(response.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const enrichQuestionDetails = async (question, baseData) => {
    const cached = detailCache.current.get(question.QuestionID);
    if (cached) {
      setSelectedQuestion({ ...baseData, ...cached });
      return;
    }

    if (baseData.options?.length > 0 && baseData.creator) {
      detailCache.current.set(question.QuestionID, {
        options: baseData.options,
        creator: baseData.creator,
      });
      return;
    }

    setDetailLoading(true);
    try {
      const response = await reviewerAPI.getQuestionDetails(question.QuestionID);
      const enriched = {
        question: { ...question, ...response.question },
        options: response.options || baseData.options || [],
        creator: response.creator || null,
      };
      detailCache.current.set(question.QuestionID, {
        options: enriched.options,
        creator: enriched.creator,
      });
      setSelectedQuestion(enriched);
    } catch (err) {
      console.error('Failed to load question details:', err);
      if (!baseData.options?.length) {
        setError(err.message || 'Failed to load question details');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewDetails = (question) => {
    const baseData = {
      question,
      options: question.options || [],
      creator: null,
    };
    setSelectedQuestion(baseData);
    enrichQuestionDetails(question, baseData);
  };

  const handleApprove = async (questionId) => {
    try {
      setError('');
      await reviewerAPI.approveQuestion(questionId);
      setSuccess('Question verified successfully!');
      setSelectedQuestion(null);
      detailCache.current.delete(questionId);
      loadQuestions();
    } catch (err) {
      console.error('Failed to approve question:', err);
      setError(err.message || 'Failed to approve question');
    }
  };

  const handleReject = async () => {
    if (!rejectComments.trim()) {
      setError('Please provide rejection comments');
      return;
    }

    try {
      setError('');
      const questionId = selectedQuestion.question.QuestionID;
      await reviewerAPI.rejectQuestion(questionId, rejectComments);
      setSuccess('Question rejected successfully!');
      setShowRejectModal(false);
      setRejectComments('');
      setSelectedQuestion(null);
      detailCache.current.delete(questionId);
      loadQuestions();
    } catch (err) {
      console.error('Failed to reject question:', err);
      setError(err.message || 'Failed to reject question');
    }
  };

  const filterOptions = useMemo(() => {
    const exams = new Set();
    const subjects = new Set();
    const types = new Set();

    questions.forEach((q) => {
      if (q.ExamName) exams.add(q.ExamName);
      if (q.SubjectName) subjects.add(q.SubjectName);
      if (q.QuestionType) types.add(q.QuestionType);
    });

    return {
      exams: [...exams].sort(),
      subjects: [...subjects].sort(),
      types: [...types].sort(),
    };
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return questions.filter((q) => {
      if (difficultyFilter !== 'all' && q.DifficultyLevel !== difficultyFilter) return false;
      if (typeFilter !== 'all' && q.QuestionType !== typeFilter) return false;
      if (examFilter !== 'all' && q.ExamName !== examFilter) return false;
      if (subjectFilter !== 'all' && q.SubjectName !== subjectFilter) return false;
      if (!query) return true;

      const haystack = [
        q.QuestionText,
        q.Explanation,
        q.ExamName,
        q.SubjectName,
        q.TopicName,
        q.ChapterName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [questions, searchQuery, difficultyFilter, typeFilter, examFilter, subjectFilter]);

  const hasActiveFilters =
    searchQuery.trim() ||
    difficultyFilter !== 'all' ||
    typeFilter !== 'all' ||
    examFilter !== 'all' ||
    subjectFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setDifficultyFilter('all');
    setTypeFilter('all');
    setExamFilter('all');
    setSubjectFilter('all');
  };

  const handleStatusChange = (status) => {
    setFilter(status);
    setSearchParams(status === 'pending' ? {} : { status }, { replace: true });
  };

  const statusCounts = useMemo(
    () => ({
      showing: filteredQuestions.length,
      total: questions.length,
    }),
    [questions, filteredQuestions]
  );

  return (
    <div className="questions-page reviewer-questions-page">
      <div className="review-hero">
        <div>
          <p className="review-hero__kicker">Reviewer workspace</p>
          <h1>Question Review</h1>
          <p className="review-hero__subtitle">
            Browse and review questions — filter by pending, verified, or rejected status.
          </p>
        </div>
        <div className="review-hero__stats">
          <button
            type="button"
            className="review-focus-launch"
            onClick={() => navigate('/reviewer/focus')}
          >
            <Zap size={18} />
            Focus Review
          </button>
          <div className="review-stat">
            <span className="review-stat__value">{statusCounts.showing}</span>
            <span className="review-stat__label">Showing</span>
          </div>
          <div className="review-stat">
            <span className="review-stat__value">{statusCounts.total}</span>
            <span className="review-stat__label">In tab</span>
          </div>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <div className="filter-tabs">
        {STATUS_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`filter-tab filter-tab--${id} ${filter === id ? 'active' : ''}`}
            onClick={() => handleStatusChange(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="review-toolbar">
        <div className="review-search">
          <Search size={18} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search questions"
          />
        </div>

        <div className="review-filters">
          <Filter size={16} />
          <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="Filter by difficulty">
            <option value="all">Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
            <option value="all">Type</option>
            {filterOptions.types.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)} aria-label="Filter by exam">
            <option value="all">Exam</option>
            {filterOptions.exams.map((exam) => (
              <option key={exam} value={exam}>{exam}</option>
            ))}
          </select>
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label="Filter by subject">
            <option value="all">Subject</option>
            {filterOptions.subjects.map((subject) => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button type="button" className="review-clear-filters" onClick={clearFilters}>
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <Loader2 size={28} className="spin" />
          <span>Loading questions…</span>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="empty-state">
          <FileCheck size={48} />
          <h3>No questions found</h3>
          <p>
            {hasActiveFilters
              ? 'Try adjusting your filters or search terms.'
              : `There are no ${filter} questions to display.`}
          </p>
          {hasActiveFilters && (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="questions-list">
          {filteredQuestions.map((question) => (
            <QuestionCard
              key={question.QuestionID}
              question={question}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      )}

      {selectedQuestion && (
        <QuestionViewModal
          questionData={selectedQuestion}
          loadingDetail={detailLoading}
          onClose={() => setSelectedQuestion(null)}
          onApprove={handleApprove}
          onReject={() => setShowRejectModal(true)}
          showRejectButton={filter === 'pending'}
        />
      )}

      {showRejectModal && selectedQuestion && (
        <RejectModal
          onClose={() => {
            setShowRejectModal(false);
            setRejectComments('');
          }}
          onConfirm={handleReject}
          comments={rejectComments}
          onCommentsChange={setRejectComments}
        />
      )}
    </div>
  );
};

const QuestionCard = ({ question, onViewDetails }) => (
  <article
    className="question-card question-card--clickable"
    onClick={() => onViewDetails(question)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onViewDetails(question);
      }
    }}
    role="button"
    tabIndex={0}
  >
    <div className="question-header">
      <div className="question-info">
        <h3 className="question-text question-text--preview">
          <LaTeXRenderer text={question.QuestionText} />
        </h3>
        <div className="question-meta">
          {question.DifficultyLevel && (
            <span className={`review-badge review-badge--${question.DifficultyLevel.toLowerCase()}`}>
              {question.DifficultyLevel}
            </span>
          )}
          {question.QuestionType && (
            <span className="review-badge review-badge--type">{question.QuestionType}</span>
          )}
          {question.ExamName && <span className="review-badge">{question.ExamName}</span>}
          {question.SubjectName && <span className="review-badge">{question.SubjectName}</span>}
          {question.TopicName && <span className="review-badge">{question.TopicName}</span>}
          {(question.ChapterNumber != null || question.ChapterName) && (
            <span className="review-badge">
              Ch. {[question.ChapterNumber, question.ChapterName].filter(Boolean).join(': ')}
            </span>
          )}
          <span className="question-date">
            {new Date(question.CreatedAt).toLocaleDateString()}
          </span>
        </div>
        {question.ReviewerComments && (
          <div className="reviewer-comments-preview">
            <MessageSquare size={14} />
            <span>{question.ReviewerComments.substring(0, 80)}…</span>
          </div>
        )}
      </div>
      <div className="question-actions">
        <button
          type="button"
          className="btn-icon btn-icon--view"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(question);
          }}
          title="Open full preview"
          aria-label="Open full preview"
        >
          <Eye size={18} />
        </button>
      </div>
    </div>
  </article>
);

const RejectModal = ({ onClose, onConfirm, comments, onCommentsChange }) =>
  createPortal(
    <div className="modal-overlay reject-modal-overlay" onClick={onClose}>
      <div className="modal-content reject-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reject Question</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p>Please provide comments explaining why this question is being rejected:</p>
          <textarea
            className="reject-comments-input"
            value={comments}
            onChange={(e) => onCommentsChange(e.target.value)}
            placeholder="Enter rejection comments..."
            rows={5}
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-reject" onClick={onConfirm} disabled={!comments.trim()}>
            <XCircle size={18} />
            <span>Confirm Rejection</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

export default Questions;
