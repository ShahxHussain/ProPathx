import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  X,
  Check,
  FileText,
  CircleDollarSign,
  GraduationCap,
  Clock3,
  TriangleAlert,
  Info,
} from 'lucide-react';
import { notificationAPI } from '../../services/api';
import './NotificationBell.css';

const NotificationBell = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
      if (isOpen) {
        loadNotifications();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationAPI.getNotifications();
      setNotifications(response.notifications || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await notificationAPI.getUnreadCount();
      setUnreadCount(response.unreadCount || 0);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      loadNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (notificationId, e) => {
    e.stopPropagation();
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.NotificationID === notificationId
            ? { ...notif, IsRead: true, ReadAt: new Date().toISOString() }
            : notif
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async (e) => {
    e.stopPropagation();
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, IsRead: true, ReadAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getNotificationIcon = (type, size = 16) => {
    switch (type) {
      case 'Payment':
        return <CircleDollarSign size={size} />;
      case 'Exam':
        return <FileText size={size} />;
      case 'Result':
        return <GraduationCap size={size} />;
      case 'Reminder':
        return <Clock3 size={size} />;
      case 'Alert':
        return <TriangleAlert size={size} />;
      default:
        return <Info size={size} />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'Payment':
        return 'green';
      case 'Exam':
        return 'purple';
      case 'Result':
        return 'gold';
      case 'Reminder':
        return 'orange';
      case 'Alert':
        return 'red';
      default:
        return 'blue';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const unreadNotifications = notifications.filter((n) => !n.IsRead);
  const readNotifications = notifications.filter((n) => n.IsRead);

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button className="notification-bell" onClick={handleToggle} aria-label="Notifications">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="mark-all-read-btn" onClick={handleMarkAllAsRead}>
                <Check size={16} />
                Mark all read
              </button>
            )}
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-loading">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <Bell size={32} />
                <p>No notifications</p>
              </div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div className="notification-section">
                    <div className="section-label">New</div>
                    {unreadNotifications.map((notification) => (
                      <div
                        key={notification.NotificationID}
                        className={`notification-item notification-item-${getNotificationColor(
                          notification.NotificationType
                        )} unread`}
                        onClick={() => handleMarkAsRead(notification.NotificationID, { stopPropagation: () => {} })}
                      >
                        <div className="notification-icon">{getNotificationIcon(notification.NotificationType)}</div>
                        <div className="notification-content">
                          <div className="notification-title">{notification.Title}</div>
                          <div className="notification-message">{notification.Message}</div>
                          <div className="notification-time">{formatTime(notification.CreatedAt)}</div>
                        </div>
                        <button
                          className="mark-read-btn"
                          onClick={(e) => handleMarkAsRead(notification.NotificationID, e)}
                          title="Mark as read"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {readNotifications.length > 0 && (
                  <div className="notification-section">
                    <div className="section-label">Earlier</div>
                    {readNotifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.NotificationID}
                        className={`notification-item notification-item-${getNotificationColor(
                          notification.NotificationType
                        )}`}
                      >
                        <div className="notification-icon">{getNotificationIcon(notification.NotificationType)}</div>
                        <div className="notification-content">
                          <div className="notification-title">{notification.Title}</div>
                          <div className="notification-message">{notification.Message}</div>
                          <div className="notification-time">{formatTime(notification.CreatedAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-footer">
              <button
                className="view-all-link"
                onClick={() => {
                  setIsOpen(false);
                  // Navigate based on current path
                  const currentPath = window.location.pathname;
                  if (currentPath.startsWith('/admin')) {
                    navigate('/admin/notifications');
                  } else if (currentPath.startsWith('/org')) {
                    navigate('/org/notifications');
                  } else if (currentPath.startsWith('/reviewer')) {
                    navigate('/reviewer/notifications');
                  } else if (currentPath.startsWith('/expert')) {
                    navigate('/expert/notifications');
                  } else if (currentPath.startsWith('/student')) {
                    navigate('/student/notifications');
                  } else {
                    navigate('/notifications');
                  }
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

