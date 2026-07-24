import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart3, RefreshCw, Search, ChevronDown, ChevronUp,
  ClipboardList, Users, TrendingUp, CheckCircle2, Award,
  Clock, Eye, X, BookOpen, Layers, Zap, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { testAPI } from '../../../services/api';
import './TestAnalytics.css';

const TABS = [
  { key: 'all', label: 'All Tests', icon: Layers },
  { key: 'scheduled', label: 'Scheduled', icon: Clock },
  { key: 'open', label: 'Open', icon: BookOpen },
  { key: 'self-test', label: 'Self-Test', icon: Zap },
  { key: 'adaptive', label: 'Adaptive', icon: TrendingUp },
];

const SCORE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

const TestAnalytics = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [summary, setSummary] = useState(null);
  const [tests, setTests] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [detailTestId, setDetailTestId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scoreDist, setScoreDist] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimer = useRef(null);

  const isAdaptive = activeTab === 'adaptive';
  const isSelfTest = activeTab === 'self-test';

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const loadAll = useCallback(async (showRefresh = false) => {
    if (isAdaptive) { setLoading(false); return; }
    try {
      if (showRefresh) setRefreshing(true); else setLoading(true);
      const [summaryRes, testsRes, distRes, trendRes] = await Promise.all([
        testAPI.getAnalyticsSummary(activeTab),
        testAPI.getAnalyticsTests({ type: activeTab, sort: sortField, order: sortOrder, page: pagination.page, limit: pagination.limit, search: debouncedSearch }),
        testAPI.getScoreDistribution(activeTab),
        testAPI.getAttemptsTrend(activeTab, 30),
      ]);
      setSummary(summaryRes);
      setTests(testsRes.tests || []);
      setPagination((p) => ({ ...p, total: testsRes.pagination?.total || 0 }));
      setScoreDist(distRes.distribution || []);
      setTrend(trendRes.trend || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, sortField, sortOrder, pagination.page, pagination.limit, debouncedSearch, isAdaptive]);

  useEffect(() => {
    setDetailTestId(null);
    setDetail(null);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [activeTab]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openDetail = async (testId) => {
    setDetailTestId(testId);
    setDetailLoading(true);
    try {
      const res = await testAPI.getAnalyticsDetail(testId);
      setDetail(res);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const closeDetail = () => { setDetailTestId(null); setDetail(null); };

  const handleSort = (field) => {
    if (sortField === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortOrder('desc'); }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const cards = summary ? [
    { icon: ClipboardList, label: 'Total Tests', value: summary.totalTests, color: '#1e3a8a' },
    { icon: Users, label: 'Total Attempts', value: summary.totalAttempts, color: '#7c3aed' },
    { icon: TrendingUp, label: 'Avg Score', value: `${summary.avgScore}%`, color: '#14b8a6' },
    { icon: CheckCircle2, label: 'Completion Rate', value: `${summary.completionRate}%`, color: '#22c55e' },
    { icon: Award, label: 'Pass Rate', value: `${summary.passRate}%`, color: '#f59e0b' },
  ] : [];

  return (
    <div className="ta-page">
      {/* Header */}
      <div className="ta-header">
        <div>

          <p className="ta-subtitle">Complete overview of all test activity</p>
        </div>
        <button className="ta-refresh-btn" onClick={() => loadAll(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs — Settings style */}
      <div className="ta-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`ta-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Adaptive empty state */}
      {isAdaptive && (
        <div className="ta-empty-state">
          <TrendingUp size={48} />
          <h3>Adaptive Testing</h3>
          <p>Adaptive testing is coming soon. This feature will be available in a future update.</p>
        </div>
      )}

      {!isAdaptive && (
        <>
          {/* Summary Cards */}
          {loading ? (
            <div className="ta-cards">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="ta-card ta-skeleton" />)}</div>
          ) : (
            <div className="ta-cards">
              {cards.map((c) => (
                <div key={c.label} className="ta-card">
                  <div className="ta-card-icon" style={{ background: `${c.color}15`, color: c.color }}><c.icon size={20} /></div>
                  <div className="ta-card-info">
                    <span className="ta-card-value">{c.value}</span>
                    <span className="ta-card-label">{c.label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main: table + charts */}
          <div className="ta-body">
            <div className="ta-table-section">
              <div className="ta-search-bar">
                <Search size={16} />
                <input placeholder="Search tests..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              {loading ? (
                <div className="ta-table-skeleton"><div className="ta-skeleton" style={{ height: 300 }} /></div>
              ) : tests.length === 0 ? (
                <div className="ta-empty-state small">
                  <ClipboardList size={32} />
                  <p>
                    {isSelfTest
                      ? 'No self-tests created by students yet.'
                      : `No tests found${search ? ' matching your search' : ''}.`}
                  </p>
                </div>
              ) : (
                <>
                  <div className="ta-table-container">
                    <table className="ta-table">
                      <thead>
                        <tr>
                          <th className="sortable" onClick={() => handleSort('testName')}>Test Name <SortIcon field="testName" /></th>
                          <th>Type</th>
                          <th>Exam</th>
                          <th>{isSelfTest ? 'Created By' : 'Created By'}</th>
                          <th className="sortable" onClick={() => handleSort('questions')}>Qs <SortIcon field="questions" /></th>
                          <th className="sortable" onClick={() => handleSort('duration')}>Duration <SortIcon field="duration" /></th>
                          <th>{isSelfTest ? 'Taken' : 'Assigned'}</th>
                          <th>Attempts</th>
                          <th>Avg Score</th>
                          <th>Completion</th>
                          <th>Status</th>
                          <th className="sortable" onClick={() => handleSort('createdAt')}>Created <SortIcon field="createdAt" /></th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tests.map((t) => (
                          <tr key={t.testId} className="ta-row">
                            <td className="ta-name-cell" title={t.testName}>{t.testName}</td>
                            <td><span className={`ta-badge badge-${t.type.toLowerCase().replace('-', '')}`}>{t.type}</span></td>
                            <td>{t.examName}</td>
                            <td>{t.createdBy}</td>
                            <td>{t.questionCount}</td>
                            <td>{t.duration ? `${t.duration}m` : '—'}</td>
                            <td>{t.assignedCount}</td>
                            <td>{t.attemptCount}</td>
                            <td><strong>{t.avgScore}%</strong></td>
                            <td>
                              <div className="ta-completion-bar">
                                <div className="ta-completion-track"><div className="ta-completion-fill" style={{ width: `${Math.min(t.completionRate, 100)}%` }} /></div>
                                <span>{t.completionRate}%</span>
                              </div>
                            </td>
                            <td><span className={`ta-status status-${(t.status || '').toLowerCase()}`}>{t.status}</span></td>
                            <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                            <td>
                              <button className="ta-detail-btn" onClick={() => openDetail(t.testId)}>
                                <Eye size={14} /> Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="ta-pagination">
                      <button disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>Prev</button>
                      <span>Page {pagination.page} of {totalPages}</span>
                      <button disabled={pagination.page >= totalPages} onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>Next</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Charts */}
            <div className="ta-charts-section">
              <div className="ta-chart-card">
                <h3>Score Distribution</h3>
                {scoreDist.some((d) => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={scoreDist} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RTooltip formatter={(v) => [v, 'Students']} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {scoreDist.map((_, i) => <Cell key={i} fill={SCORE_COLORS[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="ta-chart-empty">No score data yet</p>}
              </div>

              <div className="ta-chart-card">
                <h3>Attempts (Last 30 Days)</h3>
                {trend.some((d) => d.total > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RTooltip labelFormatter={(l) => `Date: ${l}`} />
                      <Line type="monotone" dataKey="total" stroke="#1e3a8a" strokeWidth={2} dot={false} name="Total" />
                      <Line type="monotone" dataKey="scheduled" stroke="#7c3aed" strokeWidth={1.5} dot={false} name="Scheduled" />
                      <Line type="monotone" dataKey="open" stroke="#14b8a6" strokeWidth={1.5} dot={false} name="Open" />
                      <Line type="monotone" dataKey="selfTest" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Self-Test" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="ta-chart-empty">No attempt data yet</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Detail Overlay ──── */}
      {detailTestId && (
        <div className="ta-overlay" onClick={closeDetail}>
          <div className="ta-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ta-modal-close" onClick={closeDetail}><X size={20} /></button>
            {detailLoading ? (
              <div className="ta-modal-loading">Loading test details...</div>
            ) : detail ? (
              <DetailView detail={detail} />
            ) : (
              <div className="ta-modal-loading">Failed to load details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Full Detail View ─── */
function DetailView({ detail }) {
  const { test: t, summary: s, questionBreakdown: qb, students } = detail;
  const isSelfTest = t.type === 'Self-Test';

  return (
    <div className="ta-dv">
      {/* Header */}
      <div className="ta-dv-header">
        <div>
          <h2>{t.testName}</h2>
          <div className="ta-dv-meta">
            <span className={`ta-badge badge-${t.type.toLowerCase().replace('-', '')}`}>{t.type}</span>
            <span>{t.examName}</span>
            <span>{t.questionCount} questions</span>
            <span>{t.duration}m duration</span>
            <span>{t.totalMarks} marks</span>
            <span className={`ta-status status-${(t.status || '').toLowerCase()}`}>{t.status}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="ta-dv-stats">
        {isSelfTest ? (() => {
          const st0 = students.length > 0 ? students[0] : null;
          const scored = st0 && st0.score != null;
          const inProgress = st0 && st0.status === 'In Progress';
          const isMissed = st0 && st0.status === 'Missed';
          return (
            <>
              <div className="ta-dv-stat">
                {scored ? <CheckCircle2 size={16} className="stat-icon-success" />
                  : inProgress ? <Clock size={16} className="stat-icon-warn" />
                  : isMissed ? <AlertTriangle size={16} className="stat-icon-danger" />
                  : <Clock size={16} className="stat-icon-muted" />}
                <span>{scored ? 'Completed' : inProgress ? 'In Progress' : isMissed ? 'Missed' : 'Not Yet Attempted'}</span>
              </div>
              {scored && (
                <>
                  <div className="ta-dv-stat"><TrendingUp size={16} /><span>Score: {st0.score}%</span></div>
                  <div className="ta-dv-stat"><Award size={16} /><span>{st0.correctAnswers}/{st0.totalQuestions} Correct</span></div>
                  {st0.timeTaken != null && <div className="ta-dv-stat"><Clock size={16} /><span>{st0.timeTaken}m taken</span></div>}
                </>
              )}
            </>
          );
        })(        ) : (
          <>
            <div className="ta-dv-stat"><Users size={16} /><span>{s.assigned} Assigned</span></div>
            <div className="ta-dv-stat"><CheckCircle2 size={16} /><span>{s.attempted} Attempted</span></div>
            {(s.missed > 0) && <div className="ta-dv-stat"><AlertTriangle size={16} className="stat-icon-danger" /><span>{s.missed} Missed</span></div>}
            <div className="ta-dv-stat"><Clock size={16} /><span>{s.pending} Pending</span></div>
            <div className="ta-dv-stat"><TrendingUp size={16} /><span>Avg {s.avgScore}%</span></div>
            <div className="ta-dv-stat"><Award size={16} /><span>Pass Rate {s.passRate}%</span></div>
          </>
        )}
      </div>

      {/* Question Breakdown */}
      {qb && (qb.subjects?.length > 0 || Object.values(qb.difficulty).some((v) => v > 0)) && (
        <div className="ta-dv-breakdown">
          {qb.subjects?.length > 0 && (
            <div className="ta-dv-breakdown-card">
              <h4>Subject Breakdown</h4>
              <div className="ta-dv-chips">
                {qb.subjects.map((sub) => (
                  <span key={sub.name} className="ta-dv-chip">{sub.name}: <strong>{sub.count}</strong></span>
                ))}
              </div>
            </div>
          )}
          <div className="ta-dv-breakdown-card">
            <h4>Difficulty Mix</h4>
            <div className="ta-dv-chips">
              <span className="ta-dv-chip chip-easy">Easy: <strong>{qb.difficulty.Easy}</strong></span>
              <span className="ta-dv-chip chip-medium">Medium: <strong>{qb.difficulty.Medium}</strong></span>
              <span className="ta-dv-chip chip-hard">Hard: <strong>{qb.difficulty.Hard}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Student Table */}
      <div className="ta-dv-students">
        <h4>{isSelfTest ? 'Student Performance' : 'Student Assignments & Scores'}</h4>
        {students.length === 0 ? (
          <div className="ta-dv-no-data">
            <ClipboardList size={28} />
            <p>{isSelfTest ? 'This self-test has no attempt recorded yet.' : 'No students have been assigned to this test yet.'}</p>
          </div>
        ) : (
          <div className="ta-detail-table-wrap">
            <table className="ta-detail-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  {!isSelfTest && <th>Group</th>}
                  {!isSelfTest && <th>Type</th>}
                  <th>Status</th>
                  <th>Score</th>
                  <th>Correct / Total</th>
                  <th>Time Taken</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st, i) => {
                  const hasScore = st.score != null;
                  const inProgress = st.status === 'In Progress';
                  const isMissed = st.status === 'Missed';
                  const statusClass = hasScore ? 'status-active'
                    : inProgress ? 'status-inprogress'
                    : isMissed ? 'status-missed'
                    : 'status-pending';
                  const noScoreMsg = isMissed ? 'Missed' : inProgress ? 'In progress' : 'Not attempted';
                  return (
                    <tr key={i}>
                      <td>{st.studentName}</td>
                      <td className="ta-email">{st.studentEmail}</td>
                      {!isSelfTest && <td>{st.groupName || <span className="ta-na">No group</span>}</td>}
                      {!isSelfTest && <td>{st.assignmentType}</td>}
                      <td><span className={`ta-status ${statusClass}`}>{st.status}</span></td>
                      <td>{hasScore ? <strong>{st.score}%</strong> : <span className="ta-na">{noScoreMsg}</span>}</td>
                      <td>{hasScore ? `${st.correctAnswers}/${st.totalQuestions}` : <span className="ta-na">{noScoreMsg}</span>}</td>
                      <td>{st.timeTaken != null ? `${st.timeTaken}m` : <span className="ta-na">{hasScore ? 'N/A' : noScoreMsg}</span>}</td>
                      <td>{st.attemptDate ? new Date(st.attemptDate).toLocaleDateString() : <span className="ta-na">{hasScore ? 'N/A' : noScoreMsg}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Info footer */}
      <div className="ta-dv-footer">
        <span>Created by: <strong>{t.createdBy}</strong></span>
        <span>Created: <strong>{t.createdAt ? new Date(t.createdAt).toLocaleString() : 'N/A'}</strong></span>
        {!isSelfTest && <span>Binding: <strong>{t.bindingMode}</strong></span>}
        {t.startTime && <span>Start: <strong>{new Date(t.startTime).toLocaleString()}</strong></span>}
        {t.endTime && <span>End: <strong>{new Date(t.endTime).toLocaleString()}</strong></span>}
      </div>
    </div>
  );
}

export default TestAnalytics;
