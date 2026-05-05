import React from 'react';
import { motion, useMotionValue, useTransform, useInView } from 'framer-motion';
import '../styles/tokens.css';

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  easing?: number[];
  className?: string;
  style?: React.CSSProperties;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  target,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  easing = [0.25, 0.1, 0.25, 1],
  className = '',
  style,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (latest) => {
    return latest.toFixed(decimals);
  });

  React.useEffect(() => {
    if (!isInView) return;

    const controls = { start: 0, end: target };
    const startTime = performance.now();

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic bezier approximation using the provided easing
      const eased = easeCubicBezier(progress, easing[0], easing[1], easing[2], easing[3]);
      const current = controls.start + (controls.end - controls.start) * eased;
      motionValue.set(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }, [isInView, target, duration, motionValue, easing]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        display: 'inline-block',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {prefix}{rounded}{suffix}
    </motion.div>
  );
};

function easeCubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  // Newton-Raphson approximation for cubic bezier
  let x = t;
  for (let i = 0; i < 8; i++) {
    const x2_ = 3 * (1 - x) * (1 - x) * x * x1 + 3 * (1 - x) * x * x * x2 + x * x * x;
    const dx = 3 * (1 - x) * (1 - x) * x1 + 6 * (1 - x) * x * (x2 - x1) + 3 * x * x * (1 - x2);
    if (Math.abs(dx) < 1e-7) break;
    x -= (x2_ - t) / dx;
  }
  return 3 * (1 - x) * (1 - x) * x * y1 + 3 * (1 - x) * x * x * y2 + x * x * x;
}

export default AnimatedCounter;
