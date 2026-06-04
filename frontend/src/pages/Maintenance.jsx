import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Wrench } from 'lucide-react';
import { orgAuth, studentAuth, adminAPI } from '../services/api';
import './Maintenance.css';

const Maintenance = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(location.state?.settings || null);
  const [loading, setLoading] = useState(!location.state?.settings);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settings) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await adminAPI.getPublicMaintenanceSettings();
        setSettings(res.settings || null);
      } catch (err) {
        console.error('Failed to load maintenance settings:', err);
        setError(err.message || 'Failed to load maintenance info');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [settings]);

  const user =
    (orgAuth.isAuthenticated() && orgAuth.getCurrentUser()) ||
    (studentAuth.isAuthenticated() && studentAuth.getCurrentUserSync()) ||
    null;

  const role = user?.role || 'Guest';

  const handleLogout = () => {
    if (orgAuth.isAuthenticated()) {
      orgAuth.logout();
    }
    if (studentAuth.isAuthenticated()) {
      studentAuth.logout();
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-backdrop" />
      <div className="maintenance-card">
        <div className="maintenance-pulse" />
        <div className="maintenance-hero">
          <div className="maintenance-icon">
            <AlertTriangle size={40} />
          </div>
          <div className="maintenance-illustration">
            <Wrench size={36} />
          </div>
        </div>
        <h1>We&apos;re polishing ProPath for you</h1>
        {loading ? (
          <p className="maintenance-message">Checking current maintenance window...</p>
        ) : error ? (
          <p className="maintenance-message">{error}</p>
        ) : (
          <>
            <p className="maintenance-message">
              {settings?.message ||
                'ProPath is temporarily unavailable while we perform upgrades. Please try again in a little while.'}
            </p>
            <div className="maintenance-details">
              <div>
                <span className="label">Your role:</span> <span className="value">{role}</span>
              </div>
              <div>
                <span className="label">Scope:</span>{' '}
                <span className="value">
                  {settings?.scope === 'all'
                    ? 'Entire Platform'
                    : settings?.scope === 'students'
                    ? 'Student Portals'
                    : settings?.scope === 'orgs'
                    ? 'Organizations'
                    : 'Admin Tools'}
                </span>
              </div>
              <div>
                <span className="label">Expected back:</span>{' '}
                <span className="value">
                  {settings?.expectedResumeAt
                    ? new Date(settings.expectedResumeAt).toLocaleString()
                    : 'Not specified'}
                </span>
              </div>
            </div>
          </>
        )}
        <div className="maintenance-footer">
          <div className="loader-bar">
            <div className="loader-bar-fill" />
          </div>
          <p className="maintenance-footnote">
            A short pause now means a smoother, more reliable ProPath when we&apos;re back. Thanks for your patience.
          </p>
          <button type="button" className="maintenance-logout-btn" onClick={handleLogout}>
            Logout &amp; Return Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default Maintenance;

