#!/usr/bin/env node
/**
 * nano-compact-gate — PreToolUse hook shim for the NANO SWARM 500k context ceiling (G2).
 *
 * INERT BY DEFAULT, three independent reasons it cannot affect you yet:
 *   1. NOT registered in .claude/settings.json (the harness never invokes it until you add it).
 *   2. SCOPED to nano sessions only (env YURI_NANO_ID); the main interactive session is never touched.
 *   3. DISARMED (needs YURI_NANO_COMPACT_ENFORCE=1 or a flag file) -> METRICS_ONLY burn-in otherwise:
 *      it audits 'would_deny' to ~/.yuri-audit.log and blocks NOTHING.
 *
 * Fail-open everywhere (bad payload / error / no signal -> allow); always exit 0; never breaks a
 * session. Arm ONLY after the burn-in audit confirms a live token signal in the PreToolUse payload.
 * Decision logic + safety model live in _SYSTEM/Scripts/nano-compact-gate.mjs (14 tests, mutation-verified).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate } from '../../_SYSTEM/Scripts/nano-compact-gate.mjs';

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function audit(entry) {
  try {
    const p = path.join(os.homedir(), '.yuri-audit.log');
    fs.appendFileSync(p, `${JSON.stringify({ ts: new Date().toISOString(), guard: 'nano-compact-gate', ...entry })}\n`);
  } catch { /* best-effort */ }
}

function run() {
  let event; try { event = JSON.parse(readStdin() || '{}'); } catch { return; }
  const { verdict, output } = runGate(event, process.env);
  if (verdict.decision === 'deny') {
    audit({ action: 'deny', blocked: true, session: event.session_id, tool: event.tool_name, reason: verdict.reason });
    try { process.stdout.write(`${JSON.stringify(output)}\n`); } catch { /* ignore */ }
  } else if (verdict.decision === 'would_deny') {
    audit({ action: 'would_deny', blocked: false, metrics_only: true, session: event.session_id, tool: event.tool_name, reason: verdict.reason, sources: verdict.sources });
  }
  // allow -> silent, no output
}
try { run(); } catch { /* never break the session */ }
process.exit(0);
