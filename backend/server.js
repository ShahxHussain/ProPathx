import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerApiRoutes } from './routes/index.js';
import { recordRequest } from './utils/metricsStore.js';
import { warnIfSupabaseUnreachable } from './config/database.js';

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
registerApiRoutes(app);

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
  warnIfSupabaseUnreachable();
});

