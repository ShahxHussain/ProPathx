import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, KeyRound, Sparkles, ArrowLeft } from 'lucide-react';
import { orgAuth } from '../../../services/api';
import { getPostLoginRoute } from '../../../utils/roleRedirect';
import './OrgWelcomePassword.css';

const QUOTE = {
  text: 'Trust is earned in drops and lost in buckets.',
  author: 'Warren Buffett',
};

const OrgWelcomePassword = () => {
  const navigate = useNavigate();
  const user = orgAuth.getCurrentUser();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await orgAuth.completeFirstPassword(newPassword, confirmPassword);
      const route = getPostLoginRoute(response.user);
      navigate(route, { replace: true });
    } catch (err) {
      if (err.code === 'DATABASE_UNAVAILABLE') {
        setError(
          'Cannot reach the database right now. Check that the API server is running, your internet connection is working, and Supabase settings in backend/.env are correct — then try again.'
        );
      } else {
        setError(err.message || 'Could not update password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    orgAuth.logout();
    navigate('/', { replace: true });
  };

  const greetingName = user?.fullName?.split(' ')[0] || 'there';

  return (
    <div className="welcome-password-page">
      <div className="welcome-page-toolbar">
        <button type="button" className="welcome-back-btn" onClick={handleBackToSignIn}>
          <ArrowLeft size={18} aria-hidden />
          Back to sign in
        </button>
      </div>

      <motion.div
        className="welcome-password-shell"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <aside className="welcome-password-aside welcome-card">
          <motion.div
            className="welcome-shield-wrap"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
          >
            <ShieldCheck size={48} strokeWidth={1.5} aria-hidden />
            <span className="welcome-shield-pulse" aria-hidden />
          </motion.div>

          <p className="welcome-quote-label">A note on security</p>
          <blockquote className="welcome-quote">
            &ldquo;{QUOTE.text}&rdquo;
            <cite>— {QUOTE.author}</cite>
          </blockquote>

          <p className="welcome-trust-copy">
            Your account was prepared by a ProPath administrator. Before you enter your workspace,
            please choose a personal password — only you should know it. We treat your organization&apos;s
            data with the same care we expect for our own.
          </p>

          <ul className="welcome-points">
            <li>
              <Sparkles size={16} aria-hidden />
              One quick step, then full access to your portal
            </li>
            <li>
              <KeyRound size={16} aria-hidden />
              Use at least 8 characters; avoid reusing your temporary password
            </li>
          </ul>
        </aside>

        <section className="welcome-password-main welcome-card welcome-form-card">
          <p className="welcome-eyebrow">Welcome to ProPath</p>
          <h1>Hello, {greetingName}</h1>
          <p className="welcome-lead">
            {user?.orgName
              ? `You're signing in to ${user.orgName}. Set your password to finish onboarding and open your dashboard.`
              : 'Set your password to finish onboarding and open your dashboard.'}
          </p>

          <form className="welcome-form" onSubmit={handleSubmit}>
            <label>
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </label>
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </label>

            {error && <div className="notice error">{error}</div>}

            <button type="submit" className="solid welcome-submit" disabled={loading}>
              {loading ? 'Securing your account…' : 'Continue to my workspace'}
            </button>
          </form>

          <p className="welcome-footer-note muted small">
            Need help? Contact your organization administrator or ProPath support.
          </p>
        </section>
      </motion.div>
    </div>
  );
};

export default OrgWelcomePassword;
