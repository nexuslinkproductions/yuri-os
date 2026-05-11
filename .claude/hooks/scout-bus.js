'use strict';
const fs = require('fs');
const path = require('path');

const BUS_PATH = path.join(__dirname, '..', 'state', 'scout-bus.json');
const MAX_ENTRIES = 20;
const TTL_MS = 5 * 60_000;
const THROTTLE_MS = 30_000;

function createEmpty() {
  return {
    schema_version: '1',
    ring: [],
    throttle: {
      ARGUS:    { last_spawn: 0 },
      CASSANDRA: { last_spawn: 0 },
      HERMES:   { last_spawn: 0 },
    },
    last_updated: new Date().toISOString(),
  };
}

function readBus() {
  try { return JSON.parse(fs.readFileSync(BUS_PATH, 'utf8')); }
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

function appendFinding(scoutName, severity, triggerTool, finding, runtimeKind = 'unknown') {
  const bus = readBus();
  pruneExpired(bus);

  const entry = {
    id: Math.random().toString(36).slice(2, 10),
    scout: scoutName,
    ts: new Date().toISOString(),
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    trigger_tool: triggerTool || '',
    runtime_kind: runtimeKind,
    severity,
    finding,
    consumed: false,
  };

  bus.ring.push(entry);
  if (bus.ring.length > MAX_ENTRIES) bus.ring = bus.ring.slice(-MAX_ENTRIES);
  writeBus(bus);
  return entry.id;
}

function getUnconsumed(bus) {
  const now = Date.now();
  return bus.ring.filter(
    e => !e.consumed && new Date(e.expires_at).getTime() > now
  );
}

function getPeerFindings(bus, selfScout, lookbackMs = 180_000) {
  const cutoff = Date.now() - lookbackMs;
  return bus.ring.filter(
    e => e.scout !== selfScout &&
         !e.consumed &&
         new Date(e.ts).getTime() > cutoff
  ).slice(-5);
}

function markConsumed(bus, ids) {
  const set = new Set(ids);
  bus.ring.forEach(e => { if (set.has(e.id)) e.consumed = true; });
}

function canSpawn(bus, scoutName) {
  const t = bus.throttle?.[scoutName];
  if (!t) return true;
  return (Date.now() - (t.last_spawn || 0)) >= THROTTLE_MS;
}

function recordSpawn(bus, scoutName) {
  if (!bus.throttle) bus.throttle = {};
  if (!bus.throttle[scoutName]) bus.throttle[scoutName] = {};
  bus.throttle[scoutName].last_spawn = Date.now();
}

function countUnconsumed(bus) {
  return getUnconsumed(bus).length;
}

function initIfMissing() {
  if (!fs.existsSync(BUS_PATH)) {
    writeBus(createEmpty());
  }
}

function resetForNewSession() {
  const bus = readBus();
  // mark all previous entries consumed — new session, clean slate
  bus.ring.forEach(e => { e.consumed = true; });
  // reset throttle
  Object.keys(bus.throttle || {}).forEach(k => { bus.throttle[k].last_spawn = 0; });
  writeBus(bus);
}

module.exports = {
  BUS_PATH,
  readBus, writeBus, createEmpty,
  appendFinding, getUnconsumed, getPeerFindings,
  markConsumed, canSpawn, recordSpawn, countUnconsumed,
  initIfMissing, resetForNewSession, pruneExpired,
};
