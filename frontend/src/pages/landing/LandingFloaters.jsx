import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, MessageCircle } from 'lucide-react';
import { SUPPORT_WHATSAPP } from './data';

const WA_URL = `https://wa.me/${SUPPORT_WHATSAPP.phone}?text=${encodeURIComponent(SUPPORT_WHATSAPP.message)}`;

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 720px)');
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return coarse;
}

export default function LandingFloaters() {
  const mobileLike = useCoarsePointer();
  const [showTop, setShowTop] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [topOpen, setTopOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileLike) {
      setSupportOpen(false);
      setTopOpen(false);
      return undefined;
    }
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setSupportOpen(false);
        setTopOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [mobileLike]);

  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTopOpen(false);
  };

  const onSupportClick = (e) => {
    if (!mobileLike) return;
    if (!supportOpen) {
      e.preventDefault();
      setTopOpen(false);
      setSupportOpen(true);
    }
  };

  const onTopClick = () => {
    if (mobileLike && !topOpen) {
      setSupportOpen(false);
      setTopOpen(true);
      return;
    }
    scrollTop();
  };

  return (
    <div className="lp-floaters" ref={rootRef} aria-label="Page shortcuts">
      <div className={`lp-floater-wrap lp-floater-wrap--support${supportOpen ? ' is-open' : ''}`}>
        <div className="lp-floater__tip lp-floater__tip--mobile" role="status">
          <Bot size={16} strokeWidth={2} aria-hidden />
          <span>
            <strong>Need help?</strong>
            <small>Chat with our agent</small>
          </span>
        </div>

        <a
          className="lp-floater lp-floater--support"
          href={WA_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Contact support on WhatsApp ${SUPPORT_WHATSAPP.display}`}
          aria-expanded={supportOpen}
          onClick={onSupportClick}
        >
          <span className="lp-floater__wave" aria-hidden />
          <span className="lp-floater__wave lp-floater__wave--delay" aria-hidden />

          <span className="lp-floater__core">
            <MessageCircle size={20} strokeWidth={2} />
            <span className="lp-floater__label">Support</span>
          </span>

          <span className="lp-floater__hover lp-floater__hover--desktop" aria-hidden>
            <Bot size={20} strokeWidth={2} />
            <span className="lp-floater__hover-copy">
              <strong>Need help?</strong>
              <small>Chat with our agent</small>
            </span>
          </span>
        </a>
      </div>

      <div className={`lp-floater-wrap lp-floater-wrap--top${showTop ? ' is-visible' : ''}${topOpen ? ' is-open' : ''}`}>
        <div className="lp-floater__tip lp-floater__tip--mobile" role="status">
          <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
          <span>
            <strong>Back to top</strong>
            <small>Return to the start</small>
          </span>
        </div>

        <button
          type="button"
          className="lp-floater lp-floater--top"
          onClick={onTopClick}
          aria-label="Back to top"
          aria-expanded={topOpen}
        >
          <span className="lp-floater__wave" aria-hidden />
          <span className="lp-floater__wave lp-floater__wave--delay" aria-hidden />

          <span className="lp-floater__core">
            <ArrowUp size={18} strokeWidth={2.25} />
            <span className="lp-floater__label">Top</span>
          </span>

          <span className="lp-floater__hover lp-floater__hover--desktop" aria-hidden>
            <ArrowUp size={18} strokeWidth={2.25} />
            <span className="lp-floater__hover-copy">
              <strong>Back to top</strong>
              <small>Return to the start</small>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
