import React from 'react';

export const ShimmerRow: React.FC = () => {
  return (
    <>
      <style>{`
        @keyframes op-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
      `}</style>
      <div
        aria-busy="true"
        aria-hidden="true"
        style={{
          width: '100%',
          height: 40,
          borderRadius: 8,
          background:
            'linear-gradient(90deg, var(--op-border) 0%, var(--op-surface-elevated) 40%, var(--op-border) 80%)',
          backgroundSize: '800px 100%',
          animation: 'op-shimmer 1.2s ease-in-out infinite',
        }}
      />
    </>
  );
};
