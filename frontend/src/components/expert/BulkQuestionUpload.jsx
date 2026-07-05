import { useEffect, useMemo, useState } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { questionAPI } from '../../services/api';
import './BulkQuestionUpload.css';

const buildContext = (form) => ({
  examId: form.examId || null,
  subjectId: form.subjectId || null,
  chapterId: form.chapterId || null,
  topicId: form.topicId || null,
  defaultDifficulty: form.difficulty || 'Medium',
  defaultQuestionType: 'Single Correct',
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
  });
  const [uploadPayload, setUploadPayload] = useState(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [commitResult, setCommitResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    questionAPI
      .getExamsList()
      .then((res) => setExamsList(res.exams || []))
      .catch(() => setError('Failed to load exams'))
      .finally(() => setLoadingExams(false));
  }, []);

  const selectedExam = examsList.find((e) => e.ExamID === contextForm.examId);
  const selectedSubject = selectedExam?.subjects?.find((s) => s.SubjectID === contextForm.subjectId);
  const chapters = selectedSubject?.chapters || [];
  const topics = useMemo(() => {
    if (!selectedSubject?.topics) return [];
    if (!contextForm.chapterId) return selectedSubject.topics;
    return selectedSubject.topics.filter((t) => t.ChapterID === contextForm.chapterId);
  }, [selectedSubject, contextForm.chapterId]);

  const contextReady = Boolean(
    contextForm.examId &&
      contextForm.subjectId &&
      contextForm.chapterId &&
      contextForm.topicId &&
      contextForm.difficulty &&
      contextForm.source
  );
  const hasUpload = Boolean(uploadPayload);

  const handleDownloadTemplate = async (format) => {
    try {
      setBusy(`template-${format}`);
      const blob = await questionAPI.downloadBulkTemplate(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        format === 'docx' ? 'propath-questions-template.docx' : 'propath-questions-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download template');
    } finally {
      setBusy('');
    }
  };

  const handleFile = (file) => {
    if (!file) return;

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
    if (!contextReady) {
      setError('Select exam, subject, chapter, topic, difficulty, and source before parsing');
      return;
    }
    if (!uploadPayload) return;

    setError('');
    setBusy('parse');
    try {
      const res = await questionAPI.parseBulkUpload({
        csv: uploadPayload.type === 'csv' ? uploadPayload.csv : undefined,
        docxBase64: uploadPayload.type === 'docx' ? uploadPayload.docxBase64 : undefined,
        context: buildContext(contextForm),
      });
      setParsedRows(res.rows || []);
      setParseErrors(res.errors || []);
    } catch (err) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setBusy('');
    }
  };

  const handleCommit = async (status) => {
    if (!parsedRows.length) return;
    setError('');
    setBusy('commit');
    try {
      const res = await questionAPI.commitBulkQuestions({
        rows: parsedRows,
        status,
        context: buildContext(contextForm),
      });
      setCommitResult(res);
      if (res.created > 0) {
        setUploadPayload(null);
        setUploadLabel('');
        setParsedRows([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setBusy('');
    }
  };

  const rowCountLabel =
    uploadPayload?.type === 'csv'
      ? `${Math.max(0, (uploadPayload.csv || '').split('\n').filter(Boolean).length - 1)} data row(s) loaded`
      : uploadLabel
        ? `Word file loaded: ${uploadLabel}`
        : '';

  return (
    <div className={`bulk-upload ${disabled ? 'bulk-upload--disabled' : ''}`}>
      <div className="bulk-upload-intro">
        <FileText size={20} />
        <div>
          <strong>Bulk CSV / Word upload</strong>
          <p>
            Step 1 — select exam context, difficulty, and source below (applied to every imported
            question). Step 2 — upload a file with question text, options, and correct answers only.
          </p>
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
                    {c.ChapterName || `Chapter ${c.ChapterNumber}`}
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
                <option value="">Select topic</option>
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
          </div>
        )}
      </div>

      <div className="bulk-upload-file">
        <h3>2. Upload file</h3>
        <div className="bulk-upload-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleDownloadTemplate('csv')}
            disabled={!!busy}
          >
            <Download size={16} />
            {busy === 'template-csv' ? 'Downloading…' : 'CSV template'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => handleDownloadTemplate('docx')}
            disabled={!!busy}
          >
            <Download size={16} />
            {busy === 'template-docx' ? 'Downloading…' : 'Word template (document)'}
          </button>
          <label className="btn-secondary bulk-file-label">
            <Upload size={16} />
            Choose file
            <input
              type="file"
              accept=".csv,text/csv,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => handleFile(e.target.files?.[0])}
              hidden
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={handleParse}
            disabled={!hasUpload || !contextReady || !!busy}
          >
            {busy === 'parse' ? <Loader2 size={16} className="spinner" /> : null}
            Preview rows
          </button>
        </div>
        {rowCountLabel && <p className="bulk-muted">{rowCountLabel}</p>}
      </div>

      {parseErrors.length > 0 && (
        <div className="bulk-errors">
          <h4>Parse errors</h4>
          <ul>
            {parseErrors.map((e, i) => (
              <li key={i}>
                Row {e.index}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsedRows.length > 0 && (
        <div className="bulk-preview">
          <h3>3. Preview ({parsedRows.length} valid rows)</h3>
          <p className="bulk-muted bulk-preview-context">
            Applied to all: {contextForm.difficulty} difficulty ·{' '}
            {contextForm.source === 'Self' ? 'Self Created' : contextForm.source} source
          </p>
          <div className="bulk-preview-table-wrap">
            <table className="bulk-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Correct</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 15).map((row) => (
                  <tr key={row.rowIndex}>
                    <td>{row.rowIndex}</td>
                    <td>{row.questionText.substring(0, 80)}</td>
                    <td>{row.questionType}</td>
                    <td>{row.options.filter((o) => o.isCorrect).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 15 && <p className="bulk-muted">Showing first 15 of {parsedRows.length} rows</p>}
          <div className="bulk-commit-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleCommit('Draft')}
              disabled={!!busy}
            >
              Save all as drafts
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleCommit('Pending')}
              disabled={!!busy}
            >
              {busy === 'commit' ? <Loader2 size={16} className="spinner" /> : null}
              Submit all for review
            </button>
          </div>
        </div>
      )}

      {commitResult && (
        <div className="bulk-success">
          <CheckCircle2 size={18} />
          <span>
            Created {commitResult.created} question(s)
            {commitResult.skipped > 0 ? ` · ${commitResult.skipped} skipped` : ''}
          </span>
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
