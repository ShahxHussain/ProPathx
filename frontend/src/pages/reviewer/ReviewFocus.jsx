import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  Zap,
  Trophy,
  SkipForward,
  User,
  BookOpen,
  ListChecks,
} from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import LaTeXRenderer from '../../components/LaTeXRenderer';
import './ReviewFocus.css';

const ReviewFocus = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [initialTotal, setInitialTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [creator, setCreator] = useState(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [session, setSession] = useState({ approved: 0, rejected: 0, skipped: 0 });
  const creatorCache = useRef(new Map());

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await reviewerAPI.getQuestions('pending', 100, 0);
      const items = response.questions || [];
      setQueue(items);
      setInitialTotal(items.length);
    } catch (err) {
      setError(err.message || 'Failed to load pending questions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const current = queue[0] ?? null;
  const remaining = queue.length;
  const completedInSession = session.approved + session.rejected + session.skipped;
  const progressPct = initialTotal > 0
    ? Math.round((completedInSession / initialTotal) * 100)
    : 0;

  useEffect(() => {
    if (!current?.QuestionID) {
      setCreator(null);
      return;
    }

    const cached = creatorCache.current.get(current.QuestionID);
    if (cached) {
      setCreator(cached);
      return;
    }

    let cancelled = false;
    setCreatorLoading(true);
    setCreator(null);

    reviewerAPI
      .getQuestionDetails(current.QuestionID)
      .then((res) => {
        if (cancelled) return;
        const info = res.creator || null;
        creatorCache.current.set(current.QuestionID, info);
        setCreator(info);
      })
      .catch(() => {
        if (!cancelled) setCreator(null);
      })
      .finally(() => {
        if (!cancelled) setCreatorLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current?.QuestionID]);

  const advanceQueue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
    setRejectOpen(false);
    setRejectComments('');
  }, []);

  const handleSkip = () => {
    if (!current || actionLoading) return;
    setSession((s) => ({ ...s, skipped: s.skipped + 1 }));
    setQueue((prev) => {
      if (prev.length <= 1) return [];
      return [...prev.slice(1), prev[0]];
    });
    setRejectOpen(false);
    setRejectComments('');
  };

  const handleApprove = async () => {
    if (!current || actionLoading) return;
    try {
      setActionLoading(true);
      setError('');
      await reviewerAPI.approveQuestion(current.QuestionID);
      setSession((s) => ({ ...s, approved: s.approved + 1 }));
      creatorCache.current.delete(current.QuestionID);
      advanceQueue();
    } catch (err) {
      setError(err.message || 'Failed to approve question');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!current || actionLoading) return;
    if (!rejectComments.trim()) {
      setError('Please enter rejection comments');
      return;
    }
    try {
      setActionLoading(true);
      setError('');
      await reviewerAPI.rejectQuestion(current.QuestionID, rejectComments.trim());
      setSession((s) => ({ ...s, rejected: s.rejected + 1 }));
      creatorCache.current.delete(current.QuestionID);
      advanceQueue();
    } catch (err) {
      setError(err.message || 'Failed to reject question');
    } finally {
      setActionLoading(false);
    }
  };

  const options = current?.options || [];

  const metaLine = useMemo(() => {
    if (!current) return '';
    return [
      current.ExamName,
      current.SubjectName,
      current.TopicName,
      current.ChapterNumber != null || current.ChapterName
        ? `Ch. ${[current.ChapterNumber, current.ChapterName].filter(Boolean).join(': ')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [current]);

  if (loading) {
    return (
      <div className="review-focus">
        <div className="review-focus__loading">
          <Loader2 size={36} className="spin" />
          <p>Loading review queue…</p>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="review-focus">
        <div className="review-focus__complete">
          <div className="review-focus__complete-icon">
            <Trophy size={48} />
          </div>
          <h1>Session complete!</h1>
          <p>
            {initialTotal === 0
              ? 'No pending questions right now.'
              : `You reviewed ${completedInSession} question${completedInSession === 1 ? '' : 's'} this session.`}
          </p>
          {completedInSession > 0 && (
            <div className="review-focus__session-summary">
              <span className="review-focus__stat review-focus__stat--ok">
                <CheckCircle size={16} /> {session.approved} approved
              </span>
              <span className="review-focus__stat review-focus__stat--bad">
                <XCircle size={16} /> {session.rejected} rejected
              </span>
              {session.skipped > 0 && (
                <span className="review-focus__stat review-focus__stat--skip">
                  <SkipForward size={16} /> {session.skipped} skipped
                </span>
              )}
            </div>
          )}
          <div className="review-focus__complete-actions">
            <button type="button" className="review-focus__btn review-focus__btn--primary" onClick={loadQueue}>
              Check for new questions
            </button>
            <button
              type="button"
              className="review-focus__btn review-focus__btn--ghost"
              onClick={() => navigate('/reviewer/questions')}
            >
              Back to question list
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-focus">
      <header className="review-focus__top">
        <div className="review-focus__brand">
          <Zap size={20} />
          <span>Focus Review</span>
        </div>

        <div className="review-focus__progress-wrap">
          <div className="review-focus__progress-bar">
            <div className="review-focus__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="review-focus__progress-label">{progressPct}% session progress</span>
        </div>

        <div className="review-focus__top-stats">
          <div className="review-focus__remaining">
            <span className="review-focus__remaining-num">{remaining}</span>
            <span className="review-focus__remaining-label">remaining</span>
          </div>
          <div className="review-focus__mini-stats">
            <span title="Approved this session"><CheckCircle size={14} /> {session.approved}</span>
            <span title="Rejected this session"><XCircle size={14} /> {session.rejected}</span>
          </div>
          <button
            type="button"
            className="review-focus__exit icon-control"
            onClick={() => navigate('/reviewer/questions')}
            aria-label="Exit focus mode"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {error && (
        <div className="review-focus__toast review-focus__toast--error">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      )}

      <main className="review-focus__main">
        <section className="review-focus__panel review-focus__panel--question">
          <div className="review-focus__panel-head">
            <BookOpen size={18} />
            <h2>Question</h2>
            <div className="review-focus__badges">
              {current.DifficultyLevel && (
                <span className={`review-badge review-badge--${current.DifficultyLevel.toLowerCase()}`}>
                  {current.DifficultyLevel}
                </span>
              )}
              {current.QuestionType && (
                <span className="review-badge review-badge--type">{current.QuestionType}</span>
              )}
            </div>
          </div>
          {metaLine && <p className="review-focus__meta-line">{metaLine}</p>}
          <div className="review-focus__question-body">
            <LaTeXRenderer text={current.QuestionText} />
          </div>
        </section>

        <section className="review-focus__panel review-focus__panel--options">
          <div className="review-focus__panel-head">
            <ListChecks size={18} />
            <h2>Answer options</h2>
          </div>
          <div className="review-focus__options">
            {options.map((option, index) => (
              <div
                key={option.OptionID || index}
                className={`review-focus__option ${option.IsCorrect ? 'review-focus__option--correct' : ''}`}
              >
                <span className="review-focus__option-letter">{String.fromCharCode(65 + index)}</span>
                <div className="review-focus__option-text">
                  <LaTeXRenderer text={option.OptionText} />
                </div>
                {option.IsCorrect && <span className="review-focus__option-tag">Correct</span>}
              </div>
            ))}
          </div>
        </section>

        {current.Explanation && (
          <section className="review-focus__panel review-focus__panel--explanation">
            <div className="review-focus__panel-head">
              <h2>Explanation</h2>
            </div>
            <div className="review-focus__explanation-body">
              <LaTeXRenderer text={current.Explanation} />
            </div>
          </section>
        )}

        <aside className="review-focus__sidebar">
          <div className="review-focus__info-card">
            <h3>Queue</h3>
            <p className="review-focus__info-big">{remaining}</p>
            <p className="review-focus__info-sub">questions left in this session</p>
          </div>
          <div className="review-focus__info-card">
            <h3>
              <User size={16} /> Subject expert
            </h3>
            {creatorLoading ? (
              <p className="review-focus__info-muted">Loading…</p>
            ) : creator ? (
              <>
                <p className="review-focus__info-name">{creator.name}</p>
                <p className="review-focus__info-muted">{creator.email}</p>
              </>
            ) : (
              <p className="review-focus__info-muted">Unavailable</p>
            )}
          </div>
          <div className="review-focus__info-card review-focus__info-card--hint">
            <p>Review everything on one screen — approve, reject, or skip to the next question.</p>
          </div>
        </aside>
      </main>

      <footer className="review-focus__actions">
        {rejectOpen ? (
          <div className="review-focus__reject-panel">
            <label htmlFor="focus-reject-comments">Rejection comments (required)</label>
            <textarea
              id="focus-reject-comments"
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
              placeholder="Explain what needs to be fixed…"
              rows={3}
              autoFocus
            />
            <div className="review-focus__reject-actions">
              <button
                type="button"
                className="review-focus__btn review-focus__btn--reject"
                onClick={handleRejectConfirm}
                disabled={actionLoading || !rejectComments.trim()}
              >
                {actionLoading ? <Loader2 size={18} className="spin" /> : <XCircle size={18} />}
                Confirm reject
              </button>
              <button
                type="button"
                className="review-focus__btn review-focus__btn--ghost"
                onClick={() => {
                  setRejectOpen(false);
                  setRejectComments('');
                }}
                disabled={actionLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="review-focus__action-row">
            <button
              type="button"
              className="review-focus__btn review-focus__btn--reject"
              onClick={() => setRejectOpen(true)}
              disabled={actionLoading}
            >
              <XCircle size={20} />
              Reject
            </button>
            <button
              type="button"
              className="review-focus__btn review-focus__btn--next"
              onClick={handleSkip}
              disabled={actionLoading || remaining <= 1}
              title={remaining <= 1 ? 'Last question in queue' : 'Move to next without deciding'}
            >
              Next
              <ArrowRight size={20} />
            </button>
            <button
              type="button"
              className="review-focus__btn review-focus__btn--approve"
              onClick={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 size={20} className="spin" /> : <CheckCircle size={20} />}
              Approve
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default ReviewFocus;
