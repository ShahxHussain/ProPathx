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
    baseZ: -70,
    title: 'Syllabus tree',
    body: (
      <span>Exam · Subject · Chapter · Topic</span>
    ),
  },
  {
    id: 'mid',
    className: 'lp-3d__plate--mid',
    baseZ: 10,
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
    baseZ: 110,
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
    x: -160,
    y: -90,
    z: 80,
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
    x: 170,
    y: -70,
    z: 120,
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
    x: -140,
    y: 110,
    z: 60,
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
    x: 150,
    y: 100,
    z: 100,
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
    x: 20,
    y: -150,
    z: 40,
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
    x: -20,
    y: 150,
    z: 90,
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
    x: 110,
    y: 20,
    z: 140,
    delay: 0.6,
    tip: {
      title: 'Coming soon',
      text: 'Adaptive practice paths, AI RAG question generation, and an in-product study assistant.',
      badge: 'Future',
      bullets: ['Adaptive engine', 'AI RAG MCQs', 'Study assistant'],
    },
  },
];

const POP_Z = 220;

export default function LandingHero3D() {
  const sceneRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [activePlate, setActivePlate] = useState(null);
  const [activeChip, setActiveChip] = useState(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [12, -12]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-16, 16]), { stiffness: 120, damping: 18 });

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return undefined;

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      mx.set((e.clientX - r.left) / r.width - 0.5);
      my.set((e.clientY - r.top) / r.height - 0.5);
    };
    const onLeave = () => {
      mx.set(0);
      my.set(0);
      setActivePlate(null);
      setActiveChip(null);
      setPaused(false);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [mx, my]);

  const tip = FLOATERS.find((f) => f.id === activeChip)?.tip;
  const tipFloater = FLOATERS.find((f) => f.id === activeChip);

  return (
    <div
      className="lp-3d"
      ref={sceneRef}
      onMouseEnter={() => setPaused(true)}
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
              onMouseEnter={() => setActivePlate(plate.id)}
              onFocus={() => setActivePlate(plate.id)}
              onClick={() => setActivePlate((cur) => (cur === plate.id ? null : plate.id))}
              initial={false}
              animate={{
                z: isUp ? POP_Z : plate.baseZ,
                scale: isUp ? 1.08 : 1,
              }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            >
              {plate.body}
            </motion.button>
          );
        })}

        {FLOATERS.map((f) => {
          const open = activeChip === f.id;
          return (
            <motion.button
              key={f.id}
              type="button"
              className={`lp-3d__chip${f.id === 'roadmap' ? ' lp-3d__chip--roadmap' : ''}${open ? ' is-open' : ''}`}
              style={{ x: f.x, y: f.y, z: open ? f.z + 80 : f.z }}
              animate={
                paused || open
                  ? { y: f.y, scale: open ? 1.08 : 1 }
                  : { y: [f.y - 10, f.y + 10, f.y - 10], scale: 1 }
              }
              transition={{
                y: {
                  duration: 4.5 + f.delay,
                  repeat: open || paused ? 0 : Infinity,
                  ease: 'easeInOut',
                  delay: f.delay,
                },
                scale: { type: 'spring', stiffness: 320, damping: 20 },
                z: { type: 'spring', stiffness: 280, damping: 22 },
              }}
              onMouseEnter={() => setActiveChip(f.id)}
              onFocus={() => setActiveChip(f.id)}
              onClick={(e) => {
                e.stopPropagation();
                setActiveChip((cur) => (cur === f.id ? null : f.id));
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
              initial={{ opacity: 0, scale: 0.86, z: 160 }}
              animate={{
                opacity: 1,
                scale: 1,
                z: 260,
                x: Math.max(-90, Math.min(90, tipFloater.x * 0.35)),
                y: tipFloater.y > 0 ? tipFloater.y - 70 : tipFloater.y + 50,
              }}
              exit={{ opacity: 0, scale: 0.9, z: 160 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
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
