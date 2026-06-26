import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  DollarSign,
  Activity,
  TrendingUp,
  AlertTriangle,
  Users,
  FileText,
  GraduationCap,
  BarChart3,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Package,
  Shield,
  Zap,
  PlusCircle,
  UserPlus,
  ScrollText,
  RefreshCw,
  LayoutDashboard,
  HeartPulse,
  Settings,
  History,
  CheckCircle2,
  Info,
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
  AreaChart,
  Area,
} from 'recharts';
import { adminAPI } from '../../services/api';
import './Dashboard.css';

const REVENUE_LABELS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeOrgs: 0,
    totalOrgs: 0,
    totalRevenue: 0,
    systemHealth: {
      cpu: 0,
      latency: 0,
      status: 'healthy',
    },
    totalUsers: 0,
    totalStudents: 0,
    totalTests: 0,
    totalQuestions: 0,
    approvedQuestions: 0,
    pendingQuestions: 0,
    rejectedQuestions: 0,
  });
  const [revenueData, setRevenueData] = useState([]);
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [questionsTrendData, setQuestionsTrendData] = useState([]);
  const [orgStatusData, setOrgStatusData] = useState([]);
  const [roleDistribution, setRoleDistribution] = useState([]);
  const [questionsStatusData, setQuestionsStatusData] = useState([]);
  const [topOrganizations, setTopOrganizations] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [revenueTimeRange, setRevenueTimeRange] = useState('7');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await adminAPI.getDashboardStats(revenueTimeRange);

      setStats({
        activeOrgs: response.stats?.activeOrgs || 0,
        totalOrgs: response.stats?.totalOrgs || 0,
        totalRevenue: response.stats?.totalRevenue || 0,
        systemHealth: response.systemHealth || {
          cpu: 0,
          latency: 0,
          status: 'healthy',
        },
        totalUsers: response.stats?.totalUsers || 0,
        totalStudents: response.stats?.totalStudents || 0,
        totalTests: response.stats?.totalTests || 0,
        totalQuestions: response.stats?.totalQuestions || 0,
        approvedQuestions: response.stats?.approvedQuestions || 0,
        pendingQuestions: response.stats?.pendingQuestions || 0,
        rejectedQuestions: response.stats?.rejectedQuestions || 0,
      });

      setRevenueData(response.revenueData || []);
      setUserGrowthData(response.userGrowthData || []);
      setQuestionsTrendData(response.questionsTrendData || []);
      setOrgStatusData(response.orgStatusData || []);
      setRoleDistribution(response.roleDistribution || []);
      setQuestionsStatusData(response.questionsStatusData || []);
      setTopOrganizations(response.topOrganizations || []);
      setRecentAlerts(response.alerts || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [revenueTimeRange]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const primaryKpis = useMemo(
    () => [
      {
        icon: Building2,
        label: 'Active organizations',
        value: stats.activeOrgs,
        hint: `${stats.totalOrgs || 0} total tenants`,
        trend: 'up',
        variant: 'navy',
        action: () => navigate('/admin/organizations'),
      },
      {
        icon: DollarSign,
        label: 'Revenue (all time)',
        value: `$${Number(stats.totalRevenue || 0).toLocaleString()}`,
        hint: 'Completed payments',
        trend: 'up',
        variant: 'crimson',
        action: () => navigate('/admin/subscriptions'),
      },
      {
        icon: Users,
        label: 'Platform users',
        value: stats.totalUsers,
        hint: 'Active platform & org accounts',
        trend: 'up',
        variant: 'teal',
        action: () => navigate('/admin/users'),
      },
      {
        icon: HeartPulse,
        label: 'System health',
        value: stats.systemHealth.status === 'healthy' ? 'Healthy' : 'Check',
        hint: `CPU ${stats.systemHealth.cpu}%`,
        trend: stats.systemHealth.cpu > 80 ? 'down' : 'up',
        variant: stats.systemHealth.cpu > 80 ? 'warn' : 'ok',
        action: () => navigate('/admin/health'),
      },
    ],
    [navigate, stats]
  );

  const secondaryKpis = useMemo(
    () => [
      {
        icon: GraduationCap,
        label: 'Students',
        value: stats.totalStudents,
        hint: 'Active learners',
        trend: 'up',
        action: () => navigate('/admin/organizations'),
      },
      {
        icon: FileText,
        label: 'Questions',
        value: stats.totalQuestions || 0,
        hint: `${stats.approvedQuestions || 0} approved`,
        trend: 'up',
        action: () => navigate('/admin/questions'),
      },
      {
        icon: BarChart3,
        label: 'Tests',
        value: stats.totalTests || 0,
        hint: 'Active tests',
        trend: 'up',
        action: () => navigate('/admin/organizations'),
      },
      {
        icon: Shield,
        label: 'Pending reviews',
        value: stats.pendingQuestions || 0,
        hint: `${stats.rejectedQuestions || 0} rejected`,
        trend: stats.pendingQuestions > 0 ? 'down' : 'up',
        action: () => navigate('/admin/questions'),
      },
    ],
    [navigate, stats]
  );

  const chartStroke = {
    revenue: '#dc2626',
    users: '#6366f1',
    questions: '#ea580c',
  };

  const PIE_COLORS = ['#1e3a8a', '#14b8a6', '#f97316', '#ef4444', '#8b5cf6', '#22c55e'];

  const getAlertIcon = (type) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="sa-alert-icon sa-alert-icon--error" strokeWidth={1.75} />;
      case 'warning':
        return <AlertTriangle className="sa-alert-icon sa-alert-icon--warn" strokeWidth={1.75} />;
      case 'success':
        return <CheckCircle2 className="sa-alert-icon sa-alert-icon--ok" strokeWidth={1.75} />;
      default:
        return <Info className="sa-alert-icon sa-alert-icon--info" strokeWidth={1.75} />;
    }
  };

  const formatActivityTimestamp = (iso) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return { date: '', time: '' };
      return {
        date: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      };
    } catch {
      return { date: '', time: '' };
    }
  };

  const getAlertColor = (type) => {
    switch (type) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'success':
        return 'success';
      default:
        return 'info';
    }
  };

  const revenueChartTitle = REVENUE_LABELS[revenueTimeRange] || 'Revenue';

  return (
    <div className="admin-dashboard sa-dash">
      <header className="sa-hero">
        <div className="sa-hero__main">
          <p className="sa-hero__eyebrow">
            <LayoutDashboard size={14} aria-hidden />
            SuperAdmin
          </p>
          <h1 className="sa-hero__title">Platform overview</h1>
          <p className="sa-hero__lede">
            Tenants, revenue, content pipeline, and signals in one place. Data refreshes when you change the
            revenue window or use refresh.
          </p>
          {lastUpdated && (
            <p className="sa-hero__meta">
              Updated {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>
        <div className="sa-hero__actions">
          <button
            type="button"
            className="sa-btn sa-btn--ghost"
            onClick={() => loadDashboardData()}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} className={loading ? 'sa-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="sa-hero__visual" aria-hidden>
          <svg className="sa-hero__mesh" viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="200" cy="48" r="52" stroke="url(#sa-mesh-a)" strokeWidth="1.2" opacity="0.55" />
            <circle cx="72" cy="168" r="38" stroke="url(#sa-mesh-b)" strokeWidth="1.2" opacity="0.45" />
            <path
              d="M24 120 C 80 88, 140 140, 220 72"
              stroke="url(#sa-mesh-c)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d="M48 48 L 120 100 L 200 36"
              stroke="rgba(30, 58, 138, 0.18)"
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray="4 6"
            />
            <defs>
              <linearGradient id="sa-mesh-a" x1="148" y1="0" x2="252" y2="96" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0d9488" />
                <stop offset="1" stopColor="#6366f1" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="sa-mesh-b" x1="34" y1="130" x2="110" y2="206" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1e3a8a" stopOpacity="0.5" />
                <stop offset="1" stopColor="#0d9488" stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id="sa-mesh-c" x1="24" y1="120" x2="220" y2="72" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" stopOpacity="0.35" />
                <stop offset="1" stopColor="#0d9488" stopOpacity="0.6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="sa-hero-glass sa-hero-glass--tenants">
            <span className="sa-hero-glass__icon sa-hero-glass__icon--navy">
              <Building2 size={18} strokeWidth={1.75} />
            </span>
            <span className="sa-hero-glass__label">Tenants</span>
          </div>
          <div className="sa-hero-glass sa-hero-glass--revenue">
            <span className="sa-hero-glass__icon sa-hero-glass__icon--teal">
              <DollarSign size={18} strokeWidth={1.75} />
            </span>
            <span className="sa-hero-glass__label">Revenue</span>
          </div>
          <div className="sa-hero-glass sa-hero-glass--pipeline">
            <span className="sa-hero-glass__icon sa-hero-glass__icon--violet">
              <BarChart3 size={18} strokeWidth={1.75} />
            </span>
            <span className="sa-hero-glass__label">Pipeline</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="sa-banner sa-banner--error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="sa-skeleton-wrap" aria-busy="true" aria-label="Loading dashboard">
          <div className="sa-skeleton sa-skeleton--hero" />
          <div className="sa-skeleton-grid">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="sa-skeleton sa-skeleton--card" />
            ))}
          </div>
          <div className="sa-skeleton-grid sa-skeleton-grid--wide">
            <div className="sa-skeleton sa-skeleton--chart" />
            <div className="sa-skeleton sa-skeleton--chart" />
          </div>
        </div>
      ) : (
        <>
          <section className="sa-kpi-row" aria-label="Primary metrics">
            {primaryKpis.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  type="button"
                  className={`sa-kpi sa-kpi--${card.variant}`}
                  onClick={card.action}
                >
                  <span className={`sa-kpi__icon sa-kpi__icon--${card.variant}`}>
                    <Icon size={22} strokeWidth={1.75} />
                  </span>
                  <span className="sa-kpi__body">
                    <span className="sa-kpi__label">{card.label}</span>
                    <span className="sa-kpi__value">{card.value}</span>
                    <span className={`sa-kpi__hint sa-kpi__hint--${card.trend}`}>
                      {card.trend === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {card.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>

          <section className="sa-kpi-row sa-kpi-row--dense" aria-label="Secondary metrics">
            {secondaryKpis.map((card) => {
              const Icon = card.icon;
              return (
                <button key={card.label} type="button" className="sa-kpi sa-kpi--compact" onClick={card.action}>
                  <span className="sa-kpi__icon sa-kpi__icon--muted">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <span className="sa-kpi__body">
                    <span className="sa-kpi__label">{card.label}</span>
                    <span className="sa-kpi__value sa-kpi__value--sm">{card.value}</span>
                    <span className={`sa-kpi__hint sa-kpi__hint--${card.trend}`}>
                      {card.trend === 'up' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                      {card.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>

          <div className="sa-panels">
            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <DollarSign size={18} />
                  Revenue — {revenueChartTitle}
                </h2>
                <select
                  className="sa-select"
                  value={revenueTimeRange}
                  onChange={(e) => setRevenueTimeRange(e.target.value)}
                  aria-label="Revenue chart time range"
                >
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </div>
              <div className="sa-chart">
                {revenueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="saColorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartStroke.revenue} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={chartStroke.revenue} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke={chartStroke.revenue}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#saColorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="sa-chart-empty">No revenue in this window</div>
                )}
              </div>
            </section>

            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <TrendingUp size={18} />
                  User sign-ups (30 days)
                </h2>
              </div>
              <div className="sa-chart">
                {userGrowthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={userGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
                        }}
                      />
                      <Bar dataKey="users" fill={chartStroke.users} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="sa-chart-empty">No user growth data for this period</div>
                )}
              </div>
            </section>
          </div>

          <div className="sa-panels">
            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <FileText size={18} />
                  Questions created (30 days)
                </h2>
              </div>
              <div className="sa-chart">
                {questionsTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={questionsTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="questions"
                        stroke={chartStroke.questions}
                        strokeWidth={2.5}
                        dot={{ fill: chartStroke.questions, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="sa-chart-empty">No question creation data</div>
                )}
              </div>
            </section>

            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <Building2 size={18} />
                  Organizations by status
                </h2>
              </div>
              <div className="sa-chart">
                {orgStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsPieChart>
                      <Pie
                        data={orgStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        dataKey="value"
                      >
                        {orgStatusData.map((entry, index) => (
                          <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="sa-chart-empty">No organization data</div>
                )}
              </div>
            </section>
          </div>

          <div className="sa-panels">
            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <Activity size={18} />
                  Question review pipeline
                </h2>
              </div>
              <div className="sa-chart">
                {questionsStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={questionsStatusData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={88}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
                        }}
                      />
                      <Bar dataKey="value" fill="#1e3a8a" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="sa-chart-empty">No question status data</div>
                )}
              </div>
            </section>

            <section className="sa-panel sa-panel--chart">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <Users size={18} />
                  Roles (active)
                </h2>
              </div>
              <div className="sa-role-split">
                <div className="sa-chart sa-chart--pie">
                  {roleDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <RechartsPieChart>
                        <Pie
                          data={roleDistribution.filter((entry) => entry.value > 0)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={78}
                          dataKey="value"
                        >
                          {roleDistribution
                            .filter((entry) => entry.value > 0)
                            .map((entry, index) => (
                              <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="sa-chart-empty">No role data</div>
                  )}
                </div>
                <ul className="sa-role-legend">
                  {roleDistribution.map((role, index) => (
                    <li key={role.name} className="sa-role-legend__row">
                      <span
                        className="sa-role-legend__swatch"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="sa-role-legend__name">{role.name}</span>
                      <span className="sa-role-legend__val">{role.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <div className="sa-panels">
            <section className="sa-panel">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <Building2 size={18} />
                  Top organizations by users
                </h2>
                <button type="button" className="sa-btn sa-btn--outline" onClick={() => navigate('/admin/organizations')}>
                  View all
                  <ArrowRight size={14} />
                </button>
              </div>
              <ul className="sa-org-list">
                {topOrganizations.length === 0 ? (
                  <li className="sa-empty">No organization data</li>
                ) : (
                  topOrganizations.map((org, index) => (
                    <li key={org.name} className="sa-org-row">
                      <span className="sa-org-rank">{index + 1}</span>
                      <div className="sa-org-copy">
                        <span className="sa-org-name">{org.name}</span>
                        <span className="sa-org-meta">{org.users} active users</span>
                      </div>
                      <div className="sa-org-bar" aria-hidden>
                        <div
                          className="sa-org-bar__fill"
                          style={{
                            width: `${(org.users / (topOrganizations[0]?.users || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="sa-panel">
              <div className="sa-panel__head">
                <h2 className="sa-panel__title">
                  <Activity size={18} />
                  Capacity snapshot
                </h2>
                <button type="button" className="sa-btn sa-btn--outline" onClick={() => navigate('/admin/health')}>
                  Open health
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="sa-health">
                <div className="sa-health__row">
                  <span className="sa-health__label">CPU usage</span>
                  <span className={`sa-health__num ${stats.systemHealth.cpu > 80 ? 'sa-health__num--warn' : ''}`}>
                    {stats.systemHealth.cpu}%
                  </span>
                </div>
                <div className="sa-health__track">
                  <div
                    className={`sa-health__fill ${stats.systemHealth.cpu > 80 ? 'sa-health__fill--warn' : ''}`}
                    style={{ width: `${Math.min(stats.systemHealth.cpu, 100)}%` }}
                  />
                </div>
                <div className="sa-health__row">
                  <span className="sa-health__label">Avg. latency</span>
                  <span className="sa-health__num">{stats.systemHealth.latency} ms</span>
                </div>
                <div className="sa-health__track">
                  <div
                    className="sa-health__fill"
                    style={{ width: `${Math.min((stats.systemHealth.latency / 500) * 100, 100)}%` }}
                  />
                </div>
                <div className={`sa-status-pill sa-status-pill--${stats.systemHealth.status}`}>
                  <Activity size={14} />
                  System {stats.systemHealth.status}
                </div>
              </div>
            </section>
          </div>

          <section className="sa-panel sa-panel--activity">
            <div className="sa-panel__head sa-panel__head--activity">
              <div className="sa-panel__head-text">
                <h2 className="sa-panel__title sa-panel__title--activity">
                  <span className="sa-panel__title-icon" aria-hidden>
                    <History size={18} />
                  </span>
                  Recent platform activity
                </h2>
                <p className="sa-panel__subtitle">Latest audit trail from your platform log</p>
              </div>
              {recentAlerts.length > 5 && (
                <button type="button" className="sa-btn sa-btn--outline sa-btn--compact" onClick={() => setShowAllAlerts(!showAllAlerts)}>
                  {showAllAlerts ? 'Show less' : 'View all'}
                </button>
              )}
            </div>
            <div className="sa-activity-well">
              <ul className={`sa-alerts ${showAllAlerts ? 'sa-alerts--expanded' : ''}`}>
                {recentAlerts.length === 0 ? (
                  <li className="sa-empty sa-empty--activity">No recent log entries</li>
                ) : (
                  (showAllAlerts ? recentAlerts : recentAlerts.slice(0, 5)).map((alert) => {
                    const ts = formatActivityTimestamp(alert.timestamp);
                    return (
                      <li key={alert.id} className={`sa-alert sa-alert--${getAlertColor(alert.type)}`}>
                        <span className="sa-alert__icon" aria-hidden>
                          {getAlertIcon(alert.type)}
                        </span>
                        <div className="sa-alert__body">
                          <p className="sa-alert__msg">{alert.message}</p>
                          <time className="sa-alert__time" dateTime={alert.timestamp}>
                            {ts.date && (
                              <>
                                <span className="sa-alert__date">{ts.date}</span>
                                {ts.time ? (
                                  <>
                                    <span className="sa-alert__time-dot" aria-hidden>
                                      ·
                                    </span>
                                    <span className="sa-alert__clock">{ts.time}</span>
                                  </>
                                ) : null}
                              </>
                            )}
                          </time>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </section>

          <section className="sa-panel sa-panel--actions">
            <div className="sa-panel__head">
              <h2 className="sa-panel__title">
                <Zap size={18} />
                Quick actions
              </h2>
            </div>
            <div className="sa-actions">
              <button type="button" className="sa-action sa-action--primary" onClick={() => navigate('/admin/create-organization')}>
                <PlusCircle size={18} />
                Create organization
              </button>
              <button type="button" className="sa-action" onClick={() => navigate('/admin/create-platform-user')}>
                <UserPlus size={18} />
                Platform user
              </button>
              <button type="button" className="sa-action" onClick={() => navigate('/admin/subscription-plans')}>
                <Package size={18} />
                Subscription plans
              </button>
              <button type="button" className="sa-action" onClick={() => navigate('/admin/logs')}>
                <ScrollText size={18} />
                System logs
              </button>
              <button type="button" className="sa-action" onClick={() => navigate('/admin/settings')}>
                <Settings size={18} />
                Settings
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
