import { useState } from 'react';
import { orgAuth } from '../services/api';

const OrgSignupForm = ({ onSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    orgName: '',
    orgEmail: '',
    password: '',
    phone: '',
    address: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await orgAuth.signup(formData);
      onSuccess('Organization created successfully! You can now sign in.');
    } catch (err) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Organization Sign Up</h2>

      <label>
        <span>Organization Name *</span>
        <input
          type="text"
          value={formData.orgName}
          onChange={(e) => handleChange('orgName', e.target.value)}
          placeholder="ProPath Academy"
          required
        />
      </label>
      <label>
        <span>Organization Email *</span>
        <input
          type="email"
          value={formData.orgEmail}
          onChange={(e) => handleChange('orgEmail', e.target.value)}
          placeholder="contact@org.com"
          required
        />
      </label>
      <label>
        <span>Password *</span>
        <input
          type="password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          placeholder="••••••••"
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
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="+92 300 0000000"
        />
      </label>
      <label>
        <span>Address</span>
        <input
          type="text"
          value={formData.address}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="123 Main Street, City"
        />
      </label>

      {error && <div className="notice error">{error}</div>}

      <button type="submit" className="solid" disabled={loading}>
        {loading ? 'Creating...' : 'Create Organization'}
      </button>

      <p className="muted small" style={{ textAlign: 'center', marginTop: '16px' }}>
        Already have an account?{' '}
        <button type="button" className="link" onClick={onSwitchToLogin}>
          Sign In
        </button>
      </p>
    </form>
  );
};

export default OrgSignupForm;

