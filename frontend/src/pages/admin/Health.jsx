import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  Database,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Cpu,
  Zap,
  RefreshCw,
  HeartPulse,
  TrendingUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import { adminAPI } from '../../services/api';
import './Dashboard.css';
import './Health.css';

const REFRESH_MS = 60_000;

const CHART_GRID = { stroke: '#e2e8f0', strokeDasharray: '4 4' };
const CHART_TICK = { fill: '#64748b', fontSize: 11, fontWeight: 500 };
const CHART_TOOLTIP = {
  contentStyle: {
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
    fontSize: '13px',
  },
};

const STROKE = {
  latency: '#dc2626',
  cpu: '#dc2626',
  memory: '#6366f1',
  db: '#0d9488',
  logins: '#dc2626',
  actions: '#1e3a8a',
  ok: '#22c55e',
  client: '#eab308',
  server: '#ef4444',
  errorRate: '#b91c1c',
};

function fmtNum(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return String(Math.round(v));
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function fmtUptime(sec) {
  if (sec == null || sec < 0) return '—';
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatCard({ label, value, hint, icon: Icon, tone = 'neutral' }) {
  return (
    <div className={`sa-health-stat sa-health-stat--${tone}`}>
      <div className={`sa-health-stat__icon sa-health-stat__icon--${tone}`}>
        <Icon size={20} aria-hidden />
      </div>
      <div className="sa-health-stat__body">
        <span className="sa-health-stat__label">{label}</span>
        <span className="sa-health-stat__value">{value}</span>
        {hint && <span className="sa-health-stat__hint">{hint}</span>}
      </div>
    </div>
  );
}

function ChartPanel({ title, subtitle, badge, icon: Icon, empty, emptyText, children }) {
  return (
    <section className="sa-panel sa-panel--chart sa-health-panel">
      <div className="sa-panel__head">
        <div>
          <h2 className="sa-panel__title">
            <Icon size={18} aria-hidden />
            {title}
          </h2>
          {subtitle && <p className="sa-panel__subtitle">{subtitle}</p>}
        </div>
        {badge && <span className="sa-health-badge">{badge}</span>}
      </div>
      <div className="sa-chart">
        {empty ? <div className="sa-chart-empty">{emptyText}</div> : children}
      </div>
    </section>
  );
}

const Health = () => {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async ({ silent = false } = {}) => {
    try {
      setError('');
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await adminAPI.getHealth();
      setPayload(data);
    } catch (err) {
      setError(err.message || 'Failed to load health data');
      setPayload(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(() => fetchHealth({ silent: true }), REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchHealth]);

  const snap = payload?.snapshot || {};
  const sli = payload?.sli || {};
  const series = payload?.series || {};
  const latency = series.latency || [];
  const dbLatency = series.dbLatency || [];
  const resource = useMemo(() => {
    const lat = series.latency || [];
    const cpu = series.cpu || [];
    const mem = series.memory || [];
    if (!lat.length) {
      return cpu.map((p, i) => ({ time: p.time, cpu: p.cpu, memory: mem[i]?.memory ?? null }));
    }
    return lat.map((p, i) => ({
      time: p.time,
      cpu: cpu[i]?.cpu ?? null,
      memory: mem[i]?.memory ?? null,
    }));
  }, [series]);

  const healthy = payload?.status === 'healthy';
  const req = sli.requests24h || {};
  const updatedLabel = payload?.collectedAt
    ? new Date(payload.collectedAt).toLocaleTimeString()
    : null;

  return (
    <div className="admin-dashboard sa-dash sa-health-page">
      <div className="sa-health-top">
        <h1 className="sa-health-title">
          <HeartPulse size={26} aria-hidden />
          System Health
        </h1>
        <div className="sa-health-top__actions">
          {updatedLabel && (
            <span className="sa-health-updated">
              Updated {updatedLabel}
              {refreshing ? ' · Refreshing…' : ''}
            </span>
          )}
          <button
            type="button"
            className="sa-btn sa-btn--ghost"
            onClick={() => fetchHealth({ silent: true })}
            disabled={refreshing || loading}
          >
            <RefreshCw size={16} className={refreshing ? 'sa-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="sa-banner sa-banner--error" role="alert">
          <AlertCircle size={18} aria-hidden />
          {error}
        </div>
      )}

      {loading && !payload ? (
        <div className="sa-health-loading">
          <RefreshCw size={22} className="sa-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <div className="sa-health-body">
          <section className="sa-health-stats" aria-label="Current status">
            <StatCard
              label="System"
              value={healthy ? 'Healthy' : 'Degraded'}
              icon={healthy ? CheckCircle2 : AlertCircle}
              tone={healthy ? 'ok' : 'warn'}
            />
            <StatCard
              label="API"
              value={payload?.api === 'ok' ? `${fmtNum(snap.apiLatencyMs)} ms` : 'Issue'}
              hint="Latest health check"
              icon={Server}
              tone={payload?.api === 'ok' && (snap.apiLatencyMs == null || snap.apiLatencyMs < 2000) ? 'ok' : 'warn'}
            />
            <StatCard
              label="Database"
              value={snap.dbOk ? `${fmtNum(snap.dbLatencyMs)} ms` : 'Unavailable'}
              hint="Supabase probe"
              icon={Database}
              tone={snap.dbOk ? 'ok' : 'error'}
            />
            <StatCard
              label="Uptime"
              value={fmtUptime(snap.uptimeSec)}
              hint="API process"
              icon={Clock}
              tone="neutral"
            />
          </section>

          <section className="sa-health-stats sa-health-stats--secondary" aria-label="24 hour summary">
            <StatCard
              label="Availability"
              value={fmtPct(sli.availabilityPct)}
              hint="Successful requests (2xx)"
              icon={CheckCircle2}
              tone={
                sli.availabilityPct != null && sli.availabilityPct < 99
                  ? 'warn'
                  : 'ok'
              }
            />
            <StatCard
              label="Error rate"
              value={fmtPct(sli.errorRatePct)}
              hint={`${fmtNum(req.serverError)} server errors (5xx)`}
              icon={AlertCircle}
              tone={sli.errorRatePct > 1 ? 'warn' : 'neutral'}
            />
            <StatCard
              label="Requests"
              value={fmtNum(req.total)}
              hint={`${fmtNum(req.ok)} OK · ${fmtNum(req.clientError)} client · ${fmtNum(req.serverError)} server`}
              icon={BarChart3}
              tone="neutral"
            />
            <StatCard
              label="Memory"
              value={`${fmtNum(snap.heapUsedMB)} MB`}
              hint={`${fmtNum(snap.memoryPct)}% of ${fmtNum(snap.heapTotalMB)} MB heap`}
              icon={Cpu}
              tone={snap.memoryPct > 85 ? 'warn' : 'neutral'}
            />
          </section>

          <div className="sa-health-charts">
            <ChartPanel
              title="Requests & errors"
              subtitle="HTTP status counts by hour"
              badge="24h"
              icon={BarChart3}
              empty={!series.requests?.length}
              emptyText="No request data yet — traffic will appear as the API is used."
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={series.requests || []} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="time" tick={CHART_TICK} />
                  <YAxis yAxisId="left" tick={CHART_TICK} />
                  <YAxis yAxisId="right" orientation="right" tick={CHART_TICK} unit="%" domain={[0, 10]} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="ok" stackId="a" fill={STROKE.ok} name="Success (2xx)" />
                  <Bar yAxisId="left" dataKey="clientError" stackId="a" fill={STROKE.client} name="Client (4xx)" />
                  <Bar yAxisId="left" dataKey="serverError" stackId="a" fill={STROKE.server} name="Server (5xx)" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="errorRate"
                    stroke={STROKE.errorRate}
                    strokeWidth={2}
                    dot={false}
                    name="Error %"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="API response time"
              subtitle={
                sli.apiLatencyP95Ms != null
                  ? `Typical (p95): ${fmtNum(sli.apiLatencyP95Ms)} ms`
                  : 'Health check duration per hour'
              }
              badge="24h"
              icon={Zap}
              empty={!latency.length}
              emptyText="Collecting samples — check back after a few refreshes."
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={latency} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="time" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} unit=" ms" />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v} ms`, 'Response time']} />
                  <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke={STROKE.latency}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Response time"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Database response time"
              subtitle={
                sli.dbLatencyP95Ms != null
                  ? `Typical (p95): ${fmtNum(sli.dbLatencyP95Ms)} ms`
                  : 'Probe query duration per hour'
              }
              badge="24h"
              icon={Database}
              empty={!dbLatency.length}
              emptyText="Collecting samples — check back after a few refreshes."
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dbLatency} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="time" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} unit=" ms" />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v} ms`, 'DB time']} />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke={STROKE.db}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="DB time"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Server resources"
              subtitle={`CPU load ${snap.cpuLoad1m ?? '—'} · Node ${snap.nodeVersion || ''}`}
              badge="24h"
              icon={Cpu}
              empty={!resource.length}
              emptyText="Collecting samples — check back after a few refreshes."
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={resource} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="time" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} domain={[0, 100]} unit="%" />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke={STROKE.cpu}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="CPU %"
                  />
                  <Line
                    type="monotone"
                    dataKey="memory"
                    stroke={STROKE.memory}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Memory %"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Platform activity"
              subtitle="Logins and user actions from audit logs"
              badge="14 days"
              icon={TrendingUp}
              empty={!series.activity?.length}
              emptyText="No activity recorded in this period."
            >
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series.activity || []} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="date" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend />
                  <Bar dataKey="logins" fill={STROKE.logins} radius={[4, 4, 0, 0]} name="Logins" />
                  <Bar dataKey="actions" fill={STROKE.actions} radius={[4, 4, 0, 0]} name="Actions" />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>
        </div>
      )}
    </div>
  );
};

export default Health;
