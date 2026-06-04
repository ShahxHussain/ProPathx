import { useState } from 'react';
import {
  UserPlus,
  Shield,
  AlertCircle,
  CheckCircle2,
  Mail,
  Lock,
  Phone,
  User,
  Loader2,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Dashboard.css';
import './CreateOrganization.css';
import './CreatePlatformUser.css';

const INITIAL = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  role: 'Reviewer',
};

function Field({ label, required, icon: Icon, hint, className = '', children }) {
  return (
    <label className={`sa-org-field ${className}`.trim()}>
      <span className="sa-org-field__label">
        {label}
        {required && <span className="sa-org-field__req">*</span>}
      </span>
      {Icon ? (
        <div className="sa-org-field__input-wrap">
          <Icon size={16} className="sa-org-field__icon" aria-hidden />
          {children}
        </div>
      ) : (
        children
      )}
      {hint && <span className="sa-org-field__hint">{hint}</span>}
    </label>
  );
}

const CreatePlatformUser = () => {
  const [formData, setFormData] = useState(INITIAL);
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
      await adminAPI.createPlatformUser(formData);
      setSuccess('Platform user created successfully.');
      setFormData(INITIAL);
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError(err.message || 'Failed to create platform user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard sa-dash sa-plat-create-page">
      <div className="sa-org-create-top">
        <h1 className="sa-org-create-title sa-plat-create-title">
          <Shield size={26} aria-hidden />
          Create platform user
        </h1>
        <p className="sa-org-create-subtitle">
          Global Reviewer or Subject Expert (org login page).
        </p>
      </div>

      {error && (
        <div className="sa-banner sa-banner--error sa-org-create-banner" role="alert">
          <AlertCircle size={18} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="sa-org-create-banner sa-org-create-banner--success" role="status">
          <CheckCircle2 size={18} aria-hidden />
          <span>{success}</span>
        </div>
      )}

      <form className="sa-panel sa-org-create-form" onSubmit={handleSubmit}>
        <section className="sa-org-create-section">
          <h2 className="sa-plat-section-title">User details</h2>
          <div className="sa-org-create-grid">
            <Field label="Full name" required icon={User}>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Full name"
                required
                disabled={loading}
                autoComplete="name"
              />
            </Field>

            <Field label="Email" required icon={Mail} hint="Must be unique.">
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@example.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </Field>

            <Field label="Phone" icon={Phone}>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Optional"
                disabled={loading}
                autoComplete="tel"
              />
            </Field>

            <Field label="Password" required icon={Lock} hint="Min. 8 characters.">
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="Password"
                minLength={8}
                required
                disabled={loading}
                autoComplete="new-password"
              />
            </Field>

            <Field label="Role" required>
              <select
                value={formData.role}
                onChange={(e) => handleChange('role', e.target.value)}
                required
                disabled={loading}
              >
                <option value="Reviewer">Reviewer</option>
                <option value="Subject Expert">Subject Expert</option>
              </select>
            </Field>
          </div>
        </section>

        <div className="sa-org-create-footer">
          <button type="submit" className="sa-org-create-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={18} className="sa-spin" aria-hidden />
                Creating…
              </>
            ) : (
              <>
                <UserPlus size={18} aria-hidden />
                Create platform user
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreatePlatformUser;
