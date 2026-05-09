import React from 'react';

interface SectionHeaderProps {
  title: string;
  density?: 'glance' | 'scan' | 'focus';
  onDensityChange?: (d: 'glance' | 'scan' | 'focus') => void;
  actions?: React.ReactNode;
}

const DENSITIES: Array<'glance' | 'scan' | 'focus'> = ['glance', 'scan', 'focus'];

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  density = 'glance',
  onDensityChange,
  actions,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--op-font-heading)',
          fontWeight: 700,
          fontSize: 'var(--op-type-h2)',
          color: 'var(--op-text-primary)',
          letterSpacing: '-0.01em',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onDensityChange && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--op-surface)', borderRadius: 6, padding: 2 }}>
            {DENSITIES.map(d => (
              <button
                key={d}
                onClick={() => onDensityChange(d)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--op-font-mono)',
                  fontSize: 'var(--op-type-caption)',
                  fontWeight: density === d ? 600 : 400,
                  color: density === d ? 'var(--op-text-primary)' : 'var(--op-text-tertiary)',
                  background: density === d ? 'var(--op-accent-soft)' : 'transparent',
                  transition: 'all var(--op-dur-micro) var(--op-ease-standard)',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
};
