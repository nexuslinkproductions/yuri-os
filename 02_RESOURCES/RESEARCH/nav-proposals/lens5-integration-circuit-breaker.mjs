/**
 * lens5-integration-circuit-breaker.mjs — Circuit breaker + graceful degradation
 * for the master navigation layer (NAVIGATOR organ).
 *
 * Each retrieval surface (FTS5, GitNexus, Graph, Memory, Cross-Ref) has an
 * independent circuit breaker. When a surface fails repeatedly, it is OPENed
 * and the NAVIGATOR continues with the remaining healthy surfaces. When a
 * surface recovers, it is HALF_OPEN → CLOSED after successful probes.
 *
 * This module is imported by nav.mjs and used to wrap each surface call.
 *
 * Design:
 *   - State: CLOSED (healthy) | OPEN (failing) | HALF_OPEN (probing recovery)
 *   - Configurable failure threshold, success threshold, timeout
 *   - All state persisted to a JSON file so breakers survive process restarts
 *   - Exported for tests + direct inspection
 *
 * [NEW] circuit-breaker module for NAVIGATOR organ
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const STATE_PATH = path.join(REPO_ROOT, '_SYSTEM', 'state', 'nav-circuit-breakers.json');

export const CIRCUIT_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
});

export const SURFACE_NAMES = Object.freeze([
  'fts5',
  'gitnexus',
  'graph',
  'memory',
  'crossref',
]);

/** Default breaker config per surface (tunable via env/nav config) */
export const DEFAULT_BREAKER_CONFIG = Object.freeze({
  fts5: { failureThreshold: 3, successThreshold: 2, timeoutMs: 30_000 },
  gitnexus: { failureThreshold: 2, successThreshold: 2, timeoutMs: 45_000 },
  graph: { failureThreshold: 3, successThreshold: 2, timeoutMs: 15_000 },
  memory: { failureThreshold: 3, successThreshold: 2, timeoutMs: 20_000 },
  crossref: { failureThreshold: 3, successThreshold: 2, timeoutMs: 60_000 },
});

/** Load persisted breaker state (fail-open: return all CLOSED on any error) */
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const state = {};
    for (const name of SURFACE_NAMES) {
      const s = parsed[name] || {};
      state[name] = {
        state: s.state || CIRCUIT_STATE.CLOSED,
        failures: Number(s.failures) || 0,
        successes: Number(s.successes) || 0,
        lastFailureMs: Number(s.lastFailureMs) || 0,
        lastSuccessMs: Number(s.lastSuccessMs) || 0,
        openedAtMs: Number(s.openedAtMs) || 0,
      };
    }
    return state;
  } catch {
    const state = {};
    for (const name of SURFACE_NAMES) {
      state[name] = {
        state: CIRCUIT_STATE.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureMs: 0,
        lastSuccessMs: 0,
        openedAtMs: 0,
      };
    }
    return state;
  }
}

/** Persist breaker state (atomic write) */
function saveState(state) {
  const tmp = `${STATE_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, STATE_PATH);
}

/** Get current time in ms */
const now = () => Date.now();

/** Create a fresh breaker state object */
function freshBreaker() {
  return {
    state: CIRCUIT_STATE.CLOSED,
    failures: 0,
    successes: 0,
    lastFailureMs: 0,
    lastSuccessMs: 0,
    openedAtMs: 0,
  };
}

/**
 * CircuitBreaker class — manages one surface's breaker state.
 * Not exported directly; use the manager functions below.
 */
class CircuitBreaker {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.state = freshBreaker();
  }

  /** Check if the breaker allows a call (CLOSED or HALF_OPEN) */
  canCall() {
    if (this.state.state === CIRCUIT_STATE.CLOSED) return true;
    if (this.state.state === CIRCUIT_STATE.OPEN) {
      // Check if timeout has elapsed → transition to HALF_OPEN
      if (now() - this.state.openedAtMs >= this.config.timeoutMs) {
        this.state.state = CIRCUIT_STATE.HALF_OPEN;
        this.state.successes = 0;
        return true;
      }
      return false;
    }
    // HALF_OPEN — allow one probe call
    return true;
  }

  /** Record a successful call */
  recordSuccess() {
    this.state.lastSuccessMs = now();
    this.state.failures = 0;

    if (this.state.state === CIRCUIT_STATE.HALF_OPEN) {
      this.state.successes += 1;
      if (this.state.successes >= this.config.successThreshold) {
        this.state.state = CIRCUIT_STATE.CLOSED;
        this.state.successes = 0;
        this.state.openedAtMs = 0;
      }
    }
  }

  /** Record a failed call */
  recordFailure() {
    this.state.lastFailureMs = now();
    this.state.failures += 1;
    this.state.successes = 0;

    if (this.state.state === CIRCUIT_STATE.HALF_OPEN) {
      // Any failure in HALF_OPEN → back to OPEN
      this.state.state = CIRCUIT_STATE.OPEN;
      this.state.openedAtMs = now();
    } else if (this.state.state === CIRCUIT_STATE.CLOSED) {
      if (this.state.failures >= this.config.failureThreshold) {
        this.state.state = CIRCUIT_STATE.OPEN;
        this.state.openedAtMs = now();
      }
    }
  }

  /** Get current status snapshot */
  getStatus() {
    return {
      name: this.name,
      state: this.state.state,
      failures: this.state.failures,
      successes: this.state.successes,
      lastFailureMs: this.state.lastFailureMs,
      lastSuccessMs: this.state.lastSuccessMs,
      openedAtMs: this.state.openedAtMs,
      config: this.config,
    };
  }

  /** Force reset to CLOSED (for manual recovery / testing) */
  reset() {
    this.state = freshBreaker();
  }

  /** Force OPEN (for testing / maintenance) */
  forceOpen() {
    this.state.state = CIRCUIT_STATE.OPEN;
    this.state.openedAtMs = now();
  }
}

/** Manager for all surface breakers */
export class CircuitBreakerManager {
  constructor(configOverrides = {}) {
    this.breakers = new Map();
    const state = loadState();

    for (const name of SURFACE_NAMES) {
      const config = { ...DEFAULT_BREAKER_CONFIG[name], ...(configOverrides[name] || {}) };
      const breaker = new CircuitBreaker(name, config);
      breaker.state = state[name] || freshBreaker();
      this.breakers.set(name, breaker);
    }
  }

  /** Get breaker for a surface */
  get(name) {
    return this.breakers.get(name);
  }

  /** Check if a surface call is allowed */
  canCall(name) {
    const b = this.breakers.get(name);
    return b ? b.canCall() : true; // fail-open if unknown surface
  }

  /** Record success for a surface */
  recordSuccess(name) {
    const b = this.breakers.get(name);
    if (b) {
      b.recordSuccess();
      this.persist();
    }
  }

  /** Record failure for a surface */
  recordFailure(name) {
    const b = this.breakers.get(name);
    if (b) {
      b.recordFailure();
      this.persist();
    }
  }

  /** Get status of all breakers */
  getAllStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }

  /** Get healthy surfaces (CLOSED or HALF_OPEN and canCall) */
  getHealthySurfaces() {
    const healthy = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.canCall()) healthy.push(name);
    }
    return healthy;
  }

  /** Get degraded surfaces (OPEN) */
  getDegradedSurfaces() {
    const degraded = [];
    for (const [name, breaker] of this.breakers) {
      if (!breaker.canCall()) degraded.push(name);
    }
    return degraded;
  }

  /** Persist all breaker state */
  persist() {
    const state = {};
    for (const [name, breaker] of this.breakers) {
      state[name] = breaker.state;
    }
    saveState(state);
  }

  /** Reset a specific breaker */
  reset(name) {
    const b = this.breakers.get(name);
    if (b) {
      b.reset();
      this.persist();
    }
  }

  /** Reset all breakers */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    this.persist();
  }
}

/** Singleton manager instance (lazy init) */
let _manager = null;

export function getCircuitBreakerManager(configOverrides) {
  if (!_manager) _manager = new CircuitBreakerManager(configOverrides);
  return _manager;
}

export function resetCircuitBreakerManager() {
  _manager = null;
}

/**
 * Wrapper to execute a surface call with circuit breaker protection.
 * Returns { ok: true, data } on success, { ok: false, error, breakerOpen: true } on breaker open,
 * { ok: false, error, breakerOpen: false } on call failure.
 */
export async function withCircuitBreaker(surfaceName, fn, manager) {
  const mgr = manager || getCircuitBreakerManager();

  if (!mgr.canCall(surfaceName)) {
    return {
      ok: false,
      error: `Circuit breaker OPEN for ${surfaceName}`,
      breakerOpen: true,
      surface: surfaceName,
    };
  }

  try {
    const data = await fn();
    mgr.recordSuccess(surfaceName);
    return { ok: true, data, surface: surfaceName };
  } catch (err) {
    mgr.recordFailure(surfaceName);
    return {
      ok: false,
      error: err.message || String(err),
      breakerOpen: false,
      surface: surfaceName,
    };
  }
}

/**
 * Synchronous version for non-async surface calls.
 */
export function withCircuitBreakerSync(surfaceName, fn, manager) {
  const mgr = manager || getCircuitBreakerManager();

  if (!mgr.canCall(surfaceName)) {
    return {
      ok: false,
      error: `Circuit breaker OPEN for ${surfaceName}`,
      breakerOpen: true,
      surface: surfaceName,
    };
  }

  try {
    const data = fn();
    mgr.recordSuccess(surfaceName);
    return { ok: true, data, surface: surfaceName };
  } catch (err) {
    mgr.recordFailure(surfaceName);
    return {
      ok: false,
      error: err.message || String(err),
      breakerOpen: false,
      surface: surfaceName,
    };
  }
}

export default {
  CIRCUIT_STATE,
  SURFACE_NAMES,
  DEFAULT_BREAKER_CONFIG,
  CircuitBreakerManager,
  getCircuitBreakerManager,
  resetCircuitBreakerManager,
  withCircuitBreaker,
  withCircuitBreakerSync,
};