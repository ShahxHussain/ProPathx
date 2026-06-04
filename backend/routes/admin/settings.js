import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import {
  getSystemSetting,
  upsertSystemSetting,
  MAINTENANCE_DEFAULTS,
} from '../../services/systemSettingsService.js';

const router = express.Router();

/**
 * GET /api/admin/settings/maintenance
 * Get current maintenance settings (SuperAdmin only)
 */
router.get('/settings/maintenance', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const settings = await getSystemSetting('maintenance_settings', { ...MAINTENANCE_DEFAULTS });
    res.json({ settings });
  } catch (error) {
    console.error('Get maintenance settings error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/settings/maintenance
 * Update maintenance settings (SuperAdmin only)
 */
router.put('/settings/maintenance', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.user;
  const { enabled, scope, message, expectedResumeAt, allowRoles } = req.body || {};

  try {
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const validScopes = ['all', 'students', 'orgs', 'admins'];
    if (scope && !validScopes.includes(scope)) {
      return res.status(400).json({ error: `scope must be one of: ${validScopes.join(', ')}` });
    }

    if (allowRoles && !Array.isArray(allowRoles)) {
      return res.status(400).json({ error: 'allowRoles must be an array of role strings' });
    }

    const newSettings = {
      enabled: !!enabled,
      scope: scope || 'all',
      message: message || '',
      expectedResumeAt: expectedResumeAt || null,
      allowRoles: allowRoles && Array.isArray(allowRoles) && allowRoles.length > 0 ? allowRoles : ['SuperAdmin'],
    };

    const previousSettings = await getSystemSetting('maintenance_settings', null);
    await upsertSystemSetting('maintenance_settings', newSettings, userId);

    // Log the change
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'System',
      entityID: null,
      description: 'Updated maintenance settings',
      previousData: previousSettings,
      newData: newSettings,
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Maintenance settings updated', settings: newSettings });
  } catch (error) {
    console.error('Update maintenance settings error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/settings/announcements
 * List all announcements (SuperAdmin only)
 */
router.get('/settings/announcements', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('Announcements')
      .select('*')
      .order('CreatedAt', { ascending: false });

    if (error) {
      console.error('Supabase error fetching announcements:', error);
      return res.status(500).json({ error: 'Failed to fetch announcements', details: error.message });
    }

    res.json({ announcements: data || [] });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/settings/announcements
 * Create a new announcement (SuperAdmin only)
 */
router.post('/settings/announcements', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.user;
  const { title, message, link, targetRoles, startsAt, endsAt, isActive } = req.body || {};

  try {
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (targetRoles && !Array.isArray(targetRoles)) {
      return res.status(400).json({ error: 'targetRoles must be an array of role strings' });
    }

    const payload = {
      Title: title.trim(),
      Message: message.trim(),
      Link: link || null,
      TargetRoles: targetRoles && targetRoles.length > 0 ? targetRoles : null,
      StartsAt: startsAt || null,
      EndsAt: endsAt || null,
      IsActive: isActive !== undefined ? !!isActive : true,
      CreatedBy: userId,
    };

    const { data, error } = await supabase
      .from('Announcements')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating announcement:', error);
      return res.status(500).json({ error: 'Failed to create announcement', details: error.message });
    }

    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'System',
      entityID: data.AnnouncementID,
      description: `Created announcement: ${title}`,
      newData: payload,
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.status(201).json({ announcement: data });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/settings/announcements/:id
 * Update an announcement (SuperAdmin only)
 */
router.put('/settings/announcements/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;
  const { title, message, link, targetRoles, startsAt, endsAt, isActive } = req.body || {};

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('Announcements')
      .select('*')
      .eq('AnnouncementID', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (targetRoles && !Array.isArray(targetRoles)) {
      return res.status(400).json({ error: 'targetRoles must be an array of role strings' });
    }

    const updateData = {};
    if (title !== undefined) updateData.Title = title.trim();
    if (message !== undefined) updateData.Message = message.trim();
    if (link !== undefined) updateData.Link = link || null;
    if (targetRoles !== undefined) {
      updateData.TargetRoles = targetRoles && targetRoles.length > 0 ? targetRoles : null;
    }
    if (startsAt !== undefined) updateData.StartsAt = startsAt || null;
    if (endsAt !== undefined) updateData.EndsAt = endsAt || null;
    if (isActive !== undefined) updateData.IsActive = !!isActive;

    const { data, error: updateError } = await supabase
      .from('Announcements')
      .update(updateData)
      .eq('AnnouncementID', id)
      .select()
      .single();

    if (updateError) {
      console.error('Supabase error updating announcement:', updateError);
      return res.status(500).json({ error: 'Failed to update announcement', details: updateError.message });
    }

    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'System',
      entityID: id,
      description: `Updated announcement: ${data.Title}`,
      previousData: existing,
      newData: updateData,
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.json({ announcement: data });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/settings/announcements/:id
 * Delete an announcement (SuperAdmin only)
 */
router.delete('/settings/announcements/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('Announcements')
      .select('*')
      .eq('AnnouncementID', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const { error: deleteError } = await supabase
      .from('Announcements')
      .delete()
      .eq('AnnouncementID', id);

    if (deleteError) {
      console.error('Supabase error deleting announcement:', deleteError);
      return res.status(500).json({ error: 'Failed to delete announcement', details: deleteError.message });
    }

    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'System',
      entityID: id,
      description: `Deleted announcement: ${existing.Title}`,
      previousData: existing,
      ipAddress: getClientIP(req),
      userAgent: getUserAgent(req),
    });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
