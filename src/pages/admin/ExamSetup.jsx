import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight,
  BookOpen,
  BookMarked,
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  X,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import '../org/Exams.css';
import './ExamSetup.css';

const ExamSetup = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState(null);

  const loadExam = async () => {
    if (!examId) return;
    try {
      setError('');
      const res = await adminAPI.getExamDetails(examId);
      setExam({ ...res.exam, subjects: res.subjects || [] });
    } catch (err) {
      setError(err.message || 'Failed to load exam');
      setExam(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExam();
  }, [examId]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const totalWeightage = (exam?.subjects || []).reduce((sum, s) => sum + (parseFloat(s.Weightage) || 0), 0);
  const canAddSubject = Math.abs(totalWeightage - 100) > 0.01;

  const handleCreateSubject = async (data) => {
    try {
      setError('');
      await adminAPI.createSubject(examId, data);
      setSuccess('Subject added.');
      setShowAddSubject(false);
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to add subject');
    }
  };

  const handleUpdateSubject = async (subjectId, data) => {
    try {
      setError('');
      await adminAPI.updateSubject(examId, subjectId, data);
      setSuccess('Subject updated.');
      setEditingSubject(null);
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to update subject');
    }
  };

  const handleDeleteSubject = async (subjectId) => {
    if (!window.confirm('Delete this subject and all its chapters and topics?')) return;
    try {
      setError('');
      await adminAPI.deleteSubject(examId, subjectId);
      setSuccess('Subject removed.');
      setExpandedSubject(null);
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to delete subject');
    }
  };

  const handleCreateChapter = async (subjectId, data) => {
    try {
      setError('');
      await adminAPI.createChapter(examId, subjectId, data);
      setSuccess('Chapter added.');
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to add chapter');
    }
  };

  const handleUpdateChapter = async (subjectId, chapterId, data) => {
    try {
      setError('');
      await adminAPI.updateChapter(examId, subjectId, chapterId, data);
      setSuccess('Chapter updated.');
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to update chapter');
    }
  };

  const handleDeleteChapter = async (subjectId, chapterId) => {
    if (!window.confirm('Remove this chapter? Topics under it will be unlinked.')) return;
    try {
      setError('');
      await adminAPI.deleteChapter(examId, subjectId, chapterId);
      setSuccess('Chapter removed.');
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to delete chapter');
    }
  };

  const handleCreateTopic = async (subjectId, data) => {
    try {
      setError('');
      await adminAPI.createTopic(examId, subjectId, data);
      setSuccess('Topic added.');
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to add topic');
    }
  };

  const handleUpdateTopic = async (subjectId, topicId, data) => {
    try {
      setError('');
      await adminAPI.updateTopic(examId, subjectId, topicId, data);
      setSuccess('Topic updated.');
      setEditingTopic(null);
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to update topic');
    }
  };

  const handleDeleteTopic = async (subjectId, topicId) => {
    if (!window.confirm('Delete this topic?')) return;
    try {
      setError('');
      await adminAPI.deleteTopic(examId, subjectId, topicId);
      setSuccess('Topic removed.');
      await loadExam();
    } catch (err) {
      setError(err.message || 'Failed to delete topic');
    }
  };

  if (loading) {
    return (
      <div className="exam-setup-page">
        <div className="exam-setup-loading">
          <div className="exam-setup-spinner" />
          <p>Loading exam setup…</p>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="exam-setup-page">
        <div className="exam-setup-empty">
          <p>{error || 'Exam not found.'}</p>
          <Link to="/admin/exams" className="btn btn-secondary">
            <ArrowLeft size={18} />
            Back to Exams
          </Link>
        </div>
      </div>
    );
  }

  const subjects = exam.subjects || [];

  return (
    <div className="exam-setup-page">
      <nav className="exam-setup-breadcrumb" aria-label="Breadcrumb">
        <Link to="/admin/exams" className="exam-setup-breadcrumb-link">
          Exams
        </Link>
        <ChevronRight size={16} aria-hidden />
        <span className="exam-setup-breadcrumb-current">
          {exam.ExamName} — Setup
        </span>
      </nav>

      <header className="exam-setup-hero">
        <div className="exam-setup-hero-main">
          <div className="exam-setup-hero-icon">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="exam-setup-hero-title">{exam.ExamName}</h1>
            {exam.Description && (
              <p className="exam-setup-hero-desc">{exam.Description}</p>
            )}
            <p className="exam-setup-hero-hint">
              Build the content structure below: add <strong>subjects</strong>, then <strong>chapters</strong> (optional) and <strong>topics</strong>. Topics are where questions are attached.
            </p>
          </div>
        </div>
        <Link to="/admin/exams" className="btn btn-secondary exam-setup-back">
          <ArrowLeft size={18} />
          Back to list
        </Link>
      </header>

      {error && (
        <div className="notice error exam-setup-notice">{error}</div>
      )}
      {success && (
        <div className="notice success exam-setup-notice">{success}</div>
      )}

      <section className="exam-setup-structure">
        <div className="exam-setup-structure-head">
          <div className="exam-setup-structure-title">
            <Layers size={22} />
            <h2>Content structure</h2>
          </div>
          {subjects.length > 0 && (
            <p className="exam-setup-structure-meta">
              {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
              {totalWeightage > 0 && ` · ${totalWeightage.toFixed(1)}% weight total`}
              {!canAddSubject && ' · 100% — add more by editing weights'}
            </p>
          )}
        </div>

        <div className="exam-setup-subjects">
          {subjects.map((subject) => (
            <SubjectSetupCard
              key={subject.SubjectID}
              examId={examId}
              subject={subject}
              isExpanded={expandedSubject === subject.SubjectID}
              onToggle={() => setExpandedSubject((id) => (id === subject.SubjectID ? null : subject.SubjectID))}
              onEdit={() => setEditingSubject(subject)}
              onDelete={() => handleDeleteSubject(subject.SubjectID)}
              onCreateChapter={(data) => handleCreateChapter(subject.SubjectID, data)}
              onUpdateChapter={(chapterId, data) => handleUpdateChapter(subject.SubjectID, chapterId, data)}
              onDeleteChapter={(chapterId) => handleDeleteChapter(subject.SubjectID, chapterId)}
              onCreateTopic={(data) => handleCreateTopic(subject.SubjectID, data)}
              onUpdateTopic={(topicId, data) => handleUpdateTopic(subject.SubjectID, topicId, data)}
              onDeleteTopic={(topicId) => handleDeleteTopic(subject.SubjectID, topicId)}
              editingTopic={editingTopic}
              onEditTopic={setEditingTopic}
              onRefresh={loadExam}
            />
          ))}

          {canAddSubject && (
            <div className="exam-setup-add-subject">
              {!showAddSubject ? (
                <button
                  type="button"
                  className="exam-setup-add-subject-btn"
                  onClick={() => setShowAddSubject(true)}
                >
                  <Plus size={20} />
                  Add subject
                </button>
              ) : (
                <AddSubjectCard
                  onClose={() => setShowAddSubject(false)}
                  onSubmit={handleCreateSubject}
                />
              )}
            </div>
          )}
          {!canAddSubject && subjects.length > 0 && (
            <p className="exam-setup-weightage-note">
              Total weight is 100%. Edit a subject to change its weight if you want to add more subjects.
            </p>
          )}
        </div>

        {subjects.length === 0 && (
          <div className="exam-setup-empty-structure">
            <BookMarked size={48} className="exam-setup-empty-icon" />
            <h3>No subjects yet</h3>
            <p>Add your first subject to define the content structure (e.g. Physics, Chemistry).</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddSubject(true)}
            >
              <Plus size={18} />
              Add first subject
            </button>
          </div>
        )}
      </section>

      {editingSubject && (
        <EditSubjectModal
          subject={editingSubject}
          onClose={() => setEditingSubject(null)}
          onSubmit={(data) => handleUpdateSubject(editingSubject.SubjectID, data)}
        />
      )}
      {editingTopic && (
        <EditTopicModalSetup
          topic={editingTopic}
          subject={subjects.find((s) => s.SubjectID === editingTopic.SubjectID)}
          onClose={() => setEditingTopic(null)}
          onSubmit={(data) => handleUpdateTopic(editingTopic.SubjectID, editingTopic.TopicID, data)}
        />
      )}
    </div>
  );
};

function SubjectSetupCard({
  examId,
  subject,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onCreateChapter,
  onUpdateChapter,
  onDeleteChapter,
  onCreateTopic,
  onUpdateTopic,
  onDeleteTopic,
  editingTopic,
  onEditTopic,
  onRefresh,
}) {
  const [showAddChapter, setShowAddChapter] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);

  const chapters = subject.chapters || [];
  const topics = subject.topics || [];

  return (
    <div className={`exam-setup-subject-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="exam-setup-subject-header" onClick={onToggle}>
        <ChevronRight size={20} className={`exam-setup-chevron ${isExpanded ? 'open' : ''}`} />
        <BookMarked size={20} />
        <div className="exam-setup-subject-info">
          <h3>{subject.SubjectName}</h3>
          <span className="exam-setup-subject-meta">
            {topics.length} topic{topics.length !== 1 ? 's' : ''}
            {chapters.length > 0 && ` · ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`}
            {subject.Weightage != null && subject.Weightage !== '' && ` · ${subject.Weightage}% weight`}
          </span>
        </div>
        <div className="exam-setup-subject-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="icon-btn" onClick={onEdit} title="Edit subject">
            <Edit2 size={16} />
          </button>
          <button type="button" className="icon-btn danger" onClick={onDelete} title="Delete subject">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="exam-setup-subject-body">
          {subject.Description && (
            <p className="exam-setup-subject-desc">{subject.Description}</p>
          )}

          <div className="exam-setup-blocks">
            <div className="exam-setup-block">
              <div className="exam-setup-block-head">
                <h4>Chapters (optional)</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowAddChapter(!showAddChapter)}
                >
                  {showAddChapter ? 'Cancel' : <><Plus size={14} /> Add chapter</>}
                </button>
              </div>
              {showAddChapter && (
                <AddChapterCard
                  onClose={() => setShowAddChapter(false)}
                  onSubmit={(data) => {
                    onCreateChapter(data);
                    setShowAddChapter(false);
                  }}
                />
              )}
              {chapters.length > 0 ? (
                <ul className="exam-setup-list">
                  {chapters.map((ch) => (
                    <ChapterRow
                      key={ch.ChapterID}
                      examId={examId}
                      subjectId={subject.SubjectID}
                      chapter={ch}
                      onUpdate={onUpdateChapter}
                      onDelete={onDeleteChapter}
                      onRefresh={onRefresh}
                    />
                  ))}
                </ul>
              ) : (
                !showAddChapter && <p className="exam-setup-list-empty">No chapters</p>
              )}
            </div>

            <div className="exam-setup-block">
              <div className="exam-setup-block-head">
                <h4>Topics</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowAddTopic(!showAddTopic)}
                >
                  {showAddTopic ? 'Cancel' : <><Plus size={14} /> Add topic</>}
                </button>
              </div>
              {showAddTopic && (
                <AddTopicCard
                  subject={subject}
                  onClose={() => setShowAddTopic(false)}
                  onSubmit={(data) => {
                    onCreateTopic(data);
                    setShowAddTopic(false);
                  }}
                />
              )}
              {topics.length > 0 ? (
                <ul className="exam-setup-list">
                  {topics.map((topic) => {
                    const ch = topic.Chapters;
                    const chapter = ch && (Array.isArray(ch) ? ch[0] : ch);
                    const chLabel = chapter
                      ? [chapter.ChapterNumber != null ? `Ch. ${chapter.ChapterNumber}` : '', chapter.ChapterName].filter(Boolean).join(': ') || ''
                      : '';
                    return (
                      <li key={topic.TopicID} className="exam-setup-list-item">
                        <FolderOpen size={16} />
                        <span className="exam-setup-list-item-label">
                          {topic.TopicName}
                          {chLabel && <span className="exam-setup-list-item-meta"> — {chLabel}</span>}
                        </span>
                        <div className="exam-setup-list-item-actions">
                          <button type="button" className="icon-btn" onClick={() => onEditTopic(topic)} title="Edit topic">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" className="icon-btn danger" onClick={() => onDeleteTopic(topic.TopicID)} title="Delete topic">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !showAddTopic && <p className="exam-setup-list-empty">No topics yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSubjectCard({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weightage, setWeightage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      subjectName: name.trim(),
      description: description.trim() || null,
      weightage: weightage ? parseFloat(weightage) : null,
    });
  };

  return (
    <div className="exam-setup-form-card">
      <h4>New subject</h4>
      <form onSubmit={handleSubmit}>
        <div className="exam-setup-field">
          <label htmlFor="sub-name">Name *</label>
          <input
            id="sub-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Physics"
            required
          />
        </div>
        <div className="exam-setup-field">
          <label htmlFor="sub-weight">Weightage % (optional)</label>
          <input
            id="sub-weight"
            type="number"
            value={weightage}
            onChange={(e) => setWeightage(e.target.value)}
            min={0}
            max={100}
            step={0.01}
            placeholder="0–100"
          />
        </div>
        <div className="exam-setup-field">
          <label htmlFor="sub-desc">Description (optional)</label>
          <textarea
            id="sub-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Short description"
          />
        </div>
        <div className="exam-setup-form-actions">
          <button type="submit" className="btn btn-primary">Add subject</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function AddChapterCard({ onClose, onSubmit }) {
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!num.trim() && !name.trim()) {
      setErr('Enter at least number or name');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      await onSubmit({
        chapterNumber: num.trim() ? parseInt(num, 10) : null,
        chapterName: name.trim() || null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="exam-setup-form-card">
      <h4>New chapter</h4>
      <form onSubmit={handleSubmit}>
        <div className="exam-setup-field">
          <label htmlFor="ch-num">Number (optional)</label>
          <input id="ch-num" type="number" value={num} onChange={(e) => setNum(e.target.value)} min={1} placeholder="e.g. 1" />
        </div>
        <div className="exam-setup-field">
          <label htmlFor="ch-name">Name (optional)</label>
          <input id="ch-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Newton's Laws" />
        </div>
        {err && <p className="exam-setup-field-error">{err}</p>}
        <div className="exam-setup-form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding…' : 'Add chapter'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function ChapterRow({ examId, subjectId, chapter, onUpdate, onDelete, onRefresh }) {
  const [edit, setEdit] = useState(false);
  const [num, setNum] = useState(chapter.ChapterNumber ?? '');
  const [name, setName] = useState(chapter.ChapterName ?? '');

  const handleSave = async (e) => {
    e.preventDefault();
    await onUpdate(chapter.ChapterID, {
      chapterNumber: num === '' ? null : parseInt(num, 10),
      chapterName: name.trim() || null,
    });
    setEdit(false);
    onRefresh?.();
  };

  const label = [chapter.ChapterNumber != null ? `Ch. ${chapter.ChapterNumber}` : '', chapter.ChapterName].filter(Boolean).join(': ') || 'Chapter';

  return (
    <li className="exam-setup-list-item">
      {!edit ? (
        <>
          <span className="exam-setup-list-item-label">{label}</span>
          <div className="exam-setup-list-item-actions">
            <button type="button" className="icon-btn" onClick={() => setEdit(true)} title="Edit chapter"><Edit2 size={14} /></button>
            <button type="button" className="icon-btn danger" onClick={() => onDelete(chapter.ChapterID)} title="Delete chapter"><Trash2 size={14} /></button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSave} className="exam-setup-inline-edit">
          <input type="number" value={num} onChange={(e) => setNum(e.target.value)} min={1} placeholder="No." />
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <button type="submit" className="btn btn-sm btn-primary">Save</button>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
        </form>
      )}
    </li>
  );
}

function AddTopicCard({ subject, onClose, onSubmit }) {
  const [topicName, setTopicName] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [description, setDescription] = useState('');
  const chapters = subject?.chapters || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!topicName.trim()) return;
    onSubmit({
      topicName: topicName.trim(),
      chapterId: chapterId || null,
      description: description.trim() || null,
    });
  };

  return (
    <div className="exam-setup-form-card">
      <h4>New topic</h4>
      <form onSubmit={handleSubmit}>
        <div className="exam-setup-field">
          <label htmlFor="top-name">Topic name *</label>
          <input id="top-name" type="text" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Newton's Laws of Motion" required />
        </div>
        <div className="exam-setup-field">
          <label htmlFor="top-ch">Chapter (optional)</label>
          <select id="top-ch" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">No chapter</option>
            {chapters.map((ch) => (
              <option key={ch.ChapterID} value={ch.ChapterID}>
                {[ch.ChapterNumber != null ? `Ch. ${ch.ChapterNumber}` : '', ch.ChapterName].filter(Boolean).join(': ') || ch.ChapterID}
              </option>
            ))}
          </select>
        </div>
        <div className="exam-setup-field">
          <label htmlFor="top-desc">Description (optional)</label>
          <textarea id="top-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short description" />
        </div>
        <div className="exam-setup-form-actions">
          <button type="submit" className="btn btn-primary">Add topic</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function EditSubjectModal({ subject, onClose, onSubmit }) {
  const [name, setName] = useState(subject.SubjectName || '');
  const [description, setDescription] = useState(subject.Description || '');
  const [weightage, setWeightage] = useState(subject.Weightage ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSubmit({
        subjectName: name.trim(),
        description: description.trim() || null,
        weightage: weightage === '' ? null : parseFloat(weightage),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit subject</h2>
          <button type="button" className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Subject name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Weightage %</label>
            <input type="number" value={weightage} onChange={(e) => setWeightage(e.target.value)} min={0} max={100} step={0.01} placeholder="0–100" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTopicModalSetup({ topic, subject, onClose, onSubmit }) {
  const [topicName, setTopicName] = useState(topic.TopicName || '');
  const [chapterId, setChapterId] = useState(topic.ChapterID || '');
  const [description, setDescription] = useState(topic.Description || '');
  const [loading, setLoading] = useState(false);
  const chapters = subject?.chapters || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!topicName.trim()) return;
    setLoading(true);
    try {
      await onSubmit({
        topicName: topicName.trim(),
        chapterId: chapterId || null,
        description: description.trim() || null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit topic</h2>
          <button type="button" className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Topic name *</label>
            <input type="text" value={topicName} onChange={(e) => setTopicName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Chapter (optional)</label>
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ExamSetup;
