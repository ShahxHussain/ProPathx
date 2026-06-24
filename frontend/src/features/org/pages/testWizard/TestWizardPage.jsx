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

const STEP_ORDER_HINT = 'Basics → Binding → Questions → Schedule → Review → Assign';

function getStepBlockReason(targetStep, maxCompletedStep, summaryTest, testId) {
  if (targetStep <= 1) return null;
  if (!testId) return 'Create the test in Basics first.';
  const prevStep = targetStep - 1;
  if (maxCompletedStep < prevStep) {
    const labels = ['', 'Basics', 'Binding', 'Questions', 'Schedule', 'Review'];
    return `Complete ${labels[prevStep] || 'the previous step'} before continuing.`;
  }
  if (targetStep === 6) {
    if (maxCompletedStep < 5) return 'Review the test and set it to Active before assigning.';
    if (summaryTest?.Status !== 'Active') return 'Set the test to Active on the Review step before assigning.';
  }
  return null;
}

function getMaxAccessibleStep(maxCompletedStep, summaryTest) {
  let max = Math.min(6, maxCompletedStep + 1);
  if (max >= 6 && summaryTest?.Status !== 'Active') max = 5;
  return max;
}

function validateQuestionsStep(test, bindingType, hybridPercent, basics) {
  const linked = (test?.questions || []).length;
  const totalQ = Number(basics.totalQuestions ?? test?.TotalQuestions ?? 0);
  if (bindingType === 'auto') {
    if (totalQ < 1) return { valid: false, message: 'Set total questions in Basics (at least 1).' };
    return { valid: true };
  }
  if (bindingType === 'custom') {
    if (linked < totalQ) {
      return {
        valid: false,
        message: `Link all ${totalQ} question(s) before continuing (${linked} of ${totalQ} linked).`,
      };
    }
    return { valid: true };
  }
  if (bindingType === 'hybrid') {
    const customNeeded = Math.max(1, Math.ceil(((100 - hybridPercent) / 100) * totalQ));
    if (linked < customNeeded) {
      return {
        valid: false,
        message: `Add at least ${customNeeded} question(s) for the custom portion (${linked} linked).`,
      };
    }
    return { valid: true };
  }
  return { valid: true };
}

function inferMaxCompletedStepFromTest(test, bindingType, hybridPercent, basics) {
  if (!test) return 0;
  let max = 1;
  if (test.QuestionBindingMode || bindingType) max = 2;
  if (validateQuestionsStep(test, bindingType, hybridPercent, basics).valid) max = 3;
  if (test.Status === 'Active') max = 5;
  return max;
}

const defaultBasics = () => ({
  testName: '',
  examId: '',
  subscriptionId: '',
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

  const [subscriptions, setSubscriptions] = useState([]);
  const [availableExams, setAvailableExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);

  const [summaryTest, setSummaryTest] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [maxCompletedStep, setMaxCompletedStep] = useState(0);

  const maxAccessibleStep = useMemo(
    () => getMaxAccessibleStep(maxCompletedStep, summaryTest),
    [maxCompletedStep, summaryTest]
  );

  const requestStepChange = useCallback(
    (targetStep, { alertUser = false } = {}) => {
      const next = Math.min(6, Math.max(1, targetStep));
      const reason = getStepBlockReason(next, maxCompletedStep, summaryTest, testId);
      if (reason) {
        const msg = `${reason} (${STEP_ORDER_HINT})`;
        setError(msg);
        if (alertUser) window.alert(msg);
        return false;
      }
      setError('');
      setStep(next);
      return true;
    },
    [maxCompletedStep, summaryTest, testId, setStep]
  );

  const showSubscriptionPicker = subscriptions.length > 1;
  const singleSubscription = subscriptions.length === 1 ? subscriptions[0] : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        const subsRes = await orgDashboard.getSubscriptions().catch(() => ({ subscriptions: [] }));
        if (cancelled) return;
        const subs = subsRes.subscriptions || [];
        const now = new Date();
        const active = subs.filter((sub) => {
          if (String(sub.Status || '').toLowerCase() !== 'active') return false;
          if (!sub.EndDate) return false;
          return new Date(sub.EndDate) >= now;
        });
        setSubscriptions(active);
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!basics.subscriptionId) {
      setAvailableExams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingExams(true);
      try {
        const res = await orgDashboard.getSubscriptionExams({ subscriptionId: basics.subscriptionId });
        if (!cancelled) setAvailableExams(res.exams || []);
      } catch {
        if (!cancelled) setAvailableExams([]);
      } finally {
        if (!cancelled) setLoadingExams(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basics.subscriptionId]);

  useEffect(() => {
    if (testId || !singleSubscription) return;
    const onlyId = singleSubscription.SubscriptionID;
    setBasics((b) => {
      if (b.subscriptionId === onlyId) return b;
      return { ...b, subscriptionId: onlyId, examId: '' };
    });
  }, [singleSubscription, testId]);

  useEffect(() => {
    if (!basics.examId || !availableExams.length) return;
    if (!availableExams.some((e) => e.ExamID === basics.examId)) {
      setBasics((b) => ({ ...b, examId: '' }));
    }
  }, [basics.examId, availableExams]);

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
    if (step !== 5 || !testId) return;
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
  }, [step, testId]);

  useEffect(() => {
    if ((step === 5 || step === 6) && testId && !summaryTest) {
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
    }
  }, [step, testId, summaryTest]);

  useEffect(() => {
    if (loadingInit || loadingLists) return;
    if (step > 1 && !testId) {
      setStep(1);
      return;
    }
    const reason = getStepBlockReason(step, maxCompletedStep, summaryTest, testId);
    if (reason) {
      const fallback = Math.max(1, Math.min(step - 1, maxAccessibleStep));
      setError(`${reason} (${STEP_ORDER_HINT})`);
      setStep(fallback);
    }
  }, [step, testId, maxCompletedStep, summaryTest, loadingInit, loadingLists, maxAccessibleStep, setStep]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!testId) {
        const draft = loadWizardDraft();
        if (draft?.basics) {
          const merged = { ...defaultBasics(), ...draft.basics };
          if (!merged.subscriptionId) merged.examId = '';
          setBasics(merged);
        }
        if (draft?.bindingType) setBindingType(draft.bindingType);
        if (draft?.hybridPercent != null) setHybridPercent(draft.hybridPercent);
        if (draft?.scheduleMode) setScheduleMode(draft.scheduleMode);
        if (draft?.scheduleDate) setScheduleDate(draft.scheduleDate);
        if (draft?.scheduleTime) setScheduleTime(draft.scheduleTime);
        if (typeof draft?.maxCompletedStep === 'number') setMaxCompletedStep(draft.maxCompletedStep);
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
          durationMinutes: t.DurationMinutes || 60,
          totalQuestions: t.TotalQuestions ?? 10,
          totalMarks: t.TotalMarks ?? 100,
        });
        const bt = String(t.bindingType || t.QuestionBindingMode || 'custom').toLowerCase();
        const loadedBinding = ['custom', 'auto', 'hybrid'].includes(bt) ? bt : 'custom';
        const loadedHybrid = Number(t.HybridAutoPercent ?? t.hybridAutoPercent ?? 30);
        setBindingType(loadedBinding);
        setHybridPercent(loadedHybrid);
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
        const draft = loadWizardDraft();
        const draftMax =
          draft?.testId === testId && typeof draft.maxCompletedStep === 'number' ? draft.maxCompletedStep : 0;
        const inferred = inferMaxCompletedStepFromTest(t, loadedBinding, loadedHybrid, {
          totalQuestions: t.TotalQuestions ?? 10,
        });
        setMaxCompletedStep(Math.max(draftMax, inferred));
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
      maxCompletedStep,
      basics,
      bindingType,
      hybridPercent,
      scheduleMode,
      scheduleDate,
      scheduleTime,
    };
    saveWizardDraft(draft);
  }, [testId, step, maxCompletedStep, basics, bindingType, hybridPercent, scheduleMode, scheduleDate, scheduleTime]);

  const persistBasicsStep = async () => {
    setError('');
    if (!basics.testName?.trim() || !basics.examId || !basics.subscriptionId) {
      setError(
        showSubscriptionPicker
          ? 'Please fill test name, subscription, and exam.'
          : 'Please fill test name and exam.'
      );
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
        setMaxCompletedStep(1);
        navigate(`/org/tests/wizard/${id}?step=2`, { replace: true });
      } else {
        await testAPI.updateTest(testId, {
          testName: basics.testName.trim(),
          durationMinutes: basics.durationMinutes,
          totalQuestions: basics.totalQuestions,
          totalMarks: basics.totalMarks,
        });
        const res = await testAPI.getTestDetails(testId);
        setSummaryTest(res.test);
        setMaxCompletedStep((m) => Math.max(m, 1));
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
      const res = await testAPI.getTestDetails(testId);
      setSummaryTest(res.test);
      setMaxCompletedStep((m) => Math.max(m, 2));
      setStep(3);
      return true;
    } catch (e) {
      setError(e.message || 'Failed to save binding');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistQuestionsStep = async () => {
    if (!testId) return false;
    setError('');
    setSaving(true);
    try {
      const res = await testAPI.getTestDetails(testId);
      setSummaryTest(res.test);
      const check = validateQuestionsStep(res.test, bindingType, hybridPercent, basics);
      if (!check.valid) {
        setError(check.message);
        return false;
      }
      setMaxCompletedStep((m) => Math.max(m, 3));
      setStep(4);
      return true;
    } catch (e) {
      setError(e.message || 'Could not validate questions');
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
      setMaxCompletedStep((m) => Math.max(m, 4));
      setStep(5);
      return true;
    } catch (e) {
      setError(e.message || 'Failed to save schedule');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setReviewStatus = async (makeActive) => {
    if (!testId) return;
    const nextStatus = makeActive ? 'Active' : 'Inactive';
    if (summaryTest?.Status === nextStatus) return;
    setSaving(true);
    setError('');
    try {
      await testAPI.updateStatus(testId, nextStatus);
      const res = await testAPI.getTestDetails(testId);
      setSummaryTest(res.test);
      if (nextStatus === 'Active') {
        setMaxCompletedStep((m) => Math.max(m, 5));
      } else {
        setMaxCompletedStep((m) => Math.min(m, 4));
      }
    } catch (e) {
      setError(e.message || e.error || `Could not set test to ${nextStatus.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const continueToAssign = () => {
    if (summaryTest?.Status !== 'Active') {
      setError('Set the test to Active on this step before assigning to students.');
      return;
    }
    if (maxCompletedStep < 5) setMaxCompletedStep(5);
    setStep(6);
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
          const done = maxCompletedStep >= s.id;
          const locked = s.id > maxAccessibleStep;
          return (
            <button
              key={s.id}
              type="button"
              className={`tw-step ${active ? 'tw-step--active' : ''} ${done ? 'tw-step--done' : ''} ${locked ? 'tw-step--locked' : ''}`}
              onClick={() => {
                if (locked) {
                  requestStepChange(s.id, { alertUser: true });
                  return;
                }
                requestStepChange(s.id);
              }}
              disabled={(!testId && s.id > 1) || locked}
              title={
                locked
                  ? `Complete earlier steps first (${STEP_ORDER_HINT})`
                  : !testId && s.id > 1
                    ? 'Complete Basics first'
                    : s.label
              }
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
            <p className="tw-card-desc">
              Name, exam, duration, and totals. Exams are limited to those included in your active subscription
              {showSubscriptionPicker ? ' plan' : ''}. The test is created as inactive until you review.
            </p>
            {loadingLists ? (
              <p className="tw-muted">Loading subscriptions and exams…</p>
            ) : subscriptions.length === 0 ? (
              <div className="notice warning tw-notice">
                <AlertCircle size={18} />
                <span>No active subscription found. Subscribe to a plan before creating tests.</span>
              </div>
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
                {showSubscriptionPicker ? (
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
                ) : (
                  singleSubscription && (
                    <p className="tw-muted tw-plan-hint">
                      Using plan <strong>{singleSubscription.SubscriptionPlans?.PlanName || 'Active subscription'}</strong>
                      {' '}(expires {new Date(singleSubscription.EndDate).toLocaleDateString()})
                    </p>
                  )
                )}
                <label className="tw-field">
                  <span>Exam *</span>
                  <select
                    value={basics.examId}
                    onChange={(e) => setBasics({ ...basics, examId: e.target.value })}
                    required
                    disabled={!basics.subscriptionId || loadingExams || availableExams.length === 0}
                  >
                    <option value="">
                      {!basics.subscriptionId
                        ? showSubscriptionPicker
                          ? 'Select subscription first'
                          : 'Loading subscription…'
                        : loadingExams
                          ? 'Loading exams…'
                        : availableExams.length === 0
                          ? 'No exams in this subscription plan'
                          : 'Select exam'}
                    </option>
                    {basics.subscriptionId &&
                      availableExams.map((ex) => (
                        <option key={ex.ExamID} value={ex.ExamID}>
                          {ex.ExamName}
                        </option>
                      ))}
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
              <button type="button" className="btn-secondary" onClick={() => requestStepChange(1)} disabled={saving}>
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
              <button type="button" className="btn-secondary" onClick={() => requestStepChange(2)}>
                Back
              </button>
              <button type="button" className="btn-primary" onClick={persistQuestionsStep} disabled={saving}>
                {saving ? 'Checking…' : 'Continue to schedule'}
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
              <button type="button" className="btn-secondary" onClick={() => requestStepChange(3)}>
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
                <dd>
                  <div className="tw-status-toggle" role="group" aria-label="Test status">
                    <button
                      type="button"
                      className={`tw-status-option ${summaryTest?.Status !== 'Active' ? 'tw-status-option--on' : ''}`}
                      onClick={() => setReviewStatus(false)}
                      disabled={saving}
                      aria-pressed={summaryTest?.Status !== 'Active'}
                    >
                      Inactive
                    </button>
                    <button
                      type="button"
                      className={`tw-status-option tw-status-option--active ${summaryTest?.Status === 'Active' ? 'tw-status-option--on' : ''}`}
                      onClick={() => setReviewStatus(true)}
                      disabled={saving}
                      aria-pressed={summaryTest?.Status === 'Active'}
                    >
                      Active
                    </button>
                  </div>
                  <p className="tw-status-hint">
                    {summaryTest?.Status === 'Active'
                      ? 'Students can see and attempt this test when it is assigned.'
                      : 'Tests are created inactive. Switch to Active when the paper is ready to assign.'}
                  </p>
                </dd>
              </div>
            </dl>
            <div className="tw-wizard-actions">
              <button type="button" className="btn-secondary" onClick={() => requestStepChange(4)}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={continueToAssign}
                disabled={summaryTest?.Status !== 'Active'}
                title={summaryTest?.Status !== 'Active' ? 'Activate the test first' : undefined}
              >
                Continue to assign
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {step === 6 && testId && summaryTest?.Status === 'Active' && (
          <section className="tw-card">
            <h2 className="tw-card-title">Assign</h2>
            <p className="tw-card-desc">
              Assign to students or groups with an optional due date. You can always return from Tests → Assign.
            </p>
            <AssignTestPanelEmbedded test={summaryTest} canonicalTestId={testId} onAssigned={() => {}} />
            <div className="tw-wizard-actions tw-wizard-actions--footer">
              <button type="button" className="btn-secondary" onClick={() => requestStepChange(5)}>
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
