import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  FileText,
  Edit2,
  Trash2,
  BookOpen,
  X,
  Settings2,
  Search,
  Layers,
  Calendar,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Exams.css';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
];

const Exams = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [deletingExam, setDeletingExam] = useState(null);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const loadExams = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getExams();
      setExams(response.exams || []);
    } catch (err) {
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    return {
      total: exams.length,
      withPlan: exams.filter((e) => e.NoOfSubjects != null && e.NoOfSubjects !== '').length,
      recent: exams.filter((e) => e.CreatedAt && new Date(e.CreatedAt).getTime() >= thirtyDaysAgo).length,
    };
  }, [exams]);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = exams;
    if (q) {
      list = list.filter(
        (e) =>
          e.ExamName?.toLowerCase().includes(q) ||
          e.Description?.toLowerCase().includes(q) ||
          e.Syllabus?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.CreatedAt || 0) - new Date(b.CreatedAt || 0);
        case 'name-asc':
          return (a.ExamName || '').localeCompare(b.ExamName || '');
        case 'name-desc':
          return (b.ExamName || '').localeCompare(a.ExamName || '');
        case 'newest':
        default:
          return new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
      }
    });
  }, [exams, search, sortBy]);

  const handleCreateExam = async (examData, openSetupAfter) => {
    try {
      setError('');
      setSuccess('');
      const response = await adminAPI.createExam(examData);
      setShowCreateModal(false);
      if (openSetupAfter && response?.exam?.ExamID) {
        navigate(`/admin/exams/setup/${response.exam.ExamID}`);
        return;
      }
      setSuccess('Exam created. Open Setup on any row to add subjects, chapters, and topics.');
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to create exam');
      throw err;
    }
  };

  const handleUpdateExam = async (examId, examData) => {
    try {
      setError('');
      setSuccess('');
      await adminAPI.updateExam(examId, examData);
      setSuccess('Exam updated.');
      setEditingExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to update exam');
    }
  };

  const confirmDeleteExam = async () => {
    if (!deletingExam) return;
    try {
      setError('');
      setSuccess('');
      await adminAPI.deleteExam(deletingExam);
      setSuccess('Exam deleted.');
      setDeletingExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || 'Failed to delete exam');
      setDeletingExam(null);
    }
  };

  return (
    <div className="sa-exams">
      <header className="sa-exams-hero">
        <div className="sa-exams-hero__main">
          <div className="sa-exams-hero__icon" aria-hidden>
            <BookOpen size={28} />
          </div>
          <div>
            <p className="sa-exams-hero__eyebrow">Platform content</p>
            <h1 className="sa-exams-hero__title">Exams &amp; Content</h1>
            <p className="sa-exams-hero__desc">
              Create platform-wide exams here, then open <strong>Setup</strong> to build subjects, chapters, and topics.
            </p>
          </div>
        </div>
        <button type="button" className="sa-exams-btn sa-exams-btn--primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={20} />
          Create exam
        </button>
      </header>

      {!loading && exams.length > 0 && (
        <div className="sa-exams-stats">
          <StatCard icon={Layers} label="Total exams" value={stats.total} tone="navy" />
          <StatCard icon={Sparkles} label="With subject plan" value={stats.withPlan} tone="crimson" />
          <StatCard icon={Calendar} label="Added last 30 days" value={stats.recent} tone="teal" />
        </div>
      )}

      {error && <div className="sa-exams-notice sa-exams-notice--error">{error}</div>}
      {success && <div className="sa-exams-notice sa-exams-notice--success">{success}</div>}

      {!loading && exams.length > 0 && (
        <div className="sa-exams-toolbar">
          <div className="sa-exams-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              placeholder="Search exams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search exams"
            />
          </div>
          <div className="sa-exams-sort">
            <ArrowUpDown size={16} aria-hidden />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort exams">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="sa-exams-loading">
          <div className="sa-exams-spinner" />
          <p>Loading exams…</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="sa-exams-empty">
          <div className="sa-exams-empty__icon">
            <FileText size={40} />
          </div>
          <h2>No exams yet</h2>
          <p>Create your first platform exam, then use Setup to define its content structure.</p>
          <button type="button" className="sa-exams-btn sa-exams-btn--primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={20} />
            Create exam
          </button>
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="sa-exams-empty sa-exams-empty--compact">
          <Search size={32} />
          <h2>No matches</h2>
          <p>Try a different search term or clear the filter.</p>
          <button type="button" className="sa-exams-btn sa-exams-btn--secondary" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      ) : (
        <>
          <div className="sa-exams-table-wrap" role="region" aria-label="Exams list">
            <table className="sa-exams-table">
              <thead>
                <tr>
                  <th scope="col">Exam</th>
                  <th scope="col">Subject plan</th>
                  <th scope="col">Created</th>
                  <th scope="col" className="sa-exams-table__actions-col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredExams.map((exam) => (
                  <ExamTableRow
                    key={exam.ExamID}
                    exam={exam}
                    onEdit={() => setEditingExam(exam)}
                    onDelete={() => setDeletingExam(exam.ExamID)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="sa-exams-cards">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.ExamID}
                exam={exam}
                onEdit={() => setEditingExam(exam)}
                onDelete={() => setDeletingExam(exam.ExamID)}
              />
            ))}
          </div>

          <p className="sa-exams-footnote">
            Showing {filteredExams.length} of {exams.length} exam{exams.length === 1 ? '' : 's'}
          </p>
        </>
      )}

      {showCreateModal && (
        <ExamFormModal
          title="Create exam"
          submitLabel="Create exam"
          showSetupOption
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateExam}
        />
      )}

      {editingExam && (
        <ExamFormModal
          title="Edit exam"
          submitLabel="Save changes"
          exam={editingExam}
          onClose={() => setEditingExam(null)}
          onSubmit={(data) => handleUpdateExam(editingExam.ExamID, data)}
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

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`sa-exams-stat sa-exams-stat--${tone}`}>
      <div className="sa-exams-stat__icon">
        <Icon size={20} />
      </div>
      <div>
        <p className="sa-exams-stat__value">{value}</p>
        <p className="sa-exams-stat__label">{label}</p>
      </div>
    </div>
  );
}

function subjectPlanBadge(exam) {
  if (exam.NoOfSubjects != null && exam.NoOfSubjects !== '') {
    const n = Number(exam.NoOfSubjects);
    return { text: `${n} subject${n === 1 ? '' : 's'} planned`, tone: 'ready' };
  }
  return { text: 'Not planned yet', tone: 'muted' };
}

function ExamTableRow({ exam, onEdit, onDelete }) {
  const badge = subjectPlanBadge(exam);

  return (
    <tr>
      <td>
        <div className="sa-exams-row-name">
          <span className="sa-exams-row-name__title">{exam.ExamName}</span>
          {exam.Description && <span className="sa-exams-row-name__desc">{exam.Description}</span>}
        </div>
      </td>
      <td>
        <span className={`sa-exams-badge sa-exams-badge--${badge.tone}`}>{badge.text}</span>
      </td>
      <td className="sa-exams-row-date">
        {exam.CreatedAt ? new Date(exam.CreatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
      </td>
      <td>
        <div className="sa-exams-row-actions">
          <Link to={`/admin/exams/setup/${exam.ExamID}`} className="sa-exams-btn sa-exams-btn--setup" title="Manage content structure">
            <Settings2 size={16} />
            Setup
          </Link>
          <button type="button" className="sa-exams-icon-btn" onClick={onEdit} title="Edit exam details" aria-label={`Edit ${exam.ExamName}`}>
            <Edit2 size={17} />
          </button>
          <button
            type="button"
            className="sa-exams-icon-btn sa-exams-icon-btn--danger"
            onClick={onDelete}
            title="Delete exam"
            aria-label={`Delete ${exam.ExamName}`}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ExamCard({ exam, onEdit, onDelete }) {
  const badge = subjectPlanBadge(exam);

  return (
    <article className="sa-exams-card">
      <div className="sa-exams-card__head">
        <h3>{exam.ExamName}</h3>
        <span className={`sa-exams-badge sa-exams-badge--${badge.tone}`}>{badge.text}</span>
      </div>
      {exam.Description && <p className="sa-exams-card__desc">{exam.Description}</p>}
      <p className="sa-exams-card__meta">
        Created {exam.CreatedAt ? new Date(exam.CreatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
      </p>
      <div className="sa-exams-card__actions">
        <Link to={`/admin/exams/setup/${exam.ExamID}`} className="sa-exams-btn sa-exams-btn--setup">
          <Settings2 size={16} />
          Setup
        </Link>
        <button type="button" className="sa-exams-icon-btn" onClick={onEdit} aria-label={`Edit ${exam.ExamName}`}>
          <Edit2 size={17} />
        </button>
        <button type="button" className="sa-exams-icon-btn sa-exams-icon-btn--danger" onClick={onDelete} aria-label={`Delete ${exam.ExamName}`}>
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

function ExamFormModal({ title, submitLabel, exam, showSetupOption, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    examName: exam?.ExamName || '',
    description: exam?.Description || '',
    syllabus: exam?.Syllabus || '',
    noOfSubjects: exam?.NoOfSubjects ?? '',
  });
  const [openSetupAfter, setOpenSetupAfter] = useState(Boolean(showSetupOption));
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.examName.trim()) {
      setValidationError('Exam name is required');
      return;
    }
    setValidationError('');
    setLoading(true);
    try {
      const payload = {
        examName: formData.examName.trim(),
        description: formData.description.trim() || null,
        syllabus: formData.syllabus.trim() || null,
        noOfSubjects: formData.noOfSubjects !== '' ? parseInt(formData.noOfSubjects, 10) : null,
      };
      if (showSetupOption) {
        await onSubmit(payload, openSetupAfter);
      } else {
        await onSubmit(payload);
      }
    } catch (err) {
      setValidationError(err.message || 'Failed to save exam');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sa-exams-modal-overlay" onClick={onClose} role="presentation">
      <div className="sa-exams-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="exam-form-title">
        <div className="sa-exams-modal__header">
          <h2 id="exam-form-title">{title}</h2>
          <button type="button" className="sa-exams-icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="sa-exams-modal__body">
          {validationError && <div className="sa-exams-notice sa-exams-notice--error">{validationError}</div>}
          <div className="sa-exams-field">
            <label htmlFor="exam-name">
              Exam name <span className="sa-exams-required">*</span>
            </label>
            <input
              id="exam-name"
              type="text"
              value={formData.examName}
              onChange={(e) => setFormData({ ...formData, examName: e.target.value })}
              required
              placeholder="e.g. MDCAT, ECAT"
              autoFocus
            />
          </div>
          <div className="sa-exams-field">
            <label htmlFor="exam-desc">Description</label>
            <textarea
              id="exam-desc"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              placeholder="Brief description for admins"
            />
          </div>
          <div className="sa-exams-field">
            <label htmlFor="exam-syllabus">Syllabus notes</label>
            <textarea
              id="exam-syllabus"
              value={formData.syllabus}
              onChange={(e) => setFormData({ ...formData, syllabus: e.target.value })}
              rows={2}
              placeholder="Optional syllabus reference"
            />
          </div>
          <div className="sa-exams-field">
            <label htmlFor="exam-subjects">Expected number of subjects</label>
            <input
              id="exam-subjects"
              type="number"
              value={formData.noOfSubjects}
              onChange={(e) => setFormData({ ...formData, noOfSubjects: e.target.value })}
              min="0"
              max="50"
              placeholder="Optional — for planning"
            />
          </div>
          <p className="sa-exams-form-hint">
            Subjects, chapters, and topics are added in <strong>Setup</strong> after the exam exists.
          </p>
          {showSetupOption && (
            <label className="sa-exams-checkbox">
              <input type="checkbox" checked={openSetupAfter} onChange={(e) => setOpenSetupAfter(e.target.checked)} />
              Open Setup immediately after creating
            </label>
          )}
          <div className="sa-exams-modal__footer">
            <button type="button" className="sa-exams-btn sa-exams-btn--secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="sa-exams-btn sa-exams-btn--primary" disabled={loading}>
              {loading ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteExamModal({ exam, onClose, onConfirm }) {
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
    <div className="sa-exams-modal-overlay" onClick={onClose} role="presentation">
      <div className="sa-exams-modal sa-exams-modal--danger" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <div className="sa-exams-modal__header">
          <h2>Delete exam</h2>
          <button type="button" className="sa-exams-icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sa-exams-modal__body sa-exams-delete">
          <div className="sa-exams-delete__icon">
            <Trash2 size={36} />
          </div>
          <h3>Delete {exam.ExamName}?</h3>
          <p>This permanently removes the exam and all subjects, chapters, and topics under it.</p>
          <div className="sa-exams-modal__footer">
            <button type="button" className="sa-exams-btn sa-exams-btn--secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="button" className="sa-exams-btn sa-exams-btn--danger" onClick={handleConfirm} disabled={loading}>
              {loading ? 'Deleting…' : 'Delete exam'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Exams;
