import express from 'express';
import { body } from 'express-validator';
import { authenticate, verifyActiveStatus } from '../../middleware/auth.js';
import { handleValidationErrors } from '../../middleware/validation.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { respondDatabaseUnavailable } from '../../utils/supabaseErrors.js';
import {
  changeProfilePassword,
  GENDERS,
  getProfileMeta,
  loadProfile,
  updateProfile,
} from '../../services/profileService.js';

const router = express.Router();

router.use(authenticate, verifyActiveStatus);

/**
 * GET /api/profile
 */
router.get('/', async (req, res) => {
  try {
    const result = await loadProfile(req.user);
    if (result.connectivityError) return respondDatabaseUnavailable(res, result.connectivityError);
    if (result.notFound || !result.profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    const meta = getProfileMeta(result.profile);
    res.json({ profile: result.profile, ...meta });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const validateProfilePatch = [
  body('fullName').optional().trim().isLength({ min: 1, max: 120 }),
  body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('profileImageUrl').optional({ nullable: true }).trim(),
  body('address').optional({ nullable: true }).trim().isLength({ max: 300 }),
  body('fatherName').optional({ nullable: true }).trim().isLength({ max: 120 }),
  body('gender').optional({ nullable: true }).isIn([...GENDERS, '']),
  body('dateOfBirth').optional({ nullable: true }).isISO8601().toDate(),
  handleValidationErrors,
];

/**
 * PATCH /api/profile
 */
router.patch('/', validateProfilePatch, async (req, res) => {
  try {
    const result = await updateProfile(req.user, req.body);

    if (result.validationError) {
      return res.status(400).json({ error: result.validationError[0], details: result.validationError });
    }
    if (result.unsupported) {
      return res.status(403).json({ error: 'Unsupported account type' });
    }
    if (result.connectivityError) {
      return respondDatabaseUnavailable(res, result.connectivityError);
    }
    if (result.updateError) {
      return res.status(result.updateError.status).json({
        error: result.updateError.error,
        details: result.updateError.details,
      });
    }
    if (result.notFound) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const actorID = req.user.userId || req.user.orgUserId || req.user.studentId;
    const actorType = req.user.actorType;
    await createLog({
      actorType: actorType === 'OrgUser' ? 'OrgUser' : actorType === 'Student' ? 'Student' : 'User',
      actorID,
      actionType: 'Update',
      entityType: 'User',
      entityID: actorID,
      description: 'Updated own profile',
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.json({
      message: 'Profile updated successfully',
      profile: result.profile,
      ...result.meta,
    });
  } catch (error) {
    console.error('Patch profile error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const validatePasswordPatch = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  handleValidationErrors,
];

/**
 * PATCH /api/profile/password
 */
router.patch('/password', validatePasswordPatch, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await changeProfilePassword(req.user, { currentPassword, newPassword });

    if (result.unsupported) {
      return res.status(403).json({ error: 'Unsupported account type' });
    }
    if (result.notFound) {
      return res.status(404).json({ error: 'Account not found' });
    }
    if (result.wrongPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (result.samePassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }
    if (result.connectivityError) {
      return respondDatabaseUnavailable(res, result.connectivityError);
    }
    if (result.updateError) {
      return res.status(result.updateError.status).json({
        error: result.updateError.error,
        details: result.updateError.details,
      });
    }

    const actorID = req.user.userId || req.user.orgUserId || req.user.studentId;
    const actorType = req.user.actorType;
    await createLog({
      actorType: actorType === 'OrgUser' ? 'OrgUser' : actorType === 'Student' ? 'Student' : 'User',
      actorID,
      actionType: 'Update',
      entityType: 'User',
      entityID: actorID,
      description: 'Changed own password',
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Patch profile password error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
