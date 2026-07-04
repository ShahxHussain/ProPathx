import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { orgAuth, studentAuth, adminAPI } from '../../services/api';

/**
 * MaintenanceGuard
 * Runs on protected layouts to ensure users cannot bypass maintenance by using browser back.
 * If the current role is blocked by active maintenance settings, redirects to /maintenance.
 */
const MaintenanceGuard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Don't run guard on the maintenance page itself
    if (location.pathname === '/maintenance') return;

    const isOrgAuth = orgAuth.isAuthenticated();
    const isStudentAuth = studentAuth.isAuthenticated();
    if (!isOrgAuth && !isStudentAuth) return;

    const user = isOrgAuth ? orgAuth.getCurrentUser() : studentAuth.getCurrentUserSync();
    const role = user?.role;
    if (!role) return;

    adminAPI
      .getPublicMaintenanceSettings()
      .then((res) => {
        const settings = res.settings || {};
        if (!settings.enabled) return;

        const scope = settings.scope || 'all';
        const allowed = (settings.allowRoles || []).includes(role);

        const isStudent = role === 'Student';
        const isOrgSide = ['OrgAdmin', 'Reviewer', 'Subject Expert'].includes(role);
        const isAdminSide = ['SuperAdmin', 'Admin', 'Support', 'AI'].includes(role);

        let blocked = false;
        if (scope === 'all') {
          blocked = !allowed;
        } else if (scope === 'students') {
          blocked = isStudent && !allowed;
        } else if (scope === 'orgs') {
          blocked = isOrgSide && !allowed;
        } else if (scope === 'admins') {
          blocked = isAdminSide && !allowed;
        }

        if (blocked) {
          navigate('/maintenance', {
            replace: true,
            state: { settings, from: location.pathname },
          });
        }
      })
      .catch(() => {
        // If maintenance settings fail to load, do nothing; don't block normal usage.
      });
  }, [location.pathname, navigate]);

  return null;
};

export default MaintenanceGuard;

