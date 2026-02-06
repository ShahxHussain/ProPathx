import { useState, useEffect } from 'react';
import { UserPlus, Shield, CheckCircle, XCircle } from 'lucide-react';
import { adminAPI } from '../../services/api';
import './CreatePlatformUser.css';

const CreatePlatformUser = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'Reviewer',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const response = await adminAPI.createPlatformUser(formData);
      setCreatedUser(response.user);
      setSuccess(true);
      // Reset form
      setFormData({
        fullName: '',
        email: '',
        password: '',
        phone: '',
        role: 'Reviewer',
      });
    } catch (err) {
      setError(err.message || 'Failed to create platform user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-platform-user-page">
      <div className="page-header">
        <div className="header-icon">
          <Shield size={32} />
        </div>
        <div>
          <h1>Create Platform User</h1>
          <p className="page-subtitle">
            Create global Reviewer or Subject Expert accounts that work at the platform level
          </p>
        </div>
      </div>

      <div className="create-user-card">
        <div className="card-header">
          <UserPlus size={24} />
          <h2>New Platform User</h2>
        </div>

        {success && createdUser && (
          <div className="notice success">
            <CheckCircle size={20} />
            <div>
              <strong>Platform user created successfully!</strong>
              <div className="success-details">
                <span>Name: {createdUser.fullName}</span>
                <span>Email: {createdUser.email}</span>
                <span>Role: {createdUser.role}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="notice error">
            <XCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <form className="create-user-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Full Name *</span>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Enter full name"
                required
                disabled={loading}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Email *</span>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                required
                disabled={loading}
              />
              <small>Must be unique across all users (platform and organization)</small>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Password *</span>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                minLength={8}
                required
                disabled={loading}
              />
              <small>Minimum 8 characters</small>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Phone</span>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+92 300 0000000"
                disabled={loading}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Role *</span>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
                disabled={loading}
              >
                <option value="Reviewer">Reviewer</option>
                <option value="Subject Expert">Subject Expert</option>
              </select>
              <small>Platform-level role (not organization-specific)</small>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Platform User'}
            </button>
          </div>
        </form>

        <div className="info-box">
          <h3>Platform Users vs Organization Users</h3>
          <ul>
            <li>
              <strong>Platform Users</strong> (created here) work globally across all organizations
            </li>
            <li>
              <strong>Organization Users</strong> are created by OrgAdmins and work only within their organization
            </li>
            <li>Platform users have access to system-wide resources and can review content from any organization</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CreatePlatformUser;

