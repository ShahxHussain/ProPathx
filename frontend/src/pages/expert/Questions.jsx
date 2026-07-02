import { useEffect, useState } from 'react';
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Edit,
  Trash2,
  Search,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  CheckCircle2,
  Code,
} from 'lucide-react';
import { questionAPI } from '../../services/api';
import LaTeXEditor from '../../components/LaTeXEditor';
import LaTeXRenderer from '../../components/LaTeXRenderer';
import {
  statusToApiSlug,
  statusLabel,
  isVerifiedStatus,
  isDraftStatus,
} from '../../utils/questionStatus';
import './Questions.css';

const Questions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, draft, pending, verified, rejected
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState('');
  const [examsList, setExamsList] = useState([]);
  const [examsListLoading, setExamsListLoading] = useState(true);

  useEffect(() => {
    loadQuestions();
    loadExamsList();
  }, []);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await questionAPI.getQuestions();
      setQuestions(response.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (questionId) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const handleDelete = async () => {
    if (!selectedQuestion) return;

    try {
      setDeleteLoading(true);
      setError('');
      await questionAPI.deleteQuestion(selectedQuestion.QuestionID);
      setQuestions(questions.filter((q) => q.QuestionID !== selectedQuestion.QuestionID));
      setShowDeleteModal(false);
      setSelectedQuestion(null);
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    } finally {
      setDeleteLoading(false);
    }
  };

  const loadExamsList = async () => {
    try {
      setExamsListLoading(true);
      const response = await questionAPI.getExamsList();
      setExamsList(response.exams || []);
    } catch (err) {
      console.error('Failed to preload exams list:', err);
    } finally {
      setExamsListLoading(false);
    }
  };

  const handleView = (question) => {
    setSelectedQuestion(question);
    setShowViewModal(true);
  };

  const handleEdit = (question) => {
    setSelectedQuestion(question);
    setShowEditModal(true);
  };

  const filteredQuestions = questions.filter((q) => {
    const slug = statusToApiSlug(q);
    const matchesFilter = filter === 'all' || slug === filter;

    const matchesSearch =
      !searchQuery ||
      q.QuestionText?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.ExamName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.SubjectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.TopicName?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStatusIcon = (question) => {
    const slug = statusToApiSlug(question);
    if (slug === 'verified') return CheckCircle;
    if (slug === 'rejected') return XCircle;
    if (slug === 'draft') return FileText;
    return Clock;
  };

  const getStatusColor = (question) => {
    const slug = statusToApiSlug(question);
    if (slug === 'verified') return 'green';
    if (slug === 'rejected') return 'red';
    if (slug === 'draft') return 'slate';
    return 'orange';
  };

  const getStatusText = (question) => statusLabel(question);

  const countByStatus = (slug) =>
    questions.filter((q) => statusToApiSlug(q) === slug).length;

  return (
    <div className="my-questions-page">
      <div className="page-header">
        <h1>My Questions</h1>
        <p className="page-subtitle">View and manage all your submitted questions</p>
      </div>

      <div className="questions-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search questions, exams, subjects, topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <FileText size={18} />
            <span>All ({questions.length})</span>
          </button>
          <button
            className={`filter-tab ${filter === 'draft' ? 'active' : ''}`}
            onClick={() => setFilter('draft')}
          >
            <FileText size={18} />
            <span>Draft ({countByStatus('draft')})</span>
          </button>
          <button
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            <Clock size={18} />
            <span>Pending ({countByStatus('pending')})</span>
          </button>
          <button
            className={`filter-tab ${filter === 'verified' ? 'active' : ''}`}
            onClick={() => setFilter('verified')}
          >
            <CheckCircle size={18} />
            <span>Verified ({countByStatus('verified')})</span>
          </button>
          <button
            className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            <XCircle size={18} />
            <span>Rejected ({countByStatus('rejected')})</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <Loader2 size={24} className="spinner" />
          <span>Loading questions...</span>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No questions found</h3>
          <p>
            {searchQuery || filter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : "You haven't created any questions yet"}
          </p>
        </div>
      ) : (
        <div className="questions-list">
          {filteredQuestions.map((question) => {
            const StatusIcon = getStatusIcon(question);
            const statusColor = getStatusColor(question);
            const statusText = getStatusText(question);
            const isExpanded = expandedQuestions.has(question.QuestionID);
            // Allow edit if not verified (backend will check if user is creator)
            // Allow delete only if not verified and not used in tests (backend will check)
            const canEdit = !isVerifiedStatus(question);
            const canDelete = !isVerifiedStatus(question);

            return (
              <div key={question.QuestionID} className="question-card">
                <div className="question-header">
                  <div className="question-info">
                    <div className="question-main">
                      <h3 className="question-text">
                        <LaTeXRenderer text={question.QuestionText} />
                      </h3>
                      <div className="question-meta">
                        <span className="question-context">
                          {[question.ExamName, question.SubjectName, question.TopicName]
                            .filter(Boolean)
                            .join(' → ') || 'No topic assigned'}
                        </span>
                      </div>
                    </div>
                    <div className="question-badges">
                      <span className={`badge badge-difficulty badge-${question.DifficultyLevel?.toLowerCase()}`}>
                        {question.DifficultyLevel || 'Medium'}
                      </span>
                      <span className={`badge badge-status badge-${statusColor}`}>
                        <StatusIcon size={14} />
                        {statusText}
                      </span>
                      {question.QuestionType && (
                        <span className="badge badge-type">
                          {question.QuestionType}
                        </span>
                      )}
                      <span className="question-date">
                        {new Date(question.CreatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {question.ReviewerComments && (
                      <div className="reviewer-comments">
                        <strong>Reviewer Comments:</strong> {question.ReviewerComments}
                      </div>
                    )}
                  </div>
                  <div className="question-actions">
                    <button
                      className="btn-icon"
                      onClick={() => handleView(question)}
                      title="View details"
                    >
                      <Eye size={18} />
                    </button>
                    {canEdit && (
                      <button
                        className="btn-icon"
                        onClick={() => handleEdit(question)}
                        title="Edit question"
                      >
                        <Edit size={18} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        className="btn-icon danger"
                        onClick={() => {
                          setSelectedQuestion(question);
                          setShowDeleteModal(true);
                        }}
                        title="Delete question"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => toggleExpand(question.QuestionID)}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="question-details">
                    {question.Explanation && (
                      <div className="detail-section">
                        <strong>Explanation:</strong>
                        <div className="explanation-display">
                          <LaTeXRenderer text={question.Explanation} />
                        </div>
                      </div>
                    )}
                    <div className="detail-section">
                      <strong>Source:</strong> {question.Source || 'Self'}
                    </div>
                    {question.VerifiedAt && (
                      <div className="detail-section">
                        <strong>Verified At:</strong>{' '}
                        {new Date(question.VerifiedAt).toLocaleString()}
                      </div>
                    )}
                    {question.TimesUsed !== undefined && (
                      <div className="detail-section">
                        <strong>Usage Stats:</strong> Used {question.TimesUsed} times | Correct:{' '}
                        {question.TimesCorrect || 0} | Incorrect: {question.TimesIncorrect || 0}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedQuestion && (
        <ViewQuestionModal
          question={selectedQuestion}
          onClose={() => {
            setShowViewModal(false);
            setSelectedQuestion(null);
          }}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedQuestion && (
        <EditQuestionModal
          question={selectedQuestion}
          examsList={examsList}
          examsListLoading={examsListLoading}
          onClose={() => {
            setShowEditModal(false);
            setSelectedQuestion(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedQuestion(null);
            loadQuestions();
          }}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedQuestion && (
        <DeleteQuestionModal
          question={selectedQuestion}
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setSelectedQuestion(null);
          }}
          loading={deleteLoading}
        />
      )}
    </div>
  );
};

// View Question Modal Component
const ViewQuestionModal = ({ question, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Question Details</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="view-question">
            <div className="view-section">
              <label>Question</label>
              <div className="question-text-display">
                <LaTeXRenderer text={question.QuestionText} />
              </div>
            </div>
            <div className="view-section">
              <label>Context</label>
              <p>
                {question.ExamName} → {question.SubjectName} → {question.TopicName}
              </p>
            </div>
            <div className="view-section">
              <label>Options</label>
              <div className="options-list-view">
                {(question.options || []).map((option, index) => (
                  <div
                    key={index}
                    className={`option-view ${option.IsCorrect ? 'correct' : ''}`}
                  >
                    <span className="option-number">{index + 1}.</span>
                    <span className="option-text">
                      <LaTeXRenderer text={option.OptionText} />
                    </span>
                    {option.IsCorrect && (
                      <span className="correct-indicator">
                        <CheckCircle size={16} />
                        Correct
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {question.Explanation && (
              <div className="view-section">
                <label>Explanation</label>
                <div className="explanation-display">
                  <LaTeXRenderer text={question.Explanation} />
                </div>
              </div>
            )}
            <div className="view-section">
              <label>Details</label>
              <div className="details-grid">
                <div>
                  <strong>Difficulty:</strong> {question.DifficultyLevel || 'Medium'}
                </div>
                <div>
                  <strong>Type:</strong> {question.QuestionType || 'Single Correct'}
                </div>
                <div>
                  <strong>Source:</strong> {question.Source || 'Self'}
                </div>
                <div>
                  <strong>Created:</strong>{' '}
                  {new Date(question.CreatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Edit Question Modal Component
const EditQuestionModal = ({ question, onClose, onSuccess, examsList, examsListLoading }) => {
  const [formData, setFormData] = useState(() => ({
    examId: question.Topics?.Subjects?.Exams?.ExamID || '',
    subjectId: question.Topics?.Subjects?.SubjectID || '',
    topicId: question.TopicID || question.Topics?.TopicID || '',
    questionText: question.QuestionText || '',
    difficulty: question.DifficultyLevel || 'Medium',
    explanation: question.Explanation || '',
    questionType: question.QuestionType || 'Single Correct',
    source: question.Source || 'Self',
    options: (question.options || []).map((opt) => ({
      text: opt.OptionText || '',
      isCorrect: opt.IsCorrect || false,
    })),
  }));

  const [savingAction, setSavingAction] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [latexEnabled, setLatexEnabled] = useState(() => {
    // Load LaTeX preference from localStorage, default to false
    try {
      const saved = localStorage.getItem('latexEditorEnabled');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadingExams = examsListLoading;

  const handleToggleLaTeX = (enabled) => {
    setLatexEnabled(enabled);
    localStorage.setItem('latexEditorEnabled', enabled.toString());
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'examId') {
        updated.subjectId = '';
        updated.topicId = '';
      } else if (field === 'subjectId') {
        updated.topicId = '';
      }
      return updated;
    });
    setError('');
    setValidationErrors({});
  };

  const handleOptionChange = (index, field, value) => {
    const newOptions = [...formData.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setFormData((prev) => ({ ...prev, options: newOptions }));
    setError('');
  };

  const handleCorrectAnswer = (index) => {
    const newOptions = formData.options.map((opt, i) => ({
      ...opt,
      isCorrect:
        formData.questionType === 'Single Correct'
          ? i === index
          : i === index
          ? !opt.isCorrect
          : opt.isCorrect,
    }));
    setFormData((prev) => ({ ...prev, options: newOptions }));
    setError('');
  };

  const addOption = () => {
    if (formData.options.length >= 6) {
      setError('Maximum 6 options allowed');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      options: [...prev.options, { text: '', isCorrect: false }],
    }));
  };

  const removeOption = (index) => {
    if (formData.options.length <= 2) {
      setError('At least 2 options are required');
      return;
    }
    const newOptions = formData.options.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, options: newOptions }));
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.topicId) {
      errors.topicId = 'Please select a topic';
    }
    if (!formData.questionText.trim()) {
      errors.questionText = 'Question text is required';
    } else if (formData.questionText.trim().length < 10) {
      errors.questionText = 'Question text must be at least 10 characters';
    }

    const validOptions = formData.options.filter((opt) => opt.text.trim());
    if (validOptions.length < 2) {
      errors.options = 'At least 2 options with text are required';
    }

    const optionTexts = validOptions.map((opt) => opt.text.trim().toLowerCase());
    const duplicates = optionTexts.filter((text, index) => optionTexts.indexOf(text) !== index);
    if (duplicates.length > 0) {
      errors.options = 'Duplicate options are not allowed';
    }

    const correctAnswers = validOptions.filter((opt) => opt.isCorrect);
    if (correctAnswers.length === 0) {
      errors.correctAnswer = 'At least one correct answer must be selected';
    } else if (formData.questionType === 'Single Correct' && correctAnswers.length > 1) {
      errors.correctAnswer = 'Single Correct questions must have exactly one correct answer';
    } else if (formData.questionType === 'Multiple Correct' && correctAnswers.length < 2) {
      errors.correctAnswer = 'Multiple Correct questions must have at least 2 correct answers';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveQuestion = async (status, { requireFullValidation = false, action = 'update' } = {}) => {
    setError('');
    setSuccess('');

    if (requireFullValidation && !validateForm()) {
      setError('Please fix the validation errors before submitting');
      return;
    }

    if (status === 'Draft') {
      if (!formData.questionText.trim() && !formData.options.some((opt) => opt.text.trim())) {
        setError('Add question text or at least one option to save a draft');
        return;
      }
    }

    setSavingAction(action);

    try {
      const validOptions = formData.options.filter((opt) => opt.text.trim());

      const questionData = {
        topicId: formData.topicId,
        questionText: formData.questionText.trim() || 'Untitled draft',
        difficultyLevel: formData.difficulty,
        explanation: formData.explanation.trim() || null,
        questionType: formData.questionType,
        source: formData.source,
        examId: formData.examId || undefined,
        subjectId: formData.subjectId || undefined,
        chapterId: formData.chapterId || undefined,
        status,
        options: validOptions.map((opt) => ({
          optionText: opt.text.trim(),
          isCorrect: opt.isCorrect,
        })),
      };

      await questionAPI.updateQuestion(question.QuestionID, questionData);
      setSuccess(
        status === 'Draft'
          ? 'Draft updated successfully'
          : 'Question submitted for review!'
      );
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to update question');
      if (err.code === 'DUPLICATE_QUESTION') {
        setValidationErrors({ questionText: 'This question already exists in the selected context' });
      }
    } finally {
      setSavingAction(null);
    }
  };

  const editingDraft = isDraftStatus(question);

  const handleUpdate = () => {
    saveQuestion(editingDraft ? 'Draft' : 'Pending', {
      requireFullValidation: !editingDraft,
      action: 'update',
    });
  };

  const handleSubmitForReview = () => {
    saveQuestion('Pending', { requireFullValidation: true, action: 'submit' });
  };

  const selectedExamData = examsList.find((e) => e.ExamID === formData.examId);
  const selectedSubjectData = selectedExamData?.subjects?.find(
    (s) => s.SubjectID === formData.subjectId
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingDraft ? 'Edit Draft' : 'Edit Question'}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <form
            className="edit-question-form"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="form-section">
              <h3>Question Context</h3>
              <div className="form-row">
                <label>
                  <span>Exam *</span>
                  <select
                    value={formData.examId || ''}
                    onChange={(e) => handleChange('examId', e.target.value)}
                    required
                    disabled={loadingExams}
                    className={validationErrors.examId ? 'error' : ''}
                  >
                    <option value="">Select an exam</option>
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
                    value={formData.subjectId || ''}
                    onChange={(e) => handleChange('subjectId', e.target.value)}
                    required
                    disabled={!formData.examId || loadingExams}
                  >
                    <option value="">Select a subject</option>
                    {selectedExamData?.subjects?.map((subject) => (
                      <option key={subject.SubjectID} value={subject.SubjectID}>
                        {subject.SubjectName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Topic *</span>
                <select
                  value={formData.topicId}
                  onChange={(e) => handleChange('topicId', e.target.value)}
                  required
                  disabled={!formData.subjectId || loadingExams}
                  className={validationErrors.topicId ? 'error' : ''}
                >
                  <option value="">Select a topic</option>
                  {selectedSubjectData?.topics?.map((topic) => {
                    const ch = topic.Chapters;
                    const chapter = ch && (Array.isArray(ch) ? ch[0] : ch);
                    const chapterLabel = chapter
                      ? [chapter.ChapterNumber != null ? `Ch. ${chapter.ChapterNumber}` : '', chapter.ChapterName].filter(Boolean).join(': ') || ''
                      : '';
                    return (
                      <option key={topic.TopicID} value={topic.TopicID}>
                        {topic.TopicName}{chapterLabel ? ` (${chapterLabel})` : ''}
                      </option>
                    );
                  })}
                </select>
                {validationErrors.topicId && (
                  <span className="field-error">{validationErrors.topicId}</span>
                )}
              </label>
            </div>

            <div className="form-section">
              <h3>Question Details</h3>
              
              {latexEnabled && (
                <div className="latex-global-help">
                  <Code size={14} />
                  <span>Press <kbd>Ctrl+M</kbd> (or <kbd>Cmd+M</kbd> on Mac) to open Math menu</span>
                </div>
              )}
              
              <div>
                <LaTeXEditor
                  value={formData.questionText}
                  onChange={(value) => handleChange('questionText', value)}
                  placeholder={latexEnabled ? "Enter your question here... Use the Math button to insert mathematical expressions" : "Enter your question here..."}
                  label="Question Text *"
                  rows={4}
                  showPreview={latexEnabled}
                  enableLaTeX={latexEnabled}
                  onToggleLaTeX={handleToggleLaTeX}
                  className={validationErrors.questionText ? 'error' : ''}
                />
                {validationErrors.questionText && (
                  <span className="field-error">{validationErrors.questionText}</span>
                )}
              </div>
              <div className="form-row">
                <label>
                  <span>Difficulty Level *</span>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => handleChange('difficulty', e.target.value)}
                    required
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </label>
                <label>
                  <span>Question Type *</span>
                  <select
                    value={formData.questionType}
                    onChange={(e) => {
                      handleChange('questionType', e.target.value);
                      if (e.target.value === 'Single Correct') {
                        const firstCorrect = formData.options.findIndex((opt) => opt.isCorrect);
                        const newOptions = formData.options.map((opt, i) => ({
                          ...opt,
                          isCorrect: i === firstCorrect && firstCorrect >= 0,
                        }));
                        setFormData((prev) => ({ ...prev, options: newOptions }));
                      }
                    }}
                    required
                  >
                    <option value="Single Correct">Single Correct</option>
                    <option value="Multiple Correct">Multiple Correct</option>
                  </select>
                </label>
              </div>
              <div>
                <LaTeXEditor
                  value={formData.explanation}
                  onChange={(value) => handleChange('explanation', value)}
                  placeholder={latexEnabled ? "Explain why the correct answer(s) is/are correct... Use the Math button to insert mathematical expressions" : "Explain why the correct answer(s) is/are correct..."}
                  label="Explanation (Optional)"
                  rows={3}
                  showPreview={latexEnabled}
                  enableLaTeX={latexEnabled}
                />
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <h3>Answer Options</h3>
                <button
                  type="button"
                  className="btn-add-option"
                  onClick={addOption}
                  disabled={formData.options.length >= 6}
                >
                  <Plus size={16} />
                  <span>Add</span>
                </button>
              </div>
              {validationErrors.options && (
                <div className="notice error">
                  <AlertCircle size={16} />
                  {validationErrors.options}
                </div>
              )}
              {validationErrors.correctAnswer && (
                <div className="notice error">
                  <AlertCircle size={16} />
                  {validationErrors.correctAnswer}
                </div>
              )}
              <div className="options-list">
                {formData.options.map((option, index) => {
                  const isValid = option.text.trim().length > 0;
                  return (
                    <div
                      key={index}
                      className={`option-item ${option.isCorrect ? 'correct' : ''} ${!isValid ? 'invalid' : ''}`}
                    >
                      <div className="option-content">
                        <input
                          type={formData.questionType === 'Single Correct' ? 'radio' : 'checkbox'}
                          name={formData.questionType === 'Single Correct' ? 'correct-answer' : `correct-${index}`}
                          checked={option.isCorrect}
                          onChange={() => handleCorrectAnswer(index)}
                          className="option-checkbox"
                          disabled={!isValid}
                        />
                        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                          <LaTeXEditor
                            value={option.text}
                            onChange={(value) => handleOptionChange(index, 'text', value)}
                            placeholder={latexEnabled ? `Option ${index + 1} - Use Math button for expressions` : `Option ${index + 1}`}
                            label=""
                            rows={2}
                            showPreview={latexEnabled}
                            enableLaTeX={latexEnabled}
                            className="option-latex-editor"
                          />
                        </div>
                        {formData.options.length > 2 && (
                          <button
                            type="button"
                            className="btn-remove-option"
                            onClick={() => removeOption(index)}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      {option.isCorrect && isValid && (
                        <span className="correct-badge">
                          <CheckCircle size={12} />
                          Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="notice error">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            {success && (
              <div className="notice success">
                <CheckCircle2 size={16} />
                {success}
              </div>
            )}

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={!!savingAction}>
                Cancel
              </button>
              {editingDraft ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleUpdate}
                    disabled={!!savingAction}
                  >
                    {savingAction === 'update' ? (
                      <>
                        <Loader2 size={16} className="spinner" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      'Update Question'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSubmitForReview}
                    disabled={!!savingAction}
                  >
                    {savingAction === 'submit' ? (
                      <>
                        <Loader2 size={16} className="spinner" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      'Submit for Review'
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleUpdate}
                  disabled={!!savingAction}
                >
                  {savingAction === 'update' ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    'Update Question'
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Delete Question Modal Component
const DeleteQuestionModal = ({ question, onConfirm, onCancel, loading }) => {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Question</h2>
          <button className="modal-close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="delete-warning">
            <AlertCircle size={24} />
            <p>
              Are you sure you want to delete this question? This action cannot be undone.
            </p>
            <div className="question-preview">
              <strong>Question:</strong>
              <p>{question.QuestionText?.substring(0, 100)}...</p>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" />
                <span>Deleting...</span>
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Questions;
