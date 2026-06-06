import { useState } from 'react';
import { ArrowRight, Check, Sparkles, Zap } from 'lucide-react';
import { ROADMAP_ITEMS } from './data';
import { useReveal } from './useReveal';

function RoadmapPreview({ item }) {
  const { preview } = item;

  if (preview.type === 'adaptive') {
    return (
      <div className="lp-rm-preview lp-rm-preview--adaptive">
        <div className="lp-rm-preview__chrome">
          <span className="lp-rm-preview__dot" />
          <span className="lp-rm-preview__dot" />
          <span className="lp-rm-preview__dot" />
          <span className="lp-rm-preview__chrome-title">Mastery snapshot</span>
          <span className="lp-rm-preview__chip">Calibration phase</span>
        </div>
        <ul className="lp-rm-mastery">
          {preview.mastery.map((row, i) => (
            <li key={row.topic} style={{ '--row-i': i }}>
              <div className="lp-rm-mastery__row">
                <span className="lp-rm-mastery__topic">{row.topic}</span>
                <div className="lp-rm-mastery__stats">
                  <strong>{row.score}%</strong>
                  <span className={`lp-rm-mastery__trend${row.trend === 'Focus' ? ' is-focus' : ''}`}>
                    {row.trend}
                  </span>
                </div>
              </div>
              <div className="lp-rm-mastery__track">
                <span style={{ '--pct': `${row.score}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <div className="lp-rm-preview__next">
          <Zap size={14} aria-hidden />
          <span>{preview.next}</span>
        </div>
      </div>
    );
  }

  if (preview.type === 'rag') {
    return (
      <div className="lp-rm-preview lp-rm-preview--rag">
        <div className="lp-rm-rag">
          <div className="lp-rm-rag__col">
            <span className="lp-rm-rag__label">Context source</span>
            <p>{preview.source}</p>
          </div>
          <div className="lp-rm-rag__bridge" aria-hidden>
            <Sparkles size={15} />
          </div>
          <div className="lp-rm-rag__col lp-rm-rag__col--out">
            <span className="lp-rm-rag__badge">{preview.output.difficulty}</span>
            <p className="lp-rm-rag__question">{preview.output.question}</p>
            <ul>
              {preview.output.options.map((opt, i) => (
                <li key={opt}>
                  <span>{String.fromCharCode(65 + i)}</span>
                  {opt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-rm-preview lp-rm-preview--assistant">
      <div className="lp-rm-preview__chrome">
        <span className="lp-rm-preview__dot" />
        <span className="lp-rm-preview__dot" />
        <span className="lp-rm-preview__dot" />
        <span className="lp-rm-preview__chrome-title">Study assistant</span>
      </div>
      <ul className="lp-rm-chat">
        {preview.messages.map((msg, i) => (
          <li key={i} className={`lp-rm-chat__msg lp-rm-chat__msg--${msg.role}`} style={{ '--msg-i': i }}>
            {msg.text}
          </li>
        ))}
      </ul>
      <div className="lp-rm-chat__composer" aria-hidden>
        Ask about any question or topic…
      </div>
    </div>
  );
}

export default function RoadmapSection() {
  const [activeId, setActiveId] = useState(ROADMAP_ITEMS[0].id);
  const { ref, visible } = useReveal();
  const active = ROADMAP_ITEMS.find((r) => r.id === activeId) || ROADMAP_ITEMS[0];
  const activeIndex = ROADMAP_ITEMS.findIndex((r) => r.id === activeId);

  return (
    <section id="roadmap" ref={ref} className={`landing-section lp-roadmap${visible ? ' is-visible' : ''}`}>
      <div className="lp-roadmap__intro">
        <p className="landing-section__kicker">Roadmap</p>
        <h2 className="landing-section__title">
          What&apos;s next — <em>personalized learning &amp; AI</em>
        </h2>
        <p className="landing-section__lead">
          ProPath already ships structured syllabi, practice, and governance. These modules extend the same
          hierarchy into adaptive paths, AI-assisted content, and learner guidance.
        </p>
      </div>

      <div className="lp-roadmap__shell">
        <div className="lp-roadmap__tabs" role="tablist" aria-label="Upcoming features">
          {ROADMAP_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`lp-roadmap__tab${selected ? ' is-active' : ''}`}
                onClick={() => setActiveId(item.id)}
              >
                <span className="lp-roadmap__tab-num">{String(index + 1).padStart(2, '0')}</span>
                <Icon size={16} strokeWidth={2} aria-hidden />
                <span className="lp-roadmap__tab-label">{item.title}</span>
              </button>
            );
          })}
        </div>

        <div className="lp-roadmap__panel" key={activeId}>
          <div className="lp-roadmap__panel-grid">
            <div className="lp-roadmap__copy">
              <div className="lp-roadmap__copy-head">
                <span className="lp-roadmap__soon">Coming soon</span>
                <h3>{active.title}</h3>
                <p>{active.desc}</p>
              </div>
              <ul className="lp-roadmap__features">
                {active.features.map((feature) => (
                  <li key={feature}>
                    <Check size={14} strokeWidth={2.5} aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="lp-roadmap__tagline">
                <ArrowRight size={14} aria-hidden />
                {active.tagline}
              </p>
            </div>

            <div className="lp-roadmap__preview-wrap">
              <span className="lp-roadmap__preview-label">Product preview</span>
              <RoadmapPreview item={active} />
            </div>
          </div>

          <div
            className="lp-roadmap__progress"
            role="presentation"
            aria-hidden
          >
            <span style={{ '--rm-progress': `${((activeIndex + 1) / ROADMAP_ITEMS.length) * 100}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
