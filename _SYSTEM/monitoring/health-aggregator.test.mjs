import assert from 'node:assert';
import { buildServiceStatus } from './health-aggregator.mjs';

// ── No retired daemon present ──────────────────────────────────────
const agents = [
  { label: 'com.yuri-os-musubi.eot-refresh', status: 'running' },
  { label: 'com.yuri-os-musubi.yuri-sentinel', status: 'running' },
  { label: 'com.yuri.kagami-heartbeat', status: 'running' },
  { label: 'com.yuri.kagami-memory-consolidator', status: 'stopped' },
];
const overseer = { status: 'ok', quarantinedLanes: [], ledgerPath: '/tmp/test', threshold: 1, crashWindowMs: 60000 };

const services = buildServiceStatus(agents, overseer);

// ── Keys ───────────────────────────────────────────────────────────
const keys = Object.keys(services);
assert.deepEqual(keys.sort(), ['backend', 'dream_synthesis', 'kagami-overseer', 'session_buffer'],
  'services object must contain ONLY the four retained keys — no openclaw, gateway, or bridge');

// ── Backend ────────────────────────────────────────────────────────
assert.equal(services.backend.status, 'ok',
  'backend should be ok when a com.yuri.kagami launchagent is running');

// ── Kagami overseer ────────────────────────────────────────────────
assert.equal(services['kagami-overseer'].status, 'ok',
  'kagami-overseer passes through overseer status');
assert.deepEqual(services['kagami-overseer'].quarantined_lanes, [],
  'kagami-overseer preserves quarantined lanes');

// ── All services present, none synthetic ───────────────────────────
for (const key of keys) {
  assert.ok(typeof services[key].status === 'string',
    `each service ${key} must have a string status`);
}

// ── Backend fail when no kagami agent is running ───────────────────
const emptyServices = buildServiceStatus([], { status: 'ok', quarantinedLanes: [] });
assert.equal(emptyServices.backend.status, 'fail',
  'backend should fail when no com.yuri.kagami launchagent is present');

// ── No OMP daemon liveness claim ───────────────────────────────────
const ompKewords = ['omp', 'openclaw', 'gateway', 'bridge', '18789'];
for (const svc of Object.keys(services)) {
  for (const kw of ompKewords) {
    assert.ok(!svc.toLowerCase().includes(kw),
      `service key "${svc}" must not contain "${kw}"`);
  }
}

console.log('OK — health-aggregator service status tests passed');
