import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle, 
  TrendingUp, 
  Award,
  Calendar,
  AlertCircle,
  Activity,
  BookOpen,
  Target
} from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalAssignments: 0,
    completedTests: 0,
    pendingTests: 0,
    expiredTests: 0,
    averageScore: 0,
  });
  const [recentAssignments, setRecentAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await studentDashboardAPI.getDashboardStats();
      
      setStats(response.stats || {});
      setRecentAssignments(response.recentAssignments || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: FileText,
      label: 'Total Assignments',
      value: stats.totalAssignments,
      color: 'blue',
    },
    {
      icon: CheckCircle,
      label: 'Completed Tests',
      value: stats.completedTests,
      color: 'green',
    },
    {
      icon: Clock,
      label: 'Pending Tests',
      value: stats.pendingTests,
      color: 'orange',
    },
    {
      icon: XCircle,
      label: 'Expired Tests',
      value: stats.expiredTests,
      color: 'red',
    },
    {
      icon: Award,
      label: 'Average Score',
      value: `${stats.averageScore}%`,
      color: 'purple',
    },
  ];

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
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

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <h1>Student Dashboard</h1>
          <p className="page-subtitle">Your test assignments and performance overview</p>
        </div>
        <div className="loading-state">
          <Activity className="loading-icon" size={32} />
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h1>Student Dashboard</h1>
            <p className="page-subtitle">Your test assignments and performance overview</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="stats-grid">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="stat-card">
              <div className={`stat-icon stat-icon-${card.color}`}>
                <Icon size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Assignments */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>
            <BookOpen size={20} />
            Recent Test Assignments
          </h2>
          <button 
            className="view-all-link"
            onClick={() => navigate('/student/assignments')}
          >
            View All
            <TrendingUp size={16} />
          </button>
        </div>
        <div className="assignments-container">
          {recentAssignments.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>No test assignments yet</p>
              <p className="muted">Your assigned tests will appear here</p>
            </div>
          ) : (
            <div className="assignments-list">
              {recentAssignments.map((assignment) => {
                const test = assignment.Tests?.[0] || assignment.Tests;
                const status = getAssignmentStatus(assignment);
                const StatusIcon = status.icon;
                
                return (
                  <div
                    key={assignment.AssignmentID}
                    className="assignment-item"
                    onClick={() => navigate(`/student/test/${test?.TestID}`)}
                  >
                    <div className="assignment-icon">
                      <FileText size={18} />
                    </div>
                    <div className="assignment-content">
                      <div className="assignment-header">
                        <span className="assignment-title">{test?.TestName || 'Unknown Test'}</span>
                        <span 
                          className="status-badge" 
                          style={{ 
                            backgroundColor: status.color === '#166534' ? '#f0fdf4' : 
                                           status.color === '#991b1b' ? '#fef2f2' :
                                           status.color === '#1e40af' ? '#eff6ff' :
                                           '#fff7ed',
                            color: status.color,
                            borderColor: status.color === '#166534' ? '#dcfce7' : 
                                       status.color === '#991b1b' ? '#fecaca' :
                                       status.color === '#1e40af' ? '#dbeafe' :
                                       '#fed7aa'
                          }}
                        >
                          <StatusIcon size={14} />
                          {status.text}
                        </span>
                      </div>
                      {test?.Description && (
                        <p className="assignment-description">
                          {test.Description.substring(0, 100)}
                          {test.Description.length > 100 ? '...' : ''}
                        </p>
                      )}
                      <div className="assignment-meta">
                        {assignment.DueDate && (
                          <span className="meta-item">
                            <Calendar size={14} />
                            Due: {formatDate(assignment.DueDate)}
                          </span>
                        )}
                        {test?.DurationMinutes && (
                          <span className="meta-item">
                            <Clock size={14} />
                            {test.DurationMinutes} minutes
                          </span>
                        )}
                        {assignment.latestAttempt && (
                          <span className="meta-item">
                            <Award size={14} />
                            Score: {assignment.latestAttempt.ObtainedMarks}/{assignment.latestAttempt.TotalMarks}
                          </span>
                        )}
                      </div>
                    </div>
                    <TrendingUp size={18} className="assignment-arrow" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
