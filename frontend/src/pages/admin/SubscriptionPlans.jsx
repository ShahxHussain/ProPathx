import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Link2, X, DollarSign, Calendar, Package, Settings, Eye, Search, Filter, ToggleLeft, ToggleRight } from 'lucide-react';
import { adminAPI } from '../../services/api';
import './SubscriptionPlans.css';

const SubscriptionPlans = () => {
  const [viewMode, setViewMode] = useState('manage'); // 'manage' or 'overview'
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [linkingPlan, setLinkingPlan] = useState(null);
  const [planExamCounts, setPlanExamCounts] = useState({});
  const [planDetails, setPlanDetails] = useState({}); // Store full plan details with exams for overview
  const [overviewFilters, setOverviewFilters] = useState({
    search: '',
    minPrice: '',
    maxPrice: '',
    minDuration: '',
    maxDuration: '',
  });

  useEffect(() => {
    loadPlans();
  }, []);

  // Auto-dismiss messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getSubscriptionPlans();
      const plansList = response.plans || [];
      setPlans(plansList);
      
      // Load exam counts for each plan
      const counts = {};
      await Promise.all(
        plansList.map(async (plan) => {
          try {
            const examResponse = await adminAPI.getPlanExams(plan.PlanID);
            counts[plan.PlanID] = (examResponse.exams || []).length;
          } catch (err) {
            console.error(`Failed to load exam count for plan ${plan.PlanID}:`, err);
            counts[plan.PlanID] = 0;
          }
        })
      );
      setPlanExamCounts(counts);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
      let errorMessage = 'Failed to load subscription plans';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.error) {
        errorMessage = err.error;
      } else if (err.details) {
        errorMessage = err.details;
      }
      
      // Add status code if available
      if (err.status) {
        errorMessage += ` (Status: ${err.status})`;
      }
      
      setError(errorMessage);
      
      // Log full error for debugging
      console.error('Full error object:', {
        message: err.message,
        error: err.error,
        details: err.details,
        status: err.status,
        originalError: err.originalError,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (planData) => {
    try {
      setError('');
      const response = await adminAPI.createSubscriptionPlan(planData);
      setSuccess('Subscription plan created successfully');
      setShowCreateModal(false);
      await loadPlans();
    } catch (err) {
      console.error('Failed to create subscription plan:', err);
      setError(err.message || 'Failed to create subscription plan');
    }
  };

  const handleUpdatePlan = async (planId, planData) => {
    try {
      setError('');
      await adminAPI.updateSubscriptionPlan(planId, planData);
      setSuccess('Subscription plan updated successfully');
      setEditingPlan(null);
      await loadPlans();
    } catch (err) {
      console.error('Failed to update subscription plan:', err);
      setError(err.message || 'Failed to update subscription plan');
    }
  };

  const handleDeletePlan = async (planId) => {
    try {
      setError('');
      await adminAPI.deleteSubscriptionPlan(planId);
      setSuccess('Subscription plan deleted successfully');
      setDeletingPlan(null);
      await loadPlans();
    } catch (err) {
      console.error('Failed to delete subscription plan:', err);
      setError(err.message || 'Failed to delete subscription plan');
    }
  };

  const handleTogglePlanStatus = async (plan) => {
    const newStatus = plan.Status === 'Active' ? 'Inactive' : 'Active';
    try {
      setError('');
      await adminAPI.updateSubscriptionPlan(plan.PlanID, { status: newStatus });
      setSuccess(`Plan ${newStatus === 'Active' ? 'enabled' : 'set inactive'}. Existing organization subscriptions are unaffected.`);
      await loadPlans();
    } catch (err) {
      console.error('Failed to update plan status:', err);
      setError(err.message || 'Failed to update plan status');
    }
  };

  const loadPlanDetails = async (planId) => {
    try {
      const response = await adminAPI.getSubscriptionPlan(planId);
      setPlanDetails((prev) => ({
        ...prev,
        [planId]: response,
      }));
      return response;
    } catch (err) {
      console.error(`Failed to load plan details for ${planId}:`, err);
      return null;
    }
  };

  const loadAllPlanDetails = async () => {
    const details = {};
    await Promise.all(
      plans.map(async (plan) => {
        const detail = await loadPlanDetails(plan.PlanID);
        if (detail) {
          details[plan.PlanID] = detail;
        }
      })
    );
    setPlanDetails(details);
  };

  // Load plan details when in overview mode
  useEffect(() => {
    if (viewMode === 'overview' && plans.length > 0) {
      loadAllPlanDetails();
    }
  }, [viewMode, plans]);

  if (loading) {
    return (
      <div className="subscription-plans-container">
        <div className="loading">Loading subscription plans...</div>
      </div>
    );
  }

  const filteredPlans = plans.filter((plan) => {
    if (overviewFilters.search) {
      const searchLower = overviewFilters.search.toLowerCase();
      const matchesName = plan.PlanName?.toLowerCase().includes(searchLower);
      const planDetail = planDetails[plan.PlanID];
      const matchesExam = planDetail?.exams?.some((exam) =>
        exam.ExamName?.toLowerCase().includes(searchLower)
      );
      if (!matchesName && !matchesExam) return false;
    }
    if (overviewFilters.minPrice && plan.Price < parseFloat(overviewFilters.minPrice)) return false;
    if (overviewFilters.maxPrice && plan.Price > parseFloat(overviewFilters.maxPrice)) return false;
    if (overviewFilters.minDuration && plan.DurationMonths < parseInt(overviewFilters.minDuration)) return false;
    if (overviewFilters.maxDuration && plan.DurationMonths > parseInt(overviewFilters.maxDuration)) return false;
    return true;
  });

  return (
    <div className="subscription-plans-container">
      <div className="subscription-plans-header">
        <div className="subscription-plans-header-text">
          <p className="subscription-plans-eyebrow">Super Admin · Billing</p>
          <h1>Subscription Plans</h1>
          <p className="subscription-plans-subtitle">Manage subscription plans and link exams to plans</p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'manage' ? 'active' : ''}`}
              onClick={() => setViewMode('manage')}
            >
              <Eye size={18} />
              Overview
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'overview' ? 'active' : ''}`}
              onClick={() => setViewMode('overview')}
            >
              <Settings size={18} />
              Manage Plans
            </button>
          </div>
          {viewMode === 'overview' && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={20} />
              Create Plan
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
          <button 
            className="alert-close" 
            onClick={() => setError('')}
            aria-label="Close error"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          {success}
          <button 
            className="alert-close" 
            onClick={() => setSuccess('')}
            aria-label="Close success"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {viewMode === 'overview' ? (
        <OverviewView
          plans={filteredPlans}
          planDetails={planDetails}
          filters={overviewFilters}
          onFiltersChange={setOverviewFilters}
          onManagePlan={(plan) => {
            setLinkingPlan(plan);
            setViewMode('manage');
          }}
        />
      ) : (
        <ManageView
          plans={plans}
          planExamCounts={planExamCounts}
          onShowCreateModal={() => setShowCreateModal(true)}
          onEditPlan={setEditingPlan}
          onDeletePlan={setDeletingPlan}
          onToggleStatus={handleTogglePlanStatus}
        />
      )}

      {showCreateModal && (
        <PlanModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreatePlan}
        />
      )}

      {editingPlan && (
        <PlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSave={(planData) => handleUpdatePlan(editingPlan.PlanID, planData)}
        />
      )}

      {deletingPlan && (
        <DeleteConfirmModal
          plan={deletingPlan}
          onClose={() => setDeletingPlan(null)}
          onConfirm={() => handleDeletePlan(deletingPlan.PlanID)}
        />
      )}

      {linkingPlan && (
        <LinkExamsModal
          plan={linkingPlan}
          onClose={() => {
            setLinkingPlan(null);
            loadPlans(); // Reload to update counts
          }}
          onSuccess={() => {
            loadPlans(); // Reload to update counts
          }}
        />
      )}
    </div>
  );
};

// Plan Create/Edit Modal
const PlanModal = ({ plan, onClose, onSave }) => {
  const fallbackAudience = plan?.Audience || 'Organization';
  const fallbackModes = {
    isScheduledEnabled:
      plan?.testModes?.isScheduledEnabled ?? ['Organization', 'Both'].includes(fallbackAudience),
    isAdaptiveEnabled: plan?.testModes?.isAdaptiveEnabled ?? false,
    isSelfTestBuilderEnabled:
      plan?.testModes?.isSelfTestBuilderEnabled ?? ['Student', 'Both'].includes(fallbackAudience),
  };
  const [formData, setFormData] = useState({
    planName: plan?.PlanName || '',
    price: plan?.Price || '',
    durationMonths: plan?.DurationMonths || 1,
    features: plan?.Features || {},
    audience: plan?.Audience || 'Organization',
    testModes: fallbackModes,
  });
  const [featureKey, setFeatureKey] = useState('');
  const [featureValue, setFeatureValue] = useState('');

  const computeTotalPrice = () => {
    const basePrice = parseFloat(formData.price) || 0;
    const extras = Object.values(formData.features || {}).reduce((sum, value) => {
      const n = parseFloat(value);
      return Number.isNaN(n) ? sum : sum + n;
    }, 0);
    return basePrice + extras;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.planName.trim()) {
      alert('Plan name is required');
      return;
    }
    if (!formData.price || formData.price < 0) {
      alert('Valid price is required');
      return;
    }
    if (!formData.durationMonths || formData.durationMonths < 1) {
      alert('Duration must be at least 1 month');
      return;
    }
    if (!['Organization', 'Student', 'Both'].includes(formData.audience)) {
      alert("Audience must be 'Organization', 'Student', or 'Both'");
      return;
    }
    const totalPrice = computeTotalPrice();

    onSave({
      planName: formData.planName.trim(),
      price: totalPrice,
      durationMonths: parseInt(formData.durationMonths),
      features: formData.features,
      audience: formData.audience,
      testModes: formData.testModes,
    });
  };

  const addFeature = () => {
    if (featureKey.trim() && featureValue.trim()) {
      setFormData({
        ...formData,
        features: {
          ...formData.features,
          [featureKey.trim()]: featureValue.trim(),
        },
      });
      setFeatureKey('');
      setFeatureValue('');
    }
  };

  const removeFeature = (key) => {
    const newFeatures = { ...formData.features };
    delete newFeatures[key];
    setFormData({ ...formData, features: newFeatures });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{plan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Plan Name *</label>
            <input
              type="text"
              value={formData.planName}
              onChange={(e) => setFormData({ ...formData, planName: e.target.value })}
              placeholder="e.g., Basic, Institutional, Enterprise"
              required
            />
          </div>
          <div className="form-group">
            <label>Audience *</label>
            <select
              value={formData.audience}
              onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
            >
              <option value="Organization">Organization (Org Admins only)</option>
              <option value="Student">Student (Individual students only)</option>
              <option value="Both">Both (visible in org and student flows)</option>
            </select>
            <p className="field-help">
              Controls where this plan is available: organization subscription flow, individual student flow, or both.
            </p>
          </div>
          <div className="form-group">
            <label>Enabled Test Modes</label>
            <div className="mode-toggle-grid">
              <label className="mode-toggle-item">
                <input
                  type="checkbox"
                  checked={!!formData.testModes?.isScheduledEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      testModes: { ...formData.testModes, isScheduledEnabled: e.target.checked },
                    })
                  }
                />
                <span>Scheduled (Organization)</span>
              </label>
              <label className="mode-toggle-item">
                <input
                  type="checkbox"
                  checked={!!formData.testModes?.isAdaptiveEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      testModes: { ...formData.testModes, isAdaptiveEnabled: e.target.checked },
                    })
                  }
                />
                <span>Adaptive (Future)</span>
              </label>
              <label className="mode-toggle-item">
                <input
                  type="checkbox"
                  checked={!!formData.testModes?.isSelfTestBuilderEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      testModes: { ...formData.testModes, isSelfTestBuilderEnabled: e.target.checked },
                    })
                  }
                />
                <span>Self-Test Builder (Student)</span>
              </label>
            </div>
            <p className="field-help">Choose which test nature(s) this subscription plan includes.</p>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Price *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label>Duration (Months) *</label>
              <input
                type="number"
                min="1"
                value={formData.durationMonths}
                onChange={(e) => setFormData({ ...formData, durationMonths: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Total Price (Base + Numeric Features)</label>
            <div className="total-price-display">
              ${computeTotalPrice().toFixed(2)}
            </div>
          </div>
          <div className="form-group">
            <label>Additional Features (Optional)</label>
            <div className="features-input">
              <input
                type="text"
                value={featureKey}
                onChange={(e) => setFeatureKey(e.target.value)}
                placeholder="Feature name"
              />
              <input
                type="text"
                value={featureValue}
                onChange={(e) => setFeatureValue(e.target.value)}
                placeholder="Feature value"
              />
              <button type="button" className="btn-secondary" onClick={addFeature}>
                Add
              </button>
            </div>
            {Object.keys(formData.features).length > 0 && (
              <div className="features-list">
                {Object.entries(formData.features).map(([key, value]) => (
                  <div key={key} className="feature-item">
                    <span>
                      <strong>{key}:</strong> {String(value)}
                    </span>
                    <button
                      type="button"
                      className="btn-icon btn-small"
                      onClick={() => removeFeature(key)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {plan ? 'Update' : 'Create'} Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Delete Confirmation Modal
const DeleteConfirmModal = ({ plan, onClose, onConfirm }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Subscription Plan</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p>
            Are you sure you want to delete the subscription plan <strong>{plan.PlanName}</strong>?
          </p>
          <p className="text-warning">
            This action cannot be undone. The plan cannot be deleted if it has active subscriptions.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// Link Exams Modal
const LinkExamsModal = ({ plan, onClose, onSuccess }) => {
  const [exams, setExams] = useState([]);
  const [linkedExams, setLinkedExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [editingExamLink, setEditingExamLink] = useState(null);
  const [linkData, setLinkData] = useState({
    examId: '',
    isMandatory: false,
    maxStudents: '',
    maxTests: '',
    maxQuestionsPerTest: '',
    maxTestsPerDay: '',
    aiSupport: false,
  });

  useEffect(() => {
    loadExams();
    loadLinkedExams();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadExams = async () => {
    try {
      const response = await adminAPI.getExams();
      setExams(response.exams || []);
    } catch (err) {
      console.error('Failed to load exams:', err);
      setError(err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  const loadLinkedExams = async () => {
    try {
      setError('');
      const response = await adminAPI.getPlanExams(plan.PlanID);
      console.log('Linked exams response:', response);
      const exams = response.exams || [];
      console.log('Linked exams count:', exams.length);
      setLinkedExams(exams);
    } catch (err) {
      console.error('Failed to load linked exams:', err);
      setError(err.message || 'Failed to load linked exams');
    }
  };

  const handleLinkExam = async (e) => {
    e.preventDefault();
    if (!linkData.examId) {
      setError('Please select an exam');
      return;
    }

    try {
      setError('');
      await adminAPI.linkExamToPlan(plan.PlanID, linkData);
      setSuccess('Exam linked successfully');
      setShowLinkForm(false);
      setLinkData({
        examId: '',
        isMandatory: false,
        maxStudents: '',
        maxTests: '',
        maxQuestionsPerTest: '',
        maxTestsPerDay: '',
        aiSupport: false,
      });
      await loadLinkedExams();
    } catch (err) {
      console.error('Failed to link exam:', err);
      setError(err.message || 'Failed to link exam');
    }
  };

  const handleUpdateLink = async (examId, updateData) => {
    try {
      setError('');
      await adminAPI.updatePlanExam(plan.PlanID, examId, updateData);
      setSuccess('Exam limits updated successfully');
      await loadLinkedExams();
    } catch (err) {
      console.error('Failed to update exam link:', err);
      setError(err.message || 'Failed to update exam link');
    }
  };

  const handleUnlinkExam = async (examId) => {
    if (!window.confirm('Are you sure you want to unlink this exam from the plan?')) {
      return;
    }

    try {
      setError('');
      await adminAPI.unlinkExamFromPlan(plan.PlanID, examId);
      setSuccess('Exam unlinked successfully');
      await loadLinkedExams();
    } catch (err) {
      console.error('Failed to unlink exam:', err);
      setError(err.message || 'Failed to unlink exam');
    }
  };

  const linkedExamIds = new Set(linkedExams.map((e) => e.ExamID));
  const availableExams = exams.filter((e) => !linkedExamIds.has(e.ExamID));

  /** Individual student plans: org-style "max students per exam" does not apply */
  const isStudentOnlyPlan = (plan?.Audience ?? 'Organization') === 'Student';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-extra-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Link Exams to Plan: {plan.PlanName}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="link-exams-header">
            <button
              className="btn-primary"
              onClick={() => setShowLinkForm(!showLinkForm)}
            >
              <Link2 size={18} />
              {showLinkForm ? 'Cancel' : 'Link New Exam'}
            </button>
          </div>

          {showLinkForm && (
            <form onSubmit={handleLinkExam} className="link-exam-form">
              <div className="form-group">
                <label>Select Exam *</label>
                <select
                  value={linkData.examId}
                  onChange={(e) => setLinkData({ ...linkData, examId: e.target.value })}
                  required
                >
                  <option value="">Choose an exam...</option>
                  {availableExams.map((exam) => (
                    <option key={exam.ExamID} value={exam.ExamID}>
                      {exam.ExamName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={linkData.isMandatory}
                      onChange={(e) => setLinkData({ ...linkData, isMandatory: e.target.checked })}
                    />
                    Is Mandatory
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={linkData.aiSupport}
                      onChange={(e) => setLinkData({ ...linkData, aiSupport: e.target.checked })}
                    />
                    AI Support Enabled
                  </label>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Max Students</label>
                  <input
                    type="number"
                    min="0"
                    value={isStudentOnlyPlan ? '' : linkData.maxStudents}
                    onChange={(e) => setLinkData({ ...linkData, maxStudents: e.target.value })}
                    placeholder={isStudentOnlyPlan ? 'N/A — individual plan' : 'Unlimited if empty'}
                    disabled={isStudentOnlyPlan}
                    title={
                      isStudentOnlyPlan
                        ? 'Not used for individual (Student) subscription plans'
                        : undefined
                    }
                  />
                  {isStudentOnlyPlan && (
                    <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                      Individual plans use one account per subscriber; this limit is disabled.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Max Tests</label>
                  <input
                    type="number"
                    min="0"
                    value={linkData.maxTests}
                    onChange={(e) => setLinkData({ ...linkData, maxTests: e.target.value })}
                    placeholder="Unlimited if empty"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Max Questions Per Test</label>
                  <input
                    type="number"
                    min="0"
                    value={linkData.maxQuestionsPerTest}
                    onChange={(e) => setLinkData({ ...linkData, maxQuestionsPerTest: e.target.value })}
                    placeholder="Unlimited if empty"
                  />
                </div>
                <div className="form-group">
                  <label>Max Tests Per Day</label>
                  <input
                    type="number"
                    min="0"
                    value={linkData.maxTestsPerDay}
                    onChange={(e) => setLinkData({ ...linkData, maxTestsPerDay: e.target.value })}
                    placeholder="Unlimited if empty"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowLinkForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Link Exam
                </button>
              </div>
            </form>
          )}

          <div className="linked-exams-list">
            <h3>
              <Link2 size={18} />
              Linked Exams ({linkedExams.length})
            </h3>
            {linkedExams.length === 0 ? (
              <div className="empty-linked-exams">
                <p className="text-muted">No exams linked to this plan yet</p>
                <p className="text-muted-small">Click "Link New Exam" above to add exams to this plan</p>
              </div>
            ) : (
              <>
                {/* Table View for better overview */}
                <div className="linked-exams-table-container">
                  <table className="linked-exams-table">
                    <thead>
                      <tr>
                        <th>Exam Name</th>
                        <th>Mandatory</th>
                        <th>AI Support</th>
                        {!isStudentOnlyPlan && <th>Max Students</th>}
                        <th>Max Tests</th>
                        <th>Max Q/Test</th>
                        <th>Max Tests/Day</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedExams.map((link) => (
                        <tr key={link.ExamID}>
                          <td>
                            <strong>{link.ExamName || 'Unknown Exam'}</strong>
                          </td>
                          <td>
                            {link.IsMandatory ? (
                              <span className="badge badge-warning">Yes</span>
                            ) : (
                              <span className="text-muted">No</span>
                            )}
                          </td>
                          <td>
                            {link.AISupport ? (
                              <span className="badge badge-info">Yes</span>
                            ) : (
                              <span className="text-muted">No</span>
                            )}
                          </td>
                          {!isStudentOnlyPlan && <td>{link.MaxStudents ?? '∞'}</td>}
                          <td>{link.MaxTests || '∞'}</td>
                          <td>{link.MaxQuestionsPerTest || '∞'}</td>
                          <td>{link.MaxTestsPerDay || '∞'}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="btn-icon btn-small"
                                onClick={() => setEditingExamLink(link)}
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                className="btn-icon btn-small btn-danger"
                                onClick={() => handleUnlinkExam(link.ExamID)}
                                title="Unlink"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {/* Edit Exam Link Modal */}
      {editingExamLink && (
        <EditExamLinkModal
          plan={plan}
          link={editingExamLink}
          onClose={() => setEditingExamLink(null)}
          onSave={(updateData) => {
            handleUpdateLink(editingExamLink.ExamID, updateData);
            setEditingExamLink(null);
          }}
        />
      )}
    </div>
  );
};

// Edit Exam Link Modal Component
const EditExamLinkModal = ({ plan, link, onClose, onSave }) => {
  const isStudentOnlyPlan = (plan?.Audience ?? 'Organization') === 'Student';

  const [updateData, setUpdateData] = useState({
    isMandatory: link.IsMandatory || false,
    maxStudents: isStudentOnlyPlan ? '' : link.MaxStudents || '',
    maxTests: link.MaxTests || '',
    maxQuestionsPerTest: link.MaxQuestionsPerTest || '',
    maxTestsPerDay: link.MaxTestsPerDay || '',
    aiSupport: link.AISupport || false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = isStudentOnlyPlan ? { ...updateData, maxStudents: '' } : updateData;
    onSave(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Exam Limits: {link.ExamName || 'Unknown Exam'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={updateData.isMandatory}
                  onChange={(e) => setUpdateData({ ...updateData, isMandatory: e.target.checked })}
                />
                Is Mandatory
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={updateData.aiSupport}
                  onChange={(e) => setUpdateData({ ...updateData, aiSupport: e.target.checked })}
                />
                AI Support Enabled
              </label>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Max Students</label>
                <input
                  type="number"
                  min="0"
                  value={isStudentOnlyPlan ? '' : updateData.maxStudents}
                  onChange={(e) => setUpdateData({ ...updateData, maxStudents: e.target.value })}
                  placeholder={isStudentOnlyPlan ? 'N/A — individual plan' : 'Unlimited if empty'}
                  disabled={isStudentOnlyPlan}
                  title={
                    isStudentOnlyPlan
                      ? 'Not used for individual (Student) subscription plans'
                      : undefined
                  }
                />
                {isStudentOnlyPlan && (
                  <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                    Not applicable for Student audience plans.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label>Max Tests</label>
                <input
                  type="number"
                  min="0"
                  value={updateData.maxTests}
                  onChange={(e) => setUpdateData({ ...updateData, maxTests: e.target.value })}
                  placeholder="Unlimited if empty"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Max Questions Per Test</label>
                <input
                  type="number"
                  min="0"
                  value={updateData.maxQuestionsPerTest}
                  onChange={(e) => setUpdateData({ ...updateData, maxQuestionsPerTest: e.target.value })}
                  placeholder="Unlimited if empty"
                />
              </div>
              <div className="form-group">
                <label>Max Tests Per Day</label>
                <input
                  type="number"
                  min="0"
                  value={updateData.maxTestsPerDay}
                  onChange={(e) => setUpdateData({ ...updateData, maxTestsPerDay: e.target.value })}
                  placeholder="Unlimited if empty"
                />
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Linked Exam Card Component (kept for potential future use)
const LinkedExamCard = ({ link, onUpdate, onUnlink }) => {
  const [editing, setEditing] = useState(false);
  const [updateData, setUpdateData] = useState({
    isMandatory: link.IsMandatory || false,
    maxStudents: link.MaxStudents || '',
    maxTests: link.MaxTests || '',
    maxQuestionsPerTest: link.MaxQuestionsPerTest || '',
    maxTestsPerDay: link.MaxTestsPerDay || '',
    aiSupport: link.AISupport || false,
  });

  const handleSave = () => {
    onUpdate(link.ExamID, updateData);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="linked-exam-card editing">
        <h4>{link.ExamName || 'Unknown Exam'}</h4>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={updateData.isMandatory}
              onChange={(e) => setUpdateData({ ...updateData, isMandatory: e.target.checked })}
            />
            Is Mandatory
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={updateData.aiSupport}
              onChange={(e) => setUpdateData({ ...updateData, aiSupport: e.target.checked })}
            />
            AI Support
          </label>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Max Students</label>
            <input
              type="number"
              min="0"
              value={updateData.maxStudents}
              onChange={(e) => setUpdateData({ ...updateData, maxStudents: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Max Tests</label>
            <input
              type="number"
              min="0"
              value={updateData.maxTests}
              onChange={(e) => setUpdateData({ ...updateData, maxTests: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Max Questions/Test</label>
            <input
              type="number"
              min="0"
              value={updateData.maxQuestionsPerTest}
              onChange={(e) => setUpdateData({ ...updateData, maxQuestionsPerTest: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Max Tests/Day</label>
            <input
              type="number"
              min="0"
              value={updateData.maxTestsPerDay}
              onChange={(e) => setUpdateData({ ...updateData, maxTestsPerDay: e.target.value })}
            />
          </div>
        </div>
        <div className="card-actions">
          <button className="btn-secondary btn-small" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="btn-primary btn-small" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="linked-exam-card" data-exam-id={link.ExamID}>
      <div className="card-header">
        <h4>{link.ExamName || 'Unknown Exam'}</h4>
      </div>
      <div className="card-content">
        <div className="exam-limits">
          {link.IsMandatory && <span className="badge badge-warning">Mandatory</span>}
          {link.AISupport && <span className="badge badge-info">AI Support</span>}
          <div className="limit-item">
            <strong>Max Students:</strong> {link.MaxStudents || 'Unlimited'}
          </div>
          <div className="limit-item">
            <strong>Max Tests:</strong> {link.MaxTests || 'Unlimited'}
          </div>
          <div className="limit-item">
            <strong>Max Questions/Test:</strong> {link.MaxQuestionsPerTest || 'Unlimited'}
          </div>
          <div className="limit-item">
            <strong>Max Tests/Day:</strong> {link.MaxTestsPerDay || 'Unlimited'}
          </div>
        </div>
      </div>
      <div className="card-actions">
        <button className="btn-icon btn-small" onClick={() => setEditing(true)} title="Edit">
          <Edit2 size={16} />
        </button>
        <button className="btn-icon btn-small btn-danger" onClick={() => onUnlink(link.ExamID)} title="Unlink">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

// Manage View Component (plan cards — Overview tab)
const ManageView = ({ plans, planExamCounts, onShowCreateModal, onEditPlan, onDeletePlan, onToggleStatus }) => {
  const audienceKey = (audience) => {
    if (audience === 'Student') return 'student';
    if (audience === 'Both') return 'both';
    return 'org';
  };

  return (
    <div className="plans-grid">
      {plans.length === 0 ? (
        <div className="empty-state">
          <Package size={48} className="empty-icon" />
          <h3>No subscription plans</h3>
          <p>Create your first subscription plan to get started</p>
          <button className="btn-primary" onClick={onShowCreateModal} style={{ marginTop: '1rem' }}>
            <Plus size={20} />
            Create Plan
          </button>
        </div>
      ) : (
        plans.map((plan) => {
          const inactive = plan.Status === 'Inactive';
          const audience = audienceKey(plan.Audience);
          const examCount = planExamCounts[plan.PlanID];
          const featureEntries = plan.Features ? Object.entries(plan.Features) : [];

          return (
            <article
              key={plan.PlanID}
              className={`plan-card plan-card--${audience} ${inactive ? 'plan-card--inactive' : ''}`}
            >
              <div className="plan-card-top">
                <div className="plan-card-top-meta">
                  <span
                    className={`plan-status-pill ${inactive ? 'plan-status-pill--inactive' : 'plan-status-pill--active'}`}
                  >
                    <span className="plan-status-dot" />
                    {inactive ? 'Inactive' : 'Active'}
                  </span>
                  {examCount !== undefined && (
                    <span className="plan-exam-pill">
                      <Link2 size={13} aria-hidden />
                      {examCount} {examCount === 1 ? 'exam' : 'exams'}
                    </span>
                  )}
                </div>
                <div className="plan-actions" role="toolbar" aria-label={`Actions for ${plan.PlanName}`}>
                  <button
                    type="button"
                    className="plan-action-btn"
                    onClick={() => onToggleStatus(plan)}
                    title={
                      inactive
                        ? 'Set Active (show to orgs for new subscriptions)'
                        : 'Set Inactive (hide from new subscriptions)'
                    }
                    aria-label={inactive ? 'Set plan Active' : 'Set plan Inactive'}
                  >
                    {inactive ? (
                      <ToggleLeft size={17} className="plan-toggle enable" />
                    ) : (
                      <ToggleRight size={17} className="plan-toggle disable" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="plan-action-btn"
                    onClick={() => onEditPlan(plan)}
                    title="Edit Plan"
                    aria-label="Edit plan"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="plan-action-btn plan-action-btn--danger"
                    onClick={() => onDeletePlan(plan)}
                    title="Delete Plan"
                    aria-label="Delete plan"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3 className="plan-card-name">{plan.PlanName}</h3>

              <span className={`plan-audience-badge plan-audience-${audience}`}>
                {plan.Audience === 'Student'
                  ? 'Individual students'
                  : plan.Audience === 'Both'
                    ? 'Orgs & students'
                    : 'Organizations'}
              </span>

              <div className="plan-card-pricing">
                <div className="plan-price-block">
                  <span className="plan-price-label">Price</span>
                  <span className="plan-price-value">
                    <DollarSign size={18} aria-hidden />
                    {plan.Price?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="plan-duration-block">
                  <Calendar size={15} aria-hidden />
                  <span>
                    {plan.DurationMonths} {plan.DurationMonths === 1 ? 'month' : 'months'}
                  </span>
                </div>
              </div>

              <div className="plan-mode-row">
                {plan?.testModes?.isScheduledEnabled && (
                  <span className="mode-chip mode-chip--scheduled">Scheduled</span>
                )}
                {plan?.testModes?.isAdaptiveEnabled && (
                  <span className="mode-chip mode-chip--adaptive">Adaptive</span>
                )}
                {plan?.testModes?.isSelfTestBuilderEnabled && (
                  <span className="mode-chip mode-chip--selftest">Self-Test</span>
                )}
                {!plan?.testModes?.isScheduledEnabled &&
                  !plan?.testModes?.isAdaptiveEnabled &&
                  !plan?.testModes?.isSelfTestBuilderEnabled && (
                    <span className="mode-chip mode-chip--off">No delivery mode</span>
                  )}
              </div>

              {featureEntries.length > 0 && (
                <div className="plan-features">
                  <span className="plan-features-label">Plan features</span>
                  <ul className="plan-feature-tags">
                    {featureEntries.map(([key, value]) => (
                      <li key={key} className="plan-feature-tag">
                        <span className="plan-feature-tag-key">{key}</span>
                        <span className="plan-feature-tag-val">{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })
      )}
    </div>
  );
};

// Overview View Component
const OverviewView = ({ plans, planDetails, filters, onFiltersChange, onManagePlan }) => {
  return (
    <div className="overview-container">
      {/* Filters Section */}
      <div className="filters-section">
        <div className="filters-header">
          <div className="filters-header-left">
            <Filter size={20} />
            <h3>Filters</h3>
          </div>
          <button
            className="btn-secondary"
            onClick={() => onFiltersChange({ search: '', minPrice: '', maxPrice: '', minDuration: '', maxDuration: '' })}
          >
            Clear Filters
          </button>
        </div>
        <div className="filters-grid">
          <div className="filter-group">
            <label>
              <Search size={16} />
              Search
            </label>
            <input
              type="text"
              placeholder="Search by plan name or exam..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Min Price</label>
            <input
              type="number"
              placeholder="0"
              value={filters.minPrice}
              onChange={(e) => onFiltersChange({ ...filters, minPrice: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Max Price</label>
            <input
              type="number"
              placeholder="999999"
              value={filters.maxPrice}
              onChange={(e) => onFiltersChange({ ...filters, maxPrice: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Min Duration (Months)</label>
            <input
              type="number"
              placeholder="1"
              value={filters.minDuration}
              onChange={(e) => onFiltersChange({ ...filters, minDuration: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <label>Max Duration (Months)</label>
            <input
              type="number"
              placeholder="12"
              value={filters.maxDuration}
              onChange={(e) => onFiltersChange({ ...filters, maxDuration: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Overview Table */}
      <div className="overview-table-container">
        <div className="table-header">
          <h3>Subscription Plans Overview ({plans.length})</h3>
        </div>
        {plans.length === 0 ? (
          <div className="empty-state">
            <Package size={48} className="empty-icon" />
            <h3>No plans found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overview-table-wrapper">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Status</th>
                  <th>Audience</th>
                  <th>Test Modes</th>
                  <th>Price</th>
                  <th>Duration</th>
                  <th>Linked Exams</th>
                  <th>Exam Details</th>
                  <th>Features</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const detail = planDetails[plan.PlanID];
                  const exams = detail?.exams || [];
                  const planStatus = plan.Status || 'Active';
                  return (
                    <tr key={plan.PlanID} className={planStatus === 'Inactive' ? 'row-disabled' : ''}>
                      <td>
                        <strong>{plan.PlanName}</strong>
                      </td>
                      <td>
                        <span className={`plan-status-badge plan-status-${planStatus.toLowerCase()}`}>
                          {planStatus === 'Inactive' ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <span className="plan-audience-label">
                          {plan.Audience === 'Student'
                            ? 'Students'
                            : plan.Audience === 'Both'
                            ? 'Orgs & Students'
                            : 'Organizations'}
                        </span>
                      </td>
                      <td>
                        <div className="mode-cell">
                          <span className={`mode-chip ${plan?.testModes?.isScheduledEnabled ? 'on' : 'off'}`}>S</span>
                          <span className={`mode-chip ${plan?.testModes?.isAdaptiveEnabled ? 'on' : 'off'}`}>A</span>
                          <span className={`mode-chip ${plan?.testModes?.isSelfTestBuilderEnabled ? 'on' : 'off'}`}>ST</span>
                        </div>
                      </td>
                      <td>
                        <span className="plan-price-cell">
                          <DollarSign size={14} />
                          {plan.Price?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td>
                        <span className="plan-duration-cell">
                          <Calendar size={14} />
                          {plan.DurationMonths} {plan.DurationMonths === 1 ? 'month' : 'months'}
                        </span>
                      </td>
                      <td>
                        <span className="exam-count-badge-table">
                          {exams.length} {exams.length === 1 ? 'exam' : 'exams'}
                        </span>
                      </td>
                      <td>
                        {exams.length > 0 ? (
                          <div className="exam-details-cell">
                            {exams.slice(0, 2).map((exam, idx) => (
                              <div key={idx} className="exam-item">
                                <span className="exam-name">{exam.ExamName}</span>
                                {exam.IsMandatory && <span className="badge badge-warning badge-small">M</span>}
                                {exam.AISupport && <span className="badge badge-info badge-small">AI</span>}
                              </div>
                            ))}
                            {exams.length > 2 && (
                              <div className="exam-item-more">+{exams.length - 2} more</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">No exams</span>
                        )}
                      </td>
                      <td>
                        {plan.Features && Object.keys(plan.Features).length > 0 ? (
                          <div className="features-cell">
                            {Object.keys(plan.Features).slice(0, 2).map((key) => (
                              <span key={key} className="feature-tag">
                                {key}
                              </span>
                            ))}
                            {Object.keys(plan.Features).length > 2 && (
                              <span className="feature-tag-more">+{Object.keys(plan.Features).length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-link-exams btn-small"
                          onClick={() => onManagePlan(plan)}
                          title="Manage Exams"
                        >
                          <Link2 size={14} />
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPlans;
