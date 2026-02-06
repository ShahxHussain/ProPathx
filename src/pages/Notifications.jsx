import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, Filter, CheckCircle2 } from 'lucide-react';
import { notificationAPI } from '../services/api';
import './Notifications.css';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const [typeFilter, setTypeFilter] = useState('all'); // all, System, Payment, Exam, etc.

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [notifications, filter, typeFilter]);

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

  const applyFilters = () => {
    let filtered = [...notifications];

    // Apply read/unread filter
    if (filter === 'unread') {
      filtered = filtered.filter((n) => !n.IsRead);
    } else if (filter === 'read') {
      filtered = filtered.filter((n) => n.IsRead);
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((n) => n.NotificationType === typeFilter);
    }

    setFilteredNotifications(filtered);
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.NotificationID === notificationId
            ? { ...notif, IsRead: true, ReadAt: new Date().toISOString() }
            : notif
        )
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) =>
        prev.map((notif) => ({ ...notif, IsRead: true, ReadAt: new Date().toISOString() }))
      );
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (notificationId) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) {
      return;
    }

    try {
      await notificationAPI.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((notif) => notif.NotificationID !== notificationId));
    } catch (error) {
      console.error('Failed to delete notification:', error);
      alert('Failed to delete notification');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'Payment':
        return '💰';
      case 'Exam':
        return '📝';
      case 'Result':
        return '🎓';
      case 'Reminder':
        return '⏰';
      case 'Alert':
        return '⚠️';
      default:
        return 'ℹ️';
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

  const unreadCount = notifications.filter((n) => !n.IsRead).length;

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p className="subtitle">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn-mark-all-read" onClick={handleMarkAllAsRead}>
            <CheckCircle2 size={18} />
            Mark all as read
          </button>
        )}
      </div>

      <div className="notifications-filters">
        <div className="filter-group">
          <Filter size={16} />
          <span>Filter:</span>
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({notifications.length})
          </button>
          <button
            className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
          <button
            className={`filter-btn ${filter === 'read' ? 'active' : ''}`}
            onClick={() => setFilter('read')}
          >
            Read ({notifications.length - unreadCount})
          </button>
        </div>

        <div className="filter-group">
          <span>Type:</span>
          <select
            className="type-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="System">System</option>
            <option value="Payment">Payment</option>
            <option value="Exam">Exam</option>
            <option value="Result">Result</option>
            <option value="Reminder">Reminder</option>
            <option value="Alert">Alert</option>
          </select>
        </div>
      </div>

      <div className="notifications-list">
        {loading ? (
          <div className="loading-state">
            <Bell size={48} />
            <p>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <Bell size={64} />
            <h2>No notifications found</h2>
            <p>
              {filter === 'unread'
                ? "You're all caught up! No unread notifications."
                : filter === 'read'
                ? 'No read notifications found.'
                : typeFilter !== 'all'
                ? `No ${typeFilter} notifications found.`
                : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <div
              key={notification.NotificationID}
              className={`notification-card notification-card-${getNotificationColor(
                notification.NotificationType
              )} ${!notification.IsRead ? 'unread' : ''}`}
            >
              <div className="notification-icon-large">{getNotificationIcon(notification.NotificationType)}</div>
              <div className="notification-content-full">
                <div className="notification-header-card">
                  <h3>{notification.Title}</h3>
                  <div className="notification-type-badge">{notification.NotificationType}</div>
                </div>
                <p className="notification-message-full">{notification.Message}</p>
                <div className="notification-footer-card">
                  <span className="notification-time-full">{formatTime(notification.CreatedAt)}</span>
                  {notification.IsRead && notification.ReadAt && (
                    <span className="notification-read-time">Read {formatTime(notification.ReadAt)}</span>
                  )}
                </div>
              </div>
              <div className="notification-actions">
                {!notification.IsRead && (
                  <button
                    className="action-btn mark-read"
                    onClick={() => handleMarkAsRead(notification.NotificationID)}
                    title="Mark as read"
                  >
                    <Check size={18} />
                  </button>
                )}
                <button
                  className="action-btn delete"
                  onClick={() => handleDelete(notification.NotificationID)}
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Notifications;



