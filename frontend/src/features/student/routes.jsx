import { Route, Navigate } from 'react-router-dom';
import StudentLayout from '../../components/layouts/StudentLayout';
import StudentDashboard from '../../pages/student/Dashboard';
import StudentAssignments from '../../pages/student/Assignments';
import StudentTestAttempt from '../../pages/student/TestAttempt';
import StudentTestResult from '../../pages/student/TestResult';
import StudentReports from '../../pages/student/Reports';
import StudentSubscriptionPlans from '../../pages/student/SubscriptionPlans';
import SelfTestBuilder from '../../pages/student/SelfTestBuilder';
import ExamEnrollments from '../../pages/student/ExamEnrollments';
import Notifications from '../../pages/Notifications';
import Profile from '../profile/pages/Profile';
import {
  ProtectedRoute,
  IndividualStudentRoute,
  OrganizationStudentRoute,
} from '../auth/routes/guards';

/** Student portal routes — mounted at `/student/*` */
export function StudentFeatureRoutes() {
  return (
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
      <Route path="self-test" element={<SelfTestBuilder />} />
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
      <Route path="profile" element={<Profile />} />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Route>
  );
}
