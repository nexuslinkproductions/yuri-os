#!/usr/bin/env node
import fs from 'node:fs';
const bus = JSON.parse(fs.readFileSync('.claude/state/pulse-bus.json', 'utf8'));
const ring = bus.ring || [];
const findings = ring.filter(e =>
  e.severity === 'WARN' || e.severity === 'HIGH' || e.severity === 'CRITICAL' ||
  e.source === 'CASSANDRA' || e.source === 'CORTEX'
);
const archive = {
  date: '2026-05-16',
  session_id: bus.session_id || 'eot-session',
  commits: ['1da68165', '00d325c6', 'cf872704', 'af5c626a', 'dc8e9f8e'],
  findings: findings.map(f => ({
    ts: f.ts, source: f.source, severity: f.severity,
    finding: (f.finding || '').slice(0, 300), runtime_kind: f.runtime_kind, outcome_marker: null,
  })),
  telemetry: {
    trivial_skip_count: ring.length - findings.length,
    pulse_spawn_count: ring.length,
    disagreement_count: findings.filter(f => f.source === 'CORTEX').length,
  },
};
fs.mkdirSync('_SYSTEM/SELF-IMPROVEMENT/pulse-archive', { recursive: true });
fs.writeFileSync('_SYSTEM/SELF-IMPROVEMENT/pulse-archive/2026-05-16.json', JSON.stringify(archive, null, 2));
console.log(`pulse archive: ${findings.length} findings / ${ring.length} total`);
