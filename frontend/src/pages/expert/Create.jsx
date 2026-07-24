import { useState, useEffect } from 'react';
import { Plus, X, Save, AlertCircle, CheckCircle2, Loader2, Info, AlertTriangle, Code, RotateCcw, Upload, PenLine } from 'lucide-react';
import { questionAPI, orgAuth } from '../../services/api';
import LaTeXEditor from '../../components/latex/LaTeXEditor';
import BulkQuestionUpload from '../../components/expert/BulkQuestionUpload';
import './Create.css';

const EMPTY_FORM = {
  examId: '',
  subjectId: '',
  chapterId: '',
  topicMode: 'existing',
  topicId: '',
  newTopicName: '',
  newTopicDescription: '',
  questionText: '',
  difficulty: 'Medium',
  explanation: '',
  questionType: 'Single Correct',
  source: 'Self',
  options: [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
};

const Create = () => {
  const [formData, setFormData] = useState({ ...EMPTY_FORM, options: [...EMPTY_FORM.options] });

  const [examsList, setExamsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingExams, setLoadingExams] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [draftQuestionId, setDraftQuestionId] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [entryMode, setEntryMode] = useState('single');
  const [latexEnabled, setLatexEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('latexEditorEnabled');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  
  // Get current user to determine expert type
  const user = orgAuth.getCurrentUser();
  const isOrganizationExpert = user?.userType === 'Organization';

  // Load exams list and subscription status on mount
  useEffect(() => {
    loadExamsList();
    if (isOrganizationExpert) {
      loadSubscriptionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrganizationExpert]);

  // Auto-dismiss success messages after 4 seconds
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

  const loadExamsList = async () => {
    try {
      setLoadingExams(true);
      const response = await questionAPI.getExamsList();
      setExamsList(response.exams || []);
      
      // Update subscription status from response if available
      if (isOrganizationExpert && response.subscriptionStatus) {
        setSubscriptionStatus(response.subscriptionStatus);
      }
    } catch (err) {
      console.error('Failed to load exams:', err);
      setError('Failed to load exams list. Please refresh the page.');
    } finally {
      setLoadingExams(false);
    }
  };

  const loadSubscriptionStatus = async () => {
    try {
      setLoadingSubscription(true);
      const status = await questionAPI.getSubscriptionStatus();
      setSubscriptionStatus(status);
    } catch (err) {
      console.error('Failed to load subscription status:', err);
      // Don't show error to user, just log it
      // The exams list endpoint will also provide subscription status
    } finally {
      setLoadingSubscription(false);
    }
  };

  const resolveTopicId = async () => {
    if (formData.topicMode === 'new' && formData.newTopicName.trim()) {
      const topicResponse = await questionAPI.createTopic(
        formData.examId,
        formData.subjectId,
        {
          topicName: formData.newTopicName.trim(),
          description: formData.newTopicDescription.trim() || null,
          chapterId: formData.chapterId || null,
        }
      );
      return topicResponse.topic.TopicID;
    }
    if (formData.topicMode === 'existing') {
      return formData.topicId || null;
    }
    return null;
  };

  const buildQuestionPayload = async (status) => {
    const validOptions = formData.options.filter((opt) => opt.text.trim());
    const finalTopicId = await resolveTopicId();

    return {
      topicId: finalTopicId,
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
  };

  const handleClearAll = () => {
    const hasContent =
      formData.examId ||
      formData.questionText.trim() ||
      formData.explanation.trim() ||
      formData.options.some((opt) => opt.text.trim());

    if (hasContent && !window.confirm('Clear all fields? Unsaved changes will be lost.')) {
      return;
    }

    setFormData({
      ...EMPTY_FORM,
      options: EMPTY_FORM.options.map((opt) => ({ ...opt })),
    });
    setDraftQuestionId(null);
    setError('');
    setSuccess('');
    setValidationErrors({});
  };

  const handleToggleLaTeX = (enabled) => {
    setLatexEnabled(enabled);
    localStorage.setItem('latexEditorEnabled', enabled.toString());
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      
      // Reset dependent fields when parent changes
      if (field === 'examId') {
        updated.subjectId = '';
        updated.chapterId = '';
        updated.topicMode = 'existing';
        updated.topicId = '';
        updated.newTopicName = '';
        updated.newTopicDescription = '';
      } else if (field === 'subjectId') {
        updated.chapterId = '';
        updated.topicMode = 'existing';
        updated.topicId = '';
        updated.newTopicName = '';
        updated.newTopicDescription = '';
      } else if (field === 'chapterId') {
        updated.topicId = '';
        updated.newTopicName = '';
        updated.newTopicDescription = '';
      } else if (field === 'topicMode') {
        // Reset topic fields when mode changes
        updated.topicId = '';
        updated.newTopicName = '';
        updated.newTopicDescription = '';
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

    if (!formData.examId) {
      errors.examId = 'Please select an exam';
    }
    if (!formData.subjectId) {
      errors.subjectId = 'Please select a subject';
    }
    
    // Validate topic based on mode
    if (formData.topicMode === 'existing' && !formData.topicId) {
      errors.topicId = 'Please select a topic';
    } else if (formData.topicMode === 'new') {
      if (!formData.newTopicName?.trim()) {
        errors.newTopicName = 'Topic name is required';
      } else if (formData.newTopicName.trim().length < 2) {
        errors.newTopicName = 'Topic name must be at least 2 characters';
      }
    }
    // 'null' mode doesn't require validation
    
    if (!formData.questionText.trim()) {
      errors.questionText = 'Question text is required';
    } else if (formData.questionText.trim().length < 10) {
      errors.questionText = 'Question text must be at least 10 characters';
    }

    const validOptions = formData.options.filter((opt) => opt.text.trim());
    if (validOptions.length < 2) {
      errors.options = 'At least 2 options with text are required';
    }

    // Check for duplicate options
    const optionTexts = validOptions.map(opt => opt.text.trim().toLowerCase());
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) {
      setError('Please fix the validation errors before submitting');
      return;
    }

    setLoading(true);

    try {
      const validOptions = formData.options.filter((opt) => opt.text.trim());
      
      let finalTopicId = null;
      
      if (formData.topicMode === 'new' && formData.newTopicName.trim()) {
        try {
          finalTopicId = await resolveTopicId();
        } catch (topicErr) {
          setError(topicErr.message || 'Failed to create topic');
          setLoading(false);
          return;
        }
      } else if (formData.topicMode === 'existing') {
        finalTopicId = formData.topicId;
      }

      const questionData = {
        topicId: finalTopicId,
        questionText: formData.questionText.trim(),
        difficultyLevel: formData.difficulty,
        explanation: formData.explanation.trim() || null,
        questionType: formData.questionType,
        source: formData.source,
        examId: formData.examId,
        subjectId: formData.subjectId || undefined,
        chapterId: formData.chapterId || undefined,
        status: 'Pending',
        options: validOptions.map(opt => ({
          optionText: opt.text.trim(),
          isCorrect: opt.isCorrect,
        })),
      };

      if (draftQuestionId) {
        await questionAPI.updateQuestion(draftQuestionId, questionData);
      } else {
        await questionAPI.createQuestion(questionData);
      }
      
      setSuccess('Question created successfully! It will be reviewed by a Reviewer.');
      
      // Retain context fields so the expert can quickly create another question
      // in the same exam/subject/chapter/topic without re-selecting everything.
      setFormData((prev) => ({
        ...EMPTY_FORM,
        examId: prev.examId,
        subjectId: prev.subjectId,
        chapterId: prev.chapterId,
        topicMode: prev.topicMode,
        topicId: prev.topicMode === 'existing' ? prev.topicId : '',
        options: EMPTY_FORM.options.map((opt) => ({ ...opt })),
      }));
      setDraftQuestionId(null);
      setValidationErrors({});
    } catch (err) {
      setError(err.message || 'Failed to create question');
      if (err.code === 'DUPLICATE_QUESTION') {
        setValidationErrors({ questionText: 'This question already exists in the selected context' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setError('');
    if (!formData.questionText.trim() && !formData.options.some((opt) => opt.text.trim())) {
      setError('Add question text or at least one option to save a draft');
      return;
    }

    try {
      setSavingDraft(true);
      const questionData = await buildQuestionPayload('Draft');
      if (draftQuestionId) {
        await questionAPI.updateQuestion(draftQuestionId, questionData);
      } else {
        const response = await questionAPI.createQuestion(questionData);
        setDraftQuestionId(response.question?.QuestionID || null);
      }
      setSuccess('Draft saved');
    } catch (err) {
      setError(err.message || 'Failed to save draft');
    } finally {
      setSavingDraft(false);
    }
  };

  const selectedExamData = examsList.find((e) => e.ExamID === formData.examId);
  const selectedSubjectData = selectedExamData?.subjects?.find(
    (s) => s.SubjectID === formData.subjectId
  );

  // Check if subscription is active
  const hasActiveSubscription = subscriptionStatus?.hasActiveSubscription === true;
  const subscriptionExpiringSoon = subscriptionStatus?.subscription?.EndDate 
    ? new Date(subscriptionStatus.subscription.EndDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    : false;

  return (
    <div className="create-page">
      <div className="page-header">
        <div className="page-header__text">
          <h1>Create Questions</h1>
          <p className="page-subtitle">
            {isOrganizationExpert 
              ? "Create a new multiple choice question for your organization's question bank"
              : "Create a new multiple choice question for the platform question bank"}
          </p>
          <div className="create-mode-toggle">
            <button
              type="button"
              className={`create-mode-btn ${entryMode === 'single' ? 'active' : ''}`}
              onClick={() => setEntryMode('single')}
            >
              <PenLine size={16} />
              Single question
            </button>
            <button
              type="button"
              className={`create-mode-btn ${entryMode === 'bulk' ? 'active' : ''}`}
              onClick={() => setEntryMode('bulk')}
            >
              <Upload size={16} />
              Bulk Questions
            </button>
          </div>
        </div>
        {entryMode === 'single' && (
        <button
          type="button"
          className="btn-secondary btn-clear"
          onClick={handleClearAll}
          disabled={loading || savingDraft}
        >
          <RotateCcw size={16} />
          <span>Clear all</span>
        </button>
        )}
      </div>

      {/* Subscription Status Banner for Organization Subject Experts */}
      {isOrganizationExpert && (
        <>
          {loadingSubscription ? (
            <div className="subscription-banner info">
              <Loader2 size={16} className="spinner" />
              <span>Checking subscription status...</span>
            </div>
          ) : !hasActiveSubscription ? (
            <div className="subscription-banner warning">
              <AlertTriangle size={16} />
              <div>
                <strong>Subscription Required</strong>
                <p>{subscriptionStatus?.message || 'Your organization needs an active subscription to create questions. Please contact your administrator.'}</p>
              </div>
            </div>
          ) : subscriptionExpiringSoon ? (
            <div className="subscription-banner info">
              <Info size={16} />
              <div>
                <strong>Subscription Expiring Soon</strong>
                <p>Your subscription expires on {new Date(subscriptionStatus.subscription.EndDate).toLocaleDateString()}. Please contact your administrator to renew.</p>
              </div>
            </div>
          ) : subscriptionStatus?.subscriptions && subscriptionStatus.subscriptions.length > 0 ? (
            <div className="subscription-banner success">
              <CheckCircle2 size={16} />
              <div>
                <strong>Active Subscriptions ({subscriptionStatus.subscriptions.length})</strong>
                <p>
                  {subscriptionStatus.subscriptions.map((sub, idx) => (
                    <span key={sub.SubscriptionID}>
                      {sub.PlanName || 'Plan'} (expires {new Date(sub.EndDate).toLocaleDateString()})
                      {idx < subscriptionStatus.subscriptions.length - 1 ? ' • ' : ''}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}

      {entryMode === 'bulk' ? (
        <BulkQuestionUpload disabled={isOrganizationExpert && !hasActiveSubscription} />
      ) : (
      <form className="question-form" onSubmit={handleSubmit} style={{
        opacity: isOrganizationExpert && !hasActiveSubscription ? 0.6 : 1,
        pointerEvents: isOrganizationExpert && !hasActiveSubscription ? 'none' : 'auto'
      }}>
        <div className="form-section form-section--context">
          <h2>Question Context</h2>

          <div className="form-row form-row--three">
            <label>
              <span>Exam *</span>
              <select
                value={formData.examId}
                onChange={(e) => handleChange('examId', e.target.value)}
                required
                disabled={loadingExams}
                className={`select-field--tall ${validationErrors.examId ? 'error' : ''}`}
              >
                <option value="">Select an exam</option>
                {examsList.map((exam) => (
                  <option key={exam.ExamID} value={exam.ExamID}>
                    {exam.ExamName}
                  </option>
                ))}
              </select>
              {validationErrors.examId && (
                <span className="field-error">{validationErrors.examId}</span>
              )}
            </label>

            <label>
              <span>Subject *</span>
              <select
                value={formData.subjectId}
                onChange={(e) => handleChange('subjectId', e.target.value)}
                required
                disabled={!formData.examId || loadingExams}
                className={`select-field--tall ${validationErrors.subjectId ? 'error' : ''}`}
              >
                <option value="">Select a subject</option>
                {selectedExamData?.subjects?.map((subject) => (
                  <option key={subject.SubjectID} value={subject.SubjectID}>
                    {subject.SubjectName}
                  </option>
                ))}
              </select>
              {validationErrors.subjectId && (
                <span className="field-error">{validationErrors.subjectId}</span>
              )}
            </label>

            <label>
              <span>Chapter (optional)</span>
              <select
                value={formData.chapterId}
                onChange={(e) => handleChange('chapterId', e.target.value)}
                disabled={!formData.subjectId || loadingExams}
                className="select-field--tall"
              >
                <option value="">No chapter / Any</option>
                {selectedSubjectData?.chapters?.map((ch) => (
                  <option key={ch.ChapterID} value={ch.ChapterID}>
                    {[ch.ChapterNumber != null ? `Ch. ${ch.ChapterNumber}` : '', ch.ChapterName].filter(Boolean).join(': ') || ch.ChapterName || 'Unnamed'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row form-row--two">
            <label>
              <span>Topic</span>
              <select
                value={formData.topicMode}
                onChange={(e) => handleChange('topicMode', e.target.value)}
                disabled={!formData.subjectId || loadingExams}
                className={`select-field--tall ${validationErrors.topicMode ? 'error' : ''}`}
              >
                <option value="existing">Select from existing</option>
                <option value="null">No Topic (NULL)</option>
                <option value="new">Create New Topic</option>
              </select>
              {validationErrors.topicMode && (
                <span className="field-error">{validationErrors.topicMode}</span>
              )}
            </label>

            {formData.topicMode === 'existing' && (
              <label>
                <span>Select Topic *</span>
                <select
                  value={formData.topicId}
                  onChange={(e) => handleChange('topicId', e.target.value)}
                  required={formData.topicMode === 'existing'}
                  disabled={!formData.subjectId || loadingExams}
                  className={`select-field--tall ${validationErrors.topicId ? 'error' : ''}`}
                >
                  <option value="">Select a topic</option>
                  {(formData.chapterId
                    ? selectedSubjectData?.topics?.filter((t) => (t.ChapterID || t.Chapters?.ChapterID) === formData.chapterId)
                    : selectedSubjectData?.topics
                  )?.map((topic) => {
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
            )}

            {formData.topicMode === 'new' && (
              <label>
                <span>New Topic Name *</span>
                <input
                  type="text"
                  value={formData.newTopicName}
                  onChange={(e) => handleChange('newTopicName', e.target.value)}
                  placeholder="Enter topic name..."
                  required={formData.topicMode === 'new'}
                  className={validationErrors.newTopicName ? 'error' : ''}
                />
                {validationErrors.newTopicName && (
                  <span className="field-error">{validationErrors.newTopicName}</span>
                )}
              </label>
            )}

            {formData.topicMode === 'null' && (
              <div className="form-row__hint">
                <span className="warning">No topic will be assigned to this question</span>
              </div>
            )}
          </div>

          {formData.topicMode === 'new' && (
            <label className="form-field--full">
              <span>Topic Description (Optional)</span>
              <textarea
                value={formData.newTopicDescription}
                onChange={(e) => handleChange('newTopicDescription', e.target.value)}
                placeholder="Enter topic description..."
                rows={2}
              />
            </label>
          )}
        </div>

        <div className="form-section">
          <h2>Question Details</h2>

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
              placeholder={latexEnabled ? "Enter your question here... Use the Math button to insert mathematical expressions" : "Enter your question here... (Minimum 10 characters)"}
              label="Question Text *"
              rows={3}
              showPreview={latexEnabled}
              enableLaTeX={latexEnabled}
              onToggleLaTeX={handleToggleLaTeX}
              className={validationErrors.questionText ? 'error' : ''}
            />
            <div className="field-hint">
              {formData.questionText.length > 0 && (
                <span className={formData.questionText.length < 10 ? 'warning' : 'success'}>
                  {formData.questionText.length} characters
                </span>
              )}
            </div>
            {validationErrors.questionText && (
              <span className="field-error">{validationErrors.questionText}</span>
            )}
          </div>

          <div className="form-row form-row--three">
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
                  // Reset correct answers when switching type
                  if (e.target.value === 'Single Correct') {
                    const firstCorrect = formData.options.findIndex(opt => opt.isCorrect);
                    const newOptions = formData.options.map((opt, i) => ({
                      ...opt,
                      isCorrect: i === firstCorrect && firstCorrect >= 0,
                    }));
                    setFormData(prev => ({ ...prev, options: newOptions }));
                  }
                }}
                required
              >
                <option value="Single Correct">Single Correct</option>
                <option value="Multiple Correct">Multiple Correct</option>
              </select>
            </label>

            <label>
              <span>Source</span>
              <select
                value={formData.source}
                onChange={(e) => handleChange('source', e.target.value)}
              >
                <option value="Self">Self Created</option>
                <option value="AI">AI Generated</option>
                <option value="Reference">Reference Material</option>
                <option value="Previous">Previous Exam</option>
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
            <div className="field-hint">
              Providing an explanation helps students understand the concept better
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Answer Options</h2>

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
                        placeholder={latexEnabled ? `Option ${index + 1}${option.isCorrect ? ' (Correct)' : ''} - Use Math button for expressions` : `Option ${index + 1}${option.isCorrect ? ' (Correct)' : ''}`}
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
                        title="Remove option"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  {option.isCorrect && isValid && (
                    <span className="correct-badge">
                      <CheckCircle2 size={14} />
                      Correct Answer
                    </span>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="btn-add-option btn-add-option--inline"
              onClick={addOption}
              disabled={formData.options.length >= 6}
            >
              <Plus size={18} />
              <span>Add Option</span>
              {formData.options.length >= 6 && (
                <span className="btn-add-option__hint">(maximum 6)</span>
              )}
            </button>
          </div>

          <div className="options-summary">
            <span>
              {formData.options.filter((opt) => opt.text.trim()).length} valid option(s) •{' '}
              {formData.options.filter((opt) => opt.isCorrect && opt.text.trim()).length} correct
              {formData.questionType === 'Single Correct' ? '' : '(s)'}
            </span>
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

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSaveDraft}
            disabled={loading || savingDraft}
          >
            {savingDraft ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
            <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" />
                <span>Submitting...</span>
              </>
            ) : (
              <span>Submit for Review</span>
            )}
          </button>
        </div>
      </form>
      )}
    </div>
  );
};

export default Create;
