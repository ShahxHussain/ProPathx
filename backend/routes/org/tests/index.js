import express from 'express';
import crudRouter from './crud.js';
import questionsRouter from './questions.js';
import assignmentsRouter from './assignments.js';
import analyticsRouter from './analytics.js';

const router = express.Router();

router.use(crudRouter);
router.use(questionsRouter);
router.use(assignmentsRouter);
router.use(analyticsRouter);

export default router;
