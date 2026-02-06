import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  FileText, 
  Award, 
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
  Bell
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

const COLORS = ['#1e3a8a', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#10b981'];

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
      
      // Load dashboard stats
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
      
      // Format role distribution for pie chart
      const roleData = response.roleDistribution || {};
      setRoleDistribution([
        { name: 'OrgAdmin', value: roleData.OrgAdmin || 0 },
        { name: 'Reviewer', value: roleData.Reviewer || 0 },
        { name: 'Subject Expert', value: roleData['Subject Expert'] || 0 },
      ].filter(item => item.value > 0));

      // Format test status for bar chart
      const statusData = response.testStatusData || {};
      setTestStatusData([
        { name: 'Active', value: statusData.Active || 0 },
        { name: 'Inactive', value: statusData.Inactive || 0 },
        { name: 'Completed', value: statusData.Completed || 0 },
      ]);

      // Load subscription info
      try {
        const subResponse = await orgDashboard.getSubscriptions();
        if (subResponse.subscriptions && subResponse.subscriptions.length > 0) {
          const activeSubs = subResponse.subscriptions.filter(
            sub => sub.Status === 'Active' && new Date(sub.EndDate) >= new Date()
          );
          setSubscriptionInfo({
            active: activeSubs.length > 0,
            count: activeSubs.length,
            subscriptions: activeSubs,
          });
        }
      } catch (subErr) {
        console.error('Failed to load subscription info:', subErr);
      }

      // Load recent activity (logs)
      try {
        const logsResponse = await orgDashboard.getLogs({ page: 1, limit: 10 });
        setRecentActivity(logsResponse.logs || []);
      } catch (logsErr) {
        console.error('Failed to load recent activity:', logsErr);
      }

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: Users,
      label: 'Total Users',
      value: stats.totalUsers,
      color: 'blue',
      trend: null,
      action: () => navigate('/org/users'),
    },
    {
      icon: GraduationCap,
      label: 'Students',
      value: stats.totalStudents,
      color: 'green',
      trend: null,
      action: () => navigate('/org/students'),
    },
    {
      icon: FileText,
      label: 'Total Tests',
      value: stats.totalTests,
      color: 'indigo',
      trend: null,
      action: () => navigate('/org/tests'),
    },
    {
      icon: Activity,
      label: 'Active Tests',
      value: stats.activeTests,
      color: 'orange',
      trend: stats.totalTests > 0 ? `${Math.round((stats.activeTests / stats.totalTests) * 100)}%` : '0%',
      action: () => navigate('/org/tests'),
    },
    {
      icon: CheckCircle,
      label: 'Completed Tests',
      value: stats.completedTests,
      color: 'purple',
      trend: stats.totalTests > 0 ? `${Math.round((stats.completedTests / stats.totalTests) * 100)}%` : '0%',
      action: () => navigate('/org/tests'),
    },
    {
      icon: UsersRound,
      label: 'Student Groups',
      value: stats.totalGroups,
      color: 'teal',
      trend: null,
      action: () => navigate('/org/groups'),
    },
    {
      icon: Target,
      label: 'Questions',
      value: stats.totalQuestions,
      color: 'pink',
      trend: stats.totalQuestions > 0 
        ? `${stats.approvedQuestions} approved, ${stats.pendingQuestions} pending`
        : 'No questions',
      action: null,
    },
    {
      icon: Package,
      label: 'Subscriptions',
      value: subscriptionInfo?.count || 0,
      color: 'amber',
      trend: subscriptionInfo?.active ? 'Active' : 'No Active Subscription',
      action: () => navigate('/org/subscription-plans'),
    },
  ];

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'Create': return <Plus size={14} />;
      case 'Update': return <Settings size={14} />;
      case 'Delete': return <AlertCircle size={14} />;
      case 'View': return <Eye size={14} />;
      default: return <Activity size={14} />;
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <h1>Organization Dashboard</h1>
          <p className="page-subtitle">Complete system overview at a glance</p>
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
            <h1>Organization Dashboard</h1>
            <p className="page-subtitle">Complete system overview at a glance</p>
          </div>
          <div className="header-actions-dashboard">
            <button
              className="action-btn-header"
              onClick={() => navigate('/org/tests')}
            >
              <Plus size={18} />
              <span>Create Test</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Subscription Status Banner */}
      {subscriptionInfo && (
        <div className={`subscription-banner ${subscriptionInfo.active ? 'success' : 'warning'}`}>
          {subscriptionInfo.active ? (
            <>
              <CheckCircle size={20} />
              <div>
                <strong>Active Subscription{subscriptionInfo.count > 1 ? 's' : ''} ({subscriptionInfo.count})</strong>
                <p>
                  {subscriptionInfo.subscriptions.map((sub, idx) => (
                    <span key={sub.SubscriptionID}>
                      {sub.PlanName || 'Plan'} - Valid until {new Date(sub.EndDate).toLocaleDateString()}
                      {idx < subscriptionInfo.subscriptions.length - 1 ? ' • ' : ''}
                    </span>
                  ))}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={20} />
              <div>
                <strong>No Active Subscription</strong>
                <p>Your organization needs an active subscription to access all features. Please contact support.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="stats-grid">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div 
              key={index} 
              className={`stat-card ${card.action ? 'clickable' : ''}`}
              onClick={card.action || undefined}
            >
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
              {card.action && (
                <ArrowRight size={18} className="stat-arrow" />
              )}
            </div>
          );
        })}
      </div>

      {/* Main Dashboard Grid */}
      <div className="dashboard-main-grid">
        {/* Left Column - Analytics & Charts */}
        <div className="dashboard-left-column">
          {/* User Growth Chart */}
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
                  <AreaChart data={userGrowthData}>
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
                      dataKey="users"
                      stroke="#1e3a8a"
                      fill="#1e3a8a"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No user growth data available</div>
              )}
            </div>
          </div>

          {/* Test Creation Trend */}
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <BarChart3 size={20} />
                Test Creation Trend (Last 30 Days)
              </h2>
            </div>
            <div className="chart-container">
              {testGrowthData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={testGrowthData}>
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
                      dataKey="tests"
                      stroke="#14b8a6"
                      strokeWidth={3}
                      dot={{ fill: '#14b8a6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No test creation data available</div>
              )}
            </div>
          </div>

          {/* Student Attempts Trend */}
          {attemptsTrendData.length > 0 && (
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <Activity size={20} />
                  Student Attempts Trend (Last 30 Days)
                </h2>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={attemptsTrendData}>
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
                      dataKey="attempts"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Distribution & Activity */}
        <div className="dashboard-right-column">
          {/* Role Distribution */}
          {roleDistribution.length > 0 && (
            <div className="dashboard-section chart-section">
              <div className="section-header">
                <h2>
                  <PieChart size={20} />
                  User Role Distribution
                </h2>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPieChart>
                    <Pie
                      data={roleDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {roleDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Test Status Distribution */}
          <div className="dashboard-section chart-section">
            <div className="section-header">
              <h2>
                <FileText size={20} />
                Test Status Distribution
              </h2>
            </div>
            <div className="chart-container">
              {testStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={testStatusData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#475569" />
                    <YAxis stroke="#475569" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No test status data available</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Recent Activity & System Overview */}
      <div className="dashboard-bottom-section">
        {/* Recent Activity */}
        <div className="dashboard-section full-width">
          <div className="section-header">
            <h2>
              <Clock size={20} />
              Recent Activity
            </h2>
            <button 
              className="view-all-link"
              onClick={() => navigate('/org/logs')}
            >
              View All Logs
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="activity-container">
            {recentActivity.length > 0 ? (
              <div className="activity-list">
                {recentActivity.slice(0, 8).map((activity, index) => (
                  <div key={index} className="activity-item">
                    <div className="activity-icon">
                      {getActionIcon(activity.ActionType)}
                    </div>
                    <div className="activity-content">
                      <div className="activity-description">
                        {activity.Description || `${activity.ActionType} ${activity.EntityType}`}
                      </div>
                      <div className="activity-meta">
                        <span className="activity-actor">
                          {activity.ActorType} • {activity.EntityType}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
