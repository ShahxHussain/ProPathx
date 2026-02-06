import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCheck, CheckCircle, XCircle, TrendingUp, BarChart3, ArrowRight, Clock } from 'lucide-react';
import { reviewerAPI } from '../../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    totalReviewed: 0,
    reviewedByMe: 0,
  });
  const [recentReviews, setRecentReviews] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [trendData, setTrendData] = useState([]);
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
      const response = await reviewerAPI.getDashboardStats();
      
      setStats(response.stats || {});
      setRecentReviews(response.recentReviews || []);
      setStatusData(response.statusData || []);
      setTrendData(response.trendData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: FileCheck,
      label: 'Pending Review',
      value: stats.pending,
      color: 'orange',
    },
    {
      icon: CheckCircle,
      label: 'Approved',
      value: stats.approved,
      color: 'green',
    },
    {
      icon: XCircle,
      label: 'Rejected',
      value: stats.rejected,
      color: 'red',
    },
    {
      icon: TrendingUp,
      label: 'Total Reviewed',
      value: stats.totalReviewed,
      color: 'blue',
    },
  ];

  const getStatusBadge = (review) => {
    if (review.IsVerified) {
      return { text: 'Approved', color: 'green' };
    }
    if (review.ReviewerComments) {
      return { text: 'Rejected', color: 'red' };
    }
    return { text: 'Pending', color: 'orange' };
  };

  const getMaxValue = (data) => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map((d) => d.count || d.value || 0), 1);
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>Reviewer Dashboard</h1>
        <p className="page-subtitle">Review and approve questions submitted by Subject Experts</p>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading dashboard...</div>
      ) : (
        <>
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

          <div className="dashboard-sections">
            <div className="dashboard-section chart-section">
              <h2>Questions by Status</h2>
              <div className="chart-container">
                {statusData.length > 0 ? (
                  <div className="bar-chart">
                    {statusData.map((item, index) => {
                      const maxValue = getMaxValue(statusData);
                      const percentage = (item.count / maxValue) * 100;
                      const colors = {
                        Approved: '#22c55e',
                        Pending: '#f97316',
                        Rejected: '#ef4444',
                      };
                      return (
                        <div key={index} className="bar-item">
                          <div className="bar-label">{item.status}</div>
                          <div className="bar-wrapper">
                            <div
                              className="bar"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: colors[item.status] || '#8b5cf6',
                              }}
                            >
                              <span className="bar-value">{item.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-chart">No data available</div>
                )}
              </div>
            </div>

            <div className="dashboard-section chart-section">
              <h2>Review Activity (Last 30 Days)</h2>
              <div className="chart-container">
                {trendData.length > 0 ? (
                  <div className="line-chart">
                    <div className="chart-bars">
                      {trendData.map((item, index) => {
                        const maxValue = getMaxValue(trendData);
                        const height = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
                        return (
                          <div key={index} className="chart-bar-item">
                            <div
                              className="chart-bar"
                              style={{ height: `${height}%` }}
                              title={`${item.date}: ${item.count} reviews`}
                            >
                              <span className="chart-bar-value">{item.count}</span>
                            </div>
                            <div className="chart-bar-label">{item.date}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="empty-chart">No reviews in the last 30 days</div>
                )}
              </div>
            </div>

            <div className="dashboard-section">
              <h2>Recent Reviews</h2>
              {recentReviews.length === 0 ? (
                <div className="empty-state">
                  <FileCheck size={48} />
                  <p>No recent reviews to display</p>
                </div>
              ) : (
                <div className="recent-reviews-list">
                  {recentReviews.map((review) => {
                    const badge = getStatusBadge(review);
                    return (
                      <div
                        key={review.QuestionID}
                        className="recent-review-item"
                        onClick={() => navigate(`/reviewer/questions`)}
                      >
                        <div className="review-item-content">
                          <div className="review-item-header">
                            <span className={`status-badge status-${badge.color}`}>
                              {badge.text}
                            </span>
                            <span className="review-date">
                              {new Date(review.VerifiedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="review-item-id">
                            Question ID: {review.QuestionID.substring(0, 8)}...
                          </div>
                          {review.ReviewerComments && (
                            <div className="review-comments">
                              {review.ReviewerComments.substring(0, 60)}
                              {review.ReviewerComments.length > 60 ? '...' : ''}
                            </div>
                          )}
                        </div>
                        <ArrowRight size={18} className="review-item-arrow" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dashboard-section">
              <h2>Quick Actions</h2>
              <div className="quick-actions">
                <button
                  className="action-btn"
                  onClick={() => navigate('/reviewer/questions')}
                >
                  <FileCheck size={20} />
                  <span>Review Pending Questions</span>
                </button>
                <button
                  className="action-btn"
                  onClick={() => navigate('/reviewer/experts')}
                >
                  <TrendingUp size={20} />
                  <span>View Expert Performance</span>
                </button>
                <button
                  className="action-btn"
                  onClick={() => navigate('/reviewer/approved')}
                >
                  <CheckCircle size={20} />
                  <span>View Approved Questions</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
