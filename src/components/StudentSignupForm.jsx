import { useState } from 'react';
import { studentAuth } from '../services/api';

const StudentSignupForm = ({ onSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
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
      await studentAuth.signup({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone.trim() || undefined,
      });
      onSuccess('Account created. Sign in with your email and password.');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Student Sign Up</h2>
      <p className="muted small" style={{ marginTop: '-8px', marginBottom: '16px' }}>
        Create a personal ProPath account for individual learning. If your organization enrolled you, your admin creates your account—use <strong>Sign In</strong> only.
      </p>

      <label>
        <span>Full name *</span>
        <input
          type="text"
          value={formData.fullName}
          onChange={(e) => handleChange('fullName', e.target.value)}
          placeholder="Your full name"
          required
        />
      </label>
      <label>
        <span>Email *</span>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="you@example.com"
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
          placeholder="Optional"
        />
      </label>

      {error && <div className="notice error">{error}</div>}

      <button type="submit" className="solid" disabled={loading}>
        {loading ? 'Creating account...' : 'Create account'}
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

export default StudentSignupForm;
