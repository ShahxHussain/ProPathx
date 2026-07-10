import { useEffect, useMemo, useState } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { questionAPI } from '../../services/api';
import {
  BULK_TEMPLATE_INSTRUCTIONS,
  BULK_TEMPLATE_MODES,
  getBulkGenerateButtonLabel,
  getBulkTemplateHelperText,
  getBulkTemplateModeLabel,
  getTopicChapterId,
  resolveBulkTemplateMode,
} from '../../utils/bulkTemplateMode';
import './BulkQuestionUpload.css';

const PREVIEW_PAGE_SIZE = 15;
const COMMIT_BATCH_SIZE = 5;

const TEMPLATE_QUICK_COPY = `Question 1
Question text
Type question here...

Answer options
A. Option A
B. Option B

Correct answer(s)
A

Explanation
Short explanation here...`;

const buildContext = (form) => ({
  examId: form.examId || null,
  subjectId: form.subjectId || null,
  chapterId: form.chapterId || null,
  topicId: form.topicId || null,
  defaultDifficulty: form.difficulty || 'Medium',
  defaultQuestionType: form.questionType || 'Single Correct',
  defaultSource: form.source || 'Self',
});

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const triggerFileDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const BulkQuestionUpload = ({ disabled = false }) => {
  const [examsList, setExamsList] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [contextForm, setContextForm] = useState({
    examId: '',
    subjectId: '',
    chapterId: '',
    topicId: '',
    difficulty: 'Medium',
    source: 'Self',
    questionType: 'Single Correct',
  });
  const [uploadPayload, setUploadPayload] = useState(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseSummary, setParseSummary] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [commitProgress, setCommitProgress] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [downloadNotice, setDownloadNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [selectedPreviewRow, setSelectedPreviewRow] = useState(null);

  useEffect(() => {
    setDownloadNotice('');
  }, [
    contextForm.examId,
    contextForm.subjectId,
    contextForm.chapterId,
    contextForm.topicId,
  ]);

  useEffect(() => {
    setPreviewPage(1);
    setSelectedPreviewRow(null);
  }, [parsedRows]);

  useEffect(() => {
    questionAPI
      .getExamsList()
      .then((res) => setExamsList(res.exams || []))
      .catch(() => setError('Failed to load exams'))
      .finally(() => setLoadingExams(false));
  }, []);

  const selectedExam = examsList.find((e) => e.ExamID === contextForm.examId);
  const selectedSubject = selectedExam?.subjects?.find((s) => s.SubjectID === contextForm.subjectId);
  const selectedChapter = selectedSubject?.chapters?.find((c) => c.ChapterID === contextForm.chapterId);
  const chapters = selectedSubject?.chapters || [];
  const topics = useMemo(() => {
    if (!selectedSubject?.topics) return [];
    if (!contextForm.chapterId) return [];
    return selectedSubject.topics.filter(
      (topic) => getTopicChapterId(topic) === contextForm.chapterId
    );
  }, [selectedSubject, contextForm.chapterId]);
  const selectedTopic = topics.find((t) => t.TopicID === contextForm.topicId);

  const templateMode = resolveBulkTemplateMode(contextForm);
  const modeLabel = getBulkTemplateModeLabel(templateMode);
  const generateReady = Boolean(
    contextForm.examId && contextForm.subjectId && contextForm.chapterId && contextForm.topicId
  );
  const uploadReady = Boolean(
    contextForm.examId &&
      contextForm.subjectId &&
      contextForm.chapterId &&
      contextForm.topicId &&
      contextForm.difficulty &&
      contextForm.source &&
      contextForm.questionType
  );
  const isQuestionEntryMode = templateMode === BULK_TEMPLATE_MODES.QUESTION_ENTRY;
  const hasUpload = Boolean(uploadPayload);

  const helperText = getBulkTemplateHelperText(templateMode, {
    subjectName: selectedSubject?.SubjectName,
    chapterName:
      selectedChapter?.ChapterName ||
      (selectedChapter?.ChapterNumber != null ? `Chapter ${selectedChapter.ChapterNumber}` : ''),
    topicName: selectedTopic?.TopicName,
  });

  const handleDownloadTemplate = async (format) => {
    if (!generateReady) {
      setError('Select Exam, Subject, Chapter, and Topic to generate template.');
      return;
    }

    try {
      setBusy(`template-${format}`);
      setError('');
      setDownloadNotice('');
      const { blob, filename, mode } = await questionAPI.downloadBulkTemplate({
        format,
        examId: contextForm.examId,
        subjectId: contextForm.subjectId,
        chapterId: contextForm.chapterId || undefined,
        topicId: contextForm.topicId || undefined,
        defaultDifficulty: contextForm.difficulty,
        defaultSource: contextForm.source,
        defaultQuestionType: contextForm.questionType,
      });
      triggerFileDownload(blob, filename);
      const downloadedMode = getBulkTemplateModeLabel(mode || templateMode) || 'Template';
      setDownloadNotice(`Downloaded ${filename} (${downloadedMode}).`);
    } catch (err) {
      setError(err.message || 'Failed to download template');
    } finally {
      setBusy('');
    }
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!uploadReady) {
      setError('Select exam, subject, chapter, topic, difficulty, source, and question type before uploading.');
      return;
    }

    const name = file.name.toLowerCase();
    const isDocx = name.endsWith('.docx');
    const isCsv = name.endsWith('.csv') || file.type === 'text/csv';

    if (!isDocx && !isCsv) {
      setError('Please upload a .csv or .docx file');
      return;
    }

    setError('');
    setParsedRows([]);
    setParseErrors([]);
    setParseSummary(null);
    setCommitResult(null);

    if (isDocx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = arrayBufferToBase64(e.target?.result);
        setUploadPayload({ type: 'docx', docxBase64: base64 });
        setUploadLabel(file.name);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPayload({ type: 'csv', csv: e.target?.result || '' });
      setUploadLabel(file.name);
    };
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!uploadReady) {
      setError('Select full context including topic before parsing a question-entry file.');
      return;
    }
    if (!uploadPayload) return;

    setError('');
    setBusy('parse');
    setParseSummary(null);
    try {
      const res = await questionAPI.parseBulkUpload({
        csv: uploadPayload.type === 'csv' ? uploadPayload.csv : undefined,
        docxBase64: uploadPayload.type === 'docx' ? uploadPayload.docxBase64 : undefined,
        context: buildContext(contextForm),
      });
      setParsedRows(res.rows || []);
      setParseErrors(res.errors || []);
      setParseSummary(res.summary || null);
    } catch (err) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setBusy('');
    }
  };

  const handleCommit = async (status) => {
    if (!parsedRows.length) return;
    const isDraft = status === 'Draft';
    const busyKey = isDraft ? 'commit-draft' : 'commit-pending';

    setError('');
    setBusy(busyKey);
    setCommitResult(null);
    setCommitProgress({ phase: isDraft ? 'Draft' : 'Submit', processed: 0, total: parsedRows.length });

    const createdRowIndexes = new Set();
    let totalCreated = 0;
    let totalSkipped = 0;
    const allErrors = [];

    try {
      for (let i = 0; i < parsedRows.length; i += COMMIT_BATCH_SIZE) {
        const chunk = parsedRows.slice(i, i + COMMIT_BATCH_SIZE);
        const res = await questionAPI.commitBulkQuestions({
          rows: chunk,
          status,
          context: buildContext(contextForm),
        });

        totalCreated += res.created || 0;
        totalSkipped += res.skipped || 0;
        if (res.errors?.length) {
          allErrors.push(...res.errors);
        }
        if (res.createdIds?.length) {
          res.createdIds.forEach((item) => {
            if (item?.rowIndex != null) createdRowIndexes.add(item.rowIndex);
          });
        }

        setCommitProgress({
          phase: isDraft ? 'Draft' : 'Submit',
          processed: Math.min(i + chunk.length, parsedRows.length),
          total: parsedRows.length,
        });
      }

      setCommitResult({
        created: totalCreated,
        skipped: totalSkipped,
        errors: allErrors,
        status: isDraft ? 'Draft' : 'Pending',
      });

      if (totalCreated > 0) {
        setParsedRows((prev) => prev.filter((row) => !createdRowIndexes.has(row.rowIndex)));
        if (createdRowIndexes.size >= parsedRows.length) {
          setUploadPayload(null);
          setUploadLabel('');
          setParseErrors([]);
          setParseSummary(null);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setCommitProgress(null);
      setBusy('');
    }
  };

  const rowCountLabel =
    uploadPayload?.type === 'csv'
      ? `${Math.max(0, (uploadPayload.csv || '').split('\n').filter(Boolean).length - 1)} data row(s) loaded`
      : uploadLabel
        ? `Word file loaded: ${uploadLabel}`
        : '';

  const totalPreviewPages = Math.max(1, Math.ceil(parsedRows.length / PREVIEW_PAGE_SIZE));
  const previewStart = (previewPage - 1) * PREVIEW_PAGE_SIZE;
  const previewRows = parsedRows.slice(previewStart, previewStart + PREVIEW_PAGE_SIZE);

  const rowLevelErrors = parseErrors.filter(
    (e) => e.code !== 'SKIPPED' && e.index > 0 && e.severity !== 'info'
  );
  const infoNotices = parseErrors.filter((e) => e.code === 'SKIPPED' || e.severity === 'info');
  const fileLevelErrors = parseErrors.filter((e) => e.index === 0 && e.code !== 'SKIPPED');
  const canImportParsed = parseSummary?.canImport ?? parsedRows.length > 0;
  const isCommitting = busy === 'commit-draft' || busy === 'commit-pending';
  const commitProgressPct = commitProgress
    ? Math.round((commitProgress.processed / commitProgress.total) * 100)
    : 0;
  const commitErrors = commitResult?.errors || [];
  const duplicateCommitErrors = commitErrors.filter((e) => e.code === 'DUPLICATE');
  const otherCommitErrors = commitErrors.filter((e) => e.code !== 'DUPLICATE');

  const getCorrectAnswerLabel = (row) => {
    const answers = (row.options || [])
      .filter((opt) => opt.isCorrect)
      .map((opt) => String(opt.optionText || '').trim())
      .filter(Boolean);
    return answers.length ? answers.join(' | ') : '—';
  };

  const handleCopyTemplateBlock = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(TEMPLATE_QUICK_COPY);
      } else {
        const ta = document.createElement('textarea');
        ta.value = TEMPLATE_QUICK_COPY;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyNotice('Template block copied.');
    } catch (_err) {
      setCopyNotice('Copy failed. Please copy manually from the block.');
    }
  };

  return (
    <div className={`bulk-upload ${disabled ? 'bulk-upload--disabled' : ''}`}>
      <div className="bulk-upload-intro">
        <FileText size={20} />
        <div>
          <strong>Bulk Questions / Word upload</strong>
        </div>
      </div>

      <div className="bulk-upload-context">
        <h3>1. Context (applies to all questions)</h3>
        {loadingExams ? (
          <p className="bulk-muted">
            <Loader2 size={14} className="spinner" /> Loading exams…
          </p>
        ) : (
          <div className="bulk-context-grid">
            <label>
              <span>Exam *</span>
              <select
                value={contextForm.examId}
                onChange={(e) =>
                  setContextForm((prev) => ({
                    ...prev,
                    examId: e.target.value,
                    subjectId: '',
                    chapterId: '',
                    topicId: '',
                  }))
                }
              >
                <option value="">Select exam</option>
                {examsList.map((exam) => (
                  <option key={exam.ExamID} value={exam.ExamID}>
                    {exam.ExamName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Subject *</span>
              <select
                value={contextForm.subjectId}
                disabled={!contextForm.examId}
                onChange={(e) =>
                  setContextForm((prev) => ({
                    ...prev,
                    subjectId: e.target.value,
                    chapterId: '',
                    topicId: '',
                  }))
                }
              >
                <option value="">Select subject</option>
                {(selectedExam?.subjects || []).map((s) => (
                  <option key={s.SubjectID} value={s.SubjectID}>
                    {s.SubjectName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Chapter *</span>
              <select
                value={contextForm.chapterId}
                disabled={!contextForm.subjectId}
                onChange={(e) =>
                  setContextForm((prev) => ({ ...prev, chapterId: e.target.value, topicId: '' }))
                }
              >
                <option value="">Select chapter</option>
                {chapters.map((c) => (
                  <option key={c.ChapterID} value={c.ChapterID}>
                    {[c.ChapterNumber != null ? `Ch. ${c.ChapterNumber}` : '', c.ChapterName]
                      .filter(Boolean)
                      .join(': ') || c.ChapterName || 'Unnamed chapter'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Topic *</span>
              <select
                value={contextForm.topicId}
                disabled={!contextForm.chapterId}
                onChange={(e) => setContextForm((prev) => ({ ...prev, topicId: e.target.value }))}
              >
                <option value="">
                  {contextForm.chapterId ? 'Select topic' : 'Select chapter first'}
                </option>
                {topics.map((t) => (
                  <option key={t.TopicID} value={t.TopicID}>
                    {t.TopicName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Difficulty *</span>
              <select
                value={contextForm.difficulty}
                onChange={(e) => setContextForm((prev) => ({ ...prev, difficulty: e.target.value }))}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>
            <label>
              <span>Source *</span>
              <select
                value={contextForm.source}
                onChange={(e) => setContextForm((prev) => ({ ...prev, source: e.target.value }))}
              >
                <option value="Self">Self Created</option>
                <option value="AI">AI Generated</option>
                <option value="Reference">Reference Material</option>
                <option value="Previous">Previous Exam</option>
              </select>
            </label>
            <label>
              <span>Question type *</span>
              <select
                value={contextForm.questionType}
                onChange={(e) =>
                  setContextForm((prev) => ({ ...prev, questionType: e.target.value }))
                }
              >
                <option value="Single Correct">Single Correct</option>
                <option value="Multiple Correct">Multiple Correct</option>
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="bulk-upload-generate">
        <h3>2. Generate file for entering questions + quick copy</h3>
        <div className="bulk-generate-layout">
          <div>
            {modeLabel && <span className="bulk-mode-badge">{modeLabel}</span>}
            <p className="bulk-helper-text">
              <strong>{helperText.headline}</strong>
              <span>{helperText.detail}</span>
            </p>
            <div className="bulk-upload-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownloadTemplate('csv')}
                disabled={!generateReady || !!busy}
              >
                <Download size={16} />
                {busy === 'template-csv' ? 'Downloading…' : getBulkGenerateButtonLabel(templateMode, 'csv')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownloadTemplate('docx')}
                disabled={!generateReady || !!busy}
              >
                <Download size={16} />
                {busy === 'template-docx'
                  ? 'Downloading…'
                  : getBulkGenerateButtonLabel(templateMode, 'docx')}
              </button>
            </div>
            {downloadNotice && (
              <p className="bulk-download-notice">
                <CheckCircle2 size={14} />
                {downloadNotice}
              </p>
            )}
            <div className="bulk-template-instructions">
              <strong>How to use the downloaded template</strong>
              <ol>
                {BULK_TEMPLATE_INSTRUCTIONS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
          </div>
          <aside className="bulk-template-copy-card">
            <div className="bulk-template-copy-head">
              <strong>Template quick copy</strong>
              <button type="button" className="btn-secondary" onClick={handleCopyTemplateBlock}>
                Copy block
              </button>
            </div>
            <p className="bulk-muted">Paste this block in Word and duplicate for more questions.</p>
            <pre className="bulk-template-copy-box">{TEMPLATE_QUICK_COPY}</pre>
            {copyNotice ? <p className="bulk-download-notice">{copyNotice}</p> : null}
          </aside>
        </div>
      </div>

      <div className={`bulk-upload-file ${!isQuestionEntryMode ? 'bulk-upload-file--gated' : ''}`}>
        <h3>3. Upload file → Preview → Commit</h3>
        {!generateReady ? (
          <p className="bulk-muted bulk-upload-gate">
            Select Exam, Subject, Chapter, and Topic first.
          </p>
        ) : (
          <>
            <div className="bulk-upload-actions">
              <label className="btn-secondary bulk-file-label">
                <Upload size={16} />
                Choose file
                <input
                  type="file"
                  accept=".csv,text/csv,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  hidden
                  disabled={!uploadReady}
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                onClick={handleParse}
                disabled={!hasUpload || !uploadReady || !!busy}
              >
                {busy === 'parse' ? <Loader2 size={16} className="spinner" /> : null}
                Preview rows
              </button>
            </div>
            {rowCountLabel && <p className="bulk-muted">{rowCountLabel}</p>}
          </>
        )}
      </div>

      {parseSummary && (
        <div
          className={`bulk-parse-summary bulk-parse-summary--${parseSummary.status || 'empty'}`}
        >
          <strong>{parseSummary.headline}</strong>
          {parseSummary.detail && <p>{parseSummary.detail}</p>}
          {parseSummary.status === 'partial' && parseSummary.failedIndexes?.length > 0 && (
            <p className="bulk-parse-failed-list">
              Skipped: {parseSummary.failedIndexes.join(', ')}
            </p>
          )}
        </div>
      )}

      {infoNotices.length > 0 && (
        <div className="bulk-parse-info">
          <ul>
            {infoNotices.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {fileLevelErrors.length > 0 && (
        <div className="bulk-errors">
          <h4>File issue</h4>
          <ul>
            {fileLevelErrors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {rowLevelErrors.length > 0 && (
        <div className="bulk-errors bulk-errors--partial">
          <h4>
            Questions with issues ({rowLevelErrors.length})
            {canImportParsed ? ' — valid questions can still be imported' : ''}
          </h4>
          <ul>
            {rowLevelErrors.map((e, i) => (
              <li key={i}>
                <span className="bulk-error-ref">{e.ref || `Question ${e.index}`}</span>
                {e.questionPreview ? (
                  <span className="bulk-error-preview">“{e.questionPreview}”</span>
                ) : null}
                <span className="bulk-error-message">{e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsedRows.length > 0 && canImportParsed && (
        <div className="bulk-preview">
          <h3>
            Preview ({parsedRows.length} ready
            {rowLevelErrors.length > 0 ? ` · ${rowLevelErrors.length} skipped` : ''})
          </h3>
          <p className="bulk-muted bulk-preview-context">
            Applied to all: {contextForm.difficulty} difficulty ·{' '}
            {contextForm.source === 'Self' ? 'Self Created' : contextForm.source} source ·{' '}
            {contextForm.questionType}
          </p>
          <div className="bulk-preview-table-wrap">
            <table className="bulk-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Correct answer</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={selectedPreviewRow === row.rowIndex ? 'bulk-preview-row--selected' : ''}
                    onClick={() => setSelectedPreviewRow(row.rowIndex)}
                  >
                    <td>{row.rowIndex}</td>
                    <td>{row.questionText.substring(0, 80)}</td>
                    <td>{getCorrectAnswerLabel(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 15 && (
            <div className="bulk-preview-pagination">
              <p className="bulk-muted">
                Showing {previewStart + 1}–{Math.min(previewStart + PREVIEW_PAGE_SIZE, parsedRows.length)} of{' '}
                {parsedRows.length} rows
              </p>
              <div className="bulk-upload-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  disabled={previewPage === 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                  disabled={previewPage === totalPreviewPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div className="bulk-commit-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleCommit('Draft')}
              disabled={isCommitting}
            >
              {busy === 'commit-draft' ? <Loader2 size={16} className="spinner" /> : null}
              {busy === 'commit-draft' ? 'Saving drafts…' : 'Save all as drafts'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleCommit('Pending')}
              disabled={isCommitting}
            >
              {busy === 'commit-pending' ? <Loader2 size={16} className="spinner" /> : null}
              {busy === 'commit-pending' ? 'Submitting…' : 'Submit all for review'}
            </button>
          </div>

          {commitProgress && (
            <div className="bulk-commit-progress" role="status" aria-live="polite">
              <div className="bulk-commit-progress-head">
                <Loader2 size={16} className="spinner" />
                <span>
                  {commitProgress.phase === 'Draft' ? 'Saving drafts' : 'Submitting for review'} —{' '}
                  {commitProgress.processed} of {commitProgress.total}
                </span>
                <span className="bulk-commit-progress-pct">{commitProgressPct}%</span>
              </div>
              <div className="bulk-commit-progress-track">
                <div
                  className="bulk-commit-progress-fill"
                  style={{ width: `${commitProgressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {commitResult && (
        <div className="bulk-success">
          <CheckCircle2 size={18} />
          <span>
            {commitResult.status === 'Draft' ? 'Saved' : 'Submitted'} {commitResult.created}{' '}
            question(s)
            {commitResult.skipped > 0 ? ` · ${commitResult.skipped} skipped` : ''}
          </span>
        </div>
      )}

      {duplicateCommitErrors.length > 0 && (
        <div className="bulk-errors bulk-errors--duplicates">
          <h4>Duplicates skipped ({duplicateCommitErrors.length})</h4>
          <ul>
            {duplicateCommitErrors.map((e, i) => (
              <li key={i}>
                <span className="bulk-error-ref">Question {e.rowIndex}</span>
                <span className="bulk-error-message">{e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {otherCommitErrors.length > 0 && (
        <div className="bulk-errors bulk-errors--partial">
          <h4>Import issues ({otherCommitErrors.length})</h4>
          <ul>
            {otherCommitErrors.map((e, i) => (
              <li key={i}>
                <span className="bulk-error-ref">Question {e.rowIndex}</span>
                <span className="bulk-error-message">{e.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="bulk-error-banner">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </div>
  );
};

export default BulkQuestionUpload;
