import React from 'react';
import { useInView } from 'framer-motion';
import '../../styles/tokens.css';

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  target,
  duration = 1200,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  style,
}) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: false, amount: 0.3 });
  const [displayValue, setDisplayValue] = React.useState('0');
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    if (!isInView) {
      setDisplayValue('0');
      return;
    }

    cancelAnimationFrame(rafRef.current);
    const startTime = performance.now();

    const update = (now: number) => {
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayValue((target * eased).toFixed(decimals));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(update);
      } else {
        setDisplayValue(target.toFixed(decimals));
      }
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isInView, target, duration, decimals]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-block', fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {prefix}{displayValue}{suffix}
    </span>
  );
};

export default AnimatedCounter;
