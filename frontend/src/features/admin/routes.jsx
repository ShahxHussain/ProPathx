import { Route, Navigate } from 'react-router-dom';
import AdminLayout from '../../components/layouts/AdminLayout';
import AdminLoginPage from '../../pages/admin/AdminLoginPage';
import AdminDashboard from '../../pages/admin/Dashboard';
import AdminOrganizations from '../../pages/admin/Organizations';
import AdminUsers from '../../pages/admin/Users';
import AdminExams from '../../pages/admin/Exams';
import ExamSetup from '../../pages/admin/ExamSetup';
import AdminLogs from '../../pages/admin/Logs';
import AdminQuestions from '../../pages/admin/Questions';
import SubscriptionPlans from '../../pages/admin/SubscriptionPlans';
import Subscriptions from '../../pages/admin/Subscriptions';
import Revenue from '../../pages/admin/Revenue';
import AdminSettings from '../../pages/admin/Settings';
import Health from '../../pages/admin/Health';
import CreatePlatformUser from '../../pages/admin/CreatePlatformUser';
import CreateOrganization from '../../pages/admin/CreateOrganization';
import CreateNotificationAdmin from '../../pages/admin/CreateNotification';
import Notifications from '../../pages/Notifications';
import Profile from '../profile/pages/Profile';
import { ProtectedRoute, PublicRoute } from '../auth/routes/guards';

/** SuperAdmin portal routes — `/admin/login` + `/admin/*` */
export function AdminFeatureRoutes() {
  return (
    <>
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
        <Route path="revenue" element={<Revenue />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="health" element={<Health />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="create-platform-user" element={<CreatePlatformUser />} />
        <Route path="create-notification" element={<CreateNotificationAdmin />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>
    </>
  );
}
