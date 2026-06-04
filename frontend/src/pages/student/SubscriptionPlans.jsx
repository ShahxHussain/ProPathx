import { useState, useEffect } from 'react';
import { DollarSign, Calendar, Package, Check, X, Eye, BookOpen, Sparkles, AlertTriangle, XCircle } from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import '../org/SubscriptionPlans.css';

const SubscriptionPlans = () => {
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      
      // Load plans and subscriptions in parallel
      const [plansResponse, subscriptionsResponse] = await Promise.all([
        studentDashboardAPI.getSubscriptionPlans(),
        studentDashboardAPI.getSubscriptions().catch(() => ({ subscriptions: [] })) // Don't fail if subscriptions fail
      ]);
      
      const plansList = plansResponse.plans || [];
      const subscriptionsList = subscriptionsResponse.subscriptions || [];
      
      // Check which plans are subscribed
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const plansWithSubscriptionStatus = plansList.map((plan) => {
        // Find active subscription for this plan
        const activeSubscription = subscriptionsList.find((sub) => {
          if (sub.PlanID !== plan.PlanID) return false;
          if (sub.Status?.toLowerCase() !== 'active') return false;
          
          // Check if subscription is not expired
          if (!sub.EndDate) return false;
          const endDate = new Date(sub.EndDate);
          if (isNaN(endDate.getTime())) return false;
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          return endDateOnly >= today;
        });
        
        return {
          ...plan,
          subscription: activeSubscription || null,
          isSubscribed: !!activeSubscription,
        };
      });
      
      setPlans(plansWithSubscriptionStatus);
      setSubscriptions(subscriptionsList);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
      setError(err.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const showPlanDetails = (plan) => {
    setSelectedPlanForDetails(plan);
  };

  if (loading) {
    return (
      <div className="org-subscription-plans-container">
        <div className="loading">Loading subscription plans...</div>
      </div>
    );
  }

  return (
    <div className="org-subscription-plans-container">
      <div className="plans-header">
        <div>
          <h1>Available Subscription Plans</h1>
          <p>Plans for individual learners (Student) or both students and organizations (Both). Subscribe with your student account.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="empty-state">
          <Package size={48} className="empty-icon" />
          <h3>No subscription plans available</h3>
          <p>Please contact support for subscription options</p>
        </div>
      ) : (
        <div className="plans-grid-org">
          {plans.map((plan) => {
            const hasExams = plan.exams && plan.exams.length > 0;
            const isAvailable = hasExams;
            
            return (
              <div 
                key={plan.PlanID} 
                className={`plan-card-org ${!isAvailable ? 'plan-unavailable' : ''}`}
              >
                <div className="plan-card-header-org">
                  <div className="plan-title-section-org">
                    <h3>{plan.PlanName}</h3>
                    <div className="plan-pricing-org">
                      <div className="plan-price-main">
                        <DollarSign size={24} />
                        <span className="price-amount">{plan.Price?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="plan-duration-main">
                        <Calendar size={16} />
                        <span>{plan.DurationMonths} {plan.DurationMonths === 1 ? 'month' : 'months'}</span>
                      </div>
                    </div>
                  </div>
                  {isAvailable && (
                    <button
                      className="btn-view-details"
                      onClick={() => showPlanDetails(plan)}
                      aria-label="View plan details"
                    >
                      <Eye size={20} />
                    </button>
                  )}
                </div>

              {plan.Features && Object.keys(plan.Features).length > 0 && (
                <div className="plan-features-preview">
                  {Object.keys(plan.Features).slice(0, 2).map((key) => (
                    <span key={key} className="feature-badge">
                      {key}
                    </span>
                  ))}
                  {Object.keys(plan.Features).length > 2 && (
                    <span className="feature-badge-more">+{Object.keys(plan.Features).length - 2} more</span>
                  )}
                </div>
              )}

              {!isAvailable && (
                <div className="unavailable-message">
                  <Package size={32} className="unavailable-icon" />
                  <p>This plan is not yet available. Exams are being added to this subscription plan.</p>
                </div>
              )}

              <div className="plan-card-footer">
                {!isAvailable ? (
                  <div className="coming-soon-footer">
                    <button
                      className="btn-subscribe btn-subscribe-coming-soon"
                      disabled
                    >
                      <Package size={18} />
                      Coming Soon
                    </button>
                  </div>
                ) : plan.isSubscribed ? (
                  <div className="subscription-status">
                    {plan.subscription && (
                      <div className="subscription-valid-until">
                        <span className="detail-label">Valid until:</span>
                        <span className="detail-value">
                          {new Date(plan.subscription.EndDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="subscription-actions">
                      <div className="subscribed-badge">
                        <Check size={16} />
                        <span>Subscribed</span>
                      </div>
                      <button
                        className="btn-unsubscribe"
                        onClick={() => setSubscriptionToUnsubscribe(plan.subscription)}
                      >
                        <XCircle size={16} />
                        <span>Unsubscribe</span>
                      </button>
                    </div>
                    {plan.subscription && plan.subscription.AutoRenew && (
                      <div className="subscription-detail-item">
                        <span className="auto-renew-badge">Auto-renew enabled</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn-subscribe"
                    onClick={() => setSelectedPlan(plan)}
                  >
                    Subscribe Now
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {selectedPlanForDetails && (
        <PlanDetailsModal
          plan={selectedPlanForDetails}
          onClose={() => setSelectedPlanForDetails(null)}
        />
      )}

      {subscriptionToUnsubscribe && (
        <UnsubscribeConfirmationModal
          subscription={subscriptionToUnsubscribe}
          plan={plans.find(p => p.subscription?.SubscriptionID === subscriptionToUnsubscribe.SubscriptionID)}
          onClose={() => setSubscriptionToUnsubscribe(null)}
          onSuccess={() => {
            loadPlans(); // Reload plans to show updated subscription status
            setSubscriptionToUnsubscribe(null);
          }}
        />
      )}

      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          onClose={() => {
            setSelectedPlan(null);
            loadPlans(); // Reload plans when modal closes
          }}
          onSuccess={() => {
            loadPlans(); // Reload plans to show updated subscription status
            setSelectedPlan(null);
          }}
        />
      )}
    </div>
  );
};

// Unsubscribe Confirmation Modal Component
const UnsubscribeConfirmationModal = ({ subscription, plan, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnsubscribe = async () => {
    setError('');
    setLoading(true);

    try {
      await studentDashboardAPI.cancelSubscription(subscription.SubscriptionID);
      
      if (onSuccess) {
        onSuccess();
      }
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-medium" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Unsubscribe from Plan</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="unsubscribe-warning">
            <div className="warning-header">
              <AlertTriangle size={24} className="warning-icon" />
              <h3>Are you sure you want to unsubscribe?</h3>
            </div>
            
            <div className="warning-content">
              <p className="warning-text">
                This action will cancel your subscription to <strong>{plan?.PlanName || 'this plan'}</strong>.
              </p>

              <div className="warning-consequences">
                <h4>What will happen:</h4>
                <ul className="consequences-list">
                  <li>
                    <XCircle size={16} />
                    <span>Your subscription will be <strong>immediately cancelled</strong></span>
                  </li>
                  {!isExpired && endDate && (
                    <li>
                      <XCircle size={16} />
                      <span>You will <strong>lose access</strong> to all plan features and exams after <strong>{endDate.toLocaleDateString()}</strong></span>
                    </li>
                  )}
                  {isExpired && (
                    <li>
                      <XCircle size={16} />
                      <span>Your subscription has already expired, but this will prevent any future renewals</span>
                    </li>
                  )}
                  <li>
                    <XCircle size={16} />
                    <span>You may <strong>lose access</strong> to features and exams tied to this plan</span>
                  </li>
                  <li>
                    <XCircle size={16} />
                    <span>Assignments from your school (if any) are <strong>unchanged</strong></span>
                  </li>
                  {subscription.AutoRenew && (
                    <li>
                      <XCircle size={16} />
                      <span>Auto-renewal will be <strong>disabled</strong></span>
                    </li>
                  )}
                  <li>
                    <XCircle size={16} />
                    <span>You can <strong>resubscribe</strong> to a plan later from this page</span>
                  </li>
                </ul>
              </div>

              {subscription.AutoRenew && (
                <div className="auto-renew-note">
                  <AlertTriangle size={16} />
                  <p>
                    <strong>Note:</strong> Auto-renewal is currently enabled. 
                    Unsubscribing will disable it permanently.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="notice error" style={{ marginTop: '1rem' }}>
                {error}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button 
            type="button" 
            className="btn-danger" 
            onClick={handleUnsubscribe} 
            disabled={loading}
          >
            {loading ? 'Unsubscribing...' : 'Yes, Unsubscribe'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Plan Details Modal Component
const PlanDetailsModal = ({ plan, onClose }) => {
  const poolTotal =
    plan.VerifiedPlatformQuestionPoolTotal != null && plan.VerifiedPlatformQuestionPoolTotal !== undefined
      ? Number(plan.VerifiedPlatformQuestionPoolTotal)
      : (plan.exams || []).reduce((s, e) => s + (Number(e.VerifiedPlatformQuestionCount) || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{plan.PlanName} - Details</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="plan-details-modal-content">
            <div className="plan-summary-section">
              <div className="summary-item">
                <span className="summary-label">Price:</span>
                <span className="summary-value">
                  <DollarSign size={16} />
                  {plan.Price?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Duration:</span>
                <span className="summary-value">
                  <Calendar size={16} />
                  {plan.DurationMonths} {plan.DurationMonths === 1 ? 'month' : 'months'}
                </span>
              </div>
            </div>

            {plan.exams && plan.exams.length > 0 && (
              <div className="plan-pool-summary">
                <p className="plan-pool-summary-text">
                  <strong>Verified platform question pool:</strong> {poolTotal} question
                  {poolTotal === 1 ? '' : 's'} across the included exams (shared catalog — verified, platform-wide).
                </p>
              </div>
            )}

            {plan.Features && Object.keys(plan.Features).length > 0 && (
              <div className="plan-features-full">
                <h4>Features</h4>
                <ul>
                  {Object.entries(plan.Features).map(([key, value]) => (
                    <li key={key}>
                      <Check size={16} className="check-icon" />
                      <strong>{key}:</strong> {String(value)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.exams && plan.exams.length > 0 ? (
              <div className="plan-exams-section">
                <h4>
                  <BookOpen size={18} />
                  Included Exams ({plan.exams.length})
                </h4>
                <div className="exams-list">
                  {plan.exams.map((exam, idx) => (
                    <div key={exam.ExamID || idx} className="exam-item-org">
                      <div className="exam-item-header">
                        <span className="exam-name">{exam.ExamName}</span>
                        <div className="exam-badges">
                          {exam.IsMandatory && (
                            <span className="badge badge-mandatory" title="Mandatory Exam">
                              Required
                            </span>
                          )}
                          {exam.AISupport && (
                            <span className="badge badge-ai" title="AI Support Enabled">
                              <Sparkles size={12} />
                              AI
                            </span>
                          )}
                        </div>
                      </div>
                      {exam.ExamDescription && (
                        <p className="exam-description">{exam.ExamDescription}</p>
                      )}
                      <div className="exam-limits-grid">
                        <div className="limit-box">
                          <span className="limit-label">Max Students</span>
                          <span className="limit-value">{exam.MaxStudents || 'Unlimited'}</span>
                        </div>
                        <div className="limit-box">
                          <span className="limit-label">Max Tests</span>
                          <span className="limit-value">{exam.MaxTests || 'Unlimited'}</span>
                        </div>
                        <div className="limit-box">
                          <span className="limit-label">Max Q/Test</span>
                          <span className="limit-value">{exam.MaxQuestionsPerTest || 'Unlimited'}</span>
                        </div>
                        <div className="limit-box">
                          <span className="limit-label">Max Tests/Day</span>
                          <span className="limit-value">{exam.MaxTestsPerDay || 'Unlimited'}</span>
                        </div>
                        <div className="limit-box">
                          <span
                            className="limit-label"
                            title="Verified questions in the platform catalog for this exam (used for practice and self-tests)"
                          >
                            Platform pool (questions)
                          </span>
                          <span className="limit-value">{exam.VerifiedPlatformQuestionCount ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="no-exams">
                <p>No exams included in this plan</p>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Subscribe Modal Component
const SubscribeModal = ({ plan, onClose, onSuccess }) => {
  const [autoRenew, setAutoRenew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setError('');
    setLoading(true);

    try {
      await studentDashboardAPI.createSubscription({
        planId: plan.PlanID,
        autoRenew,
      });
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  };

  // Calculate end date
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + (plan.DurationMonths || 1));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-medium" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Subscribe to {plan.PlanName}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="subscribe-summary">
            <div className="summary-row">
              <span className="summary-label">Plan:</span>
              <span className="summary-value">{plan.PlanName}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Price:</span>
              <span className="summary-value">
                <DollarSign size={16} />
                {plan.Price?.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Duration:</span>
              <span className="summary-value">
                {plan.DurationMonths} {plan.DurationMonths === 1 ? 'month' : 'months'}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Start Date:</span>
              <span className="summary-value">{startDate.toLocaleDateString()}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">End Date:</span>
              <span className="summary-value">{endDate.toLocaleDateString()}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Included Exams:</span>
              <span className="summary-value">{plan.exams?.length || 0} exams</span>
            </div>
          </div>

          <div className="subscribe-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
              />
              <span>Auto-renew subscription</span>
            </label>
          </div>

          {error && (
            <div className="notice error" style={{ marginTop: '1rem' }}>
              {error}
            </div>
          )}

          <div className="subscribe-note">
            <p>
              <strong>Note:</strong> By subscribing, you agree to the terms and conditions. 
              Your subscription will be activated immediately upon confirmation.
            </p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Subscribing...' : 'Confirm Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
