import React from 'react';
import { motion } from 'framer-motion';
import { LiveCounter } from './LiveCounter';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface MetricCardProps {
  label: string;
  value?: number;
  suffix?: string;
  density?: 'glance' | 'scan' | 'focus';
  live?: boolean;
  children?: React.ReactNode;
}

const DENSITY_PADDING: Record<string, string> = {
  glance: '8px',
  scan: '16px',
  focus: '24px',
};

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  suffix = '',
  density = 'glance',
  live = false,
  children,
}) => {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reducedMotion ? {} : { y: -2, boxShadow: 'var(--op-shadow-md)' }}
      style={{
        padding: DENSITY_PADDING[density],
        borderRadius: 'var(--op-grid-radius)',
        background: 'var(--op-surface-elevated)',
        border: '1px solid var(--op-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 200,
        transition: 'box-shadow var(--op-dur-micro) var(--op-ease-standard)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--op-type-caption)',
          color: 'var(--op-text-secondary)',
          fontFamily: 'var(--op-font-sans)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      {children ? (
        children
      ) : live && value !== undefined ? (
        <LiveCounter value={value} />
      ) : (
        <span
          style={{
            fontSize: 'var(--op-type-h1)',
            fontFamily: 'var(--op-font-heading)',
            fontWeight: 700,
            color: 'var(--op-text-primary)',
            lineHeight: 1.1,
          }}
        >
          {(value ?? 0).toLocaleString()}
          {suffix}
        </span>
      )}
    </motion.div>
  );
};
