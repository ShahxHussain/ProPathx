import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { validateStudentSignup, validateLogin } from '../../middleware/validation.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

/** POST /api/student/auth/signup */
router.post('/signup', validateStudentSignup, async (req, res) => {
  const { fullName, email, password, phone } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    const emailNorm = String(email).trim().toLowerCase();

    const { data: existingStudent } = await supabase
      .from('Students')
      .select('StudentID')
      .ilike('Email', emailNorm)
      .maybeSingle();

    if (existingStudent) {
      return res.status(409).json({ error: 'This email is already registered as a student' });
    }

    const { data: existingOrgUser } = await supabase
      .from('OrgUsers')
      .select('OrgUserID')
      .eq('Email', emailNorm)
      .maybeSingle();

    if (existingOrgUser) {
      return res.status(409).json({ error: 'This email is already in use for an organization account' });
    }

    const { data: existingPlatformUser } = await supabase
      .from('Users')
      .select('UserID')
      .eq('Email', emailNorm)
      .maybeSingle();

    if (existingPlatformUser) {
      return res.status(409).json({ error: 'This email is already in use for a platform account' });
    }

    const passwordHash = await hashPassword(String(password).trim());

    const { data: newStudent, error: insertError } = await supabase
      .from('Students')
      .insert({
        OrgID: null,
        FullName: fullName.trim(),
        Email: emailNorm,
        PasswordHash: passwordHash,
        Phone: phone?.trim() || null,
        Status: 'Active',
      })
      .select('StudentID, FullName, Email, OrgID')
      .single();

    if (insertError) {
      console.error('Student self-signup insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create student account', details: insertError.message });
    }

    await createLog({
      actorType: 'Student',
      actorID: newStudent.StudentID,
      actionType: 'Signup',
      entityType: 'Student',
      entityID: newStudent.StudentID,
      description: `Individual student ${fullName.trim()} self-registered (platform)`,
      ipAddress,
      userAgent,
      newData: { email: emailNorm, enrollmentType: 'Individual' },
    });

    res.status(201).json({
      message: 'Account created successfully. You can sign in now.',
      student: {
        studentId: newStudent.StudentID,
        fullName: newStudent.FullName,
        email: newStudent.Email,
        orgId: null,
        orgName: null,
        enrollmentType: 'Individual',
      },
    });
  } catch (error) {
    console.error('Student signup error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    console.log('🔵 Student login route hit for email:', email);
    // Normalize email (trim and lowercase for comparison)
    const normalizedEmail = email.trim().toLowerCase();
    
    // Find student by email from the Students table (case-insensitive)
    // Students table is separate from OrgUsers and Users tables
    const { data: students, error: studentError } = await supabase
      .from('Students')
      .select('*')
      .ilike('Email', normalizedEmail);

    if (studentError) {
      console.error('Error fetching student:', studentError);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!students || students.length === 0) {
      console.log('Student not found for email:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Find exact match (case-insensitive comparison)
    const student = students.find(s => s.Email?.toLowerCase() === normalizedEmail) || students[0];

    if (!student) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Student found:', student.Email, 'Status:', student.Status);

    // Verify password
    if (!student.PasswordHash) {
      console.log('Student found but no password hash:', student.StudentID);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Clean password hash (remove any extra whitespace or newlines)
    const cleanHash = String(student.PasswordHash).trim().replace(/\s+/g, '');
    
    // Validate hash format (should start with $2a$, $2b$, or $2y$)
    if (!cleanHash.match(/^\$2[ayb]\$\d{2}\$/)) {
      console.error('Invalid password hash format for student:', student.Email);
      console.error('Hash value:', cleanHash.substring(0, 20) + '...');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log('Attempting password verification for:', student.Email);
    console.log('Email from request:', email);
    console.log('Email from DB:', student.Email);
    console.log('Password length:', password?.length || 0);
    console.log('Hash length:', cleanHash.length);
    console.log('Hash starts with:', cleanHash.substring(0, 10));
    
    const isValidPassword = await verifyPassword(password, cleanHash);
    
    if (!isValidPassword) {
      console.log('❌ Password verification failed for student:', student.Email);
      console.log('Password provided:', password ? `"${password}" (length: ${password.length})` : 'null/undefined');
      console.log('Hash (first 30 chars):', cleanHash.substring(0, 30));
      
      // Try to verify if password might have whitespace issues
      const trimmedPassword = password?.trim();
      if (trimmedPassword !== password) {
        console.log('⚠️ Password has leading/trailing whitespace, trying trimmed version...');
        const trimmedValid = await verifyPassword(trimmedPassword, cleanHash);
        if (trimmedValid) {
          console.log('✅ Trimmed password matches!');
          // Continue with trimmed password
          // But we'll still return error to be safe - user should fix their input
        }
      }
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log('Password verified successfully for:', student.Email);

    // Check student status
    if (student.Status !== 'Active') {
      return res.status(403).json({ error: `Account is ${student.Status?.toLowerCase() || 'inactive'}` });
    }

    let organization = null;
    const enrollmentType = student.OrgID ? 'Organization' : 'Individual';

    if (student.OrgID) {
      const { data: orgRow, error: orgError } = await supabase
        .from('Organizations')
        .select('OrgID, OrgName, Status')
        .eq('OrgID', student.OrgID)
        .single();

      if (orgError || !orgRow) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      if (orgRow.Status !== 'Active') {
        return res.status(403).json({ error: 'Organization is inactive' });
      }
      organization = orgRow;
    }

    // Update LastLogin
    await supabase
      .from('Students')
      .update({ LastLogin: new Date().toISOString() })
      .eq('StudentID', student.StudentID);

    // Generate JWT token (orgId omitted/null for individual students)
    const token = generateToken({
      actorType: 'Student',
      studentId: student.StudentID,
      ...(student.OrgID ? { orgId: student.OrgID } : {}),
      role: 'Student',
      enrollmentType,
    });

    // Create login log
    await createLog({
      actorType: 'Student',
      actorID: student.StudentID,
      actionType: 'Login',
      entityType: 'Student',
      entityID: student.StudentID,
      description: `Student ${student.FullName} logged in (${enrollmentType})`,
      ipAddress,
      userAgent,
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        userId: student.StudentID,
        fullName: student.FullName,
        email: student.Email,
        role: 'Student',
        orgId: student.OrgID || null,
        orgName: organization?.OrgName || null,
        userType: 'Student',
        enrollmentType,
      },
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * GET /api/student/auth/me (and /student/me alias)
 * Current student: organization-linked or individual (OrgID null)
 */
async function getStudentAuthMe(req, res) {
  try {
    const { studentId } = req.user;

    if (!studentId) {
      return res.status(401).json({ error: 'Not authenticated as student' });
    }

    const { data: student, error } = await supabase
      .from('Students')
      .select(`
        *,
        Organizations:OrgID (
          OrgID,
          OrgName,
          Status
        )
      `)
      .eq('StudentID', studentId)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const enrollmentType = student.OrgID ? 'Organization' : 'Individual';

    res.json({
      user: {
        userId: student.StudentID,
        fullName: student.FullName,
        email: student.Email,
        role: 'Student',
        orgId: student.OrgID || null,
        orgName: student.Organizations?.[0]?.OrgName || null,
        userType: 'Student',
        enrollmentType,
      },
    });
  } catch (error) {
    console.error('Get student info error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

router.get('/me', authenticate, getStudentAuthMe);

export default router;
