import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';

import authRouter from './auth.js';
import dashboardRouter from './dashboard.js';
import healthRouter from './health.js';
import organizationsRouter from './organizations.js';
import usersRouter from './users.js';
import examsRouter from './exams.js';
import subscriptionPlansRouter from './subscriptionPlans.js';
import settingsRouter from './settings.js';
import questionsRouter from './questions.js';
import logsRouter from './logs.js';
import subscriptionsRouter from './subscriptions.js';

const router = express.Router();

router.use(authRouter);
router.use(dashboardRouter);
router.use(healthRouter);
router.use(organizationsRouter);
router.use(usersRouter);
router.use(examsRouter);
router.use(subscriptionPlansRouter);
router.use(settingsRouter);
router.use(questionsRouter);
router.use(logsRouter);
router.use(subscriptionsRouter);

export default router;
