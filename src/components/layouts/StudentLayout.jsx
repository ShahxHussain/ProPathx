import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Bell,
  Package,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { studentAuth } from '../../services/api';
import NotificationBell from '../NotificationBell';
import AnnouncementBanner from '../AnnouncementBanner';
import '../../pages/student/student-theme.css';
import './DashboardLayout.css';
import './StudentLayout.css';
import '../../pages/student/student-portal-overrides.css';

const StudentLayout = () => {
  // Start with sidebar closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const navigate = useNavigate();
  const location = useLocation();
  const user = studentAuth.getCurrentUserSync();
  const enrollmentType = String(user?.enrollmentType ?? user?.EnrollmentType ?? '').toLowerCase();
  const orgId = user?.orgId ?? user?.OrgID ?? user?.orgID ?? null;
  const isIndividualStudent = enrollmentType === 'individual' || orgId == null || orgId === '';

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    studentAuth.logout();
    navigate('/');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/student/dashboard' },
    { icon: Sparkles, label: 'Self Test Builder', path: '/student/self-test' },
    { icon: BookOpen, label: 'My Assignments', path: '/student/assignments' },
    {
      icon: BarChart2,
      label: 'Results & reports',
      path: '/student/reports',
      isActive: (pathname) =>
        pathname === '/student/reports' || /^\/student\/test\/[^/]+\/results$/.test(pathname),
    },
    ...(isIndividualStudent
      ? [{ icon: Package, label: 'Subscription Plans', path: '/student/subscription-plans' }]
      : []),
    { icon: Bell, label: 'Notifications', path: '/student/notifications' },
  ];

  const navItemActive = (item) => {
    if (typeof item.isActive === 'function') return item.isActive(location.pathname);
    return location.pathname === item.path;
  };

  return (
    <div className="dashboard-layout student-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <GraduationCap size={24} />
            <span className="logo-text">ProPath Student</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className="sidebar-content">
          <div className="org-info">
            <div className="org-name">
              {user?.orgName ||
                (user?.enrollmentType === 'Individual' || !user?.orgId
                  ? 'Individual account'
                  : 'Organization')}
            </div>
            <div className="org-email">{user?.email || ''}</div>
            <div className="user-role">Student</div>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  className={`nav-item ${navItemActive(item) ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <Icon size={20} />
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item logout" onClick={handleLogout}>
            <LogOut size={20} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        <AnnouncementBanner />
        <div className="dashboard-header">
          <div className="header-left">
            <button
              className="mobile-menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="header-right">
            <NotificationBell />
          </div>
        </div>
        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default StudentLayout;
