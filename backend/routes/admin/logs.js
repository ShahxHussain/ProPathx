import express from 'express';
import { supabase } from '../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import {
  getSystemSetting,
  upsertSystemSetting,
  MAINTENANCE_DEFAULTS,
} from '../../services/systemSettingsService.js';
import { listLogs, getLogStats } from '../../services/logsService.js';

const router = express.Router();

/**
 * GET /api/admin/logs
 */
router.get('/logs', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await listLogs(req.query);
    res.json(result);
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      details: error.details || error.message,
    });
  }
});

/**
 * GET /api/admin/logs/stats
 */
router.get('/logs/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await getLogStats(req.query);
    res.json(result);
  } catch (error) {
    console.error('Get log stats error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      details: error.details || error.message,
    });
  }
});

export default router;
