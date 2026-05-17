import React from 'react';

export const OperatorTopBar: React.FC = () => {
  return (
    <header
      style={{
        gridRow: 1,
        gridColumn: '1 / -1',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        background: 'var(--op-surface-elevated)',
        borderBottom: '1px solid var(--op-border)',
        zIndex: 200,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--op-font-heading)', fontWeight: 700, fontSize: 'var(--op-type-h3)', color: 'var(--op-text-primary)', letterSpacing: '-0.01em' }}>
          NUDIMMUD
        </span>
        <span style={{ color: 'var(--op-text-tertiary)', fontSize: 'var(--op-type-caption)', fontFamily: 'var(--op-font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Operator
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--op-border)',
            background: 'var(--op-surface)',
            color: 'var(--op-text-secondary)',
            fontSize: 'var(--op-type-caption)',
            fontFamily: 'var(--op-font-mono)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '0.65rem' }}>⌘K</span>
        </button>
      </div>
    </header>
  );
};
