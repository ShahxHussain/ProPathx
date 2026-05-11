import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Loader2, AlertCircle } from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './ExamEnrollments.css';

function badgeModifier(row) {
  if (!row.enrollment) return 'implicit';
  const s = String(row.enrollmentStatus || '').trim().toLowerCase();
  if (s === 'implicit') return 'implicit';
  if (s === 'approved' || s === 'active') return 'approved';
  return s.replace(/\s+/g, '-') || 'unknown';
}

function statusTitle(row) {
  if (!row.enrollment) return 'Subscription access';
  const s = String(row.enrollmentStatus || '').trim();
  if (s === 'Implicit') return 'Subscription access';
  if (s === 'Approved' || s === 'Active') return 'Approved';
  return s;
}

export default function ExamEnrollments() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busyExamId, setBusyExamId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await studentDashboardAPI.getExamEnrollments();
      setRows(res.exams || []);
    } catch (e) {
      setError(e.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async (examId, isPendingRequest) => {
    const msg = isPendingRequest
      ? 'Cancel this access request? Your organization will not see a pending enrollment for this exam anymore.'
      : 'Leave this exam? New attempts and scheduled tests for this exam will be unavailable until you enroll again. Past results stay on your record.';
    if (!window.confirm(msg)) return;

    try {
      setBusyExamId(examId);
      await studentDashboardAPI.withdrawExamEnrollment(examId);
      await load();
    } catch (e) {
      alert(e.message || 'Could not update enrollment');
    } finally {
      setBusyExamId(null);
    }
  };

  const activate = async (examId) => {
    try {
      setBusyExamId(examId);
      await studentDashboardAPI.activateExamEnrollment(examId);
      await load();
    } catch (e) {
      alert(e.message || 'Could not update enrollment');
    } finally {
      setBusyExamId(null);
    }
  };

  return (
    <div className="exam-enroll-page">
      <header className="exam-enroll-head">
        <h1>
          <BookMarked size={26} aria-hidden />
          My exams
        </h1>
        <p>
          Organization students see every exam covered by your school&apos;s active subscription. With no enrollment row, you keep normal
          access from your plan alone. If you leave an exam or lose access after rejection or suspension, you must submit a request — your
          organization must approve before you can use that exam again. Individual accounts use subscriptions only and do not use this screen.
        </p>
      </header>

      {loading ? (
        <div className="exam-enroll-loading">
          <Loader2 className="spin" size={28} />
          <span>Loading exam access…</span>
        </div>
      ) : error ? (
        <div className="notice error exam-enroll-notice">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="exam-enroll-empty">
          No exams are linked to your subscription yet. When your plan includes exams, they will appear here.
        </div>
      ) : (
        <div className="exam-enroll-grid">
          {rows.map((row) => {
            const busy = busyExamId === row.examId;
            const label = String(row.enrollmentStatus || '').trim();
            const pending = label === 'Pending';
            const rejected = label === 'Rejected';

            const canLeaveApproved =
              row.accessActive && (!row.enrollment || label === 'Approved' || label === 'Active');
            const canCancelPending = pending;
            const canRequestAccess =
              !row.accessActive &&
              (label === 'Withdrawn' || label === 'Suspended' || label === 'Rejected');

            const mod = badgeModifier(row);

            return (
              <article key={row.examId} className="exam-enroll-card">
                <div className="exam-enroll-card-top">
                  <h2>{row.examName}</h2>
                  <span className={`exam-enroll-badge exam-enroll-badge--${mod}`}>{statusTitle(row)}</span>
                </div>
                {row.statusHint ? (
                  <p className="exam-enroll-hint">{row.statusHint}</p>
                ) : null}
                {rejected && row.enrollment?.ReviewNote ? (
                  <blockquote className="exam-enroll-note">{row.enrollment.ReviewNote}</blockquote>
                ) : null}
                <div className="exam-enroll-actions">
                  {canLeaveApproved && (
                    <button
                      type="button"
                      className="exam-enroll-btn exam-enroll-btn--outline"
                      disabled={busy}
                      onClick={() => withdraw(row.examId, false)}
                    >
                      {busy ? 'Saving…' : 'Leave exam'}
                    </button>
                  )}
                  {canCancelPending && (
                    <button
                      type="button"
                      className="exam-enroll-btn exam-enroll-btn--outline"
                      disabled={busy}
                      onClick={() => withdraw(row.examId, true)}
                    >
                      {busy ? 'Saving…' : 'Cancel request'}
                    </button>
                  )}
                  {canRequestAccess && (
                    <button
                      type="button"
                      className="exam-enroll-btn exam-enroll-btn--primary"
                      disabled={busy}
                      onClick={() => activate(row.examId)}
                      title="Sends a request to your organization; they must approve before you regain access."
                    >
                      {busy ? 'Saving…' : 'Request access'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
