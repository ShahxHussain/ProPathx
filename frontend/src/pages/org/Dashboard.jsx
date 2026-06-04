import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  TrendingUp,
  BarChart3,
  PieChart,
  GraduationCap,
  UsersRound,
  Package,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Target,
  Calendar,
  ArrowRight,
  Eye,
  Plus,
  Settings,
  BookOpen,
  ScrollText,
  List,
  RefreshCw,
  Search,
  Building2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { orgDashboard, orgAuth } from '../../services/api';
import './Dashboard.css';

const COLORS = ['#1e40af', '#0d9488', '#ea580c', '#7c3aed', '#dc2626', '#059669'];

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
  cursor: { stroke: 'rgba(100, 116, 139, 0.35)', strokeWidth: 1 },
};

const STATUS_BAR_COLORS = {
  Active: '#10b981',
  Inactive: '#94a3b8',
  Completed: '#6366f1',
};

function OrgDashboardSkeleton() {
  return (
    <div className="org-dash-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="od-sk od-sk-hero" />
      <div className="od-sk-stats">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="od-sk od-sk-stat" />
        ))}
      </div>
      <div className="od-sk-main">
        <div className="od-sk-col">
          <div className="od-sk od-sk-chart" />
          <div className="od-sk od-sk-chart" />
          <div className="od-sk od-sk-chart" />
        </div>
        <div className="od-sk-col od-sk-col--narrow">
          <div className="od-sk od-sk-chart od-sk-chart--pie" />
          <div className="od-sk od-sk-chart" />
        </div>
      </div>
      <div className="od-sk od-sk-activity" />
    </div>
  );
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTests: 0,
    activeTests: 0,
    completedTests: 0,
    totalStudents: 0,
    totalGroups: 0,
    totalQuestions: 0,
    pendingQuestions: 0,
    approvedQuestions: 0,
  });
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [testGrowthData, setTestGrowthData] = useState([]);
  const [attemptsTrendData, setAttemptsTrendData] = useState([]);
  const [roleDistribution, setRoleDistribution] = useState([]);
  const [testStatusData, setTestStatusData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
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

      const response = await orgDashboard.getDashboardStats();

      setStats({
        totalUsers: response.stats?.totalUsers || 0,
        totalTests: response.stats?.totalTests || 0,
        activeTests: response.stats?.activeTests || 0,
        completedTests: response.stats?.completedTests || 0,
        totalStudents: response.stats?.totalStudents || 0,
        totalGroups: response.stats?.totalGroups || 0,
        totalQuestions: response.stats?.totalQuestions || 0,
        pendingQuestions: response.stats?.pendingQuestions || 0,
        approvedQuestions: response.stats?.approvedQuestions || 0,
      });

      setUserGrowthData(response.userGrowthData || []);
      setTestGrowthData(response.testGrowthData || []);
      setAttemptsTrendData(response.attemptsTrendData || []);

      const roleData = response.roleDistribution || {};
      setRoleDistribution(
        [
          { name: 'OrgAdmin', value: roleData.OrgAdmin || 0 },
          { name: 'Reviewer', value: roleData.Reviewer || 0 },
          { name: 'Subject Expert', value: roleData['Subject Expert'] || 0 },
        ].filter((item) => item.value > 0)
      );

      const statusData = response.testStatusData || {};
      setTestStatusData([
        { name: 'Active', value: statusData.Active || 0 },
        { name: 'Inactive', value: statusData.Inactive || 0 },
        { name: 'Completed', value: statusData.Completed || 0 },
      ]);

      try {
        const subResponse = await orgDashboard.getSubscriptions();
        if (subResponse.subscriptions && subResponse.subscriptions.length > 0) {
          const activeSubs = subResponse.subscriptions.filter(
            (sub) => sub.Status === 'Active' && new Date(sub.EndDate) >= new Date()
          );
          setSubscriptionInfo({
            active: activeSubs.length > 0,
            count: activeSubs.length,
            subscriptions: activeSubs,
          });
        } else {
          setSubscriptionInfo({ active: false, count: 0, subscriptions: [] });
        }
      } catch (subErr) {
        console.error('Failed to load subscription info:', subErr);
      }

      try {
        const logsResponse = await orgDashboard.getLogs({ page: 1, limit: 10 });
        setRecentActivity(logsResponse.logs || []);
      } catch (logsErr) {
        console.error('Failed to load recent activity:', logsErr);
      }

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
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const statCards = [
    {
      icon: Users,
      label: 'Total Users',
      value: stats.totalUsers,
      trend: null,
      action: () => navigate('/org/users'),
    },
    {
      icon: GraduationCap,
      label: 'Students',
      value: stats.totalStudents,
      trend: null,
      action: () => navigate('/org/students'),
    },
    {
      icon: FileText,
      label: 'Total Tests',
      value: stats.totalTests,
      trend: null,
      action: () => navigate('/org/tests'),
    },
    {
      icon: Activity,
      label: 'Active Tests',
      value: stats.activeTests,
      trend: stats.totalTests > 0 ? `${Math.round((stats.activeTests / stats.totalTests) * 100)}% of catalog` : '—',
      action: () => navigate('/org/tests'),
    },
    {
      icon: CheckCircle,
      label: 'Completed Tests',
      value: stats.completedTests,
      trend: stats.totalTests > 0 ? `${Math.round((stats.completedTests / stats.totalTests) * 100)}% of catalog` : '—',
      action: () => navigate('/org/tests'),
    },
    {
      icon: UsersRound,
      label: 'Student Groups',
      value: stats.totalGroups,
      trend: null,
      action: () => navigate('/org/groups'),
    },
    {
      icon: Target,
      label: 'Questions',
      value: stats.totalQuestions,
      trend:
        stats.totalQuestions > 0
          ? `${stats.approvedQuestions} approved · ${stats.pendingQuestions} pending`
          : 'No items yet',
      action: null,
    },
    {
      icon: Package,
      label: 'Subscriptions',
      value: subscriptionInfo?.count ?? 0,
      trend: subscriptionInfo?.active ? 'Active' : 'Review plans',
      action: () => navigate('/org/subscription-plans'),
    },
  ];

  const quickLinks = [
    { icon: Search, label: 'Explore exams', path: '/org/explore-exams' },
    { icon: Package, label: 'Plans', path: '/org/subscription-plans' },
    { icon: Users, label: 'Users', path: '/org/users' },
    { icon: GraduationCap, label: 'Students', path: '/org/students' },
    { icon: FileText, label: 'Tests', path: '/org/tests' },
    { icon: BookOpen, label: 'Question bank', path: '/org/question-bank' },
    { icon: ScrollText, label: 'Logs', path: '/org/logs' },
  ];

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

  const formatUpdated = (d) => {
    if (!d) return '';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'Create':
        return <Plus size={14} />;
      case 'Update':
        return <Settings size={14} />;
      case 'Delete':
        return <AlertCircle size={14} />;
      case 'View':
        return <Eye size={14} />;
      default:
        return <Activity size={14} />;
    }
  };

  const orgUser = orgAuth.getCurrentUser();
  const greetingName = orgUser?.fullName?.split(/\s+/)[0]?.trim() || 'there';
  const orgLabel = orgUser?.orgName || 'Your organization';

  if (loading) {
    return (
      <div className="dashboard-page portal-dashboard">
        <div className="org-dash-hero org-dash-hero--loading">
          <div className="org-dash-hero-text">
            <span className="org-dash-kicker">Overview</span>
            <h1>Dashboard</h1>
            <p className="page-subtitle">Loading metrics, charts, and activity…</p>
          </div>
        </div>
        <OrgDashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="dashboard-page portal-dashboard">
      <div className="org-dash-hero">
        <div className="org-dash-hero-text">
          <span className="org-dash-kicker">Overview</span>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, {greetingName} — {orgLabel}. Usage, tests, and team activity in one place.
          </p>
          <div className="org-dash-meta">
            <span className="org-dash-meta-item">
              <Building2 size={14} className="org-dash-meta-icon" aria-hidden />
              {orgLabel}
            </span>
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
            aria-busy={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? 'od-icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button type="button" className="action-btn-header" onClick={() => navigate('/org/tests')}>
            <Plus size={18} />
            <span>Create test</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error notice--spaced">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {subscriptionInfo && (
        <div className={`subscription-banner ${subscriptionInfo.active ? 'success' : 'warning'}`}>
          {subscriptionInfo.active ? (
            <>
              <CheckCircle size={20} className="subscription-banner__icon" />
              <div className="subscription-banner__body">
                <strong>
                  Active subscription{subscriptionInfo.count > 1 ? 's' : ''} ({subscriptionInfo.count})
                </strong>
                <p>
                  {subscriptionInfo.subscriptions.map((sub, idx) => (
                    <span key={sub.SubscriptionID}>
                      {sub.PlanName || 'Plan'} — valid until {new Date(sub.EndDate).toLocaleDateString()}
                      {idx < subscriptionInfo.subscriptions.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={20} className="subscription-banner__icon" />
              <div className="subscription-banner__body">
                <strong>No active subscription</strong>
                <p>Enable plans so students and staff get full access to tests and features.</p>
                <button
                  type="button"
                  className="subscription-banner__cta"
                  onClick={() => navigate('/org/subscription-plans')}
                >
                  View subscription plans
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
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
                {card.trend && <div className="stat-trend">{card.trend}</div>}
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
                <TrendingUp size={20} />
                User growth <span className="section-header__hint">30 days</span>
              </h2>
            </div>
            <div className="chart-container">
              {userGrowthData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={userGrowthData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="odFillUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e40af" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#1e40af" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area
                      type="monotone"
                      dataKey="users"
                      stroke="#1e40af"
                      strokeWidth={2}
                      fill="url(#odFillUsers)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No user growth data for this period.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <BarChart3 size={20} />
                Tests created <span className="section-header__hint">30 days</span>
              </h2>
            </div>
            <div className="chart-container">
              {testGrowthData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={testGrowthData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line
                      type="monotone"
                      dataKey="tests"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ fill: '#0d9488', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No test creation data for this period.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <Activity size={20} />
                Student attempts <span className="section-header__hint">30 days</span>
              </h2>
            </div>
            <div className="chart-container">
              {attemptsTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={attemptsTrendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="odFillAttempts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ea580c" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area
                      type="monotone"
                      dataKey="attempts"
                      stroke="#ea580c"
                      strokeWidth={2}
                      fill="url(#odFillAttempts)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No attempt volume yet — assignments and attempts will appear here.</div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-right-column">
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <PieChart size={20} />
                Role mix
              </h2>
            </div>
            <div className="chart-container">
              {roleDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPieChart>
                    <Pie
                      data={roleDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={88}
                      innerRadius={44}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {roleDistribution.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No role breakdown yet — invite reviewers and subject experts.</div>
              )}
            </div>
          </div>

          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <FileText size={20} />
                Test status
              </h2>
            </div>
            <div className="chart-container">
              {testStatusData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={testStatusData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...CHART_GRID} vertical={false} />
                    <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={36} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                      {testStatusData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_BAR_COLORS[entry.name] || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No tests in the catalog yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-bottom-section">
        <div className="dashboard-section full-width">
          <div className="section-header">
            <h2>
              <Clock size={20} />
              Recent activity
            </h2>
            <button type="button" className="view-all-link" onClick={() => navigate('/org/logs')}>
              View all logs
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="activity-container">
            {recentActivity.length > 0 ? (
              <div className="activity-list">
                {recentActivity.slice(0, 8).map((activity, index) => (
                  <div
                    key={activity.LogID ?? activity.Timestamp ?? `activity-${index}`}
                    className="activity-item"
                  >
                    <div className="activity-icon">{getActionIcon(activity.ActionType)}</div>
                    <div className="activity-content">
                      <div className="activity-description">
                        {activity.Description || `${activity.ActionType} ${activity.EntityType}`}
                      </div>
                      <div className="activity-meta">
                        <span className="activity-actor">
                          {activity.ActorType} · {activity.EntityType}
                        </span>
                        <span className="activity-time">
                          <Calendar size={12} />
                          {formatDate(activity.Timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Activity size={48} />
                <p>No recent activity</p>
                <button type="button" className="empty-state__cta" onClick={() => navigate('/org/logs')}>
                  Open system logs
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
