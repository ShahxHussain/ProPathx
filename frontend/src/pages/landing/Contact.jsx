import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Clock, Mail, MessageSquare } from 'lucide-react';
import { submitContactForm } from '../../api/public/contact';
import { CONTACT_CHANNELS, EMPTY_CONTACT_FORM, INQUIRY_TYPES } from './contactData';
import LandingBackground from './LandingBackground';
import LandingNavbar from './LandingNavbar';
import LandingLogo from './LandingLogo';
import { useReveal } from './useReveal';
import './Landing.css';
import './Contact.css';

const CHANNEL_ICONS = {
  mail: Mail,
  clock: Clock,
  building: Building2,
};

function validateForm(values) {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!values.inquiryType) errors.inquiryType = 'Select an inquiry type';
  if (!values.subject.trim()) {
    errors.subject = 'Subject is required';
  } else if (values.subject.trim().length < 3) {
    errors.subject = 'Subject must be at least 3 characters';
  }
  if (!values.message.trim()) {
    errors.message = 'Message is required';
  } else if (values.message.trim().length < 20) {
    errors.message = 'Message must be at least 20 characters';
  }

  return errors;
}

export default function Contact() {
  const navigate = useNavigate();
  const { ref: formRef, visible: formVisible } = useReveal(0.08);
  const [form, setForm] = useState(EMPTY_CONTACT_FORM);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const goLogin = (loginType) => {
    navigate('/login', { state: loginType ? { loginType } : undefined });
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      await submitContactForm({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        organization: form.organization.trim() || undefined,
        inquiryType: form.inquiryType,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setSubmitted(true);
      setForm(EMPTY_CONTACT_FORM);
      setErrors({});
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing lp-contact">
      <LandingBackground />
      <LandingNavbar onSignIn={() => goLogin()} onGetStarted={() => goLogin('org')} />

      <main className="lp-contact__main">
        <section className="lp-contact-hero">
          <p className="lp-contact-hero__kicker">
            <MessageSquare size={14} aria-hidden />
            Contact
          </p>
          <h1 className="lp-contact-hero__title">
            Let&apos;s talk about
            <br />
            <em>your learning programs.</em>
          </h1>
          <p className="lp-contact-hero__lead">
            Whether you&apos;re exploring ProPath, scaling an institute, or need support — tell us what you&apos;re building.
            We read every message.
          </p>

          <div className="lp-contact-hero__help">
            <p className="landing-section__kicker">How we can help</p>
            <p className="lp-contact-hero__help-lead">
              Share context about your organization, learner volume, and timelines. We&apos;ll route you to the right person.
            </p>

            <ul className="lp-contact-meta">
              {CONTACT_CHANNELS.map((channel) => {
                const Icon = CHANNEL_ICONS[channel.icon];
                return (
                  <li key={channel.label} className="lp-contact-meta__item">
                    <span className="lp-contact-meta__icon" aria-hidden>
                      <Icon size={15} />
                    </span>
                    <div>
                      <span className="lp-contact-meta__label">{channel.label}</span>
                      {channel.href ? (
                        <a href={channel.href}>{channel.value}</a>
                      ) : (
                        <span>{channel.value}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="lp-contact-hero__note">
              Already a customer?{' '}
              <Link to="/login">Sign in</Link> for faster support through your org workspace.
            </p>
          </div>
        </section>

        <section
          ref={formRef}
          className={`lp-contact-form-wrap${formVisible ? ' is-visible' : ''}`}
          aria-label="Contact form"
        >
          <div className="lp-contact-form-card">
            {submitted ? (
              <div className="lp-contact-success" role="status">
                <span className="lp-contact-success__icon" aria-hidden>
                  <CheckCircle2 size={28} />
                </span>
                <h2>Message sent</h2>
                <p>Thanks for reaching out. Our team will get back to you within one business day.</p>
                <button
                  type="button"
                  className="landing-btn landing-btn--outline"
                  onClick={() => setSubmitted(false)}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form className="lp-contact-form" onSubmit={handleSubmit} noValidate>
                <div className="lp-contact-form__row lp-contact-form__row--quad">
                  <div className={`lp-contact-field${errors.firstName ? ' has-error' : ''}`}>
                    <label htmlFor="contact-first-name">First name *</label>
                    <input
                      id="contact-first-name"
                      type="text"
                      name="firstName"
                      autoComplete="given-name"
                      placeholder="Amina"
                      value={form.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      aria-invalid={Boolean(errors.firstName)}
                      aria-describedby={errors.firstName ? 'contact-first-name-error' : undefined}
                    />
                    {errors.firstName && (
                      <span id="contact-first-name-error" className="lp-contact-field__error" role="alert">
                        {errors.firstName}
                      </span>
                    )}
                  </div>

                  <div className={`lp-contact-field${errors.lastName ? ' has-error' : ''}`}>
                    <label htmlFor="contact-last-name">Last name *</label>
                    <input
                      id="contact-last-name"
                      type="text"
                      name="lastName"
                      autoComplete="family-name"
                      placeholder="Khan"
                      value={form.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      aria-invalid={Boolean(errors.lastName)}
                      aria-describedby={errors.lastName ? 'contact-last-name-error' : undefined}
                    />
                    {errors.lastName && (
                      <span id="contact-last-name-error" className="lp-contact-field__error" role="alert">
                        {errors.lastName}
                      </span>
                    )}
                  </div>

                  <div className={`lp-contact-field${errors.email ? ' has-error' : ''}`}>
                    <label htmlFor="contact-email">Work email *</label>
                    <input
                      id="contact-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="you@institute.edu"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'contact-email-error' : undefined}
                    />
                    {errors.email && (
                      <span id="contact-email-error" className="lp-contact-field__error" role="alert">
                        {errors.email}
                      </span>
                    )}
                  </div>

                  <div className="lp-contact-field">
                    <label htmlFor="contact-phone">Phone</label>
                    <input
                      id="contact-phone"
                      type="tel"
                      name="phone"
                      autoComplete="tel"
                      placeholder="+1 (555) 000-0000"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                    />
                  </div>
                </div>

                <div className="lp-contact-form__row lp-contact-form__row--triple">
                  <div className={`lp-contact-field${errors.inquiryType ? ' has-error' : ''}`}>
                    <label htmlFor="contact-inquiry">Inquiry type *</label>
                    <div className="lp-contact-select-wrap">
                      <select
                        id="contact-inquiry"
                        name="inquiryType"
                        value={form.inquiryType}
                        onChange={(e) => updateField('inquiryType', e.target.value)}
                        aria-invalid={Boolean(errors.inquiryType)}
                        aria-describedby={errors.inquiryType ? 'contact-inquiry-error' : undefined}
                      >
                        {INQUIRY_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.inquiryType && (
                      <span id="contact-inquiry-error" className="lp-contact-field__error" role="alert">
                        {errors.inquiryType}
                      </span>
                    )}
                  </div>

                  <div className="lp-contact-field">
                    <label htmlFor="contact-organization">Organization</label>
                    <input
                      id="contact-organization"
                      type="text"
                      name="organization"
                      autoComplete="organization"
                      placeholder="ProPath Academy"
                      value={form.organization}
                      onChange={(e) => updateField('organization', e.target.value)}
                    />
                  </div>

                  <div className={`lp-contact-field${errors.subject ? ' has-error' : ''}`}>
                    <label htmlFor="contact-subject">Subject *</label>
                    <input
                      id="contact-subject"
                      type="text"
                      name="subject"
                      placeholder="Demo for our certification program"
                      value={form.subject}
                      onChange={(e) => updateField('subject', e.target.value)}
                      aria-invalid={Boolean(errors.subject)}
                      aria-describedby={errors.subject ? 'contact-subject-error' : undefined}
                    />
                    {errors.subject && (
                      <span id="contact-subject-error" className="lp-contact-field__error" role="alert">
                        {errors.subject}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`lp-contact-field${errors.message ? ' has-error' : ''}`}>
                  <label htmlFor="contact-message">
                    Message *
                    <span className="lp-contact-field__hint">{form.message.length} / 2000</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={6}
                    maxLength={2000}
                    placeholder="Tell us about your learners, exams, and what you need from ProPath..."
                    value={form.message}
                    onChange={(e) => updateField('message', e.target.value)}
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? 'contact-message-error' : undefined}
                  />
                  {errors.message && (
                    <span id="contact-message-error" className="lp-contact-field__error" role="alert">
                      {errors.message}
                    </span>
                  )}
                </div>

                {submitError && (
                  <p className="lp-contact-form__submit-error" role="alert">
                    {submitError}
                  </p>
                )}

                <button
                  type="submit"
                  className="landing-btn landing-btn--primary landing-btn--lg lp-contact-form__submit"
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send message'}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <LandingLogo size="sm" />
        <p>© {new Date().getFullYear()} ProPath. Learning intelligence platform.</p>
        <div className="landing-footer__links">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/login">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
