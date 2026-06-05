import { useCallback, useEffect, useRef, useState } from 'react';



const TABLET_MQ = '(max-width: 1000px)';



function getMarkerRatio() {

  if (typeof window === 'undefined') return 0.5;

  return window.matchMedia(TABLET_MQ).matches ? 0.68 : 0.5;

}



function getScrollOffset(node) {

  const header = document.querySelector('.landing-header');

  const headerH = header?.getBoundingClientRect().height ?? 72;

  const scrollRoot = node.closest('.lp-platform__scroll, .lp-roles__scroll');

  const sticky = scrollRoot?.querySelector('.lp-platform__sticky, .lp-roles__sticky');

  const stickyH = sticky?.getBoundingClientRect().height ?? 0;

  return headerH + stickyH + 12;

}



/** Syncs active tab with scroll position; click tab scrolls to matching step. */

export function useScrollTabSpy(tabs) {

  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');

  const stepRefs = useRef([]);

  const scrollLockUntil = useRef(0);

  const rafId = useRef(0);



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



      scrollLockUntil.current = Date.now() + 900;

      setActiveId(tabId);



      const top = node.getBoundingClientRect().top + window.scrollY - getScrollOffset(node);

      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    },

    [tabs]

  );



  useEffect(() => {

    const nodes = stepRefs.current.filter(Boolean);

    if (!nodes.length) return undefined;



    const pickActive = () => {

      if (Date.now() < scrollLockUntil.current) return;



      const marker = window.innerHeight * getMarkerRatio();

      let bestId = tabs[0]?.id;

      let bestDist = Infinity;



      nodes.forEach((node) => {

        const id = node.dataset.tabId;

        if (!id) return;



        const rect = node.getBoundingClientRect();

        const anchor = rect.top + rect.height * 0.32;

        const dist = Math.abs(anchor - marker);



        if (dist < bestDist) {

          bestDist = dist;

          bestId = id;

        }

      });



      if (bestId) {

        setActiveId((prev) => (prev === bestId ? prev : bestId));

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


