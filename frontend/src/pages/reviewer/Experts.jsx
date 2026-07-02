import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  CheckCircle,
  XCircle,
  BarChart3,
  Clock,
  FileText,
  Users,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { reviewerAPI, orgAuth } from '../../services/api';
import './Experts.css';

const EMPTY_SUMMARY = {
  expertCount: 0,
  totalQuestions: 0,
  verified: 0,
  rejected: 0,
  pending: 0,
  draft: 0,
  reviewed: 0,
  approvalRate: null,
};

function formatRate(rate) {
  if (rate === null || rate === undefined) return 'N/A';
  return `${rate}%`;
}

function StatusBar({ verified, rejected, pending, draft, total }) {
  if (!total) return null;
  const segments = [
    { key: 'verified', value: verified, className: 'exp-bar__seg--verified' },
    { key: 'rejected', value: rejected, className: 'exp-bar__seg--rejected' },
    { key: 'pending', value: pending, className: 'exp-bar__seg--pending' },
    { key: 'draft', value: draft, className: 'exp-bar__seg--draft' },
  ].filter((s) => s.value > 0);

  return (
    <div className="exp-bar" role="img" aria-label="Question status breakdown">
      {segments.map((seg) => (
        <div
          key={seg.key}
          className={`exp-bar__seg ${seg.className}`}
          style={{ width: `${(seg.value / total) * 100}%` }}
          title={`${seg.key}: ${seg.value}`}
        />
      ))}
    </div>
  );
}

const Experts = () => {
  const [experts, setExperts] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [scopeMessage, setScopeMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const user = orgAuth.getCurrentUser();
  const orgName = user?.orgName || 'your organization';
  const isOrgReviewer = user?.userType === 'Organization';

  const loadExperts = useCallback(async (silent = false) => {
    if (!isOrgReviewer) {
      setExperts([]);
      setSummary(EMPTY_SUMMARY);
      setScopeMessage(
        'Expert Performance is for organization reviewers. It shows Subject Experts in your institute only. Use Dashboard and Question Review for platform-wide review activity.'
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError('');
      const response = await reviewerAPI.getExpertsPerformance();
      setExperts(response.experts || []);
      setSummary(response.summary || EMPTY_SUMMARY);
      setScopeMessage(response.message || '');
    } catch (err) {
      console.error('Failed to load expert data:', err);
      setError(err.message || 'Failed to load expert data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOrgReviewer]);

  useEffect(() => {
    loadExperts();
  }, [loadExperts]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const summaryCards = useMemo(
    () => [
      { label: 'Experts', value: summary.expertCount, icon: Users, tone: 'neutral' },
      { label: 'Total questions', value: summary.totalQuestions, icon: BarChart3, tone: 'neutral' },
      { label: 'Verified', value: summary.verified, icon: CheckCircle, tone: 'success' },
      { label: 'Pending review', value: summary.pending, icon: Clock, tone: 'warning' },
      { label: 'Rejected', value: summary.rejected, icon: XCircle, tone: 'danger' },
      {
        label: 'Verification rate',
        value: formatRate(summary.approvalRate),
        icon: TrendingUp,
        tone: 'accent',
        hint: 'Verified ÷ (verified + rejected)',
      },
    ],
    [summary]
  );

  return (
    <div className="experts-page">
      <header className="exp-hero">
        <div className="exp-hero__text">
          <p className="exp-hero__kicker">Reviewer insights</p>
          <h1>Expert Performance</h1>
          <p className="exp-hero__sub">
            Subject Experts in <strong>{orgName}</strong> — question counts and verification rates for your institute only.
          </p>
        </div>
        <button
          type="button"
          className="exp-refresh-btn"
          onClick={() => loadExperts(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </header>

      {error && <div className="exp-notice exp-notice--error">{error}</div>}

      {loading ? (
        <div className="exp-loading">
          <Loader2 size={28} className="spinner" />
          <span>Loading expert metrics…</span>
        </div>
      ) : (
        <>
          <section className="exp-summary" aria-label="Overview">
            {summaryCards.map(({ label, value, icon: Icon, tone, hint }) => (
              <div key={label} className={`exp-summary-card exp-summary-card--${tone}`}>
                <div className="exp-summary-card__icon">
                  <Icon size={18} />
                </div>
                <div>
                  <div className="exp-summary-card__value">{value}</div>
                  <div className="exp-summary-card__label">{label}</div>
                  {hint && <div className="exp-summary-card__hint">{hint}</div>}
                </div>
              </div>
            ))}
          </section>

          {experts.length === 0 ? (
            <div className="exp-empty">
              <BarChart3 size={48} strokeWidth={1.25} />
              <h3>No expert data yet</h3>
              <p>
                {scopeMessage ||
                  `No Subject Experts in ${orgName} have submitted questions yet.`}
              </p>
            </div>
          ) : (
            <div className="exp-grid">
              {experts.map((expert) => {
                const verified = expert.verified ?? expert.approved ?? 0;
                const reviewed = expert.reviewed ?? verified + (expert.rejected || 0);

                return (
                  <article key={expert.id} className="exp-card">
                    <div className="exp-card__head">
                      <div className="exp-card__avatar" aria-hidden>
                        {(expert.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="exp-card__identity">
                        <h3>{expert.name}</h3>
                        <p>{expert.email}</p>
                        <span
                          className={`exp-badge exp-badge--${expert.type === 'Platform' ? 'platform' : 'org'}`}
                        >
                          {expert.type} Expert
                        </span>
                      </div>
                      <div className="exp-card__rate">
                        <span className="exp-card__rate-label">Verification rate</span>
                        <strong>{formatRate(expert.approvalRate)}</strong>
                        {reviewed > 0 && (
                          <span className="exp-card__rate-meta">{reviewed} reviewed</span>
                        )}
                      </div>
                    </div>

                    <StatusBar
                      verified={verified}
                      rejected={expert.rejected || 0}
                      pending={expert.pending || 0}
                      draft={expert.draft || 0}
                      total={expert.totalQuestions}
                    />

                    <div className="exp-card__legend">
                      <span><i className="dot dot--verified" /> Verified {verified}</span>
                      <span><i className="dot dot--rejected" /> Rejected {expert.rejected || 0}</span>
                      <span><i className="dot dot--pending" /> Pending {expert.pending || 0}</span>
                      {(expert.draft || 0) > 0 && (
                        <span><i className="dot dot--draft" /> Draft {expert.draft}</span>
                      )}
                    </div>

                    <div className="exp-card__stats">
                      <div className="exp-stat">
                        <BarChart3 size={16} />
                        <span className="exp-stat__num">{expert.totalQuestions}</span>
                        <span className="exp-stat__lbl">Total</span>
                      </div>
                      <div className="exp-stat exp-stat--success">
                        <CheckCircle size={16} />
                        <span className="exp-stat__num">{verified}</span>
                        <span className="exp-stat__lbl">Verified</span>
                      </div>
                      <div className="exp-stat exp-stat--warning">
                        <Clock size={16} />
                        <span className="exp-stat__num">{expert.pending || 0}</span>
                        <span className="exp-stat__lbl">Pending</span>
                      </div>
                      <div className="exp-stat exp-stat--danger">
                        <XCircle size={16} />
                        <span className="exp-stat__num">{expert.rejected || 0}</span>
                        <span className="exp-stat__lbl">Rejected</span>
                      </div>
                      {(expert.draft || 0) > 0 && (
                        <div className="exp-stat exp-stat--muted">
                          <FileText size={16} />
                          <span className="exp-stat__num">{expert.draft}</span>
                          <span className="exp-stat__lbl">Draft</span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Experts;
