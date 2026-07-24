import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';
import { METRICS, PILLARS } from './data';
import LandingHero3D from './LandingHero3D';
import HeroTypewriter from './HeroTypewriter';
import LandingBackground from './LandingBackground';
import LandingNavbar from './LandingNavbar';
import PlatformSection from './PlatformSection';
import RoadmapSection from './RoadmapSection';
import PortalsSection from './PortalsSection';
import RolesSection from './RolesSection';
import { useReveal } from './useReveal';
import LandingLogo from './LandingLogo';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const metricsReveal = useReveal(0.2);
  const pillarsReveal = useReveal(0.15);
  const trustReveal = useReveal(0.12);
  const ctaReveal = useReveal(0.15);

  const goLogin = (loginType) => {
    navigate('/login', { state: loginType ? { loginType } : undefined });
  };

  return (
    <div className="landing">
      <LandingBackground />
      <LandingNavbar onSignIn={() => goLogin()} onGetStarted={() => goLogin('org')} />

      <main>
        <section className="landing-hero">
          <div className="landing-hero__inner">
            <p className="landing-eyebrow landing-anim" style={{ '--anim-i': 0 }}>
              <Sparkles size={14} aria-hidden />
              Learning intelligence for modern institutions
            </p>
            <HeroTypewriter />
            <div className="landing-hero__cta landing-anim" style={{ '--anim-i': 2 }}>
              <button type="button" className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => goLogin('org')}>
                Start as an organization
                <ArrowRight size={18} />
              </button>
              <button type="button" className="landing-btn landing-btn--outline landing-btn--lg" onClick={() => goLogin('student')}>
                I&apos;m a student
              </button>
            </div>
          </div>

          <div className="landing-hero__visual landing-anim" style={{ '--anim-i': 2 }}>
            <LandingHero3D />
          </div>
        </section>

        <section
          ref={metricsReveal.ref}
          className={`landing-metrics${metricsReveal.visible ? ' is-visible' : ''}`}
          aria-label="Platform metrics"
        >
          <div className="landing-metrics__inner">
            {METRICS.map(({ value, label }, i) => (
              <div key={label} className="landing-metric" style={{ '--metric-i': i }}>
                {i > 0 && <span className="landing-metric__rule" aria-hidden />}
                <span className="landing-metric__value">{value}</span>
                <span className="landing-metric__label">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <PlatformSection />

        <section
          ref={pillarsReveal.ref}
          id="product"
          className={`landing-section${pillarsReveal.visible ? ' is-visible' : ''}`}
        >
          <p className="landing-section__kicker">Product</p>
          <h2 className="landing-section__title">Everything learners need. Nothing they don&apos;t.</h2>
          <p className="landing-section__lead">
            Built for teams who take learning outcomes seriously — from structured syllabi and verified practice
            banks to enrollments and usage-backed subscriptions.
          </p>
          <div className="landing-pillars">
            {PILLARS.map(({ icon: Icon, title, desc }, i) => (
              <article key={title} className="landing-pillar" style={{ '--pillar-i': i }}>
                <span className="landing-pillar__icon">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </section>

        <RolesSection />

        <PortalsSection onSignIn={goLogin} />

        <RoadmapSection />

        <section
          id="security"
          ref={trustReveal.ref}
          className={`landing-trust${trustReveal.visible ? ' is-visible' : ''}`}
        >
          <Shield size={20} aria-hidden />
          <div>
            <h3>Built for learning at scale</h3>
            <p>
              Tenant-safe architecture, role-based portals, maintenance controls, comprehensive audit logs, and
              subscription entitlements — so institutions grow learner outcomes without operational risk.
            </p>
            <div className="lp-trust-tags">
              <span>Multi-tenant isolation</span>
              <span>Progress &amp; mastery signals</span>
              <span>Comprehensive audit logs</span>
              <span>Subscription entitlements</span>
            </div>
          </div>
        </section>

        <section ref={ctaReveal.ref} className={`landing-cta-band${ctaReveal.visible ? ' is-visible' : ''}`}>
          <h2>Ready to elevate how your learners grow?</h2>
          <p>Create your organization or sign in to your learning portal in under a minute.</p>
          <div className="landing-cta-band__actions">
            <button type="button" className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => goLogin('org')}>
              Get started free
            </button>
            <button type="button" className="landing-btn landing-btn--ghost landing-btn--lg" onClick={() => goLogin()}>
              Sign in
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <LandingLogo size="sm" />
        <p>© {new Date().getFullYear()} ProPath. Learning intelligence platform.</p>
        <div className="landing-footer__links">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/admin/login">Admin access</Link>
        </div>
      </footer>
    </div>
  );
}
