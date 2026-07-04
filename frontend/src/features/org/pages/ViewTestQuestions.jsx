import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { testAPI } from '../../../services/api';
import { getTestScheduleLabel } from '../utils/testScheduleLabel.js';
import LaTeXRenderer from '../../../components/latex/LaTeXRenderer';
import './ViewTestQuestions.css';

const ViewTestQuestions = () => {
  const navigate = useNavigate();
  const { testId } = useParams();
  const printRef = useRef(null);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    setError('');
    testAPI
      .getTestDetails(testId)
      .then((res) => setTest(res.test))
      .catch((err) => {
        setError(err.message || 'Could not load test');
        setTest(null);
      })
      .finally(() => setLoading(false));
  }, [testId]);

  const handlePrintOrPdf = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${(test?.TestName || 'Test').replace(/</g, '&lt;')} - Questions</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4X0v0t4R4JECmylDxAa8RHD6zJ9OAo4lgHdJZc8P1c6I0g6" crossorigin="anonymous">
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; color: #1e293b; }
            .vtq-print-header h1 { font-size: 22px; margin-bottom: 8px; }
            .vtq-print-meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
            .vtq-item { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0; }
            .vtq-item:last-child { border-bottom: none; }
            .vtq-q-num { font-weight: 600; color: #475569; margin-bottom: 6px; }
            .vtq-q-text { margin-bottom: 12px; line-height: 1.5; white-space: pre-wrap; }
            .vtq-options { margin-left: 16px; }
            .vtq-option { margin-bottom: 6px; padding: 4px 0; }
            .vtq-option-correct { font-weight: 600; color: #059669; }
            .vtq-q-meta { font-size: 12px; color: #94a3b8; margin-top: 8px; }
            .katex { font-size: 1.1em; }
            .katex-display { margin: 12px 0; }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const questions = test?.questions || [];

  if (loading) {
    return (
      <div className="view-test-questions-page">
        <div className="vtq-loading">Loading questions…</div>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="view-test-questions-page">
        <button type="button" className="vtq-back" onClick={() => navigate('/org/tests')}>
          <ArrowLeft size={18} />
          Back to Tests
        </button>
        <div className="vtq-error">{error || 'Test not found'}</div>
      </div>
    );
  }

  return (
    <div className="view-test-questions-page">
      <header className="vtq-header">
        <button type="button" className="vtq-back" onClick={() => navigate('/org/tests')}>
          <ArrowLeft size={18} />
          Back to Tests
        </button>
        <h1 className="vtq-title">Questions in this test</h1>
        <p className="vtq-subtitle">
          {test.TestName} · {test.Exams?.ExamName} · {getTestScheduleLabel(test)} · {questions.length} question{questions.length !== 1 ? 's' : ''}
        </p>
        <div className="vtq-actions">
          <button type="button" className="vtq-btn vtq-btn-primary" onClick={handlePrintOrPdf}>
            <Download size={18} />
            Export as PDF / Print
          </button>
        </div>
      </header>

      <div ref={printRef} className="vtq-print-content">
        <div className="vtq-print-header">
          <h1>{test.TestName}</h1>
          <p className="vtq-print-meta">
            {test.Exams?.ExamName} · {getTestScheduleLabel(test)} · {test.TestDate ? new Date(test.TestDate).toLocaleDateString() : ''} · {questions.length} questions
          </p>
        </div>
        {questions.length === 0 ? (
          <p className="vtq-empty">No questions have been added to this test yet.</p>
        ) : (
          <ol className="vtq-list">
            {questions.map((tq, index) => {
              const q = tq.Questions || {};
              const options = q.Options || [];
              const sortedOptions = [...options].sort((a, b) => (a.OptionNumber || 0) - (b.OptionNumber || 0));
              return (
                <li key={tq.QuestionID || q.QuestionID || index} className="vtq-item">
                  <div className="vtq-q-num">Question {index + 1}</div>
                  <div className="vtq-q-text">
                    <LaTeXRenderer text={q.QuestionText || '—'} />
                  </div>
                  {sortedOptions.length > 0 && (
                    <ul className="vtq-options">
                      {sortedOptions.map((opt) => (
                        <li key={opt.OptionNumber} className={opt.IsCorrect ? 'vtq-option vtq-option-correct' : 'vtq-option'}>
                          {String.fromCharCode(64 + (opt.OptionNumber || 0))}. <LaTeXRenderer text={opt.OptionText || '—'} />
                          {opt.IsCorrect && ' ✓'}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="vtq-q-meta">
                    {q.DifficultyLevel} · {q.QuestionType}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {questions.length === 0 && (
        <p className="vtq-empty-inline">Add questions from the <button type="button" className="vtq-link" onClick={() => navigate('/org/test-questions')}>Questions in Tests</button> page.</p>
      )}
    </div>
  );
};

export default ViewTestQuestions;
