import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, ChevronDown } from 'lucide-react';
import UserAvatar from './UserAvatar';
import './ProfileMenu.css';

const ProfileMenu = ({ user, profilePath, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayName = user?.fullName || 'Account';
  const role = user?.role || '';
  const imageUrl = user?.profileImageUrl || user?.profileImageURL || null;

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar name={displayName} imageUrl={imageUrl} size="md" />
        <span className="profile-menu__text">
          <span className="profile-menu__name">{displayName}</span>
          {role && <span className="profile-menu__role">{role}</span>}
        </span>
        <ChevronDown size={16} className={`profile-menu__chevron ${open ? 'open' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="profile-menu__dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="profile-menu__item"
            onClick={() => {
              setOpen(false);
              navigate(profilePath);
            }}
          >
            <User size={16} aria-hidden />
            My profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="profile-menu__item profile-menu__item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
