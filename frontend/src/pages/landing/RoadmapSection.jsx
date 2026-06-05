import { useState } from 'react';
import { Sparkles, Zap } from 'lucide-react';
import { ROADMAP_ITEMS } from './data';
import { useReveal } from './useReveal';

function RoadmapPreview({ item }) {
  const { preview } = item;

  if (preview.type === 'adaptive') {
    return (
      <div className="lp-roadmap-preview lp-roadmap-preview--adaptive">
        <div className="lp-roadmap-preview__head">
          <span>Mastery snapshot</span>
          <span className="lp-soon-pill">Calibration phase</span>
        </div>
        <ul className="lp-mastery-list">
          {preview.mastery.map((row, i) => (
            <li key={row.topic} style={{ '--row-i': i }}>
              <div className="lp-mastery-list__top">
                <span>{row.topic}</span>
                <strong>{row.score}%</strong>
              </div>
              <div className="lp-mastery-list__track">
                <span style={{ '--pct': `${row.score}%` }} />
              </div>
              <span className={`lp-mastery-list__trend${row.trend === 'Focus' ? ' is-focus' : ''}`}>{row.trend}</span>
            </li>
          ))}
        </ul>
        <p className="lp-roadmap-preview__footnote">
          <Zap size={13} />
          {preview.next}
        </p>
      </div>
    );
  }

  if (preview.type === 'rag') {
    return (
      <div className="lp-roadmap-preview lp-roadmap-preview--rag">
        <div className="lp-rag-source">
          <span className="lp-rag-source__label">Context source</span>
          <p>{preview.source}</p>
        </div>
        <div className="lp-rag-arrow" aria-hidden>
          <Sparkles size={16} />
        </div>
        <div className="lp-rag-output">
          <span className="lp-rag-output__badge">{preview.output.difficulty}</span>
          <p className="lp-rag-output__q">{preview.output.question}</p>
          <ul>
            {preview.output.options.map((opt, i) => (
              <li key={opt}>
                <span>{String.fromCharCode(65 + i)}.</span> {opt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-roadmap-preview lp-roadmap-preview--assistant">
      <ul className="lp-chat">
        {preview.messages.map((msg, i) => (
          <li key={i} className={`lp-chat__bubble lp-chat__bubble--${msg.role}`} style={{ '--msg-i': i }}>
            {msg.text}
          </li>
        ))}
      </ul>
      <div className="lp-chat__input" aria-hidden>
        <span>Ask about any question or topic…</span>
      </div>
    </div>
  );
}

export default function RoadmapSection() {
  const [activeId, setActiveId] = useState(ROADMAP_ITEMS[0].id);
  const { ref, visible } = useReveal();
  const active = ROADMAP_ITEMS.find((r) => r.id === activeId) || ROADMAP_ITEMS[0];
  const ActiveIcon = active.icon;

  return (
    <section id="roadmap" ref={ref} className={`landing-section lp-roadmap${visible ? ' is-visible' : ''}`}>
      <div className="lp-roadmap__intro">
        <p className="landing-section__kicker">Roadmap</p>
        <h2 className="landing-section__title">What&apos;s next — personalized learning &amp; AI</h2>
        <p className="landing-section__lead">
          ProPath already ships structured syllabi, practice, and governance. These modules extend the same
          hierarchy into adaptive paths, AI-assisted content, and learner guidance.
        </p>
      </div>

      <div className="lp-roadmap__layout">
        <div className="lp-roadmap__list" role="tablist" aria-label="Upcoming features">
          {ROADMAP_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`lp-roadmap__card${selected ? ' is-active' : ''}`}
                onClick={() => setActiveId(item.id)}
              >
                <span className="lp-roadmap__badge">{item.badge}</span>
                <span className="lp-roadmap__card-icon">
                  <Icon size={20} strokeWidth={2} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.tagline}</p>
              </button>
            );
          })}
        </div>

        <div className="lp-roadmap__panel" key={activeId}>
          <div className="lp-roadmap__panel-head">
            <span className="lp-roadmap__panel-icon">
              <ActiveIcon size={22} strokeWidth={2} />
            </span>
            <div>
              <h3>{active.title}</h3>
              <p>{active.desc}</p>
            </div>
          </div>
          <ul className="lp-roadmap__features">
            {active.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <RoadmapPreview item={active} />
        </div>
      </div>
    </section>
  );
}
