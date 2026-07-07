import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { orgAuth, studentAuth } from '../services/api';
import { getPostLoginRoute } from '../utils/roleRedirect';
import './NotFound.css';

const NotFound = () => {
  const isOrgAuth = orgAuth.isAuthenticated();
  const isStudentAuth = studentAuth.isAuthenticated();
  const isAuthenticated = isOrgAuth || isStudentAuth;

  const user = isOrgAuth
    ? orgAuth.getCurrentUser()
    : isStudentAuth
      ? studentAuth.getCurrentUserSync()
      : null;

  const destination = isAuthenticated ? getPostLoginRoute(user) : '/';
  const ctaLabel = isAuthenticated ? 'Go to dashboard' : 'Go to homepage';

  return (
    <div className="not-found-page">
      <div className="not-found-backdrop" />
      <div className="not-found-card">
        <div className="not-found-pulse" />
        <div className="not-found-icon" aria-hidden="true">
          <MapPinOff size={40} />
        </div>
        <p className="not-found-code">Error 404 – Page not found</p>
        <h1 className="not-found-title">Not every road leads somewhere — just like this link.</h1>
        <Link to={destination} className="not-found-cta">
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
