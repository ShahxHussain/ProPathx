import { useEffect, useState } from 'react';
import { BookMarked, Loader2, AlertCircle, X } from 'lucide-react';
import { studentAPI } from '../../services/api';
import './Students.css';

function examOrgChipClass(row) {
  if (!row.enrollment) return 'exam-org-chip--implicit';
  const s = String(row.enrollmentStatus || '').trim().toLowerCase();
  if (s === 'implicit') return 'exam-org-chip--implicit';
  if (s === 'approved' || s === 'active') return 'exam-org-chip--approved';
  return `exam-org-chip--${s.replace(/\s+/g, '-')}`;
}

function examOrgStatusLabel(row) {
  if (!row.enrollment) return 'Subscription access';
  const s = String(row.enrollmentStatus || '').trim();
  if (s === 'Implicit') return 'Subscription access';
  if (s === 'Approved' || s === 'Active') return 'Approved';
  return s;
}

export default function ExamEnrollmentModal({ student, onClose }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busyExamId, setBusyExamId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await studentAPI.getStudentExamEnrollments(student.StudentID);
        if (!mounted) return;
        setRows(res.exams || []);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load exam enrollment');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [student.StudentID]);

  const reload = async () => {
    const res = await studentAPI.getStudentExamEnrollments(student.StudentID);
    setRows(res.exams || []);
  };

  const withdraw = async (examId) => {
    if (
      !window.confirm(
        'Unenroll this student from this exam? The record is kept as Withdrawn; you can enroll again later if the plan still includes this exam.'
      )
    ) {
      return;
    }
    try {
      setBusyExamId(examId);
      await studentAPI.withdrawStudentExamEnrollment(student.StudentID, examId);
      await reload();
    } catch (err) {
      alert(err.message || 'Failed to unenroll');
    } finally {
      setBusyExamId(null);
    }
  };

  const enroll = async (examId) => {
    try {
      setBusyExamId(examId);
      await studentAPI.activateStudentExamEnrollment(student.StudentID, examId);
      await reload();
    } catch (err) {
      alert(err.message || 'Failed to enroll');
    } finally {
      setBusyExamId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large exam-org-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <BookMarked size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Exam access — {student.FullName}
          </h2>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body exam-org-modal-body">
          <p className="exam-org-hint">
            Use <strong>Unenroll</strong> to block access (Withdrawn) or <strong>Enroll</strong> to restore approved access. Subscription-only
            rows have no enrollment record yet. When a student requests access, the row is Pending — approve or reject from the{' '}
            <strong>Exam enrollments → Pending requests</strong> tab, not here.
          </p>
          {loading ? (
            <div className="exam-org-loading">
              <Loader2 className="spin-icon" size={22} />
              Loading…
            </div>
          ) : error ? (
            <div className="notice error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : rows.length === 0 ? (
            <p className="exam-org-empty">No exams are linked to the subscription yet.</p>
          ) : (
            <ul className="exam-org-list">
              {rows.map((row) => {
                const busy = busyExamId === row.examId;
                const label = String(row.enrollmentStatus || '').trim();
                const pending = label === 'Pending';

                const canUnenroll = row.accessActive;
                const canEnroll =
                  !row.accessActive &&
                  !pending &&
                  (label === 'Withdrawn' || label === 'Suspended' || label === 'Rejected');

                return (
                  <li key={row.examId} className="exam-org-row">
                    <div className="exam-org-row-main">
                      <div className="exam-org-row-title">
                        <strong>{row.examName}</strong>
                        <span className={`exam-org-chip ${examOrgChipClass(row)}`}>{examOrgStatusLabel(row)}</span>
                      </div>
                      {row.statusHintOrg ? <p className="exam-org-row-hint">{row.statusHintOrg}</p> : null}
                      {pending && row.enrollment ? (
                        <p className="exam-org-row-meta">
                          Request channel:{' '}
                          <strong>
                            {String(row.enrollment.Source || '') === 'StudentRequest'
                              ? 'Student submitted'
                              : 'Organization / system'}
                          </strong>
                          {row.enrollment.RequestedByType ? (
                            <>
                              {' '}
                              · Requested-by role: <strong>{row.enrollment.RequestedByType}</strong>
                            </>
                          ) : null}
                          {row.enrollment.RequestedAt ? (
                            <>
                              {' '}
                              ·{' '}
                              {new Date(row.enrollment.RequestedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {pending ? (
                        <p className="exam-org-row-hint exam-org-row-hint--emph">
                          Go to <strong>Exam enrollments → Pending requests</strong> to approve or reject this student for this exam.
                        </p>
                      ) : null}
                      {label === 'Rejected' && row.enrollment?.ReviewNote ? (
                        <p className="exam-org-review-note">
                          <span className="exam-org-review-label">Last note</span>
                          {row.enrollment.ReviewNote}
                        </p>
                      ) : null}
                    </div>
                    <div className="exam-org-row-actions exam-org-row-actions--stack">
                      {canUnenroll && (
                        <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => withdraw(row.examId)}>
                          {busy ? '…' : 'Unenroll'}
                        </button>
                      )}
                      {canEnroll && (
                        <button type="button" className="btn-primary btn-small" disabled={busy} onClick={() => enroll(row.examId)}>
                          {busy ? '…' : 'Enroll'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
