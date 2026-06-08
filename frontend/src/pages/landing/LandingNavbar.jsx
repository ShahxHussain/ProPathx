import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { NAV_LINKS } from './data';
import LandingLogo from './LandingLogo'; // brand mark

function navHref(item, pathname) {
  if (item.route) return item.href;
  if (pathname !== '/' && item.href.startsWith('#')) return `/${item.href}`;
  return item.href;
}

function NavItem({ item, className, onClick, pathname }) {
  const handleRouteClick = (event) => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      window.scrollTo(0, 0);
    }
  };

  if (item.route) {
    const active = pathname === item.href;
    return (
      <Link
        to={item.href}
        className={`${className}${active ? ' is-active' : ''}`}
        onClick={handleRouteClick}
      >
        {item.label}
      </Link>
    );
  }

  const href = navHref(item, pathname);
  const handleHashClick = (event) => {
    onClick?.(event);
    if (pathname !== '/' && item.href.startsWith('#')) {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  return (
    <a href={href} className={className} onClick={handleHashClick}>
      {item.label}
    </a>
  );
}

export default function LandingNavbar({ onSignIn, onGetStarted }) {
  const { pathname } = useLocation();
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
        <LandingLogo to="/" onClick={closeMobile} />

        <nav className="landing-nav__links" aria-label="Sections">
          {NAV_LINKS.map((item) => (
            <NavItem key={item.href} item={item} className="landing-nav__link" pathname={pathname} />
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
          {NAV_LINKS.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              className="landing-nav__drawer-link"
              pathname={pathname}
              onClick={closeMobile}
            />
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
