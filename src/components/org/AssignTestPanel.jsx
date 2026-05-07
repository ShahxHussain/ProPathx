import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { testAPI, studentAPI, groupAPI } from '../../services/api';
import '../../pages/org/Tests.css';

const MIN_QUESTIONS_GATE = 1;

/** Supabase rows use TestID; some create responses use testId */
function getTestId(test, fallback) {
  return fallback || test?.TestID || test?.testId || null;
}

/** API errors may put text in message, details string, or details.error object */
function pickErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  const d = err.details;
  const detailStr =
    typeof d === 'string' && d.trim()
      ? d.trim()
      : d && typeof d === 'object'
        ? (typeof d.details === 'string' && d.details.trim()) ||
          (typeof d.error === 'string' && d.error.trim()) ||
          (typeof d.message === 'string' && d.message.trim()) ||
          ''
        : '';
  const msg = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : '';
  if (msg && detailStr && !msg.includes(detailStr)) return `${msg}: ${detailStr}`;
  if (msg) return msg;
  if (detailStr) return detailStr;
  return fallback;
}

function pickSuccessMessage(result, fallback = 'Assignment saved successfully.') {
  if (!result) return fallback;
  if (typeof result.message === 'string' && result.message.trim()) return result.message.trim();
  return fallback;
}

/**
 * Assign test to students/groups — same behaviour as the former inline modal; usable as a modal or embedded panel.
 */
export default function AssignTestModal({ test, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [assignmentType, setAssignmentType] = useState('single');
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [conflictDetails, setConflictDetails] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [singleStudentAlreadyAssigned, setSingleStudentAlreadyAssigned] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const lastSuccessPayloadRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [readiness, setReadiness] = useState({
    loading: true,
    ok: false,
    message: '',
    bindingMode: 'custom',
    linkedCount: 0,
    totalQuestions: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSuccessMessage('');
    setError('');
    setConflictDetails(null);
    setSingleStudentAlreadyAssigned(false);
    lastSuccessPayloadRef.current = null;
  }, [test?.TestID, test?.testId]);

  useEffect(() => {
    if (!getTestId(test)) return;
    let cancelled = false;
    (async () => {
      setReadiness((r) => ({ ...r, loading: true }));
      try {
        const res = await testAPI.getTestDetails(getTestId(test));
        const t = res.test || {};
        const linked = Array.isArray(t.questions) ? t.questions.length : 0;
        const mode = String(t.bindingType || t.QuestionBindingMode || 'custom').toLowerCase();
        const total = t.TotalQuestions != null ? Number(t.TotalQuestions) : 0;
        const hybridPct = Number(t.HybridAutoPercent ?? t.hybridAutoPercent ?? 0);
        let ok = false;
        let message = '';
        if (mode === 'auto') {
          ok = total >= MIN_QUESTIONS_GATE;
          message = ok
            ? 'Auto mode: total questions is set. You can assign (questions are drawn at attempt time).'
            : 'Set at least one total question on this test before assigning.';
        } else if (mode === 'hybrid') {
          if (hybridPct >= 100) {
            ok = total >= MIN_QUESTIONS_GATE;
            message = ok ? 'Hybrid (100% auto): totals OK for assignment.' : 'Set total questions before assigning.';
          } else {
            ok = linked >= MIN_QUESTIONS_GATE && total >= MIN_QUESTIONS_GATE;
            message = ok
              ? 'Hybrid mode: custom questions and totals look good.'
              : 'Add questions for the custom portion and set total questions, then return here.';
          }
        } else {
          ok = linked >= MIN_QUESTIONS_GATE;
          message = ok
            ? 'Custom mode: linked questions meet the minimum. You can assign.'
            : `Add at least ${MIN_QUESTIONS_GATE} question(s) in the test wizard (Question build step) before assigning.`;
        }
        if (!cancelled) {
          setReadiness({
            loading: false,
            ok,
            message,
            bindingMode: mode,
            linkedCount: linked,
            totalQuestions: total,
          });
        }
      } catch {
        if (!cancelled) {
          setReadiness({
            loading: false,
            ok: false,
            message: 'Could not verify test configuration.',
            bindingMode: 'custom',
            linkedCount: 0,
            totalQuestions: 0,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [test?.TestID, test?.testId]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [studentsRes, groupsRes] = await Promise.allSettled([
        studentAPI.getStudents({ limit: 1000 }),
        groupAPI.getGroups({ limit: 1000 }),
      ]);

      if (studentsRes.status === 'fulfilled') {
        setStudents(studentsRes.value.students || []);
      }
      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value.groups || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConflictDetails(null);
    setSingleStudentAlreadyAssigned(false);
    setSuccessMessage('');
    if (!readiness.ok) {
      setError(readiness.message || 'Finish test setup before assigning.');
      return;
    }
    const payload = {
      assignmentType,
      selectedStudent,
      selectedStudents,
      selectedGroup,
      selectedGroups,
      dueDate: dueDate || undefined,
    };
    setLastPayload(payload);
    setLoading(true);

    try {
      let result;
      switch (assignmentType) {
        case 'single':
          if (!selectedStudent) {
            setError('Please select a student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToSingle(getTestId(test), selectedStudent, payload.dueDate);
          break;
        case 'multiple':
          if (selectedStudents.length === 0) {
            setError('Please select at least one student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToMultiple(getTestId(test), selectedStudents, payload.dueDate);
          break;
        case 'group':
          if (!selectedGroup) {
            setError('Please select a group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroup(getTestId(test), selectedGroup, payload.dueDate);
          break;
        case 'groups':
          if (selectedGroups.length === 0) {
            setError('Please select at least one group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroups(getTestId(test), selectedGroups, payload.dueDate);
          break;
        case 'all':
          result = await testAPI.assignToAll(getTestId(test), payload.dueDate);
          break;
        default:
          setError('Invalid assignment type');
          setLoading(false);
          return;
      }

      const msg = pickSuccessMessage(result, 'Test assigned successfully.');
      lastSuccessPayloadRef.current = result;
      setSuccessMessage(msg);
    } catch (err) {
      const details = err?.details;
      const hasConflictDetails =
        err?.status === 409 &&
        details &&
        typeof details === 'object' &&
        Array.isArray(details.alreadyAssignedStudents);

      if (err?.status === 409 && assignmentType === 'single') {
        setSingleStudentAlreadyAssigned(true);
        setError(
          pickErrorMessage(
            err,
            'This test is already assigned to this student. Use “Replace assignment” to update the due date.'
          )
        );
      } else if (hasConflictDetails) {
        setConflictDetails(details);
        setError(pickErrorMessage(err, 'Some students already have this test assigned.'));
      } else {
        setError(pickErrorMessage(err, 'Failed to assign test.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceExisting = async () => {
    if (!lastPayload) return;
    setLoading(true);
    setError('');
    setSingleStudentAlreadyAssigned(false);
    setSuccessMessage('');
    try {
      let result;
      switch (lastPayload.assignmentType) {
        case 'single':
          result = await testAPI.assignToSingle(
            getTestId(test),
            lastPayload.selectedStudent,
            lastPayload.dueDate,
            true
          );
          break;
        case 'multiple':
          result = await testAPI.assignToMultiple(
            getTestId(test),
            lastPayload.selectedStudents,
            lastPayload.dueDate,
            true
          );
          break;
        case 'group':
          result = await testAPI.assignToGroup(
            getTestId(test),
            lastPayload.selectedGroup,
            lastPayload.dueDate,
            true
          );
          break;
        case 'groups':
          result = await testAPI.assignToGroups(
            getTestId(test),
            lastPayload.selectedGroups,
            lastPayload.dueDate,
            true
          );
          break;
        case 'all':
          result = await testAPI.assignToAll(getTestId(test), lastPayload.dueDate, true);
          break;
        default:
          throw new Error('Invalid assignment type');
      }

      setConflictDetails(null);
      const msg = pickSuccessMessage(result, 'Assignment updated successfully.');
      lastSuccessPayloadRef.current = result;
      setSuccessMessage(msg);
    } catch (err) {
      setError(pickErrorMessage(err, 'Failed to replace assignments.'));
    } finally {
      setLoading(false);
    }
  };

  const finishSuccessAndClose = () => {
    const payload = lastSuccessPayloadRef.current;
    lastSuccessPayloadRef.current = null;
    setSuccessMessage('');
    if (onSuccess) onSuccess(payload);
    onClose();
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleGroupSelection = (groupId) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const filteredStudents = students.filter(
    (s) =>
      s.FullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.Email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openQuestionWizard = () => navigate(`/org/tests/wizard/${getTestId(test)}?step=3`);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign Test: {test?.TestName}</h2>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {successMessage ? (
          <div className="modal-body" style={{ padding: '8px 24px 28px' }}>
            <div
              className="notice success"
              role="status"
              aria-live="polite"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}
            >
              <CheckCircle size={26} />
              <div>
                <strong style={{ display: 'block', marginBottom: 6 }}>Success</strong>
                <span>{successMessage}</span>
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={finishSuccessAndClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
        {readiness.loading && (
          <div className="notice info" style={{ marginBottom: 12 }}>
            <AlertCircle size={18} />
            <span>Checking test readiness (binding mode and questions)…</span>
          </div>
        )}

        {!readiness.loading && readiness.ok && (
          <div className="notice success" style={{ marginBottom: 12 }}>
            <CheckCircle size={18} />
            <div>
              <strong>Ready to assign</strong>
              <p style={{ margin: '6px 0 0', fontSize: 14 }}>{readiness.message}</p>
            </div>
          </div>
        )}

        {!readiness.loading && !readiness.ok && (
          <div className="notice error" style={{ marginBottom: 12 }}>
            <AlertCircle size={18} />
            <div style={{ flex: 1 }}>
              <strong>Finish setup before assigning</strong>
              <p style={{ margin: '8px 0 12px', fontSize: 14 }}>{readiness.message}</p>
              <button type="button" className="btn-secondary btn-sm" onClick={openQuestionWizard}>
                Open test wizard — Question build
              </button>
            </div>
          </div>
        )}

        {conflictDetails && (
          <div className="notice error" style={{ marginBottom: '12px' }}>
            <AlertCircle size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Assignment conflict</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                {conflictDetails.scope === 'groups'
                  ? 'All students in the selected groups already have this test assigned.'
                  : 'All students in this group already have this test assigned.'}
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Already assigned (
                  {conflictDetails.alreadyAssignedCount || conflictDetails.alreadyAssignedStudents.length})
                </div>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--background)',
                  }}
                >
                  <table className="tests-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 10 }}>Student</th>
                        <th style={{ padding: 10 }}>Email</th>
                        <th style={{ padding: 10 }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflictDetails.alreadyAssignedStudents.map((s) => (
                        <tr key={s.studentId}>
                          <td style={{ padding: 10 }}>{s.fullName || 'N/A'}</td>
                          <td style={{ padding: 10 }}>{s.email || 'N/A'}</td>
                          <td style={{ padding: 10 }}>{s.reason || 'Already assigned'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setConflictDetails(null)}>
                  Close details
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleReplaceExisting}
                  disabled={loading}
                  title="Delete existing assignments for these students and re-assign with the current settings"
                >
                  Replace assignments
                </button>
              </div>
            </div>
          </div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Assignment Type *</span>
              <select
                value={assignmentType}
                onChange={(e) => {
                  setAssignmentType(e.target.value);
                  setSelectedStudent('');
                  setSelectedStudents([]);
                  setSelectedGroup('');
                  setSelectedGroups([]);
                  setError('');
                  setConflictDetails(null);
                  setSuccessMessage('');
                }}
                required
              >
                <option value="single">Single Student</option>
                <option value="multiple">Multiple Students</option>
                <option value="group">One Group</option>
                <option value="groups">Multiple Groups</option>
                <option value="all">All Students</option>
              </select>
            </label>
          </div>

          {assignmentType === 'single' && (
            <div className="form-row">
              <label>
                <span>Select Student *</span>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  required
                >
                  <option value="">Choose a student...</option>
                  {students.map((student) => (
                    <option key={student.StudentID} value={student.StudentID}>
                      {student.FullName} ({student.Email})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="form-row">
            <label>
              <span>Due Date (optional)</span>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                If set, assignment will show this due date for students.
              </small>
            </label>
          </div>

          {assignmentType === 'multiple' && (
            <div className="form-row">
              <label>
                <span>Select Students *</span>
                <div className="search-box" style={{ marginBottom: '12px' }}>
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="students-select-list">
                  {loadingData ? (
                    <div className="loading-state">Loading students...</div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="empty-state">No students found</div>
                  ) : (
                    filteredStudents.map((student) => (
                      <label key={student.StudentID} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.StudentID)}
                          onChange={() => toggleStudentSelection(student.StudentID)}
                        />
                        <span>
                          {student.FullName} ({student.Email})
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedStudents.length > 0 && (
                  <div className="selected-count">{selectedStudents.length} student(s) selected</div>
                )}
              </label>
            </div>
          )}

          {assignmentType === 'group' && (
            <div className="form-row">
              <label>
                <span>Select Group *</span>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  required
                >
                  <option value="">Choose a group...</option>
                  {groups.map((group) => (
                    <option key={group.GroupID} value={group.GroupID}>
                      {group.GroupName} ({group.memberCount || 0} members)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {assignmentType === 'groups' && (
            <div className="form-row">
              <label>
                <span>Select Groups *</span>
                <div className="groups-select-list">
                  {loadingData ? (
                    <div className="loading-state">Loading groups...</div>
                  ) : groups.length === 0 ? (
                    <div className="empty-state">No groups found</div>
                  ) : (
                    groups.map((group) => (
                      <label key={group.GroupID} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(group.GroupID)}
                          onChange={() => toggleGroupSelection(group.GroupID)}
                        />
                        <span>
                          {group.GroupName} ({group.memberCount || 0} members)
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedGroups.length > 0 && (
                  <div className="selected-count">{selectedGroups.length} group(s) selected</div>
                )}
              </label>
            </div>
          )}

          {assignmentType === 'all' && (
            <div className="notice info">
              <AlertCircle size={18} />
              <span>This will assign the test to all active students in your organization.</span>
            </div>
          )}

          {error && (
            <div
              className="notice error"
              role="alert"
              aria-live="assertive"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {singleStudentAlreadyAssigned && lastPayload?.assignmentType === 'single' && (
            <div className="notice warning" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: '0 0 8px' }}>
                This student already has this test assigned. Use replace to update the due date or re-issue the assignment.
              </p>
              <button type="button" className="btn-primary btn-sm" onClick={handleReplaceExisting} disabled={loading}>
                Replace assignment
              </button>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || readiness.loading || !readiness.ok}
              title={!readiness.ok && !readiness.loading ? 'Complete question setup first' : undefined}
            >
              {loading ? 'Assigning...' : 'Assign Test'}
            </button>
          </div>
        </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Same assign UI without modal chrome — for the test wizard final step. */
export function AssignTestPanelEmbedded({ test, onAssigned, canonicalTestId }) {
  const navigate = useNavigate();
  const tid = getTestId(test, canonicalTestId);
  const [assignmentType, setAssignmentType] = useState('single');
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [conflictDetails, setConflictDetails] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [singleStudentAlreadyAssigned, setSingleStudentAlreadyAssigned] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [readiness, setReadiness] = useState({
    loading: true,
    ok: false,
    message: '',
    bindingMode: 'custom',
    linkedCount: 0,
    totalQuestions: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setSuccessMessage('');
    setError('');
    setConflictDetails(null);
    setSingleStudentAlreadyAssigned(false);
  }, [tid]);

  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    (async () => {
      setReadiness((r) => ({ ...r, loading: true }));
      try {
        const res = await testAPI.getTestDetails(tid);
        const t = res.test || {};
        const linked = Array.isArray(t.questions) ? t.questions.length : 0;
        const mode = String(t.bindingType || t.QuestionBindingMode || 'custom').toLowerCase();
        const total = t.TotalQuestions != null ? Number(t.TotalQuestions) : 0;
        const hybridPct = Number(t.HybridAutoPercent ?? t.hybridAutoPercent ?? 0);
        let ok = false;
        let message = '';
        if (mode === 'auto') {
          ok = total >= MIN_QUESTIONS_GATE;
          message = ok
            ? 'Auto mode: ready.'
            : 'Set total questions before assigning.';
        } else if (mode === 'hybrid') {
          if (hybridPct >= 100) {
            ok = total >= MIN_QUESTIONS_GATE;
            message = ok ? 'Hybrid (100% auto): ready.' : 'Set total questions before assigning.';
          } else {
            ok = linked >= MIN_QUESTIONS_GATE && total >= MIN_QUESTIONS_GATE;
            message = ok ? 'Hybrid: ready.' : 'Complete the custom portion and totals.';
          }
        } else {
          ok = linked >= MIN_QUESTIONS_GATE;
          message = ok ? 'Custom: ready.' : 'Add questions in the Question build step.';
        }
        if (!cancelled) {
          setReadiness({
            loading: false,
            ok,
            message,
            bindingMode: mode,
            linkedCount: linked,
            totalQuestions: total,
          });
        }
      } catch {
        if (!cancelled) {
          setReadiness({
            loading: false,
            ok: false,
            message: 'Could not verify test configuration.',
            bindingMode: 'custom',
            linkedCount: 0,
            totalQuestions: 0,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tid]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [studentsRes, groupsRes] = await Promise.allSettled([
        studentAPI.getStudents({ limit: 1000 }),
        groupAPI.getGroups({ limit: 1000 }),
      ]);
      if (studentsRes.status === 'fulfilled') setStudents(studentsRes.value.students || []);
      if (groupsRes.status === 'fulfilled') setGroups(groupsRes.value.groups || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConflictDetails(null);
    setSingleStudentAlreadyAssigned(false);
    setSuccessMessage('');
    if (!readiness.ok) {
      setError(readiness.message || 'Finish test setup before assigning.');
      return;
    }
    const payload = {
      assignmentType,
      selectedStudent,
      selectedStudents,
      selectedGroup,
      selectedGroups,
      dueDate: dueDate || undefined,
    };
    setLastPayload(payload);
    setLoading(true);
    try {
      let result;
      switch (assignmentType) {
        case 'single':
          if (!selectedStudent) {
            setError('Please select a student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToSingle(tid, selectedStudent, payload.dueDate);
          break;
        case 'multiple':
          if (selectedStudents.length === 0) {
            setError('Please select at least one student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToMultiple(tid, selectedStudents, payload.dueDate);
          break;
        case 'group':
          if (!selectedGroup) {
            setError('Please select a group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroup(tid, selectedGroup, payload.dueDate);
          break;
        case 'groups':
          if (selectedGroups.length === 0) {
            setError('Please select at least one group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroups(tid, selectedGroups, payload.dueDate);
          break;
        case 'all':
          result = await testAPI.assignToAll(tid, payload.dueDate);
          break;
        default:
          setError('Invalid assignment type');
          setLoading(false);
          return;
      }
      setSuccessMessage(pickSuccessMessage(result, 'Test assigned successfully.'));
      if (onAssigned) onAssigned(result);
    } catch (err) {
      const details = err?.details;
      const hasConflictDetails =
        err?.status === 409 &&
        details &&
        typeof details === 'object' &&
        Array.isArray(details.alreadyAssignedStudents);
      if (err?.status === 409 && assignmentType === 'single') {
        setSingleStudentAlreadyAssigned(true);
        setError(
          pickErrorMessage(
            err,
            'This test is already assigned to this student. Use “Replace assignment” to update the due date.'
          )
        );
      } else if (hasConflictDetails) {
        setConflictDetails(details);
        setError(pickErrorMessage(err, 'Some students already have this test assigned.'));
      } else {
        setError(pickErrorMessage(err, 'Failed to assign test.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceExisting = async () => {
    if (!lastPayload) return;
    setLoading(true);
    setError('');
    setSingleStudentAlreadyAssigned(false);
    setSuccessMessage('');
    try {
      let result;
      switch (lastPayload.assignmentType) {
        case 'single':
          result = await testAPI.assignToSingle(
            tid,
            lastPayload.selectedStudent,
            lastPayload.dueDate,
            true
          );
          break;
        case 'multiple':
          result = await testAPI.assignToMultiple(
            tid,
            lastPayload.selectedStudents,
            lastPayload.dueDate,
            true
          );
          break;
        case 'group':
          result = await testAPI.assignToGroup(
            tid,
            lastPayload.selectedGroup,
            lastPayload.dueDate,
            true
          );
          break;
        case 'groups':
          result = await testAPI.assignToGroups(
            tid,
            lastPayload.selectedGroups,
            lastPayload.dueDate,
            true
          );
          break;
        case 'all':
          result = await testAPI.assignToAll(tid, lastPayload.dueDate, true);
          break;
        default:
          throw new Error('Invalid assignment type');
      }
      setConflictDetails(null);
      setSuccessMessage(pickSuccessMessage(result, 'Assignment updated successfully.'));
      if (onAssigned) onAssigned(result);
    } catch (err) {
      setError(pickErrorMessage(err, 'Failed to replace assignments.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleGroupSelection = (groupId) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const filteredStudents = students.filter(
    (s) =>
      s.FullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.Email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="tw-assign-embedded">
      {successMessage && (
        <div
          className="notice success"
          role="status"
          aria-live="polite"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}
        >
          <CheckCircle size={22} />
          <span>{successMessage}</span>
        </div>
      )}
      <h3 className="tw-assign-title">Assign test</h3>
      <p className="tw-assign-lead">
        Same options as on the Tests page. You can skip this now and assign later from Tests — the test stays reusable.
      </p>

      {readiness.loading && (
        <div className="notice info" style={{ marginBottom: 12 }}>
          <AlertCircle size={18} />
          <span>Checking readiness…</span>
        </div>
      )}
      {!readiness.loading && readiness.ok && (
        <div className="notice success" style={{ marginBottom: 12 }}>
          <CheckCircle size={18} />
          <span>{readiness.message}</span>
        </div>
      )}
      {!readiness.loading && !readiness.ok && (
        <div className="notice error" style={{ marginBottom: 12 }}>
          <AlertCircle size={18} />
          <div style={{ flex: 1 }}>
            <span>{readiness.message}</span>
            <button type="button" className="btn-secondary btn-sm" style={{ marginLeft: 12 }} onClick={() => navigate(`/org/tests/wizard/${tid}?step=3`)}>
              Back to Question build
            </button>
          </div>
        </div>
      )}

      {conflictDetails && (
        <div className="notice error" style={{ marginBottom: 12 }}>
          <AlertCircle size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Assignment conflict</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConflictDetails(null)}>
                Close
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={handleReplaceExisting} disabled={loading}>
                Replace assignments
              </button>
            </div>
          </div>
        </div>
      )}

      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            <span>Assignment type *</span>
            <select
              value={assignmentType}
              onChange={(e) => {
                setAssignmentType(e.target.value);
                setSelectedStudent('');
                setSelectedStudents([]);
                setSelectedGroup('');
                setSelectedGroups([]);
                setError('');
                setConflictDetails(null);
                setSuccessMessage('');
              }}
              required
            >
              <option value="single">Single student</option>
              <option value="multiple">Multiple students</option>
              <option value="group">One group</option>
              <option value="groups">Multiple groups</option>
              <option value="all">All students</option>
            </select>
          </label>
        </div>

        {assignmentType === 'single' && (
          <div className="form-row">
            <label>
              <span>Student *</span>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} required>
                <option value="">Choose…</option>
                {students.map((student) => (
                  <option key={student.StudentID} value={student.StudentID}>
                    {student.FullName} ({student.Email})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="form-row">
          <label>
            <span>Due date (optional)</span>
            <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        {assignmentType === 'multiple' && (
          <div className="form-row">
            <label>
              <span>Students *</span>
              <div className="search-box" style={{ marginBottom: 12 }}>
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="students-select-list">
                {loadingData ? (
                  <div className="loading-state">Loading…</div>
                ) : filteredStudents.length === 0 ? (
                  <div className="empty-state">No students</div>
                ) : (
                  filteredStudents.map((student) => (
                    <label key={student.StudentID} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.StudentID)}
                        onChange={() => toggleStudentSelection(student.StudentID)}
                      />
                      <span>
                        {student.FullName} ({student.Email})
                      </span>
                    </label>
                  ))
                )}
              </div>
            </label>
          </div>
        )}

        {assignmentType === 'group' && (
          <div className="form-row">
            <label>
              <span>Group *</span>
              <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} required>
                <option value="">Choose…</option>
                {groups.map((group) => (
                  <option key={group.GroupID} value={group.GroupID}>
                    {group.GroupName} ({group.memberCount || 0})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {assignmentType === 'groups' && (
          <div className="form-row">
            <label>
              <span>Groups *</span>
              <div className="groups-select-list">
                {loadingData ? (
                  <div className="loading-state">Loading…</div>
                ) : groups.map((group) => (
                  <label key={group.GroupID} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(group.GroupID)}
                      onChange={() => toggleGroupSelection(group.GroupID)}
                    />
                    <span>
                      {group.GroupName} ({group.memberCount || 0})
                    </span>
                  </label>
                ))}
              </div>
            </label>
          </div>
        )}

        {assignmentType === 'all' && (
          <div className="notice info">
            <AlertCircle size={18} />
            <span>Assigns to all active students in your organization.</span>
          </div>
        )}

        {error && (
          <div
            className="notice error"
            role="alert"
            aria-live="assertive"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {singleStudentAlreadyAssigned && lastPayload?.assignmentType === 'single' && (
          <div className="notice warning" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: '0 0 8px' }}>
              This student already has this test assigned. Replace updates the due date / re-issues the assignment.
            </p>
            <button type="button" className="btn-primary btn-sm" onClick={handleReplaceExisting} disabled={loading}>
              Replace assignment
            </button>
          </div>
        )}

        <div className="tw-wizard-actions tw-wizard-actions--inline">
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || readiness.loading || !readiness.ok}
          >
            {loading ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </form>
    </div>
  );
}
