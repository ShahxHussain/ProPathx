import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthFeatureRoutes } from '../features/auth/routes/publicRoutes';
import { OrgFeatureRoutes } from '../features/org/routes';
import { ReviewerFeatureRoutes } from '../features/reviewer/routes';
import { ExpertFeatureRoutes } from '../features/expert/routes';
import { AdminFeatureRoutes } from '../features/admin/routes';
import { StudentFeatureRoutes } from '../features/student/routes';

export default function AppRoutes() {
  return (
    <Routes>
      {AuthFeatureRoutes()}
      {OrgFeatureRoutes()}
      {ReviewerFeatureRoutes()}
      {ExpertFeatureRoutes()}
      {AdminFeatureRoutes()}
      {StudentFeatureRoutes()}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
