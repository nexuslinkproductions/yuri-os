#!/usr/bin/env node
/**
 * energy-enforce — PreToolUse Policy-Enforcement-Point for the energy circuit
 * breaker. The trailing-verdict PEP that finally makes the work-dynamics gate
 * *act* instead of only *observe*.
 *
 * ARCHITECTURE (PDP/PEP split, borrowed from OPA): the decision is computed by
 * the energy gate (gateProposal = PDP) in PostToolUse and persisted as a breaker
 * state in the session snapshot; this hook is the PEP that reads that state and
 * enforces it on the NEXT tool call. It is layer-2 defense-in-depth, registered
 * LAST in the PreToolUse chain so the deterministic guards (bash-security-guard,
 * operator-write-guard, …) always rule first.
 *
 * SAFETY (non-negotiable):
 *   - Master switch: YURI_ENERGY_OBSERVABILITY=1 (no verdicts exist otherwise).
 *   - Enforcement switch: YURI_ENERGY_ENFORCE=1 (DEFAULT OFF). Off => METRICS_ONLY
 *     burn-in — the breaker state still evolves + would-be denies are audited, but
 *     NOTHING is ever blocked. Watch the audit log, confirm zero false trips, THEN
 *     flip the flag.
 *   - FAILS OPEN on every data gap (missing/malformed snapshot, breaker error).
 *   - Only ever DENIES on a catastrophic non-offsettable trailing veto; the breaker
 *     auto-decays (OPEN->HALF_OPEN->CLOSED) so it can never permanently block.
 *   - YURI_ENERGY_BREAKER_RESET=1 force-closes the breaker (operator override).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate, loadBreakerCfg, freshBreaker } from '../../_SYSTEM/Scripts/energy-breaker.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
const SNAP_DIR = process.env.YURI_STATE_DIR
  ? path.join(process.env.YURI_STATE_DIR, 'energy-session')
  : path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-session');

// Enforcement enable = env flag OR a runtime flag file. The flag file lets the owner
// flip enforce live WITHOUT restarting the session (an env var only reaches
// newly-launched processes, not the already-running hook parent). Default off (neither
// present) => pure metrics-only burn-in. The flag lives in gitignored state, so the
// committed default stays OFF; enabling is always a deliberate local act.
const ENFORCE_FLAG = process.env.YURI_STATE_DIR
  ? path.join(process.env.YURI_STATE_DIR, 'energy-enforce.enabled')
  : path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-enforce.enabled');
function enforceEnabled() {
  if (process.env.YURI_ENERGY_ENFORCE === '1') return true;
  try { return fs.existsSync(ENFORCE_FLAG); } catch { return false; }
}

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

// Bound our contribution to the shared audit log so a pathological tripped-breaker
// loop can't grow it without limit (corpus "DoS via log files" / Uncontrolled
// Resource Consumption). Best-effort: stop appending once the log is already large;
// log rotation itself is a separate system concern, not this hook's to own.
const AUDIT_MAX_BYTES = 50 * 1024 * 1024;
function audit(entry) {
  try {
    const p = path.join(os.homedir(), '.yuri-audit.log');
    try { if (fs.statSync(p).size >= AUDIT_MAX_BYTES) return; } catch { /* not created yet */ }
    fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), guard: 'energy-enforce', ...entry }) + '\n');
  } catch { /* audit best-effort */ }
}
function emit(obj) { try { process.stdout.write(JSON.stringify(obj) + '\n'); } catch { /* ignore */ } }

function run() {
  // Master switch — no verdicts exist unless observability is on. Zero work otherwise.
  if (process.env.YURI_ENERGY_OBSERVABILITY !== '1') return;

  let event;
  try { event = JSON.parse(readStdin() || '{}'); } catch { return; }
  const rawId = (event && typeof event.session_id === 'string' && event.session_id) ? event.session_id : 'default';
  const sessionId = rawId.replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  const snapPath = path.join(SNAP_DIR, `${sessionId}.json`);

  let snap = null;
  try { snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')); } catch { snap = null; }
  if (!snap || typeof snap !== 'object') return; // fail-open: no state -> allow

  // Operator override: force-close the breaker, allow.
  if (process.env.YURI_ENERGY_BREAKER_RESET === '1') {
    try { snap.breaker = freshBreaker(); fs.writeFileSync(snapPath, JSON.stringify(snap) + '\n'); } catch { /* ignore */ }
    audit({ action: 'reset', session: sessionId });
    return;
  }

  const enforce = enforceEnabled();
  let res;
  try { res = evaluateGate(snap.breaker, Date.now(), loadBreakerCfg()); }
  catch { return; } // fail-open on any breaker error

  // Persist the (possibly advanced) breaker so the state machine evolves whether or
  // not we enforce — this is what gives a true METRICS_ONLY burn-in in the snapshot.
  try { snap.breaker = res.breaker; fs.writeFileSync(snapPath, JSON.stringify(snap) + '\n'); } catch { /* ignore */ }

  if (res.decision === 'deny') {
    if (enforce) {
      audit({ action: 'deny', blocked: true, session: sessionId, tool: event.tool_name, reason: String(res.reason).slice(0, 200) });
      emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `YURI_ENERGY_BREAKER: ${res.reason}`,
        },
      });
    } else {
      audit({ action: 'would_deny', blocked: false, metrics_only: true, session: sessionId, tool: event.tool_name, reason: String(res.reason).slice(0, 200) });
    }
    return;
  }

  if (res.decision === 'steer' || res.decision === 'probe') {
    if (enforce) {
      emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `⚡ energy-breaker [${res.decision}]: ${res.reason}`,
        },
      });
    } else {
      audit({ action: res.decision, metrics_only: true, session: sessionId });
    }
    return;
  }
  // 'allow' -> no output, no block
}

try { run(); } catch { /* never break the session */ }
process.exit(0);
