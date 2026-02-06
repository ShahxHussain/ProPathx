import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Calendar, Clock, BookOpen, X, CheckCircle, AlertCircle, UserPlus, UsersRound, ArrowLeft, List } from 'lucide-react';
import { testAPI, orgDashboard, studentAPI, groupAPI } from '../../services/api';
import './Tests.css';

const CreateTestModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    testName: '',
    examId: '',
    subscriptionId: '',
    testType: 'Practice',
    durationMinutes: 60,
    totalQuestions: 10,
    totalMarks: 100,
    testDate: '',
    startTime: '',
    status: 'Active',
  });

  const [allExams, setAllExams] = useState([]);
  const [availableExams, setAvailableExams] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);

  // Function to filter exams based on subscription plan
  const filterExamsForSubscription = (subscriptionId, planId) => {
    console.log('🔍 filterExamsForSubscription called:', { subscriptionId, planId, plansCount: subscriptionPlans.length, examsCount: allExams.length });
    
    if (!planId) {
      console.log('⚠️ No PlanID provided');
      setAvailableExams(allExams);
      return;
    }

    if (!subscriptionPlans.length) {
      console.log('⚠️ No subscription plans loaded yet');
      setAvailableExams(allExams);
      return;
    }

    if (!allExams.length) {
      console.log('⚠️ No exams loaded yet');
      setAvailableExams([]);
      return;
    }

    // Find the plan - check both direct PlanID and nested SubscriptionPlans
    console.log('🔍 Looking for plan with PlanID:', planId);
    console.log('📦 Available plans:', subscriptionPlans.map(p => ({
      PlanID: p.PlanID,
      PlanName: p.PlanName,
      examsCount: p.exams?.length || 0
    })));
    
    const plan = subscriptionPlans.find(p => {
      const pId = p.PlanID || (p.SubscriptionPlans && p.SubscriptionPlans.PlanID);
      const matches = String(pId) === String(planId);
      if (matches) {
        console.log(`✅ Found matching plan: ${p.PlanName} (${pId})`);
      }
      return matches;
    });
    
    if (!plan) {
      console.log('⚠️ Plan not found in subscription plans list');
      console.log('🔍 Searched for PlanID:', planId, 'Type:', typeof planId);
      console.log('📋 Available PlanIDs:', subscriptionPlans.map(p => ({ 
        PlanID: p.PlanID, 
        Type: typeof p.PlanID,
        Match: String(p.PlanID) === String(planId)
      })));
      setAvailableExams(allExams);
      return;
    }

    console.log('✅ Plan found:', { PlanID: plan.PlanID, PlanName: plan.PlanName, examsCount: plan.exams?.length || 0 });
    console.log('📚 Plan exams:', plan.exams);

    if (!plan.exams || plan.exams.length === 0) {
      console.log('⚠️ Plan has no linked exams');
      setAvailableExams(allExams);
      return;
    }

    // Get exam IDs from the plan - handle both direct ExamID and nested structure
    const planExamIds = new Set(
      plan.exams
        .map(e => e.ExamID)
        .filter(Boolean)
    );
    console.log('📋 Plan ExamIDs:', Array.from(planExamIds));
    console.log('📚 All ExamIDs:', allExams.map(e => e.ExamID));
    
    // Filter exams to only show those in the plan
    const filtered = allExams.filter(exam => {
      const matches = planExamIds.has(exam.ExamID);
      if (!matches) {
        console.log(`  ❌ Exam ${exam.ExamID} (${exam.ExamName}) not in plan`);
      }
      return matches;
    });
    console.log(`✅ Filtered exams: ${filtered.length} out of ${allExams.length}`, filtered.map(e => ({ ExamID: e.ExamID, ExamName: e.ExamName })));
    setAvailableExams(filtered);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter exams when subscription changes or data loads
  useEffect(() => {
    // Wait for all data to be loaded
    if (subscriptions.length === 0 || subscriptionPlans.length === 0 || allExams.length === 0) {
      console.log('⏳ Waiting for data to load...', {
        subscriptions: subscriptions.length,
        plans: subscriptionPlans.length,
        exams: allExams.length
      });
      return;
    }

    if (!formData.subscriptionId) {
      // If no subscription selected, show all exams
      setAvailableExams(allExams);
      return;
    }

    const selectedSub = subscriptions.find(s => s.SubscriptionID === formData.subscriptionId);
    if (selectedSub) {
      const planId = selectedSub.PlanID || (selectedSub.SubscriptionPlans && selectedSub.SubscriptionPlans.PlanID);
      console.log('🔄 Filtering exams for subscription:', { 
        SubscriptionID: selectedSub.SubscriptionID, 
        PlanID: planId,
        SubscriptionPlanName: selectedSub.SubscriptionPlans?.PlanName
      });
      filterExamsForSubscription(selectedSub.SubscriptionID, planId);
    } else {
      console.log('⚠️ Selected subscription not found in subscriptions list');
      setAvailableExams(allExams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.subscriptionId, subscriptions.length, subscriptionPlans.length, allExams.length]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      setError('');
      
      // Load exams and subscriptions independently - don't fail if one fails
      const [examsResult, subsResult] = await Promise.allSettled([
        orgDashboard.exploreExams().catch((err) => {
          console.warn('Failed to load exams:', err);
          return { exams: [] };
        }),
        orgDashboard.getSubscriptions().catch((err) => {
          console.warn('Failed to load subscriptions:', err);
          return { subscriptions: [] };
        }),
      ]);

      // Handle exams
      if (examsResult.status === 'fulfilled') {
        const examsList = examsResult.value.exams || [];
        setAllExams(examsList);
        console.log('📚 All exams loaded:', examsList.length);
      } else {
        console.error('Exams loading failed:', examsResult.reason);
        setAllExams([]);
        setError('Failed to load exams. You can still create tests if you have an active subscription.');
      }
      
      // Load subscription plans to get exam mappings
      try {
        const plansResponse = await orgDashboard.getSubscriptionPlans();
        const plansList = plansResponse.plans || [];
        setSubscriptionPlans(plansList);
        console.log('📦 Subscription plans loaded:', plansList.length);
        plansList.forEach(plan => {
          console.log(`  Plan: ${plan.PlanName} (${plan.PlanID}) - ${plan.exams?.length || 0} exams`);
          if (plan.exams && plan.exams.length > 0) {
            plan.exams.forEach(exam => {
              console.log(`    - Exam: ${exam.ExamName} (${exam.ExamID})`);
            });
          }
        });
      } catch (err) {
        console.warn('Failed to load subscription plans:', err);
        setSubscriptionPlans([]);
      }

      // Handle subscriptions - this is critical
      let subscriptionsList = [];
      if (subsResult.status === 'fulfilled') {
        const subsResponse = subsResult.value;
        console.log('🔍 Subscriptions response:', subsResponse);
        
        if (subsResponse && subsResponse.subscriptions) {
          subscriptionsList = subsResponse.subscriptions;
        }
      } else {
        console.error('Subscriptions loading failed:', subsResult.reason);
      }
      
      // Filter active subscriptions - simplified check
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      console.log(`📋 Total subscriptions: ${subscriptionsList.length}`);
      
      const activeSubs = subscriptionsList.filter((sub) => {
        // Check status
        const status = String(sub.Status || '').trim().toLowerCase();
        if (status !== 'active') {
          console.log(`  ❌ Subscription ${sub.SubscriptionID} status: ${status}`);
          return false;
        }
        
        // Check end date
        if (!sub.EndDate) {
          console.log(`  ❌ Subscription ${sub.SubscriptionID} has no EndDate`);
          return false;
        }
        
        try {
          // Parse date - handle YYYY-MM-DD format
          const dateStr = String(sub.EndDate).split('T')[0];
          const [year, month, day] = dateStr.split('-').map(Number);
          
          let endDateOnly;
          if (year && month && day) {
            endDateOnly = new Date(year, month - 1, day);
          } else {
            // Fallback to Date constructor
            const endDate = new Date(sub.EndDate);
            if (isNaN(endDate.getTime())) {
              console.log(`  ❌ Invalid date format: ${sub.EndDate}`);
              return false;
            }
            endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          }
          
          const isActive = endDateOnly >= today;
          console.log(`  ${isActive ? '✅' : '❌'} Subscription ${sub.SubscriptionID}: EndDate=${endDateOnly.toISOString().split('T')[0]}, Today=${today.toISOString().split('T')[0]}, Active=${isActive}`);
          return isActive;
        } catch (error) {
          console.error('Error parsing end date:', error, sub.EndDate);
          return false;
        }
      });
      
      console.log(`✅ Active subscriptions found: ${activeSubs.length}`, activeSubs);
      setSubscriptions(activeSubs);

      // Auto-select first subscription if available
      if (activeSubs.length > 0) {
        const firstSub = activeSubs[0];
        const planId = firstSub.PlanID || (firstSub.SubscriptionPlans && firstSub.SubscriptionPlans.PlanID);
        console.log('🎯 Auto-selecting subscription:', { 
          SubscriptionID: firstSub.SubscriptionID, 
          PlanID: planId,
          SubscriptionPlanName: firstSub.SubscriptionPlans?.PlanName 
        });
        setFormData((prev) => ({ ...prev, subscriptionId: firstSub.SubscriptionID }));
        
        // Filter exams after all data is loaded
        // Use setTimeout to ensure state updates are complete
        setTimeout(() => {
          if (subscriptionPlans.length > 0 && allExams.length > 0) {
            filterExamsForSubscription(firstSub.SubscriptionID, planId);
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Combine date and time for startTime
      const startDateTime = formData.testDate && formData.startTime
        ? new Date(`${formData.testDate}T${formData.startTime}`).toISOString()
        : null;

      // Calculate endTime from startTime + durationMinutes
      let endDateTime = null;
      if (startDateTime && formData.durationMinutes) {
        const startDate = new Date(startDateTime);
        const endDate = new Date(startDate.getTime() + formData.durationMinutes * 60 * 1000);
        endDateTime = endDate.toISOString();
      }

      if (!startDateTime) {
        setError('Please provide test date and start time');
        setLoading(false);
        return;
      }

      if (!formData.durationMinutes || formData.durationMinutes <= 0) {
        setError('Please provide a valid test duration');
        setLoading(false);
        return;
      }

      await testAPI.createTest({
        ...formData,
        startTime: startDateTime,
        endTime: endDateTime,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Create test error:', err);
      console.error('Error details:', err.details);
      console.error('Error object:', err);
      // Show more detailed error message if available
      let errorMessage = err.details || err.message || 'Failed to create test';
      
      // If it's a detailed error object, show the full message
      if (typeof err.details === 'object' && err.details.details) {
        errorMessage = err.details.details;
      } else if (err.details) {
        errorMessage = err.details;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Create New Test</h2>
            <button className="btn-icon" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">
            <div className="notice warning">
              <AlertCircle size={20} />
              <div>
                <strong>No Active Subscription</strong>
                <p>You need an active subscription to create tests. Please subscribe to a plan first.</p>
                <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  If you just subscribed, please click "Refresh" to reload your subscriptions.
                </p>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={loadData}
              disabled={loadingData}
            >
              {loadingData ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Test</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Test Name *</span>
              <input
                type="text"
                value={formData.testName}
                onChange={(e) => setFormData({ ...formData, testName: e.target.value })}
                required
                placeholder="e.g., MDCAT Practice Test 1"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Subscription *</span>
              <select
                value={formData.subscriptionId}
                onChange={(e) => setFormData({ ...formData, subscriptionId: e.target.value })}
                required
              >
                <option value="">Select Subscription</option>
                {subscriptions.map((sub) => (
                  <option key={sub.SubscriptionID} value={sub.SubscriptionID}>
                    {sub.SubscriptionPlans?.PlanName || 'Plan'} - 
                    {new Date(sub.EndDate).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Exam *</span>
              <select
                value={formData.examId}
                onChange={(e) => setFormData({ ...formData, examId: e.target.value })}
                required
                disabled={!formData.subscriptionId || availableExams.length === 0}
              >
                <option value="">
                  {!formData.subscriptionId 
                    ? 'Select Subscription first' 
                    : availableExams.length === 0 
                    ? 'No exams available in this subscription'
                    : 'Select Exam'}
                </option>
                {availableExams.map((exam) => (
                  <option key={exam.ExamID} value={exam.ExamID}>
                    {exam.ExamName} (Platform-wide)
                  </option>
                ))}
              </select>
              {formData.subscriptionId && availableExams.length === 0 && (
                <small style={{ color: '#ef4444', marginTop: '4px', display: 'block' }}>
                  No exams are linked to this subscription plan. Please contact support.
                </small>
              )}
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Test Type *</span>
              <select
                value={formData.testType}
                onChange={(e) => setFormData({ ...formData, testType: e.target.value })}
                required
              >
                <option value="Practice">Practice</option>
                <option value="Mock">Mock</option>
                <option value="Final">Final</option>
              </select>
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Duration (minutes) *</span>
              <input
                type="number"
                value={formData.durationMinutes}
                onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 0 })}
                required
                min="1"
              />
            </label>

            <label>
              <span>Total Questions *</span>
              <input
                type="number"
                value={formData.totalQuestions}
                onChange={(e) => setFormData({ ...formData, totalQuestions: parseInt(e.target.value) || 0 })}
                required
                min="1"
              />
            </label>
          </div>

          <div className="form-row form-row-2">
            <label>
              <span>Total Marks *</span>
              <input
                type="number"
                value={formData.totalMarks}
                onChange={(e) => setFormData({ ...formData, totalMarks: parseFloat(e.target.value) || 0 })}
                required
                min="0"
                step="0.01"
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

          <div className="form-row">
            <label>
              <span>Test Date *</span>
              <input
                type="date"
                value={formData.testDate}
                onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                required
                min={new Date().toISOString().split('T')[0]}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Start Time *</span>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
                disabled={!formData.testDate}
              />
              {formData.startTime && formData.durationMinutes && (
                <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  End time will be automatically calculated: {(() => {
                    const startDate = new Date(`${formData.testDate}T${formData.startTime}`);
                    const endDate = new Date(startDate.getTime() + formData.durationMinutes * 60 * 1000);
                    return endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                  })()}
                </small>
              )}
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
              {loading ? 'Creating...' : 'Create Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AssignTestModal = ({ test, onClose, onSuccess }) => {
  const [assignmentType, setAssignmentType] = useState('single'); // 'single', 'multiple', 'group', 'groups', 'all'
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
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

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
    setLoading(true);

    try {
      let result;
      const payload = {
        assignmentType,
        selectedStudent,
        selectedStudents,
        selectedGroup,
        selectedGroups,
        dueDate: dueDate || undefined,
      };
      setLastPayload(payload);
      switch (assignmentType) {
        case 'single':
          if (!selectedStudent) {
            setError('Please select a student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToSingle(test.TestID, selectedStudent, payload.dueDate);
          break;
        case 'multiple':
          if (selectedStudents.length === 0) {
            setError('Please select at least one student');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToMultiple(test.TestID, selectedStudents, payload.dueDate);
          break;
        case 'group':
          if (!selectedGroup) {
            setError('Please select a group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroup(test.TestID, selectedGroup, payload.dueDate);
          break;
        case 'groups':
          if (selectedGroups.length === 0) {
            setError('Please select at least one group');
            setLoading(false);
            return;
          }
          result = await testAPI.assignToGroups(test.TestID, selectedGroups, payload.dueDate);
          break;
        case 'all':
          result = await testAPI.assignToAll(test.TestID, payload.dueDate);
          break;
        default:
          setError('Invalid assignment type');
          setLoading(false);
          return;
      }

      if (onSuccess) onSuccess(result);
      onClose();
    } catch (err) {
      // If backend returned a conflict with details, show a dedicated popup
      const details = err?.details;
      const hasConflictDetails =
        err?.status === 409 &&
        details &&
        typeof details === 'object' &&
        Array.isArray(details.alreadyAssignedStudents);

      if (hasConflictDetails) {
        setConflictDetails(details);
        setError(err.message || 'Some students already have this test assigned.');
      } else {
        setError(err.message || err.details || 'Failed to assign test');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceExisting = async () => {
    if (!lastPayload) return;
    setLoading(true);
    setError('');
    try {
      let result;
      switch (lastPayload.assignmentType) {
        case 'single':
          result = await testAPI.assignToSingle(
            test.TestID,
            lastPayload.selectedStudent,
            lastPayload.dueDate,
            true
          );
          break;
        case 'multiple':
          result = await testAPI.assignToMultiple(
            test.TestID,
            lastPayload.selectedStudents,
            lastPayload.dueDate,
            true
          );
          break;
        case 'group':
          result = await testAPI.assignToGroup(
            test.TestID,
            lastPayload.selectedGroup,
            lastPayload.dueDate,
            true
          );
          break;
        case 'groups':
          result = await testAPI.assignToGroups(
            test.TestID,
            lastPayload.selectedGroups,
            lastPayload.dueDate,
            true
          );
          break;
        case 'all':
          result = await testAPI.assignToAll(test.TestID, lastPayload.dueDate, true);
          break;
        default:
          throw new Error('Invalid assignment type');
      }

      setConflictDetails(null);
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (err) {
      setError(err.message || err.details || 'Failed to replace assignments');
    } finally {
      setLoading(false);
    }
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const toggleGroupSelection = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const filteredStudents = students.filter(s =>
    s.FullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.Email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign Test: {test?.TestName}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

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
                  Already assigned ({conflictDetails.alreadyAssignedCount || conflictDetails.alreadyAssignedStudents.length})
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
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setConflictDetails(null)}
                >
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
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
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
                        <span>{student.FullName} ({student.Email})</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedStudents.length > 0 && (
                  <div className="selected-count">
                    {selectedStudents.length} student(s) selected
                  </div>
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
                        <span>{group.GroupName} ({group.memberCount || 0} members)</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedGroups.length > 0 && (
                  <div className="selected-count">
                    {selectedGroups.length} group(s) selected
                  </div>
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
              {loading ? 'Assigning...' : 'Assign Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

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

  const getTestTypeBadge = (type) => {
    const colors = {
      Practice: 'blue',
      Mock: 'orange',
      Final: 'red',
    };
    return colors[type] || 'gray';
  };

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
                {selectedTest.Exams?.ExamName || 'N/A'} • {selectedTest.TestType} • {selectedTest.DurationMinutes || 0} min
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
                      <th>Type</th>
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
                          <span className={`badge badge-${getTestTypeBadge(test.TestType)}`}>
                            {test.TestType}
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [assigningTest, setAssigningTest] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    loadTests();
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

  const getTestTypeBadge = (type) => {
    const colors = {
      Practice: 'blue',
      Mock: 'orange',
      Final: 'red',
    };
    return colors[type] || 'gray';
  };

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
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            <span>Create Test</span>
          </button>
        </div>
      </div>

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
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
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
                  <th>Type</th>
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
                      <span className={`badge badge-${getTestTypeBadge(test.TestType)}`}>
                        {test.TestType}
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

      {showCreateModal && (
        <CreateTestModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTests();
          }}
        />
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
