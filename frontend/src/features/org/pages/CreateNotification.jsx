import { useState, useEffect, useMemo } from 'react';
import {
  Send,
  AlertCircle,
  Users,
  GraduationCap,
  CheckCircle2,
  Bell,
  User,
  UserCheck,
  CreditCard,
  BookOpen,
  Trophy,
  Clock,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { userManagement, notificationAPI } from '../../../services/api';
import './CreateNotification.css';

const INITIAL_FORM = {
  title: '',
  message: '',
  notificationType: 'System',
  targetType: 'organization',
  entityID: '',
  targetRole: '',
};

const NOTIFICATION_TYPES = [
  { value: 'System', label: 'System', icon: Info, tone: 'system' },
  { value: 'Payment', label: 'Payment', icon: CreditCard, tone: 'payment' },
  { value: 'Exam', label: 'Exam', icon: BookOpen, tone: 'exam' },
  { value: 'Result', label: 'Result', icon: Trophy, tone: 'result' },
  { value: 'Reminder', label: 'Reminder', icon: Clock, tone: 'reminder' },
  { value: 'Alert', label: 'Alert', icon: AlertTriangle, tone: 'alert' },
];

const TARGET_OPTIONS = [
  {
    value: 'organization',
    label: 'All staff',
    description: 'Org admins, reviewers, and subject experts',
    icon: Users,
  },
  {
    value: 'allStudents',
    label: 'All students',
    description: 'Every enrolled student in your organization',
    icon: GraduationCap,
  },
  {
    value: 'orgRole',
    label: 'By role',
    description: 'All users with a role, or pick one person',
    icon: UserCheck,
  },
  {
    value: 'single',
    label: 'Single user',
    description: 'Send to one specific person',
    icon: User,
  },
];

const ROLE_OPTIONS = [
  { value: 'Reviewer', label: 'Reviewer' },
  { value: 'Subject Expert', label: 'Subject Expert' },
  { value: 'OrgAdmin', label: 'Org Admin' },
];

const TARGET_META = {
  single: { label: 'Single user', summary: 'One selected user will receive this notification.' },
  organization: { label: 'All staff', summary: 'All org users (admins, reviewers, experts) will be notified.' },
  allOrgUsers: { label: 'All staff', summary: 'All org users will be notified.' },
  allStudents: { label: 'All students', summary: 'Every student in your organization will be notified.' },
  orgRole: { label: 'By role', summary: 'Users matching the selected role will be notified.' },
};

const CreateNotification = () => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [roleScope, setRoleScope] = useState('all');
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

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(timer);
  }, [success]);

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

  const patchForm = (updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setError('');
    setSuccess('');
  };

  const handleTargetChange = (targetType) => {
    patchForm({ targetType, entityID: '', targetRole: '' });
    setRoleScope('all');
  };

  const buildPayload = () => {
    const payload = {
      title: formData.title.trim(),
      message: formData.message.trim(),
      notificationType: formData.notificationType,
      targetType: formData.targetType,
    };

    if (formData.targetType === 'orgRole' && roleScope === 'specific') {
      payload.targetType = 'single';
      if (formData.entityID) payload.entityID = formData.entityID;
    } else {
      if (formData.entityID) payload.entityID = formData.entityID;
      if (formData.targetRole) payload.targetRole = formData.targetRole;
    }

    return payload;
  };

  const formatSubmitError = (err) => {
    if (Array.isArray(err.details)) {
      return err.details.map((d) => d.msg || d.message).filter(Boolean).join('. ');
    }
    return err.message || 'Failed to create notification';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = buildPayload();

      if (formData.targetType === 'orgRole' && roleScope === 'specific') {
        if (!formData.entityID) {
          setError('Please select a user for this role.');
          setLoading(false);
          return;
        }
      }

      const response = await notificationAPI.createOrgNotification(payload);
      setSuccess(`Successfully sent ${response.notificationsCreated} notification(s).`);
      setFormData({ ...INITIAL_FORM });
      setRoleScope('all');
    } catch (err) {
      setError(formatSubmitError(err));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!formData.targetRole) return orgUsers;
    return orgUsers.filter((u) => u.Role === formData.targetRole);
  }, [orgUsers, formData.targetRole]);

  const selectedUser = orgUsers.find((u) => u.OrgUserID === formData.entityID);

  const audienceSummary = useMemo(() => {
    const meta = TARGET_META[formData.targetType] || TARGET_META.organization;
    if (formData.targetType === 'single' && selectedUser) {
      return `${selectedUser.FullName} (${selectedUser.Role})`;
    }
    if (formData.targetType === 'orgRole') {
      if (!formData.targetRole) return 'Select a role to define the audience';
      if (roleScope === 'specific' && selectedUser) {
        return `${selectedUser.FullName} — ${formData.targetRole}`;
      }
      return `All ${formData.targetRole} users`;
    }
    return meta.summary;
  }, [formData.targetType, formData.targetRole, roleScope, selectedUser]);

  const needsRole = formData.targetType === 'single' || formData.targetType === 'orgRole';
  const needsUserPicker =
    formData.targetType === 'single' ||
    (formData.targetType === 'orgRole' && roleScope === 'specific');

  const activeType = NOTIFICATION_TYPES.find((t) => t.value === formData.notificationType);
  const TypeIcon = activeType?.icon;

  return (
    <div className="org-notify">
      <p className="org-notify-lead">
        Send announcements, reminders, and alerts to staff or students in your organization.
      </p>

      {error && (
        <div className="org-notify-notice org-notify-notice--error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="org-notify-notice org-notify-notice--success" role="status">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <div className="org-notify-layout">
        <form className="org-notify-form" onSubmit={handleSubmit}>
          <section className="org-notify-panel">
            <h2 className="org-notify-panel__title">
              <Bell size={18} />
              Message
            </h2>

            <div className="org-notify-row org-notify-row--title-type">
              <label className="org-notify-field org-notify-field--title">
                <span>
                  Title <span className="org-notify-required">*</span>
                </span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => patchForm({ title: e.target.value })}
                  placeholder="e.g. Exam schedule update"
                  required
                  maxLength={200}
                />
                <small>{formData.title.length}/200 characters</small>
              </label>

              <div className="org-notify-field org-notify-field--types">
                <span>
                  Type <span className="org-notify-required">*</span>
                </span>
                <div className="org-notify-type-grid" role="radiogroup" aria-label="Notification type">
                  {NOTIFICATION_TYPES.map(({ value, label, icon: Icon, tone }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={formData.notificationType === value}
                      className={`org-notify-type org-notify-type--${tone}${
                        formData.notificationType === value ? ' is-active' : ''
                      }`}
                      onClick={() => patchForm({ notificationType: value })}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="org-notify-field">
              <span>
                Message <span className="org-notify-required">*</span>
              </span>
              <textarea
                value={formData.message}
                onChange={(e) => patchForm({ message: e.target.value })}
                placeholder="Write the notification body…"
                required
                rows={4}
                maxLength={1000}
              />
              <small>{formData.message.length}/1000 characters</small>
            </label>
          </section>

          <section className="org-notify-panel">
            <h2 className="org-notify-panel__title">
              <Users size={18} />
              Audience
            </h2>

            <div className="org-notify-audience-grid">
              {TARGET_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`org-notify-audience${formData.targetType === value ? ' is-active' : ''}`}
                  onClick={() => handleTargetChange(value)}
                >
                  <span className="org-notify-audience__icon">
                    <Icon size={18} />
                  </span>
                  <span className="org-notify-audience__text">
                    <span className="org-notify-audience__label">{label}</span>
                    <span className="org-notify-audience__desc">{description}</span>
                  </span>
                </button>
              ))}
            </div>

            {needsRole && (
              <label className="org-notify-field org-notify-field--half">
                <span>
                  Role <span className="org-notify-required">*</span>
                </span>
                <select
                  value={formData.targetRole}
                  onChange={(e) => patchForm({ targetRole: e.target.value, entityID: '' })}
                  required
                >
                  <option value="">Select role</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {formData.targetType === 'orgRole' && (
              <div className="org-notify-field">
                <span>
                  Send to <span className="org-notify-required">*</span>
                </span>
                <div className="org-notify-scope">
                  <label className={`org-notify-scope__opt${roleScope === 'all' ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="roleScope"
                      value="all"
                      checked={roleScope === 'all'}
                      onChange={() => {
                        setRoleScope('all');
                        patchForm({ entityID: '' });
                      }}
                    />
                    All users with this role
                  </label>
                  <label className={`org-notify-scope__opt${roleScope === 'specific' ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="roleScope"
                      value="specific"
                      checked={roleScope === 'specific'}
                      onChange={() => setRoleScope('specific')}
                    />
                    One specific user
                  </label>
                </div>
              </div>
            )}

            {needsUserPicker && (
              <label className="org-notify-field">
                <span>
                  User <span className="org-notify-required">*</span>
                </span>
                {loadingOptions ? (
                  <div className="org-notify-loading-select">Loading users…</div>
                ) : (
                  <select
                    value={formData.entityID}
                    onChange={(e) => patchForm({ entityID: e.target.value })}
                    required
                  >
                    <option value="">Select a user</option>
                    {filteredUsers.map((user) => (
                      <option key={user.OrgUserID} value={user.OrgUserID}>
                        {user.FullName} — {user.Email} ({user.Role})
                      </option>
                    ))}
                  </select>
                )}
                {formData.targetRole && filteredUsers.length === 0 && !loadingOptions && (
                  <small className="org-notify-hint-warn">No users found for this role.</small>
                )}
              </label>
            )}
          </section>

          <div className="org-notify-actions">
            <button type="submit" className="org-notify-btn org-notify-btn--primary" disabled={loading}>
              <Send size={18} />
              {loading ? 'Sending…' : 'Send notification'}
            </button>
          </div>
        </form>

        <aside className="org-notify-aside">
          <div className="org-notify-preview-card">
            <p className="org-notify-preview-card__label">Live preview</p>
            <article className="org-notify-preview">
              <div className="org-notify-preview__head">
                <span className={`org-notify-preview__type org-notify-preview__type--${activeType?.tone || 'system'}`}>
                  {TypeIcon && <TypeIcon size={12} />}
                  {formData.notificationType}
                </span>
                <time className="org-notify-preview__time">Just now</time>
              </div>
              <h3 className="org-notify-preview__title">
                {formData.title.trim() || 'Notification title'}
              </h3>
              <p className="org-notify-preview__body">
                {formData.message.trim() ||
                  'Your message will appear here. Recipients will see this in their notification bell.'}
              </p>
            </article>
          </div>

          <div className="org-notify-summary">
            <h3>Delivery summary</h3>
            <dl>
              <div>
                <dt>Audience</dt>
                <dd>{TARGET_META[formData.targetType]?.label || '—'}</dd>
              </div>
              <div>
                <dt>Recipients</dt>
                <dd>{audienceSummary}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{formData.notificationType}</dd>
              </div>
            </dl>
            <p className="org-notify-summary__tip">
              Notifications appear instantly in each user&apos;s bell icon and notifications page.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CreateNotification;
