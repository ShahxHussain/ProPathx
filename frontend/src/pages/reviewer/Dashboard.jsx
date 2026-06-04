import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCheck,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Clock,
  Users,
  ClipboardCheck,
  Bell,
  RefreshCw,
  Activity,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { reviewerAPI, orgAuth } from '../../services/api';
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

/** Muted fills — readable, not rainbow */
const STATUS_BAR_FILL = {
  Approved: '#64748b',
  Pending: '#94a3b8',
  Rejected: '#78716c',
};

function ReviewerDashboardSkeleton() {
  return (
    <div className="org-dash-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="od-sk od-sk-hero" />
      <div className="od-sk-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="od-sk od-sk-stat" />
        ))}
      </div>
      <div className="od-sk-main">
        <div className="od-sk-col">
          <div className="od-sk od-sk-chart" />
          <div className="od-sk od-sk-chart" />
        </div>
        <div className="od-sk-col od-sk-col--narrow">
          <div className="od-sk od-sk-activity" />
        </div>
      </div>
    </div>
  );
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');

  const loadDashboardData = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      setError('');
      if (silent) setRefreshing(true);
      else setLoading(true);

      const response = await reviewerAPI.getDashboardStats();
      setStats(response.stats || {});
      setRecentReviews(response.recentReviews || []);
      setStatusData(response.statusData || []);
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
    user?.userType === 'Platform' ? 'Platform reviewer' : user?.orgName || 'Your organization';

  const statCards = [
    {
      icon: FileCheck,
      label: 'Pending review',
      value: stats.pending,
      hint: 'In your queue',
      action: () => navigate('/reviewer/questions'),
    },
    {
      icon: CheckCircle,
      label: 'Approved',
      value: stats.approved,
      hint: null,
      action: () => navigate('/reviewer/approved'),
    },
    {
      icon: XCircle,
      label: 'Rejected',
      value: stats.rejected,
      hint: null,
      action: () => navigate('/reviewer/questions'),
    },
    {
      icon: TrendingUp,
      label: 'Total reviewed',
      value: stats.totalReviewed,
      hint: stats.reviewedByMe ? `${stats.reviewedByMe} by you` : null,
      action: null,
    },
  ];

  const quickLinks = [
    { icon: FileCheck, label: 'Pending', path: '/reviewer/questions' },
    { icon: ClipboardCheck, label: 'Approved', path: '/reviewer/approved' },
    { icon: Users, label: 'Experts', path: '/reviewer/experts' },
    { icon: Bell, label: 'Notifications', path: '/reviewer/notifications' },
  ];

  const statusChartData = statusData.map((item) => ({
    name: item.status,
    count: item.count ?? 0,
  }));

  const trendChartData = trendData.map((item) => ({
    date: item.date,
    count: item.count ?? item.value ?? 0,
  }));

  const getStatusBadge = (review) => {
    if (review.IsVerified) return { text: 'Approved', className: 'rev-badge rev-badge--muted' };
    if (review.ReviewerComments) return { text: 'Rejected', className: 'rev-badge rev-badge--muted' };
    return { text: 'Pending', className: 'rev-badge rev-badge--muted' };
  };

  const formatUpdated = (d) =>
    d?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) ?? '';

  if (loading) {
    return (
      <div className="dashboard-page portal-dashboard reviewer-dashboard">
        <div className="org-dash-hero org-dash-hero--loading">
          <div className="org-dash-hero-text">
            <span className="org-dash-kicker">Workspace</span>
            <h1>Reviewer</h1>
            <p className="page-subtitle">Loading your review metrics…</p>
          </div>
        </div>
        <ReviewerDashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="dashboard-page portal-dashboard reviewer-dashboard">
      <div className="org-dash-hero">
        <div className="org-dash-hero-text">
          <span className="org-dash-kicker">Workspace</span>
          <h1>Reviewer</h1>
          <p className="page-subtitle">
            Welcome back, {greetingName} — triage questions, keep quality high, and track activity for{' '}
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
          <button type="button" className="action-btn-header" onClick={() => navigate('/reviewer/questions')}>
            <FileCheck size={18} />
            <span>Review queue</span>
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
            <div
              key={card.label}
              className={`stat-card ${card.action ? 'clickable' : ''}`}
              onClick={card.action || undefined}
              role={card.action ? 'button' : undefined}
              tabIndex={card.action ? 0 : undefined}
              onKeyDown={
                card.action
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        card.action();
                      }
                    }
                  : undefined
              }
            >
              <div className="stat-icon" aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
                {card.hint && <div className="stat-trend">{card.hint}</div>}
              </div>
              {card.action && <ArrowRight size={18} className="stat-arrow" aria-hidden />}
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
                Questions by status
              </h2>
            </div>
            <div className="chart-container">
              {statusChartData.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={56}>
                      {statusChartData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_BAR_FILL[entry.name] || '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No status breakdown yet.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <Activity size={20} />
                Review activity <span className="section-header__hint">30 days</span>
              </h2>
            </div>
            <div className="chart-container">
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trendChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#0f766e"
                      strokeWidth={2}
                      fill="url(#revTrendFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No reviews in the last 30 days.</div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-right-column">
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <Clock size={20} />
                Recent reviews
              </h2>
            </div>
            {recentReviews.length === 0 ? (
              <div className="empty-state">
                <FileCheck size={48} />
                <p>No recent reviews</p>
                <button type="button" className="empty-state__cta" onClick={() => navigate('/reviewer/questions')}>
                  Open review queue
                </button>
              </div>
            ) : (
              <div className="activity-container rev-activity-scroll">
                <div className="activity-list">
                  {recentReviews.map((review) => {
                    const badge = getStatusBadge(review);
                    return (
                      <div
                        key={review.QuestionID}
                        className="activity-item rev-activity-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate('/reviewer/questions')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate('/reviewer/questions');
                          }
                        }}
                      >
                        <div className="activity-icon">
                          <FileCheck size={16} />
                        </div>
                        <div className="activity-content">
                          <div className="activity-description">
                            Question <span className="rev-mono">{review.QuestionID?.slice(0, 8)}…</span>
                          </div>
                          <div className="activity-meta">
                            <span className={badge.className}>{badge.text}</span>
                            <span className="activity-time">
                              <Calendar size={12} />
                              {(review.VerifiedAt || review.CreatedAt)
                                ? new Date(review.VerifiedAt || review.CreatedAt).toLocaleDateString()
                                : '—'}
                            </span>
                          </div>
                          {review.ReviewerComments && (
                            <div className="rev-comment-preview">{review.ReviewerComments.slice(0, 100)}…</div>
                          )}
                        </div>
                        <ArrowRight size={18} className="stat-arrow" aria-hidden />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
