import React from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusDot } from '../components/StatusDot';
import { EmptyState } from '../components/EmptyState';
import { MOCK_ORACLE } from '../data/mock-oracle';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

const OracleSection: React.FC = () => {
  const listening = MOCK_ORACLE.wakeWord === 'listening';

  return (
    <div>
      <SectionHeader title="Oracle Console" />

      {/* Wake Word Status */}
      <div style={{ marginBottom: 24 }}>
        <span
          style={{
            fontSize: 'var(--op-type-caption)',
            color: 'var(--op-text-secondary)',
            marginRight: 8,
          }}
        >
          Wake Word:
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 999,
            background: 'var(--op-surface-elevated)',
            border: '1px solid var(--op-border)',
            fontFamily: 'var(--op-font-mono)',
            fontSize: 'var(--op-type-caption)',
            color: 'var(--op-text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <StatusDot status={listening ? 'warn' : 'idle'} />
          {MOCK_ORACLE.wakeWord}
        </span>
      </div>

      {/* Transcript */}
      <h3
        style={{
          fontFamily: 'var(--op-font-heading)',
          fontWeight: 600,
          fontSize: 'var(--op-type-h3)',
          color: 'var(--op-text-primary)',
          margin: '0 0 12px 0',
        }}
      >
        Transcript
      </h3>

      {MOCK_ORACLE.transcript.length === 0 ? (
        <EmptyState
          icon="⊡"
          title="No Transcript"
          body="Oracle has not received any utterances yet."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_ORACLE.transcript.map((entry, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 'var(--op-grid-radius)',
                background: 'var(--op-surface-elevated)',
                border: '1px solid var(--op-border)',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontFamily:
                    entry.role === 'oracle'
                      ? 'var(--op-font-mono)'
                      : 'var(--op-font-sans)',
                  fontSize: 'var(--op-type-caption)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  padding: '2px 8px',
                  borderRadius: 4,
                  color:
                    entry.role === 'oracle'
                      ? 'var(--op-accent-cyan)'
                      : 'var(--op-accent)',
                  background:
                    entry.role === 'oracle'
                      ? 'rgba(0,255,255,0.08)'
                      : 'var(--op-accent-soft)',
                  flexShrink: 0,
                  minWidth: 56,
                  textAlign: 'center',
                }}
              >
                {entry.role}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 'var(--op-type-body)',
                  color: 'var(--op-text-primary)',
                  fontFamily:
                    entry.role === 'oracle'
                      ? 'var(--op-font-mono)'
                      : 'var(--op-font-sans)',
                }}
              >
                {entry.text}
              </span>
              <span
                style={{
                  fontSize: 'var(--op-type-caption)',
                  color: 'var(--op-text-tertiary)',
                  fontFamily: 'var(--op-font-mono)',
                  flexShrink: 0,
                }}
              >
                {relativeTime(entry.ts)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OracleSection;
