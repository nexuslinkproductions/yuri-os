#!/usr/bin/env node
/**
 * contract-conformance-trace.mjs — DISARMED advisory soak recorder for the conformance gate.
 *
 * The wiring primitive prescribed by the wiring sim (quantum order-effect: C–S non-commuting →
 * run on FINAL output; C–E commuting → placement free) + Codex review: ADVISORY, post-final-capture,
 * NON-BLOCKING soak BEFORE any enforcing arm — the same disarmed-collector pattern as the claim-gate.
 *
 * It runs checkOutputConformance and appends a compact verdict to a soak trace. It NEVER throws and
 * NEVER blocks. Arming (turning a FAIL into a veto) is a separate, explicit owner step — not here.
 *
 * Soak: _SYSTEM/state/contract-conformance-soak.jsonl  (state/ is writable, not protected).
 */
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOutputConformance } from './contract-conformance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const SOAK_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'contract-conformance-soak.jsonl');
// Resolved at call time so YURI_CONFORMANCE_SOAK_PATH can redirect the soak (e.g. tests → /tmp).
function soakFile() { return process.env.YURI_CONFORMANCE_SOAK_PATH || SOAK_FILE; }

// ENFORCEMENT ARM (mirrors energy-enforce): env YURI_CONFORMANCE_ENFORCE=1 OR a runtime flag-file.
// Default OFF = advisory soak. The flag is LOCAL runtime state — `touch` it to arm, delete to stand
// down; it is never committed. Enforcement keys on HARD checks only (scope-containment, label-grammar,
// scope-input-malformed) — the low-false-positive structural checks. Soft checks stay advisory always.
export const ENFORCE_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'contract-conformance-enforce.enabled');
export function isEnforcing() {
  if (process.env.YURI_CONFORMANCE_ENFORCE === '1') return true;
  if (process.env.YURI_CONFORMANCE_ENFORCE === '0') return false;
  try { return existsSync(ENFORCE_FLAG); } catch { return false; }
}

// Canonical YURI lane Output Contract (yuri-origin "Output Contract" + "Lane Result Grammar").
// The protected-surface floor is ALWAYS-ON inside the gate, so forbidden_scope can stay empty here.
export const CANONICAL_YURI_OUTPUT_CONTRACT = Object.freeze({
  flags: { no_stage_narration: true, broad_command_ban: true, final_report_only: true, report_line_cap: 25, command_output_caps: true },
  output_schema: { type: 'final_report', fields: ['RESULT_LABEL'] },
  forbidden_scope: [],
});
// Meta-report contract: a scope audit only — no RESULT_LABEL expected (e.g. closeout changed-paths audit).
export const SCOPE_AUDIT_CONTRACT = Object.freeze({ expects_result_label: false, flags: {} });

// @capability: contract-conformance-trace
// @serves: record conformance verdict | soak the contract gate | advisory non-blocking conformance log | audit changed paths against protected surfaces | DISARMED conformance collector | scope audit of touched paths
// @does: runs checkOutputConformance and appends a compact advisory entry to the soak trace (_SYSTEM/state/contract-conformance-soak.jsonl). Never throws, never blocks (DISARMED — pure observer). Ships the canonical YURI output contract + a scope-audit contract + scopeAudit(paths).
// @use: wire at a post-final-capture point (lane finalize / closeout) to collect conformance verdicts BEFORE any enforcing arm — the soak that data-gates arming, mirroring the disarmed claim-gate collector
// @exports: recordConformance, scopeAudit, CANONICAL_YURI_OUTPUT_CONTRACT, SCOPE_AUDIT_CONTRACT, SOAK_FILE
export function recordConformance(output, opts = {}) {
  try {
    const contract = opts.contract || CANONICAL_YURI_OUTPUT_CONTRACT;
    const result = checkOutputConformance(contract, typeof output === 'string' ? output : '', { invokedPaths: opts.invokedPaths });
    const enforcing = opts.enforce ?? isEnforcing();
    const enforceBlock = !!(enforcing && (result.hardFails || []).length > 0); // HARD checks only — low false-positive
    const entry = {
      ts: opts.ts ?? Date.now(),
      label: typeof opts.label === 'string' ? opts.label : 'unlabeled',
      verdict: result.verdict,
      score: typeof result.score === 'number' ? Number(result.score.toFixed(3)) : null,
      hardFails: result.hardFails || [],
      softFails: result.softFails || [],
      notEnforced: result.notEnforced || [],
      vacuous: !!result.vacuous,
      blockedMode: !!result.blockedMode,
      enforcing,
      enforceBlock,
    };
    if (opts.record !== false) {
      try {
        const sf = soakFile();
        mkdirSync(path.dirname(sf), { recursive: true });
        appendFileSync(sf, JSON.stringify(entry) + '\n');
      } catch (_) { /* soak is best-effort; never let logging break the caller */ }
    }
    return { ...result, soak: entry, enforcing, enforceBlock };
  } catch (e) {
    // never throw into the caller (advisory layer)
    return { ok: false, verdict: 'FAIL', error: String(e && e.message), soak: null, enforcing: false, enforceBlock: false };
  }
}

// Scope-only audit of a path set against the protected floor (+ optional contract). No label required.
export function scopeAudit(invokedPaths = [], opts = {}) {
  const paths = Array.isArray(invokedPaths) ? invokedPaths : [];
  return recordConformance('', { ...opts, contract: opts.contract || SCOPE_AUDIT_CONTRACT, invokedPaths: paths, label: opts.label || 'scope-audit' });
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const enforceMsg = (r) => { if (r.enforceBlock) { console.log('ENFORCED: HARD conformance failure → exit 2 (stand down: delete _SYSTEM/state/contract-conformance-enforce.enabled)'); process.exitCode = 2; } };
  if (cmd === 'scope') {
    const paths = process.argv.slice(3).filter(Boolean);
    const r = scopeAudit(paths, { label: 'cli-scope' });
    console.log(`scope-audit verdict=${r.verdict} hardFails=${JSON.stringify(r.hardFails)} enforcing=${r.enforcing} paths=${paths.length}`);
    enforceMsg(r);
  } else if (cmd === 'check') {
    const oi = process.argv.indexOf('--output');
    const fs2 = await import('node:fs');
    const out = oi > -1 ? fs2.readFileSync(process.argv[oi + 1], 'utf8') : '';
    const r = recordConformance(out, { label: 'cli-check' });
    console.log(`check verdict=${r.verdict} score=${r.soak?.score} hardFails=${JSON.stringify(r.hardFails)} softFails=${JSON.stringify(r.softFails)} enforcing=${r.enforcing}`);
    enforceMsg(r);
  } else if (cmd === 'status') {
    console.log(`contract-conformance enforcement: ${isEnforcing() ? 'ARMED' : 'DISARMED (advisory soak)'}  flag=${ENFORCE_FLAG}`);
  } else {
    console.log('contract-conformance-trace — advisory soak recorder (arm via flag-file / YURI_CONFORMANCE_ENFORCE=1).\n  scope <path...>          scope-audit paths vs protected floor (exit 2 if armed + HARD fail)\n  check --output <file>     full conformance of a produced report\n  status                    show ARMED/DISARMED');
  }
}
