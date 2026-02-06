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
  Search,
  Bell,
  ScrollText,
  Package,
  GraduationCap,
  UsersRound,
  List,
} from 'lucide-react';
import { orgAuth } from '../../services/api';
import NotificationBell from '../NotificationBell';
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
    { icon: Users, label: 'Users', path: '/org/users' },
    { icon: GraduationCap, label: 'Students', path: '/org/students' },
    { icon: UsersRound, label: 'Groups', path: '/org/groups' },
    { icon: Search, label: 'Explore Exams', path: '/org/explore-exams' },
    { icon: Package, label: 'Subscription Plans', path: '/org/subscription-plans' },
    { icon: FileText, label: 'Tests', path: '/org/tests' },
    { icon: List, label: 'Assigned Tests', path: '/org/test-assignments' },
    { icon: ScrollText, label: 'System Logs', path: '/org/logs' },
    { icon: Bell, label: 'Create Notification', path: '/org/create-notification' },
    { icon: Settings, label: 'Settings', path: '/org/settings' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Building2 size={24} />
            <span className="logo-text">ProPath</span>
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
        <div className="dashboard-header">
          <button
            className="mobile-menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
          <div className="header-title">
            {menuItems.find((item) => isActive(item.path))?.label || 'Dashboard'}
          </div>
          <div className="header-actions">
            <NotificationBell />
            <div className="header-user">
              <div className="user-info">
                <div className="user-name">{user?.fullName || 'Admin'}</div>
                <div className="user-role">{user?.role || 'OrgAdmin'}</div>
              </div>
            </div>
          </div>
        </div>

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



