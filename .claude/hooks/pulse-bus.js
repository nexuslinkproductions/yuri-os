'use strict';
// PATCH 031 — Pulse Cortex bus
// Mirrors scout-bus.js shape with O_EXCL file-lock around read-modify-write
// (DeepSeek dogfood advisory: pulse-orchestrator + main thread can race on
// the same JSON file during a busy turn). Atomic rename handles the
// publish path; the lock protects appendFinding / markConsumed sequences.

const fs = require('fs');
const path = require('path');

const BUS_PATH = path.join(__dirname, '..', 'state', 'pulse-bus.json');
const LOCK_PATH = BUS_PATH + '.lock';
const MAX_ENTRIES = 30;
const TTL_MS = 5 * 60_000;
const STALE_LOCK_MS = 5_000;
const LOCK_WAIT_MS = 1_000;

function sleepSync(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { /* tight spin; bounded ~20ms */ }
}

function acquireLock() {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          // stale lock — owner died; force clear
          try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
          continue;
        }
      } catch (_) { /* no stat = lock just released */ }
      sleepSync(20);
    }
  }
  return false; // gave up — caller proceeds in degraded mode
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
}

function withLock(fn) {
  const locked = acquireLock();
  try { return fn(); }
  finally { if (locked) releaseLock(); }
}

function createEmpty() {
  return {
    schema_version: '1',
    ring: [],
    throttle: {
      DEEPSEEK:  { last_emit: 0 },
      OPENCLAW:  { last_emit: 0 },
      HERMES_FC: { last_emit: 0 },
      CASSANDRA: { last_emit: 0 },
      SWARM:     { last_emit: 0 },
    },
    last_updated: new Date().toISOString(),
  };
}

function readBus() {
  try {
    const raw = fs.readFileSync(BUS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema_version !== '1') return createEmpty();
    return parsed;
  }
  catch { return createEmpty(); }
}

function writeBus(bus) {
  bus.last_updated = new Date().toISOString();
  const tmp = BUS_PATH + '.tmp';
  fs.mkdirSync(path.dirname(BUS_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(bus, null, 2));
  fs.renameSync(tmp, BUS_PATH);
}

function pruneExpired(bus) {
  const now = Date.now();
  bus.ring = bus.ring.filter(e => new Date(e.expires_at).getTime() > now);
}

function appendFinding(source, severity, runtimeKind, finding, opts = {}) {
  return withLock(() => {
    const bus = readBus();
    pruneExpired(bus);

    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      turn_id: opts.turnId || process.env.PULSE_TURN_ID || '',
      source,
      ts: new Date().toISOString(),
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      runtime_kind: runtimeKind,
      severity: String(severity).toUpperCase(),
      finding: String(finding).slice(0, 400),
      confidence: typeof opts.confidence === 'number' ? opts.confidence : null,
      consumed: false,
    };
    bus.ring.push(entry);
    if (bus.ring.length > MAX_ENTRIES) bus.ring = bus.ring.slice(-MAX_ENTRIES);

    if (bus.throttle?.[source]) {
      bus.throttle[source].last_emit = Date.now();
    }
    writeBus(bus);
    return entry.id;
  });
}

function getUnconsumed(turnId = null) {
  const bus = readBus();
  const now = Date.now();
  return bus.ring.filter(e =>
    !e.consumed &&
    new Date(e.expires_at).getTime() > now &&
    (turnId == null || e.turn_id === turnId)
  );
}

function markConsumed(ids) {
  withLock(() => {
    const bus = readBus();
    const set = new Set(ids);
    bus.ring.forEach(e => { if (set.has(e.id)) e.consumed = true; });
    writeBus(bus);
  });
}

function findingsByTurn(turnId) {
  return getUnconsumed(turnId);
}

function detectDisagreement(turnEntries) {
  // PATCH 031: surface advisor disagreement
  // If two advisors on the same turn return materially different severities
  // we tag advisor_disagreement so main thread asks user to weight voices.
  const ranks = { INFO: 1, WARN: 2, HIGH: 3, CRITICAL: 4 };
  const advisors = turnEntries.filter(e =>
    ['DEEPSEEK', 'OPENCLAW', 'HERMES_FC', 'CASSANDRA'].includes(e.source)
  );
  if (advisors.length < 2) return false;
  const sevs = advisors.map(e => ranks[e.severity] || 0);
  const spread = Math.max(...sevs) - Math.min(...sevs);
  return spread >= 2;
}

function initIfMissing() {
  if (!fs.existsSync(BUS_PATH)) {
    writeBus(createEmpty());
  }
}

function resetForNewSession() {
  withLock(() => {
    const bus = readBus();
    bus.ring.forEach(e => { e.consumed = true; });
    Object.keys(bus.throttle || {}).forEach(k => { bus.throttle[k].last_emit = 0; });
    writeBus(bus);
  });
}

module.exports = {
  BUS_PATH,
  LOCK_PATH,
  TTL_MS,
  readBus, writeBus, createEmpty,
  appendFinding, getUnconsumed, markConsumed, findingsByTurn,
  detectDisagreement, initIfMissing, resetForNewSession, pruneExpired,
  withLock, // exported for orchestrator's other state files
};
