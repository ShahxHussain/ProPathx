import { useEffect, useState } from 'react';
import {
  Users as UsersIcon,
  Mail,
  Phone,
  Calendar,
  CheckCircle,
  XCircle,
  Search,
  Shield,
  Building2,
  Filter,
  Edit,
  Trash2,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Users.css';

const AdminUsers = () => {
  const [platformUsers, setPlatformUsers] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [userTypeFilter, setUserTypeFilter] = useState('all'); // 'all', 'platform', 'org'
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await adminAPI.getUsers();
      setPlatformUsers(response.platformUsers || []);
      setOrgUsers(response.orgUsers || []);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Get unique roles for filtering
  const platformRoles = [...new Set(platformUsers.map((u) => u.Role).filter(Boolean))];
  const orgRoles = [...new Set(orgUsers.map((u) => u.Role).filter(Boolean))];
  const allRoles = [...new Set([...platformRoles, ...orgRoles])];

  const filterUsers = (users, isPlatform = false) => {
    return users.filter((user) => {
      // Search filter
      const matchesSearch =
        searchTerm === '' ||
        (user.FullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.Email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.Phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (isPlatform ? false : (user.OrgName || '').toLowerCase().includes(searchTerm.toLowerCase()));

      // Role filter
      const matchesRole = selectedRole === 'all' || user.Role === selectedRole;

      return matchesSearch && matchesRole;
    });
  };

  const filteredPlatformUsers = userTypeFilter === 'all' || userTypeFilter === 'platform' 
    ? filterUsers(platformUsers, true) 
    : [];
  const filteredOrgUsers = userTypeFilter === 'all' || userTypeFilter === 'org' 
    ? filterUsers(orgUsers, false) 
    : [];

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const getStatusBadge = (status) => {
    const isActive = status === 'Active';
    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
        <span>{status || 'Unknown'}</span>
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const roleColors = {
      SuperAdmin: 'purple',
      Admin: 'blue',
      Reviewer: 'green',
      'Subject Expert': 'orange',
      AI: 'gray',
      Support: 'cyan',
      OrgAdmin: 'indigo',
    };

    const color = roleColors[role] || 'gray';
    return (
      <span className={`role-badge role-${color}`}>
        <span>{role || 'Unknown'}</span>
      </span>
    );
  };

  const handleEdit = (user, isPlatform = false) => {
    setEditingUser({ ...user, isPlatform });
    setEditFormData({
      fullName: user.FullName || '',
      email: user.Email || '',
      phone: user.Phone || '',
      role: user.Role || '',
      status: user.Status || 'Active',
      password: '', // Don't pre-fill password
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setError('');

    try {
      const userData = { ...editFormData };
      // Remove password if empty
      if (!userData.password) {
        delete userData.password;
      }

      if (editingUser.isPlatform) {
        await adminAPI.updatePlatformUser(editingUser.UserID, userData);
      } else {
        await adminAPI.updateOrgUser(editingUser.OrgUserID, userData);
      }

      setEditingUser(null);
      setEditFormData({});
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;

    setDeleteLoading(true);
    setError('');

    try {
      if (deletingUser.isPlatform) {
        await adminAPI.deletePlatformUser(deletingUser.UserID);
      } else {
        await adminAPI.deleteOrgUser(deletingUser.OrgUserID);
      }

      setDeletingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-subtitle">Manage all platform and organization users</p>
        </div>
        <div className="header-actions">
          <div className="filter-group">
            <select
              className="filter-select"
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
            >
              <option value="all">All Users</option>
              <option value="platform">Platform Users</option>
              <option value="org">Organization Users</option>
            </select>
            <select
              className="filter-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="all">All Roles</option>
              {allRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="notice error" style={{ marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading users...</div>
      ) : (
        <>
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-label">Platform Users</span>
              <span className="stat-value">{platformUsers.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Organization Users</span>
              <span className="stat-value">{orgUsers.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Active</span>
              <span className="stat-value active">
                {[...platformUsers, ...orgUsers].filter((u) => u.Status === 'Active').length}
              </span>
            </div>
          </div>

          {/* Platform Users Section */}
          {(userTypeFilter === 'all' || userTypeFilter === 'platform') && (
            <div className="users-section">
              <div className="section-header">
                <div className="section-title">
                  <Shield size={20} />
                  <h2>Platform Users</h2>
                  <span className="count-badge">{filteredPlatformUsers.length}</span>
                </div>
              </div>
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlatformUsers.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-state">
                          {searchTerm || selectedRole !== 'all'
                            ? 'No platform users found matching your filters'
                            : 'No platform users found'}
                        </td>
                      </tr>
                    ) : (
                      filteredPlatformUsers.map((user) => (
                        <tr key={user.UserID}>
                          <td>
                            <div className="user-name-cell">
                              <UsersIcon size={16} className="user-icon" />
                              <span className="user-name">{user.FullName || 'N/A'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="email-cell">
                              <Mail size={14} />
                              <span>{user.Email || 'N/A'}</span>
                            </div>
                          </td>
                          <td>{getRoleBadge(user.Role)}</td>
                          <td>
                            <div className="phone-cell">
                              <Phone size={14} />
                              <span>{user.Phone || 'N/A'}</span>
                            </div>
                          </td>
                          <td>{getStatusBadge(user.Status)}</td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(user.CreatedAt)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(user.LastLogin)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-icon btn-edit"
                                onClick={() => handleEdit(user, true)}
                                title="Edit user"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={() => setDeletingUser({ ...user, isPlatform: true })}
                                title="Delete user"
                                disabled={user.Role === 'SuperAdmin'}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Organization Users Section */}
          {(userTypeFilter === 'all' || userTypeFilter === 'org') && (
            <div className="users-section">
              <div className="section-header">
                <div className="section-title">
                  <Building2 size={20} />
                  <h2>Organization Users</h2>
                  <span className="count-badge">{filteredOrgUsers.length}</span>
                </div>
              </div>
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Organization</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrgUsers.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="empty-state">
                          {searchTerm || selectedRole !== 'all'
                            ? 'No organization users found matching your filters'
                            : 'No organization users found'}
                        </td>
                      </tr>
                    ) : (
                      filteredOrgUsers.map((user) => (
                        <tr key={user.OrgUserID}>
                          <td>
                            <div className="user-name-cell">
                              <UsersIcon size={16} className="user-icon" />
                              <span className="user-name">{user.FullName || 'N/A'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="email-cell">
                              <Mail size={14} />
                              <span>{user.Email || 'N/A'}</span>
                            </div>
                          </td>
                          <td>{getRoleBadge(user.Role)}</td>
                          <td>
                            <div className="org-cell">
                              <Building2 size={14} />
                              <span>{user.OrgName || 'N/A'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="phone-cell">
                              <Phone size={14} />
                              <span>{user.Phone || 'N/A'}</span>
                            </div>
                          </td>
                          <td>{getStatusBadge(user.Status)}</td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(user.CreatedAt)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <Calendar size={14} />
                              <span>{formatDate(user.LastLogin)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-icon btn-edit"
                                onClick={() => handleEdit(user, false)}
                                title="Edit user"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                className="btn-icon btn-delete"
                                onClick={() => setDeletingUser({ ...user, isPlatform: false })}
                                title="Delete user"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit User</h2>
              <button className="modal-close" onClick={() => setEditingUser(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-group">
                <label>
                  Full Name *
                  <input
                    type="text"
                    value={editFormData.fullName}
                    onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                    required
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Email *
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    required
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Phone
                  <input
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Role *
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    required
                    disabled={editLoading || editingUser.Role === 'SuperAdmin'}
                  >
                    <option value="Reviewer">Reviewer</option>
                    <option value="Subject Expert">Subject Expert</option>
                    {editingUser.Role === 'SuperAdmin' && <option value="SuperAdmin">SuperAdmin</option>}
                    {!editingUser.isPlatform && <option value="OrgAdmin">OrgAdmin</option>}
                  </select>
                </label>
              </div>
              <div className="form-group">
                <label>
                  Status *
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    required
                    disabled={editLoading}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </label>
              </div>
              <div className="form-group">
                <label>
                  New Password (leave blank to keep current)
                  <input
                    type="password"
                    value={editFormData.password}
                    onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                    placeholder="Enter new password (min 8 characters)"
                    minLength={8}
                    disabled={editLoading}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)} disabled={editLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={editLoading}>
                  {editLoading ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="modal-overlay" onClick={() => setDeletingUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete User</h2>
              <button className="modal-close" onClick={() => setDeletingUser(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete <strong>{deletingUser.FullName}</strong> ({deletingUser.Email})?
              </p>
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeletingUser(null)} disabled={deleteLoading}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;

