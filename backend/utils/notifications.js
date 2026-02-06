import { supabase } from '../config/database.js';

/**
 * Notification Service Utility
 * Handles creation and management of notifications
 */

/**
 * Create a notification for a single entity
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.entityType - 'User', 'Organization', or 'Student'
 * @param {string} notificationData.entityID - UUID of the entity
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} notificationData.notificationType - Type of notification
 * @returns {Promise<Object>} Created notification
 */
export const createNotification = async ({
  entityType,
  entityID,
  title,
  message,
  notificationType = 'System',
}) => {
  if (!entityType || !entityID || !title || !message) {
    throw new Error('Missing required notification fields');
  }

  const validEntityTypes = ['User', 'Organization', 'Student'];
  if (!validEntityTypes.includes(entityType)) {
    throw new Error(`Invalid EntityType. Must be one of: ${validEntityTypes.join(', ')}`);
  }

  const validNotificationTypes = ['System', 'Payment', 'Exam', 'Result', 'Reminder', 'Alert'];
  if (!validNotificationTypes.includes(notificationType)) {
    throw new Error(`Invalid NotificationType. Must be one of: ${validNotificationTypes.join(', ')}`);
  }

  const { data: notification, error } = await supabase
    .from('Notifications')
    .insert({
      EntityType: entityType,
      EntityID: entityID,
      Title: title.trim(),
      Message: message.trim(),
      NotificationType: notificationType,
      IsRead: false,
      CreatedAt: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create notification: ${error.message}`);
  }

  return notification;
};

/**
 * Create notifications for all users in an organization
 * @param {string} orgID - Organization ID
 * @param {Object} notificationData - Notification data (without entityType and entityID)
 * @returns {Promise<number>} Number of notifications created
 */
export const createOrgNotifications = async (orgID, notificationData) => {
  // Get all active OrgUsers in the organization
  const { data: orgUsers, error: usersError } = await supabase
    .from('OrgUsers')
    .select('OrgUserID')
    .eq('OrgID', orgID)
    .eq('Status', 'Active');

  if (usersError) {
    throw new Error(`Failed to fetch organization users: ${usersError.message}`);
  }

  if (!orgUsers || orgUsers.length === 0) {
    return 0;
  }

  // Create notification for each user
  const notifications = orgUsers.map((user) => ({
    EntityType: 'User',
    EntityID: user.OrgUserID,
    Title: notificationData.title.trim(),
    Message: notificationData.message.trim(),
    NotificationType: notificationData.notificationType || 'System',
    IsRead: false,
    CreatedAt: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('Notifications')
    .insert(notifications)
    .select();

  if (error) {
    throw new Error(`Failed to create organization notifications: ${error.message}`);
  }

  return data.length;
};

/**
 * Create notifications for all students in an organization
 * @param {string} orgID - Organization ID
 * @param {Object} notificationData - Notification data (without entityType and entityID)
 * @returns {Promise<number>} Number of notifications created
 */
export const createStudentNotifications = async (orgID, notificationData) => {
  // Get all active students in the organization
  const { data: students, error: studentsError } = await supabase
    .from('Students')
    .select('StudentID')
    .eq('OrgID', orgID)
    .eq('Status', 'Active');

  if (studentsError) {
    throw new Error(`Failed to fetch students: ${studentsError.message}`);
  }

  if (!students || students.length === 0) {
    return 0;
  }

  // Create notification for each student
  const notifications = students.map((student) => ({
    EntityType: 'Student',
    EntityID: student.StudentID,
    Title: notificationData.title.trim(),
    Message: notificationData.message.trim(),
    NotificationType: notificationData.notificationType || 'System',
    IsRead: false,
    CreatedAt: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('Notifications')
    .insert(notifications)
    .select();

  if (error) {
    throw new Error(`Failed to create student notifications: ${error.message}`);
  }

  return data.length;
};

/**
 * Create notifications for all platform users (SuperAdmin, Reviewer, Subject Expert)
 * @param {Object} notificationData - Notification data (without entityType and entityID)
 * @returns {Promise<number>} Number of notifications created
 */
export const createPlatformUserNotifications = async (notificationData) => {
  // Get all active platform users
  const { data: users, error: usersError } = await supabase
    .from('Users')
    .select('UserID')
    .eq('Status', 'Active');

  if (usersError) {
    throw new Error(`Failed to fetch platform users: ${usersError.message}`);
  }

  if (!users || users.length === 0) {
    return 0;
  }

  // Create notification for each user
  const notifications = users.map((user) => ({
    EntityType: 'User',
    EntityID: user.UserID,
    Title: notificationData.title.trim(),
    Message: notificationData.message.trim(),
    NotificationType: notificationData.notificationType || 'System',
    IsRead: false,
    CreatedAt: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('Notifications')
    .insert(notifications)
    .select();

  if (error) {
    throw new Error(`Failed to create platform user notifications: ${error.message}`);
  }

  return data.length;
};

/**
 * Create notifications for all organizations (all OrgUsers in all orgs)
 * @param {Object} notificationData - Notification data (without entityType and entityID)
 * @returns {Promise<number>} Number of notifications created
 */
export const createAllOrgNotifications = async (notificationData) => {
  // Get all active organizations
  const { data: orgs, error: orgsError } = await supabase
    .from('Organizations')
    .select('OrgID')
    .eq('Status', 'Active');

  if (orgsError) {
    throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
  }

  if (!orgs || orgs.length === 0) {
    return 0;
  }

  let totalCreated = 0;

  // Create notifications for each organization
  for (const org of orgs) {
    const count = await createOrgNotifications(org.OrgID, notificationData);
    totalCreated += count;
  }

  return totalCreated;
};



