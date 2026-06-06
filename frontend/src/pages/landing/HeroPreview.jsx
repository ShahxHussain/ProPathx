import { Layers } from 'lucide-react';
import { PREVIEW_ACTIVITY, PREVIEW_CHART, PREVIEW_NAV, PREVIEW_STATS } from './data';

export default function HeroPreview() {
  return (
    <div className="lp-preview">
      <div className="lp-preview__glow" aria-hidden />
      <div className="lp-preview__chrome">
        <div className="lp-preview__dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="lp-preview__url">
          <span className="lp-preview__url-lock" aria-hidden />
          app.propath.io/org/dashboard
        </div>
      </div>

      <div className="lp-preview__app">
        <aside className="lp-preview__sidebar">
          <div className="lp-preview__brand">
            <Layers size={16} strokeWidth={2.25} />
            <span>ProPath</span>
          </div>
          <div className="lp-preview__org">
            <span className="lp-preview__org-name">Northbridge Medical Institute</span>
          </div>
          <nav className="lp-preview__nav" aria-label="Org portal navigation">
            {PREVIEW_NAV.map(({ icon: Icon, label, active }) => (
              <div key={label} className={`lp-preview__nav-item${active ? ' is-active' : ''}`}>
                <Icon size={14} strokeWidth={active ? 2.25 : 1.75} />
                <span>{label}</span>
              </div>
            ))}
          </nav>
        </aside>

        <div className="lp-preview__main">
          <header className="lp-preview__header">
            <div>
              <span className="lp-preview__kicker">Overview</span>
              <h3>Dashboard</h3>
              <p>Northbridge Medical Institute</p>
            </div>
            <span className="lp-preview__live">
              <span className="lp-preview__live-dot" />
              Live
            </span>
          </header>

          <div className="lp-preview__stats">
            {PREVIEW_STATS.map(({ label, value, delta, icon: Icon }, i) => (
              <div key={label} className="lp-preview__stat" style={{ '--stat-i': i }}>
                <span className="lp-preview__stat-icon">
                  <Icon size={14} strokeWidth={2} />
                </span>
                <span className="lp-preview__stat-label">{label}</span>
                <span className="lp-preview__stat-value">{value}</span>
                <span className="lp-preview__stat-delta">{delta}</span>
              </div>
            ))}
          </div>

          <div className="lp-preview__panels">
            <div className="lp-preview__chart-panel">
              <div className="lp-preview__panel-head">
                <span>Test attempts</span>
                <strong>+24%</strong>
              </div>
              <div className="lp-preview__chart" aria-hidden>
                {PREVIEW_CHART.map((h, i) => (
                  <span key={i} className="lp-preview__bar" style={{ '--h': `${h}%`, '--bar-i': i }} />
                ))}
              </div>
            </div>

            <div className="lp-preview__activity-panel">
              <div className="lp-preview__panel-head">
                <span>Recent activity</span>
              </div>
              <ul className="lp-preview__activity">
                {PREVIEW_ACTIVITY.map((item) => (
                  <li key={item.text}>
                    <span className="lp-preview__activity-time">{item.time}</span>
                    <span className="lp-preview__activity-text">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
