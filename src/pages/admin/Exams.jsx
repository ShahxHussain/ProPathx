import { useState, useEffect } from 'react';
import { Plus, FileText, ChevronDown, ChevronRight, Edit2, Trash2, BookOpen, BookMarked, FolderOpen, X, Building2, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import '../org/Exams.css';
import './Exams.css';

const Exams = () => {
  const [exams, setExams] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedExams, setExpandedExams] = useState(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [editingExam, setEditingExam] = useState(null);
  const [deletingExam, setDeletingExam] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);

  useEffect(() => {
    loadOrganizations();
    loadExams();
  }, []);

  const loadOrganizations = async () => {
    try {
      const response = await adminAPI.getOrganizations();
      setOrganizations(response.organizations || []);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

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

  const loadExams = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getExams();
      setExams(response.exams || []);
    } catch (err) {
      console.error('Failed to load exams:', err);
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const loadExamDetails = async (examId) => {
    try {
      const response = await adminAPI.getExamDetails(examId);
      // Update the exam in the list with full details
      setExams((prev) =>
        prev.map((exam) =>
          exam.ExamID === examId
            ? { ...exam, ...response.exam, subjects: response.subjects }
            : exam
        )
      );
    } catch (err) {
      console.error('Failed to load exam details:', err);
      setError(err.message || 'Failed to load exam details');
    }
  };

  const toggleExam = async (examId) => {
    const newExpanded = new Set(expandedExams);
    if (newExpanded.has(examId)) {
      newExpanded.delete(examId);
    } else {
      newExpanded.add(examId);
      // Load details if not already loaded
      const exam = exams.find((e) => e.ExamID === examId);
      if (exam && !exam.subjects) {
        await loadExamDetails(examId);
      }
    }
    setExpandedExams(newExpanded);
  };

  const toggleSubject = (subjectId) => {
    const newExpanded = new Set(expandedSubjects);
    if (newExpanded.has(subjectId)) {
      newExpanded.delete(subjectId);
    } else {
      newExpanded.add(subjectId);
    }
    setExpandedSubjects(newExpanded);
  };

  const handleCreateExam = async (examData, subjects = []) => {
    try {
      setError('');
      setSuccess('');
      // Create exam first
      const response = await adminAPI.createExam(examData);
      const examId = response.exam.ExamID;
      
      // Create subjects if provided
      if (subjects.length > 0) {
        for (const subject of subjects) {
          await adminAPI.createSubject(examId, subject);
        }
      }
      
      setSuccess('Exam created successfully!');
      setShowCreateModal(false);
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to create exam');
    }
  };

  const handleUpdateExam = async (examId, examData, subjectsData = []) => {
    try {
      setError('');
      setSuccess('');
      // Update exam first
      await adminAPI.updateExam(examId, examData);
      
      // Update subjects if provided
      if (subjectsData.length > 0) {
        // Get current exam details to compare subjects
        const examDetails = await adminAPI.getExamDetails(examId);
        const currentSubjects = examDetails.subjects || [];
        
        // Update existing subjects or create new ones
        for (const subjectData of subjectsData) {
          const existingSubject = currentSubjects.find(
            (s) => s.SubjectID === subjectData.subjectId
          );
          
          if (existingSubject) {
            // Update existing subject
            await adminAPI.updateSubject(examId, subjectData.subjectId, {
              subjectName: subjectData.subjectName,
              description: subjectData.description,
              weightage: subjectData.weightage,
            });
          } else {
            // Create new subject
            await adminAPI.createSubject(examId, {
              subjectName: subjectData.subjectName,
              description: subjectData.description,
              weightage: subjectData.weightage,
            });
          }
        }
        
        // Delete subjects that were removed
        const updatedSubjectIds = subjectsData
          .map((s) => s.subjectId)
          .filter((id) => id !== null && id !== undefined);
        const subjectsToDelete = currentSubjects.filter(
          (s) => !updatedSubjectIds.includes(s.SubjectID)
        );
        
        for (const subjectToDelete of subjectsToDelete) {
          await adminAPI.deleteSubject(examId, subjectToDelete.SubjectID);
        }
      }
      
      setSuccess('Exam updated successfully!');
      setEditingExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to update exam');
    }
  };

  const handleDeleteExam = async (examId) => {
    setDeletingExam(examId);
  };

  const confirmDeleteExam = async () => {
    if (!deletingExam) return;
    
    try {
      setError('');
      setSuccess('');
      await adminAPI.deleteExam(deletingExam);
      setSuccess('Exam deleted successfully!');
      setDeletingExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to delete exam');
      setDeletingExam(null);
    }
  };

  const handleCreateSubject = async (examId, subjectData) => {
    try {
      setError('');
      setSuccess('');
      await adminAPI.createSubject(examId, subjectData);
      setSuccess('Subject created successfully!');
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to create subject');
    }
  };

  const handleUpdateSubject = async (examId, subjectId, subjectData) => {
    try {
      setError('');
      setSuccess('');
      await adminAPI.updateSubject(examId, subjectId, subjectData);
      setSuccess('Subject updated successfully!');
      setEditingSubject(null);
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to update subject');
    }
  };

  const handleDeleteSubject = async (examId, subjectId) => {
    if (!window.confirm('Are you sure you want to delete this subject? This will also delete all topics.')) {
      return;
    }
    try {
      setError('');
      setSuccess('');
      await adminAPI.deleteSubject(examId, subjectId);
      setSuccess('Subject deleted successfully!');
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to delete subject');
    }
  };

  const handleCreateTopic = async (examId, subjectId, topicData) => {
    try {
      setError('');
      setSuccess('');
      await adminAPI.createTopic(examId, subjectId, topicData);
      setSuccess('Topic created successfully!');
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to create topic');
    }
  };

  const handleUpdateTopic = async (examId, subjectId, topicId, topicData) => {
    try {
      setError('');
      setSuccess('');
      await adminAPI.updateTopic(examId, subjectId, topicId, topicData);
      setSuccess('Topic updated successfully!');
      setEditingTopic(null);
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to update topic');
    }
  };

  const handleDeleteTopic = async (examId, subjectId, topicId) => {
    if (!window.confirm('Are you sure you want to delete this topic?')) {
      return;
    }
    try {
      setError('');
      setSuccess('');
      await adminAPI.deleteTopic(examId, subjectId, topicId);
      setSuccess('Topic deleted successfully!');
      await loadExamDetails(examId);
    } catch (err) {
      setError(err.message || 'Failed to delete topic');
    }
  };

  return (
    <div className="exams-page admin-exams-page">
      <div className="page-header">
        <div className="header-row">
          <div>
            <h1>Exams Management</h1>
            <p className="page-subtitle">Create and manage exams, subjects, chapters, and topics. Used by organizations to build question banks and tests.</p>
            <div className="admin-exams-hint" role="status">
              <strong>Structure:</strong> Exam → Subjects → optional Chapters → Topics. Add subjects to an exam, then add topics (and optionally chapters to group them).
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={20} />
            Create Exam
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="notice success" style={{ marginBottom: '24px' }}>
          {success}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading exams...</div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No Exams Yet</h3>
          <p>Create your first exam to get started</p>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ marginTop: '16px' }}>
            <Plus size={20} />
            Create Exam
          </button>
        </div>
      ) : (
        <div className="exams-list">
          {exams.map((exam) => (
            <ExamCard
              key={exam.ExamID}
              exam={exam}
              isExpanded={expandedExams.has(exam.ExamID)}
              onToggle={() => toggleExam(exam.ExamID)}
              expandedSubjects={expandedSubjects}
              onToggleSubject={toggleSubject}
              onEditExam={() => setEditingExam(exam)}
              onDeleteExam={() => handleDeleteExam(exam.ExamID)}
              onRefreshExam={loadExamDetails}
              onCreateSubject={(data) => handleCreateSubject(exam.ExamID, data)}
              onUpdateSubject={(subjectId, data) => handleUpdateSubject(exam.ExamID, subjectId, data)}
              onDeleteSubject={(subjectId) => handleDeleteSubject(exam.ExamID, subjectId)}
              editingSubject={editingSubject}
              onEditSubject={setEditingSubject}
              onCreateTopic={(subjectId, data) => handleCreateTopic(exam.ExamID, subjectId, data)}
              onUpdateTopic={(subjectId, topicId, data) => handleUpdateTopic(exam.ExamID, subjectId, topicId, data)}
              onDeleteTopic={(subjectId, topicId) => handleDeleteTopic(exam.ExamID, subjectId, topicId)}
              editingTopic={editingTopic}
              onEditTopic={setEditingTopic}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateExamModal
          organizations={organizations}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateExam}
        />
      )}

      {editingExam && (
        <EditExamModal
          exam={editingExam}
          organizations={organizations}
          onClose={() => setEditingExam(null)}
          onSubmit={(examData, subjectsData) => handleUpdateExam(editingExam.ExamID, examData, subjectsData)}
        />
      )}

      {deletingExam && (
        <DeleteExamModal
          exam={exams.find((e) => e.ExamID === deletingExam)}
          onClose={() => setDeletingExam(null)}
          onConfirm={confirmDeleteExam}
        />
      )}
    </div>
  );
};

const ExamCard = ({
  exam,
  isExpanded,
  onToggle,
  expandedSubjects,
  onToggleSubject,
  onEditExam,
  onDeleteExam,
  onRefreshExam,
  onCreateSubject,
  onUpdateSubject,
  onDeleteSubject,
  editingSubject,
  onEditSubject,
  onCreateTopic,
  onUpdateTopic,
  onDeleteTopic,
  editingTopic,
  onEditTopic,
}) => {
  const [showAddSubject, setShowAddSubject] = useState(false);

  // Calculate total weightage of all subjects
  const calculateTotalWeightage = () => {
    if (!exam.subjects || exam.subjects.length === 0) return 0;
    return exam.subjects.reduce((sum, subject) => {
      const weightage = subject.Weightage !== null && subject.Weightage !== undefined 
        ? parseFloat(subject.Weightage) 
        : 0;
      return sum + (isNaN(weightage) ? 0 : weightage);
    }, 0);
  };

  const totalWeightage = calculateTotalWeightage();
  const canAddSubject = Math.abs(totalWeightage - 100) > 0.01; // Allow small floating point differences
  const subjectCount = exam.subjects?.length ?? 0;
  const topicCount = exam.subjects?.reduce((acc, s) => acc + (s.topics?.length || 0), 0) ?? 0;

  return (
    <div className="exam-card">
      <div className="exam-header" onClick={onToggle}>
        <div className="exam-header-left">
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <BookOpen size={20} />
          <div>
            <h3>{exam.ExamName}</h3>
            <p className="exam-meta">
              {exam.OrgName && (
                <>
                  <Building2 size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  {exam.OrgName} • 
                </>
              )}
              {subjectCount > 0 ? `${subjectCount} subject${subjectCount !== 1 ? 's' : ''}` : (exam.NoOfSubjects ? `${exam.NoOfSubjects} subjects` : 'No subjects')}
              {subjectCount > 0 && topicCount >= 0 && ` · ${topicCount} topic${topicCount !== 1 ? 's' : ''}`}
              {' · Created '}{new Date(exam.CreatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="exam-actions" onClick={(e) => e.stopPropagation()}>
          <Link
            to={`/admin/exams/setup/${exam.ExamID}`}
            className="btn btn-primary exam-setup-link"
            title="Open full setup for this exam"
            onClick={(e) => e.stopPropagation()}
          >
            <Settings2 size={16} />
            Setup
          </Link>
          <button 
            className="icon-btn exam-action-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onEditExam();
            }} 
            title="Edit Exam"
            aria-label="Edit Exam"
          >
            <Edit2 size={18} />
          </button>
          <button 
            className="icon-btn danger exam-action-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onDeleteExam();
            }} 
            title="Delete Exam"
            aria-label="Delete Exam"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="exam-content">
          <div className="admin-exam-context">
            <strong>Managing:</strong> {exam.ExamName}
            {exam.Description && ` — ${exam.Description}`}
          </div>
          {exam.Syllabus && (
            <div className="exam-syllabus">
              <strong>Syllabus:</strong> {exam.Syllabus}
            </div>
          )}

          <div className="subjects-section admin-section">
            <div className="admin-section-header">
              <div className="admin-section-title">
                <span className="admin-section-num">1</span>
                <h4 style={{ margin: 0 }}>Subjects</h4>
              </div>
              {canAddSubject && (
                <button className="btn btn-sm btn-primary" onClick={() => setShowAddSubject(true)}>
                  <Plus size={16} />
                  Add Subject
                </button>
              )}
              {!canAddSubject && exam.subjects && exam.subjects.length > 0 && (
                <span className="admin-weightage-hint">
                  Total weightage: {totalWeightage.toFixed(1)}%. Add or edit subjects so total is 100% to add more.
                </span>
              )}
            </div>

            {showAddSubject && (
              <CreateSubjectForm
                onClose={() => setShowAddSubject(false)}
                onSubmit={(data) => {
                  onCreateSubject(data);
                  setShowAddSubject(false);
                }}
              />
            )}

                {exam.subjects && exam.subjects.length > 0 ? (
              <div className="subjects-list">
                {exam.subjects.map((subject) => (
                  <SubjectCard
                    key={subject.SubjectID}
                    examId={exam.ExamID}
                    examName={exam.ExamName}
                    subject={subject}
                    onRefreshExam={onRefreshExam}
                    isExpanded={expandedSubjects.has(subject.SubjectID)}
                    onToggle={() => onToggleSubject(subject.SubjectID)}
                    onEdit={() => onEditSubject(subject)}
                    onDelete={() => onDeleteSubject(subject.SubjectID)}
                    onCreateTopic={(data) => onCreateTopic(subject.SubjectID, data)}
                    onUpdateTopic={(topicId, data) => onUpdateTopic(subject.SubjectID, topicId, data)}
                    onDeleteTopic={(topicId) => onDeleteTopic(subject.SubjectID, topicId)}
                    editingTopic={editingTopic}
                    onEditTopic={onEditTopic}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-subjects admin-empty-block">
                <p>No subjects yet.</p>
                <p className="help">Subjects are the main categories (e.g. Physics, Chemistry). Add one to then add chapters and topics.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowAddSubject(true)} style={{ marginTop: 12 }}>
                  <Plus size={14} />
                  Add first subject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editingSubject && editingSubject.ExamID === exam.ExamID && (
        <EditSubjectModal
          subject={editingSubject}
          onClose={() => onEditSubject(null)}
          onSubmit={(data) => {
            onUpdateSubject(editingSubject.SubjectID, data);
            onEditSubject(null);
          }}
        />
      )}
    </div>
  );
};

const SubjectCard = ({
  examId,
  examName,
  subject,
  onRefreshExam,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onCreateTopic,
  onUpdateTopic,
  onDeleteTopic,
  editingTopic,
  onEditTopic,
}) => {
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState(false);

  return (
    <div className="subject-card">
      <div className="subject-header" onClick={onToggle}>
        <div className="subject-header-left">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <BookMarked size={18} />
          <div>
            <h4>{subject.SubjectName}</h4>
            <p className="subject-meta">
              {subject.topics?.length || 0} topics
              {(subject.chapters?.length || 0) > 0 && ` · ${subject.chapters.length} chapters`}
              {subject.Weightage != null && subject.Weightage !== '' && ` · ${subject.Weightage}% weight`}
            </p>
          </div>
        </div>
        <div className="subject-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" onClick={onEdit} title="Edit Subject">
            <Edit2 size={16} />
          </button>
          <button className="icon-btn danger" onClick={onDelete} title="Delete Subject">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="subject-content">
          {examName && (
            <div className="admin-subject-context">
              Part of exam: <strong>{examName}</strong>
            </div>
          )}
          {subject.Description && (
            <div className="subject-description">
              <strong>Description:</strong> {subject.Description}
            </div>
          )}

          <div className="chapters-section admin-section">
            <div className="admin-section-header">
              <div className="admin-section-title">
                <span className="admin-section-num">2</span>
                <h5>Chapters (optional)</h5>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddChapter(!showAddChapter)}>
                <Plus size={14} />
                {showAddChapter ? 'Cancel' : 'Add Chapter'}
              </button>
            </div>
            <p className="admin-section-desc">Group topics under chapters (e.g. Ch. 1: Mechanics). You can add topics without chapters.</p>
            {showAddChapter && (
              <ChapterForm
                examId={examId}
                subjectId={subject.SubjectID}
                onClose={() => setShowAddChapter(false)}
                onSuccess={() => {
                  setShowAddChapter(false);
                  onRefreshExam?.(examId);
                }}
              />
            )}
            {subject.chapters && subject.chapters.length > 0 ? (
              <div className="chapters-list">
                {subject.chapters.map((ch) => (
                  <ChapterItem
                    key={ch.ChapterID}
                    examId={examId}
                    subjectId={subject.SubjectID}
                    chapter={ch}
                    onRefresh={() => onRefreshExam?.(examId)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-chapters admin-empty-block">
                <p>No chapters yet.</p>
                <p className="help">Optional. Add chapters to group topics (e.g. by book chapter).</p>
              </div>
            )}
          </div>

          <div className="topics-section admin-section">
            <div className="admin-section-header">
              <div className="admin-section-title">
                <span className="admin-section-num">3</span>
                <h5>Topics</h5>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAddTopic(!showAddTopic)}>
                <Plus size={14} />
                {showAddTopic ? 'Cancel' : 'Add Topic'}
              </button>
            </div>
            <p className="admin-section-desc">Topics are the question categories (e.g. Newton’s Laws). Each topic can optionally belong to a chapter.</p>

            {showAddTopic && (
              <CreateTopicForm
                subject={subject}
                onClose={() => setShowAddTopic(false)}
                onSubmit={(data) => {
                  onCreateTopic(data);
                  setShowAddTopic(false);
                }}
              />
            )}

            {subject.topics && subject.topics.length > 0 ? (
              <div className="topics-list">
                {subject.topics.map((topic) => (
                  <TopicItem
                    key={topic.TopicID}
                    topic={topic}
                    onEdit={() => onEditTopic(topic)}
                    onDelete={() => onDeleteTopic(topic.TopicID)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-topics admin-empty-block">
                <p>No topics yet.</p>
                <p className="help">Add topics so Subject Experts can attach questions to them.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowAddTopic(true)} style={{ marginTop: 12 }}>
                  <Plus size={14} />
                  Add first topic
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editingTopic && editingTopic.SubjectID === subject.SubjectID && (
        <EditTopicModal
          topic={editingTopic}
          subject={subject}
          onClose={() => onEditTopic(null)}
          onSubmit={(data) => {
            onUpdateTopic(editingTopic.TopicID, data);
            onEditTopic(null);
          }}
        />
      )}
    </div>
  );
};

const TopicItem = ({ topic, onEdit, onDelete }) => {
  const ch = topic.Chapters;
  const chapter = ch && (Array.isArray(ch) ? ch[0] : ch);
  const chapterLabel = chapter
    ? [chapter.ChapterNumber != null ? `Ch. ${chapter.ChapterNumber}` : '', chapter.ChapterName].filter(Boolean).join(': ') || ''
    : '';
  return (
    <div className="topic-item">
      <div className="topic-info">
        <FolderOpen size={16} />
        <div>
          <strong>{topic.TopicName}</strong>
          {chapterLabel && <span className="topic-chapter"> — {chapterLabel}</span>}
          {topic.Description && <p className="topic-description">{topic.Description}</p>}
        </div>
      </div>
      <div className="topic-actions">
        <button className="icon-btn" onClick={onEdit} title="Edit Topic">
          <Edit2 size={14} />
        </button>
        <button className="icon-btn danger" onClick={onDelete} title="Delete Topic">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const CreateExamModal = ({ organizations, onClose, onSubmit }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    examName: '',
    description: '',
    syllabus: '',
    noOfSubjects: '',
    orgId: '',
  });
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Initialize subjects array when noOfSubjects changes
  useEffect(() => {
    const numSubjects = parseInt(formData.noOfSubjects) || 0;
    if (numSubjects > 0 && numSubjects <= 50) {
      setSubjects((prevSubjects) => {
        // Preserve existing subject data if available
        const newSubjects = Array.from({ length: numSubjects }, (_, i) => ({
          id: i,
          subjectName: prevSubjects[i]?.subjectName || '',
          description: prevSubjects[i]?.description || '',
          weightage: prevSubjects[i]?.weightage || '',
        }));
        return newSubjects;
      });
    } else if (numSubjects === 0) {
      setSubjects([]);
    }
  }, [formData.noOfSubjects]);

  const handleStep1Submit = (e) => {
    e.preventDefault();
    if (!formData.examName.trim()) {
      return;
    }
    const numSubjects = parseInt(formData.noOfSubjects) || 0;
    if (numSubjects > 0) {
      setStep(2);
    } else {
      // No subjects, proceed directly to create exam
      handleFinalSubmit();
    }
  };

  const handleSubjectChange = (index, field, value) => {
    const updatedSubjects = [...subjects];
    updatedSubjects[index] = {
      ...updatedSubjects[index],
      [field]: value,
    };
    setSubjects(updatedSubjects);
    setValidationError('');
  };

  const calculateTotalWeightage = () => {
    return subjects.reduce((sum, subject) => {
      const weightage = parseFloat(subject.weightage) || 0;
      return sum + weightage;
    }, 0);
  };

  const handleStep2Submit = (e) => {
    e.preventDefault();
    setValidationError('');

    // Validate all subjects have names
    const hasEmptyNames = subjects.some((s) => !s.subjectName.trim());
    if (hasEmptyNames) {
      setValidationError('All subjects must have a name');
      return;
    }

    // Validate weightage sum
    const totalWeightage = calculateTotalWeightage();
    if (Math.abs(totalWeightage - 100) > 0.01) {
      setValidationError(`Total weightage must equal 100%. Current total: ${totalWeightage.toFixed(2)}%`);
      return;
    }

    handleFinalSubmit();
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const examData = {
        examName: formData.examName.trim(),
        description: formData.description.trim() || null,
        syllabus: formData.syllabus.trim() || null,
        noOfSubjects: formData.noOfSubjects ? parseInt(formData.noOfSubjects) : null,
        orgId: formData.orgId || null, // Optional organization assignment
      };

      const subjectsData = subjects.map((s) => ({
        subjectName: s.subjectName.trim(),
        description: s.description.trim() || null,
        weightage: s.weightage ? parseFloat(s.weightage) : null,
      }));

      await onSubmit(examData, subjectsData);
    } catch (err) {
      setValidationError(err.message || 'Failed to create exam');
    } finally {
      setLoading(false);
    }
  };

  const totalWeightage = calculateTotalWeightage();
  const weightageDifference = (100 - totalWeightage).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Exam {step === 2 && `- Step ${step}/2`}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1Submit}>
            <div className="form-group">
              <label>
                Exam Name <span className="required">*</span>
              </label>
              <input
                type="text"
                value={formData.examName}
                onChange={(e) => setFormData({ ...formData, examName: e.target.value })}
                required
                placeholder="e.g., MDCAT, ECAT, IELTS"
              />
            </div>
            <div className="form-group">
              <label>Organization (Optional)</label>
              <select
                value={formData.orgId}
                onChange={(e) => setFormData({ ...formData, orgId: e.target.value })}
              >
                <option value="">Platform-wide (No Organization)</option>
                {organizations.map((org) => (
                  <option key={org.OrgID} value={org.OrgID}>
                    {org.OrgName}
                  </option>
                ))}
              </select>
              <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                Leave empty for platform-wide exams, or assign to a specific organization
              </small>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Brief description of the exam"
              />
            </div>
            <div className="form-group">
              <label>Syllabus</label>
              <textarea
                value={formData.syllabus}
                onChange={(e) => setFormData({ ...formData, syllabus: e.target.value })}
                rows={3}
                placeholder="Syllabus details"
              />
            </div>
            <div className="form-group">
              <label>Number of Subjects</label>
              <input
                type="number"
                value={formData.noOfSubjects}
                onChange={(e) => setFormData({ ...formData, noOfSubjects: e.target.value })}
                min="0"
                max="50"
                placeholder="Enter number of subjects (optional)"
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                If you enter a number, you'll be asked to add subject details in the next step.
              </small>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {parseInt(formData.noOfSubjects) > 0 ? 'Next' : 'Create Exam'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2Submit}>
            <div className="subjects-form-section">
              <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>
                Add Subjects ({subjects.length} subjects)
              </h3>
              <p style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                Enter subject names and weightages. Total weightage must equal 100%.
              </p>

              {validationError && (
                <div className="notice error" style={{ marginBottom: '16px' }}>
                  {validationError}
                </div>
              )}

              <div className="weightage-summary" style={{
                padding: '12px',
                background: totalWeightage === 100 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 146, 60, 0.1)',
                border: `1px solid ${totalWeightage === 100 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 146, 60, 0.3)'}`,
                borderRadius: '8px',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <strong style={{ color: totalWeightage === 100 ? '#22c55e' : '#f97316' }}>
                  Total Weightage: {totalWeightage.toFixed(2)}%
                  {totalWeightage !== 100 && (
                    <span style={{ display: 'block', fontSize: '12px', marginTop: '4px', fontWeight: 'normal' }}>
                      {weightageDifference > 0 ? `Need ${weightageDifference}% more` : `Exceeded by ${Math.abs(weightageDifference)}%`}
                    </span>
                  )}
                </strong>
              </div>

              <div className="subjects-input-list" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
                {subjects.map((subject, index) => (
                  <div key={subject.id} className="subject-input-card" style={{
                    padding: '16px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    background: 'var(--background)'
                  }}>
                    <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                      Subject {index + 1}
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px' }}>
                        Subject Name <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        value={subject.subjectName}
                        onChange={(e) => handleSubjectChange(index, 'subjectName', e.target.value)}
                        required
                        placeholder={`Subject ${index + 1} name`}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px' }}>Weightage (%) <span className="required">*</span></label>
                      <input
                        type="number"
                        value={subject.weightage}
                        onChange={(e) => handleSubjectChange(index, 'weightage', e.target.value)}
                        required
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0-100"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '0' }}>
                      <label style={{ fontSize: '13px' }}>Description</label>
                      <textarea
                        value={subject.description}
                        onChange={(e) => handleSubjectChange(index, 'description', e.target.value)}
                        rows={2}
                        placeholder="Optional description"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  Back
                </button>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || totalWeightage !== 100}
                >
                  {loading ? 'Creating...' : 'Create Exam'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const EditExamModal = ({ exam, organizations, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    examName: exam.ExamName || '',
    description: exam.Description || '',
    syllabus: exam.Syllabus || '',
    noOfSubjects: exam.NoOfSubjects || '',
    orgId: exam.OrgID || '',
  });
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [validationError, setValidationError] = useState('');

  // Load subjects when modal opens
  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setLoadingSubjects(true);
        const response = await adminAPI.getExamDetails(exam.ExamID);
        setSubjects(
          (response.subjects || []).map((subject) => ({
            subjectId: subject.SubjectID,
            subjectName: subject.SubjectName || '',
            description: subject.Description || '',
            weightage: subject.Weightage !== null && subject.Weightage !== undefined 
              ? subject.Weightage.toString() 
              : '',
          }))
        );
      } catch (err) {
        console.error('Failed to load subjects:', err);
      } finally {
        setLoadingSubjects(false);
      }
    };

    loadSubjects();
  }, [exam.ExamID]);

  const handleSubjectChange = (index, field, value) => {
    const updatedSubjects = [...subjects];
    updatedSubjects[index] = {
      ...updatedSubjects[index],
      [field]: value,
    };
    setSubjects(updatedSubjects);
    setValidationError('');
  };

  const handleAddSubject = () => {
    setSubjects([
      ...subjects,
      {
        subjectId: null,
        subjectName: '',
        description: '',
        weightage: '',
      },
    ]);
  };

  const handleRemoveSubject = (index) => {
    const updatedSubjects = subjects.filter((_, i) => i !== index);
    setSubjects(updatedSubjects);
    setValidationError('');
  };

  const calculateTotalWeightage = () => {
    return subjects.reduce((sum, subject) => {
      const weightage = subject.weightage ? parseFloat(subject.weightage) : 0;
      return sum + (isNaN(weightage) ? 0 : weightage);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!formData.examName.trim()) {
      setValidationError('Exam name is required');
      return;
    }

    // Validate all subjects have names
    const hasEmptyNames = subjects.some((s) => !s.subjectName.trim());
    if (hasEmptyNames) {
      setValidationError('All subjects must have a name');
      return;
    }

    // Validate weightage sum if subjects exist
    if (subjects.length > 0) {
      const totalWeightage = calculateTotalWeightage();
      if (Math.abs(totalWeightage - 100) > 0.01) {
        setValidationError(
          `Total weightage must equal 100%. Current total: ${totalWeightage.toFixed(2)}%`
        );
        return;
      }
    }

    setLoading(true);
    try {
      const examData = {
        examName: formData.examName.trim(),
        description: formData.description.trim() || null,
        syllabus: formData.syllabus.trim() || null,
        noOfSubjects: formData.noOfSubjects ? parseInt(formData.noOfSubjects) : null,
        orgId: formData.orgId || null,
      };

      const subjectsData = subjects.map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName.trim(),
        description: s.description.trim() || null,
        weightage: s.weightage ? parseFloat(s.weightage) : null,
      }));

      await onSubmit(examData, subjectsData);
    } catch (err) {
      setValidationError(err.message || 'Failed to update exam');
    } finally {
      setLoading(false);
    }
  };

  const totalWeightage = calculateTotalWeightage();
  const weightageDifference = (100 - totalWeightage).toFixed(2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Edit Exam</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Exam Name <span className="required">*</span>
            </label>
            <input
              type="text"
              value={formData.examName}
              onChange={(e) => setFormData({ ...formData, examName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Organization</label>
            <select
              value={formData.orgId}
              onChange={(e) => setFormData({ ...formData, orgId: e.target.value })}
            >
              <option value="">Platform-wide (No Organization)</option>
              {organizations.map((org) => (
                <option key={org.OrgID} value={org.OrgID}>
                  {org.OrgName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Syllabus</label>
            <textarea
              value={formData.syllabus}
              onChange={(e) => setFormData({ ...formData, syllabus: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Number of Subjects</label>
            <input
              type="number"
              value={formData.noOfSubjects}
              onChange={(e) => setFormData({ ...formData, noOfSubjects: e.target.value })}
              min="1"
              max="50"
            />
          </div>

          {validationError && (
            <div className="notice error" style={{ marginBottom: '16px' }}>
              {validationError}
            </div>
          )}

          <div className="subjects-edit-section" style={{ marginTop: '24px' }}>
            <div className="section-header" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Subjects</h3>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleAddSubject}
                disabled={loading}
              >
                <Plus size={14} />
                Add Subject
              </button>
            </div>

            {subjects.length > 0 && (
              <div className="weightage-summary" style={{
                padding: '12px',
                background: totalWeightage === 100 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(251, 146, 60, 0.1)',
                border: `1px solid ${totalWeightage === 100 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 146, 60, 0.3)'}`,
                borderRadius: '8px',
                marginBottom: '16px',
                textAlign: 'center'
              }}>
                <strong style={{ color: totalWeightage === 100 ? '#22c55e' : '#f97316' }}>
                  Total Weightage: {totalWeightage.toFixed(2)}%
                  {totalWeightage !== 100 && (
                    <span style={{ display: 'block', fontSize: '12px', marginTop: '4px', fontWeight: 'normal' }}>
                      {weightageDifference > 0 ? `Need ${weightageDifference}% more` : `Exceeded by ${Math.abs(weightageDifference)}%`}
                    </span>
                  )}
                </strong>
              </div>
            )}

            {loadingSubjects ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Loading subjects...
              </div>
            ) : subjects.length > 0 ? (
              <div className="subjects-edit-list" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
                {subjects.map((subject, index) => (
                  <div
                    key={index}
                    className="subject-edit-card"
                    style={{
                      padding: '16px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      background: 'var(--background)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                      Subject {index + 1}
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px' }}>
                        Subject Name <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        value={subject.subjectName}
                        onChange={(e) => handleSubjectChange(index, 'subjectName', e.target.value)}
                        required
                        placeholder={`Subject ${index + 1} name`}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px' }}>Weightage (%) <span className="required">*</span></label>
                      <input
                        type="number"
                        value={subject.weightage}
                        onChange={(e) => handleSubjectChange(index, 'weightage', e.target.value)}
                        required
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0-100"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px' }}>Description</label>
                      <textarea
                        value={subject.description}
                        onChange={(e) => handleSubjectChange(index, 'description', e.target.value)}
                        rows={2}
                        placeholder="Optional description"
                      />
                    </div>
                    {subjects.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleRemoveSubject(index)}
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-subjects" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>No subjects yet. Click "Add Subject" to add subjects.</p>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || (subjects.length > 0 && Math.abs(totalWeightage - 100) > 0.01)}
            >
              {loading ? 'Updating...' : 'Update Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CreateSubjectForm = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    subjectName: '',
    description: '',
    weightage: '',
  });
  const [showDescription, setShowDescription] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.subjectName.trim()) {
      return;
    }
    onSubmit({
      subjectName: formData.subjectName.trim(),
      description: formData.description.trim() || null,
      weightage: formData.weightage ? parseFloat(formData.weightage) : null,
    });
    setFormData({ subjectName: '', description: '', weightage: '' });
    setShowDescription(false);
  };

  return (
    <div className="inline-form compact">
      <form onSubmit={handleSubmit}>
        <div className="form-row compact">
          <input
            type="text"
            placeholder="Subject Name *"
            value={formData.subjectName}
            onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
            required
            className="compact-input"
          />
          <input
            type="number"
            placeholder="Weightage %"
            value={formData.weightage}
            onChange={(e) => setFormData({ ...formData, weightage: e.target.value })}
            min="0"
            max="100"
            step="0.01"
            className="compact-input"
            style={{ width: '120px' }}
          />
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setShowDescription(!showDescription)}
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            {showDescription ? 'Hide' : 'Desc'}
          </button>
          <div className="form-actions compact">
            <button type="submit" className="btn btn-sm btn-primary">
              Add
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
        {showDescription && (
          <div style={{ marginTop: '8px' }}>
            <textarea
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              style={{ width: '100%', fontSize: '13px', padding: '6px 10px' }}
            />
          </div>
        )}
      </form>
    </div>
  );
};

const EditSubjectModal = ({ subject, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    subjectName: subject.SubjectName || '',
    description: subject.Description || '',
    weightage: subject.Weightage || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.subjectName.trim()) {
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        subjectName: formData.subjectName.trim(),
        description: formData.description.trim() || null,
        weightage: formData.weightage ? parseFloat(formData.weightage) : null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Subject</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Subject Name <span className="required">*</span>
            </label>
            <input
              type="text"
              value={formData.subjectName}
              onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>Weightage (%)</label>
            <input
              type="number"
              value={formData.weightage}
              onChange={(e) => setFormData({ ...formData, weightage: e.target.value })}
              min="0"
              max="100"
              step="0.01"
              placeholder="0-100"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Subject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ChapterForm = ({ examId, subjectId, onClose, onSuccess }) => {
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterName, setChapterName] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!chapterNumber.trim() && !chapterName.trim()) {
      setErr('Provide at least chapter number or name');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      await adminAPI.createChapter(examId, subjectId, {
        chapterNumber: chapterNumber.trim() ? parseInt(chapterNumber, 10) : null,
        chapterName: chapterName.trim() || null,
      });
      onSuccess?.();
    } catch (e) {
      setErr(e.message || 'Failed to create chapter');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-card">
      <p className="card-title">New chapter</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="chapter-num">Chapter number (optional)</label>
          <input
            id="chapter-num"
            type="number"
            placeholder="e.g. 1"
            value={chapterNumber}
            onChange={(e) => setChapterNumber(e.target.value)}
            min={1}
          />
        </div>
        <div className="form-group">
          <label htmlFor="chapter-name">Chapter name (optional)</label>
          <input
            id="chapter-name"
            type="text"
            placeholder="e.g. Newton's Laws"
            value={chapterName}
            onChange={(e) => setChapterName(e.target.value)}
          />
        </div>
        {err && <span className="field-error">{err}</span>}
        <div className="form-actions">
          <button type="submit" className="btn btn-sm btn-primary" disabled={loading}>
            {loading ? 'Adding...' : 'Add Chapter'}
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const ChapterItem = ({ examId, subjectId, chapter, onRefresh }) => {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(chapter.ChapterNumber ?? '');
  const [name, setName] = useState(chapter.ChapterName ?? '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminAPI.updateChapter(examId, subjectId, chapter.ChapterID, {
        chapterNumber: num === '' ? null : parseInt(num, 10),
        chapterName: name.trim() || null,
      });
      setEditing(false);
      onRefresh?.();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove this chapter? Topics under it will be unlinked.')) return;
    try {
      await adminAPI.deleteChapter(examId, subjectId, chapter.ChapterID);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    }
  };

  const label = [chapter.ChapterNumber != null ? `Ch. ${chapter.ChapterNumber}` : '', chapter.ChapterName].filter(Boolean).join(': ') || 'Chapter';
  return (
    <div className="chapter-item">
      {!editing ? (
        <>
          <span>{label}</span>
          <div className="topic-actions">
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} title="Edit Chapter">
              <Edit2 size={14} />
            </button>
            <button type="button" className="icon-btn danger" onClick={handleDelete} title="Delete Chapter">
              <Trash2 size={14} />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleUpdate} className="admin-form-card" style={{ marginTop: 0, marginBottom: 0 }}>
          <div className="form-group">
            <label>Number</label>
            <input type="number" value={num} onChange={(e) => setNum(e.target.value)} min={1} />
          </div>
          <div className="form-group">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chapter name" />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-sm btn-primary" disabled={loading}>Save</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
};

const CreateTopicForm = ({ subject, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    topicName: '',
    description: '',
    chapterId: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.topicName.trim()) {
      return;
    }
    onSubmit({
      topicName: formData.topicName.trim(),
      description: formData.description.trim() || null,
      chapterId: formData.chapterId || null,
    });
    setFormData({ topicName: '', description: '', chapterId: '' });
  };

  const chapters = subject?.chapters || [];

  return (
    <div className="admin-form-card">
      <p className="card-title">New topic</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="topic-name">Topic name <span className="required">*</span></label>
          <input
            id="topic-name"
            type="text"
            placeholder="e.g. Newton's Laws of Motion"
            value={formData.topicName}
            onChange={(e) => setFormData({ ...formData, topicName: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="topic-chapter">Chapter (optional)</label>
          <select
            id="topic-chapter"
            value={formData.chapterId}
            onChange={(e) => setFormData({ ...formData, chapterId: e.target.value })}
          >
            <option value="">No chapter</option>
            {chapters.map((ch) => (
              <option key={ch.ChapterID} value={ch.ChapterID}>
                {[ch.ChapterNumber != null ? `Ch. ${ch.ChapterNumber}` : '', ch.ChapterName].filter(Boolean).join(': ') || ch.ChapterID}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="topic-desc">Description (optional)</label>
          <textarea
            id="topic-desc"
            placeholder="Short description of this topic"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-sm btn-primary">
            Add Topic
          </button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const EditTopicModal = ({ topic, subject, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    topicName: topic.TopicName || '',
    description: topic.Description || '',
    chapterId: topic.ChapterID || '',
  });
  const [loading, setLoading] = useState(false);
  const chapters = subject?.chapters || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.topicName.trim()) {
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        topicName: formData.topicName.trim(),
        description: formData.description.trim() || null,
        chapterId: formData.chapterId || null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Topic</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Topic Name <span className="required">*</span>
            </label>
            <input
              type="text"
              value={formData.topicName}
              onChange={(e) => setFormData({ ...formData, topicName: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Chapter (optional)</label>
            <select
              value={formData.chapterId}
              onChange={(e) => setFormData({ ...formData, chapterId: e.target.value })}
            >
              <option value="">No chapter</option>
              {chapters.map((ch) => (
                <option key={ch.ChapterID} value={ch.ChapterID}>
                  {[ch.ChapterNumber != null ? `Ch. ${ch.ChapterNumber}` : '', ch.ChapterName].filter(Boolean).join(': ') || ch.ChapterID}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Update Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DeleteExamModal = ({ exam, onClose, onConfirm }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  if (!exam) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Exam</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="delete-modal-content">
          <div className="delete-warning">
            <Trash2 size={48} style={{ color: '#ef4444', marginBottom: '16px' }} />
            <h3>Are you sure you want to delete this exam?</h3>
            <p style={{ marginBottom: '8px', fontWeight: '600', color: 'var(--text)' }}>
              {exam.ExamName}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
              This action cannot be undone. This will permanently delete:
            </p>
            <ul style={{ 
              textAlign: 'left', 
              color: 'var(--text-muted)', 
              fontSize: '14px',
              marginBottom: '24px',
              paddingLeft: '20px'
            }}>
              <li>The exam and all its data</li>
              <li>All subjects associated with this exam</li>
              <li>All topics under those subjects</li>
            </ul>
          </div>
          <div className="modal-actions">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose} 
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-danger" 
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? 'Deleting...' : 'Delete Exam'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Exams;



