import { useState, useEffect } from 'react';
import {
  Bell,
  Check,
  Filter,
  CheckCircle2,
  FileText,
  CircleDollarSign,
  GraduationCap,
  Clock3,
  TriangleAlert,
  Info,
  Trash2,
  X,
} from 'lucide-react';
import { notificationAPI } from '../services/api';
import './Notifications.css';

const TYPE_META = {
  System: { tone: 'system', icon: Info, label: 'System' },
  Payment: { tone: 'payment', icon: CircleDollarSign, label: 'Payment' },
  Exam: { tone: 'exam', icon: FileText, label: 'Exam' },
  Result: { tone: 'result', icon: GraduationCap, label: 'Result' },
  Reminder: { tone: 'reminder', icon: Clock3, label: 'Reminder' },
  Alert: { tone: 'alert', icon: TriangleAlert, label: 'Alert' },
};

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, filter, typeFilter]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await notificationAPI.getNotifications();
      const rows = Array.isArray(response?.notifications) ? response.notifications : [];
      setNotifications(rows);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setLoadError(error?.message || 'Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...notifications];
    if (filter === 'unread') {
      filtered = filtered.filter((n) => !n.IsRead);
    } else if (filter === 'read') {
      filtered = filtered.filter((n) => n.IsRead);
    }
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
    if (!window.confirm('Delete this notification?')) return;
    try {
      await notificationAPI.deleteNotification(notificationId);
      setNotifications((prev) => prev.filter((notif) => notif.NotificationID !== notificationId));
      if (selectedNotification?.NotificationID === notificationId) {
        setSelectedNotification(null);
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
      alert('Failed to delete notification');
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
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return '—';
    }
  };

  const unreadCount = notifications.filter((n) => !n.IsRead).length;
  const readCount = notifications.length - unreadCount;

  const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.System;

  return (
    <div className="notifications-page">
      <header className="notif-header">
        <div className="notif-header__main">
          <h1>Notifications</h1>
          <p className="notif-header__sub">
            {unreadCount > 0
              ? `${unreadCount} unread · ${notifications.length} total`
              : 'All caught up — no unread notifications'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="notif-btn notif-btn--primary" onClick={handleMarkAllAsRead}>
            <CheckCircle2 size={17} />
            Mark all read
          </button>
        )}
      </header>

      <div className="notif-toolbar">
        <div className="notif-toolbar__group">
          <Filter size={15} aria-hidden />
          <span className="notif-toolbar__label">Status</span>
          <div className="notif-segment" role="tablist" aria-label="Filter by read status">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`notif-segment__btn${filter === 'all' ? ' is-active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All <span className="notif-segment__count">{notifications.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'unread'}
              className={`notif-segment__btn${filter === 'unread' ? ' is-active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread <span className="notif-segment__count">{unreadCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'read'}
              className={`notif-segment__btn${filter === 'read' ? ' is-active' : ''}`}
              onClick={() => setFilter('read')}
            >
              Read <span className="notif-segment__count">{readCount}</span>
            </button>
          </div>
        </div>

        <div className="notif-toolbar__group">
          <span className="notif-toolbar__label">Type</span>
          <select
            className="notif-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by notification type"
          >
            <option value="all">All types</option>
            <option value="System">System</option>
            <option value="Payment">Payment</option>
            <option value="Exam">Exam</option>
            <option value="Result">Result</option>
            <option value="Reminder">Reminder</option>
            <option value="Alert">Alert</option>
          </select>
        </div>
      </div>

      <div className="notif-list">
        {loadError && !loading && (
          <div className="notif-empty notif-empty--error">
            <Bell size={40} />
            <h2>Could not load notifications</h2>
            <p>{loadError}</p>
          </div>
        )}

        {loading ? (
          <div className="notif-empty">
            <div className="notif-spinner" />
            <p>Loading notifications…</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="notif-empty">
            <Bell size={48} strokeWidth={1.5} />
            <h2>No notifications</h2>
            <p>
              {filter === 'unread'
                ? "You're all caught up."
                : filter === 'read'
                  ? 'No read notifications yet.'
                  : typeFilter !== 'all'
                    ? `No ${typeFilter.toLowerCase()} notifications.`
                    : 'Notifications you receive will appear here.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const meta = getTypeMeta(notification.NotificationType);
            const Icon = meta.icon;

            return (
              <article
                key={notification.NotificationID}
                className={`notif-card notif-card--${meta.tone}${!notification.IsRead ? ' notif-card--unread' : ''}`}
              >
                <button
                  type="button"
                  className="notif-card__main"
                  onClick={() => setSelectedNotification(notification)}
                >
                  <span className="notif-card__icon" aria-hidden>
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="notif-card__content">
                    <span className="notif-card__row">
                      <span className={`notif-card__type notif-card__type--${meta.tone}`}>{meta.label}</span>
                      {!notification.IsRead && <span className="notif-card__dot">Unread</span>}
                    </span>
                    <span className="notif-card__title">{notification.Title}</span>
                    <span className="notif-card__message">{notification.Message}</span>
                    <span className="notif-card__meta">
                      <time dateTime={notification.CreatedAt}>{formatTime(notification.CreatedAt)}</time>
                      {notification.IsRead && notification.ReadAt && (
                        <>
                          <span className="notif-card__meta-sep" aria-hidden>
                            ·
                          </span>
                          <span>Read {formatTime(notification.ReadAt)}</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>

                <div className="notif-card__actions">
                  {!notification.IsRead && (
                    <button
                      type="button"
                      className="notif-icon-btn"
                      onClick={() => handleMarkAsRead(notification.NotificationID)}
                      title="Mark as read"
                      aria-label="Mark as read"
                    >
                      <Check size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="notif-icon-btn notif-icon-btn--danger"
                    onClick={() => handleDelete(notification.NotificationID)}
                    title="Delete"
                    aria-label="Delete notification"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {selectedNotification && (() => {
        const meta = getTypeMeta(selectedNotification.NotificationType);
        const Icon = meta.icon;
        return (
          <div className="notif-modal-overlay" onClick={() => setSelectedNotification(null)} role="presentation">
            <div
              className="notif-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="notif-modal-title"
            >
              <div className="notif-modal__header">
                <div className={`notif-modal__icon notif-modal__icon--${meta.tone}`}>
                  <Icon size={22} />
                </div>
                <div className="notif-modal__head-text">
                  <span className={`notif-card__type notif-card__type--${meta.tone}`}>{meta.label}</span>
                  <h2 id="notif-modal-title">{selectedNotification.Title}</h2>
                </div>
                <button
                  type="button"
                  className="notif-icon-btn"
                  onClick={() => setSelectedNotification(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="notif-modal__body">
                <p>{selectedNotification.Message}</p>
                <dl className="notif-modal__meta">
                  <div>
                    <dt>Sent</dt>
                    <dd>{formatDateTime(selectedNotification.CreatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedNotification.IsRead ? 'Read' : 'Unread'}</dd>
                  </div>
                  {selectedNotification.ReadAt && (
                    <div>
                      <dt>Read at</dt>
                      <dd>{formatDateTime(selectedNotification.ReadAt)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="notif-modal__footer">
                {!selectedNotification.IsRead && (
                  <button
                    type="button"
                    className="notif-btn notif-btn--secondary"
                    onClick={() => handleMarkAsRead(selectedNotification.NotificationID)}
                  >
                    <Check size={16} />
                    Mark as read
                  </button>
                )}
                <button
                  type="button"
                  className="notif-btn notif-btn--danger"
                  onClick={() => handleDelete(selectedNotification.NotificationID)}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Notifications;
