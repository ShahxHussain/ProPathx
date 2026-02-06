import { useEffect, useState } from 'react';
import { Plus, Search, UserPlus } from 'lucide-react';
import { userManagement } from '../../services/api';
import './Users.css';

const CreateUserModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'Reviewer',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-dismiss error messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await userManagement.createUser(formData);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New User</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            <span>Full Name *</span>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
            />
          </label>

          <label>
            <span>Email *</span>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </label>

          <label>
            <span>Password *</span>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              minLength={8}
              required
            />
            <small>Minimum 8 characters</small>
          </label>

          <label>
            <span>Phone</span>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </label>

          <label>
            <span>Role *</span>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
            >
              <option value="Reviewer">Reviewer</option>
              <option value="Subject Expert">Subject Expert</option>
            </select>
          </label>

          {error && <div className="notice error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await userManagement.listUsers();
      setUsers(response.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.FullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.Email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'OrgAdmin':
        return 'blue';
      case 'Reviewer':
        return 'green';
      case 'Subject Expert':
        return 'purple';
      default:
        return 'gray';
    }
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-subtitle">Manage your organization users</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          <span>Add User</span>
        </button>
      </div>

      <div className="users-filters">
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

      {loading ? (
        <div className="loading-state">Loading users...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state">
          <UserPlus size={48} />
          <h3>No users found</h3>
          <p>Get started by adding your first user</p>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            <span>Add User</span>
          </button>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.OrgUserID}>
                  <td>
                    <div className="user-name-cell">
                      <div className="user-avatar">
                        {user.FullName?.charAt(0) || 'U'}
                      </div>
                      {user.FullName || 'N/A'}
                    </div>
                  </td>
                  <td>{user.Email || 'N/A'}</td>
                  <td>
                    <span className={`role-badge role-badge-${getRoleBadgeColor(user.Role)}`}>
                      {user.Role || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${user.Status?.toLowerCase()}`}>
                      {user.Status || 'N/A'}
                    </span>
                  </td>
                  <td>
                    {user.CreatedAt
                      ? new Date(user.CreatedAt).toLocaleDateString()
                      : 'N/A'}
                  </td>
                  <td>
                    {user.LastLogin
                      ? new Date(user.LastLogin).toLocaleDateString()
                      : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
};

export default Users;

