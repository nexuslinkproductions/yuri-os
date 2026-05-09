import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MOCK_SESSIONS } from '../data/mock-sessions';
import type { SessionRecord } from '../data/types';

const SESSION_STATUS_MAP: Record<SessionRecord['status'], 'ok' | 'warn' | 'critical' | 'idle'> = {
  active: 'ok',
  completed: 'idle',
  error: 'critical',
  interrupted: 'warn',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const SessionsSection: React.FC = () => {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  if (MOCK_SESSIONS.length === 0) {
    return (
      <section className="op-section">
        <SectionHeader title="Sessions" />
        <EmptyState
          icon="☰"
          title="No Sessions"
          body="There are no active or completed sessions to display."
        />
      </section>
    );
  }

  return (
    <section className="op-section">
      <SectionHeader title="Sessions" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {MOCK_SESSIONS.map((session) => {
          const isExpanded = expandedId === session.id;

          return (
            <div key={session.id}>
              <motion.div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                whileHover={reducedMotion ? {} : { background: 'var(--op-surface-elevated)' }}
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(isExpanded ? null : session.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 44,
                  padding: '0 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--op-surface-elevated)' : 'transparent',
                  border: isExpanded ? '1px solid var(--op-border)' : '1px solid transparent',
                  transition: 'background var(--op-dur-micro) var(--op-ease-standard)',
                }}
              >
                <StatusDot status={SESSION_STATUS_MAP[session.status]} />
                <span
                  style={{
                    flex: 1,
                    fontFamily: 'var(--op-font-mono)',
                    fontSize: 'var(--op-type-body)',
                    color: 'var(--op-text-primary)',
                  }}
                >
                  {session.model}
                </span>
                <span
                  style={{
                    fontSize: 'var(--op-type-caption)',
                    color: 'var(--op-text-secondary)',
                    fontFamily: 'var(--op-font-mono)',
                    minWidth: 160,
                    textAlign: 'right',
                  }}
                >
                  {formatTimestamp(session.startTs)}
                </span>
                <span
                  style={{
                    fontSize: 'var(--op-type-body)',
                    color: 'var(--op-text-primary)',
                    fontFamily: 'var(--op-font-mono)',
                    fontWeight: 600,
                    minWidth: 80,
                    textAlign: 'right',
                  }}
                >
                  {session.tokenCount.toLocaleString()}
                </span>
              </motion.div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={reducedMotion ? {} : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reducedMotion ? {} : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        margin: '4px 16px 8px',
                        padding: 16,
                        borderRadius: 8,
                        background: 'var(--op-surface)',
                        border: '1px solid var(--op-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 24 }}>
                        <div>
                          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                            Status
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-mono)' }}>
                            {session.status}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                            Session ID
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-mono)' }}>
                            {session.id}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                            Title
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-sans)' }}>
                            {session.title}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                          Summary
                        </span>
                        <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-secondary)', fontFamily: 'var(--op-font-sans)', lineHeight: 1.5 }}>
                          {session.summary}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default SessionsSection;
