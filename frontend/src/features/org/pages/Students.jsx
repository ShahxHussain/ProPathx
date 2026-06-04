import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  UserPlus,
  Upload,
  Download,
  X,
  CheckCircle,
  AlertCircle,
  FileText,
  Edit,
  Trash2,
  Loader2,
  BookOpen,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import { studentAPI, orgDashboard } from '../../../services/api';
import './Students.css';

const RegisterStudentModal = ({ onClose, onSuccess, student = null }) => {
  const isEditMode = !!student;
  const [formData, setFormData] = useState({
    fullName: student?.FullName || '',
    email: student?.Email || '',
    password: '',
    identityNo: student?.IdentityNo || '',
    fatherName: student?.FatherName || '',
    gender: student?.Gender || '',
    dateOfBirth: student?.DateOfBirth || '',
    address: student?.Address || '',
    phone: student?.Phone || '',
    status: student?.Status || 'Active',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEditMode) {
        // Remove password from update if empty
        const updateData = { ...formData };
        if (!updateData.password) {
          delete updateData.password;
        }
        await studentAPI.updateStudent(student.StudentID, updateData);
      } else {
        await studentAPI.registerStudent(formData);
      }
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setError(err.message || err.details || `Failed to ${isEditMode ? 'update' : 'register'} student`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? 'Edit Student' : 'Register Student'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Full Name *</span>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Email *</span>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </label>

            <label>
              <span>Password {isEditMode ? '(leave empty to keep current)' : '*'}</span>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!isEditMode}
                placeholder={isEditMode ? 'Enter new password to change' : 'Auto-generated if empty'}
              />
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Identity No (NIC/Passport/OrgReg)</span>
              <input
                type="text"
                value={formData.identityNo}
                onChange={(e) => setFormData({ ...formData, identityNo: e.target.value })}
              />
            </label>

            <label>
              <span>Father Name</span>
              <input
                type="text"
                value={formData.fatherName}
                onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
              />
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Gender</span>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label>
              <span>Date of Birth</span>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Address</span>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows="2"
              />
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Phone</span>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </label>

            <label>
              <span>Status *</span>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="notice error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (isEditMode ? 'Updating...' : 'Registering...') : (isEditMode ? 'Update Student' : 'Register Student')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const BULK_ISSUE_LABELS = {
  DUPLICATE_EMAIL: 'Duplicate email',
  MISSING_REQUIRED: 'Missing required fields',
  INSERT_FAILED: 'Could not create',
  UNEXPECTED: 'Unexpected error',
  EXAM_NOT_IN_PLAN: 'Exam not in plan',
  PLAN_LOOKUP_FAILED: 'Subscription check failed',
  ENROLLMENT_FAILED: 'Enrollment failed',
  ERROR: 'Error',
};

function bulkIssueLabel(code) {
  return BULK_ISSUE_LABELS[code] || code || 'Issue';
}

function normalizeBulkRegisterResponse(raw, totalRows = 0) {
  if (!raw || typeof raw !== 'object') {
    return { summary: { created: 0, errors: [], createdStudents: [] }, enrollment: null, totalRows };
  }
  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : raw;
  const errors = Array.isArray(summary.errors)
    ? summary.errors
    : Array.isArray(raw.errors)
      ? raw.errors
      : [];
  const created = Number(summary.created ?? summary.successful ?? 0);
  const rowsReceived = Number(summary.rowsReceived ?? raw.rowsReceived ?? totalRows ?? 0);
  return {
    message: raw.message,
    summary: {
      ...summary,
      created,
      errors,
      rowsReceived,
      skipped: summary.skipped ?? errors.length,
      failed: summary.failed ?? errors.length,
      createdStudents: Array.isArray(summary.createdStudents) ? summary.createdStudents : [],
    },
    enrollment: raw.enrollment ?? null,
    totalRows: rowsReceived || totalRows,
  };
}

const BulkRegisterResultReport = ({ result, subscriptionExams }) => {
  const summary = result?.summary || {};
  const regErrors = summary.errors || [];
  const createdList = summary.createdStudents || [];
  const enrollment = result?.enrollment;
  const enrollErrors = enrollment?.errors || [];
  const created = summary.created ?? summary.successful ?? 0;
  const rowsReceived = result?.totalRows ?? summary.rowsReceived ?? created + regErrors.length;
  const duplicates = regErrors.filter((e) => e.code === 'DUPLICATE_EMAIL');
  const otherRegIssues = regErrors.filter((e) => e.code !== 'DUPLICATE_EMAIL');

  const examNameById = new Map(
    (subscriptionExams || []).map((e) => [String(e.ExamID), e.ExamName || 'Exam'])
  );

  const resolveExamName = (examId) =>
    examNameById.get(String(examId)) || enrollment?.results?.find((r) => r.examId === examId)?.examName || 'Exam';

  const hasRegIssues = regErrors.length > 0;
  const hasEnrollIssues = enrollErrors.length > 0;
  const allOk = created > 0 && !hasRegIssues && !hasEnrollIssues;
  const allDuplicates =
    created === 0 && duplicates.length > 0 && duplicates.length === regErrors.length;
  const missingRowDetails =
    rowsReceived > 0 && created === 0 && regErrors.length === 0;

  return (
    <div className="bulk-report">
      <div className={`notice ${allOk ? 'success' : created > 0 ? 'warning' : 'error'}`}>
        {allOk ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
        <div>
          <strong>
            {allOk
              ? 'All rows processed successfully'
              : allDuplicates
                ? `All ${duplicates.length} row${duplicates.length === 1 ? '' : 's'} already registered`
                : created > 0
                  ? 'Completed with some issues'
                  : 'No students were created'}
          </strong>
          <p className="bulk-report-summary">
            {rowsReceived > 0 && (
              <span className="bulk-report-stat">{rowsReceived} row{rowsReceived === 1 ? '' : 's'} in file</span>
            )}
            <span className="bulk-report-stat bulk-report-stat--ok">{created} created</span>
            {regErrors.length > 0 && (
              <span className="bulk-report-stat bulk-report-stat--warn">
                {regErrors.length} registration issue{regErrors.length === 1 ? '' : 's'}
              </span>
            )}
            {duplicates.length > 0 && (
              <span className="bulk-report-stat bulk-report-stat--dup">
                {duplicates.length} duplicate email{duplicates.length === 1 ? '' : 's'}
              </span>
            )}
            {enrollment && (
              <span className="bulk-report-stat">
                {enrollment.applied} enrollment{enrollment.applied === 1 ? '' : 's'} applied
              </span>
            )}
            {hasEnrollIssues && (
              <span className="bulk-report-stat bulk-report-stat--warn">
                {enrollErrors.length} enrollment issue{enrollErrors.length === 1 ? '' : 's'}
              </span>
            )}
          </p>
          {missingRowDetails && (
            <p className="bulk-report-missing-details">
              The server processed your file but did not return row-level details. Restart the backend
              (<code>npm start</code> in <code>backend</code>) and try again.
            </p>
          )}
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="bulk-report-section">
          <h3>Duplicate emails (not created, not enrolled)</h3>
          <p className="bulk-report-section-hint">
            These rows match students who already exist. Fix the CSV or remove duplicate rows, then upload again if needed.
          </p>
          <div className="bulk-report-table-wrap">
            <table className="bulk-report-table">
              <thead>
                <tr>
                  <th>CSV row</th>
                  <th>Name in file</th>
                  <th>Email</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((row, i) => (
                  <tr key={`dup-${row.csvRow}-${i}`}>
                    <td>{row.csvRow}</td>
                    <td>{row.fullName || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>
                      <span className="bulk-issue-badge bulk-issue-badge--dup">
                        {bulkIssueLabel(row.code)}
                      </span>
                      <p className="bulk-issue-help">{row.help}</p>
                      {row.existingInYourOrg && row.existingName && (
                        <p className="bulk-issue-meta">
                          Existing student: <strong>{row.existingName}</strong>
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {otherRegIssues.length > 0 && (
        <div className="bulk-report-section">
          <h3>Other registration issues</h3>
          <div className="bulk-report-table-wrap">
            <table className="bulk-report-table">
              <thead>
                <tr>
                  <th>CSV row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Issue</th>
                  <th>What to do</th>
                </tr>
              </thead>
              <tbody>
                {otherRegIssues.map((row, i) => (
                  <tr key={`reg-${row.csvRow}-${i}`}>
                    <td>{row.csvRow}</td>
                    <td>{row.fullName || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>
                      <span className="bulk-issue-badge">{bulkIssueLabel(row.code)}</span>
                      <div className="bulk-issue-reason">{row.reason}</div>
                    </td>
                    <td className="bulk-issue-help-cell">{row.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasEnrollIssues && (
        <div className="bulk-report-section">
          <h3>Enrollment issues (student was created)</h3>
          <p className="bulk-report-section-hint">
            These students were registered but could not be enrolled in every selected exam. Use Exam enrollments to fix manually.
          </p>
          <div className="bulk-report-table-wrap">
            <table className="bulk-report-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Exam</th>
                  <th>Issue</th>
                  <th>What to do</th>
                </tr>
              </thead>
              <tbody>
                {enrollErrors.map((row, i) => (
                  <tr key={`enr-${row.studentId}-${row.examId}-${i}`}>
                    <td>{row.fullName || '—'}</td>
                    <td>{row.email || '—'}</td>
                    <td>{row.examName || resolveExamName(row.examId)}</td>
                    <td>
                      <span className="bulk-issue-badge">{bulkIssueLabel(row.code)}</span>
                      <div className="bulk-issue-reason">{row.message || row.reason}</div>
                    </td>
                    <td className="bulk-issue-help-cell">{row.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createdList.length > 0 && (
        <details className="bulk-report-created">
          <summary>
            Successfully created ({createdList.length})
            {enrollment?.applied > 0 && ` · ${enrollment.applied} enrollments applied`}
          </summary>
          <div className="bulk-report-table-wrap">
            <table className="bulk-report-table bulk-report-table--compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {createdList.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.fullName || '—'}</td>
                    <td>{row.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};

const BulkRegisterResultModal = ({ result, subscriptionExams, onBack, onDone }) => {
  const summary = result?.summary || {};
  const created = summary.created ?? summary.successful ?? 0;
  const regErrors = summary.errors || [];
  const issueCount =
    regErrors.length + (result?.enrollment?.skippedOrFailed ?? 0);
  const allOk = created > 0 && issueCount === 0;

  return createPortal(
    <div className="modal-overlay bulk-results-overlay" onClick={onDone}>
      <div
        className="modal-content modal-large bulk-results-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="bulk-results-title"
        aria-modal="true"
      >
        <div className="modal-header bulk-results-header">
          <button type="button" className="btn-icon-text bulk-results-back" onClick={onBack}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>
          <h2 id="bulk-results-title">Upload results</h2>
          <button type="button" className="btn-icon" onClick={onDone} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body bulk-results-body">
          <BulkRegisterResultReport result={result} subscriptionExams={subscriptionExams} />
        </div>

        <div className="modal-actions bulk-results-footer">
          <button type="button" className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to upload
          </button>
          <button type="button" className="btn-primary" onClick={onDone}>
            {allOk ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const BulkRegisterModal = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [enrollAfterRegister, setEnrollAfterRegister] = useState(false);
  const [subscriptionExams, setSubscriptionExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [selectedExamIds, setSelectedExamIds] = useState([]);
  const submitInFlightRef = useRef(false);
  const submitGenerationRef = useRef(0);

  const handleUploadOverlayClick = () => {
    if (!result) onClose();
  };

  const handleResultBack = () => {
    setResult(null);
    setError('');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setExamsLoading(true);
        const res = await orgDashboard.getSubscriptionExams();
        if (!cancelled) setSubscriptionExams(res.exams || []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setSubscriptionExams([]);
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExam = (examId) => {
    const id = String(examId);
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllExams = () => {
    setSelectedExamIds(subscriptionExams.map((e) => String(e.ExamID)));
  };

  const clearExams = () => setSelectedExamIds([]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    submitGenerationRef.current += 1;
    setFile(selectedFile);
    setError('');
    setResult(null);

    try {
      let text = await selectedFile.text();
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }
      setCsvText(text);
    } catch (readErr) {
      console.error('Failed to read CSV:', readErr);
      setCsvText('');
      setError('Could not read the CSV file. Try another file.');
    }
  };

  // Helper function to parse CSV values (handles quoted values)
  const parseCSVValue = (value) => {
    if (!value) return '';
    // Remove surrounding quotes if present
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.trim();
  };

  // Helper function to split CSV line (handles quoted values with commas)
  const splitCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if ((char === '"' || char === "'") && (i === 0 || line[i - 1] === ',' || line[i - 1] === ' ')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
          continue;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = null;
          continue;
        }
      }
      
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current); // Add last value
    
    return values.map(v => parseCSVValue(v));
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    // Parse header row
    const normalizeHeaderKey = (h) =>
      parseCSVValue(h)
        .replace(/^\uFEFF/, '')
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

    const headers = splitCSVLine(lines[0]).map((h) => normalizeHeaderKey(h));
    const requiredHeaders = ['fullname', 'email'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    console.log('CSV Headers:', headers);

    const students = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCSVLine(lines[i]);
      if (values.length === 0 || !values[0]) continue; // Skip empty rows

      const student = {};
      headers.forEach((header, index) => {
        const value = parseCSVValue(values[index] || '');
        
        const normalizedHeader = header;

        if (
          normalizedHeader === 'fullname' ||
          normalizedHeader === 'name' ||
          normalizedHeader === 'studentname' ||
          normalizedHeader === 'studentfullname'
        ) {
          student.fullName = value;
        } else if (
          normalizedHeader === 'email' ||
          normalizedHeader === 'emailaddress' ||
          normalizedHeader === 'studentemail' ||
          normalizedHeader === 'mail'
        ) {
          student.email = value;
        } else if (normalizedHeader === 'password' || normalizedHeader === 'pwd') {
          student.password = value;
        } else if (normalizedHeader === 'identityno' || normalizedHeader === 'identity number' || normalizedHeader === 'nic' || normalizedHeader === 'cnic') {
          student.identityNo = value;
        } else if (normalizedHeader === 'fathername' || normalizedHeader === 'father name' || normalizedHeader === 'fathersname') {
          student.fatherName = value;
        } else if (normalizedHeader === 'gender' || normalizedHeader === 'sex') {
          student.gender = value;
        } else if (normalizedHeader === 'dateofbirth' || normalizedHeader === 'date of birth' || normalizedHeader === 'dob' || normalizedHeader === 'birthdate') {
          student.dateOfBirth = value;
        } else if (normalizedHeader === 'address') {
          student.address = value;
        } else if (normalizedHeader === 'phone' || normalizedHeader === 'phonenumber' || normalizedHeader === 'mobile' || normalizedHeader === 'contact') {
          student.phone = value;
        } else if (normalizedHeader === 'status') {
          // Only set status if it's a valid enum value
          const statusLower = value.toLowerCase().trim();
          if (['active', 'inactive', 'suspended'].includes(statusLower)) {
            student.status = statusLower.charAt(0).toUpperCase() + statusLower.slice(1);
          } else if (value) {
            console.warn(`Row ${i + 1}: Invalid status value "${value}", using default "Active"`);
            student.status = 'Active'; // Default
          } else {
            student.status = 'Active'; // Default
          }
        } else {
          // Unknown column - log warning but don't fail
          console.warn(`Row ${i + 1}: Unknown column "${header}" with value "${value}" - ignoring`);
        }
      });

      if (student.fullName && student.email) {
        students.push(student);
      } else {
        console.warn(`Row ${i + 1}: Skipped - missing fullName or email`);
      }
    }

    if (students.length === 0) {
      throw new Error('No valid student records found in CSV');
    }

    console.log(`Parsed ${students.length} students from CSV`);
    return students;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !csvText.trim()) {
      setError('Please select a CSV file');
      return;
    }
    if (submitInFlightRef.current) return;

    const generation = submitGenerationRef.current + 1;
    submitGenerationRef.current = generation;
    submitInFlightRef.current = true;

    setError('');
    setLoading(true);

    try {
      const students = parseCSV(csvText);

      const examIds =
        enrollAfterRegister && selectedExamIds.length > 0 ? selectedExamIds : [];

      const response = await studentAPI.registerStudentsBulk(students, { examIds });

      if (generation !== submitGenerationRef.current) return;

      const normalized = normalizeBulkRegisterResponse(response, students.length);
      setResult(normalized);

      const created = normalized.summary?.created ?? 0;
      const regIssueCount = normalized.summary?.errors?.length ?? 0;
      const enrollIssueCount = normalized.enrollment?.skippedOrFailed ?? 0;
      const issueCount = regIssueCount + enrollIssueCount;

      if (onSuccess) {
        onSuccess();
      }

      if (created > 0 && issueCount === 0) {
        const closeGeneration = generation;
        setTimeout(() => {
          if (submitGenerationRef.current === closeGeneration) onClose();
        }, 4000);
      }
    } catch (err) {
      if (generation !== submitGenerationRef.current) return;
      console.error('Bulk register error:', err);
      console.error('Error details:', err.details);
      console.error('Error object:', err);
      
      // Build detailed error message
      let errorMessage = err.message || 'Failed to register students';
      
      // Add detailed error information if available
      if (err.details) {
        if (typeof err.details === 'string') {
          errorMessage = err.details;
        } else if (typeof err.details === 'object') {
          errorMessage = err.details.details || err.details.message || errorMessage;
          if (err.details.errorCode) {
            errorMessage += ` (Error Code: ${err.details.errorCode})`;
          }
          if (err.details.hint) {
            errorMessage += ` - ${err.details.hint}`;
          }
        }
      }
      
      // Add error code and hint if available directly on error object
      if (err.errorCode) {
        errorMessage += ` (Error Code: ${err.errorCode})`;
      }
      if (err.hint) {
        errorMessage += ` - ${err.hint}`;
      }
      
      setError(errorMessage);
    } finally {
      submitInFlightRef.current = false;
      if (generation === submitGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const downloadTemplate = () => {
    const template = `FullName,Email,Password,IdentityNo,FatherName,Gender,DateOfBirth,Address,Phone,Status
John Doe,john.doe@example.com,password123,12345-1234567-1,John Senior,Male,2000-01-15,123 Main St,03001234567,Active
Jane Smith,jane.smith@example.com,password456,12345-1234568-2,Jane Senior,Female,2001-03-20,456 Oak Ave,03001234568,Active`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const uploadModal = (
    <div
      className={`modal-overlay bulk-upload-overlay${result ? ' bulk-upload-overlay--dimmed' : ''}`}
      onClick={handleUploadOverlayClick}
    >
      <div className="modal-content modal-large bulk-register-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Bulk Register Students</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="bulk-upload-info">
            <p>
              <strong>Instructions:</strong>
            </p>
            <ul>
              <li>Upload a CSV file with student information</li>
              <li>Required columns: <strong>FullName</strong>, <strong>Email</strong></li>
              <li>Optional columns: Password, IdentityNo, FatherName, Gender, DateOfBirth, Address, Phone, Status</li>
              <li>Download the template below to see the correct format</li>
              <li>
                Optionally enroll <strong>newly registered</strong> students in one or more exams from your subscription (skips duplicate emails).
              </li>
            </ul>
          </div>

          <div className="bulk-enroll-section">
            <label className="bulk-enroll-toggle">
              <input
                type="checkbox"
                checked={enrollAfterRegister}
                onChange={(e) => {
                  setEnrollAfterRegister(e.target.checked);
                  if (!e.target.checked) setSelectedExamIds([]);
                }}
              />
              <span>
                <strong>Also enroll in exams</strong> (optional)
                <span className="bulk-enroll-toggle-hint">
                  Applies only to students created in this upload — uses your org Settings approval rules.
                </span>
              </span>
            </label>

            {enrollAfterRegister && (
              <div className="bulk-enroll-exams">
                <div className="bulk-enroll-exams-head">
                  <Layers size={18} />
                  <span>Select exams from your active subscription</span>
                  <div className="bulk-enroll-exams-actions">
                    <button type="button" className="btn-link-small" onClick={selectAllExams}>
                      All
                    </button>
                    <button type="button" className="btn-link-small" onClick={clearExams}>
                      Clear
                    </button>
                  </div>
                </div>
                {examsLoading ? (
                  <p className="bulk-enroll-meta">Loading exams…</p>
                ) : subscriptionExams.length === 0 ? (
                  <p className="bulk-enroll-meta">
                    No exams on your active subscription. You can still register students; enroll them later under Exam enrollments.
                  </p>
                ) : (
                  <>
                    <ul className="bulk-enroll-exam-list">
                      {subscriptionExams.map((exam) => (
                        <li key={exam.ExamID}>
                          <label className="bulk-enroll-exam-label">
                            <input
                              type="checkbox"
                              checked={selectedExamIds.includes(String(exam.ExamID))}
                              onChange={() => toggleExam(exam.ExamID)}
                            />
                            <span>
                              <BookOpen size={14} />
                              {exam.ExamName || 'Exam'}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {selectedExamIds.length > 0 && (
                      <p className="bulk-enroll-summary-line">
                        {selectedExamIds.length} exam{selectedExamIds.length === 1 ? '' : 's'} selected — each new student will be enrolled in all selected exams.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="template-download">
            <button type="button" className="btn-secondary" onClick={downloadTemplate}>
              <Download size={16} />
              Download CSV Template
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>
                <span>CSV File *</span>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    required
                  />
                  {file && (
                    <div className="file-name">
                      <FileText size={16} />
                      {file.name}
                    </div>
                  )}
                </div>
              </label>
            </div>

            {error && (
              <div className="notice error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  loading ||
                  !file ||
                  !csvText.trim() ||
                  (enrollAfterRegister && subscriptionExams.length > 0 && selectedExamIds.length === 0)
                }
              >
                {loading
                  ? 'Processing…'
                  : enrollAfterRegister && selectedExamIds.length > 0
                    ? 'Register & enroll'
                    : 'Register Students'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {uploadModal}
      {result && (
        <BulkRegisterResultModal
          result={result}
          subscriptionExams={subscriptionExams}
          onBack={handleResultBack}
          onDone={onClose}
        />
      )}
    </>,
    document.body
  );
};

const Students = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadStudents();
  }, [page, searchTerm]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const response = await studentAPI.getStudents({
        page,
        limit: 20,
        search: searchTerm || undefined,
      });
      setStudents(response.students || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshStudentsQuiet = useCallback(async () => {
    try {
      const response = await studentAPI.getStudents({
        page,
        limit: 20,
        search: searchTerm || undefined,
      });
      setStudents(response.students || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to refresh students:', error);
    }
  }, [page, searchTerm]);

  const handleEdit = (student) => {
    setEditingStudent(student);
    setShowRegisterModal(true);
  };

  const handleDelete = async (student) => {
    if (!window.confirm(`Are you sure you want to delete ${student.FullName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await studentAPI.deleteStudent(student.StudentID);
      loadStudents();
    } catch (error) {
      alert(error.message || error.details || 'Failed to delete student');
    }
  };

  return (
    <div className="students-page">
      <div className="page-header">
        <div>
          <h1>Students</h1>
          <p className="page-subtitle">
            Manage and register students for your organization. Exam access is configured under <strong>Exam enrollments</strong> in the
            sidebar.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowBulkModal(true)}>
            <Upload size={18} />
            <span>Bulk Register</span>
          </button>
          <button className="btn-primary" onClick={() => setShowRegisterModal(true)}>
            <Plus size={18} />
            <span>Register Student</span>
          </button>
        </div>
      </div>

      <div className="students-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search students by name, email, or identity number..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1); // Reset to first page on search
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading students...</div>
      ) : students.length === 0 ? (
        <div className="empty-state">
          <UserPlus size={48} />
          <h3>No students found</h3>
          <p>Get started by registering your first student</p>
          <div className="empty-state-actions">
            <button className="btn-secondary" onClick={() => setShowBulkModal(true)}>
              <Upload size={18} />
              <span>Bulk Register</span>
            </button>
            <button className="btn-primary" onClick={() => setShowRegisterModal(true)}>
              <Plus size={18} />
              <span>Register Student</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="students-table-container">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Identity No</th>
                  <th>Gender</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.StudentID}>
                    <td>
                      <div className="student-name-cell">
                        <div className="student-avatar">
                          {student.FullName?.charAt(0) || 'S'}
                        </div>
                        {student.FullName || 'N/A'}
                      </div>
                    </td>
                    <td>{student.Email || 'N/A'}</td>
                    <td>{student.IdentityNo || 'N/A'}</td>
                    <td>{student.Gender || 'N/A'}</td>
                    <td>{student.Phone || 'N/A'}</td>
                    <td>
                      <span className={`status-badge status-${student.Status?.toLowerCase()}`}>
                        {student.Status || 'N/A'}
                      </span>
                    </td>
                    <td>
                      {student.CreatedAt
                        ? new Date(student.CreatedAt).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-icon-small"
                          onClick={() => handleEdit(student)}
                          title="Edit student"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="btn-icon-small btn-danger"
                          onClick={() => handleDelete(student)}
                          title="Delete student"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <button
                className="btn-secondary"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showRegisterModal && (
        <RegisterStudentModal
          student={editingStudent}
          onClose={() => {
            setShowRegisterModal(false);
            setEditingStudent(null);
          }}
          onSuccess={() => {
            setShowRegisterModal(false);
            setEditingStudent(null);
            loadStudents();
          }}
        />
      )}

      {showBulkModal && (
        <BulkRegisterModal
          onClose={() => setShowBulkModal(false)}
          onSuccess={refreshStudentsQuiet}
        />
      )}

    </div>
  );
};

export default Students;
