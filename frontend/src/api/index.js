/**
 * Domain-split API modules. Import from `services/api.js` for backward compatibility.
 */
import { orgAuth } from './org/auth.js';
import { userManagement } from './org/users.js';
import { orgDashboard } from './org/dashboard.js';
import { orgSettingsAPI } from './org/settings.js';
import { adminAPI } from './admin/admin.js';
import { examAPI } from './org/exams.js';
import { questionAPI } from './expert/questions.js';
import { reviewerAPI } from './reviewer/reviewers.js';
import { notificationAPI } from './common/notifications.js';
import { testAPI } from './org/tests.js';
import { studentAPI } from './org/students.js';
import { studentAuth } from './student/auth.js';
import { studentDashboardAPI } from './student/dashboard.js';

export { request, API_BASE_URL } from './client.js';

export { orgAuth } from './org/auth.js';
export { syncStoredUser, profileAPI } from './common/profile.js';
export { userManagement } from './org/users.js';
export { orgDashboard } from './org/dashboard.js';
export { testAPI } from './org/tests.js';
export { studentAPI } from './org/students.js';
export { groupAPI } from './org/groups.js';
export { adminAPI } from './admin/admin.js';
export { examAPI } from './org/exams.js';
export { questionAPI } from './expert/questions.js';
export { reviewerAPI } from './reviewer/reviewers.js';
export { notificationAPI } from './common/notifications.js';
export { studentAuth } from './student/auth.js';
export { studentDashboardAPI } from './student/dashboard.js';
export { orgSettingsAPI } from './org/settings.js';

const api = {
  orgAuth,
  userManagement,
  orgDashboard,
  orgSettingsAPI,
  adminAPI,
  examAPI,
  questionAPI,
  reviewerAPI,
  notificationAPI,
  testAPI,
  studentAPI,
  studentAuth,
  studentDashboardAPI,
};

export default api;
