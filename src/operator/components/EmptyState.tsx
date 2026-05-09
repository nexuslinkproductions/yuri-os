import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface EmptyStateProps {
  icon?: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '⊡', title, body, action }) => {
  const reducedMotion = useReducedMotion();

  return (
    <motion.section
      aria-label="No results"
      initial={reducedMotion ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0, 0, 0.2, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        maxWidth: 360,
        margin: '0 auto',
      }}
    >
      <span style={{ fontSize: '2.5rem', color: 'var(--op-text-tertiary)', marginBottom: 16 }}>{icon}</span>
      <h3
        style={{
          fontFamily: 'var(--op-font-heading)',
          fontWeight: 600,
          fontSize: 'var(--op-type-h3)',
          color: 'var(--op-text-primary)',
          margin: '0 0 8px 0',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: 'var(--op-text-secondary)',
          fontSize: 'var(--op-type-body)',
          lineHeight: 1.55,
          margin: '0 0 20px 0',
        }}
      >
        {body}
      </p>
      {action && <div>{action}</div>}
    </motion.section>
  );
};
