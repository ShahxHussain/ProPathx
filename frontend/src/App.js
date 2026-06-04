import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { orgAuth, studentAuth, adminAPI } from './services/api';
import OrgSignupForm from './components/OrgSignupForm';
import OrgLoginForm from './components/OrgLoginForm';
import StudentLoginForm from './components/StudentLoginForm';
import StudentSignupForm from './components/StudentSignupForm';
import DashboardLayout from './components/layouts/DashboardLayout';
import ReviewerLayout from './components/layouts/ReviewerLayout';
import ExpertLayout from './components/layouts/ExpertLayout';
import AdminLayout from './components/layouts/AdminLayout';
import StudentLayout from './components/layouts/StudentLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import Dashboard from './pages/org/Dashboard';
import Users from './pages/org/Users';
import ExploreExams from './pages/org/ExploreExams';
import Tests from './pages/org/Tests';
import TestWizardPage from './pages/org/testWizard/TestWizardPage';
import TestAssignments from './pages/org/TestAssignments';
import Students from './pages/org/Students';
import OrgStudentExamEnrollments from './pages/org/OrgStudentExamEnrollments';
import Groups from './pages/org/Groups';
import OrgLogs from './pages/org/Logs';
import OrgSubscriptionPlans from './pages/org/SubscriptionPlans';
import Settings from './pages/org/Settings';
import QuestionBank from './pages/org/QuestionBank';
import TestQuestionsPage from './pages/org/TestQuestions';
import ViewTestQuestions from './pages/org/ViewTestQuestions';
import ReviewerDashboard from './pages/reviewer/Dashboard';
import ReviewerQuestions from './pages/reviewer/Questions';
import ReviewerApproved from './pages/reviewer/Approved';
import ReviewerExperts from './pages/reviewer/Experts';
import ExpertDashboard from './pages/expert/Dashboard';
import ExpertCreate from './pages/expert/Create';
import ExpertQuestions from './pages/expert/Questions';
import ExpertPerformance from './pages/expert/Performance';
import AdminDashboard from './pages/admin/Dashboard';
import AdminOrganizations from './pages/admin/Organizations';
import AdminUsers from './pages/admin/Users';
import AdminExams from './pages/admin/Exams';
import ExamSetup from './pages/admin/ExamSetup';
import AdminLogs from './pages/admin/Logs';
import AdminQuestions from './pages/admin/Questions';
import SubscriptionPlans from './pages/admin/SubscriptionPlans';
import Subscriptions from './pages/admin/Subscriptions';
import AdminSettings from './pages/admin/Settings';
import Health from './pages/admin/Health';
import CreatePlatformUser from './pages/admin/CreatePlatformUser';
import CreateOrganization from './pages/admin/CreateOrganization';
import CreateNotificationAdmin from './pages/admin/CreateNotification';
import CreateNotificationOrg from './pages/org/CreateNotification';
import Notifications from './pages/Notifications';
import StudentDashboard from './pages/student/Dashboard';
import StudentAssignments from './pages/student/Assignments';
import StudentTestAttempt from './pages/student/TestAttempt';
import StudentTestResult from './pages/student/TestResult';
import StudentReports from './pages/student/Reports';
import StudentSubscriptionPlans from './pages/student/SubscriptionPlans';
import SelfTestBuilder from './pages/student/SelfTestBuilder';
import ExamEnrollments from './pages/student/ExamEnrollments';
import './App.css';
import Maintenance from './pages/Maintenance';

// Protected Route Component
const ProtectedRoute = ({ children, requireSuperAdmin = false, allowedRoles = [] }) => {
  const location = useLocation();
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);
  const [maintenanceSettings, setMaintenanceSettings] = useState(null);

  // Maintenance check
  useEffect(() => {
    let cancelled = false;

    // Don't run on maintenance page itself
    if (location.pathname === '/maintenance') {
      setMaintenanceChecked(true);
      setMaintenanceBlocked(false);
      setMaintenanceSettings(null);
      return;
    }

    const isOrgAuth = orgAuth.isAuthenticated();
    const isStudentAuth = studentAuth.isAuthenticated();
    if (!isOrgAuth && !isStudentAuth) {
      // No authenticated user; nothing to block
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
        // On error, don't block navigation
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

  const user = isOrgAuth ? orgAuth.getCurrentUser() : studentAuth.getCurrentUserSync();
  
  // Check for SuperAdmin requirement
  if (requireSuperAdmin) {    
    if (user?.role !== 'SuperAdmin') {
      return <Navigate to="/" replace />;
    }
  }
  
  // Check for specific role requirements
  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  if (!maintenanceChecked) {
    // While checking maintenance, render nothing to avoid flashing the dashboard
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

// Public Route Component (redirect if authenticated)
const PublicRoute = ({ children }) => {
  if (orgAuth.isAuthenticated()) {
    const user = orgAuth.getCurrentUser();
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

const isIndividualStudentUser = (user) => {
  if (!user) return false;
  const enrollmentType = String(user.enrollmentType ?? user.EnrollmentType ?? '').toLowerCase();
  const orgId = user.orgId ?? user.OrgID ?? user.orgID ?? null;
  return enrollmentType === 'individual' || orgId == null || orgId === '';
};

const IndividualStudentRoute = ({ children }) => {
  if (!studentAuth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const user = studentAuth.getCurrentUserSync();
  if (!isIndividualStudentUser(user)) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return children;
};

/** Org-enrolled students only (exam enrollment & related APIs). */
const OrganizationStudentRoute = ({ children }) => {
  if (!studentAuth.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  const user = studentAuth.getCurrentUserSync();
  if (isIndividualStudentUser(user)) {
    return <Navigate to="/student/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route path="/maintenance" element={<Maintenance />} />

        {/* OrgAdmin Protected Routes */}
        <Route
          path="/org/*"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="explore-exams" element={<ExploreExams />} />
            <Route path="subscription-plans" element={<OrgSubscriptionPlans />} />
            <Route path="tests/:testId/questions" element={<ViewTestQuestions />} />
            <Route path="tests/wizard/:testId" element={<TestWizardPage />} />
            <Route path="tests/wizard" element={<TestWizardPage />} />
            <Route path="tests" element={<Tests />} />
            <Route path="test-assignments" element={<TestAssignments />} />
            <Route path="students" element={<Students />} />
            <Route path="student-exam-enrollments" element={<OrgStudentExamEnrollments />} />
            <Route path="groups" element={<Groups />} />
            <Route path="logs" element={<OrgLogs />} />
            <Route path="question-bank" element={<QuestionBank />} />
            <Route path="test-questions" element={<TestQuestionsPage />} />
            <Route path="test-questions/:testId" element={<TestQuestionsPage />} />
            <Route path="create-notification" element={<CreateNotificationOrg />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Reviewer Protected Routes (works for both platform and org reviewers) */}
        <Route
          path="/reviewer/*"
          element={
            <ProtectedRoute allowedRoles={['Reviewer']}>
              <ReviewerLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<ReviewerDashboard />} />
          <Route path="questions" element={<ReviewerQuestions />} />
          <Route path="approved" element={<ReviewerApproved />} />
          <Route path="experts" element={<ReviewerExperts />} />
          <Route path="notifications" element={<Notifications />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Subject Expert Protected Routes (works for both platform and org experts) */}
        <Route
          path="/expert/*"
          element={
            <ProtectedRoute allowedRoles={['Subject Expert']}>
              <ExpertLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<ExpertDashboard />} />
          <Route path="create" element={<ExpertCreate />} />
          <Route path="questions" element={<ExpertQuestions />} />
          <Route path="performance" element={<ExpertPerformance />} />
          <Route path="notifications" element={<Notifications />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Super Admin Routes */}
        <Route
          path="/admin/login"
          element={
            <PublicRoute>
              <AdminLoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requireSuperAdmin={true}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="organizations" element={<AdminOrganizations />} />
          <Route path="create-organization" element={<CreateOrganization />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="exams" element={<AdminExams />} />
          <Route path="exams/setup/:examId" element={<ExamSetup />} />
          <Route path="questions" element={<AdminQuestions />} />
          <Route path="subscription-plans" element={<SubscriptionPlans />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="health" element={<Health />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="create-platform-user" element={<CreatePlatformUser />} />
          <Route path="create-notification" element={<CreateNotificationAdmin />} />
          <Route path="notifications" element={<Notifications />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Student Protected Routes */}
        <Route
          path="/student/*"
          element={
            <ProtectedRoute allowedRoles={['Student']}>
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route
            path="my-exams"
            element={
              <OrganizationStudentRoute>
                <ExamEnrollments />
              </OrganizationStudentRoute>
            }
          />
          <Route
            path="self-test"
            element={
              <SelfTestBuilder />
            }
          />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="reports" element={<StudentReports />} />
          <Route path="notifications" element={<Notifications />} />
          <Route
            path="subscription-plans"
            element={
              <IndividualStudentRoute>
                <StudentSubscriptionPlans />
              </IndividualStudentRoute>
            }
          />
          <Route path="test/:testId/results" element={<StudentTestResult />} />
          <Route path="test/:testId" element={<StudentTestAttempt />} />
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  );
}

// Auth Page Component
const AuthPage = () => {
  const [mode, setMode] = useState('signin');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const handleLoginSuccess = (response) => {
    console.log('Login successful, response:', response);
    const user = response.user;
    console.log('User role:', user?.role);
    
    if (!user || !user.role) {
      console.error('No user or role in response');
      return;
    }

    const targetByRole =
      user.role === 'SuperAdmin'
        ? '/admin/dashboard'
        : user.role === 'OrgAdmin'
        ? '/org/dashboard'
        : user.role === 'Reviewer'
        ? '/reviewer/dashboard'
        : user.role === 'Subject Expert'
        ? '/expert/dashboard'
        : user.role === 'Student'
        ? '/student/dashboard'
        : '/org/dashboard';

    // Before redirecting, check public maintenance settings to see if this role is blocked
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
        // If maintenance check fails, fall back to normal navigation
        navigate(targetByRole, { replace: true });
      });
  };

  const handleStudentLoginSuccess = (response) => {
    console.log('Student login successful, response:', response);
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

  const [loginType, setLoginType] = useState(''); // '' | 'org' | 'student'

  return (
    <div className="page">
      <div className="auth-shell">
        <div className="auth-brand-panel">
          <div className="auth-brand-chip">ProPath</div>
          <div className="auth-brand-lines" aria-hidden>
            <span className="line line-1" />
            <span className="line line-2" />
            <span className="line line-3" />
          </div>
          <h1 className="auth-brand-title">Assessment Intelligence Platform</h1>
          <p className="auth-brand-copy">
            Adaptive testing, role-based workflows, and performance analytics in one secure experience.
          </p>
          <p className="auth-brand-highlight">
            Ace your exams and career with us.
          </p>
          <ul className="auth-brand-points">
            <li>Role-aware workspaces for Admins, Reviewers, Experts, and Students.</li>
            <li>Smart question delivery with adaptive and data-informed progression.</li>
            <li>Clear reporting with performance trends, mastery signals, and audit logs.</li>
          </ul>
          <div className="auth-brand-grid">
            <div className="auth-brand-grid-item">
              <strong>Adaptive</strong>
              <span>Smartly balanced assessments</span>
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
                  <span className="auth-portal-sub">OrgAdmin, Reviewer, Subject Expert, Platform Users</span>
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
};

export default App;
