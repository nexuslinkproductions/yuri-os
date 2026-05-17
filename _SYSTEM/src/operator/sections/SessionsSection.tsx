import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useOperatorPoll } from '../hooks/useOperatorPoll';
import { fetchSessionBacklog, fetchSessionHistory, startRuntimeSession, stopRuntimeSession } from '../data/sessionRuntime';
import type { BacklogTaskRecord, SessionBacklogPayload, SessionRecord } from '../data/types';

const SESSION_STATUS_MAP: Record<SessionRecord['status'], 'ok' | 'warn' | 'critical' | 'idle'> = {
  active: 'ok',
  completed: 'idle',
  error: 'critical',
  interrupted: 'warn',
};

const BACKLOG_STATUS_MAP: Record<BacklogTaskRecord['status'], 'ok' | 'warn' | 'critical' | 'idle'> = {
  queued: 'idle',
  running: 'ok',
  completed: 'idle',
  failed: 'critical',
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

function hasControlPlaneState(session: SessionRecord): boolean {
  return Boolean(
    session.graphId ||
    session.intentId ||
    session.graphPlanPath ||
    session.normalizedIntentPath ||
    session.verificationState ||
    session.promotionState,
  );
}

function shortArtifactPath(value?: string | null): string {
  if (!value) return 'pending';
  const parts = value.split('/');
  return parts.slice(-3).join('/');
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
  const selectedBacklogSessionId = expandedId || activeSession?.id || sessionList[0]?.id || null;
  const {
    data: backlog,
    error: backlogError,
    refresh: refreshBacklog,
  } = useOperatorPoll(() => fetchSessionBacklog(selectedBacklogSessionId, 12), 5000, [selectedBacklogSessionId]);

  const runAction = async (action: () => Promise<SessionRecord>) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await action();
      refresh();
      refreshBacklog();
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
                      {hasControlPlaneState(session) && (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 12,
                            paddingTop: 8,
                            borderTop: '1px solid var(--op-border)',
                          }}
                        >
                          <SessionMeta label="Graph" value={session.graphId || 'pending'} />
                          <SessionMeta label="Intent" value={session.intentId || 'pending'} />
                          <SessionMeta label="Verification" value={session.verificationState || 'pending'} />
                          <SessionMeta label="Promotion" value={session.promotionState || 'blocked'} />
                          <SessionMeta label="Graph Plan" value={shortArtifactPath(session.graphPlanPath)} />
                          <SessionMeta label="Normalized Intent" value={shortArtifactPath(session.normalizedIntentPath)} />
                        </div>
                      )}
                      <SessionBacklogPanel
                        backlog={backlog?.sessionId === session.id ? backlog : null}
                        error={backlogError?.message || null}
                      />
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

const SessionBacklogPanel: React.FC<{
  backlog: SessionBacklogPayload | null;
  error: string | null;
}> = ({ backlog, error }) => {
  const visibleTasks = backlog?.tasks.slice(0, 6) || [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--op-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', fontFamily: 'var(--op-font-mono)' }}>
          Backlog
        </span>
        {backlog ? (
          <>
            <BacklogMetric label="queued" value={backlog.summary.queued} />
            <BacklogMetric label="running" value={backlog.summary.running} />
            <BacklogMetric label="done" value={backlog.summary.completed} />
            <BacklogMetric label="failed" value={backlog.summary.failed} />
          </>
        ) : (
          <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)' }}>
            {error || 'loading queue'}
          </span>
        )}
      </div>
      {visibleTasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px minmax(0, 1fr) 48px',
                alignItems: 'center',
                gap: 8,
                minHeight: 28,
              }}
            >
              <StatusDot status={BACKLOG_STATUS_MAP[task.status]} />
              <span
                style={{
                  fontSize: 'var(--op-type-caption)',
                  color: task.status === 'running' ? 'var(--op-text-primary)' : 'var(--op-text-secondary)',
                  fontFamily: 'var(--op-font-sans)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={task.reason}
              >
                {task.title}
              </span>
              <span
                style={{
                  fontSize: 'var(--op-type-caption)',
                  color: 'var(--op-text-tertiary)',
                  fontFamily: 'var(--op-font-mono)',
                  textAlign: 'right',
                }}
              >
                p{task.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BacklogMetric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-secondary)', fontFamily: 'var(--op-font-mono)' }}>
    {label}:{value}
  </span>
);

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

const SessionMeta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ minWidth: 0 }}>
    <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)', display: 'block' }}>
      {label}
    </span>
    <span
      style={{
        fontSize: 'var(--op-type-caption)',
        color: 'var(--op-text-secondary)',
        fontFamily: 'var(--op-font-mono)',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      }}
    >
      {value}
    </span>
  </div>
);

export default SessionsSection;
