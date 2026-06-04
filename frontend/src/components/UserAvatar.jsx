import { User } from 'lucide-react';
import './UserAvatar.css';

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const UserAvatar = ({ name, imageUrl, size = 'md', className = '' }) => {
  const initials = initialsFromName(name);
  const sizeClass = `user-avatar--${size}`;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`user-avatar user-avatar--img ${sizeClass} ${className}`.trim()}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className={`user-avatar user-avatar--default ${sizeClass} ${className}`.trim()}
      aria-hidden
    >
      <span className="user-avatar__initials">{initials}</span>
      <User className="user-avatar__icon" size={size === 'sm' ? 14 : size === 'lg' ? 22 : 18} />
    </span>
  );
};

export default UserAvatar;
