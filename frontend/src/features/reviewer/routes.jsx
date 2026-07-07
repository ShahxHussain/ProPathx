import { Route, Navigate } from 'react-router-dom';
import ReviewerLayout from '../../components/layouts/ReviewerLayout';
import ReviewerDashboard from '../../pages/reviewer/Dashboard';
import ReviewerQuestions from '../../pages/reviewer/Questions';
import ReviewerExperts from '../../pages/reviewer/Experts';
import ReviewFocus from '../../pages/reviewer/ReviewFocus';
import Notifications from '../../pages/Notifications';
import Profile from '../profile/pages/Profile';
import { ProtectedRoute } from '../auth/routes/guards';
import { NotFoundRoute } from '../../app/NotFoundRoute';

/** Reviewer portal routes — mounted at `/reviewer/*` */
export function ReviewerFeatureRoutes() {
  return (
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
      <Route path="focus" element={<ReviewFocus />} />
      <Route path="approved" element={<Navigate to="/reviewer/questions?status=approved" replace />} />
      <Route path="experts" element={<ReviewerExperts />} />
      <Route path="notifications" element={<Notifications />} />
      <Route path="profile" element={<Profile />} />
      <Route index element={<Navigate to="dashboard" replace />} />
      {NotFoundRoute()}
    </Route>
  );
}
