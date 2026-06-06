import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';
import { ABOUT_VALUES, CO_FOUNDERS } from './aboutData';
import LandingBackground from './LandingBackground';
import LandingNavbar from './LandingNavbar';
import { useReveal } from './useReveal';
import './Landing.css';
import './About.css';

export default function About() {
  const navigate = useNavigate();
  const { ref: foundersRef, visible: foundersVisible } = useReveal(0.12);
  const { ref: valuesRef, visible: valuesVisible } = useReveal(0.15);

  const goLogin = (loginType) => {
    navigate('/login', { state: loginType ? { loginType } : undefined });
  };

  return (
    <div className="landing lp-about">
      <LandingBackground />
      <LandingNavbar onSignIn={() => goLogin()} onGetStarted={() => goLogin('org')} />

      <main className="lp-about__main">
        <section className="lp-about-hero">
          <p className="lp-about-hero__kicker">
            <Sparkles size={14} aria-hidden />
            Our team
          </p>
          <h1 className="lp-about-hero__title">
            Five founders.
            <br />
            <em>One obsession with learning that scales.</em>
          </h1>
          <p className="lp-about-hero__lead">
            ProPath began with a vision from educators who saw beyond one exam or one cohort — a platform for structured learning,
            practice, analytics, and institutional operations. Reviewed in sprints, engineered from scratch, built to scale.
          </p>
        </section>

        <section
          ref={foundersRef}
          className={`lp-about-founders${foundersVisible ? ' is-visible' : ''}`}
          aria-label="Co-founders"
        >
          <div className="lp-about-founders__head">
            <p className="landing-section__kicker">Co-founders</p>
            <h2 className="landing-section__title">The people building ProPath</h2>
            <p className="landing-section__lead">
              Educators who conceived it. An engineer who built it. Advisors who help it scale — all hands-on, all invested in outcomes.
            </p>
          </div>

          <div className="lp-about-founders__grid">
            {CO_FOUNDERS.map((founder, index) => (
              <article
                key={founder.id}
                className={`lp-founder-card lp-founder-card--${founder.accent}`}
                style={{ '--founder-i': index }}
                tabIndex={0}
              >
                <div className={`lp-founder-card__photo${founder.photo ? ' has-photo' : ''}`}>
                  {founder.photo ? (
                    <img
                      src={founder.photo}
                      alt={`Portrait of ${founder.name}`}
                      className="lp-founder-card__photo-img"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="lp-founder-card__photo-inner" aria-hidden>
                      <span className="lp-founder-card__initials">{founder.initials}</span>
                      <span className="lp-founder-card__photo-label">Photo placeholder</span>
                    </div>
                  )}
                  <div className="lp-founder-card__overlay" aria-hidden>
                    <p>{founder.bio}</p>
                  </div>
                </div>
                <div className="lp-founder-card__body">
                  <h3>{founder.name}</h3>
                  <p className="lp-founder-card__role">{founder.role}</p>
                  <p className="lp-founder-card__focus">{founder.focus}</p>
                  <p className="lp-founder-card__bio">{founder.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          ref={valuesRef}
          className={`lp-about-values${valuesVisible ? ' is-visible' : ''}`}
          aria-label="What we believe"
        >
          {ABOUT_VALUES.map((value, index) => (
            <article key={value.title} className="lp-about-values__item" style={{ '--value-i': index }}>
              <h3>{value.title}</h3>
              <p>{value.desc}</p>
            </article>
          ))}
        </section>

        <section className="lp-about-cta">
          <h2>Ready to see what we&apos;re building?</h2>
          <p>Explore the platform or start your organization in minutes.</p>
          <div className="lp-about-cta__actions">
            <Link to="/" className="landing-btn landing-btn--outline landing-btn--lg">
              Back to home
            </Link>
            <button
              type="button"
              className="landing-btn landing-btn--primary landing-btn--lg"
              onClick={() => goLogin('org')}
            >
              Get started
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-logo landing-logo--sm">
          <span className="landing-logo__mark landing-logo__mark--sm" aria-hidden>
            <Layers size={14} strokeWidth={2.25} />
          </span>
          <span className="landing-logo__text">ProPath</span>
        </span>
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
