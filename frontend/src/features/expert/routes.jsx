import { Route, Navigate } from 'react-router-dom';
import ExpertLayout from '../../components/layouts/ExpertLayout';
import ExpertDashboard from '../../pages/expert/Dashboard';
import ExpertCreate from '../../pages/expert/Create';
import ExpertQuestions from '../../pages/expert/Questions';
import ExpertContributions from '../../pages/expert/Contributions';
import Notifications from '../../pages/Notifications';
import Profile from '../profile/pages/Profile';
import { ProtectedRoute } from '../auth/routes/guards';
import { NotFoundRoute } from '../../app/NotFoundRoute';

/** Subject Expert portal routes — mounted at `/expert/*` */
export function ExpertFeatureRoutes() {
  return (
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
      <Route path="contributions" element={<ExpertContributions />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="profile" element={<Profile />} />
      <Route index element={<Navigate to="dashboard" replace />} />
      {NotFoundRoute()}
    </Route>
  );
}
