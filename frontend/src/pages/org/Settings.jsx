import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  UserCheck,
  Shield,
  Package,
  Save,
  ExternalLink,
  Users,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Inbox,
  Calendar,
  DollarSign,
  RefreshCw,
  BookOpen,
  Sparkles,
  Check,
  Hash,
} from 'lucide-react';
import { orgSettingsAPI } from '../../services/api';
import './OrgStudentExamEnrollments.css';
import './Students.css';
import './QuestionBank.css';
import './Settings.css';

const STUDENT_AUTO_MODE = 'auto_student_requests';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(d);
  }
}

function fmtLimit(n) {
  return n == null || n === '' ? 'Unlimited' : String(n);
}

function fmtPrice(price) {
  if (price == null || Number.isNaN(Number(price))) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(price));
}

const APPROVAL_MODE_OPTIONS = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'All enrollments stay Pending until you approve in Pending requests.',
  },
  {
    value: 'auto_direct_assign',
    label: 'Auto-approve direct assign',
    description: 'Bulk assign and per-student activate approve immediately.',
  },
  {
    value: 'auto_student_requests',
    label: 'Auto-approve student requests',
    description: 'Student-submitted requests are Approved without your review.',
  },
];

const Settings = () => {
  const [tab, setTab] = useState('enrollment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [allowStudentRequests, setAllowStudentRequests] = useState(true);
  const [enrollmentApprovalMode, setEnrollmentApprovalMode] = useState('auto_direct_assign');
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [subscriptionData, setSubscriptionData] = useState(null);
  const [autoRenewSaving, setAutoRenewSaving] = useState(false);
  const [counts, setCounts] = useState({ students: 0, pendingEnrollments: 0 });

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await orgSettingsAPI.getSettings();
      setAllowStudentRequests(data.enrollment?.allowStudentRequests !== false);
      setEnrollmentApprovalMode(
        data.enrollment?.enrollmentApprovalMode || 'auto_direct_assign'
      );
      setFullName(data.account?.fullName || '');
      setAccountEmail(data.account?.email || '');
      setSubscriptionData(data.subscription || null);
      setCounts(data.counts || { students: 0, pendingEnrollments: 0 });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!allowStudentRequests) {
      setEnrollmentApprovalMode((mode) =>
        mode === STUDENT_AUTO_MODE ? 'auto_direct_assign' : mode
      );
    }
  }, [allowStudentRequests]);

  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const handleSaveEnrollment = async () => {
    const modeToSave =
      !allowStudentRequests && enrollmentApprovalMode === STUDENT_AUTO_MODE
        ? 'auto_direct_assign'
        : enrollmentApprovalMode;

    try {
      setEnrollmentSaving(true);
      setError('');
      await orgSettingsAPI.updateEnrollment({
        allowStudentRequests,
        enrollmentApprovalMode: modeToSave,
      });
      if (modeToSave !== enrollmentApprovalMode) {
        setEnrollmentApprovalMode(modeToSave);
      }
      setSuccess('Enrollment settings saved');
    } catch (err) {
      setError(err.message || 'Failed to save enrollment settings');
    } finally {
      setEnrollmentSaving(false);
    }
  };

  const handleSaveAccount = async () => {
    try {
      setAccountSaving(true);
      setError('');
      await orgSettingsAPI.updateAccount({ fullName: fullName.trim() });
      setSuccess('Display name updated');
    } catch (err) {
      setError(err.message || 'Failed to update account');
    } finally {
      setAccountSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    try {
      setPasswordSaving(true);
      setError('');
      await orgSettingsAPI.updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const activePlan = subscriptionData?.active;
  const planDetails = subscriptionData?.plan;
  const usageTotals = subscriptionData?.usageTotals;
  const subscriptionHistoryCount = subscriptionData?.subscriptionHistoryCount ?? 0;

  const handleAutoRenewChange = async (next) => {
    try {
      setAutoRenewSaving(true);
      setError('');
      await orgSettingsAPI.updateSubscriptionAutoRenew(next);
      setSubscriptionData((prev) =>
        prev?.active
          ? { ...prev, active: { ...prev.active, autoRenew: next } }
          : prev
      );
      setSuccess(next ? 'Auto-renew enabled' : 'Auto-renew disabled');
    } catch (err) {
      setError(err.message || 'Failed to update auto-renew');
    } finally {
      setAutoRenewSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="org-ex-enroll-page org-settings-page">
        <div className="page-header org-ex-enroll-header">
          <div>
            <h1>
              <SettingsIcon size={28} className="org-ex-enroll-title-icon" aria-hidden />
              Settings
            </h1>
            <p className="page-subtitle">Organization preferences</p>
          </div>
        </div>
        <div className="org-ex-enroll-loading">
          <Loader2 className="spin-icon" size={22} />
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="org-ex-enroll-page org-settings-page">
      <div className="page-header org-ex-enroll-header">
        <div>
          <h1>
            <SettingsIcon size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Settings
          </h1>
          <p className="page-subtitle">
            Configure enrollment rules for your organization, manage your OrgAdmin account, and view subscription usage.
            Changes to enrollment apply to new assignments and student requests.
          </p>
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
      {success && (
        <div className="org-ex-enroll-notice" role="status">
          <div className="notice success org-settings-notice-success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        </div>
      )}

      <div className="org-ex-enroll-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'enrollment'}
          className={`org-ex-enroll-tab ${tab === 'enrollment' ? 'active' : ''}`}
          onClick={() => setTab('enrollment')}
        >
          <UserCheck size={18} />
          Enrollment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'account'}
          className={`org-ex-enroll-tab ${tab === 'account' ? 'active' : ''}`}
          onClick={() => setTab('account')}
        >
          <Shield size={18} />
          Account &amp; security
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'subscription'}
          className={`org-ex-enroll-tab ${tab === 'subscription' ? 'active' : ''}`}
          onClick={() => setTab('subscription')}
        >
          <Package size={18} />
          Subscription &amp; usage
        </button>
      </div>

      {tab === 'enrollment' && (
        <div className="org-settings-tab-body">
          {counts.pendingEnrollments > 0 && (
            <div className="org-ex-enroll-notice">
              <div className="notice warn">
                <Inbox size={18} />
                <span>
                  {counts.pendingEnrollments} pending enrollment
                  {counts.pendingEnrollments === 1 ? '' : 's'} waiting for review.{' '}
                  <Link to="/org/student-exam-enrollments">Open Pending requests</Link>
                </span>
              </div>
            </div>
          )}

          <div className="org-ex-enroll-panels org-settings-panels-single">
            <div className="org-ex-enroll-panel">
              <h2>Student exam enrollment requests</h2>
              <p className="org-ex-enroll-panel-hint">
                When off, students cannot submit enrollment requests from their portal (direct assign by admins still works).
              </p>

              <div className="org-ex-enroll-toolbar org-settings-segment">
                <button
                  type="button"
                  className={`org-ex-enroll-tab org-settings-segment-btn ${
                    allowStudentRequests ? 'active' : ''
                  }`}
                  onClick={() => setAllowStudentRequests(true)}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`org-ex-enroll-tab org-settings-segment-btn ${
                    !allowStudentRequests ? 'active' : ''
                  }`}
                  onClick={() => setAllowStudentRequests(false)}
                >
                  Off
                </button>
              </div>
            </div>

            <div className="org-ex-enroll-panel">
              <h2>Enrollment approval mode</h2>
              <p className="org-ex-enroll-panel-hint">
                Choose how Pending vs Approved is applied for admin assigns vs student requests. Manual sends everything to Pending requests.
              </p>
              {!allowStudentRequests && (
                <p className="org-settings-mode-disabled-hint">
                  Student-request options are unavailable while student exam enrollment requests are off.
                </p>
              )}

              <ul className="org-ex-enroll-checklist org-settings-mode-list">
                {APPROVAL_MODE_OPTIONS.map((opt) => {
                  const isStudentAuto = opt.value === STUDENT_AUTO_MODE;
                  const optionDisabled = isStudentAuto && !allowStudentRequests;
                  return (
                    <li
                      key={opt.value}
                      className={optionDisabled ? 'org-settings-mode-item--disabled' : ''}
                    >
                      <label
                        className={`org-ex-enroll-check-label ${
                          optionDisabled ? 'org-settings-mode-label--disabled' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="enrollmentApprovalMode"
                          value={opt.value}
                          checked={enrollmentApprovalMode === opt.value}
                          disabled={optionDisabled}
                          onChange={() => {
                            if (!optionDisabled) setEnrollmentApprovalMode(opt.value);
                          }}
                        />
                        <span>
                          <strong>{opt.label}</strong>
                          <span className="org-ex-enroll-meta">{opt.description}</span>
                          {optionDisabled && (
                            <span className="org-ex-enroll-meta org-settings-mode-unavailable">
                              Turn on student exam enrollment requests to use this mode.
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="org-ex-enroll-actions">
            <p className="org-ex-enroll-summary">
              <Clock size={16} aria-hidden />
              Applies to bulk assign, per-student activate, and student request endpoints.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveEnrollment}
              disabled={enrollmentSaving}
            >
              <Save size={16} />
              {enrollmentSaving ? 'Saving…' : 'Save enrollment settings'}
            </button>
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="org-settings-tab-body">
          <div className="org-ex-enroll-panels">
            <div className="org-ex-enroll-panel">
              <h2>Display name</h2>
              <p className="org-ex-enroll-panel-hint">
                OrgAdmin login: <strong>{accountEmail}</strong>
              </p>

              <div className="org-settings-field">
                <label className="org-settings-label" htmlFor="fullName">
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  className="org-settings-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="org-ex-enroll-actions org-settings-panel-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSaveAccount}
                  disabled={accountSaving || !fullName.trim()}
                >
                  {accountSaving ? 'Saving…' : 'Save display name'}
                </button>
              </div>
            </div>

            <div className="org-ex-enroll-panel">
              <h2>Change password</h2>
              <p className="org-ex-enroll-panel-hint">Minimum 8 characters. You will stay signed in after updating.</p>

              <div className="org-settings-field">
                <label className="org-settings-label" htmlFor="currentPassword">
                  Current password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  className="org-settings-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="org-settings-field">
                <label className="org-settings-label" htmlFor="newPassword">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="org-settings-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>
              <div className="org-settings-field">
                <label className="org-settings-label" htmlFor="confirmPassword">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="org-settings-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="org-ex-enroll-actions org-settings-panel-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSavePassword}
                  disabled={
                    passwordSaving || !currentPassword || !newPassword || !confirmPassword
                  }
                >
                  {passwordSaving ? 'Updating…' : 'Change password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'subscription' && (
        <div className="org-settings-tab-body org-settings-subscription">
          <div className="org-settings-sub-toolbar">
            <p className="org-ex-enroll-panel-hint org-settings-sub-toolbar-hint">
              Summary of your active plan, included exams, and usage. Subscribe or change plans on the subscription page.
            </p>
            <Link to="/org/subscription-plans" className="btn-secondary org-settings-plans-link">
              Manage plans
              <ExternalLink size={16} />
            </Link>
          </div>

          {!activePlan ? (
            <div className="org-ex-enroll-panel org-settings-sub-empty">
              <Package size={40} className="org-settings-sub-empty-icon" aria-hidden />
              <h2>No active subscription</h2>
              <p className="org-ex-enroll-panel-hint">
                Subscribe to unlock exams, tests, and student enrollments for your organization.
              </p>
              <Link to="/org/subscription-plans" className="btn-primary">
                View subscription plans
              </Link>
            </div>
          ) : (
            <>
              <div className="org-sub-hero">
                <div className="org-sub-hero-main">
                  <span className="org-sub-hero-label">Current plan</span>
                  <h2 className="org-sub-hero-title">{activePlan.planName}</h2>
                  <div className="org-sub-hero-badges">
                    <span className="org-sub-badge org-sub-badge--active">{activePlan.status}</span>
                    {activePlan.autoRenew ? (
                      <span className="org-sub-badge org-sub-badge--renew">
                        <RefreshCw size={12} />
                        Auto-renew on
                      </span>
                    ) : (
                      <span className="org-sub-badge org-sub-badge--muted">Auto-renew off</span>
                    )}
                    {activePlan.daysRemaining != null && activePlan.daysRemaining >= 0 && (
                      <span
                        className={`org-sub-badge ${
                          activePlan.isExpiringSoon ? 'org-sub-badge--warn' : 'org-sub-badge--muted'
                        }`}
                      >
                        <Clock size={12} />
                        {activePlan.daysRemaining === 0
                          ? 'Expires today'
                          : `${activePlan.daysRemaining} day${activePlan.daysRemaining === 1 ? '' : 's'} left`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="org-sub-hero-price">
                  <span className="org-sub-hero-price-value">{fmtPrice(activePlan.price)}</span>
                  <span className="org-sub-hero-price-meta">
                    per {activePlan.durationMonths || 1} month
                    {activePlan.durationMonths === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="org-sub-details-grid">
                <div className="org-sub-detail">
                  <Calendar size={16} />
                  <div>
                    <span className="org-sub-detail-label">Started</span>
                    <strong>{fmtDate(activePlan.startDate)}</strong>
                  </div>
                </div>
                <div className="org-sub-detail">
                  <Calendar size={16} />
                  <div>
                    <span className="org-sub-detail-label">Valid until</span>
                    <strong>{fmtDate(activePlan.endDate)}</strong>
                  </div>
                </div>
                <div className="org-sub-detail">
                  <CheckCircle2 size={16} />
                  <div>
                    <span className="org-sub-detail-label">Activated</span>
                    <strong>{fmtDate(activePlan.activatedAt)}</strong>
                  </div>
                </div>
                <div className="org-sub-detail">
                  <DollarSign size={16} />
                  <div>
                    <span className="org-sub-detail-label">Billing cycle</span>
                    <strong>
                      {activePlan.durationMonths || 1} month
                      {activePlan.durationMonths === 1 ? '' : 's'}
                    </strong>
                  </div>
                </div>
                <div className="org-sub-detail">
                  <Users size={16} />
                  <div>
                    <span className="org-sub-detail-label">Students in org</span>
                    <strong>{counts.students}</strong>
                  </div>
                </div>
                <div className="org-sub-detail">
                  <Hash size={16} />
                  <div>
                    <span className="org-sub-detail-label">Past subscriptions</span>
                    <strong>{subscriptionHistoryCount}</strong>
                  </div>
                </div>
              </div>

              <div className="org-ex-enroll-panels org-settings-panels-single">
                <div className="org-ex-enroll-panel">
                  <h2>Auto-renew</h2>
                  <p className="org-ex-enroll-panel-hint">
                    When on, your plan is set to renew at the end of each billing period (payment integration coming soon).
                  </p>
                  <div className="org-ex-enroll-toolbar org-settings-segment">
                    <button
                      type="button"
                      className={`org-ex-enroll-tab org-settings-segment-btn ${
                        activePlan.autoRenew ? 'active' : ''
                      }`}
                      disabled={autoRenewSaving}
                      onClick={() => handleAutoRenewChange(true)}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      className={`org-ex-enroll-tab org-settings-segment-btn ${
                        !activePlan.autoRenew ? 'active' : ''
                      }`}
                      disabled={autoRenewSaving}
                      onClick={() => handleAutoRenewChange(false)}
                    >
                      Off
                    </button>
                  </div>
                  {autoRenewSaving && (
                    <p className="org-settings-saving-hint">
                      <Loader2 size={14} className="spin-icon" />
                      Updating auto-renew…
                    </p>
                  )}
                </div>

                <div className="org-ex-enroll-panel">
                  <h2>Plan capabilities</h2>
                  {planDetails?.testModes && (
                    <div className="org-sub-mode-badges">
                      {planDetails.testModes.isScheduledEnabled && (
                        <span className="org-sub-mode-badge">Scheduled tests</span>
                      )}
                      {planDetails.testModes.isAdaptiveEnabled && (
                        <span className="org-sub-mode-badge">Adaptive</span>
                      )}
                      {planDetails.testModes.isSelfTestBuilderEnabled && (
                        <span className="org-sub-mode-badge">Self-test builder</span>
                      )}
                      {!planDetails.testModes.isScheduledEnabled &&
                        !planDetails.testModes.isAdaptiveEnabled &&
                        !planDetails.testModes.isSelfTestBuilderEnabled && (
                          <span className="org-ex-enroll-meta">Standard test modes only</span>
                        )}
                    </div>
                  )}
                  {planDetails?.verifiedQuestionPoolTotal != null && (
                    <p className="org-ex-enroll-panel-hint">
                      Verified platform question pool:{' '}
                      <strong>{planDetails.verifiedQuestionPoolTotal}</strong> questions across included exams.
                    </p>
                  )}
                  {planDetails?.features && Object.keys(planDetails.features).length > 0 ? (
                    <ul className="org-sub-features">
                      {Object.entries(planDetails.features).map(([key, value]) => (
                        <li key={key}>
                          <Check size={14} />
                          <span>
                            <strong>{key}</strong>
                            {value != null && value !== '' ? `: ${String(value)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="org-ex-enroll-meta">No extra feature flags on this plan.</p>
                  )}
                </div>
              </div>

              {usageTotals && (
                <div className="org-ex-enroll-panel org-sub-usage-panel">
                  <h2>Usage summary</h2>
                  <p className="org-ex-enroll-panel-hint">Totals tracked for your active subscription.</p>
                  <div className="qb-stats org-settings-qb-stats org-sub-usage-stats">
                    <div className="qb-stat">
                      <span className="qb-stat-label">Enrolled (tracked)</span>
                      <span className="qb-stat-value">{usageTotals.studentsEnrolled}</span>
                    </div>
                    <div className="qb-stat">
                      <span className="qb-stat-label">Tests created</span>
                      <span className="qb-stat-value">{usageTotals.testsCreated}</span>
                    </div>
                    <div className="qb-stat">
                      <span className="qb-stat-label">Tests today</span>
                      <span className="qb-stat-value">{usageTotals.testsCreatedToday}</span>
                    </div>
                    <div className="qb-stat">
                      <span className="qb-stat-label">Student attempts</span>
                      <span className="qb-stat-value">{usageTotals.studentAttempts}</span>
                    </div>
                    <div className="qb-stat">
                      <span className="qb-stat-label">AI questions</span>
                      <span className="qb-stat-value">{usageTotals.aiQuestionsGenerated}</span>
                    </div>
                  </div>
                </div>
              )}

              {planDetails?.exams?.length > 0 && (
                <div className="org-ex-enroll-panel org-sub-exams-panel">
                  <h2>
                    <BookOpen size={18} />
                    Included exams ({planDetails.examCount})
                  </h2>
                  <p className="org-ex-enroll-panel-hint">
                    Per-exam limits from your plan and usage recorded on this subscription.
                  </p>
                  <div className="students-table-container org-sub-exams-table-wrap">
                    <table className="students-table org-sub-exams-table">
                      <thead>
                        <tr>
                          <th>Exam</th>
                          <th>Limits</th>
                          <th>Usage</th>
                          <th>Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planDetails.exams.map((exam) => (
                          <tr key={exam.examId}>
                            <td>
                              <strong>{exam.examName}</strong>
                              {exam.description && (
                                <div className="org-ex-enroll-meta">{exam.description}</div>
                              )}
                            </td>
                            <td className="org-sub-limits-cell">
                              <span>Students: {fmtLimit(exam.maxStudents)}</span>
                              <span>Tests: {fmtLimit(exam.maxTests)}</span>
                              <span>Q/test: {fmtLimit(exam.maxQuestionsPerTest)}</span>
                              <span>Tests/day: {fmtLimit(exam.maxTestsPerDay)}</span>
                            </td>
                            <td className="org-sub-usage-cell">
                              <span>Enrolled: {exam.usage?.studentsEnrolled ?? 0}</span>
                              <span>Tests: {exam.usage?.testsCreated ?? 0}</span>
                              <span>Attempts: {exam.usage?.studentAttempts ?? 0}</span>
                            </td>
                            <td>
                              <div className="org-sub-exam-flags">
                                {exam.isMandatory && (
                                  <span className="org-sub-exam-flag org-sub-exam-flag--req">Required</span>
                                )}
                                {exam.aiSupport && (
                                  <span className="org-sub-exam-flag org-sub-exam-flag--ai">
                                    <Sparkles size={11} />
                                    AI
                                  </span>
                                )}
                                <span className="org-ex-enroll-meta">
                                  Pool: {exam.verifiedQuestionCount ?? 0} Q
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Settings;
