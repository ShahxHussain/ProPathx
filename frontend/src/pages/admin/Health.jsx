import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  Database,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Cpu,
  Zap,
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
import './Health.css';

function formatUptime(seconds) {
  if (seconds == null || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const Health = () => {
  const [status, setStatus] = useState({ api: 'checking', db: 'checking', uptime: null, overall: 'healthy' });
  const [latency, setLatency] = useState([]);
  const [resource, setResource] = useState([]);
  const [dbLatency, setDbLatency] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const data = await adminAPI.getHealth();

      setStatus({
        api: data.api === 'ok' ? 'ok' : 'error',
        apiLatency: data.apiLatency,
        db: data.db === 'ok' ? 'ok' : 'error',
        dbLatency: data.dbLatency,
        uptime: data.uptime,
        overall: data.status || 'healthy',
      });

      const s = data.series || {};
      setLatency(s.latency || []);
      setDbLatency(s.dbLatency || []);

      const lat = s.latency || [];
      const cpu = s.cpu || [];
      const mem = s.memory || [];
      const resourceMerged = lat.length
        ? lat.map((p, i) => ({
            time: p.time,
            fullTime: p.fullTime,
            cpu: cpu[i]?.cpu ?? null,
            memory: mem[i]?.memory ?? null,
          }))
        : cpu.map((p, i) => ({
            time: p.time,
            fullTime: p.fullTime,
            cpu: p.cpu,
            memory: mem[i]?.memory ?? null,
          }));
      setResource(resourceMerged);

      setRequests(s.requests || []);
      setActivity(s.activity || []);
    } catch (err) {
      setError(err.message || 'Failed to load health data');
      setStatus((prev) => ({ ...prev, api: 'error' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="health-page">
      <header className="health-header">
        <h1>
          <Activity size={24} />
          System Health
        </h1>
        <p className="health-subtitle">
          API, database, resources, and platform activity. Data refreshes every 60s.
        </p>
      </header>

      {error && (
        <div className="health-error" role="alert">
          {error}
        </div>
      )}

      {/* Status strip */}
      <section className="health-status-strip">
        <div className={`health-status-card ${status.api === 'ok' ? 'ok' : 'error'}`}>
          <Server size={20} />
          <div>
            <span className="health-status-label">API</span>
            <span className="health-status-value">
              {status.api === 'checking'
                ? 'Checking…'
                : status.api === 'ok'
                  ? `OK (${status.apiLatency != null ? status.apiLatency : '—'}ms)`
                  : 'Unreachable'}
            </span>
          </div>
        </div>
        <div className={`health-status-card ${status.db === 'ok' ? 'ok' : 'error'}`}>
          <Database size={20} />
          <div>
            <span className="health-status-label">Database</span>
            <span className="health-status-value">
              {status.db === 'checking'
                ? 'Checking…'
                : status.db === 'ok'
                  ? `OK (${status.dbLatency != null ? status.dbLatency : '—'}ms)`
                  : 'Error'}
            </span>
          </div>
        </div>
        <div className="health-status-card ok">
          <Clock size={20} />
          <div>
            <span className="health-status-label">Uptime</span>
            <span className="health-status-value">{formatUptime(status.uptime)}</span>
          </div>
        </div>
        <div className={`health-status-card overall ${status.overall === 'healthy' ? 'ok' : 'warn'}`}>
          {status.overall === 'healthy' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <div>
            <span className="health-status-label">Overall</span>
            <span className="health-status-value">
              {status.overall === 'healthy' ? 'Healthy' : 'Degraded'}
            </span>
          </div>
        </div>
      </section>

      {loading && !latency.length ? (
        <div className="health-loading">Loading charts…</div>
      ) : (
        <>
          {/* Platform activity — 2nd chart */}
          <section className="health-chart-card">
            <h2>
              <Activity size={20} />
              Platform activity (last 14 days)
            </h2>
            <div className="health-chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={activity} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar dataKey="logins" fill="#dc2626" radius={[4, 4, 0, 0]} name="Logins" />
                  <Bar dataKey="actions" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Actions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* API latency */}
          <section className="health-chart-card">
            <h2>
              <Zap size={20} />
              API latency (last 24h)
            </h2>
            <div className="health-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={latency} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} unit="ms" />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v) => [v != null ? `${v} ms` : '—', 'Latency']}
                    labelFormatter={(l) => `Time: ${l}`}
                  />
                  <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Latency"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Resource usage */}
          <section className="health-chart-card">
            <h2>
              <Cpu size={20} />
              Resource usage (CPU & memory %)
            </h2>
            <div className="health-chart">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={resource} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v) => [v != null ? `${v}%` : '—', '']}
                  />
                  <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="CPU %"
                  />
                  <Line
                    type="monotone"
                    dataKey="memory"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Memory %"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Database latency */}
          <section className="health-chart-card">
            <h2>
              <Database size={20} />
              Database query latency (last 24h)
            </h2>
            <div className="health-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dbLatency} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} unit="ms" />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    formatter={(v) => [v != null ? `${v} ms` : '—', 'DB Latency']}
                  />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="DB Latency"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Requests & errors */}
          <section className="health-chart-card">
            <h2>
              <BarChart3 size={20} />
              Requests & error rate
            </h2>
            <div className="health-chart">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={requests} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#64748b" fontSize={12} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#64748b"
                    fontSize={12}
                    unit="%"
                    domain={[0, 10]}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="ok" stackId="a" fill="#22c55e" name="2xx" />
                  <Bar yAxisId="left" dataKey="clientError" stackId="a" fill="#eab308" name="4xx" />
                  <Bar yAxisId="left" dataKey="serverError" stackId="a" fill="#ef4444" name="5xx" />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    name="Error %"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      <p className="health-footer">
        Metrics are collected from the API (request counts, health samples). Platform activity comes from
        the Logs table.
      </p>
    </div>
  );
};

export default Health;
