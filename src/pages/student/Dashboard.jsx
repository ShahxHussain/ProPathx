import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  LayoutGrid,
  ListFilter,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { studentAuth, studentDashboardAPI } from '../../services/api';
import './Dashboard.css';

const PIE_COLORS = ['#0d9488', '#ea580c', '#6366f1', '#0f766e', '#be123c', '#64748b'];

function getTestFromAssignment(assignment) {
  return (
    assignment.test ||
    assignment.Tests?.[0] ||
    (assignment.Tests && !Array.isArray(assignment.Tests) ? assignment.Tests : null)
  );
}

function getTestDisplayName(test) {
  return test?.testName || test?.TestName || 'Test';
}

function formatDateShort(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Align with Assignments page so status badges and charts match. */
function getAssignmentStatus(assignment, now) {
  const dueDate = assignment.DueDate ? new Date(assignment.DueDate) : null;
  const test = getTestFromAssignment(assignment);
  const latest = assignment.latestAttempt;
  const attemptStatus = latest?.Status ?? latest?.status;
  const rowStatusRaw = (assignment.Status ?? assignment.status ?? '').trim();
  const rowStatusNorm = rowStatusRaw.toLowerCase().replace(/\s+/g, '');

  if (rowStatusNorm === 'completed') {
    return { text: 'Completed', color: '#166534', key: 'completed' };
  }
  if (rowStatusNorm === 'expired' || rowStatusNorm === 'cancelled') {
    return { text: rowStatusRaw || 'Unavailable', color: '#991b1b', key: 'unavailable' };
  }

  if (attemptStatus === 'Completed') {
    return { text: 'Completed', color: '#166534', key: 'completed' };
  }

  const endAt = test?.EndTime || test?.endTime;
  if (endAt && new Date(endAt) < now && attemptStatus !== 'Completed') {
    return { text: 'Closed', color: '#991b1b', key: 'unavailable' };
  }

  if (dueDate && dueDate < now && attemptStatus !== 'Completed') {
    return { text: 'Expired', color: '#991b1b', key: 'unavailable' };
  }

  const startAt = test?.StartTime || test?.startTime;
  if (startAt) {
    const start = new Date(startAt);
    if (start > now) {
      return { text: 'Upcoming', color: '#1e40af', key: 'upcoming' };
    }
  }

  if (latest && attemptStatus !== 'Completed') {
    return { text: 'In progress', color: '#1e3a8a', key: 'in_progress' };
  }

  return { text: 'Pending', color: '#9a3412', key: 'pending' };
}

function completedScoreRow(assignment) {
  const latest = assignment.latestAttempt;
  if (!latest) return null;
  const st = latest.Status ?? latest.status;
  const end = latest.EndTime ?? latest.endTime;
  if (st !== 'Completed' && (end == null || end === '')) return null;
  const test = getTestFromAssignment(assignment);
  const testId = test?.TestID || test?.testId || assignment.TestID;
  if (!testId) return null;
  const score = latest.ObtainedMarks ?? latest.obtainedMarks;
  const total = latest.TotalMarks ?? latest.totalMarks ?? test?.TotalMarks ?? test?.totalMarks ?? null;
  const pct =
    total != null && Number(total) > 0 && score != null
      ? Math.round((Number(score) / Number(total)) * 1000) / 10
      : null;
  if (pct == null) return null;
  const submitted = latest.EndTime ?? latest.endTime;
  const name = getTestDisplayName(test);
  return {
    testId,
    name: name.length > 22 ? `${name.slice(0, 20)}…` : name,
    fullName: name,
    pct,
    submitted,
    score,
    total,
  };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const user = studentAuth.getCurrentUserSync();
  const displayName =
    user?.fullName || user?.name || user?.email?.split('@')[0] || 'Student';

  const [stats, setStats] = useState({
    totalAssignments: 0,
    completedTests: 0,
    pendingTests: 0,
    expiredTests: 0,
    averageScore: 0,
  });
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [statsRes, assignRes] = await Promise.all([
        studentDashboardAPI.getDashboardStats(),
        studentDashboardAPI.getAssignments(),
      ]);
      setStats(statsRes.stats || {});
      setAssignments(assignRes.assignments || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const statusDistribution = useMemo(() => {
    const clock = new Date();
    const counts = new Map();
    for (const a of assignments) {
      const { text } = getAssignmentStatus(a, clock);
      counts.set(text, (counts.get(text) || 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  }, [assignments]);

  const scoreHistory = useMemo(() => {
    const rows = [];
    for (const a of assignments) {
      const r = completedScoreRow(a);
      if (r) rows.push(r);
    }
    rows.sort((x, y) => {
      const tx = x.submitted ? new Date(x.submitted).getTime() : 0;
      const ty = y.submitted ? new Date(y.submitted).getTime() : 0;
      return tx - ty;
    });
    return rows.slice(-10).map((r, i) => ({ ...r, n: i + 1 }));
  }, [assignments]);

  const completionsByMonth = useMemo(() => {
    const buckets = new Map();
    for (const a of assignments) {
      const r = completedScoreRow(a);
      if (!r?.submitted) continue;
      const d = new Date(r.submitted);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      if (!buckets.has(key)) buckets.set(key, { key, label, count: 0 });
      buckets.get(key).count += 1;
    }
    const arr = [...buckets.values()].sort((x, y) => x.key.localeCompare(y.key));
    return arr.slice(-8);
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const clock = new Date();
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      const test = getTestFromAssignment(a);
      const name = getTestDisplayName(test).toLowerCase();
      if (q && !name.includes(q)) return false;
      const { key, text } = getAssignmentStatus(a, clock);
      if (tableFilter === 'all') return true;
      if (tableFilter === 'done') return text === 'Completed';
      if (tableFilter === 'action') {
        return ['Pending', 'In progress', 'Upcoming'].includes(text);
      }
      if (tableFilter === 'attention') {
        return ['Expired', 'Closed', 'Unavailable'].includes(text) || key === 'unavailable';
      }
      return true;
    });
  }, [assignments, search, tableFilter]);

  const goAssignment = (assignment) => {
    const test = getTestFromAssignment(assignment);
    const testId = test?.TestID || test?.testId || assignment.TestID;
    if (!testId) return;
    const { text } = getAssignmentStatus(assignment, new Date());
    if (text === 'Completed') navigate(`/student/test/${testId}/results`);
    else navigate(`/student/test/${testId}`);
  };

  const statTiles = [
    {
      icon: FileText,
      label: 'Assignments',
      value: stats.totalAssignments,
      hint: 'Total assigned',
    },
    {
      icon: CheckCircle,
      label: 'Completed',
      value: stats.completedTests,
      hint: 'Submitted attempts',
    },
    {
      icon: Clock,
      label: 'Still to do',
      value: stats.pendingTests,
      hint: 'Not started yet',
    },
    {
      icon: XCircle,
      label: 'Missed / closed',
      value: stats.expiredTests,
      hint: 'Past due or window',
    },
    {
      icon: Award,
      label: 'Average score',
      value: `${stats.averageScore}%`,
      hint: 'Across finished tests',
    },
  ];

  if (loading) {
    return (
      <div className="stu-dash stu-dash--loading">
        <div className="stu-dash__load-inner">
          <div className="stu-dash__load-orbit" aria-hidden />
          <p className="stu-dash__load-text">Preparing your personalized performance command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-dash">
      <header className="stu-dash__hero">
        <div className="stu-dash__hero-bg" aria-hidden />
        <div className="stu-dash__hero-content">
          <p className="stu-dash__kicker">
            <Sparkles size={16} aria-hidden />
            Your learning hub
          </p>
          <h1 className="stu-dash__title">Welcome back, {displayName}</h1>
          <p className="stu-dash__lead">
            Scores, deadlines, and every assignment in one place—no need to jump between pages.
          </p>
          <div className="stu-dash__hero-actions">
            <button type="button" className="stu-dash__btn stu-dash__btn--primary" onClick={() => navigate('/student/assignments')}>
              <BookOpen size={18} />
              All assignments
            </button>
            <button type="button" className="stu-dash__btn stu-dash__btn--ghost" onClick={() => navigate('/student/reports')}>
              <BarChart3 size={18} />
              Results &amp; reports
            </button>
            <button type="button" className="stu-dash__btn stu-dash__btn--ghost" onClick={() => navigate('/student/subscription-plans')}>
              <Target size={18} />
              Plans
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="stu-dash__notice stu-dash__notice--error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="stu-dash__kpis" aria-label="Summary statistics">
        {statTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <article key={tile.label} className="stu-dash__kpi">
              <div className="stu-dash__kpi-icon">
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="stu-dash__kpi-body">
                <span className="stu-dash__kpi-value">{tile.value}</span>
                <span className="stu-dash__kpi-label">{tile.label}</span>
                <span className="stu-dash__kpi-hint">{tile.hint}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="stu-dash__charts" aria-label="Charts">
        <div className="stu-dash__chart-card">
          <div className="stu-dash__card-head">
            <h2 className="stu-dash__card-title">
              <LayoutGrid size={20} aria-hidden />
              Assignments mix
            </h2>
            <p className="stu-dash__card-sub">How your work is distributed right now</p>
          </div>
          <div className="stu-dash__chart-body">
            {statusDistribution.length === 0 ? (
              <p className="stu-dash__empty">No assignments yet—when your organization assigns tests, you will see a breakdown here.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="var(--stu-surface)"
                    strokeWidth={2}
                  >
                    {statusDistribution.map((_, i) => (
                      <Cell key={String(i)} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} test${v === 1 ? '' : 's'}`, n]}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--stu-border)' }}
                  />
                  <Legend verticalAlign="bottom" height={28} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="stu-dash__chart-card">
          <div className="stu-dash__card-head">
            <h2 className="stu-dash__card-title">
              <TrendingUp size={20} aria-hidden />
              Recent scores
            </h2>
            <p className="stu-dash__card-sub">Last {scoreHistory.length} completed tests (% of max marks)</p>
          </div>
          <div className="stu-dash__chart-body">
            {scoreHistory.length === 0 ? (
              <p className="stu-dash__empty">Finish a test to see your score trend here.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={scoreHistory} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stu-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--stu-muted)', fontSize: 11 }} interval={0} angle={-28} textAnchor="end" height={56} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--stu-muted)', fontSize: 11 }} width={36} />
                  <Tooltip
                    formatter={(v) => [`${v}%`, 'Score']}
                    labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ''}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--stu-border)' }}
                  />
                  <Bar dataKey="pct" fill="url(#stuBarGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <defs>
                    <linearGradient id="stuBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="stu-dash__chart-card stu-dash__chart-card--wide">
          <div className="stu-dash__card-head">
            <h2 className="stu-dash__card-title">
              <Activity size={20} aria-hidden />
              Completion rhythm
            </h2>
            <p className="stu-dash__card-sub">Number of tests finished per month</p>
          </div>
          <div className="stu-dash__chart-body">
            {completionsByMonth.length === 0 ? (
              <p className="stu-dash__empty">Your completed tests will build a timeline here.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={completionsByMonth} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stuAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c2410c" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#c2410c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stu-grid)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--stu-muted)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--stu-muted)', fontSize: 11 }} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--stu-border)' }} />
                  <Area type="monotone" dataKey="count" stroke="#c2410c" strokeWidth={2} fill="url(#stuAreaGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="stu-dash__panel" aria-labelledby="assign-all-heading">
        <div className="stu-dash__panel-top">
          <div>
            <h2 id="assign-all-heading" className="stu-dash__panel-title">
              <ListFilter size={22} aria-hidden />
              Every assignment
            </h2>
            <p className="stu-dash__panel-sub">Open a test or review a result—same actions as the assignments page.</p>
          </div>
          <button type="button" className="stu-dash__link-all" onClick={() => navigate('/student/assignments')}>
            Full assignments view
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="stu-dash__toolbar">
          <div className="stu-dash__tabs" role="tablist" aria-label="Filter assignments">
            {[
              { id: 'all', label: 'All' },
              { id: 'action', label: 'Needs action' },
              { id: 'done', label: 'Done' },
              { id: 'attention', label: 'Missed / closed' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tableFilter === t.id}
                className={`stu-dash__tab ${tableFilter === t.id ? 'stu-dash__tab--on' : ''}`}
                onClick={() => setTableFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="stu-dash__search">
            <span className="visually-hidden">Search by test name</span>
            <input
              type="search"
              placeholder="Search tests…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="stu-dash__table-wrap">
          <table className="stu-dash__table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Status</th>
                <th>Due</th>
                <th>Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="stu-dash__table-empty">
                    No assignments match this filter.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((assignment) => {
                  const test = getTestFromAssignment(assignment);
                  const testId = test?.TestID || test?.testId || assignment.TestID;
                  const status = getAssignmentStatus(assignment, new Date());
                  const latest = assignment.latestAttempt;
                  const completed = status.text === 'Completed';
                  const score =
                    completed && latest
                      ? `${latest.ObtainedMarks ?? latest.obtainedMarks ?? '—'} / ${latest.TotalMarks ?? latest.totalMarks ?? test?.TotalMarks ?? '—'}`
                      : '—';
                  const blocked =
                    !testId ||
                    status.text === 'Upcoming' ||
                    (['Expired', 'Closed', 'Unavailable'].includes(status.text) && !completed);
                  let actionLabel = 'Open';
                  if (completed) actionLabel = 'Results';
                  else if (status.text === 'Upcoming') actionLabel = 'Soon';
                  else if (blocked) actionLabel = '—';

                  return (
                    <tr key={assignment.AssignmentID ?? testId}>
                      <td>
                        <div className="stu-dash__cell-test">
                          <span className="stu-dash__cell-name">{getTestDisplayName(test)}</span>
                          {test?.DurationMinutes != null && (
                            <span className="stu-dash__cell-meta">{test.DurationMinutes} min</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="stu-dash__pill" style={{ '--pill-color': status.color }}>
                          {status.text}
                        </span>
                      </td>
                      <td>{formatDateShort(assignment.DueDate)}</td>
                      <td className="stu-dash__mono">{score}</td>
                      <td className="stu-dash__cell-action">
                        <button
                          type="button"
                          className="stu-dash__row-go"
                          disabled={blocked}
                          onClick={() => goAssignment(assignment)}
                        >
                          {actionLabel}
                          {actionLabel !== '—' && <ChevronRight size={16} aria-hidden />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
