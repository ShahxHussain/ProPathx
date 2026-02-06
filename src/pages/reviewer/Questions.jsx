import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Eye, Clock, FileCheck, MessageSquare } from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import './Questions.css';

const Questions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, approved, rejected
  const [error, setError] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadQuestions();
  }, [filter]);

  // Auto-dismiss messages
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

  const handleViewDetails = async (questionId) => {
    try {
      const response = await reviewerAPI.getQuestionDetails(questionId);
      setSelectedQuestion(response);
    } catch (err) {
      console.error('Failed to load question details:', err);
      setError(err.message || 'Failed to load question details');
    }
  };

  const handleApprove = async (questionId) => {
    try {
      setError('');
      await reviewerAPI.approveQuestion(questionId);
      setSuccess('Question approved successfully!');
      setSelectedQuestion(null);
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
      await reviewerAPI.rejectQuestion(selectedQuestion.question.QuestionID, rejectComments);
      setSuccess('Question rejected successfully!');
      setShowRejectModal(false);
      setRejectComments('');
      setSelectedQuestion(null);
      loadQuestions();
    } catch (err) {
      console.error('Failed to reject question:', err);
      setError(err.message || 'Failed to reject question');
    }
  };

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'pending') return !q.IsVerified && !q.ReviewerComments;
    if (filter === 'approved') return q.IsVerified;
    if (filter === 'rejected') return q.ReviewerComments && !q.IsVerified;
    return true;
  });

  return (
    <div className="questions-page">
      <div className="page-header">
        <h1>Question Review</h1>
        <p className="page-subtitle">Review and approve questions submitted by Subject Experts</p>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="notice success" style={{ marginBottom: '24px' }}>
          {success}
        </div>
      )}

      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          <Clock size={18} />
          <span>Pending</span>
        </button>
        <button
          className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => setFilter('approved')}
        >
          <CheckCircle size={18} />
          <span>Approved</span>
        </button>
        <button
          className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          <XCircle size={18} />
          <span>Rejected</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Loading questions...</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="empty-state">
          <FileCheck size={48} />
          <h3>No {filter} questions</h3>
          <p>There are no {filter} questions to display</p>
        </div>
      ) : (
        <div className="questions-list">
          {filteredQuestions.map((question) => (
            <QuestionCard
              key={question.QuestionID}
              question={question}
              onViewDetails={handleViewDetails}
              onApprove={handleApprove}
              onReject={() => {
                handleViewDetails(question.QuestionID);
                setShowRejectModal(true);
              }}
            />
          ))}
        </div>
      )}

      {selectedQuestion && (
        <QuestionDetailsModal
          questionData={selectedQuestion}
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

const QuestionCard = ({ question, onViewDetails, onApprove, onReject }) => {
  const getDifficultyColor = (difficulty) => {
    const colors = {
      Easy: '#22c55e',
      Medium: '#f59e0b',
      Hard: '#ef4444',
    };
    return colors[difficulty] || '#6b7280';
  };

  return (
    <div className="question-card">
      <div className="question-header">
        <div className="question-info">
          <h3 className="question-text">{question.QuestionText}</h3>
          <div className="question-meta">
            <span
              className="badge badge-difficulty"
              style={{ borderColor: getDifficultyColor(question.DifficultyLevel) }}
            >
              {question.DifficultyLevel}
            </span>
            {question.ExamName && (
              <span className="badge badge-subject">{question.ExamName}</span>
            )}
            {question.SubjectName && (
              <span className="badge badge-subject">{question.SubjectName}</span>
            )}
            {question.TopicName && (
              <span className="badge badge-subject">{question.TopicName}</span>
            )}
            <span className="question-date">
              {new Date(question.CreatedAt).toLocaleDateString()}
            </span>
          </div>
          {question.ReviewerComments && (
            <div className="reviewer-comments-preview">
              <MessageSquare size={14} />
              <span>{question.ReviewerComments.substring(0, 60)}...</span>
            </div>
          )}
        </div>
        <div className="question-actions">
          <button className="btn-icon" onClick={() => onViewDetails(question.QuestionID)}>
            <Eye size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

const QuestionDetailsModal = ({ questionData, onClose, onApprove, onReject, showRejectButton }) => {
  const { question, options, creator } = questionData;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content question-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Question Details</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="detail-section">
            <h4>Question</h4>
            <p>{question.QuestionText}</p>
          </div>

          {question.Explanation && (
            <div className="detail-section">
              <h4>Explanation</h4>
              <p>{question.Explanation}</p>
            </div>
          )}

          <div className="detail-section">
            <h4>Question Details</h4>
            <div className="detail-grid">
              <div>
                <strong>Type:</strong> {question.QuestionType}
              </div>
              <div>
                <strong>Difficulty:</strong> {question.DifficultyLevel}
              </div>
              {question.ExamName && (
                <div>
                  <strong>Exam:</strong> {question.ExamName}
                </div>
              )}
              {question.SubjectName && (
                <div>
                  <strong>Subject:</strong> {question.SubjectName}
                </div>
              )}
              {question.TopicName && (
                <div>
                  <strong>Topic:</strong> {question.TopicName}
                </div>
              )}
            </div>
          </div>

          {creator && (
            <div className="detail-section">
              <h4>Created By</h4>
              <p>
                {creator.name} ({creator.email}) - {creator.type}
              </p>
            </div>
          )}

          <div className="detail-section">
            <h4>Answer Options</h4>
            <div className="options-list">
              {options.map((option, index) => (
                <div
                  key={option.OptionID}
                  className={`option-item ${option.IsCorrect ? 'correct' : ''}`}
                >
                  <span className="option-number">{index + 1}.</span>
                  <span className="option-text">{option.OptionText}</span>
                  {option.IsCorrect && (
                    <span className="option-badge">Correct</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {question.ReviewerComments && (
            <div className="detail-section">
              <h4>Rejection Comments</h4>
              <div className="rejection-comments">{question.ReviewerComments}</div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {showRejectButton && (
            <>
              <button className="btn-approve" onClick={() => onApprove(question.QuestionID)}>
                <CheckCircle size={18} />
                <span>Approve</span>
              </button>
              <button className="btn-reject" onClick={onReject}>
                <XCircle size={18} />
                <span>Reject</span>
              </button>
            </>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const RejectModal = ({ onClose, onConfirm, comments, onCommentsChange }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content reject-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reject Question</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p>Please provide comments explaining why this question is being rejected:</p>
          <textarea
            className="reject-comments-input"
            value={comments}
            onChange={(e) => onCommentsChange(e.target.value)}
            placeholder="Enter rejection comments..."
            rows={5}
          />
        </div>

        <div className="modal-footer">
          <button className="btn-reject" onClick={onConfirm} disabled={!comments.trim()}>
            <XCircle size={18} />
            <span>Confirm Rejection</span>
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default Questions;
