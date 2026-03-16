import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { orgAuth, studentAuth, adminAPI } from './services/api';
import OrgSignupForm from './components/OrgSignupForm';
import OrgLoginForm from './components/OrgLoginForm';
import StudentLoginForm from './components/StudentLoginForm';
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
import TestAssignments from './pages/org/TestAssignments';
import Students from './pages/org/Students';
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
            <Route path="tests" element={<Tests />} />
            <Route path="test-assignments" element={<TestAssignments />} />
            <Route path="students" element={<Students />} />
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
          <Route path="assignments" element={<StudentAssignments />} />
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

  const [loginType, setLoginType] = useState('org'); // 'org' or 'student'

  return (
    <div className="page">
      <div className="card">
        <h1>ProPath</h1>
        <p className="muted">Sign in to your account</p>

        {/* Login Type Toggle */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <button
            type="button"
            className={`link ${loginType === 'org' ? 'active' : ''}`}
            onClick={() => setLoginType('org')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: loginType === 'org' ? 'var(--primary)' : 'transparent',
              color: loginType === 'org' ? 'white' : 'var(--text-muted)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: loginType === 'org' ? '600' : '400'
            }}
          >
            Organization / Staff
          </button>
          <button
            type="button"
            className={`link ${loginType === 'student' ? 'active' : ''}`}
            onClick={() => setLoginType('student')}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: loginType === 'student' ? 'var(--primary)' : 'transparent',
              color: loginType === 'student' ? 'white' : 'var(--text-muted)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: loginType === 'student' ? '600' : '400'
            }}
          >
            Student
          </button>
        </div>

        {successMessage && <div className="notice success">{successMessage}</div>}

        {loginType === 'student' ? (
          <StudentLoginForm onSuccess={handleStudentLoginSuccess} />
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
    </div>
  );
};

export default App;
