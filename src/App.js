import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { orgAuth, studentAuth } from './services/api';
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
import AdminLogs from './pages/admin/Logs';
import SubscriptionPlans from './pages/admin/SubscriptionPlans';
import CreatePlatformUser from './pages/admin/CreatePlatformUser';
import CreateOrganization from './pages/admin/CreateOrganization';
import CreateNotificationAdmin from './pages/admin/CreateNotification';
import CreateNotificationOrg from './pages/org/CreateNotification';
import Notifications from './pages/Notifications';
import StudentDashboard from './pages/student/Dashboard';
import StudentAssignments from './pages/student/Assignments';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children, requireSuperAdmin = false, allowedRoles = [] }) => {
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
            <Route path="tests" element={<Tests />} />
            <Route path="test-assignments" element={<TestAssignments />} />
            <Route path="students" element={<Students />} />
            <Route path="groups" element={<Groups />} />
            <Route path="logs" element={<OrgLogs />} />
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
          <Route path="subscription-plans" element={<SubscriptionPlans />} />
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

    // Use React Router navigate for SPA navigation
    if (user.role === 'SuperAdmin') {
      navigate('/admin/dashboard', { replace: true });
    } else if (user.role === 'OrgAdmin') {
      navigate('/org/dashboard', { replace: true });
    } else if (user.role === 'Reviewer') {
      // Works for both platform and org reviewers
      navigate('/reviewer/dashboard', { replace: true });
    } else if (user.role === 'Subject Expert') {
      // Works for both platform and org experts
      navigate('/expert/dashboard', { replace: true });
    } else if (user.role === 'Student') {
      navigate('/student/dashboard', { replace: true });
    } else {
      console.error('Unknown role:', user.role);
      // Fallback to org dashboard
      navigate('/org/dashboard', { replace: true });
    }
  };

  const handleStudentLoginSuccess = (response) => {
    console.log('Student login successful, response:', response);
    const user = response.user;
    
    if (!user || user.role !== 'Student') {
      console.error('Invalid student login response');
      return;
    }

    navigate('/student/dashboard', { replace: true });
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
