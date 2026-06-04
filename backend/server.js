import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import questionRoutes from './routes/questions.js';
import reviewerRoutes from './routes/reviewers.js';
import notificationRoutes from './routes/notifications.js';
import testRoutes from './routes/tests.js';
import studentRoutes from './routes/students.js';
import groupRoutes from './routes/groups.js';
import orgSettingsRoutes from './routes/orgSettings.js';
import studentAuthRoutes from './routes/auth.js';
import { recordRequest } from './utils/metricsStore.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Record API request counts by status for System Health (last 24h)
app.use('/api', (req, res, next) => {
  res.on('finish', () => recordRequest(res.statusCode));
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/org/auth', authRoutes);
app.use('/api/student/auth', studentAuthRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/org/users', userRoutes);
app.use('/api/org/tests', testRoutes);
app.use('/api/org/students', studentRoutes);
app.use('/api/org/groups', groupRoutes);
app.use('/api/org/settings', orgSettingsRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/reviewers', reviewerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Debug: Log registered admin routes (development only)
if (process.env.NODE_ENV === 'development') {
  console.log('📋 Admin routes registered at /api/admin');
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(` ProPath API server running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
});

