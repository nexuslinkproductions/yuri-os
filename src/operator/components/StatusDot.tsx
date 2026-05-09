import React from 'react';

type Status = 'ok' | 'warn' | 'critical' | 'idle';

const STATUS_COLORS: Record<Status, string> = {
  ok: 'var(--op-status-ok)',
  warn: 'var(--op-status-warn)',
  critical: 'var(--op-status-critical)',
  idle: 'var(--op-text-tertiary)',
};

const STATUS_LABELS: Record<Status, string> = {
  ok: 'OK',
  warn: 'Warning',
  critical: 'Critical',
  idle: 'Idle',
};

export interface StatusDotProps {
  status: Status;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status }) => {
  const pulse =
    status === 'warn'
      ? 'op-status-pulse-warn 2s ease-in-out infinite'
      : status === 'critical'
        ? 'op-status-pulse-critical 0.8s ease-in-out infinite'
        : 'none';

  return (
    <>
      <style>{`
        @keyframes op-status-pulse-warn {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes op-status-pulse-critical {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
      <span
        role="img"
        aria-label={`Status: ${STATUS_LABELS[status]}`}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status],
          flexShrink: 0,
          animation: pulse,
        }}
      />
    </>
  );
};
