import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
import os from 'os';
import { recordHealthSample, getRequestSeries, getHealthSeries } from '../../utils/metricsStore.js';
import { percentile, sumRequestBuckets } from '../../services/healthMetricsService.js';

const router = express.Router();

/**
 * GET /api/admin/health
 * System health: API/DB status, uptime, SLIs, and time-series (SuperAdmin only).
 */
router.get('/health', authenticate, requireSuperAdmin, async (req, res) => {
  const startTime = Date.now();
  let dbLatencyMs = null;
  let dbOk = false;

  try {
    const dbStart = Date.now();
    const { error } = await supabase.from('SystemSettings').select('Key').limit(1);
    dbOk = !error;
    dbLatencyMs = Date.now() - dbStart;
  } catch {
    dbOk = false;
  }

  const uptimeSec = process.uptime();
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const externalMB = Math.round((mem.external || 0) / 1024 / 1024);
  const [load1, load5, load15] = os.loadavg();
  const cpuApprox = Math.min(100, Math.round((load1 || 0) * 25));
  const heapLimitMB = Math.round((mem.heapTotal || mem.heapUsed) / 1024 / 1024) || heapTotalMB;
  const memoryPct =
    heapLimitMB > 0 ? Math.min(100, Math.round((mem.heapUsed / (heapLimitMB * 1024 * 1024)) * 100)) : 0;

  const requestSeries = getRequestSeries();
  const healthSeries = getHealthSeries();

  const apiLatencyMs = Date.now() - startTime;
  recordHealthSample({
    latency: apiLatencyMs,
    cpu: cpuApprox,
    memory: memoryPct,
    dbLatency: dbOk ? dbLatencyMs : null,
  });

  let activity = [];
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const { data: logRows } = await supabase
      .from('Logs')
      .select('ActionType, Timestamp')
      .gte('Timestamp', fourteenDaysAgo.toISOString());

    const byDay = {};
    (logRows || []).forEach((row) => {
      const d = new Date(row.Timestamp);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!byDay[key]) byDay[key] = { date: dateLabel, fullTime: key, logins: 0, actions: 0 };
      if (row.ActionType === 'Login') byDay[key].logins += 1;
      else if (['Create', 'Update', 'Delete', 'View', 'Payment', 'Attempt', 'Verification', 'Subscription', 'ResultGeneration', 'AIQuestionGeneration'].includes(row.ActionType)) {
        byDay[key].actions += 1;
      }
    });

    const sorted = Object.values(byDay).sort((a, b) => a.fullTime - b.fullTime);
    activity = sorted.map(({ date, logins, actions }) => ({ date, logins, actions }));
  } catch {
    activity = [];
  }

  const reqTotals = sumRequestBuckets(requestSeries);
  const reqTotal = reqTotals.ok + reqTotals.clientError + reqTotals.serverError;
  const errorCount = reqTotals.clientError + reqTotals.serverError;
  const availabilityPct =
    reqTotal > 0 ? Number(((reqTotals.ok / reqTotal) * 100).toFixed(3)) : null;
  const errorRatePct = reqTotal > 0 ? Number(((errorCount / reqTotal) * 100).toFixed(3)) : null;
  const serverErrorRatePct =
    reqTotal > 0 ? Number(((reqTotals.serverError / reqTotal) * 100).toFixed(3)) : null;

  const apiLatencies = healthSeries.map((p) => p.latency).filter((v) => v != null);
  const dbLatencies = healthSeries.map((p) => p.dbLatency).filter((v) => v != null);

  const overall = dbOk && apiLatencyMs < 2000 ? 'healthy' : 'degraded';

  res.json({
    status: overall,
    api: 'ok',
    apiLatency: apiLatencyMs,
    db: dbOk ? 'ok' : 'error',
    dbLatency: dbLatencyMs,
    uptime: uptimeSec,
    collectedAt: new Date().toISOString(),
    snapshot: {
      apiLatencyMs,
      dbLatencyMs,
      dbOk,
      uptimeSec: Math.floor(uptimeSec),
      heapUsedMB,
      heapTotalMB,
      rssMB,
      externalMB,
      memoryPct,
      cpuLoad1m: Number((load1 || 0).toFixed(2)),
      cpuLoad5m: Number((load5 || 0).toFixed(2)),
      cpuLoad15m: Number((load15 || 0).toFixed(2)),
      cpuApproxPct: cpuApprox,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    sli: {
      availabilityPct,
      errorRatePct,
      serverErrorRatePct,
      requests24h: {
        total: reqTotal,
        ok: reqTotals.ok,
        clientError: reqTotals.clientError,
        serverError: reqTotals.serverError,
      },
      apiLatencyP50Ms: percentile(apiLatencies, 50),
      apiLatencyP95Ms: percentile(apiLatencies, 95),
      apiLatencyMaxMs: apiLatencies.length ? Math.max(...apiLatencies) : null,
      dbLatencyP50Ms: percentile(dbLatencies, 50),
      dbLatencyP95Ms: percentile(dbLatencies, 95),
      dbLatencyMaxMs: dbLatencies.length ? Math.max(...dbLatencies) : null,
      apdex:
        apiLatencies.length > 0
          ? Number(
              (
                apiLatencies.filter((l) => l <= 500).length / apiLatencies.length
              ).toFixed(3)
            )
          : null,
    },
    series: {
      latency: healthSeries.map((p) => ({ time: p.time, fullTime: p.fullTime, latency: p.latency })),
      cpu: healthSeries.map((p) => ({ time: p.time, fullTime: p.fullTime, cpu: p.cpu })),
      memory: healthSeries.map((p) => ({ time: p.time, fullTime: p.fullTime, memory: p.memory })),
      dbLatency: healthSeries.map((p) => ({ time: p.time, fullTime: p.fullTime, latency: p.dbLatency })),
      requests: requestSeries,
      activity,
    },
  });
});

export default router;
