import { useEffect, useState } from 'react';
import { CheckCircle, FileCheck, Eye } from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import './Questions.css';

const Approved = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  // Auto-dismiss error messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await reviewerAPI.getQuestions('approved');
      setQuestions(response.questions || []);
    } catch (err) {
      console.error('Failed to load approved questions:', err);
      setError(err.message || 'Failed to load approved questions');
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

  const getDifficultyColor = (difficulty) => {
    const colors = {
      Easy: '#22c55e',
      Medium: '#f59e0b',
      Hard: '#ef4444',
    };
    return colors[difficulty] || '#6b7280';
  };

  return (
    <div className="questions-page">
      <div className="page-header">
        <h1>Approved Questions</h1>
        <p className="page-subtitle">View all approved questions</p>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading approved questions...</div>
      ) : questions.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={48} />
          <h3>No approved questions</h3>
          <p>Approved questions will appear here</p>
        </div>
      ) : (
        <div className="questions-list">
          {questions.map((question) => (
            <div key={question.QuestionID} className="question-card">
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
                      Approved: {question.VerifiedAt ? new Date(question.VerifiedAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="question-actions">
                  <button
                    className="btn-icon"
                    onClick={() => handleViewDetails(question.QuestionID)}
                  >
                    <Eye size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedQuestion && (
        <QuestionDetailsModal
          questionData={selectedQuestion}
          onClose={() => setSelectedQuestion(null)}
        />
      )}
    </div>
  );
};

const QuestionDetailsModal = ({ questionData, onClose }) => {
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
              {question.VerifiedAt && (
                <div>
                  <strong>Approved:</strong> {new Date(question.VerifiedAt).toLocaleString()}
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
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default Approved;
