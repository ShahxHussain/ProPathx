import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  UserPlus,
  Users as UsersIcon,
  X,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Shield,
  ClipboardCheck,
  GraduationCap,
} from 'lucide-react';
import { userManagement, orgAuth } from '../../../services/api';
import './OrgStudentExamEnrollments.css';
import './Students.css';
import './Users.css';

const FILTER_ALL = 'all';
const FILTER_REVIEWER = 'Reviewer';
const FILTER_EXPERT = 'Subject Expert';
const FILTER_ADMIN = 'OrgAdmin';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function roleMeta(role) {
  switch (role) {
    case 'OrgAdmin':
      return { slug: 'admin', Icon: Shield, label: 'Org Admin' };
    case 'Reviewer':
      return { slug: 'reviewer', Icon: ClipboardCheck, label: 'Reviewer' };
    case 'Subject Expert':
      return { slug: 'expert', Icon: GraduationCap, label: 'Subject Expert' };
    default:
      return { slug: 'default', Icon: UsersIcon, label: role || 'User' };
  }
}

function canManageUser(user, currentUserId) {
  if (!user) return false;
  if (user.Role === 'OrgAdmin') return false;
  if (String(user.OrgUserID) === String(currentUserId || '')) return false;
  return true;
}

const UserFormModal = ({ title, initial, onClose, onSubmit, submitLabel, loading }) => {
  const isEdit = !!initial?.OrgUserID;
  const [form, setForm] = useState({
    fullName: initial?.FullName || '',
    email: initial?.Email || '',
    password: '',
    phone: initial?.Phone || '',
    role: initial?.Role === 'Subject Expert' ? 'Subject Expert' : 'Reviewer',
    status: initial?.Status || 'Active',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      status: form.status,
    };

    if (!isEdit) {
      if (!form.password || form.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      payload.password = form.password;
    } else if (form.password.trim()) {
      if (form.password.length < 8) {
        setError('New password must be at least 8 characters');
        return;
      }
      payload.password = form.password.trim();
    }

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || 'Request failed');
    }
  };

  const modal = (
    <div className="org-users-modal-overlay" onClick={onClose}>
      <div className="org-users-modal" onClick={(e) => e.stopPropagation()}>
        <div className="org-users-modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form className="org-users-modal-form" onSubmit={handleSubmit}>
          <label className="org-users-field">
            <span>Full name *</span>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </label>
          <label className="org-users-field">
            <span>Email *</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="org-users-field">
            <span>{isEdit ? 'New password (optional)' : 'Password *'}</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={isEdit ? undefined : 8}
              required={!isEdit}
              autoComplete={isEdit ? 'new-password' : 'new-password'}
            />
            <small>{isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'}</small>
          </label>
          <label className="org-users-field">
            <span>Phone</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="org-users-field">
            <span>Role *</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              required
            >
              <option value="Reviewer">Reviewer</option>
              <option value="Subject Expert">Subject Expert</option>
            </select>
          </label>
          {isEdit && (
            <label className="org-users-field">
              <span>Status *</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            </label>
          )}
          {error && (
            <div className="notice error org-users-form-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div className="org-users-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

const DeleteUserModal = ({ user, onClose, onConfirm, loading }) => {
  const modal = (
    <div className="org-users-modal-overlay" onClick={onClose}>
      <div className="org-users-modal org-users-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="org-users-modal-header">
          <h2>Delete user</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="org-users-modal-body">
          <p>
            Permanently remove <strong>{user.FullName}</strong> ({user.Email})? This cannot be undone.
          </p>
        </div>
        <div className="org-users-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete user'}
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
};

const Users = () => {
  const currentUser = orgAuth.getCurrentUser();
  const currentUserId = currentUser?.userId ?? currentUser?.orgUserId ?? '';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState(FILTER_ALL);
  const [success, setSuccess] = useState('');
  const [listError, setListError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const t = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setListError('');
      const response = await userManagement.listUsers();
      setUsers(response.users || []);
    } catch (err) {
      setListError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const reviewers = users.filter((u) => u.Role === 'Reviewer').length;
    const experts = users.filter((u) => u.Role === 'Subject Expert').length;
    const admins = users.filter((u) => u.Role === 'OrgAdmin').length;
    const active = users.filter((u) => u.Status === 'Active').length;
    return { total: users.length, reviewers, experts, admins, active };
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (roleFilter !== FILTER_ALL) {
      list = list.filter((u) => u.Role === roleFilter);
    }
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(
      (u) =>
        u.FullName?.toLowerCase().includes(q) ||
        u.Email?.toLowerCase().includes(q) ||
        u.Role?.toLowerCase().includes(q)
    );
  }, [users, searchTerm, roleFilter]);

  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      await userManagement.createUser(payload);
      setShowCreate(false);
      setSuccess('User created successfully');
      await loadUsers();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (payload) => {
    setSaving(true);
    try {
      await userManagement.updateUser(editingUser.OrgUserID, payload);
      setEditingUser(null);
      setSuccess('User updated successfully');
      await loadUsers();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await userManagement.deleteUser(deletingUser.OrgUserID);
      setDeletingUser(null);
      setSuccess('User deleted successfully');
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="org-ex-enroll-page org-users-page">
        <div className="org-users-loading">
          <Loader2 size={22} className="spin-icon" aria-hidden />
          Loading users…
        </div>
      </div>
    );
  }

  return (
    <div className="org-ex-enroll-page org-users-page">
      <div className="page-header org-ex-enroll-header org-users-header">
        <div>
          <h1>
            <UsersIcon size={28} className="org-ex-enroll-title-icon" aria-hidden />
            Users
          </h1>
          <p className="page-subtitle">
            Manage reviewers and subject experts in your organization. Org admins are listed but cannot be
            edited here.
          </p>
        </div>
        <button type="button" className="btn-primary org-users-add-btn" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          Add user
        </button>
      </div>

      {listError && (
        <div className="org-ex-enroll-notice" role="alert">
          <div className="notice warn">
            <AlertCircle size={18} />
            <span>{listError}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="org-ex-enroll-notice" role="status">
          <div className="notice success org-users-success-notice">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        </div>
      )}

      <div className="org-users-stats">
        <div className="org-users-stat">
          <span className="org-users-stat-value">{counts.total}</span>
          <span className="org-users-stat-label">Total users</span>
        </div>
        <div className="org-users-stat org-users-stat--primary">
          <span className="org-users-stat-value">{counts.reviewers}</span>
          <span className="org-users-stat-label">Reviewers</span>
        </div>
        <div className="org-users-stat org-users-stat--expert">
          <span className="org-users-stat-value">{counts.experts}</span>
          <span className="org-users-stat-label">Subject experts</span>
        </div>
        <div className="org-users-stat">
          <span className="org-users-stat-value">{counts.admins}</span>
          <span className="org-users-stat-label">Org admins</span>
        </div>
        <div className="org-users-stat org-users-stat--ok">
          <span className="org-users-stat-value">{counts.active}</span>
          <span className="org-users-stat-label">Active</span>
        </div>
      </div>

      <div className="org-users-toolbar">
        <div className="org-ex-enroll-search org-users-search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            placeholder="Search by name, email, or role…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <div className="org-users-filters" role="group" aria-label="Filter by role">
          <button
            type="button"
            className={`org-users-filter ${roleFilter === FILTER_ALL ? 'active' : ''}`}
            onClick={() => setRoleFilter(FILTER_ALL)}
          >
            All
          </button>
          <button
            type="button"
            className={`org-users-filter ${roleFilter === FILTER_REVIEWER ? 'active' : ''}`}
            onClick={() => setRoleFilter(FILTER_REVIEWER)}
          >
            Reviewers
          </button>
          <button
            type="button"
            className={`org-users-filter ${roleFilter === FILTER_EXPERT ? 'active' : ''}`}
            onClick={() => setRoleFilter(FILTER_EXPERT)}
          >
            Experts
          </button>
          <button
            type="button"
            className={`org-users-filter ${roleFilter === FILTER_ADMIN ? 'active' : ''}`}
            onClick={() => setRoleFilter(FILTER_ADMIN)}
          >
            Admins
          </button>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="org-ex-enroll-panel org-users-empty">
          <UserPlus size={40} className="org-users-empty-icon" aria-hidden />
          <h3>{searchTerm || roleFilter !== FILTER_ALL ? 'No matching users' : 'No users yet'}</h3>
          <p className="org-ex-enroll-panel-hint">
            {searchTerm || roleFilter !== FILTER_ALL
              ? 'Try another search or filter.'
              : 'Add reviewers and subject experts to help run exams and content.'}
          </p>
          {!searchTerm && roleFilter === FILTER_ALL && (
            <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} />
              Add user
            </button>
          )}
        </div>
      ) : (
        <div className="students-table-container org-users-table-wrap">
          <table className="students-table org-users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last login</th>
                <th className="org-users-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const { slug, Icon, label } = roleMeta(user.Role);
                const manageable = canManageUser(user, currentUserId);
                const isSelf = String(user.OrgUserID) === String(currentUserId);

                return (
                  <tr key={user.OrgUserID} className={isSelf ? 'org-users-row--self' : ''}>
                    <td>
                      <div className="org-users-name-cell">
                        <div className="org-users-avatar">
                          {user.FullName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="org-users-name">{user.FullName || '—'}</span>
                          {isSelf && <span className="org-users-you-tag">You</span>}
                        </div>
                      </div>
                    </td>
                    <td className="org-users-email">{user.Email || '—'}</td>
                    <td>
                      <span className={`org-users-role org-users-role--${slug}`}>
                        <Icon size={12} />
                        {label}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`org-users-status org-users-status--${(user.Status || 'active').toLowerCase()}`}
                      >
                        {user.Status || '—'}
                      </span>
                    </td>
                    <td>{formatDate(user.CreatedAt)}</td>
                    <td>{user.LastLogin ? formatDate(user.LastLogin) : 'Never'}</td>
                    <td>
                      {manageable ? (
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn-icon-small"
                            onClick={() => setEditingUser(user)}
                            title="Edit user"
                            aria-label="Edit user"
                          >
                            <Edit size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn-icon-small btn-danger"
                            onClick={() => setDeletingUser(user)}
                            title="Delete user"
                            aria-label="Delete user"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </div>
                      ) : (
                        <span className="org-users-protected" title="Protected account">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="org-users-footnote">
        Showing {filteredUsers.length} of {users.length} users
        {roleFilter !== FILTER_ALL ? ` · ${roleFilter}` : ''}.
      </p>

      {showCreate && (
        <UserFormModal
          title="Add user"
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          submitLabel="Create user"
          loading={saving}
        />
      )}

      {editingUser && (
        <UserFormModal
          title="Edit user"
          initial={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={handleUpdate}
          submitLabel="Save changes"
          loading={saving}
        />
      )}

      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={handleDelete}
          loading={saving}
        />
      )}
    </div>
  );
};

export default Users;
