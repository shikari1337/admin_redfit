/**
 * "Has this section scrolled into view yet?" — once true, stays true.
 *
 * The dashboard's lower sections (funnels, top lists, stock lists) each cost a
 * request. Nothing below the fold is asked for until the person scrolls
 * towards it (owner, 2026-09-27: "fetch only needed data, it's becoming heavy").
 * A browser without IntersectionObserver answers true immediately.
 */
import { useEffect, useRef, useState } from 'react';

export function useInView<T extends Element = HTMLDivElement>(rootMargin = '240px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}
