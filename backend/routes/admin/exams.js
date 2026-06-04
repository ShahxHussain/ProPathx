import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

const router = express.Router();

/**
 * ============================================
 * EXAM MANAGEMENT ROUTES (SuperAdmin only)
 * ============================================
 */

/**
 * GET /api/admin/exams
 * Get all exams across all organizations (SuperAdmin only)
 */
router.get('/exams', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Try ordering by CreatedAt, but handle if column doesn't exist
    let { data: exams, error } = await supabase
      .from('Exams')
      .select('*')
      .order('CreatedAt', { ascending: false });

    // If ordering fails, try without order
    if (error) {
      console.warn('Ordering by CreatedAt failed, trying without order:', error.message);
      const result = await supabase.from('Exams').select('*');
      exams = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error fetching exams:', error);
      return res.status(500).json({ error: 'Failed to fetch exams', details: error.message });
    }

    // Exams are now platform-wide (no OrgID)
    const examsWithOrg = (exams || []).map((exam) => ({
      ...exam,
      OrgName: null, // All exams are platform-wide
    }));

    res.json({ exams: examsWithOrg });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams
 * Create a new exam (SuperAdmin only)
 */
router.post('/exams', authenticate, requireSuperAdmin, async (req, res) => {
  const { examName, description, syllabus, noOfSubjects } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Validation
    if (!examName || !examName.trim()) {
      return res.status(400).json({ error: 'Exam name is required' });
    }

    if (noOfSubjects && (noOfSubjects < 1 || noOfSubjects > 50)) {
      return res.status(400).json({ error: 'Number of subjects must be between 1 and 50' });
    }

    // Create exam (OrgID removed - exams are now platform-wide)
    const { data: newExam, error: examError } = await supabase
      .from('Exams')
      .insert({
        ExamName: examName.trim(),
        Description: description || null,
        Syllabus: syllabus || null,
        NoOfSubjects: noOfSubjects || null,
        CreatedBy: userId, // SuperAdmin UserID
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (examError) {
      console.error('Supabase error creating exam:', examError);
      return res.status(500).json({ 
        error: 'Failed to create exam', 
        details: examError.message,
        code: examError.code,
        hint: examError.hint 
      });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Exam',
      entityID: newExam.ExamID,
      description: `Super Admin created exam: ${examName}`,
      ipAddress,
      userAgent,
      newData: { examName, description, noOfSubjects },
    });

    res.status(201).json({
      message: 'Exam created successfully',
      exam: newExam,
    });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/admin/exams/:examId
 * Get exam details with subjects and topics (SuperAdmin only)
 */
router.get('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;

  try {
    // Get exam
    const { data: exam, error: examError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (examError || !exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Exams are now platform-wide (no OrgID)
    exam.OrgName = null;

    // Get subjects for this exam
    const { data: subjects, error: subjectsError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('ExamID', examId)
      .order('CreatedAt', { ascending: true });

    if (subjectsError) {
      return res.status(500).json({ error: 'Failed to fetch subjects', details: subjectsError.message });
    }

    // Get chapters and topics (with chapter) for each subject
    const subjectsWithTopics = await Promise.all(
      (subjects || []).map(async (subject) => {
        const { data: chapters } = await supabase
          .from('Chapters')
          .select('ChapterID, ChapterNumber, ChapterName, SubjectID, CreatedAt')
          .eq('SubjectID', subject.SubjectID)
          .order('ChapterNumber', { ascending: true });

        const { data: topics, error: topicsError } = await supabase
          .from('Topics')
          .select('*, Chapters(ChapterID, ChapterNumber, ChapterName)')
          .eq('SubjectID', subject.SubjectID)
          .order('CreatedAt', { ascending: true });

        return {
          ...subject,
          chapters: chapters || [],
          topics: topics || [],
        };
      })
    );

    res.json({
      exam,
      subjects: subjectsWithTopics,
    });
  } catch (error) {
    console.error('Get exam details error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId
 * Update exam (SuperAdmin only)
 */
router.put('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { examName, description, syllabus, noOfSubjects } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if exam exists
    const { data: existingExam, error: fetchError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Build update object (OrgID removed - exams are now platform-wide)
    const updateData = {};
    if (examName) updateData.ExamName = examName.trim();
    if (description !== undefined) updateData.Description = description || null;
    if (syllabus !== undefined) updateData.Syllabus = syllabus || null;
    if (noOfSubjects !== undefined) updateData.NoOfSubjects = noOfSubjects || null;

    // Update exam
    const { data: updatedExam, error: updateError } = await supabase
      .from('Exams')
      .update(updateData)
      .eq('ExamID', examId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update exam', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Exam',
      entityID: examId,
      description: `Super Admin updated exam: ${updatedExam.ExamName}`,
      ipAddress,
      userAgent,
      oldData: existingExam,
      newData: updateData,
    });

    res.json({
      message: 'Exam updated successfully',
      exam: updatedExam,
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/exams/:examId
 * Delete exam (SuperAdmin only)
 */
router.delete('/exams/:examId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Check if exam exists
    const { data: existingExam, error: fetchError } = await supabase
      .from('Exams')
      .select('*')
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Delete exam (cascade will handle subjects and topics)
    const { error: deleteError } = await supabase.from('Exams').delete().eq('ExamID', examId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete exam', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Exam',
      entityID: examId,
      description: `Super Admin deleted exam: ${existingExam.ExamName}`,
      ipAddress,
      userAgent,
      oldData: existingExam,
    });

    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams/:examId/subjects
 * Create a subject for an exam (SuperAdmin only)
 */
router.post('/exams/:examId/subjects', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId } = req.params;
  const { subjectName, description, weightage } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify exam exists
    const { data: exam } = await supabase.from('Exams').select('ExamID').eq('ExamID', examId).single();
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Validation
    if (!subjectName || !subjectName.trim()) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    // Create subject
    const { data: newSubject, error: subjectError } = await supabase
      .from('Subjects')
      .insert({
        ExamID: examId,
        SubjectName: subjectName.trim(),
        Description: description || null,
        Weightage: weightage || null,
        CreatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (subjectError) {
      return res.status(500).json({ error: 'Failed to create subject', details: subjectError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Subject',
      entityID: newSubject.SubjectID,
      description: `Super Admin created subject: ${subjectName} for exam`,
      ipAddress,
      userAgent,
      newData: { subjectName, description, weightage },
    });

    res.status(201).json({
      message: 'Subject created successfully',
      subject: newSubject,
    });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId/subjects/:subjectId
 * Update a subject (SuperAdmin only)
 */
router.put('/exams/:examId/subjects/:subjectId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { subjectName, description, weightage } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists and belongs to exam
    const { data: existingSubject, error: fetchError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingSubject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Build update object
    const updateData = {};
    if (subjectName) updateData.SubjectName = subjectName.trim();
    if (description !== undefined) updateData.Description = description || null;
    if (weightage !== undefined) updateData.Weightage = weightage || null;

    // Update subject
    const { data: updatedSubject, error: updateError } = await supabase
      .from('Subjects')
      .update(updateData)
      .eq('SubjectID', subjectId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update subject', details: updateError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Update',
      entityType: 'Subject',
      entityID: subjectId,
      description: `Super Admin updated subject: ${updatedSubject.SubjectName}`,
      ipAddress,
      userAgent,
      oldData: existingSubject,
      newData: updateData,
    });

    res.json({
      message: 'Subject updated successfully',
      subject: updatedSubject,
    });
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * DELETE /api/admin/exams/:examId/subjects/:subjectId
 * Delete a subject (SuperAdmin only)
 */
router.delete('/exams/:examId/subjects/:subjectId', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists
    const { data: existingSubject, error: fetchError } = await supabase
      .from('Subjects')
      .select('*')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (fetchError || !existingSubject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Delete subject (cascade will handle topics)
    const { error: deleteError } = await supabase.from('Subjects').delete().eq('SubjectID', subjectId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete subject', details: deleteError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Delete',
      entityType: 'Subject',
      entityID: subjectId,
      description: `Super Admin deleted subject: ${existingSubject.SubjectName}`,
      ipAddress,
      userAgent,
      oldData: existingSubject,
    });

    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * POST /api/admin/exams/:examId/subjects/:subjectId/topics
 * Create a topic for a subject (SuperAdmin only)
 */
router.post('/exams/:examId/subjects/:subjectId/topics', authenticate, requireSuperAdmin, async (req, res) => {
  const { examId, subjectId } = req.params;
  const { topicName, description, chapterId } = req.body;
  const { userId } = req.user;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Verify subject exists and belongs to exam
    const { data: subject } = await supabase
      .from('Subjects')
      .select('SubjectID')
      .eq('SubjectID', subjectId)
      .eq('ExamID', examId)
      .single();

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Validation
    if (!topicName || !topicName.trim()) {
      return res.status(400).json({ error: 'Topic name is required' });
    }

    // If chapterId provided, verify it belongs to this subject
    if (chapterId) {
      const { data: chapter } = await supabase
        .from('Chapters')
        .select('ChapterID')
        .eq('ChapterID', chapterId)
        .eq('SubjectID', subjectId)
        .single();
      if (!chapter) {
        return res.status(400).json({ error: 'Chapter not found or does not belong to this subject' });
      }
    }

    const insertPayload = {
      SubjectID: subjectId,
      TopicName: topicName.trim(),
      Description: description || null,
      CreatedAt: new Date().toISOString(),
    };
    if (chapterId) insertPayload.ChapterID = chapterId;

    // Create topic
    const { data: newTopic, error: topicError } = await supabase
      .from('Topics')
      .insert(insertPayload)
      .select()
      .single();

    if (topicError) {
      return res.status(500).json({ error: 'Failed to create topic', details: topicError.message });
    }

    // Create log
    await createLog({
      actorType: 'User',
      actorID: userId,
      actionType: 'Create',
      entityType: 'Topic',
      entityID: newTopic.TopicID,
      description: `Super Admin created topic: ${topicName}`,
      ipAddress,
      userAgent,
      newData: { topicName, description },
    });

    res.status(201).json({
      message: 'Topic created successfully',
      topic: newTopic,
    });
  } catch (error) {
    console.error('Create topic error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * PUT /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
 * Update a topic (SuperAdmin only)
 */
router.put(
  '/exams/:examId/subjects/:subjectId/topics/:topicId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { examId, subjectId, topicId } = req.params;
    const { topicName, description, chapterId } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Verify topic exists and belongs to subject
      const { data: existingTopic, error: fetchError } = await supabase
        .from('Topics')
        .select('*, Subjects!inner(ExamID)')
        .eq('TopicID', topicId)
        .eq('SubjectID', subjectId)
        .single();

      if (fetchError || !existingTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      // If chapterId provided, verify it belongs to this subject (null to unlink)
      if (chapterId !== undefined && chapterId !== null && chapterId !== '') {
        const { data: chapter } = await supabase
          .from('Chapters')
          .select('ChapterID')
          .eq('ChapterID', chapterId)
          .eq('SubjectID', subjectId)
          .single();
        if (!chapter) {
          return res.status(400).json({ error: 'Chapter not found or does not belong to this subject' });
        }
      }

      // Build update object
      const updateData = {};
      if (topicName) updateData.TopicName = topicName.trim();
      if (description !== undefined) updateData.Description = description || null;
      if (chapterId !== undefined) updateData.ChapterID = chapterId === '' || chapterId === null ? null : chapterId;

      // Update topic
      const { data: updatedTopic, error: updateError } = await supabase
        .from('Topics')
        .update(updateData)
        .eq('TopicID', topicId)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({ error: 'Failed to update topic', details: updateError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'Topic',
        entityID: topicId,
        description: `Super Admin updated topic: ${updatedTopic.TopicName}`,
        ipAddress,
        userAgent,
        oldData: existingTopic,
        newData: updateData,
      });

      res.json({
        message: 'Topic updated successfully',
        topic: updatedTopic,
      });
    } catch (error) {
      console.error('Update topic error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * DELETE /api/admin/exams/:examId/subjects/:subjectId/topics/:topicId
 * Delete a topic (SuperAdmin only)
 */
router.delete(
  '/exams/:examId/subjects/:subjectId/topics/:topicId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { examId, subjectId, topicId } = req.params;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);

    try {
      // Verify topic exists
      const { data: existingTopic, error: fetchError } = await supabase
        .from('Topics')
        .select('*')
        .eq('TopicID', topicId)
        .eq('SubjectID', subjectId)
        .single();

      if (fetchError || !existingTopic) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      // Delete topic
      const { error: deleteError } = await supabase.from('Topics').delete().eq('TopicID', topicId);

      if (deleteError) {
        return res.status(500).json({ error: 'Failed to delete topic', details: deleteError.message });
      }

      // Create log
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Delete',
        entityType: 'Topic',
        entityID: topicId,
        description: `Super Admin deleted topic: ${existingTopic.TopicName}`,
        ipAddress,
        userAgent,
        oldData: existingTopic,
      });

      res.json({ message: 'Topic deleted successfully' });
    } catch (error) {
      console.error('Delete topic error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
);

/**
 * ============================================
 * CHAPTERS (per subject) - SuperAdmin only
 * ============================================
 */

/**
 * GET /api/admin/exams/:examId/subjects/:subjectId/chapters
 * List chapters for a subject
 */
router.get(
  '/exams/:examId/subjects/:subjectId/chapters',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { subjectId } = req.params;
    try {
      const { data: subject } = await supabase
        .from('Subjects')
        .select('SubjectID')
        .eq('SubjectID', subjectId)
        .single();
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }
      const { data: chapters, error } = await supabase
        .from('Chapters')
        .select('ChapterID, SubjectID, ChapterNumber, ChapterName, CreatedAt')
        .eq('SubjectID', subjectId)
        .order('ChapterNumber', { ascending: true });
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch chapters', details: error.message });
      }
      res.json({ chapters: chapters || [] });
    } catch (err) {
      console.error('List chapters error:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
);

/**
 * POST /api/admin/exams/:examId/subjects/:subjectId/chapters
 * Create a chapter (SuperAdmin only). ChapterNumber and ChapterName are optional.
 */
router.post(
  '/exams/:examId/subjects/:subjectId/chapters',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { subjectId } = req.params;
    const { chapterNumber, chapterName } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    try {
      const { data: subject } = await supabase
        .from('Subjects')
        .select('SubjectID')
        .eq('SubjectID', subjectId)
        .single();
      if (!subject) {
        return res.status(404).json({ error: 'Subject not found' });
      }
      const { data: newChapter, error } = await supabase
        .from('Chapters')
        .insert({
          SubjectID: subjectId,
          ChapterNumber: chapterNumber != null && chapterNumber !== '' ? parseInt(chapterNumber, 10) : null,
          ChapterName: chapterName && chapterName.trim() ? chapterName.trim() : null,
          CreatedBy: userId,
          CreatedAt: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        return res.status(500).json({ error: 'Failed to create chapter', details: error.message });
      }
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Create',
        entityType: 'System',
        entityID: newChapter.ChapterID,
        description: `Super Admin created chapter: ${chapterName || chapterNumber || newChapter.ChapterID}`,
        ipAddress,
        userAgent,
        newData: { chapterNumber: newChapter.ChapterNumber, chapterName: newChapter.ChapterName },
      });
      res.status(201).json({ message: 'Chapter created successfully', chapter: newChapter });
    } catch (err) {
      console.error('Create chapter error:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
);

/**
 * PUT /api/admin/exams/:examId/subjects/:subjectId/chapters/:chapterId
 * Update a chapter (SuperAdmin only)
 */
router.put(
  '/exams/:examId/subjects/:subjectId/chapters/:chapterId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { subjectId, chapterId } = req.params;
    const { chapterNumber, chapterName } = req.body;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    try {
      const { data: existing } = await supabase
        .from('Chapters')
        .select('*')
        .eq('ChapterID', chapterId)
        .eq('SubjectID', subjectId)
        .single();
      if (!existing) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      const updateData = {};
      if (chapterNumber !== undefined) updateData.ChapterNumber = chapterNumber === '' || chapterNumber === null ? null : parseInt(chapterNumber, 10);
      if (chapterName !== undefined) updateData.ChapterName = chapterName === '' || chapterName === null ? null : (chapterName && chapterName.trim()) || null;
      const { data: updated, error } = await supabase
        .from('Chapters')
        .update(updateData)
        .eq('ChapterID', chapterId)
        .select()
        .single();
      if (error) {
        return res.status(500).json({ error: 'Failed to update chapter', details: error.message });
      }
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Update',
        entityType: 'System',
        entityID: chapterId,
        description: `Super Admin updated chapter`,
        ipAddress,
        userAgent,
        oldData: existing,
        newData: updateData,
      });
      res.json({ message: 'Chapter updated successfully', chapter: updated });
    } catch (err) {
      console.error('Update chapter error:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
);

/**
 * DELETE /api/admin/exams/:examId/subjects/:subjectId/chapters/:chapterId
 * Delete a chapter (SuperAdmin only). Topics linked to this chapter will have ChapterID set to null.
 */
router.delete(
  '/exams/:examId/subjects/:subjectId/chapters/:chapterId',
  authenticate,
  requireSuperAdmin,
  async (req, res) => {
    const { subjectId, chapterId } = req.params;
    const { userId } = req.user;
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    try {
      const { data: existing } = await supabase
        .from('Chapters')
        .select('*')
        .eq('ChapterID', chapterId)
        .eq('SubjectID', subjectId)
        .single();
      if (!existing) {
        return res.status(404).json({ error: 'Chapter not found' });
      }
      const { error: delError } = await supabase.from('Chapters').delete().eq('ChapterID', chapterId);
      if (delError) {
        return res.status(500).json({ error: 'Failed to delete chapter', details: delError.message });
      }
      await createLog({
        actorType: 'User',
        actorID: userId,
        actionType: 'Delete',
        entityType: 'System',
        entityID: chapterId,
        description: `Super Admin deleted chapter: ${existing.ChapterName || existing.ChapterNumber || chapterId}`,
        ipAddress,
        userAgent,
        oldData: existing,
      });
      res.json({ message: 'Chapter deleted successfully' });
    } catch (err) {
      console.error('Delete chapter error:', err);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
);

export default router;
