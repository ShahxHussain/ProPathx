import { supabase } from '../config/database.js';

/**
 * Create an audit log entry
 * @param {Object} logData - Log entry data
 * @param {string} logData.actorType - 'Organization' | 'OrgUser'
 * @param {string} logData.actorID - UUID of the actor
 * @param {string} logData.actionType - Action type (e.g., 'Signup', 'Login', 'Create')
 * @param {string} logData.entityType - Entity type (e.g., 'Organization', 'OrgUser')
 * @param {string} logData.entityID - UUID of the entity
 * @param {string} logData.description - Description of the action
 * @param {string} logData.ipAddress - IP address
 * @param {string} logData.userAgent - User agent string
 * @param {Object} logData.previousData - Previous state (optional)
 * @param {Object} logData.newData - New state (optional)
 */
export const createLog = async (logData) => {
  try {
    const { error } = await supabase.from('Logs').insert({
      ActorType: logData.actorType,
      ActorID: logData.actorID,
      ActionType: logData.actionType,
      EntityType: logData.entityType,
      EntityID: logData.entityID,
      Description: logData.description || null,
      IPAddress: logData.ipAddress || null,
      UserAgent: logData.userAgent || null,
      PreviousData: logData.previousData || null,
      NewData: logData.newData || null,
      Timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to create log:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  } catch (error) {
    console.error('Logging error:', error);
  }
};

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
export const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
};

/**
 * Get user agent from request
 * @param {Object} req - Express request object
 * @returns {string} User agent
 */
export const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'unknown';
};

