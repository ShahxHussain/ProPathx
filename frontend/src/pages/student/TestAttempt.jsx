import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText,
  AlertCircle,
  Clock,
  ArrowLeft,
  ArrowRight,
  List,
  X,
  SkipForward,
} from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './TestAttempt.css';

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format wall-clock for scheduled test end display */
function formatAttemptOrdinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return null;
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function formatExamEnd(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Checkbox vs radio: enum/API may use different casing or spacing than DB `question_type_enum`. */
function isMultipleCorrectQuestion(question) {
  const raw =
    question?.questionType ??
    question?.QuestionType ??
    question?.question_type ??
    '';
  if (raw == null || String(raw).trim() === '') return false;
  const n = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (n === 'multiple correct') return true;
  if (n.includes('single')) return false;
  return n.includes('multiple') && n.includes('correct');
}

/**
 * Open test: countdown = duration from attempt start only.
 * Scheduled test: countdown to earliest of window end, due date, and (optional) duration cap from start.
 */
function resolveTimerConfig({ scheduleMode, attemptStart, durationMinutes, testEndTime, assignmentDue }) {
  if (!attemptStart) return { deadlineMs: null, timerMode: 'none' };
  const startMs = new Date(attemptStart).getTime();
  if (Number.isNaN(startMs)) return { deadlineMs: null, timerMode: 'none' };

  const dur = Number(durationMinutes);
  const durEnd = dur > 0 ? startMs + dur * 60 * 1000 : null;
  const endMs = testEndTime ? new Date(testEndTime).getTime() : NaN;
  const dueMs = assignmentDue ? new Date(assignmentDue).getTime() : NaN;

  const isScheduled = scheduleMode === 'scheduled';

  if (isScheduled) {
    const caps = [];
    if (!Number.isNaN(endMs)) caps.push(endMs);
    if (!Number.isNaN(dueMs)) caps.push(dueMs);
    if (durEnd != null) caps.push(durEnd);
    if (caps.length === 0) {
      return { deadlineMs: null, timerMode: 'scheduled' };
    }
    const deadlineMs = Math.min(...caps);
    return { deadlineMs, timerMode: 'scheduled' };
  }

  if (durEnd != null) {
    return { deadlineMs: durEnd, timerMode: 'open' };
  }
  return { deadlineMs: null, timerMode: 'open' };
}

const TestAttempt = () => {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attemptData, setAttemptData] = useState(null);
  const [answers, setAnswers] = useState({});

  /** Visit order: indices into `questions`. Skip moves current question to end of queue. */
  const [visitOrder, setVisitOrder] = useState([]);
  const [orderPos, setOrderPos] = useState(0);
  const [skippedIds, setSkippedIds] = useState(() => new Set());
  const [navOpen, setNavOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const answersRef = useRef({});
  const autoSubmitTriggeredRef = useRef(false);

  const questions = attemptData?.questions || [];
  const totalQuestions = questions.length;
  const currentIndex = visitOrder.length > 0 ? visitOrder[Math.min(orderPos, visitOrder.length - 1)] : 0;
  const currentQuestion = questions[currentIndex] || null;

  useEffect(() => {
    if (!testId) return;
    startAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  useEffect(() => {
    const qs = attemptData?.questions;
    if (!qs?.length) {
      setVisitOrder([]);
      setOrderPos(0);
      return;
    }
    setVisitOrder(qs.map((_, i) => i));
    setOrderPos(0);
    setSkippedIds(new Set());
  }, [attemptData?.attempt?.attemptId, attemptData?.questions?.length, testId]);

  useEffect(() => {
    autoSubmitTriggeredRef.current = false;
  }, [attemptData?.attempt?.attemptId]);

  answersRef.current = answers;

  const { deadlineMs, timerMode } = useMemo(
    () =>
      resolveTimerConfig({
        scheduleMode: attemptData?.test?.scheduleMode,
        attemptStart: attemptData?.attempt?.startTime,
        durationMinutes: attemptData?.test?.durationMinutes,
        testEndTime: attemptData?.test?.endTime,
        assignmentDue: attemptData?.assignment?.dueDate,
      }),
    [attemptData]
  );

  const isScheduledTimer = timerMode === 'scheduled';
  const testEndDisplay = formatExamEnd(attemptData?.test?.endTime);

  useEffect(() => {
    if (!deadlineMs) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const secondsLeft = useMemo(() => {
    if (!deadlineMs) return null;
    void tick;
    return Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  }, [deadlineMs, tick]);

  const startAttempt = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await studentDashboardAPI.startAttempt(testId);
      setAttemptData(response);
      setAnswers({});
    } catch (err) {
      console.error('Failed to start attempt:', err);
      const detail =
        typeof err?.details === 'string'
          ? err.details
          : err?.details && typeof err.details === 'object' && typeof err.details.message === 'string'
            ? err.details.message
            : '';
      const base = err.message || 'Failed to start test attempt';
      setError(detail && !base.includes(detail) ? `${base}: ${detail}` : base);
    } finally {
      setLoading(false);
    }
  };

  const submitTest = useCallback(
    async (options = { skipConfirm: false }) => {
      if (!attemptData?.attempt || submitting) return false;
      if (!options.skipConfirm) {
        const ok = window.confirm(
          'Submit your test now?\n\nYou can only submit once. After you submit, you cannot change any answers.'
        );
        if (!ok) return false;
      }
      try {
        setSubmitting(true);
        setError('');
        const payloadAnswers = (attemptData.questions || []).map((q) => ({
          questionId: q.questionId,
          selectedOptionIds: answersRef.current[q.questionId] || [],
        }));
        const result = await studentDashboardAPI.submitAttempt(
          attemptData.test.testId,
          attemptData.attempt.attemptId,
          payloadAnswers
        );
        setSubmitting(false);
        const name = attemptData.test.testName ?? attemptData.test.TestName;
        navigate(`/student/test/${testId}/results`, {
          replace: true,
          state: {
            score: result.score,
            totalMarks: result.totalMarks,
            percentage: result.percentage,
            testName: name,
            message: result.message,
          },
        });
        return true;
      } catch (err) {
        console.error('Failed to submit attempt:', err);
        setError(err.message || err.details || 'Failed to submit test');
        autoSubmitTriggeredRef.current = false;
        setSubmitting(false);
        return false;
      }
    },
    [attemptData, submitting, navigate, testId]
  );

  useEffect(() => {
    if (secondsLeft !== 0 || deadlineMs == null) return;
    if (submitting) return;
    if (!attemptData?.attempt) return;
    if (autoSubmitTriggeredRef.current) return;
    autoSubmitTriggeredRef.current = true;
    void submitTest({ skipConfirm: true });
  }, [secondsLeft, deadlineMs, submitting, attemptData, submitTest]);

  const handleOptionChange = (questionId, optionId, isMulti) => {
    setSkippedIds((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
    setAnswers((prev) => {
      const existing = prev[questionId] || [];
      if (isMulti) {
        if (existing.includes(optionId)) {
          return { ...prev, [questionId]: existing.filter((id) => id !== optionId) };
        }
        return { ...prev, [questionId]: [...existing, optionId] };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  };

  const handleSubmit = () => {
    void submitTest({ skipConfirm: false });
  };

  const goPrev = useCallback(() => {
    setOrderPos((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setOrderPos((p) => Math.min(visitOrder.length - 1, p + 1));
  }, [visitOrder.length]);

  const handleSkip = useCallback(() => {
    if (visitOrder.length <= 1) return;
    const pos = Math.min(orderPos, visitOrder.length - 1);
    const qIdx = visitOrder[pos];
    const qid = questions[qIdx]?.questionId;
    if (qid) setSkippedIds((prev) => new Set(prev).add(qid));
    setVisitOrder((order) => {
      const p = Math.min(orderPos, order.length - 1);
      const idx = order[p];
      return [...order.slice(0, p), ...order.slice(p + 1), idx];
    });
  }, [orderPos, questions, visitOrder]);

  const goToQuestionIndex = useCallback(
    (globalIdx) => {
      const pos = visitOrder.indexOf(globalIdx);
      if (pos >= 0) setOrderPos(pos);
      setNavOpen(false);
    },
    [visitOrder]
  );

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.questionId] || []).length > 0).length,
    [questions, answers]
  );

  const skippedUnanswered = useMemo(
    () => questions.filter((q) => skippedIds.has(q.questionId) && (answers[q.questionId] || []).length === 0).length,
    [questions, answers, skippedIds]
  );

  const remainingCount = totalQuestions - answeredCount;

  const progressPct = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  if (loading) {
    return (
      <div className="test-attempt-page">
        <div className="test-attempt-header">
          <button type="button" className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
        <div className="loading-state">
          <Clock className="loading-icon" size={32} />
          <p>Getting your test ready…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-attempt-page">
        <div className="test-attempt-header">
          <button type="button" className="back-btn" onClick={() => navigate(-1)}>
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

  const { test } = attemptData;
  const currentAnswers = currentQuestion ? answers[currentQuestion.questionId] || [] : [];
  const isMulti = isMultipleCorrectQuestion(currentQuestion);
  const timerUrgent = secondsLeft != null && secondsLeft <= 300;

  return (
    <div className="test-attempt-page test-attempt-page--with-nav">
      <button
        type="button"
        className="question-nav-fab"
        aria-label="Jump to a question"
        onClick={() => setNavOpen(true)}
      >
        <List size={20} />
      </button>

      {navOpen && (
        <button
          type="button"
          className="question-nav-backdrop"
          aria-label="Close panel"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="test-attempt-layout">
        <div className="test-attempt-main">
        <div className="test-attempt-header">
          <button type="button" className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="test-summary">
            <div className="test-title">
              <FileText size={20} />
              <div>
                <h1>{test.testName}</h1>
                {attemptData?.attempt?.attemptOrdinal != null && (
                  <p
                    className="test-attempt-ordinal"
                    title="If you are allowed more than one full try, this shows which attempt this is."
                  >
                    {formatAttemptOrdinal(attemptData.attempt.attemptOrdinal)} attempt
                  </p>
                )}
                {test.description && <p className="muted">{test.description}</p>}
              </div>
            </div>
            <div className="test-meta">
              {isScheduledTimer && testEndDisplay && (
                <div className="meta-item test-end-meta" title="You must finish before this time">
                  <span>Closes {testEndDisplay}</span>
                </div>
              )}
              {test.durationMinutes && !deadlineMs && (
                <div className="meta-item">
                  <Clock size={16} />
                  <span>No countdown for this test</span>
                </div>
              )}
              {test.totalQuestions != null && (
                <div className="meta-item">
                  <span>
                    {answeredCount}/{totalQuestions} answered
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="main-progress-track" aria-hidden="true">
          <div className="main-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {deadlineMs != null && secondsLeft != null && (
          <div className={`test-attempt-timer-strip ${timerUrgent ? 'urgent' : ''}`} role="status" aria-live="polite">
            <Clock size={18} aria-hidden />
            <div className="test-attempt-timer-strip-text">
              <span className="test-attempt-timer-strip-label">
                {isScheduledTimer ? 'Time until this test closes' : 'Time remaining'}
              </span>
              <span className="test-attempt-timer-strip-value">{formatCountdown(secondsLeft)}</span>
            </div>
          </div>
        )}

        {isScheduledTimer && testEndDisplay && (
          <div className="notice info">
            <strong>You have until {testEndDisplay}</strong> to finish. When the timer hits zero, we submit what you
            have saved—the same as if you press <strong>Submit answers</strong> yourself.
          </div>
        )}

        {secondsLeft === 0 && deadlineMs && submitting && (
          <div className="notice info">
            <Clock size={18} />
            <span>Time&apos;s up — we&apos;re submitting your answers…</span>
          </div>
        )}

        {secondsLeft === 0 && deadlineMs && !submitting && (
          <div className="notice error soft">
            <AlertCircle size={18} />
            <span>
              Time&apos;s up, but submitting did not finish. If you still see <strong>Submit answers</strong> below,
              tap it once to try again.
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
                const letter = String.fromCharCode(64 + (opt.optionNumber || 1));
                return (
                  <label key={opt.optionId} className="option-row">
                    <input
                      type={isMulti ? 'checkbox' : 'radio'}
                      name={
                        isMulti ? `q-${currentQuestion.questionId}-${opt.optionId}` : `q-${currentQuestion.questionId}`
                      }
                      checked={checked}
                      disabled={submitting}
                      onChange={() =>
                        handleOptionChange(currentQuestion.questionId, opt.optionId, isMulti)
                      }
                    />
                    <span className="option-label">
                      {letter}. {opt.optionText}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="test-attempt-footer">
          <p className="submit-once-hint">
            After you submit, you cannot change your answers or send the test again. When you are happy with your
            choices, use <strong>Submit answers</strong>.
          </p>
          <div className="footer-actions">
            <div className="nav-buttons">
              <button
                type="button"
                className="btn-secondary"
                onClick={goPrev}
                disabled={orderPos === 0 || submitting}
              >
                <ArrowLeft size={16} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="btn-secondary btn-skip"
                onClick={handleSkip}
                disabled={submitting || totalQuestions <= 1}
                title="Come back to this question later"
              >
                <SkipForward size={16} />
                <span>Skip for later</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={goNext}
                disabled={orderPos >= visitOrder.length - 1 || submitting}
              >
                <span>Next</span>
                <ArrowRight size={16} />
              </button>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit answers'}
            </button>
          </div>
        </div>
        </div>

        <aside className={`question-nav-panel ${navOpen ? 'question-nav-panel--open' : ''}`}>
          <div className="question-nav-head">
            <span className="question-nav-title">All questions</span>
            <button type="button" className="question-nav-close" onClick={() => setNavOpen(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {isScheduledTimer && testEndDisplay && (
            <p className="question-nav-end-hint">This test closes at {testEndDisplay}.</p>
          )}

          <div className="question-nav-stats">
            <span>
              <strong>{answeredCount}</strong> answered
            </span>
            <span className="dot">·</span>
            <span>
              <strong>{remainingCount}</strong> left
            </span>
            {skippedUnanswered > 0 && (
              <>
                <span className="dot">·</span>
                <span className="skipped-stat">
                  <strong>{skippedUnanswered}</strong> skipped
                </span>
              </>
            )}
          </div>

          <div
            className="question-nav-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="question-nav-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="question-nav-grid" role="list">
            {questions.map((q, idx) => {
              const answered = (answers[q.questionId] || []).length > 0;
              const skipped = skippedIds.has(q.questionId) && !answered;
              const active = idx === currentIndex;
              return (
                <button
                  key={q.questionId}
                  type="button"
                  role="listitem"
                  className={`question-nav-bubble ${active ? 'active' : ''} ${answered ? 'answered' : ''} ${skipped ? 'skipped' : ''}`}
                  onClick={() => goToQuestionIndex(idx)}
                  title={`Question ${idx + 1}${skipped ? ' (skipped for later)' : ''}${answered ? ' (answered)' : ''}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default TestAttempt;
