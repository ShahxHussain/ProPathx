import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Check,
  X,
  Eye,
  BookOpen,
  Sparkles,
  AlertTriangle,
  XCircle,
  Loader2,
  AlertCircle,
  Calendar,
  RefreshCw,
  Settings,
  Clock,
} from 'lucide-react';
import { orgDashboard } from '../../../services/api';
import './OrgStudentExamEnrollments.css';
import './SubscriptionPlans.css';

const FILTER_ALL = 'all';
const FILTER_SUBSCRIBED = 'subscribed';
const FILTER_AVAILABLE = 'available';
const FILTER_COMING = 'coming';

function formatPrice(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDuration(months) {
  const m = Number(months) || 1;
  return `${m} month${m === 1 ? '' : 's'}`;
}

function getPlanStatus(plan) {
  const hasExams = plan.exams && plan.exams.length > 0;
  if (plan.isSubscribed) return 'subscribed';
  if (!hasExams) return 'coming-soon';
  return 'available';
}

function sortPlans(plans) {
  const order = { subscribed: 0, available: 1, 'coming-soon': 2 };
  return [...plans].sort((a, b) => {
    const diff = (order[getPlanStatus(a)] ?? 9) - (order[getPlanStatus(b)] ?? 9);
    if (diff !== 0) return diff;
    return String(a.PlanName || '').localeCompare(String(b.PlanName || ''));
  });
}

const SubscriptionPlans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(FILTER_ALL);
  const [selectedPlanForDetails, setSelectedPlanForDetails] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [subscriptionToUnsubscribe, setSubscriptionToUnsubscribe] = useState(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError('');

      const [plansResponse, subscriptionsResponse] = await Promise.all([
        orgDashboard.getSubscriptionPlans(),
        orgDashboard.getSubscriptions().catch(() => ({ subscriptions: [] })),
      ]);

      const plansList = plansResponse.plans || [];
      const subscriptionsList = subscriptionsResponse.subscriptions || [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const plansWithSubscriptionStatus = plansList.map((plan) => {
        const activeSubscription = subscriptionsList.find((sub) => {
          if (sub.PlanID !== plan.PlanID) return false;
          if (sub.Status?.toLowerCase() !== 'active') return false;
          if (!sub.EndDate) return false;
          const endDate = new Date(sub.EndDate);
          if (Number.isNaN(endDate.getTime())) return false;
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          return endDateOnly >= today;
        });

        return {
          ...plan,
          subscription: activeSubscription || null,
          isSubscribed: !!activeSubscription,
          status: null,
        };
      });

      plansWithSubscriptionStatus.forEach((p) => {
        p.status = getPlanStatus(p);
      });

      setPlans(sortPlans(plansWithSubscriptionStatus));
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
      setError(err.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const subscribed = plans.filter((p) => p.status === 'subscribed').length;
    const available = plans.filter((p) => p.status === 'available').length;
    const coming = plans.filter((p) => p.status === 'coming-soon').length;
    return { total: plans.length, subscribed, available, coming };
  }, [plans]);

  const filteredPlans = useMemo(() => {
    if (filter === FILTER_ALL) return plans;
    if (filter === FILTER_SUBSCRIBED) return plans.filter((p) => p.status === 'subscribed');
    if (filter === FILTER_AVAILABLE) return plans.filter((p) => p.status === 'available');
    if (filter === FILTER_COMING) return plans.filter((p) => p.status === 'coming-soon');
    return plans;
  }, [plans, filter]);

  const activeSubscriptions = useMemo(
    () => plans.filter((p) => p.isSubscribed && p.subscription),
    [plans]
  );

  if (loading) {
    return (
      <div className="org-ex-enroll-page org-plans-page">
        <div className="org-plans-loading">
          <Loader2 size={22} className="spin-icon" aria-hidden />
          Loading subscription plans…
        </div>
      </div>
    );
  }

  return (
    <div className="org-ex-enroll-page org-plans-page">
      <div className="page-header org-ex-enroll-header org-plans-header">
        <div>
          <h1>
            <Package size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Subscription plans
          </h1>
          <p className="page-subtitle">
            Choose a plan for your organization. Subscribed plans unlock exams, tests, and student enrollments.
          </p>
        </div>
        <div className="org-plans-header-actions">
          <Link to="/org/settings" className="btn-secondary org-plans-settings-link">
            <Settings size={16} />
            Usage &amp; auto-renew
          </Link>
        </div>
      </div>

      {error && (
        <div className="org-ex-enroll-notice" role="alert">
          <div className="notice warn">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <>
          <div className="org-plans-stats">
            <div className="org-plans-stat">
              <span className="org-plans-stat-value">{counts.total}</span>
              <span className="org-plans-stat-label">Plans listed</span>
            </div>
            <div className="org-plans-stat org-plans-stat--active">
              <span className="org-plans-stat-value">{counts.subscribed}</span>
              <span className="org-plans-stat-label">Your active</span>
            </div>
            <div className="org-plans-stat">
              <span className="org-plans-stat-value">{counts.available}</span>
              <span className="org-plans-stat-label">Ready to subscribe</span>
            </div>
            <div className="org-plans-stat org-plans-stat--muted">
              <span className="org-plans-stat-value">{counts.coming}</span>
              <span className="org-plans-stat-label">Coming soon</span>
            </div>
          </div>

          <div className="org-plans-filters" role="tablist" aria-label="Filter plans">
            <button
              type="button"
              role="tab"
              aria-selected={filter === FILTER_ALL}
              className={`org-plans-filter ${filter === FILTER_ALL ? 'active' : ''}`}
              onClick={() => setFilter(FILTER_ALL)}
            >
              All
              <span className="org-plans-filter-count">{counts.total}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === FILTER_SUBSCRIBED}
              className={`org-plans-filter ${filter === FILTER_SUBSCRIBED ? 'active' : ''}`}
              onClick={() => setFilter(FILTER_SUBSCRIBED)}
            >
              My plans
              <span className="org-plans-filter-count">{counts.subscribed}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === FILTER_AVAILABLE}
              className={`org-plans-filter ${filter === FILTER_AVAILABLE ? 'active' : ''}`}
              onClick={() => setFilter(FILTER_AVAILABLE)}
            >
              Available
              <span className="org-plans-filter-count">{counts.available}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === FILTER_COMING}
              className={`org-plans-filter ${filter === FILTER_COMING ? 'active' : ''}`}
              onClick={() => setFilter(FILTER_COMING)}
            >
              Coming soon
              <span className="org-plans-filter-count">{counts.coming}</span>
            </button>
          </div>
        </>
      )}

      {activeSubscriptions.length > 0 && filter !== FILTER_COMING && (
        <section className="org-plans-active-section" aria-label="Active subscriptions">
          <h2 className="org-plans-section-title">Currently subscribed</h2>
          <div className="org-plans-active-grid">
            {activeSubscriptions.map((plan) => (
              <div key={plan.PlanID} className="org-plans-active-card">
                <div className="org-plans-active-card-head">
                  <strong>{plan.PlanName}</strong>
                  <span className="org-plans-pill org-plans-pill--active">
                    <Check size={12} />
                    Active
                  </span>
                </div>
                <p className="org-plans-active-meta">
                  <Calendar size={14} />
                  Valid until{' '}
                  <strong>
                    {plan.subscription?.EndDate
                      ? new Date(plan.subscription.EndDate).toLocaleDateString()
                      : '—'}
                  </strong>
                </p>
                {plan.subscription?.AutoRenew && (
                  <p className="org-plans-active-meta org-plans-active-meta--renew">
                    <RefreshCw size={14} />
                    Auto-renew on — manage in Settings
                  </p>
                )}
                <div className="org-plans-active-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setSelectedPlanForDetails(plan)}
                  >
                    <Eye size={14} />
                    Details
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm org-plans-btn-unsub"
                    onClick={() => setSubscriptionToUnsubscribe(plan.subscription)}
                  >
                    <XCircle size={14} />
                    Unsubscribe
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {plans.length === 0 ? (
        <div className="org-ex-enroll-panel org-plans-empty">
          <Package size={40} className="org-plans-empty-icon" aria-hidden />
          <h3>No subscription plans available</h3>
          <p className="org-ex-enroll-panel-hint">Contact platform support for subscription options.</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="org-ex-enroll-panel org-plans-empty">
          <p className="org-ex-enroll-panel-hint">No plans match this filter. Try another tab.</p>
        </div>
      ) : (
        <div className="org-plans-grid">
          {filteredPlans.map((plan) => (
            <PlanCard
              key={plan.PlanID}
              plan={plan}
              onDetails={() => setSelectedPlanForDetails(plan)}
              onSubscribe={() => setSelectedPlan(plan)}
              onUnsubscribe={() => setSubscriptionToUnsubscribe(plan.subscription)}
            />
          ))}
        </div>
      )}

      <p className="org-plans-footnote">
        Online payment checkout is coming soon. Subscribing here activates the plan on your organization account
        immediately for testing and admin use.
      </p>

      {selectedPlanForDetails && (
        <PlanDetailsModal plan={selectedPlanForDetails} onClose={() => setSelectedPlanForDetails(null)} />
      )}

      {subscriptionToUnsubscribe && (
        <UnsubscribeConfirmationModal
          subscription={subscriptionToUnsubscribe}
          plan={plans.find(
            (p) => p.subscription?.SubscriptionID === subscriptionToUnsubscribe.SubscriptionID
          )}
          onClose={() => setSubscriptionToUnsubscribe(null)}
          onSuccess={() => {
            loadPlans();
            setSubscriptionToUnsubscribe(null);
          }}
        />
      )}

      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          onClose={() => {
            setSelectedPlan(null);
            loadPlans();
          }}
          onSuccess={() => {
            loadPlans();
            setSelectedPlan(null);
          }}
        />
      )}
    </div>
  );
};

function PlanCard({ plan, onDetails, onSubscribe, onUnsubscribe }) {
  const status = plan.status || getPlanStatus(plan);
  const examCount = plan.exams?.length ?? 0;
  const featureEntries = plan.Features ? Object.entries(plan.Features) : [];
  const poolTotal =
    plan.VerifiedPlatformQuestionPoolTotal != null
      ? Number(plan.VerifiedPlatformQuestionPoolTotal)
      : (plan.exams || []).reduce((s, e) => s + (Number(e.VerifiedPlatformQuestionCount) || 0), 0);

  return (
    <article
      className={`org-plans-card org-plans-card--${status}`}
      aria-label={`${plan.PlanName} plan`}
    >
      <div className="org-plans-card-top">
        <span className={`org-plans-pill org-plans-pill--${status}`}>
          {status === 'subscribed' && (
            <>
              <Check size={12} /> Subscribed
            </>
          )}
          {status === 'available' && 'Available'}
          {status === 'coming-soon' && (
            <>
              <Clock size={12} /> Coming soon
            </>
          )}
        </span>
        {status === 'available' && (
          <button type="button" className="org-plans-icon-btn" onClick={onDetails} aria-label="View plan details">
            <Eye size={18} />
          </button>
        )}
      </div>

      <h3 className="org-plans-card-title">{plan.PlanName}</h3>

      <div className="org-plans-price-block">
        <span className="org-plans-price">{formatPrice(plan.Price)}</span>
        <span className="org-plans-duration">/ {formatDuration(plan.DurationMonths)}</span>
      </div>

      {status !== 'coming-soon' && examCount > 0 && (
        <ul className="org-plans-highlights">
          <li>
            <BookOpen size={14} />
            <span>
              <strong>{examCount}</strong> exam{examCount === 1 ? '' : 's'} included
            </span>
          </li>
          {poolTotal > 0 && (
            <li>
              <Sparkles size={14} />
              <span>
                <strong>{poolTotal}</strong> verified platform questions
              </span>
            </li>
          )}
        </ul>
      )}

      {featureEntries.length > 0 && (
        <div className="org-plans-features">
          {featureEntries.slice(0, 4).map(([key, value]) => (
            <span key={key} className="org-plans-feature-tag">
              {value != null && value !== '' ? `${key}: ${String(value)}` : key}
            </span>
          ))}
          {featureEntries.length > 4 && (
            <span className="org-plans-feature-more">+{featureEntries.length - 4} more</span>
          )}
        </div>
      )}

      {status === 'coming-soon' && (
        <p className="org-plans-coming-hint">
          Exams are still being added to this plan. It will appear as available once at least one exam is linked.
        </p>
      )}

      <div className="org-plans-card-footer">
        {status === 'coming-soon' && (
          <button type="button" className="btn-secondary org-plans-cta" disabled>
            <Clock size={16} />
            Coming soon
          </button>
        )}

        {status === 'available' && (
          <>
            <button type="button" className="btn-primary org-plans-cta" onClick={onSubscribe}>
              Subscribe now
            </button>
            <button type="button" className="btn-secondary org-plans-cta-secondary" onClick={onDetails}>
              View details
            </button>
          </>
        )}

        {status === 'subscribed' && (
          <>
            {plan.subscription?.EndDate && (
              <div className="org-plans-valid-until">
                <Calendar size={14} />
                Valid until <strong>{new Date(plan.subscription.EndDate).toLocaleDateString()}</strong>
              </div>
            )}
            {plan.subscription?.AutoRenew && (
              <span className="org-plans-renew-tag">
                <RefreshCw size={12} />
                Auto-renew enabled
              </span>
            )}
            <div className="org-plans-subscribed-actions">
              <button type="button" className="btn-secondary org-plans-cta-secondary" onClick={onDetails}>
                Details
              </button>
              <button type="button" className="org-plans-btn-unsub-text" onClick={onUnsubscribe}>
                Unsubscribe
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

const UnsubscribeConfirmationModal = ({ subscription, plan, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnsubscribe = async () => {
    setError('');
    setLoading(true);
    try {
      await orgDashboard.cancelSubscription(subscription.SubscriptionID);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Unsubscribe error:', err);
      setError(err.message || 'Failed to unsubscribe from the plan');
    } finally {
      setLoading(false);
    }
  };

  const endDate = subscription.EndDate ? new Date(subscription.EndDate) : null;
  const isExpired = endDate && endDate < new Date();

  return (
    <div className="org-plans-modal-overlay" onClick={onClose}>
      <div className="org-plans-modal org-plans-modal--md" onClick={(e) => e.stopPropagation()}>
        <div className="org-plans-modal-header">
          <h2>Unsubscribe from plan</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="org-plans-modal-body">
          <div className="org-plans-unsub-warning">
            <div className="org-plans-unsub-warning-head">
              <AlertTriangle size={22} />
              <h3>Are you sure you want to unsubscribe?</h3>
            </div>
            <p>
              This will cancel your subscription to <strong>{plan?.PlanName || 'this plan'}</strong>.
            </p>
            <ul className="org-plans-unsub-list">
              <li>
                <XCircle size={14} />
                Subscription is cancelled immediately
              </li>
              {!isExpired && endDate && (
                <li>
                  <XCircle size={14} />
                  Access ends after <strong>{endDate.toLocaleDateString()}</strong>
                </li>
              )}
              <li>
                <XCircle size={14} />
                You cannot create new tests for exams on this plan
              </li>
              {subscription.AutoRenew && (
                <li>
                  <XCircle size={14} />
                  Auto-renew will be turned off
                </li>
              )}
            </ul>
            {error && (
              <div className="notice error org-plans-modal-error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="org-plans-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={handleUnsubscribe} disabled={loading}>
            {loading ? 'Unsubscribing…' : 'Yes, unsubscribe'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PlanDetailsModal = ({ plan, onClose }) => {
  const poolTotal =
    plan.VerifiedPlatformQuestionPoolTotal != null
      ? Number(plan.VerifiedPlatformQuestionPoolTotal)
      : (plan.exams || []).reduce((s, e) => s + (Number(e.VerifiedPlatformQuestionCount) || 0), 0);

  return (
    <div className="org-plans-modal-overlay" onClick={onClose}>
      <div className="org-plans-modal org-plans-modal--lg" onClick={(e) => e.stopPropagation()}>
        <div className="org-plans-modal-header">
          <h2>{plan.PlanName}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="org-plans-modal-body">
          <div className="org-plans-detail-summary">
            <div>
              <span className="org-plans-detail-label">Price</span>
              <strong>{formatPrice(plan.Price)}</strong>
            </div>
            <div>
              <span className="org-plans-detail-label">Duration</span>
              <strong>{formatDuration(plan.DurationMonths)}</strong>
            </div>
            <div>
              <span className="org-plans-detail-label">Exams</span>
              <strong>{plan.exams?.length ?? 0}</strong>
            </div>
          </div>

          {poolTotal > 0 && (
            <div className="org-ex-enroll-notice">
              <div className="notice success org-plans-pool-notice">
                <Sparkles size={16} />
                <span>
                  Verified platform question pool: <strong>{poolTotal}</strong> questions across included exams.
                </span>
              </div>
            </div>
          )}

          {plan.Features && Object.keys(plan.Features).length > 0 && (
            <div className="org-plans-detail-block">
              <h4>Plan features</h4>
              <ul className="org-plans-detail-features">
                {Object.entries(plan.Features).map(([key, value]) => (
                  <li key={key}>
                    <Check size={14} />
                    <span>
                      <strong>{key}</strong>
                      {value != null && value !== '' ? `: ${String(value)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.exams?.length > 0 ? (
            <div className="org-plans-detail-block">
              <h4>
                <BookOpen size={16} />
                Included exams ({plan.exams.length})
              </h4>
              <div className="org-plans-exam-list">
                {plan.exams.map((exam) => (
                  <div key={exam.ExamID} className="org-plans-exam-item">
                    <div className="org-plans-exam-item-head">
                      <strong>{exam.ExamName}</strong>
                      <div className="org-plans-exam-badges">
                        {exam.IsMandatory && <span className="org-plans-badge org-plans-badge--req">Required</span>}
                        {exam.AISupport && (
                          <span className="org-plans-badge org-plans-badge--ai">
                            <Sparkles size={10} />
                            AI
                          </span>
                        )}
                      </div>
                    </div>
                    {exam.ExamDescription && (
                      <p className="org-ex-enroll-meta">{exam.ExamDescription}</p>
                    )}
                    <div className="org-plans-exam-limits">
                      <span>Students: {exam.MaxStudents ?? '∞'}</span>
                      <span>Tests: {exam.MaxTests ?? '∞'}</span>
                      <span>Q/test: {exam.MaxQuestionsPerTest ?? '∞'}</span>
                      <span>Pool: {exam.VerifiedPlatformQuestionCount ?? 0} Q</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="org-ex-enroll-panel-hint">No exams linked to this plan yet.</p>
          )}
        </div>
        <div className="org-plans-modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const SubscribeModal = ({ plan, onClose, onSuccess }) => {
  const [autoRenew, setAutoRenew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setError('');
    setLoading(true);
    try {
      await orgDashboard.createSubscription({ planId: plan.PlanID, autoRenew });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + (plan.DurationMonths || 1));

  return (
    <div className="org-plans-modal-overlay" onClick={onClose}>
      <div className="org-plans-modal org-plans-modal--md" onClick={(e) => e.stopPropagation()}>
        <div className="org-plans-modal-header">
          <h2>Subscribe to {plan.PlanName}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="org-plans-modal-body">
          <dl className="org-plans-subscribe-dl">
            <div>
              <dt>Plan</dt>
              <dd>{plan.PlanName}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>{formatPrice(plan.Price)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(plan.DurationMonths)}</dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>{startDate.toLocaleDateString()}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>{endDate.toLocaleDateString()}</dd>
            </div>
            <div>
              <dt>Exams included</dt>
              <dd>{plan.exams?.length ?? 0}</dd>
            </div>
          </dl>

          <label className="org-plans-checkbox">
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
            <span>Enable auto-renew (manage later in Settings)</span>
          </label>

          <div className="org-plans-payment-note">
            <AlertCircle size={16} />
            <p>
              <strong>Payment checkout coming soon.</strong> Confirming now activates this plan on your organization
              account for platform use.
            </p>
          </div>

          {error && (
            <div className="notice error org-plans-modal-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
        <div className="org-plans-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Subscribing…' : 'Confirm subscription'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
