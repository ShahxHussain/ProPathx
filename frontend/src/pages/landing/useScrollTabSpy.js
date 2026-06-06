import { useCallback, useEffect, useRef, useState } from 'react';

const MOBILE_MQ = '(max-width: 1000px)';

function isMobileScrollLayout() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;
}

function getScrollOffset(node) {
  const header = document.querySelector('.landing-header');
  const headerH = header?.getBoundingClientRect().height ?? 72;

  if (isMobileScrollLayout()) {
    return headerH + 12;
  }

  const scrollRoot = node.closest('.lp-platform__scroll, .lp-roles__scroll');
  const sticky = scrollRoot?.querySelector('.lp-platform__sticky, .lp-roles__sticky');
  const stickyH = sticky?.getBoundingClientRect().height ?? 0;
  return headerH + stickyH + 16;
}

function visibleHeight(rect, viewportH) {
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, viewportH);
  return Math.max(0, bottom - top);
}

function pickTriggerNode(stepEl) {
  return stepEl.querySelector('.lp-scroll-step__trigger') || stepEl;
}

/** Syncs active tab with scroll; mobile uses pinned panel + full-height triggers. */
export function useScrollTabSpy(tabs) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');
  const stepRefs = useRef([]);
  const scrollLockUntil = useRef(0);
  const rafId = useRef(0);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const setStepRef = useCallback(
    (index) => (node) => {
      stepRefs.current[index] = node;
    },
    []
  );

  const scrollToTab = useCallback(
    (tabId) => {
      const index = tabs.findIndex((t) => t.id === tabId);
      const node = stepRefs.current[index];
      if (index < 0 || !node) return;

      scrollLockUntil.current = Date.now() + 1200;
      activeIdRef.current = tabId;
      setActiveId(tabId);

      const target = pickTriggerNode(node);
      const top = target.getBoundingClientRect().top + window.scrollY - getScrollOffset(node);
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    },
    [tabs]
  );

  useEffect(() => {
    const nodes = stepRefs.current.filter(Boolean);
    if (!nodes.length) return undefined;

    const pickActive = () => {
      if (Date.now() < scrollLockUntil.current) return;

      const viewportH = window.innerHeight;
      const currentId = activeIdRef.current;
      const mobile = isMobileScrollLayout();
      let bestId = tabs[0]?.id;

      if (mobile) {
        const marker = viewportH * 0.45;
        let matched = false;

        nodes.forEach((node) => {
          const id = node.dataset.tabId;
          if (!id) return;
          const rect = pickTriggerNode(node).getBoundingClientRect();
          if (rect.top <= marker && rect.bottom > marker) {
            bestId = id;
            matched = true;
          }
        });

        if (!matched) {
          const lastNode = nodes[nodes.length - 1];
          const lastId = lastNode?.dataset.tabId;
          const lastRect = lastNode ? pickTriggerNode(lastNode).getBoundingClientRect() : null;
          if (lastId && lastRect && lastRect.top < marker) {
            bestId = lastId;
          }
        }
      } else {
        let bestScore = -1;

        nodes.forEach((node) => {
          const id = node.dataset.tabId;
          if (!id) return;

          const rect = node.getBoundingClientRect();
          let score = visibleHeight(rect, viewportH);

          if (id === currentId) {
            score *= 1.18;
          }

          if (score > bestScore) {
            bestScore = score;
            bestId = id;
          }
        });
      }

      if (bestId && bestId !== currentId) {
        activeIdRef.current = bestId;
        setActiveId(bestId);
      }
    };

    const schedulePick = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(pickActive);
    };

    schedulePick();
    window.addEventListener('scroll', schedulePick, { passive: true });
    window.addEventListener('resize', schedulePick, { passive: true });

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener('scroll', schedulePick);
      window.removeEventListener('resize', schedulePick);
    };
  }, [tabs]);

  return { activeId, setStepRef, scrollToTab };
}
