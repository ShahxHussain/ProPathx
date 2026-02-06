import { useState } from 'react';
import { Building2, User, Mail, Lock, Phone, MapPin, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminAPI } from '../../services/api';
import './CreateOrganization.css';

const CreateOrganization = () => {
  const [formData, setFormData] = useState({
    // Organization fields
    orgName: '',
    orgEmail: '', // This email is used for both organization and OrgAdmin
    phone: '',
    address: '',
    status: 'Active',
    // Admin user fields
    adminFullName: '',
    adminPassword: '',
    adminRole: 'OrgAdmin',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await adminAPI.createOrganization(formData);
      setSuccess('Organization created successfully!');
      
      // Reset form
      setFormData({
        orgName: '',
        orgEmail: '',
        phone: '',
        address: '',
        status: 'Active',
        adminFullName: '',
        adminPassword: '',
        adminRole: 'OrgAdmin',
      });

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-organization-page">
      <div className="page-header">
        <h1>Create Organization</h1>
        <p className="page-subtitle">Create a new organization (OrgAdmin email = Organization email)</p>
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

      <form className="create-org-form" onSubmit={handleSubmit}>
        {/* Organization Information Section */}
        <div className="form-section">
          <h2 className="section-title">
            <Building2 size={20} />
            Organization Information
          </h2>

          <div className="form-grid">
            <label className="form-group">
              <span>Organization Name *</span>
              <input
                type="text"
                value={formData.orgName}
                onChange={(e) => handleChange('orgName', e.target.value)}
                placeholder="ProPath Academy"
                required
              />
            </label>

            <label className="form-group">
              <span>Organization Email *</span>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  value={formData.orgEmail}
                  onChange={(e) => handleChange('orgEmail', e.target.value)}
                  placeholder="contact@org.com"
                  required
                />
              </div>
            </label>

            <label className="form-group">
              <span>Phone</span>
              <div className="input-with-icon">
                <Phone size={18} />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+92 300 0000000"
                />
              </div>
            </label>

            <label className="form-group">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            </label>
          </div>

          <label className="form-group full-width">
            <span>Address</span>
            <div className="input-with-icon">
              <MapPin size={18} />
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="123 Main Street, City, Country"
              />
            </div>
          </label>
        </div>

        {/* Admin User Information Section */}
        <div className="form-section">
          <h2 className="section-title">
            <User size={20} />
            Admin User Account
          </h2>
          <p className="section-note">
            The organization email will be used as the admin login email (OrgAdmin = Organization)
          </p>

          <div className="form-grid">
            <label className="form-group">
              <span>Admin Full Name *</span>
              <input
                type="text"
                value={formData.adminFullName}
                onChange={(e) => handleChange('adminFullName', e.target.value)}
                placeholder="John Doe"
                required
              />
            </label>

            <label className="form-group">
              <span>Admin Password *</span>
              <div className="input-with-icon">
                <Lock size={18} />
                <input
                  type="password"
                  value={formData.adminPassword}
                  onChange={(e) => handleChange('adminPassword', e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
              <small>Minimum 8 characters</small>
            </label>

            <label className="form-group">
              <span>Admin Role</span>
              <select
                value={formData.adminRole}
                onChange={(e) => handleChange('adminRole', e.target.value)}
                disabled
              >
                <option value="OrgAdmin">OrgAdmin</option>
              </select>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            <Save size={20} />
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOrganization;

