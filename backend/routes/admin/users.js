import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import { validateCreatePlatformUser, validateUpdatePlatformUser } from '../../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/admin/users/create
 * Create a platform-level user (Reviewer or Subject Expert) - SuperAdmin only
 * NOTE: This route must come before GET /users to ensure proper route matching
 */
router.post(
  '/users/create',
  authenticate,
  requireSuperAdmin,
  validateCreatePlatformUser,
  async (req, res) => {
    console.log('POST /api/admin/users/create - Route hit!');
    const { fullName, email, password, phone, role } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if email already exists in Users table
      const { data: existingUser } = await supabase
        .from('Users')
        .select('UserID')
        .eq('Email', email)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered as a platform user' });
      }

      // Check if email exists in OrgUsers table (to prevent conflicts)
      const { data: existingOrgUser } = await supabase
        .from('OrgUsers')
        .select('OrgUserID')
        .eq('Email', email)
        .single();

      if (existingOrgUser) {
        return res.status(409).json({
          error: 'Email already registered as an organization user. Platform users must have unique emails.',
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create new platform user
      const { data: newUser, error: userError } = await supabase
        .from('Users')
        .insert({
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
        return res.status(500).json({ error: 'Failed to create platform user', details: userError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Create',
        entityType: 'User',
        entityID: newUser.UserID,
        description: `Super Admin created platform ${role} user: ${fullName}`,
        ipAddress,
        userAgent,
        newData: { fullName, email, role, userType: 'Platform' },
      });

      res.status(201).json({
        message: 'Platform user created successfully',
        user: {
          userId: newUser.UserID,
          fullName: newUser.FullName,
          email: newUser.Email,
          role: newUser.Role,
          status: newUser.Status,
          userType: 'Platform',
        },
      });
    } catch (error) {
      console.error('Create platform user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * GET /api/admin/users
 * List all platform users and organization users with details (SuperAdmin only)
 */
router.get('/users', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Platform-level users (Users table)
    const { data: platformUsers, error: platformError } = await supabase
      .from('Users')
      .select('UserID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
      .order('CreatedAt', { ascending: false });

    if (platformError) {
      return res.status(500).json({ error: 'Failed to fetch platform users', details: platformError.message });
    }

    // Organization users with their organization info
    const { data: orgUsers, error: orgUsersError } = await supabase
      .from('OrgUsers')
      .select('OrgUserID, OrgID, FullName, Email, Role, Phone, Status, CreatedAt, LastLogin')
      .order('CreatedAt', { ascending: false });

    if (orgUsersError) {
      return res.status(500).json({ error: 'Failed to fetch organization users', details: orgUsersError.message });
    }

    // Fetch organizations to map OrgID -> OrgName
    const { data: orgs, error: orgsError } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName');

    if (orgsError) {
      return res.status(500).json({ error: 'Failed to fetch organizations', details: orgsError.message });
    }

    const orgMap = new Map(orgs.map((o) => [o.OrgID, o.OrgName]));

    const orgUsersWithOrg = orgUsers.map((u) => ({
      ...u,
      OrgName: orgMap.get(u.OrgID) || null,
    }));

    res.json({
      platformUsers: platformUsers || [],
      orgUsers: orgUsersWithOrg,
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Update a platform-level user (SuperAdmin only)
 */
router.put(
  '/users/:userId',
  authenticate,
  requireSuperAdmin,
  validateUpdatePlatformUser,
  async (req, res) => {
    const { userId } = req.params;
    const { fullName, email, password, phone, role, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('Users')
        .select('*')
        .eq('UserID', userId)
        .single();

      if (fetchError || !existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent editing SuperAdmin role (safety check)
      if (existingUser.Role === 'SuperAdmin' && role && role !== 'SuperAdmin') {
        return res.status(403).json({ error: 'Cannot change SuperAdmin role' });
      }

      // If email is being changed, check for conflicts
      if (email && email !== existingUser.Email) {
        const { data: emailConflict } = await supabase
          .from('Users')
          .select('UserID')
          .eq('Email', email)
          .neq('UserID', userId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another platform user' });
        }

        // Check OrgUsers table too
        const { data: orgEmailConflict } = await supabase
          .from('OrgUsers')
          .select('OrgUserID')
          .eq('Email', email)
          .single();

        if (orgEmailConflict) {
          return res.status(409).json({ error: 'Email already in use by an organization user' });
        }
      }

      // Build update object
      const updateData = {};
      if (fullName) updateData.FullName = fullName;
      if (email) updateData.Email = email;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (role) updateData.Role = role;
      if (status) updateData.Status = status;
      if (password) {
        updateData.PasswordHash = await hashPassword(password);
      }

      // Update user
      const { data: updatedUser, error: updateError } = await supabase
        .from('Users')
        .update(updateData)
        .eq('UserID', userId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'User',
        entityID: userId,
        description: `Super Admin updated platform user: ${updatedUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
        newData: updateData,
      });

      res.json({
        message: 'User updated successfully',
        user: {
          userId: updatedUser.UserID,
          fullName: updatedUser.FullName,
          email: updatedUser.Email,
          role: updatedUser.Role,
          status: updatedUser.Status,
          phone: updatedUser.Phone,
        },
      });
    } catch (error) {
      console.error('Update platform user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/users/:userId
 * Delete a platform-level user (SuperAdmin only)
 */
router.delete('/users/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('Users')
      .select('*')
      .eq('UserID', userId)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting SuperAdmin
    if (existingUser.Role === 'SuperAdmin') {
      return res.status(403).json({ error: 'Cannot delete SuperAdmin user' });
    }

    // Prevent deleting yourself
    if (parseInt(userId) === actorId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    // Delete user
    const { error: deleteError } = await supabase.from('Users').delete().eq('UserID', userId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'User',
      entityID: userId,
      description: `Super Admin deleted platform user: ${existingUser.FullName}`,
      ipAddress,
      userAgent,
      oldData: existingUser,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete platform user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/users/org/:orgUserId
 * Update an organization user (SuperAdmin only)
 */
router.put(
  '/users/org/:orgUserId',
  authenticate,
  requireSuperAdmin,
  validateUpdatePlatformUser, // Reuse same validation
  async (req, res) => {
    const { orgUserId } = req.params;
    const { fullName, email, password, phone, role, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('OrgUsers')
        .select('*')
        .eq('OrgUserID', orgUserId)
        .single();

      if (fetchError || !existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If email is being changed, check for conflicts
      if (email && email !== existingUser.Email) {
        const { data: emailConflict } = await supabase
          .from('OrgUsers')
          .select('OrgUserID')
          .eq('Email', email)
          .neq('OrgUserID', orgUserId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another organization user' });
        }

        // Check Users table too
        const { data: platformEmailConflict } = await supabase
          .from('Users')
          .select('UserID')
          .eq('Email', email)
          .single();

        if (platformEmailConflict) {
          return res.status(409).json({ error: 'Email already in use by a platform user' });
        }
      }

      // Build update object
      const updateData = {};
      if (fullName) updateData.FullName = fullName;
      if (email) updateData.Email = email;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (role) updateData.Role = role;
      if (status) updateData.Status = status;
      if (password) {
        updateData.PasswordHash = await hashPassword(password);
      }

      // Update user
      const { data: updatedUser, error: updateError } = await supabase
        .from('OrgUsers')
        .update(updateData)
        .eq('OrgUserID', orgUserId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update user', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'OrgUser',
        entityID: orgUserId,
        description: `Super Admin updated organization user: ${updatedUser.FullName}`,
        ipAddress,
        userAgent,
        oldData: existingUser,
        newData: updateData,
      });

      res.json({
        message: 'User updated successfully',
        user: {
          userId: updatedUser.OrgUserID,
          fullName: updatedUser.FullName,
          email: updatedUser.Email,
          role: updatedUser.Role,
          status: updatedUser.Status,
          phone: updatedUser.Phone,
        },
      });
    } catch (error) {
      console.error('Update organization user error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/users/org/:orgUserId
 * Delete an organization user (SuperAdmin only)
 */
router.delete('/users/org/:orgUserId', authenticate, requireSuperAdmin, async (req, res) => {
  const { orgUserId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('OrgUsers')
      .select('*')
      .eq('OrgUserID', orgUserId)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    const { error: deleteError } = await supabase.from('OrgUsers').delete().eq('OrgUserID', orgUserId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete user', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'OrgUser',
      entityID: orgUserId,
      description: `Super Admin deleted organization user: ${existingUser.FullName}`,
      ipAddress,
      userAgent,
      oldData: existingUser,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete organization user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
