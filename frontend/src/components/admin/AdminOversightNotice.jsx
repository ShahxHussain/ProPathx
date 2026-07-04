import { Info } from 'lucide-react';
import './AdminOversightNotice.css';

/**
 * Explains read-only SuperAdmin screens — intentional product design, not a missing feature.
 */
const AdminOversightNotice = ({ title, children, actions }) => {
  return (
    <div className="admin-oversight-notice" role="note">
      <Info size={18} className="admin-oversight-notice__icon" aria-hidden="true" />
      <div className="admin-oversight-notice__body">
        {title && <strong className="admin-oversight-notice__title">{title}</strong>}
        <p className="admin-oversight-notice__text">{children}</p>
        {actions && <div className="admin-oversight-notice__actions">{actions}</div>}
      </div>
    </div>
  );
};

export default AdminOversightNotice;
