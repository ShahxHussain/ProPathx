import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderTree,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Target,
  AlertCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { questionAPI } from '../../services/api';
import './Contributions.css';

const CHART_TOOLTIP = {
  contentStyle: {
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 14px',
  },
};

const STATUS_META = {
  verified: 'Verified',
  pending: 'Pending',
  draft: 'Draft',
  rejected: 'Rejected',
};

function StatusPills({ byStatus }) {
  if (!byStatus?.total) return null;
  return (
    <div className="contrib-status-pills">
      {Object.entries(STATUS_META).map(([key, label]) =>
        byStatus[key] > 0 ? (
          <span key={key} className="ex-badge ex-badge--muted">
            {label} {byStatus[key]}
          </span>
        ) : null
      )}
    </div>
  );
}

function TopicRow({ topic }) {
  return (
    <div className="contrib-topic-row">
      <div className="contrib-topic-main">
        <span className="contrib-topic-name">{topic.topicName}</span>
        <span className="contrib-count-badge">{topic.count}</span>
      </div>
      <StatusPills byStatus={topic.byStatus} />
    </div>
  );
}

function SubjectBlock({ subject, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="contrib-subject-block">
      <button type="button" className="contrib-subject-head" onClick={() => setOpen((v) => !v)}>
        <span className="contrib-expand-icon">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="contrib-subject-name">{subject.subjectName}</span>
        <span className="contrib-count-badge">{subject.count}</span>
      </button>
      {open && (
        <div className="contrib-topic-list">
          {subject.topics.map((topic) => (
            <TopicRow key={topic.topicId} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExamBlock({ exam, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className={`contrib-exam-card ${open ? 'contrib-exam-card--open' : ''}`}>
      <button type="button" className="contrib-exam-head" onClick={() => setOpen((v) => !v)}>
        <div className="contrib-exam-title-wrap">
          <span className="contrib-expand-icon">{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
          <div>
            <h3>{exam.examName}</h3>
            <p>
              {exam.subjects.length} subject(s) · {exam.count} question(s)
            </p>
          </div>
        </div>
        <span className="contrib-count-badge contrib-count-badge--large">{exam.count}</span>
      </button>
      {open && (
        <div className="contrib-exam-body">
          <StatusPills byStatus={exam.byStatus} />
          {exam.subjects.map((subject, idx) => (
            <SubjectBlock key={subject.subjectId} subject={subject} defaultOpen={idx === 0} />
          ))}
        </div>
      )}
    </article>
  );
}

const Contributions = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadContributions = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      setError('');
      if (silent) setRefreshing(true);
      else setLoading(true);
      const result = await questionAPI.getContributions();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load contributions');
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContributions();
  }, [loadContributions]);

  const filteredExams = useMemo(() => {
    if (!data?.exams) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.exams;

    return data.exams
      .map((exam) => {
        const examMatch = exam.examName.toLowerCase().includes(q);
        const subjects = exam.subjects
          .map((subject) => {
            const subjectMatch = subject.subjectName.toLowerCase().includes(q);
            const topics = subject.topics.filter(
              (topic) =>
                topic.topicName.toLowerCase().includes(q) || subjectMatch || examMatch
            );
            if (!subjectMatch && !examMatch && !topics.length) return null;
            return { ...subject, topics: subjectMatch || examMatch ? subject.topics : topics };
          })
          .filter(Boolean);
        if (!examMatch && !subjects.length) return null;
        return { ...exam, subjects: examMatch ? exam.subjects : subjects };
      })
      .filter(Boolean);
  }, [data, search]);

  const formatUpdated = (d) =>
    d?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) ?? '';

  if (loading) {
    return (
      <div className="dashboard-page portal-dashboard expert-dashboard contributions-page">
        <div className="org-dash-hero org-dash-hero--loading">
          <div className="org-dash-hero-text">
            <span className="org-dash-kicker">Syllabus map</span>
            <h1>Contributions</h1>
            <p className="page-subtitle">Loading your contribution breakdown…</p>
          </div>
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const coverage = data?.coverage || {};

  const summaryCards = [
    { icon: FileText, label: 'Total questions', value: totals.total || 0 },
    { icon: Target, label: 'Exams covered', value: coverage.exams || 0 },
    { icon: Layers, label: 'Subjects covered', value: coverage.subjects || 0 },
    { icon: BookOpen, label: 'Topics covered', value: coverage.topics || 0 },
  ];

  return (
    <div className="dashboard-page portal-dashboard expert-dashboard contributions-page">
      <div className="org-dash-hero">
        <div className="org-dash-hero-text">
          <span className="org-dash-kicker">Syllabus map</span>
          <h1>Contributions</h1>
          <p className="page-subtitle">
            See how many questions you have added across exams, subjects, and topics.
          </p>
          {lastUpdated && (
            <div className="org-dash-meta">
              <span className="org-dash-meta-item org-dash-meta-item--muted">
                Updated {formatUpdated(lastUpdated)}
              </span>
            </div>
          )}
        </div>
        <div className="org-dash-hero-actions">
          <button
            type="button"
            className="action-btn-ghost"
            onClick={() => loadContributions({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? 'od-icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button type="button" className="action-btn-header" onClick={() => navigate('/expert/create')}>
            <Plus size={18} />
            <span>Create question</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error notice--spaced">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="stats-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="stat-icon" aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="contrib-main-grid">
        <section className="dashboard-section">
          <div className="section-header">
            <h2>
              <Award size={20} />
              Top exams by contribution
            </h2>
          </div>
          {data?.topExams?.length ? (
            <div className="contrib-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.topExams} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="examName"
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="count" fill="#6d28d9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">
              <p>No exam contributions yet.</p>
              <button type="button" className="empty-state__cta" onClick={() => navigate('/expert/create')}>
                Create your first question
              </button>
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <div className="section-header">
            <h2>
              <FileText size={20} />
              Status overview
            </h2>
          </div>
          <div className="contrib-status-grid">
            {Object.entries(STATUS_META).map(([key, label]) => (
              <div key={key} className="contrib-status-item">
                <span className="ex-badge ex-badge--muted">{label}</span>
                <strong>{totals[key] || 0}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="dashboard-section contrib-tree-section">
        <div className="contrib-tree-toolbar">
          <div className="section-header contrib-tree-heading">
            <h2>
              <FolderTree size={20} />
              Exam → Subject → Topic
            </h2>
            <p>Drill down to see question counts at each syllabus level</p>
          </div>
          <label className="contrib-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exam, subject, or topic…"
            />
          </label>
        </div>

        {filteredExams.length ? (
          <div className="contrib-exam-list">
            {filteredExams.map((exam, idx) => (
              <ExamBlock key={exam.examId} exam={exam} defaultOpen={idx === 0} />
            ))}
          </div>
        ) : (
          <div className="chart-empty">
            {search ? 'No matches for your search.' : 'No contributions found yet.'}
          </div>
        )}
      </section>
    </div>
  );
};

export default Contributions;
