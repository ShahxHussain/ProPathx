import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  DollarSign,
  Activity,
  TrendingUp,
  AlertTriangle,
  Users,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  PieChart,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  GraduationCap,
  Package,
  Shield,
  Zap,
  PlusCircle,
  UserPlus,
  ScrollText,
  Settings,
  Eye,
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
import { adminAPI } from '../../services/api';
import './Dashboard.css';

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

      const response = await adminAPI.getDashboardStats();

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
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: Building2,
      label: 'Active Organizations',
      value: stats.activeOrgs,
      change: `${stats.totalOrgs || 0} Total`,
      trend: 'up',
      color: 'blue',
      action: () => navigate('/admin/organizations'),
    },
    {
      icon: DollarSign,
      label: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      change: 'All Time',
      trend: 'up',
      color: 'green',
      action: () => navigate('/admin/revenue'),
    },
    {
      icon: Users,
      label: 'Total Users',
      value: stats.totalUsers,
      change: 'Platform & Org Users',
      trend: 'up',
      color: 'purple',
      action: () => navigate('/admin/users'),
    },
    {
      icon: GraduationCap,
      label: 'Total Students',
      value: stats.totalStudents,
      change: 'Active Students',
      trend: 'up',
      color: 'teal',
      action: () => navigate('/admin/organizations'),
    },
    {
      icon: FileText,
      label: 'Total Questions',
      value: stats.totalQuestions || 0,
      change: `${stats.approvedQuestions || 0} Approved`,
      trend: 'up',
      color: 'orange',
      action: () => navigate('/admin/exams'),
    },
    {
      icon: BarChart3,
      label: 'Total Tests',
      value: stats.totalTests || 0,
      change: `${stats.totalStudents || 0} Students`,
      trend: 'up',
      color: 'indigo',
      action: () => navigate('/admin/organizations'),
    },
    {
      icon: Activity,
      label: 'System Health',
      value: stats.systemHealth.status === 'healthy' ? 'Healthy' : 'Warning',
      change: `CPU: ${stats.systemHealth.cpu}%`,
      trend: stats.systemHealth.cpu > 80 ? 'down' : 'up',
      color: stats.systemHealth.cpu > 80 ? 'red' : 'green',
      action: () => navigate('/admin/health'),
    },
    {
      icon: Shield,
      label: 'Pending Reviews',
      value: stats.pendingQuestions || 0,
      change: `${stats.rejectedQuestions || 0} Rejected`,
      trend: stats.pendingQuestions > 0 ? 'down' : 'up',
      color: stats.pendingQuestions > 0 ? 'yellow' : 'green',
      action: () => navigate('/admin/exams'),
    },
  ];

  const COLORS = ['#1e3a8a', '#14b8a6', '#8b5cf6', '#f97316', '#ef4444', '#22c55e'];
  const PIE_COLORS = ['#1e3a8a', '#14b8a6', '#f97316', '#ef4444', '#8b5cf6', '#10b981'];

  const getAlertIcon = (type) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="alert-icon error" />;
      case 'warning':
        return <AlertTriangle className="alert-icon warning" />;
      case 'success':
        return <Activity className="alert-icon success" />;
      default:
        return <Clock className="alert-icon info" />;
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

  return (
    <div className="admin-dashboard">
      <div className="page-header">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="page-subtitle">Complete system overview and monitoring</p>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading dashboard data...</div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="stats-grid">
            {statCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <div
                  key={index}
                  className="stat-card"
                  onClick={card.action}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={`stat-icon stat-icon-${card.color}`}>
                    <Icon size={24} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                    <div className={`stat-change stat-change-${card.trend}`}>
                      {card.trend === 'up' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                      <span>{card.change}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts Row 1: Revenue & User Growth */}
          <div className="dashboard-grid">
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <DollarSign size={20} />
                  Revenue Trend (Last 7 Days)
                </h2>
                <select
                  className="time-filter"
                  value={revenueTimeRange}
                  onChange={(e) => setRevenueTimeRange(e.target.value)}
                >
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                </select>
              </div>
              <div className="chart-container">
                {revenueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#475569" />
                      <YAxis stroke="#475569" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#14b8a6"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No revenue data available</div>
                )}
              </div>
            </div>

            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <TrendingUp size={20} />
                  User Growth (Last 30 Days)
                </h2>
              </div>
              <div className="chart-container">
                {userGrowthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={userGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#475569" />
                      <YAxis stroke="#475569" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="users" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No user growth data available</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 2: Questions Trend & Organization Status */}
          <div className="dashboard-grid">
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <FileText size={20} />
                  Questions Created Trend (Last 30 Days)
                </h2>
              </div>
              <div className="chart-container">
                {questionsTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={questionsTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#475569" />
                      <YAxis stroke="#475569" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="questions"
                        stroke="#f97316"
                        strokeWidth={3}
                        dot={{ fill: '#f97316', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No question creation data available</div>
                )}
              </div>
            </div>

            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <Building2 size={20} />
                  Organization Status Distribution
                </h2>
              </div>
              <div className="chart-container">
                {orgStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RechartsPieChart>
                      <Pie
                        data={orgStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {orgStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No organization data available</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 3: Questions Status & User Roles */}
          <div className="dashboard-grid">
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <CheckCircle size={20} />
                  Questions Status Distribution
                </h2>
              </div>
              <div className="chart-container">
                {questionsStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={questionsStatusData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#475569" />
                      <YAxis dataKey="name" type="category" stroke="#475569" width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" fill="#1e3a8a" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No question status data available</div>
                )}
              </div>
            </div>

            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <Users size={20} />
                  User Role Distribution
                </h2>
              </div>
              <div className="role-chart-wrapper">
                <div className="chart-container role-chart">
                  {roleDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsPieChart>
                      <Pie
                        data={roleDistribution.filter((entry) => entry.value > 0)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {roleDistribution
                          .filter((entry) => entry.value > 0)
                          .map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  ) : (
                    <div className="chart-empty">No role distribution data available</div>
                  )}
                </div>
                <div className="role-distribution-list">
                  {roleDistribution.map((role, index) => (
                    <div key={index} className="role-item">
                      <div className="role-color" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="role-name">{role.name}</span>
                      <span className="role-value">{role.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top Organizations & System Health */}
          <div className="dashboard-grid">
            <div className="dashboard-section">
              <div className="section-header">
                <h2>
                  <Building2 size={20} />
                  Top Organizations by Users
                </h2>
                <button
                  className="btn-view-all"
                  onClick={() => navigate('/admin/organizations')}
                >
                  View All
                  <ArrowRight size={14} style={{ marginLeft: '4px' }} />
                </button>
              </div>
              <div className="top-orgs-list">
                {topOrganizations.length === 0 ? (
                  <div className="empty-state">No organization data available</div>
                ) : (
                  topOrganizations.map((org, index) => (
                    <div key={index} className="top-org-item">
                      <div className="org-rank">#{index + 1}</div>
                      <div className="org-info">
                        <div className="org-name">{org.name}</div>
                        <div className="org-users">{org.users} active users</div>
                      </div>
                      <div className="org-bar">
                        <div
                          className="org-bar-fill"
                          style={{
                            width: `${(org.users / (topOrganizations[0]?.users || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="dashboard-section">
              <div className="section-header">
                <h2>
                  <Activity size={20} />
                  System Health
                </h2>
              </div>
              <div className="health-metrics">
                <div className="health-metric">
                  <div className="metric-header">
                    <span>CPU Usage</span>
                    <span className={`metric-value ${stats.systemHealth.cpu > 80 ? 'warning' : ''}`}>
                      {stats.systemHealth.cpu}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${stats.systemHealth.cpu > 80 ? 'warning' : ''}`}
                      style={{ width: `${stats.systemHealth.cpu}%` }}
                    />
                  </div>
                </div>

                <div className="health-metric">
                  <div className="metric-header">
                    <span>Average Latency</span>
                    <span className="metric-value">{stats.systemHealth.latency}ms</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min((stats.systemHealth.latency / 500) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="health-status">
                  <div className={`status-badge status-${stats.systemHealth.status}`}>
                    <Activity size={16} />
                    <span>System {stats.systemHealth.status}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <AlertTriangle size={20} />
                Recent System Activity
              </h2>
              {recentAlerts.length > 5 && (
                <button
                  className="btn-view-all"
                  onClick={() => {
                    setShowAllAlerts(!showAllAlerts);
                  }}
                >
                  {showAllAlerts ? 'Show Less' : 'View All'}
                </button>
              )}
            </div>
            <div className={`alerts-list ${showAllAlerts ? 'show-all' : ''}`}>
              {recentAlerts.length === 0 ? (
                <div className="empty-state">No recent activity</div>
              ) : (
                (showAllAlerts ? recentAlerts : recentAlerts.slice(0, 5)).map((alert) => (
                  <div key={alert.id} className={`alert-item alert-${getAlertColor(alert.type)}`}>
                    <div className="alert-icon-wrapper">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="alert-content">
                      <div className="alert-message">{alert.message}</div>
                      <div className="alert-time">
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>
                <Zap size={20} />
                Quick Actions
              </h2>
            </div>
            <div className="quick-actions">
              <button
                className="action-btn primary"
                onClick={() => navigate('/admin/create-organization')}
              >
                <PlusCircle size={18} />
                <span>Create Organization</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate('/admin/create-platform-user')}
              >
                <UserPlus size={18} />
                <span>Create Platform User</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate('/admin/subscription-plans')}
              >
                <Package size={18} />
                <span>Manage Subscription Plans</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate('/admin/logs')}
              >
                <ScrollText size={18} />
                <span>View System Logs</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
