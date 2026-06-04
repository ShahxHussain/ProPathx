import { useCallback, useEffect, useState } from 'react';
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
  AlertCircle,
  Calendar,
  Target,
  FilePlus,
  Bell,
  RefreshCw,
  Sparkles,
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
  ResponsiveContainer,
} from 'recharts';
import { questionAPI, orgAuth } from '../../services/api';
import './Dashboard.css';

const CHART_GRID = { stroke: '#e2e8f0', strokeDasharray: '4 4' };
const CHART_TICK = { fill: '#64748b', fontSize: 11, fontWeight: 500 };
const CHART_TOOLTIP = {
  contentStyle: {
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 14px',
  },
};

/** Restrained pie slices — not saturated traffic lights */
const PIE_FILLS = ['#64748b', '#94a3b8', '#78716c'];

function ExpertDashboardSkeleton() {
  return (
    <div className="org-dash-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="od-sk od-sk-hero" />
      <div className="od-sk-stats">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="od-sk od-sk-stat" />
        ))}
      </div>
      <div className="od-sk-main">
        <div className="od-sk-col">
          <div className="od-sk od-sk-chart od-sk-chart--pie" />
          <div className="od-sk od-sk-chart" />
          <div className="od-sk od-sk-chart od-sk-chart--short" />
        </div>
        <div className="od-sk-col od-sk-col--narrow">
          <div className="od-sk od-sk-chart od-sk-chart--medium" />
          <div className="od-sk od-sk-activity" />
        </div>
      </div>
    </div>
  );
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');

  const loadDashboardData = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      setError('');
      if (silent) setRefreshing(true);
      else setLoading(true);

      const response = await questionAPI.getDashboardStats();
      setStats(response.stats || {});
      setRecentQuestions(response.recentQuestions || []);

      const transformedStatusData = (response.statusData || []).map((item) => ({
        name: item.status || item.name || 'Unknown',
        count: item.count || item.value || 0,
      }));
      setStatusData(transformedStatusData);
      setTrendData(response.trendData || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const user = orgAuth.getCurrentUser();
  const greetingName = user?.fullName?.split(/\s+/)[0]?.trim() || 'there';
  const contextLabel =
    user?.userType === 'Platform' ? 'Platform expert' : user?.orgName || 'Your organization';

  const statCards = [
    {
      icon: FileText,
      label: 'Total questions',
      value: stats.total,
      trend: null,
    },
    {
      icon: CheckCircle,
      label: 'Approved',
      value: stats.approved,
      trend: stats.total > 0 ? `${((stats.approved / stats.total) * 100).toFixed(1)}% of yours` : '—',
    },
    {
      icon: Clock,
      label: 'Pending review',
      value: stats.pending,
      trend: stats.total > 0 ? `${((stats.pending / stats.total) * 100).toFixed(1)}% of yours` : '—',
    },
    {
      icon: XCircle,
      label: 'Rejected',
      value: stats.rejected,
      trend: stats.total > 0 ? `${((stats.rejected / stats.total) * 100).toFixed(1)}% of yours` : '—',
    },
    {
      icon: Target,
      label: 'Quality score',
      value: `${stats.qualityScore}%`,
      trend:
        stats.qualityScore >= 80 ? 'Strong' : stats.qualityScore >= 60 ? 'Solid' : 'Room to improve',
    },
    {
      icon: Activity,
      label: 'Times used',
      value: stats.totalUsed || 0,
      trend: stats.totalUsed > 0 ? 'In tests' : 'Not used yet',
    },
  ];

  const quickLinks = [
    { icon: FilePlus, label: 'Create', path: '/expert/create' },
    { icon: FileText, label: 'My questions', path: '/expert/questions' },
    { icon: BarChart3, label: 'Performance', path: '/expert/performance' },
    { icon: Bell, label: 'Notifications', path: '/expert/notifications' },
  ];

  const getStatusBadge = (question) => {
    if (question.IsVerified) return { text: 'Approved', className: 'ex-badge ex-badge--muted' };
    if (question.ReviewerComments) return { text: 'Rejected', className: 'ex-badge ex-badge--muted' };
    return { text: 'Pending', className: 'ex-badge ex-badge--muted' };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getQualityMessage = (score) => {
    if (score >= 90) return 'Outstanding — your items are consistently strong.';
    if (score >= 80) return 'Excellent — keep the same rigor on new submissions.';
    if (score >= 70) return 'Good — a few refinements will lift outcomes further.';
    if (score >= 60) return 'Fair — tighten clarity and rubric alignment.';
    return 'Focus on feedback from reviewers and resubmit thoughtfully.';
  };

  const formatUpdated = (d) =>
    d?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) ?? '';

  if (loading) {
    return (
      <div className="dashboard-page portal-dashboard expert-dashboard">
        <div className="org-dash-hero org-dash-hero--loading">
          <div className="org-dash-hero-text">
            <span className="org-dash-kicker">Workspace</span>
            <h1>Subject expert</h1>
            <p className="page-subtitle">Loading your authoring metrics…</p>
          </div>
        </div>
        <ExpertDashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="dashboard-page portal-dashboard expert-dashboard">
      <div className="org-dash-hero">
        <div className="org-dash-hero-text">
          <span className="org-dash-kicker">Workspace</span>
          <h1>Subject expert</h1>
          <p className="page-subtitle">
            Welcome back, {greetingName} — track how your questions perform and stay ahead of review for{' '}
            {contextLabel}.
          </p>
          <div className="org-dash-meta">
            <span className="org-dash-meta-item org-dash-meta-item--muted">{contextLabel}</span>
            {lastUpdated && (
              <span className="org-dash-meta-item org-dash-meta-item--muted">
                Updated {formatUpdated(lastUpdated)}
              </span>
            )}
          </div>
        </div>
        <div className="org-dash-hero-actions">
          <button
            type="button"
            className="action-btn-ghost"
            onClick={() => loadDashboardData({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? 'od-icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button type="button" className="action-btn-header" onClick={() => navigate('/expert/create')}>
            <Plus size={18} />
            <span>Create question</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error notice--spaced">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <nav className="org-quick-nav" aria-label="Shortcuts">
        {quickLinks.map(({ icon: Icon, label, path }) => (
          <button key={path} type="button" className="org-quick-nav__btn" onClick={() => navigate(path)}>
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="stat-icon" aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
                {card.trend && <div className="stat-trend">{card.trend}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="dashboard-main-grid">
        <div className="dashboard-left-column">
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <BarChart3 size={20} />
                Status mix
              </h2>
            </div>
            <div className="chart-container">
              {statusData.length > 0 && statusData.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={88}
                      innerRadius={48}
                      paddingAngle={2}
                      dataKey="count"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_FILLS[index % PIE_FILLS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No submissions yet.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <TrendingUp size={20} />
                Creation trend <span className="section-header__hint">30 days</span>
              </h2>
            </div>
            <div className="chart-container">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#6d28d9"
                      strokeWidth={2.5}
                      dot={{ fill: '#6d28d9', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      name="Created"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No creation activity in the last 30 days.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section expert-quality-section">
            <div className="section-header">
              <h2>
                <Sparkles size={20} />
                Quality score
              </h2>
            </div>
            <div className="expert-quality-card">
              <div className="expert-quality-score-ring" aria-hidden>
                <span className="expert-quality-score-value">{stats.qualityScore}</span>
                <span className="expert-quality-score-label">Score</span>
              </div>
              <div className="expert-quality-copy">
                <p className="expert-quality-message">{getQualityMessage(stats.qualityScore)}</p>
                {stats.totalUsed > 0 && (
                  <div className="expert-quality-stats">
                    <div className="expert-quality-stat">
                      <span className="expert-quality-stat-label">Accuracy</span>
                      <span className="expert-quality-stat-value">{stats.accuracyRate}%</span>
                    </div>
                    <div className="expert-quality-stat">
                      <span className="expert-quality-stat-label">Uses</span>
                      <span className="expert-quality-stat-value">{stats.totalUsed}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-right-column">
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <CheckCircle size={20} />
                Approval snapshot
              </h2>
            </div>
            <div className="expert-approval-card">
              <div className="expert-approval-header">
                <span>Weighted view</span>
                <span className="expert-approval-pct">{stats.qualityScore}%</span>
              </div>
              <div className="expert-approval-bar">
                <div className="expert-approval-fill" style={{ width: `${Math.min(100, stats.qualityScore)}%` }} />
              </div>
              <div className="expert-approval-grid">
                <div>
                  <span className="expert-approval-label">Approved</span>
                  <span className="expert-approval-num">{stats.approved}</span>
                </div>
                <div>
                  <span className="expert-approval-label">Pending</span>
                  <span className="expert-approval-num">{stats.pending}</span>
                </div>
                <div>
                  <span className="expert-approval-label">Rejected</span>
                  <span className="expert-approval-num">{stats.rejected}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <Calendar size={20} />
                Recent questions
              </h2>
              <button type="button" className="view-all-link" onClick={() => navigate('/expert/questions')}>
                View all
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="activity-container expert-recent-scroll">
              {recentQuestions.length === 0 ? (
                <div className="empty-state">
                  <FileText size={48} />
                  <p>No recent questions</p>
                  <button type="button" className="empty-state__cta" onClick={() => navigate('/expert/create')}>
                    Create a question
                  </button>
                </div>
              ) : (
                <div className="activity-list">
                  {recentQuestions.map((question) => {
                    const badge = getStatusBadge(question);
                    return (
                      <div
                        key={question.QuestionID}
                        className="activity-item expert-recent-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate('/expert/questions')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate('/expert/questions');
                          }
                        }}
                      >
                        <div className="stat-icon expert-recent-icon" aria-hidden>
                          <FileText size={16} strokeWidth={1.75} />
                        </div>
                        <div className="activity-content">
                          <div className="activity-meta" style={{ marginBottom: 6 }}>
                            <span className={badge.className}>{badge.text}</span>
                            <span className="activity-time">
                              <Calendar size={12} />
                              {formatDate(question.CreatedAt)}
                            </span>
                          </div>
                          <div className="activity-description expert-question-snippet">
                            {question.QuestionText
                              ? `${question.QuestionText.slice(0, 90)}${question.QuestionText.length > 90 ? '…' : ''}`
                              : `Question ${question.QuestionID?.slice(0, 8)}…`}
                          </div>
                          {question.DifficultyLevel && (
                            <div className="expert-diff">{question.DifficultyLevel}</div>
                          )}
                        </div>
                        <ArrowRight size={18} className="stat-arrow" aria-hidden />
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
