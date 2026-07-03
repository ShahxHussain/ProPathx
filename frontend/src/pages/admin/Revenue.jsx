import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Package,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { adminAPI } from '../../services/api';
import './Revenue.css';

const CHART_COLORS = ['#dc2626', '#1e3a8a', '#0d9488', '#6366f1', '#eab308'];

const formatMoney = (n) => `$${Number(n || 0).toLocaleString()}`;

const Revenue = () => {
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminAPI.getRevenueStats(days);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || {};

  return (
    <div className="revenue-page revenue-page--dashboard">
      <header className="revenue-header revenue-header--row">
        <div>
          <p className="revenue-eyebrow">Super Admin · Billing</p>
          <h1>Revenue &amp; Payments</h1>
          <p className="revenue-subtitle">MRR, payment trends, and recent transactions from the Payments ledger.</p>
        </div>
        <div className="revenue-header-actions">
          <select
            className="revenue-range-select"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="Revenue chart range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="revenue-error">{error}</div>}

      <div className="revenue-kpi-grid">
        <div className="revenue-kpi">
          <DollarSign size={20} />
          <span className="revenue-kpi-label">Total revenue</span>
          <strong>{formatMoney(stats.totalRevenue)}</strong>
        </div>
        <div className="revenue-kpi">
          <TrendingUp size={20} />
          <span className="revenue-kpi-label">MRR (this month)</span>
          <strong>{formatMoney(stats.mrr)}</strong>
        </div>
        <div className="revenue-kpi">
          <Package size={20} />
          <span className="revenue-kpi-label">Active subscriptions</span>
          <strong>{stats.activeSubscriptions ?? 0}</strong>
        </div>
        <div className="revenue-kpi">
          <CreditCard size={20} />
          <span className="revenue-kpi-label">Completed payments</span>
          <strong>{stats.completedPayments ?? 0}</strong>
        </div>
        <div className="revenue-kpi revenue-kpi--warn">
          <AlertTriangle size={20} />
          <span className="revenue-kpi-label">Failed / refunded</span>
          <strong>
            {(stats.failedPayments ?? 0) + (stats.refundedPayments ?? 0)}
          </strong>
        </div>
      </div>

      <div className="revenue-charts">
        <section className="revenue-chart-card revenue-chart-card--wide">
          <h2>
            <BarChart3 size={18} />
            Revenue trend
          </h2>
          {loading ? (
            <p className="revenue-muted">Loading…</p>
          ) : (data?.revenueTrend || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.revenueTrend}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#dc2626" fill="url(#revGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="revenue-muted">No completed payments in this window yet.</p>
          )}
        </section>

        <section className="revenue-chart-card">
          <h2>By payment method</h2>
          {(data?.paymentsByMethod || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.paymentsByMethod}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="revenue-muted">No payment method breakdown yet.</p>
          )}
        </section>

        <section className="revenue-chart-card">
          <h2>By entity type</h2>
          {(data?.revenueByEntity || []).some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.revenueByEntity.filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={({ name, value }) => `${name}: ${formatMoney(value)}`}
                >
                  {data.revenueByEntity.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="revenue-muted">No entity breakdown yet.</p>
          )}
        </section>
      </div>

      <section className="revenue-recent">
        <div className="revenue-recent-header">
          <h2>Recent payments</h2>
          <Link to="/admin/subscriptions" className="revenue-link-inline">
            View all subscriptions →
          </Link>
        </div>
        <div className="revenue-table-wrap">
          <table className="revenue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Entity</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentPayments || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="revenue-muted">
                    No payments recorded yet. Subscribe with a paid plan to create payment rows.
                  </td>
                </tr>
              ) : (
                data.recentPayments.map((p) => (
                  <tr key={p.PaymentID}>
                    <td>{p.PaymentDate ? new Date(p.PaymentDate).toLocaleString() : '—'}</td>
                    <td>{formatMoney(p.Amount)}</td>
                    <td>{p.PaymentMethod || '—'}</td>
                    <td>
                      <span className={`revenue-status revenue-status--${(p.PaymentStatus || '').toLowerCase()}`}>
                        {p.PaymentStatus}
                      </span>
                    </td>
                    <td>{p.EntityType || '—'}</td>
                    <td className="revenue-tx">{p.TransactionID ? `${p.TransactionID.slice(0, 16)}…` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="revenue-links">
        <Link to="/admin/dashboard" className="revenue-link-card">
          <span className="revenue-link-icon revenue-link-icon--chart">
            <BarChart3 size={22} />
          </span>
          <span className="revenue-link-body">
            <strong>Platform Dashboard</strong>
            <span>Cross-portal KPIs and operational charts</span>
          </span>
        </Link>
      </div>
    </div>
  );
};

export default Revenue;
