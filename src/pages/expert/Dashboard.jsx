import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  XCircle, 
  BarChart3, 
  ArrowRight,
  Plus,
  Activity,
  Award,
  AlertCircle,
  Calendar,
  Target,
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { questionAPI } from '../../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    qualityScore: 0,
    totalUsed: 0,
    accuracyRate: 0,
  });
  const [recentQuestions, setRecentQuestions] = useState([]);
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
      const response = await questionAPI.getDashboardStats();
      
      setStats(response.stats || {});
      setRecentQuestions(response.recentQuestions || []);
      
      // Transform statusData to use 'name' instead of 'status' for the chart
      const transformedStatusData = (response.statusData || []).map(item => ({
        name: item.status || item.name || 'Unknown',
        count: item.count || item.value || 0
      }));
      setStatusData(transformedStatusData);
      
      setTrendData(response.trendData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    approved: '#10b981',
    pending: '#f59e0b',
    rejected: '#ef4444',
    primary: '#8b5cf6',
  };

  const pieColors = [COLORS.approved, COLORS.pending, COLORS.rejected];

  const statCards = [
    {
      icon: FileText,
      label: 'Total Questions',
      value: stats.total,
      color: 'blue',
      trend: null,
    },
    { 
      icon: CheckCircle,
      label: 'Approved',
      value: stats.approved,
      color: 'green',
      trend: stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) + '%' : '0%',
    },
    {
      icon: Clock,
      label: 'Pending Review',
      value: stats.pending,
      color: 'orange',
      trend: stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) + '%' : '0%',
    },
    {
      icon: XCircle,
      label: 'Rejected',
      value: stats.rejected,
      color: 'red',
      trend: stats.total > 0 ? ((stats.rejected / stats.total) * 100).toFixed(1) + '%' : '0%',
    },
    {
      icon: Target,
      label: 'Quality Score',
      value: `${stats.qualityScore}%`,
      color: 'purple',
      trend: stats.qualityScore >= 80 ? 'Excellent' : stats.qualityScore >= 60 ? 'Good' : 'Needs Improvement',
    },
    {
      icon: Activity,
      label: 'Times Used',
      value: stats.totalUsed || 0,
      color: 'indigo',
      trend: stats.totalUsed > 0 ? 'Active' : 'Not Used Yet',
    },
  ];

  const getStatusBadge = (question) => {
    if (question.IsVerified) {
      return { text: 'Approved', color: COLORS.approved };
    } else if (question.ReviewerComments) {
      return { text: 'Rejected', color: COLORS.rejected };
    } else {
      return { text: 'Pending', color: COLORS.pending };
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getQualityMessage = (score) => {
    if (score >= 90) return { message: 'Outstanding! Your questions are top quality.', emoji: '🌟' };
    if (score >= 80) return { message: 'Excellent work! Keep maintaining high standards.', emoji: '✨' };
    if (score >= 70) return { message: 'Good performance! Room for improvement.', emoji: '👍' };
    if (score >= 60) return { message: 'Average performance. Focus on quality.', emoji: '📈' };
    return { message: 'Needs improvement. Review feedback carefully.', emoji: '💡' };
  };

  const qualityInfo = getQualityMessage(stats.qualityScore);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <h1>Subject Expert Dashboard</h1>
          <p className="page-subtitle">Complete overview of your question creation and performance</p>
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
            <h1>Subject Expert Dashboard</h1>
            <p className="page-subtitle">Complete overview of your question creation and performance</p>
          </div>
          <button
            className="create-question-btn"
            onClick={() => navigate('/expert/create')}
          >
            <Plus size={20} />
            <span>Create Question</span>
          </button>
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
                {card.trend && (
                  <div className="stat-trend">{card.trend}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-main-grid">
        {/* Left Column - Charts and Analytics */}
        <div className="dashboard-left-column">
          {/* Status Distribution Chart */}
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <BarChart3 size={20} />
                Status Distribution
              </h2>
            </div>
            <div className="chart-container">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">No data available</div>
              )}
            </div>
          </div>

          {/* Trend Chart */}
          {trendData.length > 0 && (
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <TrendingUp size={20} />
                  Question Creation Trend (Last 30 Days)
                </h2>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke={COLORS.primary} 
                      strokeWidth={2}
                      name="Questions Created"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Quality Score Section */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <Award size={20} />
                Quality Score
              </h2>
            </div>
            <div className="quality-score-card">
              <div className="quality-score-content">
                <div className="score-circle" style={{
                  background: stats.qualityScore >= 80 
                    ? 'linear-gradient(135deg, #10b981, #059669)' 
                    : stats.qualityScore >= 60
                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                    : 'linear-gradient(135deg, #ef4444, #dc2626)'
                }}>
                  <div className="score-value">{stats.qualityScore}</div>
                  <div className="score-label">Score</div>
                </div>
                <div className="score-info">
                  <p className="score-message">
                    <span className="score-emoji">{qualityInfo.emoji}</span>
                    {qualityInfo.message}
                  </p>
                  {stats.totalUsed > 0 && (
                    <div className="score-stats">
                      <div className="score-stat-item">
                        <span className="score-stat-label">Accuracy Rate:</span>
                        <span className="score-stat-value">{stats.accuracyRate}%</span>
                      </div>
                      <div className="score-stat-item">
                        <span className="score-stat-label">Total Uses:</span>
                        <span className="score-stat-value">{stats.totalUsed}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Recent Activity and Quick Actions */}
        <div className="dashboard-right-column">
          {/* Approval Rate */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <CheckCircle size={20} />
                Approval Rate
              </h2>
            </div>
            <div className="approval-rate-card">
              <div className="metric-header">
                <span>Overall Approval Rate</span>
                <span className="metric-value">{stats.qualityScore}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ 
                    width: `${stats.qualityScore}%`,
                    background: stats.qualityScore >= 80 
                      ? 'linear-gradient(135deg, #10b981, #059669)' 
                      : stats.qualityScore >= 60
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)'
                  }}
                />
              </div>
              <div className="metric-details">
                <div className="metric-item">
                  <span className="metric-label">Approved</span>
                  <span className="metric-number" style={{ color: COLORS.approved }}>
                    {stats.approved}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Pending</span>
                  <span className="metric-number" style={{ color: COLORS.pending }}>
                    {stats.pending}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Rejected</span>
                  <span className="metric-number" style={{ color: COLORS.rejected }}>
                    {stats.rejected}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Questions */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <Calendar size={20} />
                Recent Questions
              </h2>
              <button 
                className="view-all-link"
                onClick={() => navigate('/expert/questions')}
              >
                View All
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="recent-questions-container">
              {recentQuestions.length === 0 ? (
                <div className="empty-state">
                  <FileText size={48} />
                  <p>No recent questions to display</p>
                  <button
                    className="create-first-btn"
                    onClick={() => navigate('/expert/create')}
                  >
                    Create Your First Question
                  </button>
                </div>
              ) : (
                <div className="recent-questions-list">
                  {recentQuestions.map((question) => {
                    const badge = getStatusBadge(question);
                    return (
                      <div
                        key={question.QuestionID}
                        className="recent-question-item"
                        onClick={() => navigate('/expert/questions')}
                      >
                        <div className="question-item-icon">
                          <FileText size={18} />
                        </div>
                        <div className="question-item-content">
                          <div className="question-item-header">
                            <span 
                              className="status-badge" 
                              style={{ backgroundColor: badge.color + '20', color: badge.color }}
                            >
                              {badge.text}
                            </span>
                            <span className="question-date">
                              <Calendar size={14} />
                              {formatDate(question.CreatedAt)}
                            </span>
                          </div>
                          <div className="question-item-text">
                            {question.QuestionText
                              ? question.QuestionText.substring(0, 80) + (question.QuestionText.length > 80 ? '...' : '')
                              : `Question ID: ${question.QuestionID.substring(0, 8)}...`}
                          </div>
                          {question.DifficultyLevel && (
                            <div className="question-item-meta">
                              <span className="difficulty-badge">{question.DifficultyLevel}</span>
                            </div>
                          )}
                        </div>
                        <ArrowRight size={18} className="question-item-arrow" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
