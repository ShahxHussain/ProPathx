const SPRINKLES = Array.from({ length: 14 }, (_, i) => ({
  id: `s-${i}`,
  left: `${12 + ((i * 41) % 76)}%`,
  top: `${6 + ((i * 29) % 42)}%`,
  size: 2 + (i % 2),
  delay: `${((i * 0.65) % 7).toFixed(2)}s`,
  duration: `${(3.5 + (i % 3) * 0.8).toFixed(2)}s`,
  tone: i % 3 === 0 ? 'sky' : 'soft',
}));

/** Decorative animated backdrop — soft orbs, light sprinkles. */
export default function LandingBackground() {
  return (
    <div className="lp-bg" aria-hidden>
      <div className="lp-bg__base" />
      <div className="lp-bg__aurora" />
      <div className="lp-bg__grid" />
      <div className="lp-bg__orb lp-bg__orb--navy" />
      <div className="lp-bg__orb lp-bg__orb--sky" />
      <div className="lp-bg__beam" />
      <div className="lp-bg__shimmer" />
      <div className="lp-bg__shimmer lp-bg__shimmer--delayed" />
      <div className="lp-bg__shimmer lp-bg__shimmer--low" />

      <div className="lp-bg__sprinkles">
        {SPRINKLES.map((s) => (
          <span
            key={s.id}
            className={`lp-bg__sprinkle lp-bg__sprinkle--${s.tone}`}
            style={{
              '--sx': s.left,
              '--sy': s.top,
              '--ss': `${s.size}px`,
              '--sdelay': s.delay,
              '--sdur': s.duration,
            }}
          />
        ))}
      </div>

      <div className="lp-bg__grain" />
    </div>
  );
}
