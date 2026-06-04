import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/questions
 * Get all questions (platform + org) with details for SuperAdmin
 * Query: source (all|platform|organization), status (all|approved|pending|rejected), page, limit, search
 */
router.get('/questions', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { source = 'all', status = 'all', page = 1, limit = 50, search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('Questions')
      .select(`
        QuestionID,
        QuestionText,
        DifficultyLevel,
        Explanation,
        QuestionType,
        Source,
        CreatedBy,
        CreatedByOrgUserID,
        CreatedAt,
        IsVerified,
        VerifiedBy,
        VerifiedAt,
        ReviewerComments,
        OrgID,
        TopicID,
        Topics(
          TopicID,
          TopicName,
          ChapterID,
          Chapters(ChapterID, ChapterNumber, ChapterName),
          SubjectID,
          Subjects(
            SubjectID,
            SubjectName,
            ExamID,
            Exams(ExamID, ExamName)
          )
        )
      `, { count: 'exact' })
      .order('CreatedAt', { ascending: false });

    if (source === 'platform') {
      query = query.is('OrgID', null);
    } else if (source === 'organization') {
      query = query.not('OrgID', 'is', null);
    }

    if (search && search.trim()) {
      query = query.ilike('QuestionText', `%${search.trim()}%`);
    }

    if (status === 'approved') {
      query = query.eq('IsVerified', true);
    } else if (status === 'rejected') {
      query = query.eq('IsVerified', false).not('ReviewerComments', 'is', null);
    } else if (status === 'pending') {
      query = query.eq('IsVerified', false).is('ReviewerComments', null);
    }

    query = query.range(offset, offset + limitNum - 1);
    const { data: questions, error: qError, count } = await query;

    if (qError) {
      return res.status(500).json({ error: 'Failed to fetch questions', details: qError.message });
    }

    const list = questions || [];

    // Normalize keys from Supabase (may return PascalCase or camelCase)
    const getQ = (q, key) => q[key] ?? q[key.charAt(0).toLowerCase() + key.slice(1)];
    const creatorUserIds = [...new Set(list.map((q) => getQ(q, 'CreatedBy')).filter(Boolean))];
    const createdByOrgUserIds = [...new Set(list.map((q) => getQ(q, 'CreatedByOrgUserID')).filter(Boolean))];
    const orgIds = [...new Set(list.map((q) => getQ(q, 'OrgID')).filter(Boolean))];

    const creatorUsers = new Map();
    if (creatorUserIds.length > 0) {
      const { data: users } = await supabase
        .from('Users')
        .select('UserID, FullName, Email')
        .in('UserID', creatorUserIds);
      (users || []).forEach((u) => creatorUsers.set(String(u.UserID), u));
    }

    const creatorOrgUsers = new Map();
    if (createdByOrgUserIds.length > 0) {
      const { data: orgUsers } = await supabase
        .from('OrgUsers')
        .select('OrgUserID, FullName, Email, OrgID')
        .in('OrgUserID', createdByOrgUserIds);
      (orgUsers || []).forEach((u) => creatorOrgUsers.set(String(u.OrgUserID), u));
    }

    const orgsMap = new Map();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('Organizations')
        .select('OrgID, OrgName, OrgEmail')
        .in('OrgID', orgIds);
      (orgs || []).forEach((o) => orgsMap.set(String(o.OrgID), o));
    }

    const verifiedByIds = [...new Set(list.map((q) => getQ(q, 'VerifiedBy')).filter(Boolean))];
    const verifierMap = new Map();
    if (verifiedByIds.length > 0) {
      const { data: verifiers } = await supabase
        .from('Users')
        .select('UserID, FullName, Email')
        .in('UserID', verifiedByIds);
      (verifiers || []).forEach((v) => verifierMap.set(String(v.UserID), v));
    }

    const enriched = list.map((q) => {
      const topic = q.Topics;
      const chapter = topic?.Chapters && Array.isArray(topic.Chapters) ? topic.Chapters[0] : topic?.Chapters;
      const subject = topic?.Subjects;
      const exam = subject?.Exams;
      const qOrgId = getQ(q, 'OrgID');
      const qCreatedBy = getQ(q, 'CreatedBy');
      const qCreatedByOrgUserID = getQ(q, 'CreatedByOrgUserID');
      let sourceType = qOrgId ? 'organization' : 'platform';
      let createdByName = null;
      let createdByEmail = null;
      let createdByOrgName = null;
      let createdByOrgUserName = null;
      let createdByOrgUserEmail = null;

      if (qCreatedBy && creatorUsers.has(String(qCreatedBy))) {
        const u = creatorUsers.get(String(qCreatedBy));
        createdByName = u.FullName;
        createdByEmail = u.Email;
      }
      if (qCreatedByOrgUserID && creatorOrgUsers.has(String(qCreatedByOrgUserID))) {
        const ou = creatorOrgUsers.get(String(qCreatedByOrgUserID));
        createdByOrgUserName = ou.FullName;
        createdByOrgUserEmail = ou.Email;
        createdByName = createdByName || ou.FullName;
        createdByEmail = createdByEmail || ou.Email;
      }
      if (qOrgId && orgsMap.has(String(qOrgId))) {
        createdByOrgName = orgsMap.get(String(qOrgId)).OrgName;
      }

      let statusValue = 'pending';
      if (q.IsVerified === true) statusValue = 'approved';
      else if (q.ReviewerComments) statusValue = 'rejected';

      const qVerifiedBy = getQ(q, 'VerifiedBy');
      const verifier = qVerifiedBy && verifierMap.has(String(qVerifiedBy))
        ? verifierMap.get(String(qVerifiedBy))
        : null;

      return {
        questionId: q.QuestionID,
        questionText: q.QuestionText,
        questionTextSnippet: (q.QuestionText || '').substring(0, 120) + ((q.QuestionText || '').length > 120 ? '...' : ''),
        difficultyLevel: q.DifficultyLevel,
        questionType: q.QuestionType,
        source: q.Source,
        examName: exam?.ExamName || '—',
        subjectName: subject?.SubjectName || '—',
        chapterName: chapter?.ChapterName || (chapter?.ChapterNumber ? `Chapter ${chapter.ChapterNumber}` : '—'),
        topicName: topic?.TopicName || '—',
        sourceType,
        createdByName,
        createdByEmail,
        createdByOrgName,
        createdByOrgUserName,
        createdByOrgUserEmail,
        createdById: qCreatedBy,
        createdByOrgUserId: qCreatedByOrgUserID,
        orgId: qOrgId,
        createdAt: q.CreatedAt,
        isVerified: q.IsVerified,
        status: statusValue,
        verifiedBy: verifier ? { fullName: verifier.FullName, email: verifier.Email } : null,
        verifiedAt: q.VerifiedAt,
        reviewerComments: q.ReviewerComments,
        explanation: q.Explanation,
      };
    });

    res.json({
      questions: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count ?? enriched.length,
        totalPages: Math.ceil((count ?? enriched.length) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get admin questions error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
