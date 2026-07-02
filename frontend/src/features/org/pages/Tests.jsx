import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, BookOpen, AlertCircle, UserPlus, ArrowLeft, List, BookOpenCheck } from 'lucide-react';
import { testAPI, orgDashboard } from '../../../services/api';
import AssignTestModal from '../../../components/org/AssignTestPanel';
import { getTestScheduleBadgeColor, getTestScheduleLabel } from '../utils/testScheduleLabel.js';
import './Tests.css';

const TestAssignmentsScreen = ({ onBack }) => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTest, setSelectedTest] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
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
              <th>Type</th>
              <th>Status</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const s = a.Students || {};
              return (
                <tr key={a.AssignmentID || `${a.TestID}-${s.StudentID}`}>
                  <td>{s.FullName || 'N/A'}</td>
                  <td>{s.Email || 'N/A'}</td>
                  <td>{a.AssignmentType || 'N/A'}</td>
                  <td>
                    <span className={`status-badge status-${(a.Status || 'pending').toLowerCase()}`}>
                      {a.Status || 'Pending'}
                    </span>
                  </td>
                  <td>{a.DueDate ? new Date(a.DueDate).toLocaleString() : 'â€”'}</td>
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
          <button className="btn-icon-text" onClick={onBack} style={{ marginBottom: '8px' }}>
            <ArrowLeft size={18} />
            <span>Back to Tests</span>
          </button>
          <h1>Test overview & assignments</h1>
          <p className="page-subtitle">
            Pick a test to see its details, who it is assigned to, and manage new assignments.
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
            <div>
              <h2>{selectedTest.TestName}</h2>
              <p className="page-subtitle">
                {selectedTest.Exams?.ExamName || 'N/A'} · {getTestScheduleLabel(selectedTest)} · {selectedTest.DurationMinutes || 0} min
              </p>
            </div>
            <div className="header-actions">
              <button className="btn-primary" onClick={() => setShowAssignModal(true)}>
                <UserPlus size={16} />
                <span>Assign</span>
              </button>
              <button className="btn-icon-text" onClick={() => { setSelectedTest(null); setAssignments([]); }}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            </div>
          </div>

          {renderAssignments()}

          {pagination && (
            <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Test status: <strong>{selectedTest.Status || 'N/A'}</strong>
            </div>
          )}

          {showAssignModal && (
            <AssignTestModal
              test={selectedTest}
              onClose={() => setShowAssignModal(false)}
              onSuccess={() => {
                setShowAssignModal(false);
                loadAssignments(selectedTest.TestID);
              }}
            />
          )}
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
                        <td>
                          {test.TestDate ? new Date(test.TestDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td>
                          <span className={`status-badge status-${test.Status?.toLowerCase()}`}>
                            {test.Status || 'N/A'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => {
                              setSelectedTest(test);
                              loadAssignments(test.TestID);
                            }}
                          >
                            <List size={16} />
                            <span>View</span>
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

const Tests = () => {
  const [view, setView] = useState('list'); // 'list' or 'assignments'
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [assigningTest, setAssigningTest] = useState(null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const [pagination, setPagination] = useState(null);
  const [canCreateTests, setCanCreateTests] = useState(true);
  const [subscriptionGateLoading, setSubscriptionGateLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await orgDashboard.getSubscriptions();
        const list = res.subscriptions || [];
        const now = new Date();
        const active = list.filter((sub) => {
          const status = String(sub.Status || '').trim().toLowerCase();
          if (status !== 'active') return false;
          if (!sub.EndDate) return false;
          return new Date(sub.EndDate) >= now;
        });
        if (!cancelled) setCanCreateTests(active.length > 0);
      } catch {
        if (!cancelled) setCanCreateTests(false);
      } finally {
        if (!cancelled) setSubscriptionGateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const filteredTests = tests.filter(
    (test) =>
      test.TestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.Exams?.ExamName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleStatus = async (test) => {
    try {
      const nextStatus = test.Status === 'Active' ? 'Inactive' : 'Active';
      await testAPI.updateStatus(test.TestID, nextStatus);
      await loadTests();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert(err.message || 'Failed to update status');
    }
  };

  // Show assignments screen if view is 'assignments'
  if (view === 'assignments') {
    return <TestAssignmentsScreen onBack={() => setView('list')} />;
  }

  return (
    <div className="tests-page">
      <div className="page-header">
        <div>
          <h1>Tests</h1>
          <p className="page-subtitle">Manage and create tests for your organization</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={subscriptionGateLoading || !canCreateTests}
            title={
              !canCreateTests && !subscriptionGateLoading
                ? 'An active organization subscription is required to create tests'
                : undefined
            }
            onClick={() => canCreateTests && navigate('/org/tests/wizard')}
          >
            <Plus size={18} />
            <span>Create Test</span>
          </button>
        </div>
      </div>

      {!subscriptionGateLoading && !canCreateTests && (
        <div className="notice warning" style={{ marginBottom: '20px' }}>
          <AlertCircle size={20} />
          <div>
            <strong>Subscription required</strong>
            <p style={{ margin: '8px 0 0' }}>
              Test creation requires an active organization subscription. Subscribe or renew a plan, then try again.
            </p>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '12px' }}
              onClick={() => navigate('/org/subscription-plans')}
            >
              View subscription plans
            </button>
          </div>
        </div>
      )}

      <div className="tests-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search tests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading tests...</div>
      ) : filteredTests.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No tests found</h3>
          <p>Get started by creating your first test</p>
          <button
            type="button"
            className="btn-primary"
            disabled={subscriptionGateLoading || !canCreateTests}
            onClick={() => canCreateTests && navigate('/org/tests/wizard')}
          >
            <Plus size={18} />
            <span>Create Test</span>
          </button>
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
                  <th>Actions</th>
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
                    <td>
                      {test.TestDate ? new Date(test.TestDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <span className={`status-badge status-${test.Status?.toLowerCase()}`}>
                        {test.Status || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <div className="header-actions">
                        <button
                          className="btn-secondary btn-sm btn-compact"
                          onClick={() => toggleStatus(test)}
                          title="Enable/Disable test"
                        >
                          {test.Status === 'Active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn-secondary btn-sm btn-compact"
                          onClick={() => navigate(`/org/tests/wizard/${test.TestID}`)}
                          title="Edit test in the step-by-step wizard"
                        >
                          <BookOpen size={16} />
                          <span>Wizard</span>
                        </button>
                        <button
                          className="btn-secondary btn-sm btn-compact"
                          onClick={() => navigate(`/org/tests/${test.TestID}/questions`)}
                          title="View questions in this test and export as PDF"
                        >
                          <BookOpenCheck size={16} />
                          <span>Questions</span>
                        </button>
                        <button
                          className="btn-primary btn-sm btn-compact"
                          onClick={() => setAssigningTest(test)}
                          title="Assign test"
                        >
                          <UserPlus size={16} />
                          <span>Assign</span>
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

      {assigningTest && (
        <AssignTestModal
          test={assigningTest}
          onClose={() => setAssigningTest(null)}
          onSuccess={() => {
            setAssigningTest(null);
            loadTests();
          }}
        />
      )}

    </div>
  );
};

export default Tests;
