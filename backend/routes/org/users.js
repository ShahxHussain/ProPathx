import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword } from '../../utils/password.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { validateCreateUser, validateUpdateOrgUser } from '../../middleware/validation.js';

const router = express.Router();

function getActorOrgUserId(req) {
  return String(req.user.orgUserId ?? req.user.userId ?? '');
}

function orgAdminManageGuard(targetUser, req) {
  if (!targetUser) {
    return { ok: false, status: 404, error: 'User not found' };
  }
  if (targetUser.OrgID !== req.user.orgId) {
    return { ok: false, status: 403, error: 'Access denied' };
  }
  if (targetUser.Role === 'OrgAdmin') {
    return { ok: false, status: 403, error: 'Organization administrators cannot be modified here' };
  }
  if (String(targetUser.OrgUserID) === getActorOrgUserId(req)) {
    return { ok: false, status: 403, error: 'You cannot modify your own account on this page' };
  }
  return { ok: true };
}

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
          MustChangePassword: true,
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

/**
 * PUT /api/org/users/:orgUserId
 * Update Reviewer or Subject Expert in same organization (OrgAdmin only)
 */
router.put(
  '/:orgUserId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  validateUpdateOrgUser,
  async (req, res) => {
    const { orgUserId } = req.params;
    const { fullName, email, password, phone, role, status } = req.body;
    const { orgId, orgUserId: actorOrgUserId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      const { data: existingUser, error: fetchError } = await supabase
        .from('OrgUsers')
        .select('*')
        .eq('OrgUserID', orgUserId)
        .maybeSingle();

      if (fetchError) {
        return res.status(500).json({ error: 'Failed to load user', details: fetchError.message });
      }

      const guard = orgAdminManageGuard(existingUser, req);
      if (!guard.ok) {
        return res.status(guard.status).json({ error: guard.error });
      }

      if (email && email !== existingUser.Email) {
        const { data: emailConflict } = await supabase
          .from('OrgUsers')
          .select('OrgUserID')
          .eq('Email', email)
          .neq('OrgUserID', orgUserId)
          .maybeSingle();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already registered' });
        }
      }

      const updateData = {};
      if (fullName) updateData.FullName = fullName;
      if (email) updateData.Email = email;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (role) updateData.Role = role;
      if (status) updateData.Status = status;
      if (password) {
        updateData.PasswordHash = await hashPassword(password);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from('OrgUsers')
        .update(updateData)
        .eq('OrgUserID', orgUserId)
        .eq('OrgID', orgId)
        .select('OrgUserID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
      }

      await createLog({
        actorType: 'OrgUser',
        actorID: actorOrgUserId,
        actionType: 'Update',
        entityType: 'OrgUser',
        entityID: orgUserId,
        description: `Updated ${updatedUser.Role}: ${updatedUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
        newData: updateData,
      });

      res.json({
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      console.error('Update org user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/org/users/:orgUserId
 * Delete Reviewer or Subject Expert in same organization (OrgAdmin only)
 */
router.delete(
  '/:orgUserId',
  authenticate,
  requireRole(['OrgAdmin']),
  verifyActiveStatus,
  async (req, res) => {
    const { orgUserId } = req.params;
    const { orgId, orgUserId: actorOrgUserId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      const { data: existingUser, error: fetchError } = await supabase
        .from('OrgUsers')
        .select('*')
        .eq('OrgUserID', orgUserId)
        .maybeSingle();

      if (fetchError) {
        return res.status(500).json({ error: 'Failed to load user', details: fetchError.message });
      }

      const guard = orgAdminManageGuard(existingUser, req);
      if (!guard.ok) {
        return res.status(guard.status).json({ error: guard.error });
      }

      const { error: deleteError } = await supabase
        .from('OrgUsers')
        .delete()
        .eq('OrgUserID', orgUserId)
        .eq('OrgID', orgId);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
      }

      await createLog({
        actorType: 'OrgUser',
        actorID: actorOrgUserId,
        actionType: 'Delete',
        entityType: 'OrgUser',
        entityID: orgUserId,
        description: `Deleted ${existingUser.Role}: ${existingUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete org user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

export default router;

