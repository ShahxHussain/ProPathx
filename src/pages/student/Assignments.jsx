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

const Assignments = () => {
  const navigate = useNavigate();
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

  const getAssignmentStatus = (assignment) => {
    const now = new Date();
    const dueDate = assignment.DueDate ? new Date(assignment.DueDate) : null;
    const test = assignment.Tests?.[0] || assignment.Tests;

    if (assignment.hasAttempted) {
      return { text: 'Completed', color: '#166534', icon: CheckCircle };
    }

    if (dueDate && dueDate < now) {
      return { text: 'Expired', color: '#991b1b', icon: XCircle };
    }

    if (test?.StartDate) {
      const startDate = new Date(test.StartDate);
      if (startDate > now) {
        return { text: 'Upcoming', color: '#1e40af', icon: Calendar };
      }
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
              const test = assignment.Tests?.[0] || assignment.Tests;
              const status = getAssignmentStatus(assignment);
              const StatusIcon = status.icon;

              return (
                <div
                  key={assignment.AssignmentID}
                  className="assignment-card"
                  onClick={() => navigate(`/student/test/${test?.TestID}`)}
                >
                  <div className="assignment-card-header">
                    <div className="assignment-icon-large">
                      <FileText size={24} />
                    </div>
                    <div className="assignment-title-section">
                      <h3 className="assignment-title">{test?.TestName || 'Unknown Test'}</h3>
                      {test?.Description && (
                        <p className="assignment-description">
                          {test.Description.length > 150
                            ? test.Description.substring(0, 150) + '...'
                            : test.Description}
                        </p>
                      )}
                    </div>
                    <span className="status-badge" style={getStatusBadgeStyle(status.color)}>
                      <StatusIcon size={14} />
                      {status.text}
                    </span>
                  </div>

                  <div className="assignment-card-body">
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
                      {test?.DurationMinutes && (
                        <div className="meta-item">
                          <Clock size={16} />
                          <div>
                            <span className="meta-label">Duration</span>
                            <span className="meta-value">{test.DurationMinutes} minutes</span>
                          </div>
                        </div>
                      )}
                      {assignment.latestAttempt && (
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
                    <button className="view-test-btn">
                      {assignment.hasAttempted ? 'View Results' : 'Start Test'}
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
