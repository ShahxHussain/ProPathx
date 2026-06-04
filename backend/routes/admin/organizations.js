import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import { ensureOrgEnrollmentSettings } from '../../utils/orgEnrollmentSettings.js';
import { validateCreateOrganization, validateUpdateOrganization } from '../../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/admin/organizations
 * List all organizations with details (SuperAdmin only)
 */
router.get('/organizations', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data: organizations, error } = await supabase
      .from('Organizations')
      .select('OrgID, OrgName, OrgEmail, Address, Phone, Status, CreatedAt, CreatedBy')
      .order('CreatedAt', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch organizations', details: error.message });
    }

    res.json({ organizations: organizations || [] });
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/organizations/create
 * Create a new organization with OrgAdmin user (SuperAdmin only)
 */
router.post(
  '/organizations/create',
  authenticate,
  requireSuperAdmin,
  validateCreateOrganization,
  async (req, res) => {
    const { orgName, orgEmail, phone, address, adminFullName, adminPassword, adminRole, status } = req.body;
    const { userId: actorId } = req.user; // SuperAdmin's UserID
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Use orgEmail for both organization and admin email (OrgAdmin == Organization)
      const adminEmail = orgEmail;

      // Check if organization email already exists
      const { data: existingOrg } = await supabase
        .from('Organizations')
        .select('OrgID')
        .eq('OrgEmail', orgEmail)
        .single();

      if (existingOrg) {
        return res.status(409).json({ error: 'Organization email already registered' });
      }

      // Check if email already exists as OrgUser
      const { data: existingUser } = await supabase
        .from('OrgUsers')
        .select('OrgUserID')
        .eq('Email', adminEmail)
        .single();

      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered as an organization user' });
      }

      // Check if email exists in Users table
      const { data: existingPlatformUser } = await supabase
        .from('Users')
        .select('UserID')
        .eq('Email', adminEmail)
        .single();

      if (existingPlatformUser) {
        return res.status(409).json({ error: 'Email already registered as a platform user' });
      }

      // Hash password
      const passwordHash = await hashPassword(adminPassword);

      // Create organization
      const { data: newOrg, error: orgError } = await supabase
        .from('Organizations')
        .insert({
          OrgName: orgName,
          OrgEmail: orgEmail,
          Phone: phone || null,
          Address: address || null,
          Status: status || 'Active',
          CreatedBy: actorId, // SuperAdmin who created it
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (orgError) {
        return res.status(500).json({ error: 'Failed to create organization', details: orgError.message });
      }

      // Create OrgAdmin user (using orgEmail as the email)
      const { data: newUser, error: userError } = await supabase
        .from('OrgUsers')
        .insert({
          OrgID: newOrg.OrgID,
          FullName: adminFullName,
          Email: adminEmail, // Same as orgEmail
          PasswordHash: passwordHash,
          Role: adminRole || 'OrgAdmin',
          Phone: phone || null,
          Status: 'Active',
          MustChangePassword: true,
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (userError) {
        // Rollback: delete organization if user creation fails
        await supabase.from('Organizations').delete().eq('OrgID', newOrg.OrgID);
        return res.status(500).json({ error: 'Failed to create admin user', details: userError.message });
      }

      if (newUser.MustChangePassword !== true) {
        const { error: flagError } = await supabase
          .from('OrgUsers')
          .update({ MustChangePassword: true })
          .eq('OrgUserID', newUser.OrgUserID);
        if (flagError) {
          console.warn(
            'Could not set MustChangePassword on new OrgAdmin. Run backend/scripts/org_users_must_change_password.sql:',
            flagError.message
          );
        }
      }

      try {
        await ensureOrgEnrollmentSettings(newOrg.OrgID, newUser.OrgUserID);
      } catch (settingsErr) {
        console.error('Failed to init org enrollment settings:', settingsErr);
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Create',
        entityType: 'Organization',
        entityID: newOrg.OrgID,
        description: `Super Admin created organization: ${orgName} with admin: ${adminFullName}`,
        ipAddress,
        userAgent,
        newData: { orgName, orgEmail, adminFullName, adminRole },
      });

      res.status(201).json({
        message: 'Organization created successfully',
        organization: {
          orgId: newOrg.OrgID,
          orgName: newOrg.OrgName,
          orgEmail: newOrg.OrgEmail,
          status: newOrg.Status,
        },
        admin: {
          userId: newUser.OrgUserID,
          fullName: newUser.FullName,
          email: newUser.Email,
          role: newUser.Role,
          status: newUser.Status,
        },
      });
    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * PUT /api/admin/organizations/:orgId
 * Update an organization (SuperAdmin only)
 */
router.put(
  '/organizations/:orgId',
  authenticate,
  requireSuperAdmin,
  validateUpdateOrganization,
  async (req, res) => {
    const { orgId } = req.params;
    const { orgName, orgEmail, phone, address, status } = req.body;
    const { userId: actorId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Check if organization exists
      const { data: existingOrg, error: fetchError } = await supabase
        .from('Organizations')
        .select('*')
        .eq('OrgID', orgId)
        .single();

      if (fetchError || !existingOrg) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // If email is being changed, check for conflicts
      if (orgEmail && orgEmail !== existingOrg.OrgEmail) {
        const { data: emailConflict } = await supabase
          .from('Organizations')
          .select('OrgID')
          .eq('OrgEmail', orgEmail)
          .neq('OrgID', orgId)
          .single();

        if (emailConflict) {
          return res.status(409).json({ error: 'Email already in use by another organization' });
        }
      }

      // Build update object
      const updateData = {};
      if (orgName) updateData.OrgName = orgName;
      if (orgEmail) updateData.OrgEmail = orgEmail;
      if (phone !== undefined) updateData.Phone = phone || null;
      if (address !== undefined) updateData.Address = address || null;
      if (status) updateData.Status = status;

      // Update organization
      const { data: updatedOrg, error: updateError } = await supabase
        .from('Organizations')
        .update(updateData)
        .eq('OrgID', orgId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update organization', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: actorId,
        actionType: 'Update',
        entityType: 'Organization',
        entityID: orgId,
        description: `Super Admin updated organization: ${updatedOrg.OrgName}`,
        ipAddress,
        userAgent,
        oldData: existingOrg,
        newData: updateData,
      });

      res.json({
        message: 'Organization updated successfully',
        organization: {
          orgId: updatedOrg.OrgID,
          orgName: updatedOrg.OrgName,
          orgEmail: updatedOrg.OrgEmail,
          phone: updatedOrg.Phone,
          address: updatedOrg.Address,
          status: updatedOrg.Status,
        },
      });
    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/organizations/:orgId
 * Delete an organization (SuperAdmin only)
 */
router.delete('/organizations/:orgId', authenticate, requireSuperAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { userId: actorId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if organization exists
    const { data: existingOrg, error: fetchError } = await supabase
      .from('Organizations')
      .select('*')
      .eq('OrgID', orgId)
      .single();

    if (fetchError || !existingOrg) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if organization has users
    const { count: userCount } = await supabase
      .from('OrgUsers')
      .select('*', { count: 'exact', head: true })
      .eq('OrgID', orgId);

    if (userCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete organization with existing users',
        details: `This organization has ${userCount} user(s). Please delete or transfer users first.`,
      });
    }

    // Delete organization
    const { error: deleteError } = await supabase.from('Organizations').delete().eq('OrgID', orgId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete organization', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: actorId,
      actionType: 'Delete',
      entityType: 'Organization',
      entityID: orgId,
      description: `Super Admin deleted organization: ${existingOrg.OrgName}`,
      ipAddress,
      userAgent,
      oldData: existingOrg,
    });

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
