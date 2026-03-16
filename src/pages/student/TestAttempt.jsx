import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, AlertCircle, Clock, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './TestAttempt.css';

const TestAttempt = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attemptData, setAttemptData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    if (!testId) return;
    startAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const startAttempt = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await studentDashboardAPI.startAttempt(testId);
      setAttemptData(response);
      setAnswers({});
      setCurrentIndex(0);
      setSubmitResult(null);
    } catch (err) {
      console.error('Failed to start attempt:', err);
      setError(err.message || err.details || 'Failed to start test attempt');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (questionId, optionId, isMulti) => {
    setAnswers((prev) => {
      const existing = prev[questionId] || [];
      if (isMulti) {
        if (existing.includes(optionId)) {
          return { ...prev, [questionId]: existing.filter((id) => id !== optionId) };
        }
        return { ...prev, [questionId]: [...existing, optionId] };
      } else {
        return { ...prev, [questionId]: [optionId] };
      }
    });
  };

  const handleSubmit = async () => {
    if (!attemptData?.attempt) return;
    if (!window.confirm('Are you sure you want to submit this test? You will not be able to change your answers.')) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const payloadAnswers = (attemptData.questions || []).map((q) => ({
        questionId: q.questionId,
        selectedOptionIds: answers[q.questionId] || [],
      }));

      const result = await studentDashboardAPI.submitAttempt(
        attemptData.test.testId,
        attemptData.attempt.attemptId,
        payloadAnswers
      );

      setSubmitResult(result);
    } catch (err) {
      console.error('Failed to submit attempt:', err);
      setError(err.message || err.details || 'Failed to submit test');
    } finally {
      setSubmitting(false);
    }
  };

  const goPrev = () => {
    setCurrentIndex((idx) => Math.max(0, idx - 1));
  };

  const goNext = () => {
    const total = attemptData?.questions?.length || 0;
    setCurrentIndex((idx) => Math.min(total - 1, idx + 1));
  };

  if (loading) {
    return (
      <div className="test-attempt-page">
        <div className="test-attempt-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
        <div className="loading-state">
          <Clock className="loading-icon" size={32} />
          <p>Preparing your test...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-attempt-page">
        <div className="test-attempt-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
        <div className="notice error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!attemptData) {
    return null;
  }

  const { test, questions } = attemptData;
  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions[currentIndex] || null;
  const currentAnswers = currentQuestion ? answers[currentQuestion.questionId] || [] : [];
  const isMulti = currentQuestion?.questionType === 'Multiple Correct';

  return (
    <div className="test-attempt-page">
      <div className="test-attempt-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="test-summary">
          <div className="test-title">
            <FileText size={20} />
            <div>
              <h1>{test.testName}</h1>
              {test.description && <p className="muted">{test.description}</p>}
            </div>
          </div>
          <div className="test-meta">
            {test.durationMinutes && (
              <div className="meta-item">
                <Clock size={16} />
                <span>{test.durationMinutes} minutes</span>
              </div>
            )}
            {test.totalQuestions && (
              <div className="meta-item">
                <span>{test.totalQuestions} questions</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {submitResult && (
        <div className="notice success">
          <CheckCircle size={18} />
          <span>
            Test submitted. Score: {submitResult.score}/{submitResult.totalMarks}{' '}
            {submitResult.percentage != null ? `(${submitResult.percentage}%)` : ''}
          </span>
        </div>
      )}

      {currentQuestion && (
        <div className="question-card">
          <div className="question-header">
            <span className="question-number">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            {currentQuestion.marks != null && (
              <span className="question-marks">{currentQuestion.marks} mark(s)</span>
            )}
          </div>
          <div className="question-text">{currentQuestion.questionText}</div>

          <div className="options-list">
            {currentQuestion.options.map((opt) => {
              const checked = currentAnswers.includes(opt.optionId);
              return (
                <label key={opt.optionId} className="option-row">
                  <input
                    type={isMulti ? 'checkbox' : 'radio'}
                    name={isMulti ? `q-${currentQuestion.questionId}-${opt.optionId}` : `q-${currentQuestion.questionId}`}
                    checked={checked}
                    onChange={() =>
                      handleOptionChange(currentQuestion.questionId, opt.optionId, isMulti)
                    }
                  />
                  <span className="option-label">
                    {String.fromCharCode(64 + (opt.optionNumber || 0) || 65)}. {opt.optionText}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="test-attempt-footer">
        <div className="nav-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            <ArrowLeft size={16} />
            <span>Previous</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={goNext}
            disabled={currentIndex >= totalQuestions - 1}
          >
            <span>Next</span>
            <ArrowRight size={16} />
          </button>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={submitting || !!submitResult}
        >
          {submitting ? 'Submitting...' : submitResult ? 'Submitted' : 'Submit Test'}
        </button>
      </div>
    </div>
  );
};

export default TestAttempt;

