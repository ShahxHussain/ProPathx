import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { orgAuth, studentAuth, adminAPI } from '../services/api';
import './AnnouncementBanner.css';

function normalizeRole(role) {
  if (!role) return null;
  const r = String(role).trim();
  if (r === 'Super Admin' || r === 'SuperAdmin') return 'SuperAdmin';
  return r;
}

function getAuthenticatedUser() {
  if (orgAuth.isAuthenticated()) return orgAuth.getCurrentUser();
  if (studentAuth.isAuthenticated()) return studentAuth.getCurrentUserSync();
  return null;
}

const AnnouncementBanner = () => {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Do not show banner on maintenance page
    if (location.pathname === '/maintenance') {
      setAnnouncement(null);
      setOpen(false);
      return;
    }

    const user = getAuthenticatedUser();
    if (!user) {
      setAnnouncement(null);
      setOpen(false);
      return;
    }

    const role = normalizeRole(user?.role);

    adminAPI
      .getActiveAnnouncements(role)
      .then((res) => {
        const list = res.announcements || [];
        if (list.length > 0) {
          setAnnouncement(list[0]);
        } else {
          setAnnouncement(null);
        }
      })
      .catch(() => {
        setAnnouncement(null);
      });
  }, [location.pathname]);

  if (!announcement) return null;

  const handleClick = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <div className="announcement-banner" onClick={handleClick}>
        <div className="announcement-banner-inner">
          <span className="announcement-pill">Announcement</span>
          <div className="announcement-scroll">
            <div className="announcement-scroll-content">
              <span className="announcement-title">{announcement.Title}</span>
              <span className="announcement-separator">•</span>
              <span className="announcement-preview">
                {announcement.Message.length > 80
                  ? `${announcement.Message.substring(0, 80)}… (click to read more)`
                  : announcement.Message}
              </span>
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="announcement-modal-overlay" onClick={handleClose}>
          <div className="announcement-modal" onClick={(e) => e.stopPropagation()}>
            <button className="announcement-modal-close" onClick={handleClose} aria-label="Close announcement">
              ×
            </button>
            <h2 className="announcement-modal-title">{announcement.Title}</h2>
            <p className="announcement-modal-message">{announcement.Message}</p>
            {(announcement.StartsAt || announcement.EndsAt) && (
              <div className="announcement-modal-meta">
                {announcement.StartsAt && (
                  <div>
                    <span className="label">From</span>{' '}
                    <span className="value">{new Date(announcement.StartsAt).toLocaleString()}</span>
                  </div>
                )}
                {announcement.EndsAt && (
                  <div>
                    <span className="label">Until</span>{' '}
                    <span className="value">{new Date(announcement.EndsAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
            {announcement.Link && (
              <div className="announcement-modal-link">
                <a href={announcement.Link} target="_blank" rel="noreferrer">
                  Open related page
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AnnouncementBanner;

