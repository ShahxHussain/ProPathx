import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  BookOpen,
  Sparkles,
  Bell,
  ScrollText,
  Package,
  GraduationCap,
  UsersRound,
  List,
  BookOpenCheck,
  BookMarked,
} from 'lucide-react';
import { orgAuth } from '../../services/api';
import NotificationBell from '../NotificationBell';
import AnnouncementBanner from '../AnnouncementBanner';
import ProfileMenu from '../ProfileMenu';
import './DashboardLayout.css';

const DashboardLayout = () => {
  // Start with sidebar closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const navigate = useNavigate();
  const location = useLocation();
  const user = orgAuth.getCurrentUser();

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
    orgAuth.logout();
    navigate('/');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/org/dashboard' },
    { icon: Sparkles, label: 'Explore exams', path: '/org/explore-exams' },
    { icon: Package, label: 'Subscription plans', path: '/org/subscription-plans' },
    { icon: Users, label: 'Users', path: '/org/users' },
    { icon: GraduationCap, label: 'Students', path: '/org/students' },
    { icon: BookMarked, label: 'Exam enrollments', path: '/org/student-exam-enrollments' },
    { icon: UsersRound, label: 'Groups', path: '/org/groups' },
    { icon: FileText, label: 'Tests', path: '/org/tests' },
    { icon: BookOpenCheck, label: 'Questions in Tests', path: '/org/test-questions' },
    { icon: BookOpen, label: 'Question Bank', path: '/org/question-bank' },
    { icon: List, label: 'Assigned Tests', path: '/org/test-assignments' },
    { icon: Bell, label: 'Notifications', path: '/org/notifications' },
    { icon: ScrollText, label: 'System Logs', path: '/org/logs' },
    { icon: Bell, label: 'Create Notification', path: '/org/create-notification' },
    { icon: Settings, label: 'Settings', path: '/org/settings' },
  ];

  const isActive = (path) => {
    if (path === '/org/test-questions') return location.pathname === path || location.pathname.startsWith('/org/test-questions/');
    return location.pathname === path;
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  const handleNavClick = (path) => {
    navigate(path);
    closeSidebarOnMobile();
  };

  return (
    <div className="dashboard-layout org-portal">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Building2 size={24} />
            <span className="logo-text">ProPath</span>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="org-info">
            <div className="org-name">{user?.orgName || 'Organization'}</div>
            <div className="org-email">{user?.email || ''}</div>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.path)}
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
        <div className="dashboard-header">
          <div className="dashboard-header__start">
            <button
              className="mobile-menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              <Menu size={24} />
            </button>
            <div className="header-title">
              {location.pathname.endsWith('/profile')
                ? 'My profile'
                : menuItems.find((item) => isActive(item.path))?.label || 'Dashboard'}
            </div>
          </div>
          <div className="header-actions">
            <NotificationBell />
            <ProfileMenu user={user} profilePath="/org/profile" onLogout={handleLogout} />
          </div>
        </div>

        <AnnouncementBanner />

        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default DashboardLayout;



