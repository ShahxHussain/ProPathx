import express from 'express';
import { supabase } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { createLog, getClientIP, getUserAgent } from '../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../middleware/auth.js';
import { validateCreateUser } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/org/users
 * Create Reviewer or Subject Expert user (OrgAdmin only)
 */
router.post(
  '/',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validateCreateUser,
  async (req, res) => {
    const { fullName, email, password, phone, role } = req.body;
    const { orgId, orgUserId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('OrgUsers')
        .select('OrgUserID')
        .eq('Email', email)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create new user
      const { data: newUser, error: userError } = await supabase
        .from('OrgUsers')
        .insert({
          OrgID: orgId,
          FullName: fullName,
          Email: email,
          PasswordHash: passwordHash,
          Role: role,
          Phone: phone || null,
          Status: 'Active',
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (userError) {
        return res.status(500).json({ error: 'Failed to create user', details: userError.message });
      }

      // Create log
      await createLog({
        actorType: 'OrgUser',
        actorID: orgUserId,
        actionType: 'Create',
        entityType: 'OrgUser',
        entityID: newUser.OrgUserID,
        description: `Created ${role} user: ${fullName}`,
        ipAddress,
        userAgent,
        newData: { fullName, email, role },
      });

      res.status(201).json({
        message: 'User created successfully',
        user: {
          userId: newUser.OrgUserID,
          fullName: newUser.FullName,
          email: newUser.Email,
          role: newUser.Role,
          status: newUser.Status,
        },
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/org/users
 * List all users in organization (OrgAdmin only)
 */
router.get('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { orgId } = req.user;

  try {
    const { data: users, error } = await supabase
      .from('OrgUsers')
      .select('OrgUserID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
      .eq('OrgID', orgId)
      .order('CreatedAt', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }

    res.json({
      users: users || [],
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;

