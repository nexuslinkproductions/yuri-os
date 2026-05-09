import React from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface LiveCounterProps {
  value: number;
  precision?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const LiveCounter: React.FC<LiveCounterProps> = ({
  value,
  precision,
  decimals,
  prefix = '',
  suffix = '',
  className,
}) => {
  const reduced = useReducedMotion();
  const motionVal = useMotionValue(value);
  const fixed = decimals ?? precision ?? 0;
  const display = useTransform(motionVal, (v) => `${prefix}${v.toFixed(fixed)}${suffix}`);

  React.useEffect(() => {
    if (reduced) {
      motionVal.set(value);
      return;
    }
    const controls = animate(motionVal, value, {
      type: 'spring',
      stiffness: 120,
      damping: 14,
      mass: 0.4,
    });
    return () => controls.stop();
  }, [value, reduced, motionVal]);

  return (
    <motion.span
      className={className}
      style={{ color: 'var(--op-mono-fg)' }}
    >
      {display}
    </motion.span>
  );
};

export default LiveCounter;
export type { LiveCounterProps };
