import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, Menu, X } from 'lucide-react';
import { NAV_LINKS } from './data';

export default function LandingNavbar({ onSignIn, onGetStarted }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className={`landing-header${scrolled ? ' landing-header--scrolled' : ''}`}>
      <div className="landing-nav">
        <Link to="/" className="landing-logo" onClick={closeMobile}>
          <span className="landing-logo__mark" aria-hidden>
            <Layers size={17} strokeWidth={2.25} />
          </span>
          <span className="landing-logo__text">ProPath</span>
        </Link>

        <nav className="landing-nav__links" aria-label="Sections">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="landing-nav__link">
              {label}
            </a>
          ))}
        </nav>

        <div className="landing-nav__actions">
          <button type="button" className="landing-btn landing-btn--ghost" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="landing-btn landing-btn--primary" onClick={onGetStarted}>
            Get started
            <ArrowRight size={16} />
          </button>
        </div>

        <button
          type="button"
          className="landing-nav__toggle"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className={`landing-nav__drawer${mobileOpen ? ' is-open' : ''}`} aria-hidden={!mobileOpen}>
        <nav className="landing-nav__drawer-links">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="landing-nav__drawer-link" onClick={closeMobile}>
              {label}
            </a>
          ))}
        </nav>
        <div className="landing-nav__drawer-actions">
          <button type="button" className="landing-btn landing-btn--outline landing-btn--block" onClick={() => { closeMobile(); onSignIn(); }}>
            Sign in
          </button>
          <button type="button" className="landing-btn landing-btn--primary landing-btn--block" onClick={() => { closeMobile(); onGetStarted(); }}>
            Get started
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <button type="button" className="landing-nav__backdrop" aria-label="Close menu" onClick={closeMobile} />
      )}
    </header>
  );
}
