import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import { testAPI } from '../../../services/api';
import { getTestScheduleBadgeColor, getTestScheduleLabel } from '../utils/testScheduleLabel.js';
import './Tests.css';

const TestAssignments = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTest, setSelectedTest] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [page, setPage] = useState(1);  
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const loadTests = async () => {
    try {
      setLoading(true);
      const response = await testAPI.getTests({ page, limit: 20 });
      setTests(response.tests || []);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to load tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (testId) => {
    try {
      setAssignmentsLoading(true);
      const res = await testAPI.getAssignments(testId);
      setAssignments(res.assignments || []);
    } catch (err) {
      console.error('Failed to load assignments:', err);
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const filteredTests = tests.filter(
    (test) =>
      test.TestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.Exams?.ExamName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderAssignments = () => {
    if (!selectedTest) return null;
    if (assignmentsLoading) return <div className="loading-state">Loading assignments...</div>;
    if (!assignments.length) return <div className="empty-state">No assignments yet</div>;

    return (
      <div className="tests-table-container" style={{ marginTop: '16px' }}>
        <table className="tests-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Email</th>
              <th>Group</th>
              <th>Type</th>
              <th>Status</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const s = a.Students || {};
              const g = a.StudentGroups || {};
              return (
                <tr key={a.AssignmentID || `${a.TestID}-${s.StudentID}`}>
                  <td>{s.FullName || 'N/A'}</td>
                  <td>{s.Email || 'N/A'}</td>
                  <td>{g.GroupName || '—'}</td>
                  <td>{a.AssignmentType || 'N/A'}</td>
                  <td>
                    <span className={`status-badge status-${(a.Status || 'pending').toLowerCase()}`}>
                      {a.Status || 'Pending'}
                    </span>
                  </td>
                  <td>{a.DueDate ? new Date(a.DueDate).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="tests-page">
      <div className="page-header">
        <div>
          <h1>Assigned test details</h1>
          <p className="page-subtitle">
            Choose a test to view which students it is assigned to, their status, and due dates.
          </p>
        </div>
      </div>

      {!selectedTest && (
        <div className="tests-filters">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by test or exam name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {selectedTest ? (
        <div className="assignments-panel">
          <div className="assignments-header">
            <div className="test-summary-card">
              <div className="test-summary-main">
                <h2>{selectedTest.TestName}</h2>
                <p className="test-summary-subtitle">
                  {selectedTest.Exams?.ExamName || 'N/A'} · {getTestScheduleLabel(selectedTest)} ·{' '}
                  {selectedTest.DurationMinutes || 0} min
                </p>
              </div>
              <div className="test-summary-meta">
                <span className="badge badge-blue">
                  {assignments.length} {assignments.length === 1 ? 'assignee' : 'assignees'}
                </span>
                <span className="badge badge-orange">
                  {assignments.filter((a) => (a.Status || 'Pending') === 'Pending').length} pending
                </span>
                <span className={`status-badge status-${selectedTest.Status?.toLowerCase()}`}>
                  {selectedTest.Status || 'N/A'}
                </span>
              </div>
            </div>
            <div className="header-actions">
              <button
                className="btn-icon-text"
                onClick={() => {
                  setSelectedTest(null);
                  setAssignments([]);
                }}
              >
                <ArrowLeft size={16} />
                <span>Back to list</span>
              </button>
            </div>
          </div>

          {renderAssignments()}

        </div>
      ) : (
        <>
          {loading ? (
            <div className="loading-state">Loading tests...</div>
          ) : filteredTests.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No tests found</h3>
              <p>Create tests first before assigning them</p>
            </div>
          ) : (
            <>
              <div className="tests-table-container">
                <table className="tests-table">
                  <thead>
                    <tr>
                      <th>Test Name</th>
                      <th>Exam</th>
                      <th>Schedule</th>
                      <th>Questions</th>
                      <th>Duration</th>
                      <th>Test Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTests.map((test) => (
                      <tr key={test.TestID}>
                        <td>
                          <div className="test-name-cell">
                            <FileText size={16} />
                            {test.TestName}
                          </div>
                        </td>
                        <td>{test.Exams?.ExamName || 'N/A'}</td>
                        <td>
                          <span className={`badge badge-${getTestScheduleBadgeColor(test)}`}>
                            {getTestScheduleLabel(test)}
                          </span>
                        </td>
                        <td>{test.TotalQuestions || 0}</td>
                        <td>{test.DurationMinutes || 0} min</td>
                        <td>{test.TestDate ? new Date(test.TestDate).toLocaleDateString() : 'N/A'}</td>
                        <td>
                          <span className={`status-badge status-${test.Status?.toLowerCase()}`}>
                            {test.Status || 'N/A'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-primary btn-sm btn-compact"
                            onClick={() => {
                              setSelectedTest(test);
                              loadAssignments(test.TestID);
                            }}
                          >
                            <span>View details</span>
                          </button>
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
                    Page {pagination.page} of {pagination.totalPages}
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
        </>
      )}
    </div>
  );
};

export default TestAssignments;
