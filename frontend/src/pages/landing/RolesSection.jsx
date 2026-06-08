import { useRef } from 'react';
import { ROLE_STEPS } from './data';
import { useReveal } from './useReveal';
import { useScrollTabSpy } from './useScrollTabSpy';

function RolePreview({ step }) {
  const { panel } = step;

  if (panel.type === 'layers') {
    return (
      <div className="lp-role-panel lp-role-panel--layers">
        <div className="lp-layer-col lp-layer-col--platform">
          <span className="lp-layer-col__badge">Platform layer</span>
          <h4>ProPath global</h4>
          <ul>
            <li>Super Admin</li>
            <li>Platform Subject Expert</li>
            <li>Platform Reviewer</li>
            <li>Support · AI</li>
          </ul>
          <span className="lp-layer-col__meta">Platform team & staff</span>
        </div>
        <div className="lp-layer-bridge" aria-hidden>
          <span />
        </div>
        <div className="lp-layer-col lp-layer-col--org">
          <span className="lp-layer-col__badge">Organization layer</span>
          <h4>Your institute</h4>
          <ul>
            <li>Org Admin</li>
            <li>Your Subject Expert</li>
            <li>Your Reviewer</li>
            <li>Org students</li>
          </ul>
          <span className="lp-layer-col__meta">Institute staff & students</span>
        </div>
        <p className="lp-layer-footnote">
          <strong>+ Individual students</strong> — self-registered learners on a personal subscription, independent of any institute.
        </p>
      </div>
    );
  }

  if (panel.type === 'portal') {
    return (
      <div className="lp-role-panel lp-role-panel--portal">
        <span className="lp-role-panel__scope">{panel.scope}</span>
        <h4>{panel.name}</h4>
        {panel.badge && <span className="lp-role-panel__meta">{panel.badge}</span>}
        <div className="lp-role-panel__portal-mock">
          <div className="lp-role-panel__portal-bar" />
          <div className="lp-role-panel__portal-line lp-role-panel__portal-line--wide" />
          <div className="lp-role-panel__portal-line" />
          <div className="lp-role-panel__portal-line" />
        </div>
      </div>
    );
  }

  if (panel.type === 'dual-role') {
    return (
      <div className="lp-role-panel lp-role-panel--dual">
        <span className="lp-role-panel__scope">{panel.scope}</span>
        <div className="lp-dual-roles">
          {panel.roles.map((role, i) => (
            <div key={role.name} className="lp-dual-role" style={{ '--role-i': i }}>
              <strong>{role.name}</strong>
              <span>{role.duty}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lp-role-panel lp-role-panel--students">
      {panel.types.map((type, i) => (
        <div key={type.name} className={`lp-student-type lp-student-type--${type.color}`} style={{ '--type-i': i }}>
          <strong>{type.name}</strong>
          <span>{type.detail}</span>
        </div>
      ))}
    </div>
  );
}

const LAYER_CHIP_CLASS = {
  overview: 'lp-roles__layer-chip--overview',
  platform: 'lp-roles__layer-chip--platform',
  organization: 'lp-roles__layer-chip--org',
  learners: 'lp-roles__layer-chip--learners',
};

export default function RolesSection() {
  const sectionRef = useRef(null);
  const { ref: revealRef, visible } = useReveal();
  const { activeId, setStepRef, scrollToTab } = useScrollTabSpy(ROLE_STEPS);
  const activeIndex = ROLE_STEPS.findIndex((s) => s.id === activeId);
  const active = ROLE_STEPS[activeIndex >= 0 ? activeIndex : 0] || ROLE_STEPS[0];
  const progressPct = ((activeIndex + 1) / ROLE_STEPS.length) * 100;
  const ActiveIcon = active.icon;

  const mergeRefs = (node) => {
    sectionRef.current = node;
    revealRef.current = node;
  };

  return (
    <section id="roles" ref={mergeRefs} className={`landing-section lp-roles${visible ? ' is-visible' : ''}`}>
      <p className="landing-section__kicker">Roles</p>
      <h2 className="landing-section__title">Every stakeholder gets the right workspace</h2>
      <p className="landing-section__lead">
        Two layers — <strong>platform</strong> and <strong>organization</strong> — plus learners. ProPath&apos;s own
        experts and reviewers maintain the global bank; <strong>your</strong> experts and reviewers run your institute.
        Students can be org-enrolled or independent.
      </p>

      <div className="lp-roles__legend">
        <span className="lp-roles__legend-item lp-roles__legend-item--platform">Platform layer</span>
        <span className="lp-roles__legend-item lp-roles__legend-item--org">Organization layer</span>
        <span className="lp-roles__legend-item lp-roles__legend-item--learners">Learners</span>
      </div>

      <div className="lp-roles__scroll">
        <div className="lp-roles__sticky">
          <div className="lp-roles__tabs lp-tabs--desktop" role="tablist" aria-label="Role workspaces">
            {ROLE_STEPS.map((step, index) => {
              const Icon = step.icon;
              const selected = step.id === activeId;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`role-step-${step.id}`}
                  className={`lp-roles__tab lp-roles__tab--${step.color}${selected ? ' is-active' : ''}`}
                  onClick={() => scrollToTab(step.id)}
                >
                  <span className="lp-roles__tab-index">{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={15} strokeWidth={2} />
                  {step.tabLabel}
                </button>
              );
            })}
          </div>

          <div className={`lp-roles__mobile-tabbar lp-tabs--mobile lp-roles__mobile-tabbar--${active.color}`}>
            <button
              type="button"
              role="tab"
              className={`lp-roles__tab lp-roles__tab--${active.color} is-active`}
              aria-selected
              onClick={() => scrollToTab(active.id)}
            >
              <span className="lp-roles__tab-index">{String(activeIndex + 1).padStart(2, '0')}</span>
              <ActiveIcon size={15} strokeWidth={2} />
              {active.tabLabel}
            </button>
            <span className="lp-pinned__counter">
              {String(activeIndex + 1).padStart(2, '0')} / {String(ROLE_STEPS.length).padStart(2, '0')}
            </span>
          </div>

          <div className="lp-roles__progress" aria-hidden>
            <span className="lp-roles__progress-fill" style={{ '--progress': `${progressPct}%` }} />
          </div>

          <div className="lp-roles__preview" key={activeId}>
            <p className="lp-pinned__kicker">
              {String(activeIndex + 1).padStart(2, '0')} · {active.tabLabel}
            </p>
            <span className={`lp-roles__layer-chip ${LAYER_CHIP_CLASS[active.layer] || ''}`}>
              {active.layerLabel}
            </span>
            <div className="lp-roles__preview-head">
              <span className={`lp-roles__preview-icon lp-roles__preview-icon--${active.color} lp-desktop-chrome`}>
                <ActiveIcon size={20} strokeWidth={2} />
              </span>
              <div className="lp-roles__preview-copy">
                <h3>{active.title}</h3>
                <p>{active.desc}</p>
              </div>
            </div>
            <div className="lp-roles__preview-visual">
              <RolePreview step={active} />
            </div>
            <ul className="lp-roles__step-features lp-roles__preview-features">
              {active.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <p className="lp-roles__scroll-hint">Scroll to walk through each role</p>
        </div>

        <div className="lp-roles__steps" aria-label="Role details">
          {ROLE_STEPS.map((step, index) => (
            <article
              key={step.id}
              id={`role-step-${step.id}`}
              ref={setStepRef(index)}
              data-tab-id={step.id}
              className={`lp-roles__step${step.id === activeId ? ' is-active' : ''}`}
            >
              <div className="lp-scroll-step__desktop">
                <span className={`lp-roles__step-layer ${LAYER_CHIP_CLASS[step.layer] || ''}`}>
                  {step.layerLabel}
                </span>
                <span className="lp-roles__step-kicker">
                  {String(index + 1).padStart(2, '0')} · {step.tabLabel}
                </span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <ul className="lp-roles__step-features">
                  {step.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div className="lp-scroll-step__trigger" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
