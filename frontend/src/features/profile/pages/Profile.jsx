import { useState, useEffect, useCallback } from 'react';
import { profileAPI, syncStoredUser } from '../../../services/api';
import UserAvatar from '../../../components/UserAvatar';
import { Save, Lock, Loader2, Shield, Building2 } from 'lucide-react';
import './Profile.css';

function formatLastLogin(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function displayValue(value) {
  if (value === null || value === undefined) return '—';
  const s = String(value).trim();
  return s || '—';
}

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [editable, setEditable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    profileImageUrl: '',
    address: '',
    fatherName: '',
    gender: '',
    dateOfBirth: '',
  });

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const canEdit = (field) => editable.includes(field);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await profileAPI.getProfile();
      const p = res.profile;
      setProfile(p);
      setEditable(res.editable || []);
      setForm({
        fullName: p.fullName || '',
        phone: p.phone || '',
        profileImageUrl: p.profileImageUrl || '',
        address: p.address || '',
        fatherName: p.fatherName || '',
        gender: p.gender || '',
        dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {};
      if (canEdit('fullName')) payload.fullName = form.fullName;
      if (canEdit('phone')) payload.phone = form.phone || null;
      if (canEdit('profileImageUrl')) payload.profileImageUrl = form.profileImageUrl || null;
      if (canEdit('address')) payload.address = form.address || null;
      if (canEdit('fatherName')) payload.fatherName = form.fatherName || null;
      if (canEdit('gender')) payload.gender = form.gender || null;
      if (canEdit('dateOfBirth')) payload.dateOfBirth = form.dateOfBirth || null;

      const res = await profileAPI.updateProfile(payload);
      setProfile(res.profile);
      syncStoredUser(res.profile);
      setSuccess('Profile saved.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const extra =
        typeof err.details === 'string'
          ? err.details
          : err.details?.message || err.details?.error || null;
      setError(extra && extra !== err.message ? `${err.message} (${extra})` : err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (passwords.newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPwdError('Passwords do not match.');
      return;
    }
    setPwdSaving(true);
    try {
      await profileAPI.changePassword(passwords.currentPassword, passwords.newPassword);
      setPwdSuccess('Password updated.');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwdSuccess(''), 4000);
    } catch (err) {
      setPwdError(err.message || 'Failed to update password');
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <p className="profile-loading muted">Loading profile…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <div className="notice error">{error || 'Profile unavailable'}</div>
      </div>
    );
  }

  const isOrgAdmin = profile.isOrgAdmin || profile.role === 'OrgAdmin';
  const heroTitle = isOrgAdmin && profile.orgName ? profile.orgName : profile.fullName;
  const heroEmail = isOrgAdmin ? profile.displayEmail || profile.email : profile.email;

  return (
    <div className="profile-page">
      <div className="profile-hero sa-panel">
        <UserAvatar name={profile.fullName} imageUrl={profile.profileImageUrl} size="lg" />
        <div className="profile-hero__meta">
          <h1>{heroTitle}</h1>
          {isOrgAdmin && profile.orgName && (
            <p className="profile-hero__subtitle">{displayValue(profile.fullName)}</p>
          )}
          <p className="profile-hero__email">{heroEmail}</p>
          <div className="profile-hero__tags">
            {isOrgAdmin ? (
              <span className="profile-tag">Organization account</span>
            ) : (
              <span className="profile-tag">{profile.role}</span>
            )}
            {profile.status && <span className="profile-tag profile-tag--muted">{profile.status}</span>}
            {!isOrgAdmin && profile.orgName && (
              <span className="profile-tag profile-tag--muted">{profile.orgName}</span>
            )}
          </div>
        </div>
      </div>

      {isOrgAdmin && (
        <section className="profile-account sa-panel" aria-labelledby="profile-account-heading">
          <h2 id="profile-account-heading">
            <Building2 size={18} aria-hidden />
            Account details
          </h2>
          <p className="profile-card__lead">
            Your OrgAdmin login represents your organization. Contact details below are read-only.
          </p>
          <dl className="profile-details-grid">
            <div className="profile-details-item">
              <dt>Admin full name</dt>
              <dd>{displayValue(profile.fullName)}</dd>
            </div>
            <div className="profile-details-item">
              <dt>Organization</dt>
              <dd>{displayValue(profile.orgName)}</dd>
            </div>
            <div className="profile-details-item">
              <dt>Email</dt>
              <dd>{displayValue(profile.displayEmail || profile.email)}</dd>
            </div>
            <div className="profile-details-item">
              <dt>Phone</dt>
              <dd>{displayValue(profile.displayPhone || profile.phone)}</dd>
            </div>
            <div className="profile-details-item">
              <dt>Last login</dt>
              <dd>{formatLastLogin(profile.lastLogin)}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className="profile-grid">
        <form className="profile-card sa-panel" onSubmit={handleSaveProfile}>
          <h2>
            <Shield size={18} aria-hidden />
            Personal information
          </h2>
          <p className="profile-card__lead">
            {isOrgAdmin
              ? 'Update your admin name or phone. Organization email and role cannot be changed here.'
              : 'You can update contact details only. Email and role are managed by administrators.'}
          </p>

          {error && <div className="notice error">{error}</div>}
          {success && <div className="notice success">{success}</div>}

          {canEdit('fullName') && (
            <label className="profile-field">
              <span>{isOrgAdmin ? 'Admin full name' : 'Full name'} *</span>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                required
              />
            </label>
          )}

          {!isOrgAdmin && (
            <label className="profile-field profile-field--readonly">
              <span>Email</span>
              <input type="email" value={profile.email || ''} readOnly disabled />
            </label>
          )}

          {!isOrgAdmin && profile.lastLogin !== undefined && (
            <label className="profile-field profile-field--readonly">
              <span>Last login</span>
              <input type="text" value={formatLastLogin(profile.lastLogin)} readOnly disabled />
            </label>
          )}

          {canEdit('phone') && (
            <label className="profile-field">
              <span>Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Optional"
              />
            </label>
          )}

          {canEdit('profileImageUrl') && !isOrgAdmin && (
            <label className="profile-field">
              <span>Avatar image URL</span>
              <input
                type="url"
                value={form.profileImageUrl}
                onChange={(e) => handleChange('profileImageUrl', e.target.value)}
                placeholder="https://… (optional, HTTPS only)"
              />
              <span className="profile-field__hint">
                Direct image link only (https://…/photo.jpg). Bing/Google search URLs are converted
                automatically when possible; otherwise right-click the image → “Copy image address”.
              </span>
            </label>
          )}

          {canEdit('fatherName') && (
            <label className="profile-field">
              <span>Father name</span>
              <input
                type="text"
                value={form.fatherName}
                onChange={(e) => handleChange('fatherName', e.target.value)}
              />
            </label>
          )}

          {canEdit('gender') && (
            <label className="profile-field">
              <span>Gender</span>
              <select value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
          )}

          {canEdit('dateOfBirth') && (
            <label className="profile-field">
              <span>Date of birth</span>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => handleChange('dateOfBirth', e.target.value)}
              />
            </label>
          )}

          {canEdit('address') && (
            <label className="profile-field">
              <span>Address</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </label>
          )}

          <button type="submit" className="solid profile-save-btn" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="sa-spin" aria-hidden />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} aria-hidden />
                Save changes
              </>
            )}
          </button>
        </form>

        <form className="profile-card sa-panel" onSubmit={handleSavePassword}>
          <h2>
            <Lock size={18} aria-hidden />
            Password
          </h2>
          <p className="profile-card__lead">Choose a strong password you do not use elsewhere.</p>

          {pwdError && <div className="notice error">{pwdError}</div>}
          {pwdSuccess && <div className="notice success">{pwdSuccess}</div>}

          <label className="profile-field">
            <span>Current password *</span>
            <input
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="profile-field">
            <span>New password *</span>
            <input
              type="password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="profile-field">
            <span>Confirm new password *</span>
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <button type="submit" className="solid profile-save-btn" disabled={pwdSaving}>
            {pwdSaving ? (
              <>
                <Loader2 size={16} className="sa-spin" aria-hidden />
                Updating…
              </>
            ) : (
              'Update password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
