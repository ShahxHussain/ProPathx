import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment variables');
}

/**
 * Generate JWT token for organization user
 * @param {Object} payload - Token payload
 * @param {string} payload.actorType - 'Organization'
 * @param {string} payload.orgId - Organization UUID
 * @param {string} payload.orgUserId - OrgUser UUID
 * @param {string} payload.role - User role ('OrgAdmin', 'Reviewer', 'Subject Expert')
 * @returns {string} JWT token
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'propath-api',
    audience: 'propath-client',
  });
};

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'propath-api',
      audience: 'propath-client',
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
export const extractToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

