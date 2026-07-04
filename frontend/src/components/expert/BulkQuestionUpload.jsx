import { useEffect, useMemo, useState } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { questionAPI } from '../../services/api';
import './BulkQuestionUpload.css';

const buildContext = (form) => ({
  examId: form.examId || null,
  subjectId: form.subjectId || null,
  chapterId: form.chapterId || null,
  topicId: form.topicId || null,
  defaultDifficulty: 'Medium',
  defaultQuestionType: 'Single Correct',
  defaultSource: 'Self',
});

const BulkQuestionUpload = ({ disabled = false }) => {
  const [examsList, setExamsList] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [contextForm, setContextForm] = useState({
    examId: '',
    subjectId: '',
    chapterId: '',
    topicId: '',
  });
  const [csvText, setCsvText] = useState('');
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

  const contextReady = Boolean(contextForm.topicId);

  const handleDownloadTemplate = async () => {
    try {
      setBusy('template');
      const blob = await questionAPI.downloadBulkTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'propath-questions-template.csv';
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
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvText(e.target?.result || '');
      setParsedRows([]);
      setParseErrors([]);
      setCommitResult(null);
    };
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!contextReady) {
      setError('Select exam, subject, and topic before parsing');
      return;
    }
    setError('');
    setBusy('parse');
    try {
      const res = await questionAPI.parseBulkCsv({
        csv: csvText,
        context: buildContext(contextForm),
      });
      setParsedRows(res.rows || []);
      setParseErrors(res.errors || []);
    } catch (err) {
      setError(err.message || 'Failed to parse CSV');
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
        setCsvText('');
        setParsedRows([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to import questions');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`bulk-upload ${disabled ? 'bulk-upload--disabled' : ''}`}>
      <div className="bulk-upload-intro">
        <FileText size={20} />
        <div>
          <strong>Bulk CSV upload</strong>
          <p>
            Step 1 — pick exam context (dropdowns). Step 2 — upload a CSV with question text, options, and correct
            markers. See template for column format.
          </p>
        </div>
      </div>

      <div className="bulk-upload-context">
        <h3>1. Context</h3>
        {loadingExams ? (
          <p className="bulk-muted">
            <Loader2 size={14} className="spinner" /> Loading exams…
          </p>
        ) : (
          <div className="bulk-context-grid">
            <label>
              <span>Exam</span>
              <select
                value={contextForm.examId}
                onChange={(e) =>
                  setContextForm({
                    examId: e.target.value,
                    subjectId: '',
                    chapterId: '',
                    topicId: '',
                  })
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
              <span>Subject</span>
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
              <span>Chapter (optional)</span>
              <select
                value={contextForm.chapterId}
                disabled={!contextForm.subjectId}
                onChange={(e) =>
                  setContextForm((prev) => ({ ...prev, chapterId: e.target.value, topicId: '' }))
                }
              >
                <option value="">Any chapter</option>
                {chapters.map((c) => (
                  <option key={c.ChapterID} value={c.ChapterID}>
                    {c.ChapterName || `Chapter ${c.ChapterNumber}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Topic</span>
              <select
                value={contextForm.topicId}
                disabled={!contextForm.subjectId}
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
          </div>
        )}
      </div>

      <div className="bulk-upload-file">
        <h3>2. Upload CSV</h3>
        <div className="bulk-upload-actions">
          <button type="button" className="btn-secondary" onClick={handleDownloadTemplate} disabled={!!busy}>
            <Download size={16} />
            {busy === 'template' ? 'Downloading…' : 'Download template'}
          </button>
          <label className="btn-secondary bulk-file-label">
            <Upload size={16} />
            Choose file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
              hidden
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={handleParse}
            disabled={!csvText || !contextReady || !!busy}
          >
            {busy === 'parse' ? <Loader2 size={16} className="spinner" /> : null}
            Preview rows
          </button>
        </div>
        {csvText && <p className="bulk-muted">{csvText.split('\n').filter(Boolean).length - 1} data row(s) loaded</p>}
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
