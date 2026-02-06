import express from 'express';
import { supabase } from '../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import {
  createNotification,
  createOrgNotifications,
  createStudentNotifications,
  createPlatformUserNotifications,
  createAllOrgNotifications,
} from '../utils/notifications.js';
import { authenticate, requireRole, requireSuperAdmin, verifyActiveStatus } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Validation rules for creating notifications
 */
const validateCreateNotification = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('notificationType')
    .optional()
    .isIn(['System', 'Payment', 'Exam', 'Result', 'Reminder', 'Alert'])
    .withMessage('Invalid notification type'),
  body('targetType')
    .isIn([
      'single',
      'organization',
      'allOrgUsers',
      'allStudents',
      'allPlatformUsers',
      'allOrganizations',
      'platformRole',
      'orgRole',
    ])
    .withMessage('Invalid target type'),
  body('entityID')
    .optional()
    .isUUID()
    .withMessage('EntityID must be a valid UUID'),
  body('targetRole')
    .optional()
    .isIn(['Reviewer', 'Subject Expert'])
    .withMessage('Invalid target role'),
  handleValidationErrors,
];

/**
 * GET /api/notifications
 * Get all notifications for the logged-in user
 */
router.get('/', authenticate, verifyActiveStatus, async (req, res) => {
  const { userId, orgUserId, orgId, actorType, role, studentId } = req.user;

  try {
    let query = supabase
      .from('Notifications')
      .select('*')
      .order('CreatedAt', { ascending: false })
      .limit(100);

    // Determine entity type and ID based on user type
    let entityType, entityID;

    if (actorType === 'User' && role === 'SuperAdmin') {
      // SuperAdmin receives notifications as platform User
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'OrgUser') {
      // OrgUsers receive notifications as User (using OrgUserID)
      entityType = 'User';
      entityID = orgUserId;
      
      // Also get organization-level notifications
      const { data: userNotifications } = await query.eq('EntityType', 'User').eq('EntityID', orgUserId);
      const { data: orgNotifications } = await supabase
        .from('Notifications')
        .select('*')
        .eq('EntityType', 'Organization')
        .eq('EntityID', orgId)
        .order('CreatedAt', { ascending: false })
        .limit(100);

      const allNotifications = [
        ...(userNotifications || []),
        ...(orgNotifications || []),
      ].sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

      return res.json({ notifications: allNotifications.slice(0, 100) });
    } else if (actorType === 'User') {
      // Platform-level users (Reviewer, Subject Expert)
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'Student') {
      // Students receive notifications as Student entity
      entityType = 'Student';
      entityID = studentId;
    } else {
      return res.status(403).json({ error: 'Invalid user type' });
    }

    query = query.eq('EntityType', entityType).eq('EntityID', entityID);

    const { data: notifications, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
    }

    res.json({ notifications: notifications || [] });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', authenticate, verifyActiveStatus, async (req, res) => {
  const { userId, orgUserId, orgId, actorType, role, studentId } = req.user;

  try {
    let entityType, entityID;

    if (actorType === 'User' && role === 'SuperAdmin') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'OrgUser') {
      // Count user-specific notifications
      const { count: userCount } = await supabase
        .from('Notifications')
        .select('*', { count: 'exact', head: true })
        .eq('EntityType', 'User')
        .eq('EntityID', orgUserId)
        .eq('IsRead', false);

      // Count organization-level notifications
      const { count: orgCount } = await supabase
        .from('Notifications')
        .select('*', { count: 'exact', head: true })
        .eq('EntityType', 'Organization')
        .eq('EntityID', orgId)
        .eq('IsRead', false);

      return res.json({ unreadCount: (userCount || 0) + (orgCount || 0) });
    } else if (actorType === 'User') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'Student') {
      entityType = 'Student';
      entityID = studentId;
    } else {
      return res.status(403).json({ error: 'Invalid user type' });
    }

    const { count, error } = await supabase
      .from('Notifications')
      .select('*', { count: 'exact', head: true })
      .eq('EntityType', entityType)
      .eq('EntityID', entityID)
      .eq('IsRead', false);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch unread count', details: error.message });
    }

    res.json({ unreadCount: count || 0 });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put('/:notificationId/read', authenticate, verifyActiveStatus, async (req, res) => {
  const { notificationId } = req.params;
  const { userId, orgUserId, orgId, actorType, role, studentId } = req.user;

  try {
    // First, verify the notification belongs to the user
    let entityType, entityID;

    if (actorType === 'User' && role === 'SuperAdmin') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'OrgUser') {
      // Check if it's a user notification or org notification
      const { data: notification } = await supabase
        .from('Notifications')
        .select('*')
        .eq('NotificationID', notificationId)
        .single();

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      // Verify access
      if (
        (notification.EntityType === 'User' && notification.EntityID !== orgUserId) ||
        (notification.EntityType === 'Organization' && notification.EntityID !== orgId)
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (actorType === 'User') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'Student') {
      entityType = 'Student';
      entityID = studentId;
    } else {
      return res.status(403).json({ error: 'Invalid user type' });
    }

    // Verify notification belongs to user (if not OrgUser, which we already checked)
    if (actorType !== 'OrgUser') {
      const { data: notification } = await supabase
        .from('Notifications')
        .select('*')
        .eq('NotificationID', notificationId)
        .eq('EntityType', entityType)
        .eq('EntityID', entityID)
        .single();

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }
    }

    // Mark as read
    const { data: updatedNotification, error } = await supabase
      .from('Notifications')
      .update({
        IsRead: true,
        ReadAt: new Date().toISOString(),
      })
      .eq('NotificationID', notificationId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to mark notification as read', details: error.message });
    }

    res.json({ message: 'Notification marked as read', notification: updatedNotification });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for the user
 */
router.put('/mark-all-read', authenticate, verifyActiveStatus, async (req, res) => {
  const { userId, orgUserId, orgId, actorType, role, studentId } = req.user;

  try {
    if (actorType === 'OrgUser') {
      // Mark user-specific notifications as read
      await supabase
        .from('Notifications')
        .update({
          IsRead: true,
          ReadAt: new Date().toISOString(),
        })
        .eq('EntityType', 'User')
        .eq('EntityID', orgUserId)
        .eq('IsRead', false);

      // Mark organization-level notifications as read
      await supabase
        .from('Notifications')
        .update({
          IsRead: true,
          ReadAt: new Date().toISOString(),
        })
        .eq('EntityType', 'Organization')
        .eq('EntityID', orgId)
        .eq('IsRead', false);
    } else {
      let entityType, entityID;

      if (actorType === 'User' && role === 'SuperAdmin') {
        entityType = 'User';
        entityID = userId;
      } else if (actorType === 'User') {
        entityType = 'User';
        entityID = userId;
      } else if (actorType === 'Student') {
        entityType = 'Student';
        entityID = studentId;
      } else {
        return res.status(403).json({ error: 'Invalid user type' });
      }

      await supabase
        .from('Notifications')
        .update({
          IsRead: true,
          ReadAt: new Date().toISOString(),
        })
        .eq('EntityType', entityType)
        .eq('EntityID', entityID)
        .eq('IsRead', false);
    }

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/notifications/create
 * Create notifications (SuperAdmin only)
 */
router.post(
  '/admin/create',
  authenticate,
  requireSuperAdmin,
  validateCreateNotification,
  async (req, res) => {
    const { title, message, notificationType, targetType, entityID } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      let notificationsCreated = 0;
      let notificationDetails = [];

      switch (targetType) {
        case 'single':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID is required for single target' });
          }
          // Determine entity type from entityID (check Users, OrgUsers, Students, Organizations)
          const { data: platformUser } = await supabase
            .from('Users')
            .select('UserID')
            .eq('UserID', entityID)
            .single();

          if (platformUser) {
            const notification = await createNotification({
              entityType: 'User',
              entityID: entityID,
              title,
              message,
              notificationType: notificationType || 'System',
            });
            notificationsCreated = 1;
            notificationDetails.push({ entityType: 'User', entityID });
          } else {
            const { data: orgUser } = await supabase
              .from('OrgUsers')
              .select('OrgUserID')
              .eq('OrgUserID', entityID)
              .single();

            if (orgUser) {
              const notification = await createNotification({
                entityType: 'User',
                entityID: entityID,
                title,
                message,
                notificationType: notificationType || 'System',
              });
              notificationsCreated = 1;
              notificationDetails.push({ entityType: 'User', entityID });
            } else {
              const { data: student } = await supabase
                .from('Students')
                .select('StudentID')
                .eq('StudentID', entityID)
                .single();

              if (student) {
                const notification = await createNotification({
                  entityType: 'Student',
                  entityID: entityID,
                  title,
                  message,
                  notificationType: notificationType || 'System',
                });
                notificationsCreated = 1;
                notificationDetails.push({ entityType: 'Student', entityID });
              } else {
                return res.status(404).json({ error: 'Entity not found' });
              }
            }
          }
          break;

        case 'organization':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID (OrgID) is required for organization target' });
          }
          // Verify organization exists
          const { data: org } = await supabase
            .from('Organizations')
            .select('OrgID, OrgName')
            .eq('OrgID', entityID)
            .single();

          if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
          }

          notificationsCreated = await createOrgNotifications(entityID, {
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Organization', entityID, orgName: org.OrgName });
          break;

        case 'allOrgUsers':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID (OrgID) is required for allOrgUsers target' });
          }
          // Verify organization exists
          const { data: org2 } = await supabase
            .from('Organizations')
            .select('OrgID, OrgName')
            .eq('OrgID', entityID)
            .single();

          if (!org2) {
            return res.status(404).json({ error: 'Organization not found' });
          }

          notificationsCreated = await createOrgNotifications(entityID, {
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Organization', entityID, orgName: org2.OrgName });
          break;

        case 'allStudents':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID (OrgID) is required for allStudents target' });
          }
          // Verify organization exists
          const { data: org3 } = await supabase
            .from('Organizations')
            .select('OrgID, OrgName')
            .eq('OrgID', entityID)
            .single();

          if (!org3) {
            return res.status(404).json({ error: 'Organization not found' });
          }

          notificationsCreated = await createStudentNotifications(entityID, {
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Organization', entityID, orgName: org3.OrgName, target: 'Students' });
          break;

        case 'allPlatformUsers':
          notificationsCreated = await createPlatformUserNotifications({
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Platform', target: 'All Platform Users' });
          break;

        case 'allOrganizations':
          notificationsCreated = await createAllOrgNotifications({
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Platform', target: 'All Organizations' });
          break;

        case 'platformRole':
          if (!targetRole) {
            return res.status(400).json({ error: 'targetRole is required for platformRole' });
          }
          // Get all platform users by role
          const { data: roleUsers, error: roleUsersError } = await supabase
            .from('Users')
            .select('UserID')
            .eq('Role', targetRole)
            .eq('Status', 'Active');

          if (roleUsersError) {
            return res.status(500).json({ error: 'Failed to fetch users by role', details: roleUsersError.message });
          }

          if (!roleUsers || roleUsers.length === 0) {
            notificationsCreated = 0;
          } else {
            const notifications = roleUsers.map((u) => ({
              EntityType: 'User',
              EntityID: u.UserID,
              Title: title.trim(),
              Message: message.trim(),
              NotificationType: notificationType || 'System',
              IsRead: false,
              CreatedAt: new Date().toISOString(),
            }));

            const { data, error } = await supabase.from('Notifications').insert(notifications).select();
            if (error) {
              return res.status(500).json({ error: 'Failed to create notifications', details: error.message });
            }
            notificationsCreated = data.length;
          }
          notificationDetails.push({ entityType: 'User', targetRole, scope: 'Platform' });
          break;

        case 'orgRole':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID (OrgID) is required for orgRole' });
          }
          if (!targetRole) {
            return res.status(400).json({ error: 'targetRole is required for orgRole' });
          }
          // Verify organization exists
          const { data: orgRoleOrg } = await supabase
            .from('Organizations')
            .select('OrgID, OrgName')
            .eq('OrgID', entityID)
            .single();

          if (!orgRoleOrg) {
            return res.status(404).json({ error: 'Organization not found' });
          }

          const { data: orgRoleUsers, error: orgRoleUsersError } = await supabase
            .from('OrgUsers')
            .select('OrgUserID')
            .eq('OrgID', entityID)
            .eq('Role', targetRole)
            .eq('Status', 'Active');

          if (orgRoleUsersError) {
            return res.status(500).json({ error: 'Failed to fetch org users by role', details: orgRoleUsersError.message });
          }

          if (!orgRoleUsers || orgRoleUsers.length === 0) {
            notificationsCreated = 0;
          } else {
            const notifications = orgRoleUsers.map((u) => ({
              EntityType: 'User',
              EntityID: u.OrgUserID,
              Title: title.trim(),
              Message: message.trim(),
              NotificationType: notificationType || 'System',
              IsRead: false,
              CreatedAt: new Date().toISOString(),
            }));

            const { data, error } = await supabase.from('Notifications').insert(notifications).select();
            if (error) {
              return res.status(500).json({ error: 'Failed to create notifications', details: error.message });
            }
            notificationsCreated = data.length;
          }
          notificationDetails.push({ entityType: 'Organization', orgId: entityID, targetRole, scope: 'OrgUsers' });
          break;

        default:
          return res.status(400).json({ error: 'Invalid target type' });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Create',
        entityType: 'Notification',
        entityID: null,
        description: `Super Admin created ${notificationsCreated} notification(s): ${title}`,
        ipAddress,
        userAgent,
        newData: {
          title,
          message,
          notificationType: notificationType || 'System',
          targetType,
          notificationsCreated,
          notificationDetails,
        },
      });

      res.status(201).json({
        message: `Successfully created ${notificationsCreated} notification(s)`,
        notificationsCreated,
        notificationDetails,
      });
    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * POST /api/org/notifications/create
 * Create notifications (OrgAdmin only)
 */
router.post(
  '/org/create',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validateCreateNotification,
  async (req, res) => {
    const { title, message, notificationType, targetType, entityID } = req.body;
    const { orgId, orgUserId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      let notificationsCreated = 0;
      let notificationDetails = [];

      switch (targetType) {
        case 'single':
          if (!entityID) {
            return res.status(400).json({ error: 'EntityID is required for single target' });
          }
          // Verify entity belongs to the organization
          const { data: orgUser } = await supabase
            .from('OrgUsers')
            .select('OrgUserID, OrgID')
            .eq('OrgUserID', entityID)
            .eq('OrgID', orgId)
            .single();

          if (orgUser) {
            const notification = await createNotification({
              entityType: 'User',
              entityID: entityID,
              title,
              message,
              notificationType: notificationType || 'System',
            });
            notificationsCreated = 1;
            notificationDetails.push({ entityType: 'User', entityID });
          } else {
            // Check if it's a student
            const { data: student } = await supabase
              .from('Students')
              .select('StudentID, OrgID')
              .eq('StudentID', entityID)
              .eq('OrgID', orgId)
              .single();

            if (student) {
              const notification = await createNotification({
                entityType: 'Student',
                entityID: entityID,
                title,
                message,
                notificationType: notificationType || 'System',
              });
              notificationsCreated = 1;
              notificationDetails.push({ entityType: 'Student', entityID });
            } else {
              return res.status(403).json({ error: 'Entity does not belong to your organization' });
            }
          }
          break;

        case 'organization':
        case 'allOrgUsers':
          // Send to all users in the organization
          notificationsCreated = await createOrgNotifications(orgId, {
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Organization', entityID: orgId });
          break;

        case 'allStudents':
          // Send to all students in the organization
          notificationsCreated = await createStudentNotifications(orgId, {
            title,
            message,
            notificationType: notificationType || 'System',
          });
          notificationDetails.push({ entityType: 'Organization', entityID: orgId, target: 'Students' });
          break;

        case 'orgRole':
          if (!targetRole) {
            return res.status(400).json({ error: 'targetRole is required for orgRole' });
          }
          // Get all active org users by role in this org
          const { data: roleUsers, error: roleUsersError } = await supabase
            .from('OrgUsers')
            .select('OrgUserID')
            .eq('OrgID', orgId)
            .eq('Role', targetRole)
            .eq('Status', 'Active');

          if (roleUsersError) {
            return res.status(500).json({ error: 'Failed to fetch users by role', details: roleUsersError.message });
          }

          if (!roleUsers || roleUsers.length === 0) {
            notificationsCreated = 0;
          } else {
            const notifications = roleUsers.map((u) => ({
              EntityType: 'User',
              EntityID: u.OrgUserID,
              Title: title.trim(),
              Message: message.trim(),
              NotificationType: notificationType || 'System',
              IsRead: false,
              CreatedAt: new Date().toISOString(),
            }));

            const { data, error } = await supabase.from('Notifications').insert(notifications).select();
            if (error) {
              return res.status(500).json({ error: 'Failed to create notifications', details: error.message });
            }
            notificationsCreated = data.length;
          }
          notificationDetails.push({ entityType: 'Organization', entityID: orgId, targetRole, scope: 'OrgUsers' });
          break;

        default:
          return res.status(400).json({ error: 'Invalid target type for OrgAdmin' });
      }

      // Create log
      await createLog({
        actorType: 'OrgUser',
        actorID: actorId,
        actionType: 'Create',
        entityType: 'Notification',
        entityID: null,
        description: `OrgAdmin created ${notificationsCreated} notification(s): ${title}`,
        ipAddress,
        userAgent,
        newData: {
          title,
          message,
          notificationType: notificationType || 'System',
          targetType,
          notificationsCreated,
          notificationDetails,
        },
      });

      res.status(201).json({
        message: `Successfully created ${notificationsCreated} notification(s)`,
        notificationsCreated,
        notificationDetails,
      });
    } catch (error) {
      console.error('Create notification error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/notifications/:notificationId
 * Delete a notification (optional feature)
 */
router.delete('/:notificationId', authenticate, verifyActiveStatus, async (req, res) => {
  const { notificationId } = req.params;
  const { userId, orgUserId, orgId, actorType, role, studentId } = req.user;

  try {
    // Verify notification belongs to user
    let entityType, entityID;

    if (actorType === 'User' && role === 'SuperAdmin') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'OrgUser') {
      // Check if it's a user notification or org notification
      const { data: notification } = await supabase
        .from('Notifications')
        .select('*')
        .eq('NotificationID', notificationId)
        .single();

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      // Verify access
      if (
        (notification.EntityType === 'User' && notification.EntityID !== orgUserId) ||
        (notification.EntityType === 'Organization' && notification.EntityID !== orgId)
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (actorType === 'User') {
      entityType = 'User';
      entityID = userId;
    } else if (actorType === 'Student') {
      entityType = 'Student';
      entityID = studentId;
    } else {
      return res.status(403).json({ error: 'Invalid user type' });
    }

    // Verify notification belongs to user (if not OrgUser, which we already checked)
    if (actorType !== 'OrgUser') {
      const { data: notification } = await supabase
        .from('Notifications')
        .select('*')
        .eq('NotificationID', notificationId)
        .eq('EntityType', entityType)
        .eq('EntityID', entityID)
        .single();

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }
    }

    const { error } = await supabase
      .from('Notifications')
      .delete()
      .eq('NotificationID', notificationId);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete notification', details: error.message });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;

