import { useCallback, useEffect, useRef, useState } from 'react';
import { BookMarked, Loader2, AlertCircle, Search, Users, Layers, Inbox, Database, Filter } from 'lucide-react';
import { studentAPI, orgDashboard } from '../../../services/api';
import ExamEnrollmentModal from './ExamEnrollmentModal';
import './OrgStudentExamEnrollments.css';
import './Students.css';
import './QuestionBank.css';

const STUDENT_PAGE_LIMIT = 100;
const ROSTER_ROWS_PER_PAGE = 20;

function fmtTsParts(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return {
      date: d.toLocaleDateString(undefined, { dateStyle: 'short' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  } catch {
    return null;
  }
}

function renderTsCell(iso) {
  const ts = fmtTsParts(iso);
  if (!ts) return '—';
  return (
    <span className="cell-er-dt">
      <span>{ts.date}</span>
      <span>{ts.time}</span>
    </span>
  );
}

function fmtEnrollmentSource(src) {
  const s = String(src || '');
  if (s === 'StudentRequest') return 'Student request';
  if (s === 'DirectAssign') return 'Direct assign';
  return s || '—';
}

function rosterStatusBadge(status, isImplicit) {
  if (isImplicit || status === 'Implicit') {
    return (
      <span className="status-badge status-implicit">
        <span>Plan access</span>
      </span>
    );
  }
  const s = String(status || '').toLowerCase();
  const cls =
    s === 'approved' || s === 'active'
      ? 'status-approved'
      : s === 'pending'
        ? 'status-pending'
        : s === 'rejected'
          ? 'status-rejected'
          : s === 'withdrawn'
            ? 'status-withdrawn'
            : s === 'suspended'
              ? 'status-suspended'
              : 'status-pending';
  return (
    <span className={`status-badge ${cls}`}>
      <span>{status || '—'}</span>
    </span>
  );
}

export default function OrgStudentExamEnrollments() {
  const [tab, setTab] = useState('bulk');

  const [studentsLoading, setStudentsLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentPagination, setStudentPagination] = useState(null);

  const [examsLoading, setExamsLoading] = useState(true);
  const [subscriptionExams, setSubscriptionExams] = useState([]);

  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedExamIds, setSelectedExamIds] = useState([]);
  const [bulkStudentSearch, setBulkStudentSearch] = useState('');
  const [bulkStudentPage, setBulkStudentPage] = useState(1);
  const [bulkStudentsLoading, setBulkStudentsLoading] = useState(false);
  const [bulkStudents, setBulkStudents] = useState([]);
  const [bulkStudentsPagination, setBulkStudentsPagination] = useState(null);

  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');
  const [bulkOperationMeta, setBulkOperationMeta] = useState({ students: 0, exams: 0, pairs: 0 });

  const [modalStudent, setModalStudent] = useState(null);

  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [rejectEnrollmentId, setRejectEnrollmentId] = useState(null);
  const [rejectPendingNote, setRejectPendingNote] = useState('');
  const [busyPendingEnrollmentId, setBusyPendingEnrollmentId] = useState(null);

  const [dirPage, setDirPage] = useState(1);
  const [dirSearch, setDirSearch] = useState('');
  const [dirStatus, setDirStatus] = useState('');
  const [dirExamId, setDirExamId] = useState('');
  const [dirFromTs, setDirFromTs] = useState('');
  const [dirToTs, setDirToTs] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryRows, setDirectoryRows] = useState([]);
  const [directoryPagination, setDirectoryPagination] = useState(null);
  const [directoryRowPage, setDirectoryRowPage] = useState(1);
  const rosterScrollTopRef = useRef(null);
  const rosterScrollTopInnerRef = useRef(null);
  const rosterScrollBottomRef = useRef(null);
  const rosterSyncLockRef = useRef(false);

  const loadPendingRequests = useCallback(async () => {
    try {
      setPendingLoading(true);
      const res = await studentAPI.getPendingExamEnrollmentRequests();
      setPendingRequests(res.requests || []);
    } catch (e) {
      console.error(e);
      setPendingRequests([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadExams = useCallback(async () => {
    try {
      setExamsLoading(true);
      const res = await orgDashboard.getSubscriptionExams();
      setSubscriptionExams(res.exams || []);
    } catch (e) {
      console.error(e);
      setSubscriptionExams([]);
    } finally {
      setExamsLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      setStudentsLoading(true);
      const res = await studentAPI.getStudents({
        page: studentPage,
        limit: STUDENT_PAGE_LIMIT,
        search: studentSearch.trim() || undefined,
      });
      setStudents(res.students || []);
      setStudentPagination(res.pagination || null);
    } catch (e) {
      console.error(e);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, [studentPage, studentSearch]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (tab === 'requests') loadPendingRequests();
  }, [tab, loadPendingRequests]);

  const loadBulkCandidateStudents = useCallback(async () => {
    if (selectedExamIds.length === 0) {
      setBulkStudents([]);
      setBulkStudentsPagination(null);
      return;
    }
    try {
      setBulkStudentsLoading(true);
      const res = await studentAPI.getBulkCandidateStudentsForEnrollments({
        page: bulkStudentPage,
        limit: STUDENT_PAGE_LIMIT,
        search: bulkStudentSearch.trim() || undefined,
        examIds: selectedExamIds,
      });
      const normalized = (res.students || []).map((s) => ({
        StudentID: s.studentId,
        FullName: s.fullName,
        Email: s.email,
        RelevantExamCount: s.relevantExamCount,
      }));
      setBulkStudents(normalized);
      setBulkStudentsPagination(res.pagination || null);
      setSelectedStudentIds((prev) =>
        prev.filter((id) => normalized.some((s) => String(s.StudentID) === String(id)))
      );
    } catch (e) {
      console.error(e);
      setBulkStudents([]);
      setBulkStudentsPagination(null);
    } finally {
      setBulkStudentsLoading(false);
    }
  }, [bulkStudentPage, bulkStudentSearch, selectedExamIds]);

  useEffect(() => {
    setBulkStudentPage(1);
    setSelectedStudentIds([]);
  }, [selectedExamIds, bulkStudentSearch]);

  useEffect(() => {
    if (tab !== 'bulk') return;
    const id = setTimeout(() => {
      loadBulkCandidateStudents();
    }, 220);
    return () => clearTimeout(id);
  }, [tab, loadBulkCandidateStudents]);

  const fetchDirectory = useCallback(async () => {
    try {
      setDirectoryLoading(true);
      const res = await studentAPI.getExamEnrollmentDirectory({
        page: dirPage,
        limit: 25,
        search: dirSearch.trim() || undefined,
        status: dirStatus || undefined,
        examId: dirExamId || undefined,
        fromTs: dirFromTs || undefined,
        toTs: dirToTs || undefined,
      });
      setDirectoryRows(res.rows || []);
      setDirectoryPagination(res.pagination || null);
    } catch (e) {
      console.error(e);
      setDirectoryRows([]);
      setDirectoryPagination(null);
    } finally {
      setDirectoryLoading(false);
    }
  }, [dirPage, dirSearch, dirStatus, dirExamId, dirFromTs, dirToTs]);

  useEffect(() => {
    setDirPage(1);
  }, [dirSearch, dirStatus, dirExamId, dirFromTs, dirToTs]);

  useEffect(() => {
    setDirectoryRowPage(1);
  }, [directoryRows]);

  useEffect(() => {
    const top = rosterScrollTopRef.current;
    const topInner = rosterScrollTopInnerRef.current;
    const bottom = rosterScrollBottomRef.current;
    if (!top || !topInner || !bottom) return;
    topInner.style.width = `${bottom.scrollWidth}px`;
  }, [directoryRows, directoryLoading, tab]);

  const handleRosterTopScroll = useCallback((e) => {
    if (rosterSyncLockRef.current) return;
    const bottom = rosterScrollBottomRef.current;
    if (!bottom) return;
    rosterSyncLockRef.current = true;
    bottom.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      rosterSyncLockRef.current = false;
    });
  }, []);

  const handleRosterBottomScroll = useCallback((e) => {
    if (rosterSyncLockRef.current) return;
    const top = rosterScrollTopRef.current;
    if (!top) return;
    rosterSyncLockRef.current = true;
    top.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      rosterSyncLockRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (tab !== 'directory') return;
    const id = setTimeout(() => {
      fetchDirectory();
    }, 280);
    return () => clearTimeout(id);
  }, [tab, fetchDirectory]);

  const directoryRowTotalPages =
    directoryRows.length === 0 ? 0 : Math.ceil(directoryRows.length / ROSTER_ROWS_PER_PAGE);
  const directoryVisibleRows = directoryRows.slice(
    (directoryRowPage - 1) * ROSTER_ROWS_PER_PAGE,
    directoryRowPage * ROSTER_ROWS_PER_PAGE
  );

  const approvePendingRow = async (r) => {
    try {
      setBusyPendingEnrollmentId(r.enrollmentId);
      await studentAPI.activateStudentExamEnrollment(r.studentId, r.examId);
      await loadPendingRequests();
    } catch (e) {
      alert(e.message || 'Could not approve');
    } finally {
      setBusyPendingEnrollmentId(null);
    }
  };

  const confirmRejectPending = async (r) => {
    try {
      setBusyPendingEnrollmentId(r.enrollmentId);
      await studentAPI.rejectStudentExamEnrollment(r.studentId, r.examId, {
        reviewNote: rejectPendingNote.trim() || undefined,
      });
      setRejectEnrollmentId(null);
      setRejectPendingNote('');
      await loadPendingRequests();
    } catch (e) {
      alert(e.message || 'Could not reject');
    } finally {
      setBusyPendingEnrollmentId(null);
    }
  };

  const toggleStudent = (id) => {
    const sid = String(id);
    setSelectedStudentIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const toggleExam = (id) => {
    const eid = String(id);
    setSelectedExamIds((prev) => (prev.includes(eid) ? prev.filter((x) => x !== eid) : [...prev, eid]));
  };

  const visibleIds = bulkStudents.map((s) => String(s.StudentID));

  const selectAllVisible = () => {
    setSelectedStudentIds((prev) => {
      const set = new Set(prev);
      visibleIds.forEach((id) => set.add(id));
      return [...set];
    });
  };

  const clearVisibleSelection = () => {
    setSelectedStudentIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
  };

  const selectAllExams = () => {
    setSelectedExamIds(subscriptionExams.map((e) => String(e.ExamID)));
  };

  const clearExamSelection = () => setSelectedExamIds([]);

  const pairCount = selectedStudentIds.length * selectedExamIds.length;

  const runBulkAssign = async () => {
    setBulkError('');
    setBulkResult(null);
    if (selectedStudentIds.length === 0 || selectedExamIds.length === 0) {
      setBulkError('Select at least one student and one exam.');
      return;
    }
    if (
      !window.confirm(
        `Approve enrollment for ${selectedStudentIds.length} student(s) × ${selectedExamIds.length} exam(s) (${pairCount} updates)? Skipped pairs will be listed in the summary.`
      )
    ) {
      return;
    }
    try {
      setBulkSubmitting(true);
      setBulkOperationMeta({
        students: selectedStudentIds.length,
        exams: selectedExamIds.length,
        pairs: pairCount,
      });
      const res = await studentAPI.bulkAssignExamEnrollments({
        studentIds: selectedStudentIds,
        examIds: selectedExamIds,
      });
      setBulkResult(res);
    } catch (e) {
      setBulkError(e.message || 'Bulk assign failed');
    } finally {
      setBulkSubmitting(false);
    }
  };

  return (
    <div className="org-ex-enroll-page">
      <div className="page-header org-ex-enroll-header">
        <div>
          <h1>
            <BookMarked size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Exam enrollments
          </h1>
          <p className="page-subtitle">
            Students cannot regain exam access after withdrawal or rejection until an OrgAdmin approves. Use Pending requests for the queue,
            bulk assign for many pairs, Enrollment roster for a searchable audit of every enrollment row, or By student for per-person actions.
          </p>
        </div>
      </div>

      <div className="org-ex-enroll-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bulk'}
          className={`org-ex-enroll-tab ${tab === 'bulk' ? 'active' : ''}`}
          onClick={() => setTab('bulk')}
        >
          <Layers size={18} />
          Bulk assign
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'requests'}
          className={`org-ex-enroll-tab ${tab === 'requests' ? 'active' : ''}`}
          onClick={() => setTab('requests')}
        >
          <Inbox size={18} />
          Pending requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'directory'}
          className={`org-ex-enroll-tab ${tab === 'directory' ? 'active' : ''}`}
          onClick={() => setTab('directory')}
        >
          <Database size={18} />
          Enrollment roster
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'students'}
          className={`org-ex-enroll-tab ${tab === 'students' ? 'active' : ''}`}
          onClick={() => setTab('students')}
        >
          <Users size={18} />
          By student
        </button>
      </div>

      {tab === 'directory' && (
        <div className="org-ex-enroll-roster-qb org-question-bank-page">
          <div className="qb-filters-card">
            <div className="qb-filters-head">
              <Filter size={18} />
              Enrollment roster filters
            </div>
            <div className="qb-filters-grid">
              <div className="qb-filter-field">
                <label className="qb-filter-label">Student search</label>
                <div className="qb-search-wrap">
                  <Search size={18} className="qb-search-icon" />
                  <input
                    type="search"
                    className="qb-search-input"
                    placeholder="Name or email…"
                    value={dirSearch}
                    onChange={(e) => setDirSearch(e.target.value)}
                    aria-label="Filter roster by student"
                  />
                </div>
              </div>
              <div className="qb-filter-field">
                <label className="qb-filter-label">Status</label>
                <select
                  className="qb-select"
                  value={dirStatus}
                  onChange={(e) => setDirStatus(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="Implicit">Plan access (subscription)</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Withdrawn">Withdrawn</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
              <div className="qb-filter-field">
                <label className="qb-filter-label">Exam</label>
                <select
                  className="qb-select"
                  value={dirExamId}
                  onChange={(e) => setDirExamId(e.target.value)}
                  aria-label="Filter by exam"
                  disabled={examsLoading}
                >
                  <option value="">All exams</option>
                  {subscriptionExams.map((ex) => (
                    <option key={ex.ExamID} value={ex.ExamID}>
                      {ex.ExamName || ex.ExamID}
                    </option>
                  ))}
                </select>
              </div>
              <div className="qb-filter-field">
                <label className="qb-filter-label">From</label>
                <input
                  type="datetime-local"
                  className="qb-select"
                  value={dirFromTs}
                  onChange={(e) => setDirFromTs(e.target.value)}
                  aria-label="Filter from date and time"
                />
              </div>
              <div className="qb-filter-field">
                <label className="qb-filter-label">To</label>
                <input
                  type="datetime-local"
                  className="qb-select"
                  value={dirToTs}
                  onChange={(e) => setDirToTs(e.target.value)}
                  aria-label="Filter to date and time"
                />
              </div>
            </div>
          </div>

          {directoryLoading ? (
            <div className="qb-loading">
              <Loader2 size={40} className="qb-loading-icon spin-icon" />
              <p>Loading roster…</p>
            </div>
          ) : (
            <>
              <div className="qb-stats">
                <div className="qb-stat">
                  <span className="qb-stat-label">Rows (this page)</span>
                  <span className="qb-stat-value">{directoryVisibleRows.length}</span>
                </div>
                <div className="qb-stat">
                  <span className="qb-stat-label">Students (org)</span>
                  <span className="qb-stat-value">{directoryPagination?.totalStudents ?? '—'}</span>
                </div>
                <div className="qb-stat">
                  <span className="qb-stat-label">Student page</span>
                  <span className="qb-stat-value">
                    {directoryPagination?.page ?? 1} / {directoryPagination?.totalStudentPages || 1}
                  </span>
                </div>
              </div>

              <div className="qb-table-card">
                <div
                  ref={rosterScrollTopRef}
                  className="qb-table-scroll-top"
                  onScroll={handleRosterTopScroll}
                  aria-label="Horizontal roster scroll"
                >
                  <div ref={rosterScrollTopInnerRef} className="qb-table-scroll-top-inner" />
                </div>
                <div
                  ref={rosterScrollBottomRef}
                  className="qb-table-scroll"
                  onScroll={handleRosterBottomScroll}
                >
                  <table className="qb-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Exam</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Requested by type</th>
                        <th>Reviewed by</th>
                        <th>Reviewed at</th>
                        <th>Review note</th>
                        <th>Approved at</th>
                        <th>Withdrawn at</th>
                        <th>Withdrawal initiated by</th>
                        <th>Withdrawal reason</th>
                        <th>Created at</th>
                        <th>Updated at</th>
                        <th className="th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={16} className="empty-cell">
                            No roster rows for this student page and filters.
                          </td>
                        </tr>
                      ) : (
                        directoryVisibleRows.map((r) => (
                          <tr key={r.enrollmentId || `imp-${r.studentId}-${r.examId}`}>
                            <td className="cell-er-student">
                              <strong>{r.studentName || '—'}</strong>
                            </td>
                            <td className="cell-er-wrap">{r.studentEmail || '—'}</td>
                            <td className="cell-er-wrap">{r.examName || '—'}</td>
                            <td>{rosterStatusBadge(r.status, r.isImplicit)}</td>
                            <td>{fmtEnrollmentSource(r.source)}</td>
                            <td>{r.requestedByType || '—'}</td>
                            <td className="cell-er-wrap">{r.reviewedByName || r.reviewedBy || '—'}</td>
                            <td className="cell-date">{renderTsCell(r.reviewedAt)}</td>
                            <td className="cell-er-wrap">{r.reviewNote || '—'}</td>
                            <td className="cell-date">{renderTsCell(r.approvedAt)}</td>
                            <td className="cell-date">{renderTsCell(r.withdrawnAt)}</td>
                            <td>{r.withdrawalInitiatedBy || '—'}</td>
                            <td className="cell-er-wrap">{r.withdrawalReason || '—'}</td>
                            <td className="cell-date">{renderTsCell(r.createdAt)}</td>
                            <td className="cell-date">{renderTsCell(r.updatedAt)}</td>
                            <td className="cell-actions">
                              <button
                                type="button"
                                className="expand-btn"
                                title="Open student exam actions"
                                aria-label="Manage student exams"
                                onClick={() =>
                                  setModalStudent({
                                    StudentID: r.studentId,
                                    FullName: r.studentName || 'Student',
                                    Email: r.studentEmail,
                                  })
                                }
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {directoryRowTotalPages > 1 ? (
                <div className="qb-pagination">
                  <button
                    type="button"
                    className="qb-pagination-btn"
                    disabled={directoryRowPage <= 1}
                    onClick={() => setDirectoryRowPage((p) => Math.max(1, p - 1))}
                  >
                    Previous rows
                  </button>
                  <span className="qb-pagination-info">
                    Rows page {directoryRowPage} of {directoryRowTotalPages} · {ROSTER_ROWS_PER_PAGE} entries per page
                  </span>
                  <button
                    type="button"
                    className="qb-pagination-btn"
                    disabled={directoryRowPage >= directoryRowTotalPages}
                    onClick={() => setDirectoryRowPage((p) => p + 1)}
                  >
                    Next rows
                  </button>
                </div>
              ) : null}

              {directoryPagination && directoryPagination.totalStudentPages > 1 ? (
                <div className="qb-pagination">
                  <button
                    type="button"
                    className="qb-pagination-btn"
                    disabled={dirPage <= 1}
                    onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="qb-pagination-info">
                    Student batch {directoryPagination.page} of {directoryPagination.totalStudentPages} ·{' '}
                    {directoryPagination.limit} students per batch · {directoryPagination.rowCount} row(s) shown
                  </span>
                  <button
                    type="button"
                    className="qb-pagination-btn"
                    disabled={dirPage >= directoryPagination.totalStudentPages}
                    onClick={() => setDirPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="org-ex-enroll-requests">
          <p className="org-ex-enroll-panel-hint">
            Student-submitted enrollments (and any row in Pending). Approve grants immediate access; reject optionally stores a note for the
            student.
          </p>
          {pendingLoading ? (
            <div className="org-ex-enroll-loading">
              <Loader2 className="spin-icon" size={22} />
              Loading pending requests…
            </div>
          ) : pendingRequests.length === 0 ? (
            <p className="org-ex-enroll-empty">No pending enrollment requests.</p>
          ) : (
            <div className="students-table-container org-ex-enroll-requests-table">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exam</th>
                    <th>Requested</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((r) => {
                    const busy = busyPendingEnrollmentId === r.enrollmentId;
                    const showReject = rejectEnrollmentId === r.enrollmentId;
                    const srcLabel =
                      String(r.source || '') === 'StudentRequest' ? 'Student request' : String(r.source || '—');
                    return (
                      <tr key={r.enrollmentId}>
                        <td>
                          <strong>{r.studentName || 'Student'}</strong>
                          <div className="org-ex-enroll-meta">{r.studentEmail || ''}</div>
                        </td>
                        <td>{r.examName || 'Exam'}</td>
                        <td>
                          {r.requestedAt
                            ? new Date(r.requestedAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        <td>
                          <span className="org-ex-enroll-src">{srcLabel}</span>
                          {r.requestedByType ? (
                            <div className="org-ex-enroll-meta">As {r.requestedByType}</div>
                          ) : null}
                        </td>
                        <td>
                          <div className="org-ex-enroll-request-actions">
                            <button
                              type="button"
                              className="btn-primary btn-small"
                              disabled={busy}
                              onClick={() => approvePendingRow(r)}
                            >
                              {busy ? '…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              disabled={busy}
                              onClick={() => {
                                if (showReject) {
                                  setRejectEnrollmentId(null);
                                  setRejectPendingNote('');
                                } else {
                                  setRejectEnrollmentId(r.enrollmentId);
                                  setRejectPendingNote('');
                                }
                              }}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              onClick={() =>
                                setModalStudent({
                                  StudentID: r.studentId,
                                  FullName: r.studentName || 'Student',
                                  Email: r.studentEmail,
                                })
                              }
                            >
                              All exams
                            </button>
                          </div>
                          {showReject ? (
                            <div className="org-ex-enroll-inline-reject">
                              <textarea
                                rows={2}
                                value={rejectPendingNote}
                                onChange={(e) => setRejectPendingNote(e.target.value)}
                                placeholder="Optional note for the student…"
                              />
                              <div className="org-ex-enroll-inline-reject-btns">
                                <button type="button" className="btn-secondary btn-small" onClick={() => setRejectEnrollmentId(null)}>
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn-danger btn-small"
                                  disabled={busy}
                                  onClick={() => confirmRejectPending(r)}
                                >
                                  Confirm reject
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'bulk' && (
        <div className="org-ex-enroll-panels">
          <section className="org-ex-enroll-panel">
            <h2>Exams</h2>
            <p className="org-ex-enroll-panel-hint">
              Select exam(s) first. Student list will only show candidates who still need enrollment for selected exams.
            </p>
            <div className="org-ex-enroll-toolbar">
              <button type="button" className="btn-secondary btn-small" onClick={selectAllExams} disabled={examsLoading || subscriptionExams.length === 0}>
                Select all
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={clearExamSelection}>
                Clear exams
              </button>
              <span className="org-ex-enroll-count">{selectedExamIds.length} exams selected</span>
            </div>
            {examsLoading ? (
              <div className="org-ex-enroll-loading">
                <Loader2 className="spin-icon" size={22} />
                Loading exams…
              </div>
            ) : subscriptionExams.length === 0 ? (
              <div className="notice warn org-ex-enroll-notice">
                <AlertCircle size={18} />
                <span>No exams found on active subscriptions. Subscribe to a plan that includes exams first.</span>
              </div>
            ) : (
              <ul className="org-ex-enroll-checklist">
                {subscriptionExams.map((ex) => (
                  <li key={ex.ExamID}>
                    <label className="org-ex-enroll-check-label">
                      <input type="checkbox" checked={selectedExamIds.includes(String(ex.ExamID))} onChange={() => toggleExam(ex.ExamID)} />
                      <span>
                        <strong>{ex.ExamName || 'Exam'}</strong>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="org-ex-enroll-panel">
            <h2>Students</h2>
            <p className="org-ex-enroll-panel-hint">
              Search and tick students. Already-enrolled candidates are hidden for selected exams to avoid duplication.
            </p>
            <div className="org-ex-enroll-search">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search by name, email, identity…"
                value={bulkStudentSearch}
                onChange={(e) => {
                  setBulkStudentSearch(e.target.value);
                  setBulkStudentPage(1);
                }}
                disabled={selectedExamIds.length === 0}
              />
            </div>
            <div className="org-ex-enroll-toolbar">
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={selectAllVisible}
                disabled={bulkStudentsLoading || selectedExamIds.length === 0}
              >
                Select visible ({visibleIds.length})
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={clearVisibleSelection}
                disabled={selectedExamIds.length === 0}
              >
                Clear visible from selection
              </button>
              <span className="org-ex-enroll-count">{selectedStudentIds.length} selected total</span>
            </div>
            {selectedExamIds.length === 0 ? (
              <div className="notice warn org-ex-enroll-notice">
                <AlertCircle size={18} />
                <span>Select exam(s) first to load eligible students.</span>
              </div>
            ) : bulkStudentsLoading ? (
              <div className="org-ex-enroll-loading">
                <Loader2 className="spin-icon" size={22} />
                Loading students…
              </div>
            ) : bulkStudents.length === 0 ? (
              <p className="org-ex-enroll-empty">
                No students need enrollment for the selected exam(s) in this batch.
              </p>
            ) : (
              <ul className="org-ex-enroll-checklist">
                {bulkStudents.map((s) => (
                  <li key={s.StudentID}>
                    <label className="org-ex-enroll-check-label">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(String(s.StudentID))}
                        onChange={() => toggleStudent(s.StudentID)}
                      />
                      <span>
                        <strong>{s.FullName || 'Student'}</strong>
                        <span className="org-ex-enroll-meta">
                          {s.Email || ''}
                          {s.RelevantExamCount ? ` · ${s.RelevantExamCount} selected exam(s) in plan` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {bulkStudentsPagination && bulkStudentsPagination.totalStudentPages > 1 ? (
              <div className="org-ex-enroll-pagination">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={bulkStudentPage <= 1}
                  onClick={() => setBulkStudentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {bulkStudentsPagination.page} of {bulkStudentsPagination.totalStudentPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={bulkStudentPage >= bulkStudentsPagination.totalStudentPages}
                  onClick={() => setBulkStudentPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {tab === 'bulk' && (
        <div className="org-ex-enroll-actions">
          <div className="org-ex-enroll-summary">
            <strong>{pairCount}</strong> enrollment updates if all pairs qualify (students × exams).
          </div>
          <button type="button" className="btn-primary" disabled={bulkSubmitting || pairCount === 0} onClick={runBulkAssign}>
            {bulkSubmitting ? 'Applying…' : 'Apply enrollments'}
          </button>
        </div>
      )}

      {tab === 'bulk' && bulkError ? (
        <div className="notice error org-ex-enroll-result">
          <AlertCircle size={18} />
          <span>{bulkError}</span>
        </div>
      ) : null}

      {tab === 'bulk' && bulkResult ? (
        <div className="org-ex-enroll-result-card">
          <h3>Result</h3>
          <p>{bulkResult.message}</p>
          <ul className="org-ex-enroll-result-stats">
            <li>
              Applied: <strong>{bulkResult.applied}</strong>
            </li>
            <li>
              Skipped / failed: <strong>{bulkResult.skippedOrFailed}</strong>
            </li>
          </ul>
          {bulkResult.errors?.length > 0 ? (
            <details className="org-ex-enroll-details">
              <summary>Show details ({bulkResult.errors.length})</summary>
              <ul className="org-ex-enroll-error-list">
                {bulkResult.errors.map((err, i) => (
                  <li key={`${err.studentId}-${err.examId}-${i}`}>
                    <code>{err.studentId}</code> · <code>{err.examId || '—'}</code> — {err.code}: {err.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {bulkSubmitting ? (
        <div className="org-ex-enroll-bulk-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="org-ex-enroll-bulk-loader-card">
            <Loader2 size={30} className="spin-icon" />
            <h3>Enrolling students in exams…</h3>
            <p>
              Processing {bulkOperationMeta.students} student(s) × {bulkOperationMeta.exams} exam(s) ={' '}
              {bulkOperationMeta.pairs} pair(s).
            </p>
            <div className="org-ex-enroll-bulk-progress-track" aria-hidden="true">
              <div className="org-ex-enroll-bulk-progress-indeterminate" />
            </div>
            <small>Please wait until the operation completes.</small>
          </div>
        </div>
      ) : null}

      {tab === 'students' && (
        <>
          <div className="org-ex-enroll-search org-ex-enroll-search--wide">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search students…"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setStudentPage(1);
              }}
            />
          </div>
          {studentsLoading ? (
            <div className="org-ex-enroll-loading">
              <Loader2 className="spin-icon" size={22} />
              Loading…
            </div>
          ) : students.length === 0 ? (
            <p className="org-ex-enroll-empty">No students found.</p>
          ) : (
            <div className="students-table-container">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.StudentID}>
                      <td>
                        <div className="student-name-cell">
                          <div className="student-avatar">{s.FullName?.charAt(0) || 'S'}</div>
                          {s.FullName || 'N/A'}
                        </div>
                      </td>
                      <td>{s.Email || 'N/A'}</td>
                      <td>
                        <button type="button" className="btn-secondary btn-small" onClick={() => setModalStudent(s)}>
                          Manage exams
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {studentPagination && studentPagination.totalPages > 1 ? (
            <div className="pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={studentPage <= 1}
                onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {studentPagination.page} of {studentPagination.totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={studentPage >= studentPagination.totalPages}
                onClick={() => setStudentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}

      {modalStudent ? (
        <ExamEnrollmentModal
          student={modalStudent}
          onClose={() => {
            setModalStudent(null);
            if (tab === 'requests') loadPendingRequests();
            if (tab === 'directory') fetchDirectory();
          }}
        />
      ) : null}
    </div>
  );
}
