/**
 * In-memory metrics store for System Health.
 * - Request counts per hour (2xx, 4xx, 5xx) for last 24h.
 * - Time-series samples (latency, cpu, memory, dbLatency) from health endpoint calls, one per hour bucket, last 24h.
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_HOURS = 24;

function hourKey(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/** @type {Record<number, { ok: number, clientError: number, serverError: number }>} */
const requestBuckets = {};

/**
 * Record one API request by status for the current hour.
 * @param {number} statusCode - HTTP status code
 */
export function recordRequest(statusCode) {
  const key = hourKey();
  if (!requestBuckets[key]) {
    requestBuckets[key] = { ok: 0, clientError: 0, serverError: 0 };
  }
  if (statusCode >= 200 && statusCode < 300) requestBuckets[key].ok += 1;
  else if (statusCode >= 400 && statusCode < 500) requestBuckets[key].clientError += 1;
  else if (statusCode >= 500) requestBuckets[key].serverError += 1;
  prune(requestBuckets, MAX_HOURS);
}

function prune(buckets, keepHours) {
  const cutoff = Date.now() - keepHours * HOUR_MS;
  Object.keys(buckets).forEach((k) => {
    if (Number(k) < cutoff) delete buckets[k];
  });
}

/** @type {Array<{ time: string, fullTime: number, latency?: number, cpu?: number, memory?: number, dbLatency?: number }>} */
const seriesByHour = {};

/**
 * Record one health sample (latency, cpu, memory, dbLatency) for the current hour.
 * Overwrites the bucket so we keep one sample per hour.
 */
export function recordHealthSample({ latency, cpu, memory, dbLatency }) {
  const key = hourKey();
  const d = new Date(key);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  seriesByHour[key] = {
    time,
    fullTime: key,
    ...(latency != null && { latency }),
    ...(cpu != null && { cpu }),
    ...(memory != null && { memory }),
    ...(dbLatency != null && { dbLatency: Math.round(dbLatency) }),
  };
  prune(seriesByHour, MAX_HOURS);
}

/**
 * Get request counts for last 24 hours, sorted by time.
 * @returns {Array<{ time: string, fullTime: number, ok: number, clientError: number, serverError: number, errorRate: string }>}
 */
export function getRequestSeries() {
  const keys = Object.keys(requestBuckets)
    .map(Number)
    .sort((a, b) => a - b);
  const cutoff = Date.now() - MAX_HOURS * HOUR_MS;
  return keys
    .filter((k) => k >= cutoff)
    .map((k) => {
      const b = requestBuckets[k];
      const total = b.ok + b.clientError + b.serverError;
      const errorRate = total > 0 ? (((b.clientError + b.serverError) / total) * 100).toFixed(2) : '0';
      const d = new Date(k);
      return {
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        fullTime: k,
        ok: b.ok,
        clientError: b.clientError,
        serverError: b.serverError,
        errorRate,
      };
    });
}

/**
 * Get time-series for charts: latency, cpu, memory, dbLatency.
 * Fills missing hours with null so charts have 24 points.
 */
export function getHealthSeries() {
  const now = Date.now();
  const points = [];
  for (let i = MAX_HOURS - 1; i >= 0; i--) {
    const t = new Date(now - i * HOUR_MS);
    const key = hourKey(t);
    const d = new Date(key);
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const sample = seriesByHour[key];
    points.push({
      time,
      fullTime: key,
      latency: sample?.latency ?? null,
      cpu: sample?.cpu ?? null,
      memory: sample?.memory ?? null,
      dbLatency: sample?.dbLatency ?? null,
    });
  }
  return points;
}
