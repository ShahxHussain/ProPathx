/**
 * Central route registry — mount paths stay in one place.
 */
import orgAuthRoutes from './org/auth.js';
import studentAuthRoutes from './student/auth.js';
import userRoutes from './org/users.js';
import adminRoutes from './admin/index.js';
import questionRoutes from './shared/questions.js';
import reviewerRoutes from './shared/reviewers.js';
import notificationRoutes from './shared/notifications.js';
import testRoutes from './org/tests/index.js';
import studentPortalRoutes from './student/portal.js';
import orgStudentRoutes from './org/students.js';
import groupRoutes from './org/groups.js';
import orgSettingsRoutes from './org/settings.js';
import profileRoutes from './shared/profile.js';

/**
 * @param {import('express').Express} app
 */
export function registerApiRoutes(app) {
  app.use('/api/org/auth', orgAuthRoutes);
  app.use('/api/student/auth', studentAuthRoutes);
  app.use('/api/student', studentPortalRoutes);
  app.use('/api/org/users', userRoutes);
  app.use('/api/org/tests', testRoutes);
  app.use('/api/org/students', orgStudentRoutes);
  app.use('/api/org/groups', groupRoutes);
  app.use('/api/org/settings', orgSettingsRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/reviewers', reviewerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/profile', profileRoutes);
}

export default registerApiRoutes;
