import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import { validateLogin } from '../../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/admin/test
 * Test route to verify admin routes are registered (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/test', (req, res) => {
    res.json({ message: 'Admin routes are working!', timestamp: new Date().toISOString() });
  });
}

/**
 * POST /api/admin/login
 * Super Admin login
 */
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = getClientIP(req);
  const userAgent = getUserAgent(req);

  try {
    // Find SuperAdmin in Users table
    const { data: superAdmin, error: userError } = await supabase
      .from('Users')
      .select('*')
      .eq('Email', email)
      .eq('Role', 'SuperAdmin')
      .single();

    if (userError || !superAdmin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, superAdmin.PasswordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check user status
    if (superAdmin.Status !== 'Active') {
      return res.status(403).json({ error: `Account is ${superAdmin.Status.toLowerCase()}` });
    }

    // Update LastLogin
    await supabase
      .from('Users')
      .update({ LastLogin: new Date().toISOString() })
      .eq('UserID', superAdmin.UserID);

    // Generate JWT token
    const token = generateToken({
      actorType: 'User',
      userId: superAdmin.UserID,
      role: 'SuperAdmin',
    });

    // Create login log
    await createLog({
      actorType: 'User',
      actorID: superAdmin.UserID,
      actionType: 'Login',
      entityType: 'User',
      entityID: superAdmin.UserID,
      description: `Super Admin ${superAdmin.FullName} logged in`,
      ipAddress,
      userAgent,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: superAdmin.UserID,
        fullName: superAdmin.FullName,
        email: superAdmin.Email,
        role: superAdmin.Role,
      },
    });
  } catch (error) {
    console.error('Super Admin login error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
