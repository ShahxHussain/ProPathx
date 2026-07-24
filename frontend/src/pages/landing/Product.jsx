import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { PLATFORM_TABS, PORTALS, ROLE_STEPS } from './data';
import LandingBackground from './LandingBackground';
import LandingNavbar from './LandingNavbar';
import LandingLogo from './LandingLogo';
import './Landing.css';
import './Product.css';

const MODES = [
  { id: 'roles', label: 'Roles' },
  { id: 'flows', label: 'Flows' },
  { id: 'portals', label: 'Portals' },
];

export default function Product() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('roles');
  const [roleId, setRoleId] = useState(ROLE_STEPS[0].id);
  const [flowId, setFlowId] = useState(PLATFORM_TABS[0].id);
  const [portalId, setPortalId] = useState(PORTALS[0].id);

  const goLogin = (loginType) => {
    navigate('/login', { state: loginType ? { loginType } : undefined });
  };

  const role = useMemo(() => ROLE_STEPS.find((r) => r.id === roleId) || ROLE_STEPS[0], [roleId]);
  const flow = useMemo(() => PLATFORM_TABS.find((f) => f.id === flowId) || PLATFORM_TABS[0], [flowId]);
  const portal = useMemo(() => PORTALS.find((p) => p.id === portalId) || PORTALS[0], [portalId]);

  return (
    <div className="landing lp-product">
      <LandingBackground />
      <LandingNavbar onSignIn={() => goLogin()} onGetStarted={() => goLogin('org')} />

      <main className="lp-product__main">
        <header className="lp-product__hero">
          <p className="landing-section__kicker">Product</p>
          <h1 className="lp-product__title">
            How ProPath
            <em> actually works.</em>
          </h1>
          <p className="lp-product__lead">
            Click through roles, pipelines, and portals. This is the map of who does what — and how learning moves from syllabus to score.
          </p>
        </header>

        <div className="lp-product__modes" role="tablist" aria-label="Explore">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`lp-product__mode${mode === m.id ? ' is-active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'roles' && (
          <div className="lp-explorer">
            <aside className="lp-explorer__nav" aria-label="Roles">
              {ROLE_STEPS.map((step, i) => (
                <button
                  key={step.id}
                  type="button"
                  className={`lp-explorer__item${roleId === step.id ? ' is-active' : ''}`}
                  onClick={() => setRoleId(step.id)}
                >
                  <span className="lp-explorer__index">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="lp-explorer__item-label">{step.tabLabel}</span>
                    <span className="lp-explorer__item-layer">{step.layerLabel}</span>
                  </span>
                </button>
              ))}
            </aside>

            <article className="lp-explorer__stage" key={role.id}>
              <div className={`lp-explorer__badge lp-explorer__badge--${role.color}`}>
                {role.layerLabel}
              </div>
              <h2>{role.title}</h2>
              <p>{role.desc}</p>
              <ul className="lp-explorer__features">
                {role.features.map((f) => (
                  <li key={f}>
                    <Check size={16} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <RolePanel panel={role.panel} color={role.color} />
            </article>
          </div>
        )}

        {mode === 'flows' && (
          <div className="lp-explorer">
            <aside className="lp-explorer__nav" aria-label="Flows">
              {PLATFORM_TABS.map((tab, i) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`lp-explorer__item${flowId === tab.id ? ' is-active' : ''}`}
                  onClick={() => setFlowId(tab.id)}
                >
                  <span className="lp-explorer__index">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="lp-explorer__item-label">{tab.label}</span>
                    <span className="lp-explorer__item-layer">{tab.nodes.join(' → ')}</span>
                  </span>
                </button>
              ))}
            </aside>

            <article className="lp-explorer__stage" key={flow.id}>
              <div className="lp-explorer__badge lp-explorer__badge--navy">{flow.label}</div>
              <h2>{flow.title}</h2>
              <p>{flow.desc}</p>
              <ul className="lp-explorer__features">
                {flow.highlights.map((h) => (
                  <li key={h}>
                    <Check size={16} aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
              <FlowPanel panel={flow.panel} nodes={flow.nodes} />
            </article>
          </div>
        )}

        {mode === 'portals' && (
          <div className="lp-explorer lp-explorer--portals">
            <aside className="lp-explorer__nav" aria-label="Portals">
              {PORTALS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`lp-explorer__item${portalId === p.id ? ' is-active' : ''}`}
                  onClick={() => setPortalId(p.id)}
                >
                  <span className="lp-explorer__index">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="lp-explorer__item-label">{p.tabLabel}</span>
                    <span className="lp-explorer__item-layer">{p.title}</span>
                  </span>
                </button>
              ))}
            </aside>

            <article className="lp-explorer__stage" key={portal.id}>
              <div className={`lp-explorer__badge lp-explorer__badge--${portal.color}`}>
                Portal
              </div>
              <h2>{portal.title}</h2>
              <p>{portal.desc}</p>
              <ul className="lp-explorer__features">
                {portal.features.map((f) => (
                  <li key={f}>
                    <Check size={16} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="landing-btn landing-btn--primary"
                onClick={() => goLogin(portal.loginType)}
              >
                {portal.cta}
                <ArrowRight size={16} />
              </button>
            </article>
          </div>
        )}

        <section className="lp-product__cta">
          <h2>Seen enough of the map?</h2>
          <p>Open a portal and run the loop for real.</p>
          <div className="lp-product__cta-actions">
            <button type="button" className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => goLogin('org')}>
              Start as an organization
              <ArrowRight size={18} />
            </button>
            <Link to="/" className="landing-btn landing-btn--outline landing-btn--lg">
              Back to home
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <LandingLogo size="sm" />
        <p>© {new Date().getFullYear()} ProPath. Learning intelligence platform.</p>
        <div className="landing-footer__links">
          <Link to="/product">Product</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/login">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}

function RolePanel({ panel, color }) {
  if (!panel) return null;

  if (panel.type === 'layers') {
    return (
      <div className="lp-panel lp-panel--layers">
        <div className="lp-panel__layer">
          <strong>Platform</strong>
          <span>Global exams, plans, governance</span>
        </div>
        <div className="lp-panel__layer lp-panel__layer--org">
          <strong>Organization</strong>
          <span>Your staff, students, tests</span>
        </div>
        <div className="lp-panel__layer lp-panel__layer--learners">
          <strong>Learners</strong>
          <span>Org-enrolled &amp; individual</span>
        </div>
      </div>
    );
  }

  if (panel.type === 'portal') {
    return (
      <div className={`lp-panel lp-panel--portal lp-panel--${color}`}>
        <strong>{panel.name}</strong>
        <span>{panel.scope}</span>
        <em>{panel.badge}</em>
      </div>
    );
  }

  if (panel.type === 'dual-role') {
    return (
      <div className="lp-panel lp-panel--dual">
        <p className="lp-panel__scope">{panel.scope}</p>
        {panel.roles.map((r) => (
          <div key={r.name} className="lp-panel__dual-row">
            <strong>{r.name}</strong>
            <span>{r.duty}</span>
          </div>
        ))}
      </div>
    );
  }

  if (panel.type === 'student-types') {
    return (
      <div className="lp-panel lp-panel--students">
        {panel.types.map((t) => (
          <div key={t.name} className={`lp-panel__student lp-panel__student--${t.color}`}>
            <strong>{t.name}</strong>
            <span>{t.detail}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function FlowPanel({ panel, nodes }) {
  if (!panel) return null;

  return (
    <div className="lp-panel lp-panel--flow">
      <div className="lp-panel__nodes">
        {nodes.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>

      {panel.type === 'hierarchy' && (
        <div className="lp-panel__hierarchy">
          {panel.items.map((item, i) => (
            <div key={item.name} className="lp-panel__h-row" style={{ '--depth': i }}>
              <span>{item.level}</span>
              <strong>{item.name}</strong>
              <em>{item.count}</em>
            </div>
          ))}
        </div>
      )}

      {panel.type === 'test-flow' && (
        <ol className="lp-panel__steps">
          {panel.steps.map((s) => (
            <li key={s.label} className={`is-${s.status}`}>
              <span />
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {panel.type === 'usage' && (
        <div className="lp-panel__usage">
          {panel.rows.map((r) => {
            const pct = Math.round((r.used / r.max) * 100);
            return (
              <div key={r.label} className="lp-panel__usage-row">
                <div className="lp-panel__usage-head">
                  <span>{r.label}</span>
                  <strong>{r.used}/{r.max}</strong>
                </div>
                <div className="lp-panel__usage-track">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {panel.type === 'audit' && (
        <ul className="lp-panel__audit">
          {panel.events.map((e) => (
            <li key={`${e.time}-${e.action}`}>
              <time>{e.time}</time>
              <strong>{e.actor}</strong>
              <span>{e.action}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
