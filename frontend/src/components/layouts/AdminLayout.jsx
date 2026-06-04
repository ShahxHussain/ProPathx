import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  DollarSign,
  Activity,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  AlertTriangle,
  TrendingUp,
  UserPlus,
  PlusCircle,
  Bell,
  ScrollText,
  Package,
  ListChecks,
  CreditCard,
} from 'lucide-react';
import { orgAuth } from '../../services/api';
import NotificationBell from '../NotificationBell';
import AnnouncementBanner from '../AnnouncementBanner';
import ProfileMenu from '../ProfileMenu';
import './AdminLayout.css';

const AdminLayout = () => {
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
    navigate('/admin/login');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Building2, label: 'Organizations', path: '/admin/organizations' },
    { icon: PlusCircle, label: 'Create Organization', path: '/admin/create-organization' },
    { icon: Users, label: 'Users', path: '/admin/users' },
    { icon: UserPlus, label: 'Create Platform User', path: '/admin/create-platform-user' },
    { icon: FileText, label: 'Exams & Content', path: '/admin/exams' },
    { icon: ListChecks, label: 'Question Bank', path: '/admin/questions' },
    { icon: Package, label: 'Subscription Plans', path: '/admin/subscription-plans' },
    { icon: CreditCard, label: 'Subscriptions & Usage', path: '/admin/subscriptions' },
    { icon: ScrollText, label: 'System Logs', path: '/admin/logs' },
    { icon: Bell, label: 'Create Notification', path: '/admin/create-notification' },
    { icon: DollarSign, label: 'Revenue & Payments', path: '/admin/revenue' },
    { icon: Activity, label: 'System Health', path: '/admin/health' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="dashboard-layout admin-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Shield size={24} />
            <span className="logo-text">ProPath Admin</span>
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
          <div className="org-info admin-info">
            <div className="org-name">Super Administrator</div>
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
            <ProfileMenu user={user} profilePath="/admin/profile" onLogout={handleLogout} />
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

export default AdminLayout;

