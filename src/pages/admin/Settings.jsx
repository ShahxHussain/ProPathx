import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import './Settings.css';

const AVAILABLE_ROLES = ['SuperAdmin', 'OrgAdmin', 'Reviewer', 'Subject Expert', 'Student', 'Support', 'Admin'];

const MaintenanceSettingsCard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState({
    enabled: false,
    scope: 'all',
    message: '',
    expectedResumeAt: '',
    allowRoles: ['SuperAdmin'],
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await adminAPI.getMaintenanceSettings();
        setSettings({
          enabled: !!res.settings?.enabled,
          scope: res.settings?.scope || 'all',
          message: res.settings?.message || '',
          expectedResumeAt: res.settings?.expectedResumeAt || '',
          allowRoles: res.settings?.allowRoles || ['SuperAdmin'],
        });
      } catch (err) {
        console.error('Failed to load maintenance settings:', err);
        setError(err.message || 'Failed to load maintenance settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const toggleRole = (role) => {
    setSettings((prev) => {
      const set = new Set(prev.allowRoles || []);
      if (set.has(role)) {
        set.delete(role);
      } else {
        set.add(role);
      }
      const arr = Array.from(set);
      return { ...prev, allowRoles: arr.length > 0 ? arr : ['SuperAdmin'] };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      await adminAPI.updateMaintenanceSettings(settings);
      setSuccess('Maintenance settings updated');
    } catch (err) {
      console.error('Failed to update maintenance settings:', err);
      setError(err.message || 'Failed to update maintenance settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div>
          <h2>Maintenance Mode</h2>
          <p>Temporarily put parts of the platform into maintenance with a clear message.</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          <span className="slider round" />
        </label>
      </div>

      {error && <div className="settings-alert error">{error}</div>}
      {success && <div className="settings-alert success">{success}</div>}

      {loading ? (
        <div className="settings-loading">Loading maintenance settings...</div>
      ) : (
        <>
          <div className="settings-grid">
            <div className="form-group">
              <label>Scope</label>
              <select
                value={settings.scope}
                onChange={(e) => setSettings({ ...settings, scope: e.target.value })}
              >
                <option value="all">Entire Platform</option>
                <option value="students">Student Portals Only</option>
                <option value="orgs">Organizations (Org Admin / Experts / Reviewers)</option>
                <option value="admins">Admin Tools Only</option>
              </select>
              <p className="field-help">
                Controls which areas are blocked when maintenance is enabled.
              </p>
            </div>
            <div className="form-group">
              <label>Expected Resume Time (optional)</label>
              <input
                type="datetime-local"
                value={settings.expectedResumeAt || ''}
                onChange={(e) => setSettings({ ...settings, expectedResumeAt: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Maintenance Message</label>
            <textarea
              rows={3}
              value={settings.message}
              onChange={(e) => setSettings({ ...settings, message: e.target.value })}
              placeholder="Describe what is happening and when the system will be back."
            />
          </div>

          <div className="form-group">
            <label>Roles Allowed During Maintenance</label>
            <div className="role-chips">
              {AVAILABLE_ROLES.map((role) => {
                const active = settings.allowRoles?.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    className={`role-chip ${active ? 'active' : ''}`}
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
            <p className="field-help">
              These roles can still access the affected areas even when maintenance is ON.
            </p>
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Maintenance Settings'}
            </button>
          </div>

          <div className="settings-summary">
            <h3>Current Maintenance Configuration</h3>
            <table className="settings-summary-table">
              <tbody>
                <tr>
                  <th>Enabled</th>
                  <td>{settings.enabled ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Scope</th>
                  <td>
                    {settings.scope === 'all'
                      ? 'Entire Platform'
                      : settings.scope === 'students'
                      ? 'Student Portals'
                      : settings.scope === 'orgs'
                      ? 'Organizations'
                      : 'Admin Tools'}
                  </td>
                </tr>
                <tr>
                  <th>Allowed Roles</th>
                  <td>{(settings.allowRoles || []).join(', ') || 'SuperAdmin'}</td>
                </tr>
                <tr>
                  <th>Expected Resume</th>
                  <td>{settings.expectedResumeAt || 'Not set'}</td>
                </tr>
                <tr>
                  <th>Message Preview</th>
                  <td>{settings.message || 'No message set'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const AnnouncementsSettingsCard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [editing, setEditing] = useState(null);

  const emptyForm = {
    title: '',
    message: '',
    link: '',
    targetRoles: [],
    startsAt: '',
    endsAt: '',
    isActive: true,
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getAnnouncements();
      setAnnouncements(res.announcements || []);
    } catch (err) {
      console.error('Failed to load announcements:', err);
      setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const toggleRole = (role) => {
    setForm((prev) => {
      const set = new Set(prev.targetRoles || []);
      if (set.has(role)) {
        set.delete(role);
      } else {
        set.add(role);
      }
      return { ...prev, targetRoles: Array.from(set) };
    });
  };

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const startEdit = (announcement) => {
    setEditing(announcement);
    setForm({
      title: announcement.Title,
      message: announcement.Message,
      link: announcement.Link || '',
      targetRoles: announcement.TargetRoles || [],
      startsAt: announcement.StartsAt || '',
      endsAt: announcement.EndsAt || '',
      isActive: announcement.IsActive,
    });
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setError('Title and message are required.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      if (editing) {
        await adminAPI.updateAnnouncement(editing.AnnouncementID, form);
        setSuccess('Announcement updated');
      } else {
        await adminAPI.createAnnouncement(form);
        setSuccess('Announcement created');
      }
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (err) {
      console.error('Failed to save announcement:', err);
      setError(err.message || 'Failed to save announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (announcement) => {
    if (!window.confirm(`Delete announcement "${announcement.Title}"?`)) return;
    try {
      setSaving(true);
      setError('');
      await adminAPI.deleteAnnouncement(announcement.AnnouncementID);
      setSuccess('Announcement deleted');
      await load();
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      setError(err.message || 'Failed to delete announcement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div>
          <h2>Global Announcements</h2>
          <p>Create time-bound banners targeted to specific roles.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={startCreate}>
          {editing ? 'New Announcement' : 'Create Announcement'}
        </button>
      </div>

      {error && <div className="settings-alert error">{error}</div>}
      {success && <div className="settings-alert success">{success}</div>}

      <div className="settings-grid two-column">
        <div className="form-column">
          <h3>{editing ? 'Edit Announcement' : 'New Announcement'}</h3>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Short headline"
            />
          </div>
          <div className="form-group">
            <label>Message *</label>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="What do you want users to see?"
            />
          </div>
          <div className="form-group">
            <label>Link (optional)</label>
            <input
              type="text"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="settings-grid">
            <div className="form-group">
              <label>Starts At</label>
              <input
                type="datetime-local"
                value={form.startsAt || ''}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Ends At</label>
              <input
                type="datetime-local"
                value={form.endsAt || ''}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Target Roles (empty = everyone)</label>
            <div className="role-chips">
              {AVAILABLE_ROLES.map((role) => {
                const active = form.targetRoles?.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    className={`role-chip ${active ? 'active' : ''}`}
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />{' '}
              Active
            </label>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : editing ? 'Update Announcement' : 'Create Announcement'}
            </button>
          </div>
        </div>

        <div className="list-column">
          <div className="announcements-list-header">
            <h3>Existing Announcements</h3>
          </div>
          {loading ? (
            <div className="settings-loading">Loading announcements...</div>
          ) : announcements.length === 0 ? (
            <div className="empty-state small">No announcements configured.</div>
          ) : (
            <ul className="announcements-list">
              {announcements.map((a) => (
                <li key={a.AnnouncementID} className={`announcement-item ${a.IsActive ? 'active' : 'inactive'}`}>
                  <div className="announcement-main">
                    <div className="announcement-title-row">
                      <span className="announcement-title">{a.Title}</span>
                      <span className={`announcement-badge ${a.IsActive ? 'active' : 'inactive'}`}>
                        {a.IsActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="announcement-message">{a.Message}</div>
                    <div className="announcement-meta">
                      {a.TargetRoles && a.TargetRoles.length > 0 ? (
                        <span className="announcement-roles">
                          Roles: {a.TargetRoles.join(', ')}
                        </span>
                      ) : (
                        <span className="announcement-roles">Roles: All</span>
                      )}
                      {(a.StartsAt || a.EndsAt) && (
                        <span className="announcement-dates">
                          {a.StartsAt && <span>From: {new Date(a.StartsAt).toLocaleString()}</span>}
                          {a.EndsAt && <span> · Until: {new Date(a.EndsAt).toLocaleString()}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="announcement-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-danger btn-small"
                      onClick={() => handleDelete(a)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminSettings = () => {
  const [activeSection, setActiveSection] = useState('maintenance');

  return (
    <div className="admin-settings-page">
      <div className="page-header">
        <div>
          <h1>Platform Settings</h1>
          <p className="page-subtitle">
            Configure global platform behavior: maintenance windows and system-wide announcements.
          </p>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="settings-nav">
          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'maintenance' ? 'active' : ''}`}
            onClick={() => setActiveSection('maintenance')}
          >
            Maintenance
          </button>
          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveSection('announcements')}
          >
            Global Announcements
          </button>
        </aside>
        <section className="settings-content">
          {activeSection === 'maintenance' && <MaintenanceSettingsCard />}
          {activeSection === 'announcements' && <AnnouncementsSettingsCard />}
        </section>
      </div>
    </div>
  );
};

export default AdminSettings;

