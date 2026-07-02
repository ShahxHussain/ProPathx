import { useState, useEffect } from 'react';
import { Send, AlertCircle, Globe, CheckCircle2 } from 'lucide-react';
import { adminAPI, notificationAPI } from '../../services/api';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [platformUsers, setPlatformUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.targetType]);

  const loadOptions = async () => {
    if (
      formData.targetType === 'organization' ||
      formData.targetType === 'allOrgUsers' ||
      formData.targetType === 'allStudents' ||
      formData.targetType === 'orgRole'
    ) {
      setLoadingOptions(true);
      try {
        const response = await adminAPI.getOrganizations();
        setOrganizations(response.organizations || []);
      } catch (err) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoadingOptions(false);
      }
    } else if (formData.targetType === 'single') {
      setLoadingOptions(true);
      try {
        const usersResponse = await adminAPI.getUsers();
        setPlatformUsers(usersResponse.platformUsers || []);
        setAllUsers([
          ...(usersResponse.platformUsers || []).map((u) => ({ ...u, type: 'Platform', name: u.FullName })),
          ...(usersResponse.orgUsers || []).map((u) => ({ ...u, type: 'Organization', name: u.FullName })),
        ]);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoadingOptions(false);
      }
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
      const response = await notificationAPI.createNotification(formData);
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
        return 'Single User/Student';
      case 'organization':
      case 'allOrgUsers':
        return 'All Users in Organization';
      case 'allStudents':
        return 'All Students in Organization';
      case 'allPlatformUsers':
        return 'All Platform Users';
      case 'allOrganizations':
        return 'All Organizations';
      default:
        return type;
    }
  };

  const getTargetTypeDescription = (type) => {
    switch (type) {
      case 'single':
        return 'Send to a specific user or student';
      case 'organization':
      case 'allOrgUsers':
        return 'Send to all users (OrgAdmin, Reviewer, Subject Expert) in an organization';
      case 'allStudents':
        return 'Send to all students in an organization';
      case 'allPlatformUsers':
        return 'Send to all platform-level users (SuperAdmin, Reviewer, Subject Expert)';
      case 'allOrganizations':
        return 'Send to all users in all organizations';
      case 'platformRole':
        return 'Send to platform users by role (Reviewer / Subject Expert)';
      case 'orgRole':
        return 'Send to users in an organization by role (Reviewer / Subject Expert)';
      default:
        return '';
    }
  };

  return (
    <div className="create-notification-page">
      <div className="page-header">
        <h1>Create Notification</h1>
        <p className="page-subtitle">Send notifications to users, organizations, or students</p>
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
                onChange={(e) => handleChange('targetType', e.target.value)}
                required
              >
                <option value="single">Single User/Student</option>
                <option value="organization">All Users in Organization</option>
                <option value="allStudents">All Students in Organization</option>
                <option value="allPlatformUsers">All Platform Users</option>
                <option value="allOrganizations">All Organizations</option>
                <option value="platformRole">Platform by Role (Reviewer/Expert)</option>
                <option value="orgRole">Organization by Role (Reviewer/Expert)</option>
              </select>
              <small className="target-description">{getTargetTypeDescription(formData.targetType)}</small>
            </label>
          </div>

          {/* Entity Selection */}
          {(formData.targetType === 'single' ||
            formData.targetType === 'organization' ||
            formData.targetType === 'allOrgUsers' ||
            formData.targetType === 'allStudents' ||
            formData.targetType === 'orgRole') && (
            <label className="form-group full-width">
              <span>
                {formData.targetType === 'single'
                  ? 'Select User or Student *'
                  : 'Select Organization *'}
              </span>
              {loadingOptions ? (
                <div className="loading-select">Loading options...</div>
              ) : formData.targetType === 'single' ? (
                <select
                  value={formData.entityID}
                  onChange={(e) => handleChange('entityID', e.target.value)}
                  required
                >
                  <option value="">Select a user or student</option>
                  <optgroup label="Platform Users">
                    {platformUsers.map((user) => (
                      <option key={user.UserID} value={user.UserID}>
                        {user.FullName} ({user.Email}) - {user.Role}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Organization Users">
                    {allUsers
                      .filter((u) => u.type === 'Organization')
                      .map((user) => (
                        <option key={user.OrgUserID} value={user.OrgUserID}>
                          {user.FullName} ({user.Email}) - {user.Role} - {user.OrgName || 'N/A'}
                        </option>
                      ))}
                  </optgroup>
                </select>
              ) : (
                <select
                  value={formData.entityID}
                  onChange={(e) => handleChange('entityID', e.target.value)}
                  required
                >
                  <option value="">Select an organization</option>
                  {organizations.map((org) => (
                    <option key={org.OrgID} value={org.OrgID}>
                      {org.OrgName} ({org.OrgEmail})
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Role Selection for role-based targets */}
          {(formData.targetType === 'platformRole' || formData.targetType === 'orgRole') && (
            <label className="form-group">
              <span>Select Role *</span>
              <select
                value={formData.targetRole}
                onChange={(e) => handleChange('targetRole', e.target.value)}
                required
              >
                <option value="">Select role</option>
                <option value="Reviewer">Reviewer</option>
                <option value="Subject Expert">Subject Expert</option>
              </select>
            </label>
          )}

          {/* Info Box */}
          <div className="info-box">
            <div className="info-icon">
              <Globe size={20} />
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

