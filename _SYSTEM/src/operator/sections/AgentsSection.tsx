import React from 'react';
import { motion } from 'framer-motion';
import { StatusDot } from '../components/StatusDot';
import { SectionHeader } from '../components/SectionHeader';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MOCK_LANES } from '../data/mock-agents';
import type { AgentLane } from '../data/types';

const LANE_STATUS_MAP: Record<AgentLane['status'], 'ok' | 'warn' | 'critical'> = {
  online: 'ok',
  degraded: 'warn',
  offline: 'critical',
};

const ROUTING_NODES = [
  { label: 'DeepSeek', cx: 140, cy: 28, fill: 'var(--op-accent)' },
  { label: 'Local', cx: 40, cy: 80, fill: 'var(--op-status-ok)' },
  { label: 'Cloud', cx: 240, cy: 80, fill: 'var(--op-status-warn)' },
];

const ROUTING_LINKS = [
  { x1: 140, y1: 28, x2: 40, y2: 80 },
  { x1: 140, y1: 28, x2: 240, y2: 80 },
  { x1: 40, y1: 80, x2: 240, y2: 80 },
];

export const AgentsSection: React.FC = () => {
  const reducedMotion = useReducedMotion();

  return (
    <section className="op-section">
      <SectionHeader title="Agents & Swarm" />

      {/* LaneGrid */}
      <div
        className="op-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {MOCK_LANES.map((lane) => (
          <motion.div
            key={lane.id}
            whileHover={reducedMotion ? {} : { y: -3, boxShadow: 'var(--op-shadow-lg)' }}
            onClick={() => console.log('Lane clicked:', lane.id)}
            style={{
              padding: 16,
              borderRadius: 'var(--op-grid-radius)',
              background: 'var(--op-surface-elevated)',
              border: '1px solid var(--op-border)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              transition: 'box-shadow var(--op-dur-micro) var(--op-ease-standard)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: 'var(--op-font-mono)',
                  fontSize: 'var(--op-type-body)',
                  fontWeight: 600,
                  color: 'var(--op-text-primary)',
                }}
              >
                {lane.model}
              </span>
              <StatusDot status={LANE_STATUS_MAP[lane.status]} />
            </div>

            {/* Utilization bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)' }}>
                  Utilization
                </span>
                <span
                  style={{
                    fontSize: 'var(--op-type-caption)',
                    color: 'var(--op-text-secondary)',
                    fontFamily: 'var(--op-font-mono)',
                  }}
                >
                  {Math.round(lane.utilization * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--op-surface)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${lane.utilization * 100}%` }}
                  transition={{ duration: 0.5, ease: [0, 0, 0.2, 1] }}
                  style={{
                    height: '100%',
                    borderRadius: 3,
                    background:
                      lane.utilization > 0.85
                        ? 'var(--op-status-critical)'
                        : lane.utilization > 0.6
                          ? 'var(--op-status-warn)'
                          : 'var(--op-status-ok)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)' }}>
                Sessions
              </span>
              <span
                style={{
                  fontSize: 'var(--op-type-body)',
                  color: 'var(--op-text-primary)',
                  fontFamily: 'var(--op-font-mono)',
                  fontWeight: 600,
                }}
              >
                {lane.sessionCount}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--op-type-caption)', color: 'var(--op-text-tertiary)' }}>
                Latency
              </span>
              <span
                style={{
                  fontSize: 'var(--op-type-body)',
                  color: 'var(--op-text-primary)',
                  fontFamily: 'var(--op-font-mono)',
                  fontWeight: 600,
                }}
              >
                {lane.latencyMs}ms
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* RoutingGraph stub */}
      <div
        style={{
          border: '1px solid var(--op-border)',
          borderRadius: 'var(--op-grid-radius)',
          padding: 20,
          background: 'var(--op-surface)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--op-font-heading)',
            fontWeight: 600,
            fontSize: 'var(--op-type-h3)',
            color: 'var(--op-text-primary)',
            display: 'block',
            marginBottom: 12,
          }}
        >
          Routing Graph
        </span>
        <svg viewBox="0 0 280 120" width="100%" height={120}>
          {ROUTING_LINKS.map((link, i) => (
            <line
              key={i}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              stroke="var(--op-border)"
              strokeWidth={2}
            />
          ))}
          {ROUTING_NODES.map((node) => (
            <g key={node.label}>
              <circle cx={node.cx} cy={node.cy} r={14} fill={node.fill} opacity={0.15} />
              <circle cx={node.cx} cy={node.cy} r={8} fill={node.fill} />
              <text
                x={node.cx}
                y={node.cy + 26}
                textAnchor="middle"
                fill="var(--op-text-secondary)"
                fontFamily="var(--op-font-mono)"
                fontSize={10}
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
};

export default AgentsSection;
