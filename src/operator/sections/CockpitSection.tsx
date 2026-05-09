import React from 'react';
import { motion } from 'framer-motion';
import { MetricCard } from '../components/MetricCard';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import { useOperatorPoll } from '../hooks/useOperatorPoll';
import { getTelemetry } from '../data/mock-telemetry';
import { MOCK_LANES } from '../data/mock-agents';

const ALERT_STATUS: Record<string, 'ok' | 'warn' | 'critical' | 'idle'> = {
  info: 'idle',
  warn: 'warn',
  critical: 'critical',
};

function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export const CockpitSection: React.FC = () => {
  const { data } = useOperatorPoll(getTelemetry, 5000);
  const kpis = data?.kpis ?? [];
  const alerts = data?.alerts ?? [];

  return (
    <section className="op-section">
      <SectionHeader title="Cockpit" />

      <div className="op-stat-grid" style={{ marginBottom: 24 }}>
        {kpis.map((kpi) => (
          <MetricCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            suffix={kpi.unit ?? ''}
            density="glance"
            live
          />
        ))}
      </div>

      <div className="op-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* AlertFeed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              fontFamily: 'var(--op-font-heading)',
              fontWeight: 600,
              fontSize: 'var(--op-type-h3)',
              color: 'var(--op-text-primary)',
              margin: '0 0 4px 0',
            }}
          >
            Alerts
          </h3>
          {alerts.length === 0 ? (
            <span
              style={{
                color: 'var(--op-text-tertiary)',
                fontSize: 'var(--op-type-body)',
                fontFamily: 'var(--op-font-sans)',
                padding: '12px 0',
              }}
            >
              No alerts
            </span>
          ) : (
            alerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--op-surface)',
                  border: '1px solid var(--op-border)',
                }}
              >
                <StatusDot status={ALERT_STATUS[alert.level] ?? 'idle'} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--op-type-body)',
                    color: 'var(--op-text-primary)',
                    fontFamily: 'var(--op-font-sans)',
                  }}
                >
                  {alert.message}
                </span>
                <span
                  style={{
                    fontSize: 'var(--op-type-caption)',
                    color: 'var(--op-text-tertiary)',
                    fontFamily: 'var(--op-font-mono)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {relativeTime(alert.ts)}
                </span>
              </motion.div>
            ))
          )}
        </div>

        {/* LaneUtilization */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3
            style={{
              fontFamily: 'var(--op-font-heading)',
              fontWeight: 600,
              fontSize: 'var(--op-type-h3)',
              color: 'var(--op-text-primary)',
              margin: '0 0 4px 0',
            }}
          >
            Lane Utilization
          </h3>
          {MOCK_LANES.map((lane) => {
            const pct = lane.utilization;
            const barColor =
              pct > 0.85
                ? 'var(--op-status-critical)'
                : pct > 0.6
                  ? 'var(--op-status-warn)'
                  : 'var(--op-status-ok)';
            return (
              <div
                key={lane.id}
                className="op-row"
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span
                  style={{
                    width: 148,
                    fontSize: 'var(--op-type-body)',
                    color: 'var(--op-text-primary)',
                    fontFamily: 'var(--op-font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lane.model}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--op-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct * 100}%` }}
                    transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
                    style={{ height: '100%', borderRadius: 4, background: barColor }}
                  />
                </div>
                <span
                  style={{
                    width: 48,
                    textAlign: 'right',
                    fontSize: 'var(--op-type-caption)',
                    color: 'var(--op-text-secondary)',
                    fontFamily: 'var(--op-font-mono)',
                  }}
                >
                  {Math.round(pct * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CockpitSection;
