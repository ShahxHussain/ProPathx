import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import { COMPANY_NAV, PRODUCT_NAV } from './data';
import LandingLogo from './LandingLogo';

function scrollToHash(hash) {
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (!el) return false;
  const header = document.querySelector('.landing-header');
  const offset = (header?.getBoundingClientRect().height ?? 72) + 12;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  return true;
}

export default function LandingNavbar({ onSignIn, onGetStarted }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const productRef = useRef(null);
  const closeTimer = useRef(null);
  const productMenuId = useId();
  const onHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
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

  useEffect(() => {
    if (!onHome) {
      setActiveSection('');
      return undefined;
    }
    const ids = PRODUCT_NAV.map((i) => i.href.slice(1));
    const pick = () => {
      const marker = 130;
      let current = ids[0];
      ids.forEach((id) => {
        const node = document.getElementById(id);
        if (!node) return;
        if (node.getBoundingClientRect().top - marker <= 0) current = id;
      });
      setActiveSection(`#${current}`);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    return () => window.removeEventListener('scroll', pick);
  }, [onHome]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const openProduct = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setProductOpen(true);
  };

  const scheduleCloseProduct = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setProductOpen(false), 140);
  };

  const closeMobile = () => {
    setMobileOpen(false);
    setProductOpen(false);
  };

  const goProduct = (hash) => (event) => {
    event.preventDefault();
    setProductOpen(false);
    closeMobile();
    if (pathname !== '/') {
      navigate({ pathname: '/', hash: hash.replace('#', '') });
      return;
    }
    scrollToHash(hash);
  };

  // Support /#platform style entry
  useEffect(() => {
    if (!onHome || !window.location.hash) return;
    const t = setTimeout(() => scrollToHash(window.location.hash), 80);
    return () => clearTimeout(t);
  }, [onHome]);

  return (
    <header className={`landing-header${scrolled ? ' landing-header--scrolled' : ''}${mobileOpen ? ' is-open' : ''}`}>
      <div className="landing-nav">
        <LandingLogo
          to="/"
          onClick={() => {
            closeMobile();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        <nav className="landing-nav__links" aria-label="Primary">
          <div
            className="landing-nav__product"
            ref={productRef}
            onMouseEnter={openProduct}
            onMouseLeave={scheduleCloseProduct}
            onFocus={openProduct}
            onBlur={(e) => {
              if (!productRef.current?.contains(e.relatedTarget)) scheduleCloseProduct();
            }}
          >
            <button
              type="button"
              className={`landing-nav__link landing-nav__link--btn${productOpen ? ' is-active' : ''}`}
              aria-expanded={productOpen}
              aria-controls={productMenuId}
              aria-haspopup="menu"
              onClick={() => setProductOpen((v) => !v)}
            >
              Product
              <ChevronDown size={14} className={`landing-nav__chev${productOpen ? ' is-open' : ''}`} aria-hidden />
            </button>

            <div
              id={productMenuId}
              className={`landing-nav__menu${productOpen ? ' is-open' : ''}`}
              role="menu"
              aria-hidden={!productOpen}
              onMouseEnter={openProduct}
              onMouseLeave={scheduleCloseProduct}
            >
              <p className="landing-nav__menu-label">Product</p>
              {PRODUCT_NAV.map((item) => (
                <a
                  key={item.href}
                  href={onHome ? item.href : `/${item.href}`}
                  role="menuitem"
                  className={`landing-nav__menu-item${activeSection === item.href ? ' is-active' : ''}`}
                  onClick={goProduct(item.href)}
                >
                  <span className="landing-nav__menu-title">{item.label}</span>
                  <span className="landing-nav__menu-desc">{item.desc}</span>
                </a>
              ))}
            </div>
          </div>

          {COMPANY_NAV.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`landing-nav__link${pathname === item.href ? ' is-active' : ''}`}
              onClick={() => window.scrollTo(0, 0)}
            >
              {item.label}
            </Link>
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
        <div className="landing-nav__drawer-group">
          <p className="landing-nav__drawer-label">Product</p>
          {PRODUCT_NAV.map((item) => (
            <a
              key={item.href}
              href={onHome ? item.href : `/${item.href}`}
              className={`landing-nav__drawer-link${activeSection === item.href ? ' is-active' : ''}`}
              onClick={goProduct(item.href)}
            >
              <span>{item.label}</span>
              <small>{item.desc}</small>
            </a>
          ))}
        </div>
        <div className="landing-nav__drawer-group">
          <p className="landing-nav__drawer-label">Company</p>
          {COMPANY_NAV.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`landing-nav__drawer-link${pathname === item.href ? ' is-active' : ''}`}
              onClick={() => {
                closeMobile();
                window.scrollTo(0, 0);
              }}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
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
