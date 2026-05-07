import { useState } from 'react';
import { studentAuth } from '../services/api';

const StudentLoginForm = ({ onSuccess, onSwitchToSignup }) => {
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
      console.log('Attempting student login with email:', formData.email);
      const response = await studentAuth.login(formData.email, formData.password);
      console.log('Student login response received:', response);
      onSuccess(response);
    } catch (err) {
      console.error('Student login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2>Student Sign In</h2>
      <p className="muted small" style={{ marginTop: '-8px', marginBottom: '16px' }}>
        Sign in with your registered email and password
      </p>

      <label>
        <span>Email *</span>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="student@example.com"
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
        {onSwitchToSignup ? (
          <>
            New here?{' '}
            <button type="button" className="link" onClick={onSwitchToSignup}>
              Create an account
            </button>
          </>
        ) : (
          'Contact your organization admin if you need access'
        )}
      </p>
    </form>
  );
};

export default StudentLoginForm;
