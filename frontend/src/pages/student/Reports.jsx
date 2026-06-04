import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  ArrowRight,
  Award,
  Calendar,
  Activity,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './Reports.css';

function isCompletedAttempt(att) {
  if (!att) return false;
  const st = att.Status ?? att.status;
  if (st === 'Completed') return true;
  const end = att.EndTime ?? att.endTime;
  return end != null && end !== '';
}

function getTestFromAssignment(assignment) {
  return (
    assignment.test ||
    assignment.Tests?.[0] ||
    (assignment.Tests && !Array.isArray(assignment.Tests) ? assignment.Tests : null)
  );
}

function getTestDisplayName(test) {
  return test?.testName || test?.TestName || 'Test';
}

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

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Reports() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await studentDashboardAPI.getAssignments();
        if (!cancelled) setAssignments(res.assignments || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completedRows = useMemo(() => {
    const rows = [];
    for (const a of assignments) {
      const att = a.latestAttempt;
      if (!isCompletedAttempt(att)) continue;
      const test = getTestFromAssignment(a);
      const testId = test?.TestID || test?.testId || a.TestID;
      if (!testId) continue;
      const name = getTestDisplayName(test);
      const score = att.ObtainedMarks ?? att.obtainedMarks;
      const total =
        att.TotalMarks ?? att.totalMarks ?? test?.TotalMarks ?? test?.totalMarks ?? null;
      const pct =
        total != null && Number(total) > 0 && score != null
          ? Math.round((Number(score) / Number(total)) * 1000) / 10
          : null;
      const submitted = att.EndTime ?? att.endTime;
      const attemptOrdinal = att.AttemptOrdinal ?? att.attemptOrdinal ?? null;
      rows.push({ assignment: a, test, testId, name, score, total, pct, submitted, attemptOrdinal });
    }
    rows.sort((x, y) => {
      const ax = x.submitted ? new Date(x.submitted).getTime() : 0;
      const ay = y.submitted ? new Date(y.submitted).getTime() : 0;
      return ay - ax;
    });
    return rows;
  }, [assignments]);

  const avgPct = useMemo(() => {
    const withPct = completedRows.filter((r) => r.pct != null);
    if (!withPct.length) return null;
    const sum = withPct.reduce((s, r) => s + r.pct, 0);
    return Math.round((sum / withPct.length) * 10) / 10;
  }, [completedRows]);

  if (loading) {
    return (
      <div className="student-reports-page">
        <div className="student-reports-header">
          <h1>Results &amp; reports</h1>
          <p className="student-reports-subtitle">Assessment analytics and full reports for completed tests</p>
        </div>
        <div className="student-reports-loading">
          <Activity className="student-reports-loading-icon" size={32} />
          <p>Loading your reports…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student-reports-page">
      <div className="student-reports-header">
        <div className="student-reports-header-row">
          <div>
            <h1>Results &amp; reports</h1>
            <p className="student-reports-subtitle">
              Open the detailed report for any completed test: scores, timing, topic breakdown, and item review
              (aligned with your attempt data).
            </p>
          </div>
          <div className="student-reports-header-icon" aria-hidden>
            <BarChart3 size={36} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {error && (
        <div className="student-reports-notice student-reports-notice--error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {completedRows.length > 0 && (
        <div className="student-reports-summary">
          <div className="student-reports-stat">
            <span className="student-reports-stat-label">Completed</span>
            <span className="student-reports-stat-value">{completedRows.length}</span>
          </div>
          <div className="student-reports-stat">
            <span className="student-reports-stat-label">Avg. score %</span>
            <span className="student-reports-stat-value">{avgPct != null ? `${avgPct}%` : '—'}</span>
          </div>
        </div>
      )}

      <section className="student-reports-section" aria-labelledby="reports-list-heading">
        <h2 id="reports-list-heading" className="student-reports-section-title">
          <FileText size={20} aria-hidden />
          Your reports
        </h2>

        {completedRows.length === 0 ? (
          <div className="student-reports-empty">
            <BookOpen size={48} strokeWidth={1.25} />
            <h3>No completed reports yet</h3>
            <p className="muted">
              When you finish a test, its full analytics report appears here. You can also open reports from{' '}
              <strong>My Assignments</strong> using &quot;View Results&quot;.
            </p>
            <button type="button" className="student-reports-btn-primary" onClick={() => navigate('/student/assignments')}>
              Go to assignments
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <ul className="student-reports-list">
            {completedRows.map((row) => (
              <li key={String(row.testId)} className="student-reports-card">
                <div className="student-reports-card-main">
                  <div className="student-reports-card-title">
                    <FileText size={20} className="student-reports-card-icon" aria-hidden />
                    <h3>{row.name}</h3>
                  </div>
                  <div className="student-reports-card-meta">
                    <span className="student-reports-meta-item">
                      <Award size={14} aria-hidden />
                      Score:{' '}
                      <strong>
                        {row.score ?? '—'} / {row.total ?? '—'}
                      </strong>
                      {row.pct != null && <span className="student-reports-pct"> ({row.pct}%)</span>}
                    </span>
                    <span className="student-reports-meta-item">
                      <Calendar size={14} aria-hidden />
                      Submitted {formatWhen(row.submitted)}
                    </span>
                    {row.attemptOrdinal != null && formatAttemptOrdinal(row.attemptOrdinal) && (
                      <span className="student-reports-meta-item student-reports-meta-item--attempt">
                        {formatAttemptOrdinal(row.attemptOrdinal)} attempt
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="student-reports-card-action"
                  onClick={() => navigate(`/student/test/${row.testId}/results`)}
                >
                  Open full report
                  <ArrowRight size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
