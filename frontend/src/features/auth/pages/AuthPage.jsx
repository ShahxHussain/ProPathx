import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { orgAuth, adminAPI } from '../../../services/api';
import OrgSignupForm from '../../../components/OrgSignupForm';
import OrgLoginForm from '../../../components/OrgLoginForm';
import StudentLoginForm from '../../../components/StudentLoginForm';
import StudentSignupForm from '../../../components/StudentSignupForm';
import { getPostLoginRoute } from '../../../utils/roleRedirect';

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

  return (
    <div className="page">
      <div className="auth-shell">
        <div className="auth-brand-panel">
          <Link to="/" className="auth-brand-chip">ProPath</Link>
          <div className="auth-brand-lines" aria-hidden>
            <span className="line line-1" />
            <span className="line line-2" />
            <span className="line line-3" />
          </div>
          <h1 className="auth-brand-title">Learning Intelligence Platform</h1>
          <p className="auth-brand-copy">
            Adaptive practice, role-based workflows, and progress analytics in one secure experience.
          </p>
          <p className="auth-brand-highlight">Grow skills and confidence with structured learning.</p>
          <ul className="auth-brand-points">
            <li>Role-aware workspaces for Admins, Reviewers, Experts, and Students.</li>
            <li>Smart question delivery with adaptive and data-informed progression.</li>
            <li>Clear reporting with performance trends, mastery signals, and audit logs.</li>
          </ul>
          <div className="auth-brand-grid">
            <div className="auth-brand-grid-item">
              <strong>Adaptive</strong>
              <span>Personalized practice paths</span>
            </div>
            <div className="auth-brand-grid-item">
              <strong>Reliable</strong>
              <span>Audit-ready enterprise controls</span>
            </div>
            <div className="auth-brand-grid-item">
              <strong>Scalable</strong>
              <span>Built for organizations and individual learners</span>
            </div>
            <div className="auth-brand-grid-item">
              <strong>Insightful</strong>
              <span>Actionable dashboards for better outcomes</span>
            </div>
          </div>
          <div className="auth-brand-foot">
            <span>Secure access</span>
            <span>Tenant-safe architecture</span>
            <span>Performance analytics</span>
          </div>
        </div>

        <div className="card auth-card">
          {!loginType ? (
            <div className="auth-portal-entry">
              <h2>Choose your portal</h2>
              <p className="muted">Continue with the experience tailored for your role.</p>
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
