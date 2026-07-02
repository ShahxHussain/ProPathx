import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText,
  ArrowLeft,
  Trash2,
  AlertCircle,
  GripVertical,
  ListChecks,
  Shuffle,
  Layers,
  Info,
  CheckCircle,
} from 'lucide-react';
import { testAPI, orgDashboard } from '../../../services/api';
import { getTestScheduleLabel } from '../utils/testScheduleLabel.js';
import './TestQuestions.css';

/** Embedded in test creation wizard — fixed test, no test picker or binding cards. */
export function TestQuestionsEmbedded({ testId }) {
  if (!testId) return null;
  return <TestQuestionsPageInner embeddedTestId={testId} />;
}

function TestQuestionsPageInner({ embeddedTestId }) {
  const navigate = useNavigate();
  const { testId: urlTestId } = useParams();
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState(() => embeddedTestId || urlTestId || '');
  const [testDetails, setTestDetails] = useState(null);
  const [available, setAvailable] = useState({
    questions: [],
    currentCount: 0,
    maxQuestionsPerTest: null,
    canAddMore: true,
    pagination: {},
  });
  const [filters, setFilters] = useState({ search: '', difficulty: '', approvedOnly: false, subjectId: '', topicId: '', questionType: '' });
  const [availablePage, setAvailablePage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [examStructure, setExamStructure] = useState(null);
  const [sameExamTests, setSameExamTests] = useState([]);
  const [bulkSubjectId, setBulkSubjectId] = useState('');
  const [bulkTopicId, setBulkTopicId] = useState('');
  const [bulkCount, setBulkCount] = useState(10);
  const [copySourceTestId, setCopySourceTestId] = useState('');
  const [draggedOrderIndex, setDraggedOrderIndex] = useState(null);
  const [loadingTests, setLoadingTests] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [bindingType, setBindingType] = useState('custom');
  const [autoPercent, setAutoPercent] = useState(0);
  const [bindingSaving, setBindingSaving] = useState(false);

  useEffect(() => {
    testAPI.getTests({ page: 1, limit: 500 }).then((res) => {
      setTests(res.tests || []);
      if (embeddedTestId) {
        setSelectedTestId(embeddedTestId);
      } else if (urlTestId) {
        setSelectedTestId((prev) => prev || urlTestId);
      }
    }).catch(() => setTests([])).finally(() => setLoadingTests(false));
  }, [urlTestId, embeddedTestId]);

  useEffect(() => {
    if (!selectedTestId) {
      setTestDetails(null);
      return;
    }
    setLoadingDetails(true);
    setError('');
    testAPI.getTestDetails(selectedTestId)
      .then((res) => {
        const t = res.test;
        setTestDetails(t);
        setBindingType(t?.bindingType || 'custom');
        setAutoPercent(t?.autoPercent ?? 0);
      })
      .catch((err) => { setError(err.message); setTestDetails(null); })
      .finally(() => setLoadingDetails(false));
  }, [selectedTestId]);

  const loadAvailable = async () => {
    if (!selectedTestId) return;
    setLoadingAvailable(true);
    try {
      const res = await testAPI.getAvailableQuestions(selectedTestId, {
        search: filters.search.trim() || undefined,
        difficulty: filters.difficulty || undefined,
        approvedOnly: filters.approvedOnly ? '1' : undefined,
        subjectId: filters.subjectId || undefined,
        topicId: filters.topicId || undefined,
        questionType: filters.questionType || undefined,
        customOnly: bindingType === 'custom',
        page: availablePage,
        limit: 20,
      });
      setAvailable({
        questions: res.questions || [],
        currentCount: res.currentCount ?? 0,
        maxQuestionsPerTest: res.maxQuestionsPerTest ?? null,
        canAddMore: res.canAddMore !== false,
        pagination: res.pagination || {},
      });
    } catch {
      setAvailable({ questions: [], currentCount: 0, maxQuestionsPerTest: null, canAddMore: true, pagination: {} });
    } finally {
      setLoadingAvailable(false);
    }
  };

  useEffect(() => {
    if (selectedTestId) loadAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTestId, availablePage, bindingType, filters.search, filters.difficulty, filters.approvedOnly, filters.subjectId, filters.topicId, filters.questionType]);

  useEffect(() => {
    if (!testDetails?.ExamID) return;
    orgDashboard.getExamDetails(testDetails.ExamID).then((data) => setExamStructure(data)).catch(() => setExamStructure(null));
  }, [testDetails?.ExamID]);

  useEffect(() => {
    if (!selectedTestId || !testDetails?.ExamID) return;
    setSameExamTests(tests.filter((t) => t.ExamID === testDetails.ExamID && t.TestID !== selectedTestId));
  }, [selectedTestId, testDetails?.ExamID, tests]);

  const refreshTestDetails = async () => {
    if (!selectedTestId) return;
    try {
      const res = await testAPI.getTestDetails(selectedTestId);
      setTestDetails(res.test);
    } catch {
      /* keep prior details */
    }
    await loadAvailable();
  };

  const currentQuestions = testDetails?.questions || [];
  const linkedCount = currentQuestions.length;
  const targetCount = testDetails?.TotalQuestions != null ? testDetails.TotalQuestions : linkedCount;
  const subjects = examStructure?.subjects || [];
  const topicsForSubject = bulkSubjectId
    ? subjects.flatMap((s) => (s.topics || []).map((t) => ({ ...t, SubjectID: s.SubjectID, SubjectName: s.SubjectName }))).filter((t) => t.SubjectID === bulkSubjectId)
    : subjects.flatMap((s) => (s.topics || []).map((t) => ({ ...t, SubjectID: s.SubjectID, SubjectName: s.SubjectName })));
  const filterTopics = filters.subjectId
    ? (subjects.find((s) => s.SubjectID === filters.subjectId)?.topics || [])
    : subjects.flatMap((s) => s.topics || []);
  const limitReached = available.maxQuestionsPerTest != null && available.currentCount >= available.maxQuestionsPerTest;
  const canAddCount = available.maxQuestionsPerTest != null ? Math.max(0, available.maxQuestionsPerTest - available.currentCount) : 999;

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setError('');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleBulkAdd = async () => {
    setActionLoading(true);
    setError('');
    try {
      await testAPI.bulkAddQuestions(selectedTestId, {
        topicId: bulkTopicId || undefined,
        subjectId: bulkSubjectId || undefined,
        difficulty: filters.difficulty || undefined,
        approvedOnly: filters.approvedOnly || undefined,
        count: bulkCount,
        customOnly: bindingType === 'custom',
      });
      setBulkTopicId('');
      setBulkSubjectId('');
      await refreshTestDetails();
      showSuccess(`${bulkCount} questions added to your test.`);
    } catch (err) {
      setError(err.message || 'Could not add questions. Try fewer or different filters.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyFromTest = async () => {
    if (!copySourceTestId) {
      setError('Please select a test to copy from.');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const res = await testAPI.copyQuestionsFromTest(selectedTestId, copySourceTestId);
      setCopySourceTestId('');
      await refreshTestDetails();
      showSuccess(`${res.added || 0} questions copied into your test.`);
    } catch (err) {
      setError(err.message || 'Could not copy questions.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReorder = async (newOrderedIds) => {
    setActionLoading(true);
    setError('');
    try {
      await testAPI.reorderQuestions(selectedTestId, newOrderedIds);
      await refreshTestDetails();
      showSuccess('Question order updated.');
    } catch (err) {
      setError(err.message || 'Could not update order.');
    } finally {
      setActionLoading(false);
    }
  };

  const onReorderDragStart = (e, index) => {
    setDraggedOrderIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  const onReorderDragOver = (e) => e.preventDefault();
  const onReorderDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedOrderIndex == null || draggedOrderIndex === dropIndex) {
      setDraggedOrderIndex(null);
      return;
    }
    const ids = currentQuestions.map((tq) => (tq.Questions || {}).QuestionID || tq.QuestionID);
    const [removed] = ids.splice(draggedOrderIndex, 1);
    ids.splice(dropIndex, 0, removed);
    setDraggedOrderIndex(null);
    handleReorder(ids);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllOnPage = () => {
    if (!available.canAddMore) return;
    const maxAdd = Math.min(available.questions.length, canAddCount - selectedIds.size);
    const toSelect = available.questions.map((q) => q.QuestionID).filter((id) => !selectedIds.has(id)).slice(0, maxAdd);
    if (toSelect.length === 0) return;
    setSelectedIds((prev) => new Set([...prev, ...toSelect]));
  };
  const addSelected = async () => {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    const ids = [...selectedIds];
    setActionLoading(true);
    setError('');
    try {
      await testAPI.addQuestionsToTest(selectedTestId, ids);
      setSelectedIds(new Set());
      await refreshTestDetails();
      showSuccess(`${n} question(s) added to your test.`);
    } catch (err) {
      const msg = err.weightageExceeded
        ? err.message
        : (err.details ? `${err.message}: ${err.details}` : (err.message || 'Could not add selected questions.'));
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const saveBindingConfig = async (type, percent) => {
    if (!selectedTestId) return;
    setBindingSaving(true);
    setError('');
    try {
      await testAPI.setBindingConfig(selectedTestId, {
        bindingType: type,
        autoPercent: type === 'hybrid' ? Math.max(0, Math.min(100, percent)) : 0,
      });
      setBindingType(type);
      setAutoPercent(type === 'hybrid' ? Math.max(0, Math.min(100, percent)) : 0);
      showSuccess('Binding type saved.');
    } catch (err) {
      setError(err.message || 'Could not save binding type.');
    } finally {
      setBindingSaving(false);
    }
  };

  const removeQuestion = async (questionId) => {
    setActionLoading(true);
    setError('');
    try {
      await testAPI.removeQuestionFromTest(selectedTestId, questionId);
      await refreshTestDetails();
      showSuccess('Question removed from test.');
    } catch (err) {
      setError(err.message || 'Could not remove question.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loadingTests) {
    return (
      <div className="test-questions-page">
        <div className="tq-loading">Loading your tests…</div>
      </div>
    );
  }

  return (
    <div className={`test-questions-page${embeddedTestId ? ' test-questions-page--embedded' : ''}`}>
      {!embeddedTestId && (
        <header className="tq-header">
          <button type="button" className="tq-back" onClick={() => navigate('/org/tests')}>
            <ArrowLeft size={18} />
            Back to Tests
          </button>
          <h1 className="tq-title">Questions in your tests</h1>
          <p className="tq-subtitle">Choose a test, then add, remove, or reorder questions. No popups—everything is on this page.</p>
        </header>
      )}

      {!embeddedTestId && (
        <section className="tq-card tq-select-test">
          <h2 className="tq-card-title">1. Choose a test</h2>
          <p className="tq-card-desc">Select the test you want to edit. You can change it anytime.</p>
          <div className="tq-test-select-row">
            <select
              className="tq-select"
              value={selectedTestId}
              onChange={(e) => setSelectedTestId(e.target.value)}
              aria-label="Select test"
            >
              <option value="">— Select a test —</option>
              {tests.map((t) => (
                <option key={t.TestID} value={t.TestID}>
                  {t.TestName} — {t.Exams?.ExamName || 'Exam'} ({t.TotalQuestions ?? 0} questions)
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {!selectedTestId && !embeddedTestId && (
        <div className="tq-placeholder">
          <FileText size={48} className="tq-placeholder-icon" />
          <p>Select a test above to add or manage its questions.</p>
        </div>
      )}

      {selectedTestId && loadingDetails && (
        <div className="tq-loading">Loading test details…</div>
      )}

      {selectedTestId && !loadingDetails && testDetails && (
        <>
          <section className="tq-card tq-summary">
            <h2 className="tq-card-title">Test summary</h2>
            <div className="tq-summary-row">
              <span className="tq-summary-name">{testDetails.TestName}</span>
              <span className="tq-summary-meta">{testDetails.Exams?.ExamName} · {getTestScheduleLabel(testDetails)}</span>
              <span className="tq-summary-count">
                <strong>{linkedCount}</strong> of <strong>{targetCount}</strong> questions linked
                {linkedCount !== targetCount && (
                  <span className="tq-summary-hint"> (target from test settings)</span>
                )}
                {available.maxQuestionsPerTest != null && (
                  <> · plan allows up to <strong>{available.maxQuestionsPerTest}</strong> per test</>
                )}
              </span>
              <span className="tq-summary-binding">
                Binding: <strong>{bindingType === 'custom' ? 'Custom' : bindingType === 'auto' ? 'Auto' : `Hybrid (${autoPercent}% auto)`}</strong>
              </span>
              {limitReached && <span className="tq-limit-badge">Limit reached</span>}
            </div>
          </section>

          {!embeddedTestId && (
            <section className="tq-flow-strip" aria-label="Recommended setup order">
              <h3 className="tq-flow-title">Where you are in the flow</h3>
              <ol className="tq-flow-steps">
                <li className="tq-flow-step tq-flow-done">
                  <span className="tq-flow-num">1</span>
                  <span>Test created</span>
                </li>
                <li className={`tq-flow-step ${bindingType ? 'tq-flow-done' : 'tq-flow-todo'}`}>
                  <span className="tq-flow-num">2</span>
                  <span>Choose binding &amp; configure questions</span>
                </li>
                <li
                  className={`tq-flow-step ${
                    testDetails.Status === 'Active' ? 'tq-flow-done' : 'tq-flow-todo'
                  }`}
                >
                  <span className="tq-flow-num">3</span>
                  <span>Activate test on Tests list</span>
                </li>
                <li className="tq-flow-step tq-flow-todo">
                  <span className="tq-flow-num">4</span>
                  <span>Assign students</span>
                </li>
              </ol>
              <p className="tq-flow-hint">
                Next step:{' '}
                {testDetails.Status !== 'Active' ? (
                  <>
                    enable the test under <button type="button" className="tq-inline-link" onClick={() => navigate('/org/tests')}>Tests</button> (after questions meet your rules).
                  </>
                ) : (
                  <>
                    open <button type="button" className="tq-inline-link" onClick={() => navigate('/org/tests')}>Tests</button> and use <strong>Assign</strong>.
                  </>
                )}
              </p>
            </section>
          )}

          {error && (
            <div className="tq-notice tq-notice-error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          {successMessage && (
            <div className="tq-notice tq-notice-success">
              {successMessage}
            </div>
          )}

          {!embeddedTestId && (
            <section className="tq-card tq-binding-section">
              <h2 className="tq-card-title">2. How questions are bound to this test</h2>
              <p className="tq-card-desc">Choose one mode. Each has a different workflow below.</p>
              <div className="tq-mode-cards">
                <button
                  type="button"
                  className={`tq-mode-card tq-mode-custom ${bindingType === 'custom' ? 'tq-mode-selected' : ''}`}
                  onClick={() => saveBindingConfig('custom', 0)}
                  disabled={bindingSaving}
                >
                  <span className="tq-mode-icon"><ListChecks size={28} /></span>
                  <span className="tq-mode-name">Custom</span>
                  <span className="tq-mode-desc">You pick every question from your bank. Full control: add, remove, reorder.</span>
                </button>
                <button
                  type="button"
                  className={`tq-mode-card tq-mode-auto ${bindingType === 'auto' ? 'tq-mode-selected' : ''}`}
                  onClick={() => saveBindingConfig('auto', 0)}
                  disabled={bindingSaving}
                >
                  <span className="tq-mode-icon"><Shuffle size={28} /></span>
                  <span className="tq-mode-name">Auto</span>
                  <span className="tq-mode-desc">Random questions from the platform at attempt time. No question management here.</span>
                </button>
                <button
                  type="button"
                  className={`tq-mode-card tq-mode-hybrid ${bindingType === 'hybrid' ? 'tq-mode-selected' : ''}`}
                  onClick={() => saveBindingConfig('hybrid', autoPercent)}
                  disabled={bindingSaving}
                >
                  <span className="tq-mode-icon"><Layers size={28} /></span>
                  <span className="tq-mode-name">Hybrid</span>
                  <span className="tq-mode-desc">Mix: part random (platform), part the questions you add. Set the split below.</span>
                </button>
              </div>
              {bindingSaving && <p className="tq-loading-inline">Saving…</p>}
            </section>
          )}

          {/* ─── Custom binding: full UI ─── */}
          {bindingType === 'custom' && (
            <div className="tq-view tq-view-custom">
              <div className="tq-view-hero tq-hero-custom">
                <ListChecks size={32} className="tq-hero-icon" />
                <div>
                  <h3 className="tq-hero-title">Custom binding</h3>
                  <p className="tq-hero-desc">Only your organization’s questions. Select by subject, topic, and filters; add or bulk-add; reorder and remove as needed.</p>
                </div>
              </div>
              <div className="tq-two-panels">
            <section className="tq-panel tq-panel-in-test">
              <h2 className="tq-card-title">Questions in this test</h2>
              <p className="tq-card-desc">Drag to reorder. Use the bin icon to remove.</p>
              {currentQuestions.length === 0 ? (
                <p className="tq-empty">No questions yet. Select from the panel on the right to add.</p>
              ) : (
                <ul className="tq-list tq-list-draggable tq-panel-list">
                  {currentQuestions.map((tq, index) => {
                    const q = tq.Questions || {};
                    const qId = q.QuestionID || tq.QuestionID;
                    return (
                      <li
                        key={qId}
                        draggable
                        onDragStart={(e) => onReorderDragStart(e, index)}
                        onDragOver={onReorderDragOver}
                        onDrop={(e) => onReorderDrop(e, index)}
                        onDragEnd={() => setDraggedOrderIndex(null)}
                        className={draggedOrderIndex === index ? 'tq-dragging' : ''}
                      >
                        <span className="tq-drag-handle" aria-hidden><GripVertical size={16} /></span>
                        <span className="tq-snippet">{(q.QuestionText || '').slice(0, 100)}{(q.QuestionText || '').length > 100 ? '…' : ''}</span>
                        <span className="tq-meta">{q.DifficultyLevel} · {q.QuestionType}</span>
                        <button
                          type="button"
                          className="tq-btn-remove"
                          onClick={() => removeQuestion(qId)}
                          disabled={actionLoading}
                          title="Remove from test"
                          aria-label="Remove from test"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="tq-panel tq-panel-bank">
              <h2 className="tq-card-title">Add from question bank</h2>
              <p className="tq-card-desc">Select Subject, Topic, and other filters. Tick the MCQs you want, then Add selected.</p>
              {bindingType === 'custom' && (
                <p className="tq-notice tq-notice-info" style={{ marginBottom: '0.75rem' }}>
                  <Info size={16} /> Custom binding: only <strong>your organization’s</strong> questions are shown here.
                </p>
              )}
              <div className="tq-filters tq-filters-grid">
                <select
                  value={filters.subjectId}
                  onChange={(e) => { setFilters((f) => ({ ...f, subjectId: e.target.value, topicId: '' })); setAvailablePage(1); }}
                  className="tq-select"
                  title="Subject"
                >
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.SubjectID} value={s.SubjectID}>{s.SubjectName}</option>
                  ))}
                </select>
                <select
                  value={filters.topicId}
                  onChange={(e) => { setFilters((f) => ({ ...f, topicId: e.target.value })); setAvailablePage(1); }}
                  className="tq-select"
                  title="Topic"
                >
                  <option value="">All topics</option>
                  {filterTopics.map((t) => (
                    <option key={t.TopicID} value={t.TopicID}>{t.TopicName}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Search by question text…"
                  value={filters.search}
                  onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setAvailablePage(1); }}
                  className="tq-input"
                />
                <select
                  value={filters.difficulty}
                  onChange={(e) => { setFilters((f) => ({ ...f, difficulty: e.target.value })); setAvailablePage(1); }}
                  className="tq-select tq-select-sm"
                >
                  <option value="">Any difficulty</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <select
                  value={filters.questionType}
                  onChange={(e) => { setFilters((f) => ({ ...f, questionType: e.target.value })); setAvailablePage(1); }}
                  className="tq-select tq-select-sm"
                >
                  <option value="">Any type</option>
                  <option value="Single Correct">Single Correct</option>
                  <option value="Multiple Correct">Multiple Correct</option>
                </select>
                <label className="tq-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.approvedOnly}
                    onChange={(e) => { setFilters((f) => ({ ...f, approvedOnly: e.target.checked })); setAvailablePage(1); }}
                  />
                  Approved only
                </label>
                <button type="button" className="tq-btn tq-btn-secondary" onClick={() => { setAvailablePage(1); loadAvailable(); }}>
                  Search
                </button>
              </div>
              {loadingAvailable ? (
                <p className="tq-loading-inline">Loading questions…</p>
              ) : (
                <>
                  <div className="tq-actions">
                    <button type="button" className="tq-btn tq-btn-secondary" onClick={selectAllOnPage} disabled={limitReached || available.questions.length === 0}>
                      Select all on page
                    </button>
                    <button type="button" className="tq-btn tq-btn-primary" onClick={addSelected} disabled={actionLoading || selectedIds.size === 0 || limitReached}>
                      {actionLoading ? 'Adding…' : `Add selected (${selectedIds.size})`}
                    </button>
                    {canAddCount < 999 && <span className="tq-hint">Up to {canAddCount} more.</span>}
                  </div>
                  <ul className="tq-list tq-list-available tq-panel-list">
                    {available.questions.length === 0 ? (
                      <li className="tq-empty-row">No questions match. Try different filters.</li>
                    ) : (
                      available.questions.map((q) => (
                        <li key={q.QuestionID}>
                          <label className="tq-row-label">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(q.QuestionID)}
                              onChange={() => toggleSelect(q.QuestionID)}
                              disabled={limitReached || (selectedIds.size >= canAddCount && !selectedIds.has(q.QuestionID))}
                            />
                            <span className="tq-snippet">{(q.QuestionText || '').slice(0, 120)}…</span>
                            <span className="tq-meta">{q.DifficultyLevel} · {q.QuestionType}</span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                  {available.pagination?.totalPages > 1 && (
                    <div className="tq-pagination">
                      <button type="button" className="tq-btn tq-btn-secondary" disabled={availablePage <= 1} onClick={() => setAvailablePage((p) => p - 1)}>Previous</button>
                      <span>Page {availablePage} of {available.pagination.totalPages}</span>
                      <button type="button" className="tq-btn tq-btn-secondary" disabled={availablePage >= available.pagination.totalPages} onClick={() => setAvailablePage((p) => p + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

              <section className="tq-card tq-card-tools">
                <h2 className="tq-card-title">Add many by topic</h2>
                <p className="tq-card-desc">Pick subject and topic; we’ll add that many at random (within plan limit).</p>
                <div className="tq-filters">
                  <select value={bulkSubjectId} onChange={(e) => { setBulkSubjectId(e.target.value); setBulkTopicId(''); }} className="tq-select">
                    <option value="">All subjects</option>
                    {subjects.map((s) => (
                      <option key={s.SubjectID} value={s.SubjectID}>{s.SubjectName}</option>
                    ))}
                  </select>
                  <select value={bulkTopicId} onChange={(e) => setBulkTopicId(e.target.value)} className="tq-select">
                    <option value="">All topics</option>
                    {topicsForSubject.map((t) => (
                      <option key={t.TopicID} value={t.TopicID}>{t.TopicName}</option>
                    ))}
                  </select>
                  <label className="tq-number-label">
                    How many: <input type="number" min={1} max={100} value={bulkCount} onChange={(e) => setBulkCount(parseInt(e.target.value, 10) || 10)} className="tq-input-num" />
                  </label>
                  <button type="button" className="tq-btn tq-btn-primary" onClick={handleBulkAdd} disabled={actionLoading || limitReached}>
                    {actionLoading ? 'Adding…' : `Add ${bulkCount} questions`}
                  </button>
                </div>
              </section>

              <section className="tq-card tq-card-tools">
                <h2 className="tq-card-title">Copy from another test</h2>
                <p className="tq-card-desc">Same exam only. Duplicates are skipped. Only your org’s questions are copied.</p>
                <div className="tq-filters">
                  <select value={copySourceTestId} onChange={(e) => setCopySourceTestId(e.target.value)} className="tq-select">
                    <option value="">— Select a test —</option>
                    {sameExamTests.map((t) => (
                      <option key={t.TestID} value={t.TestID}>{t.TestName} ({t.TotalQuestions ?? 0} questions)</option>
                    ))}
                  </select>
                  <button type="button" className="tq-btn tq-btn-primary" onClick={handleCopyFromTest} disabled={actionLoading || !copySourceTestId || limitReached}>
                    {actionLoading ? 'Copying…' : 'Copy questions'}
                  </button>
                </div>
                {sameExamTests.length === 0 && <p className="tq-hint">No other tests for this exam yet.</p>}
              </section>
            </div>
          )}

          {/* ─── Auto binding: single info view ─── */}
          {bindingType === 'auto' && (
            <div className="tq-view tq-view-auto">
              <div className="tq-view-hero tq-hero-auto">
                <Shuffle size={40} className="tq-hero-icon" />
                <h3 className="tq-hero-title">Auto binding</h3>
                <p className="tq-hero-desc">
                  Questions are drawn <strong>randomly</strong> from platform MCQs for{' '}
                  <strong>{testDetails?.Exams?.ExamName || 'this exam'}</strong> when a student starts an attempt. Nothing to add on this page—set the paper size and status on the Tests list.
                </p>
                <div className="tq-auto-stats">
                  <div className="tq-auto-stat">
                    <span className="tq-auto-stat-value">{testDetails?.TotalQuestions ?? 0}</span>
                    <span className="tq-auto-stat-label">Questions per attempt</span>
                  </div>
                </div>
                <ul className="tq-auto-checklist">
                  <li>
                    {(testDetails?.TotalQuestions ?? 0) >= 1 ? (
                      <CheckCircle className="tq-auto-check tq-auto-check-ok" size={22} aria-hidden />
                    ) : (
                      <AlertCircle className="tq-auto-check tq-auto-check-warn" size={22} aria-hidden />
                    )}
                    <span>
                      <strong>Total questions</strong> is set to at least 1 (edit on Tests — create flow or future edit).
                    </span>
                  </li>
                  <li>
                    {testDetails?.Status === 'Active' ? (
                      <CheckCircle className="tq-auto-check tq-auto-check-ok" size={22} aria-hidden />
                    ) : (
                      <AlertCircle className="tq-auto-check tq-auto-check-warn" size={22} aria-hidden />
                    )}
                    <span>
                      Test is <strong>Active</strong> (toggle on the Tests page).
                    </span>
                  </li>
                </ul>
                <div className="tq-auto-actions">
                  {!embeddedTestId && (
                    <button type="button" className="tq-btn tq-btn-primary" onClick={() => navigate('/org/tests')}>
                      Open Tests — edit totals &amp; status
                    </button>
                  )}
                </div>
                <div className="tq-auto-tip">
                  <Info size={20} />
                  <p>
                    You can assign students once totals and activation pass the checks in the Assign dialog. Delivery of random questions at runtime is enforced server-side for auto mode.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Hybrid binding: auto % + same as Custom ─── */}
          {bindingType === 'hybrid' && (
            <div className="tq-view tq-view-hybrid">
              <div className="tq-view-hero tq-hero-hybrid">
                <Layers size={32} className="tq-hero-icon" />
                <div>
                  <h3 className="tq-hero-title">Hybrid binding</h3>
                  <p className="tq-hero-desc">Part random (platform), part the questions you add. Set the split and add your custom portion below.</p>
                </div>
              </div>
              <div className="tq-hybrid-split-card">
                <label className="tq-hybrid-split-label">Auto (random platform) share</label>
                <div className="tq-hybrid-split-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={autoPercent}
                    onChange={(e) => setAutoPercent(Number(e.target.value))}
                    className="tq-hybrid-slider"
                    disabled={bindingSaving}
                  />
                  <span className="tq-hybrid-percent-value">{autoPercent}%</span>
                </div>
                <p className="tq-hybrid-split-hint">
                  Custom (your questions) ≈ <strong>{100 - autoPercent}%</strong> of the attempt. Add them below. 100% auto behaves like full auto (no custom rows required).
                </p>
                <div className="tq-hybrid-save-row">
                  <button
                    type="button"
                    className="tq-btn tq-btn-primary"
                    disabled={bindingSaving}
                    onClick={() => saveBindingConfig('hybrid', autoPercent)}
                  >
                    {bindingSaving ? 'Saving…' : 'Save split'}
                  </button>
                  {!bindingSaving && <span className="tq-hybrid-saved-hint">Click after adjusting the slider.</span>}
                </div>
              </div>
              <div className="tq-two-panels">
            <section className="tq-panel tq-panel-in-test">
              <h2 className="tq-card-title">Questions in this test (your portion)</h2>
              <p className="tq-card-desc">Drag to reorder. Use the bin icon to remove.</p>
              {currentQuestions.length === 0 ? (
                <p className="tq-empty">No questions yet. Select from the panel on the right to add.</p>
              ) : (
                <ul className="tq-list tq-list-draggable tq-panel-list">
                  {currentQuestions.map((tq, index) => {
                    const q = tq.Questions || {};
                    const qId = q.QuestionID || tq.QuestionID;
                    return (
                      <li
                        key={qId}
                        draggable
                        onDragStart={(e) => onReorderDragStart(e, index)}
                        onDragOver={onReorderDragOver}
                        onDrop={(e) => onReorderDrop(e, index)}
                        onDragEnd={() => setDraggedOrderIndex(null)}
                        className={draggedOrderIndex === index ? 'tq-dragging' : ''}
                      >
                        <span className="tq-drag-handle" aria-hidden><GripVertical size={16} /></span>
                        <span className="tq-snippet">{(q.QuestionText || '').slice(0, 100)}{(q.QuestionText || '').length > 100 ? '…' : ''}</span>
                        <span className="tq-meta">{q.DifficultyLevel} · {q.QuestionType}</span>
                        <button type="button" className="tq-btn-remove" onClick={() => removeQuestion(qId)} disabled={actionLoading} title="Remove from test" aria-label="Remove from test">
                          <Trash2 size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="tq-panel tq-panel-bank">
              <h2 className="tq-card-title">Add from question bank</h2>
              <p className="tq-card-desc">Filters: subject, topic, difficulty, type. Tick and add selected.</p>
              <div className="tq-filters tq-filters-grid">
                <select value={filters.subjectId} onChange={(e) => { setFilters((f) => ({ ...f, subjectId: e.target.value, topicId: '' })); setAvailablePage(1); }} className="tq-select" title="Subject">
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.SubjectID} value={s.SubjectID}>{s.SubjectName}</option>
                  ))}
                </select>
                <select value={filters.topicId} onChange={(e) => { setFilters((f) => ({ ...f, topicId: e.target.value })); setAvailablePage(1); }} className="tq-select" title="Topic">
                  <option value="">All topics</option>
                  {filterTopics.map((t) => (
                    <option key={t.TopicID} value={t.TopicID}>{t.TopicName}</option>
                  ))}
                </select>
                <input type="text" placeholder="Search…" value={filters.search} onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setAvailablePage(1); }} className="tq-input" />
                <select value={filters.difficulty} onChange={(e) => { setFilters((f) => ({ ...f, difficulty: e.target.value })); setAvailablePage(1); }} className="tq-select tq-select-sm">
                  <option value="">Any difficulty</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <select value={filters.questionType} onChange={(e) => { setFilters((f) => ({ ...f, questionType: e.target.value })); setAvailablePage(1); }} className="tq-select tq-select-sm">
                  <option value="">Any type</option>
                  <option value="Single Correct">Single Correct</option>
                  <option value="Multiple Correct">Multiple Correct</option>
                </select>
                <label className="tq-checkbox">
                  <input type="checkbox" checked={filters.approvedOnly} onChange={(e) => { setFilters((f) => ({ ...f, approvedOnly: e.target.checked })); setAvailablePage(1); }} />
                  Approved only
                </label>
                <button type="button" className="tq-btn tq-btn-secondary" onClick={() => { setAvailablePage(1); loadAvailable(); }}>Search</button>
              </div>
              {loadingAvailable ? (
                <p className="tq-loading-inline">Loading questions…</p>
              ) : (
                <>
                  <div className="tq-actions">
                    <button type="button" className="tq-btn tq-btn-secondary" onClick={selectAllOnPage} disabled={limitReached || available.questions.length === 0}>Select all on page</button>
                    <button type="button" className="tq-btn tq-btn-primary" onClick={addSelected} disabled={actionLoading || selectedIds.size === 0 || limitReached}>
                      {actionLoading ? 'Adding…' : `Add selected (${selectedIds.size})`}
                    </button>
                    {canAddCount < 999 && <span className="tq-hint">Up to {canAddCount} more.</span>}
                  </div>
                  <ul className="tq-list tq-list-available tq-panel-list">
                    {available.questions.length === 0 ? (
                      <li className="tq-empty-row">No questions match. Try different filters.</li>
                    ) : (
                      available.questions.map((q) => (
                        <li key={q.QuestionID}>
                          <label className="tq-row-label">
                            <input type="checkbox" checked={selectedIds.has(q.QuestionID)} onChange={() => toggleSelect(q.QuestionID)} disabled={limitReached || (selectedIds.size >= canAddCount && !selectedIds.has(q.QuestionID))} />
                            <span className="tq-snippet">{(q.QuestionText || '').slice(0, 120)}…</span>
                            <span className="tq-meta">{q.DifficultyLevel} · {q.QuestionType}</span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                  {available.pagination?.totalPages > 1 && (
                    <div className="tq-pagination">
                      <button type="button" className="tq-btn tq-btn-secondary" disabled={availablePage <= 1} onClick={() => setAvailablePage((p) => p - 1)}>Previous</button>
                      <span>Page {availablePage} of {available.pagination.totalPages}</span>
                      <button type="button" className="tq-btn tq-btn-secondary" disabled={availablePage >= available.pagination.totalPages} onClick={() => setAvailablePage((p) => p + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
              <section className="tq-card tq-card-tools">
                <h2 className="tq-card-title">Add many by topic</h2>
                <div className="tq-filters">
                  <select value={bulkSubjectId} onChange={(e) => { setBulkSubjectId(e.target.value); setBulkTopicId(''); }} className="tq-select">
                    <option value="">All subjects</option>
                    {subjects.map((s) => (
                      <option key={s.SubjectID} value={s.SubjectID}>{s.SubjectName}</option>
                    ))}
                  </select>
                  <select value={bulkTopicId} onChange={(e) => setBulkTopicId(e.target.value)} className="tq-select">
                    <option value="">All topics</option>
                    {topicsForSubject.map((t) => (
                      <option key={t.TopicID} value={t.TopicID}>{t.TopicName}</option>
                    ))}
                  </select>
                  <label className="tq-number-label">How many: <input type="number" min={1} max={100} value={bulkCount} onChange={(e) => setBulkCount(parseInt(e.target.value, 10) || 10)} className="tq-input-num" /></label>
                  <button type="button" className="tq-btn tq-btn-primary" onClick={handleBulkAdd} disabled={actionLoading || limitReached}>{actionLoading ? 'Adding…' : `Add ${bulkCount}`}</button>
                </div>
              </section>
              <section className="tq-card tq-card-tools">
                <h2 className="tq-card-title">Copy from another test</h2>
                <div className="tq-filters">
                  <select value={copySourceTestId} onChange={(e) => setCopySourceTestId(e.target.value)} className="tq-select">
                    <option value="">— Select a test —</option>
                    {sameExamTests.map((t) => (
                      <option key={t.TestID} value={t.TestID}>{t.TestName} ({t.TotalQuestions ?? 0} questions)</option>
                    ))}
                  </select>
                  <button type="button" className="tq-btn tq-btn-primary" onClick={handleCopyFromTest} disabled={actionLoading || !copySourceTestId || limitReached}>{actionLoading ? 'Copying…' : 'Copy questions'}</button>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {selectedTestId && !loadingDetails && !testDetails && !error && (
        <div className="tq-notice tq-notice-error">Could not load this test. Try another or go back to Tests.</div>
      )}
    </div>
  );
};

export default function TestQuestionsPage() {
  return <TestQuestionsPageInner />;
}
