import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { PLATFORM_TABS } from './data';
import { useReveal } from './useReveal';
import { useScrollTabSpy } from './useScrollTabSpy';

function PlatformPanel({ tab }) {
  const { panel } = tab;

  if (panel.type === 'hierarchy') {
    return (
      <div className="lp-platform-panel lp-platform-panel--hierarchy">
        {panel.items.map((item, i) => (
          <div key={item.name} className="lp-hierarchy-row" style={{ '--row-i': i }}>
            <span className="lp-hierarchy-level">{item.level}</span>
            <div className="lp-hierarchy-body">
              <strong>{item.name}</strong>
              <span>{item.count}</span>
            </div>
            {i < panel.items.length - 1 && <span className="lp-hierarchy-connector" aria-hidden />}
          </div>
        ))}
      </div>
    );
  }

  if (panel.type === 'test-flow') {
    return (
      <div className="lp-platform-panel lp-platform-panel--flow">
        {panel.steps.map((step, i) => (
          <div key={step.label} className={`lp-flow-step lp-flow-step--${step.status}`} style={{ '--step-i': i }}>
            <span className="lp-flow-step__dot" />
            <span className="lp-flow-step__label">{step.label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (panel.type === 'usage') {
    return (
      <div className="lp-platform-panel lp-platform-panel--usage">
        {panel.rows.map((row, i) => {
          const pct = Math.round((row.used / row.max) * 100);
          return (
            <div key={row.label} className="lp-usage-row" style={{ '--row-i': i }}>
              <div className="lp-usage-row__head">
                <span>{row.label}</span>
                <strong>
                  {row.used} / {row.max}
                </strong>
              </div>
              <div className="lp-usage-row__track">
                <span className="lp-usage-row__fill" style={{ '--pct': `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="lp-platform-panel lp-platform-panel--audit">
      {panel.events.map((event, i) => (
        <div key={`${event.actor}-${event.time}`} className="lp-audit-row" style={{ '--row-i': i }}>
          <span className="lp-audit-row__time">{event.time}</span>
          <div>
            <strong>{event.actor}</strong>
            <span>{event.action}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PlatformSection() {
  const sectionRef = useRef(null);
  const { ref: revealRef, visible } = useReveal();
  const { activeId, setStepRef, scrollToTab } = useScrollTabSpy(PLATFORM_TABS);
  const activeIndex = PLATFORM_TABS.findIndex((t) => t.id === activeId);
  const active = PLATFORM_TABS[activeIndex >= 0 ? activeIndex : 0] || PLATFORM_TABS[0];
  const progressPct = ((activeIndex + 1) / PLATFORM_TABS.length) * 100;
  const ActiveIcon = active.icon;

  const mergeRefs = (node) => {
    sectionRef.current = node;
    revealRef.current = node;
  };

  return (
    <section id="platform" ref={mergeRefs} className={`landing-section lp-platform${visible ? ' is-visible' : ''}`}>
      <p className="landing-section__kicker">Platform</p>
      <h2 className="landing-section__title">Built for programs that scale</h2>
      <p className="landing-section__lead">
        From exam hierarchies and verified question banks to subscriptions, enrollments, and audit trails —
        ProPath maps to how real learning programs operate — from syllabus to mastery.
      </p>

      <div className="lp-platform__scroll">
        <div className="lp-platform__sticky">
          <div className="lp-platform__tabs lp-tabs--desktop" role="tablist" aria-label="Platform capabilities">
            {PLATFORM_TABS.map((tab, index) => {
              const Icon = tab.icon;
              const selected = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`platform-step-${tab.id}`}
                  className={`lp-platform__tab${selected ? ' is-active' : ''}`}
                  onClick={() => scrollToTab(tab.id)}
                >
                  <span className="lp-platform__tab-index">{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={16} strokeWidth={2} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="lp-platform__mobile-tabbar lp-tabs--mobile">
            <button
              type="button"
              role="tab"
              className="lp-platform__tab is-active"
              aria-selected
              onClick={() => scrollToTab(active.id)}
            >
              <span className="lp-platform__tab-index">{String(activeIndex + 1).padStart(2, '0')}</span>
              <ActiveIcon size={16} strokeWidth={2} />
              {active.label}
            </button>
            <span className="lp-pinned__counter">
              {String(activeIndex + 1).padStart(2, '0')} / {String(PLATFORM_TABS.length).padStart(2, '0')}
            </span>
          </div>

          <div className="lp-platform__progress" aria-hidden>
            <span className="lp-platform__progress-fill" style={{ '--progress': `${progressPct}%` }} />
          </div>

          <div className="lp-platform__preview" key={activeId}>
            <p className="lp-pinned__kicker">
              {String(activeIndex + 1).padStart(2, '0')} · {active.label}
            </p>
            <div className="lp-platform__preview-copy">
              <h3>{active.title}</h3>
              <p>{active.desc}</p>
              <div className="lp-platform__nodes">
                {active.nodes.map((node, i) => (
                  <span key={node} className="lp-platform__node" style={{ '--node-i': i }}>
                    {node}
                    {i < active.nodes.length - 1 && <ArrowRight size={12} aria-hidden />}
                  </span>
                ))}
              </div>
            </div>
            <div className="lp-platform__visual">
              <PlatformPanel tab={active} />
            </div>
            <ul className="lp-platform__highlights lp-platform__preview-highlights">
              {active.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="lp-platform__scroll-hint">Scroll to explore each capability</p>
        </div>

        <div className="lp-platform__steps" aria-label="Platform capability details">
          {PLATFORM_TABS.map((tab, index) => (
            <article
              key={tab.id}
              id={`platform-step-${tab.id}`}
              ref={setStepRef(index)}
              data-tab-id={tab.id}
              className={`lp-platform__step${tab.id === activeId ? ' is-active' : ''}`}
            >
              <div className="lp-scroll-step__desktop">
                <span className="lp-platform__step-kicker">
                  {String(index + 1).padStart(2, '0')} · {tab.label}
                </span>
                <h3>{tab.title}</h3>
                <p>{tab.desc}</p>
                <ul className="lp-platform__highlights">
                  {tab.highlights.map((item) => (
                    <li key={item}>{item}</li>
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
