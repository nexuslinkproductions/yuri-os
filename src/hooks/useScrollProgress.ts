import { useScroll, UseScrollOptions } from 'framer-motion';
import { RefObject } from 'react';

interface ScrollProgressReturn {
  scrollY: import('framer-motion').MotionValue<number>;
  scrollYProgress: import('framer-motion').MotionValue<number>;
}

export function useScrollProgress(
  elementRef?: RefObject<HTMLElement | null>
): ScrollProgressReturn {
  const options: UseScrollOptions = elementRef
    ? { container: elementRef }
    : {};

  const { scrollY, scrollYProgress } = useScroll(options);

  return { scrollY, scrollYProgress };
}
