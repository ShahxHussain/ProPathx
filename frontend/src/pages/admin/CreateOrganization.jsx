import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Mail,
  Lock,
  Phone,
  MapPin,
  Save,
  AlertCircle,
  CheckCircle2,
  User,
  Loader2,
  Info,
  HelpCircle,
  X,
  CircleCheck,
  KeyRound,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import './Dashboard.css';
import './CreateOrganization.css';

const BEFORE_SUBMIT_TIPS = [
  {
    id: 'email',
    title: 'Unique organization email',
    teaser: 'Check email is new',
    icon: Mail,
    body: (
      <>
        The <strong>organization email</strong> must not already exist as an organization, OrgAdmin, or
        platform user. If it is taken, creation will fail with a duplicate error.
      </>
    ),
  },
  {
    id: 'login',
    title: 'OrgAdmin login',
    teaser: 'Same email for login',
    icon: User,
    body: (
      <>
        That same email becomes the <strong>OrgAdmin login</strong>. There is no separate admin email
        field—the org contact and admin username are one address.
      </>
    ),
  },
  {
    id: 'status',
    title: 'Start as Active',
    teaser: 'Use Active status',
    icon: CircleCheck,
    body: (
      <>
        Choose <strong>Active</strong> so the organization and admin can sign in and use the portal
        right away. Inactive or Suspended blocks access until you change status later.
      </>
    ),
  },
  {
    id: 'password',
    title: 'Share password safely',
    teaser: 'Send password securely',
    icon: KeyRound,
    body: (
      <>
        Send the admin their temporary password through a secure channel (not plain email if you can avoid it).
        On first sign-in they must set a new password on the welcome screen before accessing the dashboard.
      </>
    ),
  },
];

const INITIAL = {
  orgName: '',
  orgEmail: '',
  phone: '',
  address: '',
  status: 'Active',
  adminFullName: '',
  adminPassword: '',
  adminRole: 'OrgAdmin',
};

function GuideTipCard({ tip, isOpen, onHover, onLeave, onToggle }) {
  const { id, title, teaser, icon: Icon, body } = tip;

  return (
    <div className={`sa-org-guide-card ${isOpen ? 'sa-org-guide-card--open' : ''}`}>
      <button
        type="button"
        className="sa-org-guide-card__btn"
        aria-expanded={isOpen}
        aria-controls={`guide-popover-${id}`}
        onClick={() => onToggle(id)}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={onLeave}
        onFocus={() => onHover(id)}
      >
        <span className="sa-org-guide-card__icon">
          <Icon size={18} aria-hidden />
        </span>
        <span className="sa-org-guide-card__text">
          <span className="sa-org-guide-card__title">{title}</span>
          <span className="sa-org-guide-card__teaser">{teaser}</span>
        </span>
        <HelpCircle size={14} className="sa-org-guide-card__hint-icon" aria-hidden />
      </button>
      {isOpen && (
        <div
          id={`guide-popover-${id}`}
          className="sa-org-guide-popover"
          role="tooltip"
          onMouseEnter={() => onHover(id)}
          onMouseLeave={onLeave}
        >
          <p>{body}</p>
        </div>
      )}
    </div>
  );
}

function BeforeSubmitGuide() {
  const [pinnedId, setPinnedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const guideRef = useRef(null);

  const openId = pinnedId || hoverId;

  const handleHover = useCallback((id) => {
    setHoverId(id);
  }, []);

  const handleLeave = useCallback(() => {
    setHoverId(null);
  }, []);

  const handleToggle = useCallback((id) => {
    setPinnedId((prev) => (prev === id ? null : id));
    setHoverId(null);
  }, []);

  useEffect(() => {
    if (!pinnedId) return undefined;
    const onDocClick = (e) => {
      if (guideRef.current?.contains(e.target)) return;
      setPinnedId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pinnedId]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  return (
    <>
      <div className="sa-org-create-guide" ref={guideRef}>
        <div className="sa-org-create-guide__head">
          <span className="sa-org-create-guide__label">
            <Info size={16} aria-hidden />
            Before you submit
          </span>
          <button type="button" className="sa-org-create-guide__all" onClick={() => setModalOpen(true)}>
            View all tips
          </button>
        </div>
        <p className="sa-org-create-guide__intro">Hover or tap a card for details.</p>
        <div className="sa-org-create-guide__cards">
          {BEFORE_SUBMIT_TIPS.map((tip) => (
            <GuideTipCard
              key={tip.id}
              tip={tip}
              isOpen={openId === tip.id}
              onHover={handleHover}
              onLeave={handleLeave}
              onToggle={handleToggle}
            />
          ))}
        </div>
        <p className="sa-org-create-guide__foot">
          <span className="sa-org-create-guide__kbd">Tip:</span> click a card to keep its popup open while
          you fill the form.
        </p>
      </div>

      {modalOpen &&
        createPortal(
          <div
            className="sa-org-guide-modal-overlay"
            role="presentation"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="sa-org-guide-modal"
              role="dialog"
              aria-labelledby="guide-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sa-org-guide-modal__head">
                <h2 id="guide-modal-title">Before you submit</h2>
                <button
                  type="button"
                  className="sa-org-guide-modal__close"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <ul className="sa-org-guide-modal__list">
                {BEFORE_SUBMIT_TIPS.map((tip) => {
                  const Icon = tip.icon;
                  return (
                    <li key={tip.id}>
                      <span className="sa-org-guide-modal__item-icon">
                        <Icon size={18} aria-hidden />
                      </span>
                      <div>
                        <strong>{tip.title}</strong>
                        <p>{tip.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="sa-org-guide-modal__ok" onClick={() => setModalOpen(false)}>
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

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

const CreateOrganization = () => {
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
      await adminAPI.createOrganization(formData);
      setSuccess(
        'Organization and OrgAdmin account were created. The admin can sign in with the organization email and the password you set.'
      );
      setFormData(INITIAL);
      setTimeout(() => setSuccess(''), 8000);
    } catch (err) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard sa-dash sa-org-create-page">
      <div className="sa-org-create-top">
        <h1 className="sa-org-create-title">
          <Building2 size={26} aria-hidden />
          Create organization
        </h1>
        <p className="sa-org-create-subtitle">
          Register a new tenant on the platform and its first administrator in one step.
        </p>
      </div>

      <BeforeSubmitGuide />

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
          <div className="sa-org-create-section__head">
            <h2>Organization details</h2>
            <p>Profile information stored on the organization record.</p>
          </div>

          <div className="sa-org-create-grid">
            <Field
              label="Organization name"
              required
              hint="Display name shown in the org portal, dashboards, and reports."
            >
              <input
                type="text"
                value={formData.orgName}
                onChange={(e) => handleChange('orgName', e.target.value)}
                placeholder="e.g. ProPath Academy"
                required
                autoComplete="organization"
              />
            </Field>

            <Field
              label="Organization / OrgAdmin email"
              required
              icon={Mail}
              hint="Primary contact email—also used as the OrgAdmin username. Must be unique."
            >
              <input
                type="email"
                value={formData.orgEmail}
                onChange={(e) => handleChange('orgEmail', e.target.value)}
                placeholder="e.g. admin@academy.com"
                required
                autoComplete="email"
              />
            </Field>

            <Field
              label="Phone"
              icon={Phone}
              hint="Optional. Shown on org profile and useful for support contact."
            >
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="e.g. +92 300 1234567"
                autoComplete="tel"
              />
            </Field>

            <Field
              label="Status"
              hint="Active = full access. Inactive or Suspended blocks org and admin sign-in."
            >
              <select value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>
            </Field>

            <Field
              label="Address"
              icon={MapPin}
              className="sa-org-field--full"
              hint="Optional mailing or campus address for records and invoices."
            >
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Street, city, country"
                autoComplete="street-address"
              />
            </Field>
          </div>
        </section>

        <section className="sa-org-create-section">
          <div className="sa-org-create-section__head">
            <h2>OrgAdmin account</h2>
            <p>
              First administrator for this organization. They sign in at the org login page using the
              organization email above.
            </p>
          </div>

          <div className="sa-org-create-grid">
            <Field
              label="Admin full name"
              required
              icon={User}
              hint="Name shown in the org portal (welcome message, logs, etc.)."
            >
              <input
                type="text"
                value={formData.adminFullName}
                onChange={(e) => handleChange('adminFullName', e.target.value)}
                placeholder="e.g. Sarah Khan"
                required
                autoComplete="name"
              />
            </Field>

            <Field
              label="Admin password"
              required
              icon={Lock}
              hint="Minimum 8 characters. Share only with the org admin through a secure channel."
            >
              <input
                type="password"
                value={formData.adminPassword}
                onChange={(e) => handleChange('adminPassword', e.target.value)}
                placeholder="Create a strong password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>

            <Field
              label="Admin role"
              hint="New organizations always get one OrgAdmin. Reviewers and experts are added inside the org portal."
            >
              <select value={formData.adminRole} disabled aria-readonly>
                <option value="OrgAdmin">OrgAdmin</option>
              </select>
            </Field>

            <div className="sa-org-create-tip" aria-hidden="false">
              <p>
                <strong>After creation:</strong> the org admin can manage students, exams, tests,
                subscription plans, and org users from their dashboard.
              </p>
            </div>
          </div>
        </section>

        <div className="sa-org-create-footer">
          <p className="sa-org-create-footer__note">
            Required fields are marked with <span className="sa-org-field__req">*</span>. Double-check
            the email before submitting—it cannot be reused for another organization.
          </p>
          <button type="submit" className="sa-org-create-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={18} className="sa-spin" aria-hidden />
                Creating…
              </>
            ) : (
              <>
                <Save size={18} aria-hidden />
                Create organization
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOrganization;
