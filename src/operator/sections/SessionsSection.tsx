import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useOperatorPoll } from '../hooks/useOperatorPoll';
import { fetchSessionHistory, startRuntimeSession, stopRuntimeSession } from '../data/sessionRuntime';
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

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return 'n/a';
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatRemaining(deadlineAt?: number): string {
  if (!deadlineAt) return 'n/a';
  return formatDuration(Math.max(0, deadlineAt - Date.now()));
}

export const SessionsSection: React.FC = () => {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const reducedMotion = useReducedMotion();
  const {
    data: sessions,
    error,
    loading,
    refresh,
  } = useOperatorPoll(() => fetchSessionHistory(30), 5000, []);

  const sessionList = sessions || [];
  const activeSession = sessionList.find((session) => session.status === 'active') || null;

  const runAction = async (action: () => Promise<SessionRecord>) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  if (!loading && sessionList.length === 0) {
    return (
      <section className="op-section">
        <SectionHeader
          title="Sessions"
          actions={
            <button
              type="button"
              onClick={() => runAction(startRuntimeSession)}
              disabled={actionBusy}
              style={actionButtonStyle}
            >
              Start
            </button>
          }
        />
        <EmptyState
          icon="☰"
          title="No Sessions"
          body={error ? error.message : 'No durable Yuri runtime sessions have been recorded.'}
        />
        {actionError && <SessionError message={actionError} />}
      </section>
    );
  }

  return (
    <section className="op-section">
      <SectionHeader
        title="Sessions"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading || actionBusy}
              style={secondaryButtonStyle}
            >
              Refresh
            </button>
            {activeSession ? (
              <button
                type="button"
                onClick={() => runAction(() => stopRuntimeSession(activeSession.id))}
                disabled={actionBusy}
                style={dangerButtonStyle}
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runAction(startRuntimeSession)}
                disabled={actionBusy}
                style={actionButtonStyle}
              >
                Start
              </button>
            )}
          </div>
        }
      />

      {(error || actionError) && (
        <SessionError message={actionError || error?.message || 'Session runtime unavailable'} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sessionList.map((session) => {
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
                            Remaining
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-mono)' }}>
                            {formatRemaining(session.deadlineAt)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                            Duration
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-sans)' }}>
                            {formatDuration(session.targetDurationMs)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                            Restarts
                          </span>
                          <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)', fontFamily: 'var(--op-font-mono)' }}>
                            {session.restartCount ?? 0}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                          Current Task
                        </span>
                        <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-secondary)', fontFamily: 'var(--op-font-sans)', lineHeight: 1.5 }}>
                          {session.currentTask || session.title}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                          Checkpoint
                        </span>
                        <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-secondary)', fontFamily: 'var(--op-font-mono)', lineHeight: 1.5 }}>
                          {session.checkpointRef || 'pending'}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
                          Session ID
                        </span>
                        <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-secondary)', fontFamily: 'var(--op-font-mono)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                          {session.id}
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

const actionButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--op-border)',
  background: 'var(--op-accent)',
  color: 'var(--op-text-primary)',
  fontFamily: 'var(--op-font-mono)',
  fontSize: 'var(--op-type-caption)',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: 'var(--op-surface)',
  color: 'var(--op-text-primary)',
};

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: 'var(--op-status-critical)',
  color: 'var(--op-text-primary)',
};

const SessionError: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      marginBottom: 12,
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--op-status-critical)',
      color: 'var(--op-status-critical)',
      background: 'var(--op-surface)',
      fontFamily: 'var(--op-font-mono)',
      fontSize: 'var(--op-type-caption)',
    }}
  >
    {message}
  </div>
);

export default SessionsSection;
