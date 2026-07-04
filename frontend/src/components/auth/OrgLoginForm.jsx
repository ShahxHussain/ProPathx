import { useState } from 'react';
import { orgAuth } from '../../services/api';

const OrgLoginForm = ({ onSuccess, onSwitchToSignup }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
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
      console.log('Attempting login with email:', formData.email);
      const response = await orgAuth.login(formData.email, formData.password);
      console.log('Login response received:', response);
      onSuccess(response);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Sign In</h2>
      <p className="muted small" style={{ marginTop: '-8px', marginBottom: '16px' }}>
        For Organization users, Reviewers, and Subject Experts
      </p>

      <label>
        <span>Email *</span>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="admin@org.com"
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
          required
        />
      </label>

      {error && <div className="notice error">{error}</div>}

      <button type="submit" className="solid" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="muted small" style={{ textAlign: 'center', marginTop: '16px' }}>
        Don't have an account?{' '}
        <button type="button" className="link" onClick={onSwitchToSignup}>
          Sign Up
        </button>
      </p>
    </form>
  );
};

export default OrgLoginForm;

