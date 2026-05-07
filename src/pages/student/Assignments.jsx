import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
  Award,
  AlertCircle,
  Activity,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './Assignments.css';

/** Updates every second so countdowns and “time left” stay accurate. */
function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatDurationUntil(ms) {
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const Assignments = () => {
  const navigate = useNavigate();
  const now = useCurrentTime();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await studentDashboardAPI.getAssignments();
      setAssignments(response.assignments || []);
    } catch (err) {
      console.error('Failed to load assignments:', err);
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateOnly = (dateVal) => {
    if (!dateVal) return null;
    const date =
      typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)
        ? new Date(`${dateVal}T12:00:00`)
        : new Date(dateVal);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  /** API may return `test` (normalized) or `Tests` array from Supabase. */
  const getTestFromAssignment = (assignment) =>
    assignment.test ||
    assignment.Tests?.[0] ||
    (assignment.Tests && !Array.isArray(assignment.Tests) ? assignment.Tests : null);

  const getTestDisplayName = (test) =>
    test?.testName || test?.TestName || 'Test';

  /** Tests table uses StartTime (timestamptz). Countdown until that instant. */
  const formatStartsIn = (startTimeIso) => {
    if (!startTimeIso) return null;
    const start = new Date(startTimeIso);
    if (start <= now) return null;
    return formatDurationUntil(start - now);
  };

  const getAssignmentStatus = (assignment) => {
    const dueDate = assignment.DueDate ? new Date(assignment.DueDate) : null;
    const test = getTestFromAssignment(assignment);
    const latest = assignment.latestAttempt;
    const attemptStatus = latest?.Status ?? latest?.status;
    const rowStatusRaw = (assignment.Status ?? assignment.status ?? '').trim();
    const rowStatusNorm = rowStatusRaw.toLowerCase().replace(/\s+/g, '');

    if (rowStatusNorm === 'completed') {
      return { text: 'Completed', color: '#166534', icon: CheckCircle };
    }
    if (rowStatusNorm === 'expired' || rowStatusNorm === 'cancelled') {
      return { text: rowStatusRaw || 'Unavailable', color: '#991b1b', icon: XCircle };
    }
    if (assignment.unavailableReason) {
      return { text: 'Unavailable by Plan', color: '#991b1b', icon: XCircle };
    }

    if (attemptStatus === 'Completed') {
      return { text: 'Completed', color: '#166534', icon: CheckCircle };
    }

    const endAt = test?.EndTime || test?.endTime;
    if (endAt && new Date(endAt) < now && attemptStatus !== 'Completed') {
      return { text: 'Closed', color: '#991b1b', icon: XCircle };
    }

    if (dueDate && dueDate < now && attemptStatus !== 'Completed') {
      return { text: 'Expired', color: '#991b1b', icon: XCircle };
    }

    const startAt = test?.StartTime || test?.startTime;
    if (startAt) {
      const start = new Date(startAt);
      if (start > now) {
        return { text: 'Upcoming', color: '#1e40af', icon: Calendar };
      }
    }

    if (latest && attemptStatus !== 'Completed') {
      return { text: 'In progress', color: '#1e3a8a', icon: Activity };
    }

    return { text: 'Pending', color: '#9a3412', icon: Clock };
  };

  const getStatusBadgeStyle = (statusColor) => {
    const bgColors = {
      '#166534': '#f0fdf4',
      '#991b1b': '#fef2f2',
      '#1e40af': '#eff6ff',
      '#9a3412': '#fff7ed',
    };
    const borderColors = {
      '#166534': '#dcfce7',
      '#991b1b': '#fecaca',
      '#1e40af': '#dbeafe',
      '#9a3412': '#fed7aa',
    };

    return {
      backgroundColor: bgColors[statusColor] || '#f9fafb',
      color: statusColor,
      borderColor: borderColors[statusColor] || '#e5e7eb',
    };
  };

  if (loading) {
    return (
      <div className="assignments-page">
        <div className="page-header">
          <h1>My Assignments</h1>
          <p className="page-subtitle">All your test assignments in one place</p>
        </div>
        <div className="loading-state">
          <Activity className="loading-icon" size={32} />
          <p>Loading assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assignments-page">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h1>My Assignments</h1>
            <p className="page-subtitle">All your test assignments in one place</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="assignments-section">
        {assignments.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} />
            <h3>No Assignments</h3>
            <p className="muted">You don't have any test assignments yet.</p>
            <p className="muted">Your assigned tests will appear here when they become available.</p>
          </div>
        ) : (
          <div className="assignments-list">
            {assignments.map((assignment) => {
              const test = getTestFromAssignment(assignment);
              const testId = test?.TestID || test?.testId || assignment.TestID;
              const status = getAssignmentStatus(assignment);
              const StatusIcon = status.icon;
              const startAt = test?.StartTime || test?.startTime;
              const endAt = test?.EndTime || test?.endTime;
              const testDateOnly = test?.TestDate || test?.testDate;
              const latest = assignment.latestAttempt;
              const attemptStatus = latest?.Status ?? latest?.status;
              const rowSt = String(assignment.Status ?? assignment.status ?? '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '');
              const rowCompleted = rowSt === 'completed';
              const completed = attemptStatus === 'Completed' || rowCompleted;
              const inProgress = latest && attemptStatus !== 'Completed' && !rowCompleted;

              const beforeStart = !!(startAt && new Date(startAt) > now);
              const afterEnd = !!(endAt && new Date(endAt) < now);
              const due = assignment.DueDate ? new Date(assignment.DueDate) : null;
              const pastDue = !!(due && due < now);

              const startsIn = formatStartsIn(startAt);

              const actionBlocked =
                !testId ||
                !!assignment.unavailableReason ||
                (!completed &&
                  !inProgress &&
                  (beforeStart || afterEnd || pastDue));

              let timeLeftLine = null;
              let timeLeftCaption = '';
              if (!completed && !beforeStart) {
                const candidates = [];
                if (due && due > now) candidates.push({ label: 'due date', at: due });
                if (endAt && new Date(endAt) > now) {
                  candidates.push({ label: 'test window end', at: new Date(endAt) });
                }
                const next = candidates.sort((a, b) => a.at - b.at)[0];
                if (next) {
                  timeLeftCaption = next.label;
                  timeLeftLine = formatDurationUntil(next.at - now);
                }
              }

              const goToTest = () => {
                if (actionBlocked) return;
                if (completed) {
                  navigate(`/student/test/${testId}/results`);
                } else {
                  navigate(`/student/test/${testId}`);
                }
              };

              let actionLabel = 'Start Test';
              if (completed) actionLabel = 'View Results';
              else if (inProgress) actionLabel = 'Continue test';
              else if (beforeStart) actionLabel = 'Not started yet';
              else if (afterEnd || pastDue) actionLabel = 'Unavailable';

              return (
                <div
                  key={assignment.AssignmentID}
                  className="assignment-card"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: actionBlocked ? 'default' : 'pointer' }}
                  onClick={goToTest}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    goToTest();
                  }}
                >
                  <div className="assignment-card-header">
                    <div className="assignment-icon-large">
                      <FileText size={24} />
                    </div>
                    <div className="assignment-title-section">
                      <h3 className="assignment-title">{getTestDisplayName(test)}</h3>
                      {(test?.Description || test?.description) && (
                        <p className="assignment-description">
                          {(test.Description || test.description).length > 150
                            ? (test.Description || test.description).substring(0, 150) + '...'
                            : test.Description || test.description}
                        </p>
                      )}
                    </div>
                    <span className="status-badge" style={getStatusBadgeStyle(status.color)}>
                      <StatusIcon size={14} />
                      {status.text}
                    </span>
                  </div>

                  <div className="assignment-card-body">
                    {assignment.unavailableReason && (
                      <div className="notice error" style={{ marginBottom: '12px' }}>
                        <AlertCircle size={16} />
                        {assignment.unavailableReason}
                      </div>
                    )}
                    <div className="assignment-meta-grid">
                      {assignment.DueDate && (
                        <div className="meta-item">
                          <Calendar size={16} />
                          <div>
                            <span className="meta-label">Due Date</span>
                            <span className="meta-value">{formatDate(assignment.DueDate)}</span>
                          </div>
                        </div>
                      )}
                      {assignment.AssignedAt && (
                        <div className="meta-item">
                          <Clock size={16} />
                          <div>
                            <span className="meta-label">Assigned</span>
                            <span className="meta-value">{formatDate(assignment.AssignedAt)}</span>
                          </div>
                        </div>
                      )}
                      {startAt && (
                        <div className="meta-item">
                          <Calendar size={16} />
                          <div>
                            <span className="meta-label">Test starts</span>
                            <span className="meta-value">{formatDate(startAt)}</span>
                          </div>
                        </div>
                      )}
                      {!startAt && testDateOnly && (
                        <div className="meta-item">
                          <Calendar size={16} />
                          <div>
                            <span className="meta-label">Test date</span>
                            <span className="meta-value">
                              {formatDateOnly(testDateOnly)}
                              <span className="muted" style={{ display: 'block', fontSize: '0.85em', marginTop: 2 }}>
                                No fixed start time — begin before the due date.
                              </span>
                            </span>
                          </div>
                        </div>
                      )}
                      {endAt && (
                        <div className="meta-item">
                          <Calendar size={16} />
                          <div>
                            <span className="meta-label">Test window ends</span>
                            <span className="meta-value">{formatDate(endAt)}</span>
                          </div>
                        </div>
                      )}
                      {startsIn && (
                        <div className="meta-item">
                          <Clock size={16} />
                          <div>
                            <span className="meta-label">Starts in</span>
                            <span className="meta-value">{startsIn}</span>
                          </div>
                        </div>
                      )}
                      {timeLeftLine && (
                        <div className="meta-item">
                          <Clock size={16} />
                          <div>
                            <span className="meta-label">Time remaining (until {timeLeftCaption})</span>
                            <span className="meta-value">{timeLeftLine}</span>
                          </div>
                        </div>
                      )}
                      {(test?.DurationMinutes ?? test?.durationMinutes) ? (
                        <div className="meta-item">
                          <Clock size={16} />
                          <div>
                            <span className="meta-label">Duration</span>
                            <span className="meta-value">
                              {test.DurationMinutes ?? test.durationMinutes} minutes
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {assignment.latestAttempt && completed && (
                        <div className="meta-item">
                          <Award size={16} />
                          <div>
                            <span className="meta-label">Score</span>
                            <span className="meta-value">
                              {assignment.latestAttempt.ObtainedMarks} / {assignment.latestAttempt.TotalMarks}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="assignment-card-footer">
                    <button
                      type="button"
                      className="view-test-btn"
                      disabled={actionBlocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!actionBlocked) {
                          if (completed) navigate(`/student/test/${testId}/results`);
                          else navigate(`/student/test/${testId}`);
                        }
                      }}
                    >
                      {actionLabel}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Assignments;
