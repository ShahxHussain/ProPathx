/** Student test result: score, timing, topic breakdown, optional certificate, and per-question review. */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  FileText,
  Clock,
  Target,
  BarChart3,
  Award,
  Building2,
  BookMarked,
  Layers,
  Info,
  Medal,
  ExternalLink,
  Sparkles,
  Check,
  X,
  Minus,
  ListOrdered,
} from 'lucide-react';
import { studentDashboardAPI } from '../../services/api';
import './TestResult.css';

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function formatAttemptOrdinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return null;
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

function performanceBand(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  if (pct < 40) return { label: 'Needs focus', className: 'band band--low' };
  if (pct < 60) return { label: 'Developing', className: 'band band--mid' };
  if (pct < 80) return { label: 'Proficient', className: 'band band--good' };
  return { label: 'Strong performance', className: 'band band--high' };
}

function statusIcon(status) {
  if (status === 'correct') return <Check size={14} aria-hidden />;
  if (status === 'skipped') return <Minus size={14} aria-hidden />;
  return <X size={14} aria-hidden />;
}

export default function TestResult() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state || {};
  const hasSubmitState =
    initial &&
    (initial.score !== undefined ||
      initial.totalMarks !== undefined ||
      initial.percentage !== undefined);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await studentDashboardAPI.getTestResultDetail(testId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load result');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId]);

  const scoreSummary = useMemo(() => {
    if (data?.scoreSummary) return data.scoreSummary;
    if (hasSubmitState) {
      return {
        obtainedMarks: initial.score,
        totalMarks: initial.totalMarks,
        percentage: initial.percentage,
        grade: null,
        percentile: null,
      };
    }
    return null;
  }, [data, hasSubmitState, initial.score, initial.totalMarks, initial.percentage]);

  const heroTitle = data?.test?.testName || initial.testName || 'Test result';
  const pct = scoreSummary?.percentage;
  const band = performanceBand(pct != null ? Number(pct) : null);

  const attemptOrdinal =
    data?.attempt?.AttemptOrdinal ?? data?.attempt?.attemptOrdinal ?? null;

  const counts = data?.analytics?.questionCounts;
  const answeredForAccuracy = counts ? counts.correct + counts.incorrect : 0;
  const accuracyPct =
    answeredForAccuracy > 0 && counts
      ? Math.round((counts.correct / answeredForAccuracy) * 1000) / 10
      : null;

  return (
    <div className="test-result-page test-result-page--detailed">
      <div className="test-result-topbar">
        <button type="button" className="test-result-back" onClick={() => navigate('/student/assignments')}>
          <ArrowLeft size={18} />
          <span>My assignments</span>
        </button>
        <button type="button" className="test-result-back test-result-back--secondary" onClick={() => navigate('/student/reports')}>
          <BarChart3 size={18} aria-hidden />
          <span>All reports</span>
        </button>
      </div>

      {loading && (
        <div className="test-result-hero test-result-hero--loading">
          <div className="test-result-hero-inner">
            <p className="test-result-loading-msg">Loading your report…</p>
            {hasSubmitState && scoreSummary && (
              <p className="test-result-loading-sub muted">
                Score {scoreSummary.obtainedMarks ?? '—'} / {scoreSummary.totalMarks ?? '—'}
                {scoreSummary.percentage != null ? ` (${scoreSummary.percentage}%)` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="test-result-card test-result-card--error">
          <AlertCircle size={22} />
          <p>{error}</p>
          <button type="button" className="btn-primary-inline" onClick={() => navigate('/student/assignments')}>
            Back to assignments
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <header className="test-result-hero">
            <div className="test-result-hero-inner">
              <div className="test-result-hero-kicker">
                <Sparkles size={16} aria-hidden />
                <span>Assessment report</span>
              </div>
              <h1 className="test-result-title">{heroTitle}</h1>
              <p className="test-result-lead">
                ProPath connects assigned assessments to clear outcomes: your score, time on task, and
                item-level insight so you and your organization can see progress—not just a grade.
              </p>
              <div className="test-result-hero-score">
                <div className="test-result-score-block">
                  <span className="test-result-score-label">Your score</span>
                  <span className="test-result-score-value">
                    {scoreSummary?.obtainedMarks ?? '—'} / {scoreSummary?.totalMarks ?? '—'}
                  </span>
                  {scoreSummary?.percentage != null && (
                    <span className="test-result-score-pct">{scoreSummary.percentage}%</span>
                  )}
                </div>
                {band && <span className={band.className}>{band.label}</span>}
                {(scoreSummary?.grade != null || scoreSummary?.percentile != null) && (
                  <div className="test-result-meta-inline">
                    {scoreSummary.grade != null && (
                      <span>
                        Grade: <strong>{String(scoreSummary.grade)}</strong>
                      </span>
                    )}
                    {scoreSummary.percentile != null && (
                      <span>
                        Percentile: <strong>{String(scoreSummary.percentile)}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          <section className="test-result-section" aria-labelledby="context-heading">
            <h2 id="context-heading" className="test-result-section-title">
              <Info size={20} aria-hidden />
              Context
            </h2>
            <div className="test-result-kpi-grid">
              <div className="test-result-kpi">
                <FileText className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Test type</span>
                  <span className="test-result-kpi-value">{data.test?.testType ?? '—'}</span>
                </div>
              </div>
              <div className="test-result-kpi">
                <Layers className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Delivery</span>
                  <span className="test-result-kpi-value">
                    {data.test?.scheduleMode === 'scheduled' ? 'Scheduled window' : 'Open (flexible start)'}
                  </span>
                </div>
              </div>
              {data.test?.orgName && (
                <div className="test-result-kpi">
                  <Building2 className="test-result-kpi-icon" size={22} aria-hidden />
                  <div>
                    <span className="test-result-kpi-label">Organization</span>
                    <span className="test-result-kpi-value">{data.test.orgName}</span>
                  </div>
                </div>
              )}
              {data.test?.examName && (
                <div className="test-result-kpi">
                  <BookMarked className="test-result-kpi-icon" size={22} aria-hidden />
                  <div>
                    <span className="test-result-kpi-label">Exam program</span>
                    <span className="test-result-kpi-value">{data.test.examName}</span>
                  </div>
                </div>
              )}
              <div className="test-result-kpi">
                <Clock className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Submitted</span>
                  <span className="test-result-kpi-value">{formatWhen(data.timing?.endTime)}</span>
                  {data.assignment?.dueDate && (
                    <span className="test-result-kpi-hint muted small">
                      Due {formatWhen(data.assignment.dueDate)}
                    </span>
                  )}
                </div>
              </div>
              {attemptOrdinal != null && formatAttemptOrdinal(attemptOrdinal) && (
                <div className="test-result-kpi">
                  <ListOrdered className="test-result-kpi-icon" size={22} aria-hidden />
                  <div>
                    <span className="test-result-kpi-label">Attempt</span>
                    <span className="test-result-kpi-value">{formatAttemptOrdinal(attemptOrdinal)}</span>
                    <span className="test-result-kpi-hint muted small">
                      Full submissions recorded for this test (assignment):{' '}
                      {data.assignment?.completedCycleCount ?? '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="test-result-section" aria-labelledby="analytics-heading">
            <h2 id="analytics-heading" className="test-result-section-title">
              <BarChart3 size={20} aria-hidden />
              Performance & analytics
            </h2>
            <div className="test-result-kpi-grid test-result-kpi-grid--dense">
              <div className="test-result-kpi">
                <Target className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Item accuracy</span>
                  <span className="test-result-kpi-value">
                    {accuracyPct != null ? `${accuracyPct}%` : '—'}
                  </span>
                  <span className="test-result-kpi-hint muted small">
                    {counts ? `${counts.correct} correct · ${counts.incorrect} wrong · ${counts.skipped} skipped` : ''}
                  </span>
                </div>
              </div>
              <div className="test-result-kpi">
                <Clock className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Time on test</span>
                  <span className="test-result-kpi-value">
                    {formatDuration(data.timing?.durationSeconds)}
                  </span>
                  <span className="test-result-kpi-hint muted small">
                    {data.timing?.allowedMinutes
                      ? `Allowed: ${data.timing.allowedMinutes} min`
                      : 'No per-attempt duration cap'}
                  </span>
                </div>
              </div>
              <div className="test-result-kpi">
                <Medal className="test-result-kpi-icon" size={22} aria-hidden />
                <div>
                  <span className="test-result-kpi-label">Cohort position</span>
                  <span className="test-result-kpi-value">
                    {data.cohort?.size > 0 && data.cohort?.rank != null
                      ? `${data.cohort.rank} / ${data.cohort.size}`
                      : '—'}
                  </span>
                  <span className="test-result-kpi-hint muted small">
                    {data.cohort?.standingPercentile != null
                      ? `About ${data.cohort.standingPercentile}% of learners who finished this test scored the same or lower (higher is better).`
                      : data.cohort?.size === 1
                        ? 'You are the only learner with a completed result for this test so far.'
                        : 'Compared with other learners who finished this test.'}
                  </span>
                </div>
              </div>
            </div>

            {counts && counts.total > 0 && (
              <div className="test-result-distribution" role="img" aria-label="Outcome mix across questions">
                <span className="test-result-dist-label">Question outcomes</span>
                <div className="test-result-dist-bar">
                  <div
                    className="test-result-dist-seg test-result-dist-seg--ok"
                    style={{ width: `${(counts.correct / counts.total) * 100}%` }}
                    title={`Correct: ${counts.correct}`}
                  />
                  <div
                    className="test-result-dist-seg test-result-dist-seg--bad"
                    style={{ width: `${(counts.incorrect / counts.total) * 100}%` }}
                    title={`Incorrect: ${counts.incorrect}`}
                  />
                  <div
                    className="test-result-dist-seg test-result-dist-seg--skip"
                    style={{ width: `${(counts.skipped / counts.total) * 100}%` }}
                    title={`Skipped: ${counts.skipped}`}
                  />
                </div>
                <ul className="test-result-dist-legend">
                  <li>
                    <span className="swatch swatch--ok" /> Correct ({counts.correct})
                  </li>
                  <li>
                    <span className="swatch swatch--bad" /> Incorrect ({counts.incorrect})
                  </li>
                  <li>
                    <span className="swatch swatch--skip" /> Skipped ({counts.skipped})
                  </li>
                </ul>
              </div>
            )}

            {data.analytics?.byTopic?.length > 0 && (
              <div className="test-result-table-wrap">
                <h3 className="test-result-subheading">By topic</h3>
                <table className="test-result-table">
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Marks earned</th>
                      <th>Available</th>
                      <th>Items (✓ / ✗ / —)</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.analytics.byTopic.map((row) => (
                      <tr key={row.topicName}>
                        <td>{row.topicName}</td>
                        <td>{row.marksEarned}</td>
                        <td>{row.marksAvailable}</td>
                        <td>
                          {row.correct} / {row.incorrect} / {row.skipped}
                        </td>
                        <td>{row.accuracy != null ? `${row.accuracy}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.analytics?.byDifficulty?.length > 0 && (
              <div className="test-result-table-wrap">
                <h3 className="test-result-subheading">By difficulty</h3>
                <table className="test-result-table">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Correct / total</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.analytics.byDifficulty.map((row) => (
                      <tr key={row.level}>
                        <td>{row.level}</td>
                        <td>
                          {row.correct} / {row.total}
                        </td>
                        <td>{row.accuracy != null ? `${row.accuracy}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.resultDetails?.length > 0 && (
            <section className="test-result-section" aria-labelledby="rd-heading">
              <h2 id="rd-heading" className="test-result-section-title">
                <Layers size={20} aria-hidden />
                By subject and topic
              </h2>
              <div className="test-result-table-wrap">
                <table className="test-result-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Topic</th>
                      <th>Marks</th>
                      <th>Out of</th>
                      <th>Percentile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.resultDetails.map((rd, i) => {
                      const subj = rd.subjectName ?? rd.SubjectName ?? '—';
                      const topic = rd.topicName ?? rd.TopicName ?? '—';
                      return (
                        <tr key={`${rd.TopicID ?? rd.topicId ?? rd.SubjectID ?? rd.subjectId ?? i}`}>
                          <td>{subj}</td>
                          <td>{topic}</td>
                          <td>{rd.ObtainedMarks ?? rd.obtainedMarks ?? '—'}</td>
                          <td>{rd.MaxMarks ?? rd.maxMarks ?? '—'}</td>
                          <td>{rd.Percentile ?? rd.percentile ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.certificate && (
            <section className="test-result-section test-result-section--accent" aria-labelledby="cert-heading">
              <h2 id="cert-heading" className="test-result-section-title">
                <Award size={20} aria-hidden />
                Certificate
              </h2>
              <p className="muted">
                Type: {data.certificate.CertificateType ?? data.certificate.certificateType ?? '—'} · Status:{' '}
                {data.certificate.Status ?? data.certificate.status ?? '—'}
                {(data.certificate.IssueDate ?? data.certificate.issueDate) &&
                  ` · Issued ${formatWhen(data.certificate.IssueDate ?? data.certificate.issueDate)}`}
              </p>
              {(data.certificate.CertificateURL ?? data.certificate.certificateURL) && (
                <a
                  className="test-result-external"
                  href={data.certificate.CertificateURL ?? data.certificate.certificateURL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open certificate <ExternalLink size={16} aria-hidden />
                </a>
              )}
            </section>
          )}

          <section className="test-result-section" aria-labelledby="review-heading">
            <h2 id="review-heading" className="test-result-section-title">
              <FileText size={20} aria-hidden />
              Question review
            </h2>
            <div className="test-result-items">
              {data.questions?.map((q) => (
                <details key={q.questionId} className="test-result-item">
                  <summary className="test-result-item-summary">
                    <span className={`test-result-item-status test-result-item-status--${q.status}`}>
                      {statusIcon(q.status)}
                      {q.status}
                    </span>
                    <span className="test-result-item-marks">
                      {q.marksEarned} / {q.marksAvailable} pts
                    </span>
                    <span className="test-result-item-title">
                      Q{q.order}
                      {q.topicName ? ` · ${q.topicName}` : ''}
                    </span>
                  </summary>
                  <div className="test-result-item-body">
                    <p className="test-result-item-stem">{q.questionText}</p>
                    <span className="muted small">{q.questionType}</span>
                    <ul className="test-result-options">
                      {q.options?.map((opt) => {
                        const cls = [
                          'test-result-opt',
                          opt.isCorrect && 'test-result-opt--correct',
                          opt.wasSelected && 'test-result-opt--selected',
                          opt.wasSelected && !opt.isCorrect && 'test-result-opt--wrong',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <li key={opt.optionId} className={cls}>
                            <span className="test-result-opt-letter">
                              {String.fromCharCode(64 + (Number(opt.optionNumber) || 1))}
                            </span>
                            <span>{opt.optionText}</span>
                            {opt.isCorrect && <span className="test-result-opt-tag">Key</span>}
                            {opt.wasSelected && <span className="test-result-opt-tag">Your pick</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </section>

        </>
      )}
    </div>
  );
}
