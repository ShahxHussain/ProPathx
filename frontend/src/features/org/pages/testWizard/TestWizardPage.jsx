import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ClipboardList,
  Layers,
  Link2,
  ListChecks,
  CalendarClock,
  FileCheck,
  UserPlus,
  Shuffle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { testAPI, orgDashboard } from '../../../../services/api';
import { TestQuestionsEmbedded } from '../TestQuestions';
import AssignTestModal, { AssignTestPanelEmbedded } from '../../../../components/org/AssignTestPanel';
import { loadWizardDraft, saveWizardDraft, clearWizardDraft } from './testWizardStorage';
import './TestWizard.css';

const STEPS = [
  { id: 1, label: 'Basics', icon: ClipboardList },
  { id: 2, label: 'Binding', icon: Link2 },
  { id: 3, label: 'Questions', icon: ListChecks },
  { id: 4, label: 'Schedule', icon: CalendarClock },
  { id: 5, label: 'Review', icon: FileCheck },
  { id: 6, label: 'Assign', icon: UserPlus },
];

const defaultBasics = () => ({
  testName: '',
  examId: '',
  subscriptionId: '',
  testType: 'Practice',
  durationMinutes: 60,
  totalQuestions: 10,
  totalMarks: 100,
});

export default function TestWizardPage() {
  const navigate = useNavigate();
  const { testId: routeTestId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const step = useMemo(() => {
    const s = parseInt(searchParams.get('step') || '1', 10);
    if (Number.isNaN(s) || s < 1) return 1;
    return Math.min(6, s);
  }, [searchParams]);

  const setStep = useCallback(
    (n) => {
      const next = Math.min(6, Math.max(1, n));
      setSearchParams({ step: String(next) }, { replace: true });
    },
    [setSearchParams]
  );

  const [loadingInit, setLoadingInit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testId, setTestId] = useState(routeTestId || null);

  const [basics, setBasics] = useState(defaultBasics);
  const [bindingType, setBindingType] = useState('custom');
  const [hybridPercent, setHybridPercent] = useState(30);
  const [scheduleMode, setScheduleMode] = useState('open');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const [allExams, setAllExams] = useState([]);
  const [availableExams, setAvailableExams] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [summaryTest, setSummaryTest] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const filterExamsForPlan = useCallback(
    (subscriptionId, planId) => {
      if (!planId || !subscriptionPlans.length || !allExams.length) {
        setAvailableExams(allExams);
        return;
      }
      const plan = subscriptionPlans.find((p) => String(p.PlanID) === String(planId));
      if (!plan?.exams?.length) {
        setAvailableExams(allExams);
        return;
      }
      const ids = new Set(plan.exams.map((e) => e.ExamID).filter(Boolean));
      setAvailableExams(allExams.filter((ex) => ids.has(ex.ExamID)));
    },
    [allExams, subscriptionPlans]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        const [examsRes, subsRes, plansRes] = await Promise.allSettled([
          orgDashboard.exploreExams().catch(() => ({ exams: [] })),
          orgDashboard.getSubscriptions().catch(() => ({ subscriptions: [] })),
          orgDashboard.getSubscriptionPlans().catch(() => ({ plans: [] })),
        ]);
        if (cancelled) return;
        const examsList = examsRes.status === 'fulfilled' ? examsRes.value.exams || [] : [];
        setAllExams(examsList);
        setAvailableExams(examsList);
        const subs = subsRes.status === 'fulfilled' ? subsRes.value.subscriptions || [] : [];
        const now = new Date();
        const active = subs.filter((sub) => {
          if (String(sub.Status || '').toLowerCase() !== 'active') return false;
          if (!sub.EndDate) return false;
          return new Date(sub.EndDate) >= now;
        });
        setSubscriptions(active);
        const plans = plansRes.status === 'fulfilled' ? plansRes.value.plans || [] : [];
        setSubscriptionPlans(plans);
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!basics.subscriptionId || !subscriptions.length || !subscriptionPlans.length || !allExams.length) {
      return;
    }
    const sub = subscriptions.find((s) => s.SubscriptionID === basics.subscriptionId);
    const planId = sub?.PlanID || sub?.SubscriptionPlans?.PlanID;
    filterExamsForPlan(basics.subscriptionId, planId);
  }, [basics.subscriptionId, subscriptions, subscriptionPlans, allExams.length, filterExamsForPlan]);

  useEffect(() => {
    if (testId || !subscriptions.length || basics.subscriptionId) return;
    const first = subscriptions[0];
    setBasics((b) => ({ ...b, subscriptionId: first.SubscriptionID }));
  }, [subscriptions, testId, basics.subscriptionId]);

  useEffect(() => {
    if (routeTestId) {
      setTestId(routeTestId);
      return;
    }
    const draft = loadWizardDraft();
    if (draft?.testId) {
      navigate(`/org/tests/wizard/${draft.testId}?step=${draft.step || 1}`, { replace: true });
    }
  }, [routeTestId, navigate]);

  useEffect(() => {
    if (step !== 6 || !testId || summaryTest) return;
    let cancelled = false;
    testAPI
      .getTestDetails(testId)
      .then((res) => {
        if (!cancelled) setSummaryTest(res.test);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, testId, summaryTest]);

  useEffect(() => {
    if (step > 1 && !testId && !routeTestId) {
      setStep(1);
    }
  }, [step, testId, routeTestId, setStep]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!testId) {
        const draft = loadWizardDraft();
        if (draft?.basics) setBasics((b) => ({ ...defaultBasics(), ...draft.basics }));
        if (draft?.bindingType) setBindingType(draft.bindingType);
        if (draft?.hybridPercent != null) setHybridPercent(draft.hybridPercent);
        if (draft?.scheduleMode) setScheduleMode(draft.scheduleMode);
        if (draft?.scheduleDate) setScheduleDate(draft.scheduleDate);
        if (draft?.scheduleTime) setScheduleTime(draft.scheduleTime);
        setLoadingInit(false);
        return;
      }
      setLoadingInit(true);
      try {
        const res = await testAPI.getTestDetails(testId);
        const t = res.test;
        if (cancelled || !t) return;
        setSummaryTest(t);
        setBasics({
          testName: t.TestName || '',
          examId: t.ExamID || '',
          subscriptionId: t.SubscriptionID || '',
          testType: t.TestType || 'Practice',
          durationMinutes: t.DurationMinutes || 60,
          totalQuestions: t.TotalQuestions ?? 10,
          totalMarks: t.TotalMarks ?? 100,
        });
        const bt = String(t.bindingType || t.QuestionBindingMode || 'custom').toLowerCase();
        setBindingType(['custom', 'auto', 'hybrid'].includes(bt) ? bt : 'custom');
        setHybridPercent(Number(t.HybridAutoPercent ?? t.hybridAutoPercent ?? 30));
        const sm = t.ScheduleMode === 'scheduled' ? 'scheduled' : 'open';
        setScheduleMode(sm);
        if (t.TestDate) {
          const d = String(t.TestDate).split('T')[0];
          setScheduleDate(d);
        }
        if (t.StartTime) {
          const st = t.StartTime;
          if (typeof st === 'string' && st.includes('T')) {
            const dt = new Date(st);
            if (!Number.isNaN(dt.getTime())) {
              setScheduleTime(`${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`);
            }
          } else if (typeof st === 'string' && st.length >= 5) {
            setScheduleTime(st.slice(0, 5));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load test');
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId]);

  useEffect(() => {
    const draft = {
      testId,
      step,
      basics,
      bindingType,
      hybridPercent,
      scheduleMode,
      scheduleDate,
      scheduleTime,
    };
    saveWizardDraft(draft);
  }, [testId, step, basics, bindingType, hybridPercent, scheduleMode, scheduleDate, scheduleTime]);

  const persistBasicsStep = async () => {
    setError('');
    if (!basics.testName?.trim() || !basics.examId || !basics.subscriptionId) {
      setError('Please fill test name, subscription, and exam.');
      return false;
    }
    if (!basics.durationMinutes || basics.totalQuestions < 1) {
      setError('Duration and total questions must be valid.');
      return false;
    }
    setSaving(true);
    try {
      if (!testId) {
        const res = await testAPI.createTest({
          testName: basics.testName.trim(),
          examId: basics.examId,
          subscriptionId: basics.subscriptionId,
          testType: basics.testType,
          durationMinutes: basics.durationMinutes,
          totalQuestions: basics.totalQuestions,
          totalMarks: basics.totalMarks,
          status: 'Inactive',
          questionBindingMode: 'custom',
        });
        const id = res.test?.testId || res.test?.TestID || res.testId;
        if (!id) throw new Error('Create did not return a test id');
        setTestId(id);
        const detail = await testAPI.getTestDetails(id);
        setSummaryTest(detail.test);
        navigate(`/org/tests/wizard/${id}?step=2`, { replace: true });
      } else {
        await testAPI.updateTest(testId, {
          testName: basics.testName.trim(),
          testType: basics.testType,
          durationMinutes: basics.durationMinutes,
          totalQuestions: basics.totalQuestions,
          totalMarks: basics.totalMarks,
        });
        const res = await testAPI.getTestDetails(testId);
        setSummaryTest(res.test);
        setStep(2);
      }
      return true;
    } catch (e) {
      setError(e.message || e.details || 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistBindingStep = async () => {
    if (!testId) return false;
    setSaving(true);
    setError('');
    try {
      await testAPI.setBindingConfig(testId, {
        bindingType,
        autoPercent: bindingType === 'hybrid' ? hybridPercent : 0,
      });
      setStep(3);
      return true;
    } catch (e) {
      setError(e.message || 'Failed to save binding');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistScheduleStep = async () => {
    if (!testId) return false;
    setError('');
    if (scheduleMode === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        setError('Choose date and start time for a scheduled test, or switch to Open availability.');
        return false;
      }
    }
    setSaving(true);
    try {
      const startIso =
        scheduleMode === 'scheduled'
          ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
          : null;
      let endIso = null;
      if (startIso && basics.durationMinutes) {
        endIso = new Date(new Date(startIso).getTime() + basics.durationMinutes * 60 * 1000).toISOString();
      }
      await testAPI.updateTest(testId, {
        scheduleMode: scheduleMode === 'scheduled' ? 'scheduled' : 'open',
        testDate: scheduleMode === 'scheduled' ? scheduleDate : null,
        startTime: scheduleMode === 'scheduled' ? startIso : null,
        endTime: scheduleMode === 'scheduled' ? endIso : null,
      });
      const res = await testAPI.getTestDetails(testId);
      setSummaryTest(res.test);
      setStep(5);
      return true;
    } catch (e) {
      setError(e.message || 'Failed to save schedule');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const activateTest = async () => {
    if (!testId) return;
    setSaving(true);
    setError('');
    try {
      await testAPI.updateTest(testId, { status: 'Active' });
      const res = await testAPI.getTestDetails(testId);
      setSummaryTest(res.test);
    } catch (e) {
      setError(e.message || 'Could not activate');
    } finally {
      setSaving(false);
    }
  };

  const exitWizard = () => {
    if (window.confirm('Leave the wizard? Your progress is saved in this browser until you clear it.')) {
      navigate('/org/tests');
    }
  };

  const finishClear = () => {
    clearWizardDraft();
    navigate('/org/tests');
  };

  if (loadingInit && testId) {
    return (
      <div className="tw-page">
        <div className="tw-loading">
          <Loader2 className="tw-spin" size={32} />
          <p>Loading test…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-page">
      <header className="tw-header">
        <button type="button" className="tw-back-btn" onClick={exitWizard}>
          <ArrowLeft size={18} />
          Tests
        </button>
        <div className="tw-header-text">
          <h1>Create or edit test</h1>
          <p>One flow: basics → binding → questions → schedule → review → assign. Progress is saved in this browser.</p>
        </div>
      </header>

      <nav className="tw-stepper" aria-label="Wizard steps">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const active = step === s.id;
          const done = step > s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`tw-step ${active ? 'tw-step--active' : ''} ${done ? 'tw-step--done' : ''}`}
              onClick={() => {
                if (!testId && s.id > 1) return;
                if (testId) setStep(s.id);
              }}
              disabled={!testId && s.id > 1}
              title={!testId && s.id > 1 ? 'Complete Basics first' : s.label}
            >
              <span className="tw-step-icon">
                {done ? <CheckCircle size={18} /> : <Icon size={18} />}
              </span>
              <span className="tw-step-label">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="notice error tw-notice">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <main className="tw-main">
        {step === 1 && (
          <section className="tw-card">
            <h2 className="tw-card-title">Basics</h2>
            <p className="tw-card-desc">Name, subscription, exam, duration, and totals. The test is created as inactive until you review.</p>
            {loadingLists ? (
              <p className="tw-muted">Loading subscriptions and exams…</p>
            ) : (
              <form
                className="tw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  persistBasicsStep();
                }}
              >
                <label className="tw-field">
                  <span>Test name *</span>
                  <input
                    value={basics.testName}
                    onChange={(e) => setBasics({ ...basics, testName: e.target.value })}
                    required
                    placeholder="e.g. MDCAT Practice 1"
                  />
                </label>
                <label className="tw-field">
                  <span>Subscription *</span>
                  <select
                    value={basics.subscriptionId}
                    onChange={(e) => setBasics({ ...basics, subscriptionId: e.target.value, examId: '' })}
                    required
                  >
                    <option value="">Select subscription</option>
                    {subscriptions.map((sub) => (
                      <option key={sub.SubscriptionID} value={sub.SubscriptionID}>
                        {(sub.SubscriptionPlans?.PlanName || 'Plan') + ' — ' + new Date(sub.EndDate).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tw-field">
                  <span>Exam *</span>
                  <select
                    value={basics.examId}
                    onChange={(e) => setBasics({ ...basics, examId: e.target.value })}
                    required
                    disabled={!basics.subscriptionId}
                  >
                    <option value="">{basics.subscriptionId ? 'Select exam' : 'Select subscription first'}</option>
                    {availableExams.map((ex) => (
                      <option key={ex.ExamID} value={ex.ExamID}>
                        {ex.ExamName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tw-field">
                  <span>Test type *</span>
                  <select
                    value={basics.testType}
                    onChange={(e) => setBasics({ ...basics, testType: e.target.value })}
                  >
                    <option value="Practice">Practice</option>
                    <option value="Mock">Mock</option>
                    <option value="Final">Final</option>
                  </select>
                </label>
                <div className="tw-field-row">
                  <label className="tw-field">
                    <span>Duration (min) *</span>
                    <input
                      type="number"
                      min={1}
                      value={basics.durationMinutes}
                      onChange={(e) => setBasics({ ...basics, durationMinutes: parseInt(e.target.value, 10) || 0 })}
                    />
                  </label>
                  <label className="tw-field">
                    <span>Total questions *</span>
                    <input
                      type="number"
                      min={1}
                      value={basics.totalQuestions}
                      onChange={(e) => setBasics({ ...basics, totalQuestions: parseInt(e.target.value, 10) || 0 })}
                    />
                  </label>
                  <label className="tw-field">
                    <span>Total marks *</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={basics.totalMarks}
                      onChange={(e) => setBasics({ ...basics, totalMarks: parseFloat(e.target.value) || 0 })}
                    />
                  </label>
                </div>
                <div className="tw-wizard-actions">
                  <button type="button" className="btn-secondary" onClick={exitWizard}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save & continue'}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {step === 2 && testId && (
          <section className="tw-card">
            <h2 className="tw-card-title">Question binding mode</h2>
            <p className="tw-card-desc">How should questions be attached to this test? You can change this later from the standalone Questions page too.</p>
            <div className="tw-binding-grid">
              <button
                type="button"
                className={`tw-binding-card ${bindingType === 'custom' ? 'tw-binding-card--on' : ''}`}
                onClick={() => setBindingType('custom')}
              >
                <ListChecks size={28} />
                <strong>Custom</strong>
                <span>You choose every question from your bank.</span>
              </button>
              <button
                type="button"
                className={`tw-binding-card ${bindingType === 'auto' ? 'tw-binding-card--on' : ''}`}
                onClick={() => setBindingType('auto')}
              >
                <Shuffle size={28} />
                <strong>Auto</strong>
                <span>Random platform questions at attempt time.</span>
              </button>
              <button
                type="button"
                className={`tw-binding-card ${bindingType === 'hybrid' ? 'tw-binding-card--on' : ''}`}
                onClick={() => setBindingType('hybrid')}
              >
                <Layers size={28} />
                <strong>Hybrid</strong>
                <span>Mix of auto-drawn and your hand-picked questions.</span>
              </button>
            </div>
            {bindingType === 'hybrid' && (
              <div className="tw-hybrid">
                <label>
                  Auto share (random) — custom is the rest ({100 - hybridPercent}%)
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={hybridPercent}
                    onChange={(e) => setHybridPercent(Number(e.target.value))}
                  />
                </label>
                <p className="tw-muted">
                  About <strong>{Math.round((hybridPercent / 100) * basics.totalQuestions)}</strong> auto and{' '}
                  <strong>{Math.round(((100 - hybridPercent) / 100) * basics.totalQuestions)}</strong> from your bank
                  (approximate split for a {basics.totalQuestions}-question paper).
                </p>
              </div>
            )}
            <div className="tw-wizard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)} disabled={saving}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={persistBindingStep} disabled={saving}>
                {saving ? 'Saving…' : 'Continue'}
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {step === 3 && testId && (
          <section className="tw-card tw-card--stretch">
            <h2 className="tw-card-title">Question build</h2>
            {bindingType === 'auto' && (
              <div className="tw-auto-block">
                <p>
                  <strong>Auto mode:</strong> you do not attach questions here. At attempt time the platform draws random
                  questions for <em>{summaryTest?.Exams?.ExamName || 'this exam'}</em>. Ensure total questions and marks
                  in Basics match what you want.
                </p>
                <ul className="tw-checklist">
                  <li>Total questions: {basics.totalQuestions}</li>
                  <li>Duration: {basics.durationMinutes} min</li>
                </ul>
              </div>
            )}
            {bindingType === 'hybrid' && (
              <div className="tw-hybrid-banner">
                <strong>Hybrid:</strong> roughly {Math.round((hybridPercent / 100) * basics.totalQuestions)} questions
                will be auto-drawn; add the rest ({Math.round(((100 - hybridPercent) / 100) * basics.totalQuestions)}-ish)
                below from your bank.
              </div>
            )}
            {(bindingType === 'custom' || bindingType === 'hybrid') && (
              <div className="tw-embed-wrap">
                <TestQuestionsEmbedded testId={testId} />
              </div>
            )}
            <div className="tw-wizard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep(4)}>
                Continue to schedule
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {step === 4 && testId && (
          <section className="tw-card">
            <h2 className="tw-card-title">Schedule</h2>
            <p className="tw-card-desc">
              <strong>Open availability</strong> means assigned students can start anytime while the test is active.{' '}
              <strong>One-time scheduled</strong> means a specific start window.
            </p>
            <div className="tw-schedule-toggle">
              <label className={scheduleMode === 'open' ? 'tw-radio tw-radio--active' : 'tw-radio'}>
                <input
                  type="radio"
                  name="sched"
                  checked={scheduleMode === 'open'}
                  onChange={() => setScheduleMode('open')}
                />
                Open availability
              </label>
              <label className={scheduleMode === 'scheduled' ? 'tw-radio tw-radio--active' : 'tw-radio'}>
                <input
                  type="radio"
                  name="sched"
                  checked={scheduleMode === 'scheduled'}
                  onChange={() => setScheduleMode('scheduled')}
                />
                One-time scheduled start
              </label>
            </div>
            {scheduleMode === 'scheduled' && (
              <div className="tw-field-row">
                <label className="tw-field">
                  <span>Date *</span>
                  <input
                    type="date"
                    value={scheduleDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </label>
                <label className="tw-field">
                  <span>Start time *</span>
                  <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                </label>
              </div>
            )}
            <div className="tw-wizard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(3)}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={persistScheduleStep} disabled={saving}>
                {saving ? 'Saving…' : 'Continue to review'}
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {step === 5 && testId && (
          <section className="tw-card">
            <h2 className="tw-card-title">Review</h2>
            <dl className="tw-review">
              <div>
                <dt>Name</dt>
                <dd>{basics.testName}</dd>
              </div>
              <div>
                <dt>Binding</dt>
                <dd>
                  {bindingType}
                  {bindingType === 'hybrid' ? ` (${hybridPercent}% auto)` : ''}
                </dd>
              </div>
              <div>
                <dt>Paper</dt>
                <dd>
                  {basics.totalQuestions} questions · {basics.durationMinutes} min · {basics.totalMarks} marks
                </dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>
                  {scheduleMode === 'open'
                    ? 'Open availability'
                    : `${scheduleDate} ${scheduleTime} (start)`}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{summaryTest?.Status || 'Inactive'}</dd>
              </div>
            </dl>
            <div className="tw-review-actions">
              <button type="button" className="btn-secondary" onClick={activateTest} disabled={saving}>
                {saving ? '…' : 'Set to Active'}
              </button>
              <p className="tw-muted">Students only see active tests. You can activate later from the Tests list.</p>
            </div>
            <div className="tw-wizard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(4)}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={() => setStep(6)}>
                Continue to assign
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {step === 6 && testId && (
          <>
            {!summaryTest ? (
              <section className="tw-card">
                <p className="tw-muted">Loading test summary…</p>
              </section>
            ) : (
              <section className="tw-card">
                <h2 className="tw-card-title">Assign</h2>
                <p className="tw-card-desc">
                  Assign to students or groups with an optional due date. You can always return from Tests → Assign.
                </p>
                <AssignTestPanelEmbedded test={summaryTest} canonicalTestId={testId} onAssigned={() => {}} />
                <div className="tw-wizard-actions tw-wizard-actions--footer">
                  <button type="button" className="btn-secondary" onClick={() => setStep(5)}>
                    Back
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setShowAssignModal(true)}>
                    Open full assign dialog
                  </button>
                  <button type="button" className="btn-secondary" onClick={finishClear}>
                    Done — go to Tests
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {showAssignModal && summaryTest && (
        <AssignTestModal
          test={summaryTest}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}
