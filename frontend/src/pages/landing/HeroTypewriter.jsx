import { useEffect, useState } from 'react';

const PREFIX = 'The operating system for';
const PHRASES = [
  'learning & growth programs.',
  'institutions that scale.',
  'practice, tests & progress.',
  'learning that compounds.',
];

const TYPE_MS = 48;
const DELETE_MS = 28;
const HOLD_MS = 1800;
const GAP_MS = 420;

export default function HeroTypewriter() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('typing'); // typing | holding | deleting

  useEffect(() => {
    const full = `${PREFIX} ${PHRASES[phraseIndex]}`;
    let timer;

    if (mode === 'typing') {
      if (text.length < full.length) {
        timer = setTimeout(() => setText(full.slice(0, text.length + 1)), TYPE_MS);
      } else {
        timer = setTimeout(() => setMode('holding'), HOLD_MS);
      }
    } else if (mode === 'holding') {
      timer = setTimeout(() => setMode('deleting'), 40);
    } else if (mode === 'deleting') {
      // Keep "The operating system for" then wipe the rest; sometimes wipe further for vibe
      const keep = PREFIX.length;
      if (text.length > keep) {
        // Occasionally pause mid-delete for "half written" feel
        const midPause = text.length === Math.floor((full.length + keep) / 2);
        timer = setTimeout(
          () => setText(text.slice(0, -1)),
          midPause ? DELETE_MS + 220 : DELETE_MS,
        );
      } else {
        timer = setTimeout(() => {
          setPhraseIndex((i) => (i + 1) % PHRASES.length);
          setMode('typing');
        }, GAP_MS);
      }
    }

    return () => clearTimeout(timer);
  }, [text, mode, phraseIndex]);

  // Split so the rotating phrase can stay italic once it appears after the prefix
  const showPrefix = text.length <= PREFIX.length;
  const typedPrefix = text.slice(0, Math.min(text.length, PREFIX.length));
  const typedRest = text.length > PREFIX.length ? text.slice(PREFIX.length) : '';

  return (
    <h1 className="landing-hero__title landing-hero__title--type landing-anim" style={{ '--anim-i': 1 }}>
      <span className="sr-only">
        The operating system for learning &amp; growth programs.
      </span>
      <span aria-hidden className="landing-hero__type-line">
        {showPrefix ? (
          typedPrefix
        ) : (
          <>
            {typedPrefix}
            <em>{typedRest}</em>
          </>
        )}
        <span className="landing-hero__caret" />
      </span>
    </h1>
  );
}
