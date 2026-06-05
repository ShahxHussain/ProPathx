import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { PORTALS } from './data';
import { useReveal } from './useReveal';

export default function PortalsSection({ onSignIn }) {
  const { ref, visible } = useReveal();
  const [activeId, setActiveId] = useState(PORTALS[0].id);
  const active = PORTALS.find((p) => p.id === activeId) || PORTALS[0];
  const ActiveIcon = active.icon;

  return (
    <section
      id="portals"
      ref={ref}
      className={`landing-section lp-portals-section${visible ? ' is-visible' : ''}`}
    >
      <p className="landing-section__kicker">Portals</p>
      <h2 className="landing-section__title">One platform. The right experience for every role.</h2>
      <p className="landing-section__lead">
        Choose your portal — organization staff or students. Same platform, purpose-built for how you work.
      </p>

      <div className="lp-portals__tabs-wrap">
        <div className="lp-portals__tabs" role="tablist" aria-label="Portal selection">
          {PORTALS.map((portal) => {
            const Icon = portal.icon;
            const selected = portal.id === activeId;
            return (
              <button
                key={portal.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`portal-panel-${portal.id}`}
                id={`portal-tab-${portal.id}`}
                className={`lp-portals__tab lp-portals__tab--${portal.color}${selected ? ' is-active' : ''}`}
                onClick={() => setActiveId(portal.id)}
              >
                <Icon size={18} strokeWidth={2} aria-hidden />
                <span>{portal.tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`portal-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`portal-tab-${active.id}`}
        className={`lp-portals__panel lp-portals__panel--${active.color}`}
        key={activeId}
      >
        <div className="lp-portals__panel-main">
          <span className={`lp-portals__icon lp-portals__icon--${active.color}`}>
            <ActiveIcon size={24} strokeWidth={2} />
          </span>
          <h3>{active.title}</h3>
          <p>{active.desc}</p>
          <ul className="lp-portals__features">
            {active.features.map((item) => (
              <li key={item}>
                <CheckCircle2 size={15} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`landing-btn landing-btn--primary landing-btn--block lp-portals__cta lp-portals__cta--${active.color}`}
            onClick={() => onSignIn(active.loginType)}
          >
            {active.cta}
            <ArrowRight size={16} />
          </button>
        </div>

        <aside className="lp-portals__panel-aside" aria-label="Portal highlights">
          <span className="lp-portals__aside-label">{active.asideLabel}</span>
          <ul className="lp-portals__aside-list">
            {active.asideItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
