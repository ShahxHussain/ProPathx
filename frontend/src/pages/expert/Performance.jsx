import { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  BarChart3, 
  Target, 
  Clock, 
  Activity,
  Award,
  AlertCircle,
  FileText,
  Calendar,
  Zap
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
import { statusLabel } from '../../utils/questionStatus';
import './Performance.css';

const Performance = () => {
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    approved: 0,
    draft: 0,
    rejected: 0,
    pending: 0,
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
    loadPerformanceData();
  }, []);

  const loadPerformanceData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await questionAPI.getDashboardStats();
      
      setStats({
        ...(data.stats || {}),
        verified: data.stats?.verified ?? data.stats?.approved ?? 0,
        approved: data.stats?.verified ?? data.stats?.approved ?? 0,
      });
      setRecentQuestions(data.recentQuestions || []);
      setStatusData(data.statusData || []);
      setTrendData(data.trendData || []);
    } catch (err) {
      console.error('Failed to load performance data:', err);
      setError(err.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    verified: '#10b981',
    approved: '#10b981',
    draft: '#64748b',
    pending: '#f59e0b',
    rejected: '#ef4444',
    primary: '#8b5cf6',
  };

  const pieColors = [COLORS.verified, COLORS.draft, COLORS.pending, COLORS.rejected];

  const performanceCards = [
    {
      icon: FileText,
      label: 'Total Questions',
      value: stats.total,
      color: 'blue',
      trend: null,
    },
    {
      icon: CheckCircle,
      label: 'Verified',
      value: stats.verified ?? stats.approved ?? 0,
      color: 'green',
      trend: stats.total > 0 ? (((stats.verified ?? stats.approved ?? 0) / stats.total) * 100).toFixed(1) + '%' : '0%',
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
    const text = statusLabel(question);
    const slug = text.toLowerCase();
    const colorMap = {
      verified: COLORS.verified,
      draft: COLORS.draft,
      pending: COLORS.pending,
      rejected: COLORS.rejected,
    };
    return { text, color: colorMap[slug] || COLORS.pending };
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
      <div className="performance-page">
        <div className="page-header">
          <h1>Performance Metrics</h1>
          <p className="page-subtitle">Track your question creation and approval statistics</p>
        </div>
        <div className="loading-state">
          <Activity className="loading-icon" size={32} />
          <p>Loading performance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="performance-page">
        <div className="page-header">
          <h1>Performance Metrics</h1>
          <p className="page-subtitle">Track your question creation and approval statistics</p>
        </div>
        <div className="error-state">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button onClick={loadPerformanceData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-page">
      <div className="page-header">
        <h1>Performance Metrics</h1>
        <p className="page-subtitle">Track your question creation and approval statistics</p>
      </div>

      <div className="stats-grid">
        {performanceCards.map((card, index) => {
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

      <div className="performance-sections">
        {/* Approval Rate Section */}
        <div className="performance-section">
          <div className="section-header">
            <h2>
              <CheckCircle size={20} />
              Approval Rate
            </h2>
          </div>
          <div className="metric-card">
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

        {/* Quality Score Section */}
        <div className="performance-section">
          <div className="section-header">
            <h2>
              <Award size={20} />
              Quality Score
            </h2>
          </div>
          <div className="metric-card">
            <div className="quality-score">
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

      {/* Charts Section */}
      <div className="charts-section">
        {/* Status Distribution Chart */}
        <div className="chart-card">
          <div className="section-header">
            <h2>
              <BarChart3 size={20} />
              Status Distribution
            </h2>
          </div>
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
        </div>

        {/* Trend Chart */}
        {trendData.length > 0 && (
          <div className="chart-card">
            <div className="section-header">
              <h2>
                <TrendingUp size={20} />
                Question Creation Trend (Last 30 Days)
              </h2>
            </div>
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
        )}
      </div>

      {/* Recent Activity Section */}
      <div className="performance-section full-width">
        <div className="section-header">
          <h2>
            <Calendar size={20} />
            Recent Questions
          </h2>
        </div>
        <div className="activity-card">
          {recentQuestions.length > 0 ? (
            <div className="activity-list">
              {recentQuestions.map((question) => {
                const badge = getStatusBadge(question);
                return (
                  <div key={question.QuestionID} className="activity-item">
                    <div className="activity-icon">
                      <FileText size={18} />
                    </div>
                    <div className="activity-content">
                      <div className="activity-question">
                        {question.QuestionText?.substring(0, 100)}
                        {question.QuestionText?.length > 100 && '...'}
                      </div>
                      <div className="activity-meta">
                        <span className="activity-date">
                          <Calendar size={14} />
                          {formatDate(question.CreatedAt)}
                        </span>
                        {question.DifficultyLevel && (
                          <span className="activity-difficulty">
                            {question.DifficultyLevel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="activity-status">
                      <span 
                        className="status-badge" 
                        style={{ backgroundColor: badge.color + '20', color: badge.color }}
                      >
                        {badge.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={48} />
              <p>No questions created yet</p>
              <p className="empty-state-subtitle">Start creating questions to see your activity here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Performance;
