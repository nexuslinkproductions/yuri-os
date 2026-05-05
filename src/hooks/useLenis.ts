import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface UseLenisReturn {
  lenis: React.MutableRefObject<Lenis | null>;
  isReady: boolean;
}

export function useLenis(): UseLenisReturn {
  const lenis = useRef<Lenis | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const instance = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      easing: (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: true,
      orientation: 'vertical',
    });

    lenis.current = instance;
    setIsReady(true);

    instance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time: number) => instance.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    const raf = (time: number): void => {
      instance.raf(time);
      requestAnimationFrame(raf);
    };
    const id = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(id);
      gsap.ticker.remove((time: number) => instance.raf(time * 1000));
      instance.destroy();
      lenis.current = null;
      setIsReady(false);
    };
  }, []);

  return { lenis, isReady };
}
