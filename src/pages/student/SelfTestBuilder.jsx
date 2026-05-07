import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, PlayCircle, Timer, Hash, BookOpen, AlertCircle } from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './SelfTestBuilder.css';

const PREP_MESSAGES = [
  'Validating subscription and exam eligibility...',
  'Balancing subject-wise question distribution...',
  'Preparing interactive test interface...',
];

const SelfTestBuilder = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [emptyReason, setEmptyReason] = useState('');
  const [options, setOptions] = useState([]);
  const [examId, setExamId] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [preview, setPreview] = useState(null);
  const [prepIdx, setPrepIdx] = useState(0);

  const selectedExam = useMemo(
    () => options.find((o) => String(o.examId) === String(examId)) || null,
    [options, examId]
  );
  const previewRows = useMemo(() => {
    if (!selectedExam?.subjects?.length) return [];
    const allocatedBySubject = new Map(
      (preview?.distribution || []).map((item) => [String(item.subjectId), Number(item.questionCount) || 0])
    );
    return selectedExam.subjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      availableCount: Number(subject.availableCount) || 0,
      questionCount: allocatedBySubject.get(String(subject.subjectId)) || 0,
    }));
  }, [selectedExam, preview]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await studentDashboardAPI.getIndividualSelfTestOptions();
        const exams = res.exams || [];
        if (!mounted) return;
        setOptions(exams);
        setEmptyReason(res.reason?.message || '');
        if (exams.length > 0) {
          const first = exams[0];
          setExamId(String(first.examId));
          const suggested = Math.min(
            Number(first.maxQuestionsPerTest || Infinity),
            Math.max(10, Math.min(50, Number(first.totalAvailableQuestions || 30)))
          );
          setTotalQuestions(Number.isFinite(suggested) ? suggested : 30);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load self-test builder');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!examId || !Number(totalQuestions)) return;
    let mounted = true;
    const t = setTimeout(async () => {
      try {
        setPreviewError('');
        const res = await studentDashboardAPI.previewIndividualSelfTest({
          examId,
          totalQuestions: Number(totalQuestions),
        });
        if (!mounted) return;
        setPreview(res);
      } catch (err) {
        if (!mounted) return;
        setPreview(null);
        setPreviewError(err.message || 'Unable to prepare distribution preview');
      }
    }, 220);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [examId, totalQuestions]);

  useEffect(() => {
    if (!creating) return undefined;
    const interval = setInterval(() => {
      setPrepIdx((prev) => (prev + 1) % PREP_MESSAGES.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [creating]);

  const clampQuestions = (value) => {
    const n = Math.trunc(Number(value) || 0);
    const maxByExam = Number(selectedExam?.maxQuestionsPerTest || Infinity);
    const maxByPool = Number(selectedExam?.totalAvailableQuestions || Infinity);
    const max = Math.min(maxByExam, maxByPool);
    return Math.max(5, Math.min(Number.isFinite(max) ? max : 200, n || 5));
  };

  const handleStart = async () => {
    if (!examId) return;
    try {
      setCreating(true);
      setPrepIdx(0);
      setError('');
      const res = await studentDashboardAPI.createIndividualSelfTest({
        examId,
        totalQuestions: clampQuestions(totalQuestions),
        durationMinutes: Math.max(5, Math.min(300, Math.trunc(Number(durationMinutes) || 30))),
      });
      const testId = res?.test?.testId;
      if (!testId) throw new Error('Test creation response was incomplete.');
      navigate(`/student/test/${testId}`);
    } catch (err) {
      setError(err.message || 'Failed to create self-test');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="self-test-builder-page">
        <div className="self-test-loader">
          <Loader2 className="spin" size={20} />
          Loading personal test builder...
        </div>
      </div>
    );
  }

  if (!options.length) {
    return (
      <div className="self-test-builder-page">
        <div className="self-test-empty">
          <AlertCircle size={18} />
          <p>
            {emptyReason ||
              'No eligible exam pool found. Subscribe to a student plan with available exam questions.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="self-test-builder-page">
      <div className="self-test-head">
        <h1>
          <Sparkles size={20} /> Interactive Self-Test Builder
        </h1>
        <p>
          Choose your exam and question count. The system auto-balances subject coverage and prepares a ready-to-attempt test.
        </p>
      </div>

      {error && <div className="self-test-banner error">{error}</div>}

      <div className="self-test-grid">
        <section className="self-test-card">
          <h3>Test Setup</h3>

          <label>Exam</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} disabled={creating}>
            {options.map((exam) => (
              <option key={exam.examId} value={exam.examId}>
                {exam.examName}
              </option>
            ))}
          </select>

          <label>
            <Hash size={14} /> Total Questions
          </label>
          <input
            type="number"
            min={5}
            max={Math.min(
              Number(selectedExam?.maxQuestionsPerTest || Infinity),
              Number(selectedExam?.totalAvailableQuestions || Infinity)
            )}
            value={totalQuestions}
            disabled={creating}
            onChange={(e) => setTotalQuestions(clampQuestions(e.target.value))}
          />

          <label>
            <Timer size={14} /> Duration (minutes)
          </label>
          <input
            type="number"
            min={5}
            max={300}
            value={durationMinutes}
            disabled={creating}
            onChange={(e) => setDurationMinutes(Math.max(5, Math.min(300, Math.trunc(Number(e.target.value) || 5))))}
          />

          <div className="self-test-meta">
            <span>Exam pool: {selectedExam?.totalAvailableQuestions ?? 0} questions</span>
            <span>
              Plan limit:{' '}
              {selectedExam?.maxQuestionsPerTest == null ? 'Unlimited' : `${selectedExam.maxQuestionsPerTest} / test`}
            </span>
          </div>

          <button className="self-test-start-btn" onClick={handleStart} disabled={creating || !!previewError}>
            {creating ? (
              <>
                <Loader2 className="spin" size={16} /> Preparing...
              </>
            ) : (
              <>
                <PlayCircle size={16} /> Start Interactive Test
              </>
            )}
          </button>

          {creating && <p className="self-test-prep-msg">{PREP_MESSAGES[prepIdx]}</p>}
        </section>

        <section className="self-test-card">
          <h3>
            <BookOpen size={16} /> Subject Distribution Preview
          </h3>
          {previewError ? (
            <div className="self-test-banner warn">{previewError}</div>
          ) : previewRows.length ? (
            <div className="self-test-dist-list">
              {previewRows.map((item) => (
                <div key={item.subjectId} className="dist-row">
                  <div>
                    <strong>{item.subjectName}</strong>
                    <span>Available: {item.availableCount}</span>
                  </div>
                  <div className="dist-pill">{item.questionCount} Q</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Set exam and questions to preview auto distribution.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default SelfTestBuilder;

