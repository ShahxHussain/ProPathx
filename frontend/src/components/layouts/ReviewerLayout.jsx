import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileCheck,
  Users,
  LogOut,
  Menu,
  X,
  ClipboardCheck,
  Bell,
} from 'lucide-react';
import { orgAuth } from '../../services/api';
import NotificationBell from '../NotificationBell';
import AnnouncementBanner from '../AnnouncementBanner';
import ProfileMenu from '../ProfileMenu';
import './ReviewerLayout.css';

const ReviewerLayout = () => {
  // Start with sidebar closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

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
  const navigate = useNavigate();
  const location = useLocation();
  const user = orgAuth.getCurrentUser();

  const handleLogout = () => {
    orgAuth.logout();
    navigate('/');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/reviewer/dashboard' },
    { icon: FileCheck, label: 'Pending Questions', path: '/reviewer/questions' },
    { icon: ClipboardCheck, label: 'Approved Questions', path: '/reviewer/approved' },
    { icon: Users, label: 'Expert Performance', path: '/reviewer/experts' },
    { icon: Bell, label: 'Notifications', path: '/reviewer/notifications' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="dashboard-layout reviewer-layout reviewer-portal">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <ClipboardCheck size={24} />
            <span className="logo-text">ProPath Reviewer</span>
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
              {user?.userType === 'Platform' 
                ? 'Platform Reviewer' 
                : user?.orgName || 'Organization'}
            </div>
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
        <AnnouncementBanner />
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
            <ProfileMenu user={user} profilePath="/reviewer/profile" onLogout={handleLogout} />
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

export default ReviewerLayout;



