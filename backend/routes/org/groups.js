import express from 'express';
import { supabase } from '../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/org/groups
 * Get all student groups for the organization (OrgAdmin only)
 */
router.get('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { orgId } = req.user;
  const { page = 1, limit = 20, search = '' } = req.query;

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('StudentGroups')
      .select('*, StudentGroupMembers(count)', { count: 'exact' })
      .eq('OrgID', orgId);

    // Apply search filter
    if (search) {
      query = query.or(`GroupName.ilike.%${search}%,Description.ilike.%${search}%`);
    }

    const { data: groups, error: groupsError, count } = await query
      .order('CreatedAt', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      return res.status(500).json({ error: 'Failed to fetch groups', details: groupsError.message });
    }

    // Get member counts for each group
    const groupsWithCounts = await Promise.all(
      (groups || []).map(async (group) => {
        const { count: memberCount } = await supabase
          .from('StudentGroupMembers')
          .select('*', { count: 'exact', head: true })
          .eq('GroupID', group.GroupID);

        return {
          ...group,
          memberCount: memberCount || 0,
        };
      })
    );

    res.json({
      groups: groupsWithCounts || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/org/groups/:groupId
 * Get group details with members (OrgAdmin only)
 */
router.get('/:groupId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupId } = req.params;
  const { orgId } = req.user;

  try {
    // Get group
    const { data: group, error: groupError } = await supabase
      .from('StudentGroups')
      .select('*')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get group members
    const { data: members, error: membersError } = await supabase
      .from('StudentGroupMembers')
      .select(`
        *,
        Students (
          StudentID,
          FullName,
          Email,
          IdentityNo,
          Status
        )
      `)
      .eq('GroupID', groupId)
      .order('JoinedAt', { ascending: false });

    if (membersError) {
      console.error('Error fetching group members:', membersError);
      return res.status(500).json({ error: 'Failed to fetch group members', details: membersError.message });
    }

    res.json({
      group: {
        ...group,
        members: members || [],
        memberCount: members?.length || 0,
      },
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/groups
 * Create a new student group (OrgAdmin only)
 */
router.post('/', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupName, description, status = 'Active' } = req.body;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validate required fields
    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Validate status enum
    const statusLower = String(status).trim().toLowerCase();
    if (!['active', 'inactive'].includes(statusLower)) {
      return res.status(400).json({ error: 'Invalid status. Must be: Active or Inactive' });
    }

    // Create group
    const { data: newGroup, error: groupError } = await supabase
      .from('StudentGroups')
      .insert({
        OrgID: orgId,
        GroupName: groupName.trim(),
        Description: description || null,
        CreatedBy: orgUserId,
        Status: statusLower.charAt(0).toUpperCase() + statusLower.slice(1),
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (groupError) {
      console.error('Error creating group:', groupError);
      return res.status(500).json({ error: 'Failed to create group', details: groupError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Create',
      entityType: 'Organization',
      entityID: orgId,
      description: `Created student group: ${groupName}`,
      ipAddress,
      userAgent,
      newData: { groupName, description, status },
    });

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        groupId: newGroup.GroupID,
        groupName: newGroup.GroupName,
        description: newGroup.Description,
        status: newGroup.Status,
        createdAt: newGroup.CreatedAt,
      },
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/org/groups/:groupId
 * Update student group (OrgAdmin only)
 */
router.put('/:groupId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupId } = req.params;
  const { orgId, orgUserId } = req.user;
  const { groupName, description, status } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify group belongs to organization
    const { data: existingGroup, error: existingError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (existingError || !existingGroup) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Prepare update data
    const updateData = {};
    if (groupName !== undefined) updateData.GroupName = groupName.trim();
    if (description !== undefined) updateData.Description = description || null;

    // Validate and set Status enum
    if (status !== undefined) {
      const statusLower = String(status).trim().toLowerCase();
      if (['active', 'inactive'].includes(statusLower)) {
        updateData.Status = statusLower.charAt(0).toUpperCase() + statusLower.slice(1);
      } else {
        return res.status(400).json({ error: 'Invalid status value. Must be: Active or Inactive' });
      }
    }

    // Update group
    const { data: updatedGroup, error: updateError } = await supabase
      .from('StudentGroups')
      .update(updateData)
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating group:', updateError);
      return res.status(500).json({ error: 'Failed to update group', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Updated student group: ${updatedGroup.GroupName}`,
      ipAddress,
      userAgent,
      newData: updateData,
    });

    res.json({
      message: 'Group updated successfully',
      group: {
        groupId: updatedGroup.GroupID,
        groupName: updatedGroup.GroupName,
        description: updatedGroup.Description,
        status: updatedGroup.Status,
      },
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/org/groups/:groupId
 * Delete student group (OrgAdmin only)
 */
router.delete('/:groupId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupId } = req.params;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify group belongs to organization and get details for logging
    const { data: group, error: groupError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Delete group (cascade will delete members)
    const { error: deleteError } = await supabase
      .from('StudentGroups')
      .delete()
      .eq('GroupID', groupId)
      .eq('OrgID', orgId);

    if (deleteError) {
      console.error('Error deleting group:', deleteError);
      return res.status(500).json({ error: 'Failed to delete group', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Delete',
      entityType: 'Organization',
      entityID: orgId,
      description: `Deleted student group: ${group.GroupName}`,
      ipAddress,
      userAgent,
      previousData: { groupName: group.GroupName },
    });

    res.json({
      message: 'Group deleted successfully',
      groupId: groupId,
    });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/org/groups/:groupId/members
 * Add students to group (OrgAdmin only)
 */
router.post('/:groupId/members', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupId } = req.params;
  const { studentIds } = req.body; // Array of student IDs
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required and must not be empty' });
    }

    // Verify group belongs to organization
    const { data: group, error: groupError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify all students belong to organization
    const { data: students, error: studentsError } = await supabase
      .from('Students')
      .select('StudentID, FullName')
      .eq('OrgID', orgId)
      .in('StudentID', studentIds);

    if (studentsError) {
      console.error('Error verifying students:', studentsError);
      return res.status(500).json({ error: 'Failed to verify students', details: studentsError.message });
    }

    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students do not belong to your organization' });
    }

    // Check which students are already in the group
    const { data: existingMembers, error: existingError } = await supabase
      .from('StudentGroupMembers')
      .select('StudentID')
      .eq('GroupID', groupId)
      .in('StudentID', studentIds);

    if (existingError) {
      console.error('Error checking existing members:', existingError);
      return res.status(500).json({ error: 'Failed to check existing members', details: existingError.message });
    }

    const existingStudentIds = new Set((existingMembers || []).map(m => m.StudentID));
    const newStudentIds = studentIds.filter(id => !existingStudentIds.has(id));

    if (newStudentIds.length === 0) {
      return res.status(409).json({ error: 'All students are already members of this group' });
    }

    // Add new members
    const membersToInsert = newStudentIds.map(studentId => ({
      GroupID: groupId,
      StudentID: studentId,
      JoinedAt: new Date().toISOString(),
    }));

    const { data: newMembers, error: insertError } = await supabase
      .from('StudentGroupMembers')
      .insert(membersToInsert)
      .select();

    if (insertError) {
      console.error('Error adding members to group:', insertError);
      return res.status(500).json({ error: 'Failed to add members to group', details: insertError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Added ${newStudentIds.length} student(s) to group: ${group.GroupName}`,
      ipAddress,
      userAgent,
      newData: { groupId, studentIds: newStudentIds },
    });

    res.status(201).json({
      message: 'Students added to group successfully',
      added: newStudentIds.length,
      skipped: existingStudentIds.size,
      members: newMembers || [],
    });
  } catch (error) {
    console.error('Add members to group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/org/groups/:groupId/members/:studentId
 * Remove student from group (OrgAdmin only)
 */
router.delete('/:groupId/members/:studentId', authenticate, requireRole(['OrgAdmin']), verifyActiveStatus, async (req, res) => {
  const { groupId, studentId } = req.params;
  const { orgId, orgUserId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify group belongs to organization
    const { data: group, error: groupError } = await supabase
      .from('StudentGroups')
      .select('GroupID, GroupName')
      .eq('GroupID', groupId)
      .eq('OrgID', orgId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify student belongs to organization
    const { data: student, error: studentError } = await supabase
      .from('Students')
      .select('StudentID, FullName')
      .eq('StudentID', studentId)
      .eq('OrgID', orgId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Remove student from group
    const { error: deleteError } = await supabase
      .from('StudentGroupMembers')
      .delete()
      .eq('GroupID', groupId)
      .eq('StudentID', studentId);

    if (deleteError) {
      console.error('Error removing student from group:', deleteError);
      return res.status(500).json({ error: 'Failed to remove student from group', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'OrgUser',
      actorID: orgUserId,
      actionType: 'Update',
      entityType: 'Organization',
      entityID: orgId,
      description: `Removed ${student.FullName} from group: ${group.GroupName}`,
      ipAddress,
      userAgent,
      previousData: { groupId, studentId, studentName: student.FullName },
    });

    res.json({
      message: 'Student removed from group successfully',
      groupId,
      studentId,
    });
  } catch (error) {
    console.error('Remove member from group error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
