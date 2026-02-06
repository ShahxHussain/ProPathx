import { useState } from 'react';
import { Shield } from 'lucide-react';
import './AdminLoginForm.css';

const AdminLoginForm = ({ onSuccess, onError }) => {
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
      const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token
      if (data.token) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      onSuccess(data);
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <Shield size={32} className="admin-icon" />
          <h1>Super Admin</h1>
          <p className="admin-subtitle">System Administration Portal</p>
        </div>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            <span>Email *</span>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="admin@propath.com"
              required
              autoComplete="username"
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
              autoComplete="current-password"
            />
          </label>

          {error && <div className="notice error">{error}</div>}

          <button type="submit" className="btn-admin-login" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="admin-login-footer">
          <p>Restricted Access • Authorized Personnel Only</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginForm;





