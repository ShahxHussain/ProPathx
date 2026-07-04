import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { orgAuth, adminAPI } from '../../../services/api';
import OrgSignupForm from '../../../components/auth/OrgSignupForm';
import OrgLoginForm from '../../../components/auth/OrgLoginForm';
import StudentLoginForm from '../../../components/auth/StudentLoginForm';
import StudentSignupForm from '../../../components/auth/StudentSignupForm';
import { getPostLoginRoute } from '../../../utils/roleRedirect';
import AuthBrandPanel from '../components/AuthBrandPanel';
import { getAuthBrandContent } from '../authBrandContent';

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [successMessage, setSuccessMessage] = useState('');
  const [loginType, setLoginType] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const preset = location.state?.loginType;
    if (preset === 'org' || preset === 'student') {
      setLoginType(preset);
      setMode('signin');
      setSuccessMessage('');
    }
  }, [location.state]);

  const handleLoginSuccess = (response) => {
    const user = response.user;

    if (!user || !user.role) {
      console.error('No user or role in response');
      return;
    }

    if (user.mustChangePassword || orgAuth.mustChangePassword()) {
      navigate('/welcome', { replace: true });
      return;
    }

    const targetByRole =
      user.role === 'SuperAdmin'
        ? '/admin/dashboard'
        : user.role === 'Student'
          ? '/student/dashboard'
          : getPostLoginRoute(user);

    adminAPI
      .getPublicMaintenanceSettings()
      .then((res) => {
        const settings = res.settings || {};
        if (!settings.enabled) {
          navigate(targetByRole, { replace: true });
          return;
        }

        const scope = settings.scope || 'all';
        const allowed = (settings.allowRoles || []).includes(user.role);

        const isStudent = user.role === 'Student';
        const isOrgSide = ['OrgAdmin', 'Reviewer', 'Subject Expert'].includes(user.role);
        const isAdminSide = ['SuperAdmin', 'Admin', 'Support', 'AI'].includes(user.role);

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
            state: { settings, from: targetByRole },
          });
        } else {
          navigate(targetByRole, { replace: true });
        }
      })
      .catch(() => {
        navigate(targetByRole, { replace: true });
      });
  };

  const handleStudentLoginSuccess = (response) => {
    const user = response.user;

    if (!user || user.role !== 'Student') {
      console.error('Invalid student login response');
      return;
    }

    const targetByRole = '/student/dashboard';

    adminAPI
      .getPublicMaintenanceSettings()
      .then((res) => {
        const settings = res.settings || {};
        if (!settings.enabled) {
          navigate(targetByRole, { replace: true });
          return;
        }

        const scope = settings.scope || 'all';
        const allowed = (settings.allowRoles || []).includes(user.role);
        const isStudent = true;

        let blocked = false;
        if (scope === 'all') {
          blocked = !allowed;
        } else if (scope === 'students') {
          blocked = isStudent && !allowed;
        }

        if (blocked) {
          navigate('/maintenance', {
            replace: true,
            state: { settings, from: targetByRole },
          });
        } else {
          navigate(targetByRole, { replace: true });
        }
      })
      .catch(() => {
        navigate(targetByRole, { replace: true });
      });
  };

  const handleSignupSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setMode('signin');
      setSuccessMessage('');
    }, 3000);
  };

  const handleStudentSignupSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setMode('signin');
      setSuccessMessage('');
    }, 3000);
  };

  const brand = getAuthBrandContent(loginType, mode);

  return (
    <div className="page">
      <div className="auth-shell">
        <AuthBrandPanel loginType={loginType} mode={mode} />

        <div className="card auth-card">
          {!loginType ? (
            <div className="auth-portal-entry">
              <Link to="/" className="auth-mobile-logo">ProPath</Link>
              <p className="auth-mobile-tagline">{brand.highlight}</p>
              <h2>Choose your portal</h2>
              <p className="muted">{brand.copy}</p>
              <div className="auth-portal-actions">
                <button
                  type="button"
                  className="auth-portal-btn"
                  onClick={() => {
                    setLoginType('org');
                    setMode('signin');
                    setSuccessMessage('');
                  }}
                >
                  <span className="auth-portal-title">Organization / Staff</span>
                  <span className="auth-portal-sub">
                    OrgAdmin, Reviewer, Subject Expert, Platform Users
                  </span>
                </button>
                <button
                  type="button"
                  className="auth-portal-btn"
                  onClick={() => {
                    setLoginType('student');
                    setMode('signin');
                    setSuccessMessage('');
                  }}
                >
                  <span className="auth-portal-title">Student</span>
                  <span className="auth-portal-sub">Individual learners and enrolled students</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-form-stage">
              <p className="auth-mobile-tagline auth-mobile-tagline--form">{brand.highlight}</p>
              <div className="auth-stage-topbar">
                <button
                  type="button"
                  className="auth-back-btn"
                  onClick={() => {
                    setLoginType('');
                    setMode('signin');
                    setSuccessMessage('');
                  }}
                >
                  ← Back
                </button>
                <span className="auth-stage-badge">
                  {loginType === 'student' ? 'Student Portal' : 'Organization / Staff Portal'}
                </span>
              </div>

              {successMessage && <div className="notice success">{successMessage}</div>}

              {loginType === 'student' ? (
                mode === 'signup' ? (
                  <StudentSignupForm
                    onSuccess={handleStudentSignupSuccess}
                    onSwitchToLogin={() => {
                      setMode('signin');
                      setSuccessMessage('');
                    }}
                  />
                ) : (
                  <StudentLoginForm
                    onSuccess={handleStudentLoginSuccess}
                    onSwitchToSignup={() => {
                      setMode('signup');
                      setSuccessMessage('');
                    }}
                  />
                )
              ) : mode === 'signin' ? (
                <OrgLoginForm
                  onSuccess={handleLoginSuccess}
                  onSwitchToSignup={() => {
                    setMode('signup');
                    setSuccessMessage('');
                  }}
                />
              ) : (
                <OrgSignupForm
                  onSuccess={handleSignupSuccess}
                  onSwitchToLogin={() => {
                    setMode('signin');
                    setSuccessMessage('');
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
