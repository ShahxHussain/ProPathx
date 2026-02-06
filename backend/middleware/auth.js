import { verifyToken, extractToken } from '../utils/jwt.js';
import { supabase } from '../config/database.js';

/**
 * JWT Authentication Middleware
 * Verifies token and attaches user info to req.user
 */
export const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Invalid token' });
  }
};

/**
 * Role-Based Access Control Middleware
 * Ensures user has required role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Super Admin Only Middleware
 * Ensures user is SuperAdmin
 */
export const requireSuperAdmin = requireRole(['SuperAdmin']);

/**
 * Ensure user belongs to the organization
 * Verifies OrgID matches logged-in user's organization
 */
export const requireSameOrg = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If request has orgId parameter, verify it matches user's org
    const requestedOrgId = req.params.orgId || req.body.orgId;

    if (requestedOrgId && requestedOrgId !== req.user.orgId) {
      return res.status(403).json({ error: 'Access denied: Organization mismatch' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization check failed' });
  }
};

/**
 * Verify organization and user are active
 * Handles both platform users (Users table) and organization users (OrgUsers table)
 */
export const verifyActiveStatus = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { actorType, userId, orgId, orgUserId } = req.user;

    // Platform-level users (Users table) - no organization check needed
    if (actorType === 'User') {
      // Verify platform user is active
      const { data: platformUser, error: userError } = await supabase
        .from('Users')
        .select('Status')
        .eq('UserID', userId)
        .single();

      if (userError || !platformUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (platformUser.Status !== 'Active') {
        return res.status(403).json({ error: 'User account is inactive' });
      }

      next();
      return;
    }

    // Organization users (OrgUsers table) - verify both organization and user
    if (actorType === 'OrgUser') {
      // Verify organization is active
      if (orgId) {
        const { data: org, error: orgError } = await supabase
          .from('Organizations')
          .select('Status')
          .eq('OrgID', orgId)
          .single();

        if (orgError || !org) {
          return res.status(404).json({ error: 'Organization not found' });
        }

        if (org.Status !== 'Active') {
          return res.status(403).json({ error: 'Organization is inactive' });
        }
      }

      // Verify org user is active
      if (orgUserId) {
        const { data: orgUser, error: userError } = await supabase
          .from('OrgUsers')
          .select('Status')
          .eq('OrgUserID', orgUserId)
          .single();

        if (userError || !orgUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        if (orgUser.Status !== 'Active') {
          return res.status(403).json({ error: 'User account is inactive' });
        }
      }

      next();
      return;
    }

    // Students (Students table) - verify both organization and student
    if (actorType === 'Student') {
      const { studentId } = req.user;
      
      // Verify organization is active
      if (orgId) {
        const { data: org, error: orgError } = await supabase
          .from('Organizations')
          .select('Status')
          .eq('OrgID', orgId)
          .single();

        if (orgError || !org) {
          return res.status(404).json({ error: 'Organization not found' });
        }

        if (org.Status !== 'Active') {
          return res.status(403).json({ error: 'Organization is inactive' });
        }
      }

      // Verify student is active
      if (studentId) {
        const { data: student, error: studentError } = await supabase
          .from('Students')
          .select('Status')
          .eq('StudentID', studentId)
          .single();

        if (studentError || !student) {
          return res.status(404).json({ error: 'Student not found' });
        }

        if (student.Status !== 'Active') {
          return res.status(403).json({ error: 'Student account is inactive' });
        }
      }

      next();
      return;
    }

    // Unknown actor type
    return res.status(403).json({ error: 'Invalid user type' });
  } catch (error) {
    console.error('Status verification error:', error);
    return res.status(500).json({ error: 'Status verification failed' });
  }
};

