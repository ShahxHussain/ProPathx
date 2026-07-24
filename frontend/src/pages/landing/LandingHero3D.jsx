import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  BarChart3,
  BookOpenCheck,
  Brain,
  ClipboardList,
  GraduationCap,
  Layers,
  Shield,
  Sparkles,
} from 'lucide-react';

const PLATES = [
  {
    id: 'back',
    className: 'lp-3d__plate--back',
    baseZ: -40,
    title: 'Syllabus tree',
    body: <span>Exam · Subject · Chapter · Topic</span>,
  },
  {
    id: 'mid',
    className: 'lp-3d__plate--mid',
    baseZ: 8,
    title: 'Live cohort',
    body: (
      <>
        <div className="lp-3d__mid-head">
          <span className="lp-3d__dot" />
          <span>Live cohort</span>
        </div>
        <div className="lp-3d__bars" aria-hidden>
          {[42, 68, 55, 82, 74, 91, 63, 88].map((h, i) => (
            <i key={i} style={{ '--h': `${h}%`, '--d': `${i * 0.08}s` }} />
          ))}
        </div>
      </>
    ),
  },
  {
    id: 'front',
    className: 'lp-3d__plate--front',
    baseZ: 56,
    title: 'Learning OS',
    body: (
      <>
        <p className="lp-3d__front-kicker">Build → Assign → Attempt → Analyze</p>
        <h3>Learning OS</h3>
        <ul>
          <li><strong>248</strong> students active</li>
          <li><strong>36</strong> tests in flight</li>
          <li><strong>84%</strong> avg score</li>
        </ul>
      </>
    ),
  },
];

const FLOATERS = [
  {
    id: 'syllabus',
    icon: Layers,
    label: 'Syllabus',
    x: -150,
    y: -78,
    z: 48,
    mx: -92,
    my: -108,
    delay: 0,
    tip: {
      title: 'Structured syllabus',
      text: 'Exam → Subject → Chapter → Topic. Every question and score maps to this tree.',
    },
  },
  {
    id: 'tests',
    icon: ClipboardList,
    label: 'Tests',
    x: 150,
    y: -62,
    z: 64,
    mx: 88,
    my: -108,
    delay: 0.4,
    tip: {
      title: 'Scheduled & open',
      text: 'Create windows with Start/End times, or leave tests open — then assign to groups.',
    },
  },
  {
    id: 'learners',
    icon: GraduationCap,
    label: 'Learners',
    x: -132,
    y: 96,
    z: 40,
    mx: -100,
    my: 118,
    delay: 0.8,
    tip: {
      title: 'Student portals',
      text: 'Org-enrolled and individual learners attempt, track mastery, and get explanations.',
    },
  },
  {
    id: 'analytics',
    icon: BarChart3,
    label: 'Analytics',
    x: 138,
    y: 88,
    z: 52,
    mx: 96,
    my: 118,
    delay: 1.2,
    tip: {
      title: 'Test analytics',
      text: 'Scores, subject mix, difficulty, completion, and missed status — one hub for every test type.',
    },
  },
  {
    id: 'tenants',
    icon: Shield,
    label: 'Tenants',
    x: 8,
    y: -128,
    z: 28,
    mx: -40,
    my: 148,
    delay: 0.2,
    tip: {
      title: 'Multi-tenant safe',
      text: 'Each institute stays isolated — staff, students, banks, and logs scoped to your org.',
    },
  },
  {
    id: 'bank',
    icon: BookOpenCheck,
    label: 'Bank',
    x: -8,
    y: 128,
    z: 44,
    mx: 36,
    my: 148,
    delay: 1.0,
    tip: {
      title: 'Question bank',
      text: 'Author, review, and verify MCQs with LaTeX, difficulty tags, and audit trails.',
    },
  },
  {
    id: 'roadmap',
    icon: Brain,
    label: 'Roadmap',
    x: 98,
    y: 12,
    z: 72,
    mx: 0,
    my: -138,
    delay: 0.6,
    tip: {
      title: 'Coming soon',
      text: 'Adaptive practice paths, AI RAG question generation, and an in-product study assistant.',
      badge: 'Future',
      bullets: ['Adaptive engine', 'AI RAG MCQs', 'Study assistant'],
    },
  },
];

/** Gentle pop — keep progression low */
const POP_Z = 118;
const POP_SCALE = 1.035;
const CHIP_POP = 28;

function useIsNarrow(breakpoint = 720) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return narrow;
}

export default function LandingHero3D() {
  const sceneRef = useRef(null);
  const narrow = useIsNarrow();
  const [paused, setPaused] = useState(false);
  const [activePlate, setActivePlate] = useState(null);
  const [activeChip, setActiveChip] = useState(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  // Soft tilt — low progression
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), { stiffness: 90, damping: 22 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 90, damping: 22 });

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return undefined;

    const onMove = (e) => {
      // Skip continuous tilt while finger is dragging a button on coarse pointers
      if (e.pointerType === 'touch' && e.target.closest?.('.lp-3d__plate, .lp-3d__chip')) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      // Soften further on mobile
      const damp = e.pointerType === 'touch' ? 0.45 : 0.7;
      mx.set(px * damp);
      my.set(py * damp);
    };

    const onLeave = () => {
      mx.set(0);
      my.set(0);
      setPaused(false);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [mx, my]);

  const selectPlate = (id) => {
    setActiveChip(null);
    setActivePlate((cur) => (cur === id ? null : id));
  };

  const selectChip = (id) => {
    setActivePlate(null);
    setActiveChip((cur) => (cur === id ? null : id));
  };

  const tip = FLOATERS.find((f) => f.id === activeChip)?.tip;
  const tipFloater = FLOATERS.find((f) => f.id === activeChip);

  return (
    <div
      className={`lp-3d${narrow ? ' lp-3d--narrow' : ''}`}
      ref={sceneRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        // Keep tip/plate on touch until next tap; clear on desktop leave
        if (!window.matchMedia('(hover: hover)').matches) return;
        setActivePlate(null);
        setActiveChip(null);
      }}
    >
      <div className="lp-3d__glow" aria-hidden />
      <div className="lp-3d__ring lp-3d__ring--a" aria-hidden />
      <div className="lp-3d__ring lp-3d__ring--b" aria-hidden />

      <motion.div className="lp-3d__scene" style={{ rotateX: rx, rotateY: ry }}>
        {PLATES.map((plate) => {
          const isUp = activePlate === plate.id;
          return (
            <motion.button
              key={plate.id}
              type="button"
              className={`lp-3d__plate ${plate.className}${isUp ? ' is-up' : ''}${activePlate && !isUp ? ' is-dim' : ''}`}
              aria-label={plate.title}
              aria-pressed={isUp}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setActivePlate(plate.id);
              }}
              onFocus={() => setActivePlate(plate.id)}
              onClick={() => selectPlate(plate.id)}
              initial={false}
              animate={{
                z: isUp ? POP_Z : plate.baseZ,
                scale: isUp ? POP_SCALE : 1,
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            >
              {plate.body}
            </motion.button>
          );
        })}

        {FLOATERS.map((f) => {
          const open = activeChip === f.id;
          const x = narrow ? f.mx : f.x;
          const y = narrow ? f.my : f.y;
          const floatAmt = narrow ? 5 : 7;
          return (
            <motion.button
              key={f.id}
              type="button"
              className={`lp-3d__chip${f.id === 'roadmap' ? ' lp-3d__chip--roadmap' : ''}${open ? ' is-open' : ''}`}
              style={{ x, y, z: open ? f.z + CHIP_POP : f.z }}
              animate={
                paused || open
                  ? { y, scale: open ? 1.04 : 1 }
                  : { y: [y - floatAmt, y + floatAmt, y - floatAmt], scale: 1 }
              }
              transition={{
                y: {
                  duration: 5 + f.delay,
                  repeat: open || paused ? 0 : Infinity,
                  ease: 'easeInOut',
                  delay: f.delay,
                },
                scale: { type: 'spring', stiffness: 260, damping: 24 },
                z: { type: 'spring', stiffness: 220, damping: 24 },
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setActiveChip(f.id);
              }}
              onFocus={() => setActiveChip(f.id)}
              onClick={(e) => {
                e.stopPropagation();
                selectChip(f.id);
              }}
            >
              <f.icon size={14} strokeWidth={2} aria-hidden />
              {f.label}
              {f.id === 'roadmap' && <Sparkles size={12} aria-hidden />}
            </motion.button>
          );
        })}

        <AnimatePresence>
          {tip && tipFloater && (
            <motion.div
              key={tipFloater.id}
              className={`lp-3d__tip${tipFloater.id === 'roadmap' ? ' lp-3d__tip--roadmap' : ''}`}
              initial={{ opacity: 0, scale: 0.94, z: 90 }}
              animate={{
                opacity: 1,
                scale: 1,
                z: 140,
                x: narrow ? 0 : Math.max(-70, Math.min(70, tipFloater.x * 0.28)),
                y: narrow ? -20 : (tipFloater.y > 0 ? tipFloater.y - 58 : tipFloater.y + 42),
              }}
              exit={{ opacity: 0, scale: 0.96, z: 90 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              role="status"
            >
              {tip.badge && <span className="lp-3d__tip-badge">{tip.badge}</span>}
              <strong>{tip.title}</strong>
              <p>{tip.text}</p>
              {tip.bullets && (
                <ul className="lp-3d__tip-list">
                  {tip.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="lp-3d__cube lp-3d__cube--1" aria-hidden>
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="lp-3d__cube lp-3d__cube--2" aria-hidden>
          <span /><span /><span /><span /><span /><span />
        </div>
      </motion.div>
    </div>
  );
}
