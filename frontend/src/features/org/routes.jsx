import { Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import ExploreExams from './pages/ExploreExams';
import Tests from './pages/Tests';
import TestWizardPage from './pages/testWizard/TestWizardPage';
import TestAssignments from './pages/TestAssignments';
import Students from './pages/Students';
import OrgStudentExamEnrollments from './pages/OrgStudentExamEnrollments';
import Groups from './pages/Groups';
import OrgLogs from './pages/Logs';
import OrgSubscriptionPlans from './pages/SubscriptionPlans';
import Settings from './pages/Settings';
import QuestionBank from './pages/QuestionBank';
import TestQuestionsPage from './pages/TestQuestions';
import ViewTestQuestions from './pages/ViewTestQuestions';
import CreateNotificationOrg from './pages/CreateNotification';
import Notifications from '../../pages/Notifications';
import Profile from '../profile/pages/Profile';
import { ProtectedRoute } from '../auth/routes/guards';

/** OrgAdmin portal routes — mounted at `/org/*` */
export function OrgFeatureRoutes() {
  return (
    <Route
      path="/org/*"
      element={
        <ProtectedRoute allowedRoles={['OrgAdmin']}>
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
      <Route path="profile" element={<Profile />} />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Route>
  );
}
