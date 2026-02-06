import { useState, useEffect } from 'react';
import { Send, AlertCircle, Users, GraduationCap, CheckCircle2 } from 'lucide-react';
import { userManagement, notificationAPI } from '../../services/api';
import './CreateNotification.css';

const CreateNotification = () => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    notificationType: 'System',
    targetType: 'single',
    entityID: '',
    targetRole: '',
  });
  const [roleScope, setRoleScope] = useState('all'); // 'all' | 'specific' (for orgRole)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [orgUsers, setOrgUsers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (formData.targetType === 'single' || formData.targetType === 'orgRole') {
      loadOrgUsers();
    }
  }, [formData.targetType]);

  const loadOrgUsers = async () => {
    setLoadingOptions(true);
    try {
      const response = await userManagement.listUsers();
      setOrgUsers(response.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Failed to load users');
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Reset entityID when targetType changes
      if (field === 'targetType') {
        updated.entityID = '';
      }
      return updated;
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        ...formData,
      };

      // If sending by role but specific user, switch to single target
      if (formData.targetType === 'orgRole' && roleScope === 'specific') {
        if (!formData.entityID) {
          setError('Please select a user for this role.');
          setLoading(false);
          return;
        }
        payload.targetType = 'single';
      }

      // If targetType is single and a role is chosen, include it (backend ignores but keeps intent)
      const response = await notificationAPI.createOrgNotification(payload);
      setSuccess(`Successfully created ${response.notificationsCreated} notification(s)!`);
      
      // Reset form
      setFormData({
        title: '',
        message: '',
        notificationType: 'System',
        targetType: 'single',
        entityID: '',
        targetRole: '',
      });
      setRoleScope('all');

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message || 'Failed to create notification');
    } finally {
      setLoading(false);
    }
  };

  const getTargetTypeLabel = (type) => {
    switch (type) {
      case 'single':
        return 'Single User';
      case 'organization':
      case 'allOrgUsers':
        return 'All Users in Organization';
      case 'allStudents':
        return 'All Students in Organization';
      default:
        return type;
    }
  };

  const getTargetTypeDescription = (type) => {
    switch (type) {
      case 'single':
        return 'Send to a specific user in your organization';
      case 'organization':
      case 'allOrgUsers':
        return 'Send to all users (OrgAdmin, Reviewer, Subject Expert) in your organization';
      case 'allStudents':
        return 'Send to all students in your organization';
      case 'orgRole':
        return 'Send to users in your organization by role (Reviewer / Subject Expert)';
      default:
        return '';
    }
  };

  const filteredUsers =
    formData.targetRole && orgUsers.length > 0
      ? orgUsers.filter((u) => u.Role === formData.targetRole)
      : orgUsers;

  return (
    <div className="create-notification-page">
      <div className="page-header">
        <h1>Create Notification</h1>
        <p className="page-subtitle">Send notifications to users or students in your organization</p>
      </div>

      {error && (
        <div className="notice error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="notice success">
          <CheckCircle2 size={20} />
          <span>{success}</span>
        </div>
      )}

      <form className="create-notification-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2 className="section-title">Notification Details</h2>

          <div className="form-grid">
            <label className="form-group full-width">
              <span>Title *</span>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Notification title"
                required
                maxLength={200}
              />
              <small>{formData.title.length}/200 characters</small>
            </label>

            <label className="form-group full-width">
              <span>Message *</span>
              <textarea
                value={formData.message}
                onChange={(e) => handleChange('message', e.target.value)}
                placeholder="Notification message"
                required
                rows={5}
                maxLength={1000}
              />
              <small>{formData.message.length}/1000 characters</small>
            </label>

            <label className="form-group">
              <span>Notification Type *</span>
              <select
                value={formData.notificationType}
                onChange={(e) => handleChange('notificationType', e.target.value)}
                required
              >
                <option value="System">System</option>
                <option value="Payment">Payment</option>
                <option value="Exam">Exam</option>
                <option value="Result">Result</option>
                <option value="Reminder">Reminder</option>
                <option value="Alert">Alert</option>
              </select>
            </label>

            <label className="form-group">
              <span>Target Audience *</span>
              <select
                value={formData.targetType}
                onChange={(e) => {
                  handleChange('targetType', e.target.value);
                  setRoleScope('all');
                }}
                required
              >
                <option value="single">Single User</option>
                <option value="organization">All Users in Organization</option>
                <option value="allStudents">All Students in Organization</option>
                <option value="orgRole">By Role (Reviewer / Subject Expert)</option>
              </select>
              <small className="target-description">{getTargetTypeDescription(formData.targetType)}</small>
            </label>
          </div>

          {/* Role selection (for single and orgRole) */}
          {(formData.targetType === 'single' || formData.targetType === 'orgRole') && (
            <label className="form-group">
              <span>Select Role *</span>
              <select
                value={formData.targetRole}
                onChange={(e) => {
                  handleChange('targetRole', e.target.value);
                  // reset user when role changes
                  handleChange('entityID', '');
                }}
                required
              >
                <option value="">Select role</option>
                <option value="Reviewer">Reviewer</option>
                <option value="Subject Expert">Subject Expert</option>
                <option value="OrgAdmin">OrgAdmin</option>
              </select>
            </label>
          )}

          {/* Role scope for orgRole */}
          {formData.targetType === 'orgRole' && (
            <div className="form-group">
              <span>Send To *</span>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="roleScope"
                    value="all"
                    checked={roleScope === 'all'}
                    onChange={() => {
                      setRoleScope('all');
                      handleChange('entityID', '');
                    }}
                  />
                  All users with this role
                </label>
                <label>
                  <input
                    type="radio"
                    name="roleScope"
                    value="specific"
                    checked={roleScope === 'specific'}
                    onChange={() => setRoleScope('specific')}
                  />
                  Specific user with this role
                </label>
              </div>
            </div>
          )}

          {/* Entity Selection */}
          {((formData.targetType === 'single') ||
            (formData.targetType === 'orgRole' && roleScope === 'specific')) && (
            <label className="form-group full-width">
              <span>Select User *</span>
              {loadingOptions ? (
                <div className="loading-select">Loading users...</div>
              ) : (
                <select
                  value={formData.entityID}
                  onChange={(e) => handleChange('entityID', e.target.value)}
                  required
                >
                  <option value="">Select a user</option>
                  {filteredUsers.map((user) => (
                    <option key={user.OrgUserID} value={user.OrgUserID}>
                      {user.FullName} ({user.Email}) - {user.Role}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Role Selection for orgRole */}
          {formData.targetType === 'orgRole' && (
            <label className="form-group">
              <span>Role scope</span>
              <small className="target-description">
                Choose all users with this role or a specific user of that role.
              </small>
            </label>
          )}

          {/* Info Box */}
          <div className="info-box">
            <div className="info-icon">
              <Users size={20} />
            </div>
            <div className="info-content">
              <strong>Target: {getTargetTypeLabel(formData.targetType)}</strong>
              <p>{getTargetTypeDescription(formData.targetType)}</p>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            <Send size={20} />
            {loading ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateNotification;

