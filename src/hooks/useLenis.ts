import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';

/* Single-loop Lenis — no GSAP double-tick */
interface UseLenisReturn {
  lenis: React.MutableRefObject<Lenis | null>;
  isReady: boolean;
}

export function useLenis(): UseLenisReturn {
  const lenis = useRef<Lenis | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const instance = new Lenis({
      lerp: 0.08,
      duration: 1.0,
      easing: (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: true,
      orientation: 'vertical',
    });

    lenis.current = instance;
    setIsReady(true);

    let rafId = 0;
    const loop = (time: number): void => {
      instance.raf(time);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      instance.destroy();
      lenis.current = null;
      setIsReady(false);
    };
  }, []);

  return { lenis, isReady };
}
