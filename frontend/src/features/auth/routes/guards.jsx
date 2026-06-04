import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { orgAuth, studentAuth, adminAPI } from '../../../services/api';
import OrgWelcomePassword from '../pages/OrgWelcomePassword';
import { getPostLoginRoute } from '../../../utils/roleRedirect';

export const ProtectedRoute = ({ children, requireSuperAdmin = false, allowedRoles = [] }) => {
  const location = useLocation();
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);
  const [maintenanceSettings, setMaintenanceSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (location.pathname === '/maintenance') {
      setMaintenanceChecked(true);
      setMaintenanceBlocked(false);
      setMaintenanceSettings(null);
      return;
    }

    const isOrgAuth = orgAuth.isAuthenticated();
    const isStudentAuth = studentAuth.isAuthenticated();
    if (!isOrgAuth && !isStudentAuth) {
      setMaintenanceChecked(true);
      setMaintenanceBlocked(false);
      setMaintenanceSettings(null);
      return;
    }

    const currentUser = isOrgAuth ? orgAuth.getCurrentUser() : studentAuth.getCurrentUserSync();
    const role = currentUser?.role;

    adminAPI
      .getPublicMaintenanceSettings()
      .then((res) => {
        if (cancelled) return;
        const settings = res.settings || {};
        if (!settings.enabled) {
          setMaintenanceChecked(true);
          setMaintenanceBlocked(false);
          setMaintenanceSettings(null);
          return;
        }

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

        setMaintenanceChecked(true);
        setMaintenanceBlocked(blocked);
        setMaintenanceSettings(settings);
      })
      .catch(() => {
        if (cancelled) return;
        setMaintenanceChecked(true);
        setMaintenanceBlocked(false);
        setMaintenanceSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const isOrgAuth = orgAuth.isAuthenticated();
  const isStudentAuth = studentAuth.isAuthenticated();

  if (!isOrgAuth && !isStudentAuth) {
    return <Navigate to="/" replace />;
  }

  if (isOrgAuth && orgAuth.mustChangePassword() && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  const user = isOrgAuth ? orgAuth.getCurrentUser() : studentAuth.getCurrentUserSync();

  if (requireSuperAdmin) {
    if (user?.role !== 'SuperAdmin') {
      return <Navigate to="/" replace />;
    }
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  if (!maintenanceChecked) {
    return null;
  }

  if (maintenanceBlocked) {
    return (
      <Navigate
        to="/maintenance"
        replace
        state={{ settings: maintenanceSettings, from: location.pathname }}
      />
    );
  }

  return children;
};

export const WelcomePasswordRoute = () => {
  if (!orgAuth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  const user = orgAuth.getCurrentUser();
  if (!user?.mustChangePassword) {
    return <Navigate to={getPostLoginRoute(user)} replace />;
  }
  return <OrgWelcomePassword />;
};

export const PublicRoute = ({ children }) => {
  if (orgAuth.isAuthenticated()) {
    const user = orgAuth.getCurrentUser();
    if (user?.mustChangePassword) {
      return <Navigate to="/welcome" replace />;
    }
    if (user?.role === 'SuperAdmin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (user?.role === 'OrgAdmin') {
      return <Navigate to="/org/dashboard" replace />;
    }
    if (user?.role === 'Reviewer') {
      return <Navigate to="/reviewer/dashboard" replace />;
    }
    if (user?.role === 'Subject Expert') {
      return <Navigate to="/expert/dashboard" replace />;
    }
  }
  if (studentAuth.isAuthenticated()) {
    return <Navigate to="/student/dashboard" replace />;
  }
  return children;
};

export const isIndividualStudentUser = (user) => {
  if (!user) return false;
  const enrollmentType = String(user.enrollmentType ?? user.EnrollmentType ?? '').toLowerCase();
  const orgId = user.orgId ?? user.OrgID ?? user.orgID ?? null;
  return enrollmentType === 'individual' || orgId == null || orgId === '';
};

export const IndividualStudentRoute = ({ children }) => {
  if (!studentAuth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const user = studentAuth.getCurrentUserSync();
  if (!isIndividualStudentUser(user)) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return children;
};

export const OrganizationStudentRoute = ({ children }) => {
  if (!studentAuth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  const user = studentAuth.getCurrentUserSync();
  if (isIndividualStudentUser(user)) {
    return <Navigate to="/student/dashboard" replace />;
  }
  return children;
};
