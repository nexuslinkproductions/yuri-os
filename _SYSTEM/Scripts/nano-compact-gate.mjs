#!/usr/bin/env node
// @capability: nano-compact-gate
// @serves: 500k compact gate | hard auto-compact | context ceiling | nano token budget | force compaction at 500k | prevent context overflow
// @does: the NANO SWARM hard context-ceiling decision (G2) — given a token/context signal, decides allow|deny|would_deny at the 500k ceiling, SCOPED to nano sessions only, with a compaction allowlist; pure decision core + a fail-open signal reader for a PreToolUse hook
// @use: from the PreToolUse hook .claude/hooks/nano-compact-gate.js (inert until registered + armed). decideCompact is the pure, tested heart; runGate is the I/O orchestration.
// @exports: decideCompact, readTokenSignal, isNanoSession, runGate, DEFAULT_THRESHOLD_TOKENS
//
// nano-compact-gate.mjs — Phase-1 of the NANO SWARM: the HARD 500k context ceiling (Truth 1: a naive
// transcript-usage gate is stale mid-loop, so we read the freshest signal available and fail safe).
//
// SAFETY MODEL (mirrors energy-enforce, with one deliberate deviation):
//   - SCOPED: only ever acts inside a NANO session (env YURI_NANO_ID present). The main interactive
//     session has no YURI_NANO_ID -> the gate is inert. It can NEVER brick the operator's session.
//   - DUAL-ARM: armed = env YURI_NANO_COMPACT_ENFORCE=1 OR a flag file. Default OFF -> METRICS_ONLY
//     ('would_deny' audited, nothing blocked) — the energy-enforce burn-in pattern.
//   - FAIL-OPEN on NO SIGNAL (deliberate deviation from the design's "fail-closed"): a PreToolUse
//     deny-hook that blocked on missing telemetry would brick a nano whose payload lacks the field
//     (the PreToolUse payload's token fields are NOT yet confirmed present). So no-signal => allow +
//     audit. The complementary fail-CLOSED check belongs at the nano-TICK boundary (restartable),
//     not in the per-tool hook. Arm the deny only after burn-in proves a live signal.
//   - ALLOWLIST: never deny the compaction action itself.

import fs from 'node:fs';

export const DEFAULT_THRESHOLD_TOKENS = 500_000;
const COMPACT_ALLOWLIST = ['compact']; // tool/command substrings that perform compaction — never blocked
// Parse an env threshold to a POSITIVE finite number, else null — "0"/negative/garbage disables the
// axis instead of becoming a deny-everything trap (red-team A).
const posNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export function isNanoSession(env = process.env, event = {}) {
  if (env && env.YURI_NANO_ID) return true;
  // a session_id the supervisor stamped as a nano (defensive secondary signal)
  return typeof event.session_id === 'string' && /(^|[-_])nano([-_]|$)/i.test(event.session_id);
}

/**
 * PURE decision core. No I/O. Given the measured signal + config, return the gate verdict.
 * tokenCount (absolute) takes precedence over usedPct; if NEITHER is finite -> fail-OPEN (allow).
 */
export function decideCompact({
  tokenCount = null, usedPct = null,
  thresholdTokens = DEFAULT_THRESHOLD_TOKENS, thresholdPct = null,
  isNano = false, armed = false, tool = '',
} = {}) {
  if (!isNano) return { decision: 'allow', reason: 'not-a-nano-session', source: 'scope', over: false };
  if (tool && COMPACT_ALLOWLIST.some((t) => String(tool).toLowerCase().includes(t))) {
    return { decision: 'allow', reason: 'compaction-allowlisted', source: 'allowlist', over: false };
  }
  // A non-positive / non-finite threshold is DISABLED on that axis: a "0" or negative value must never
  // become a deny-everything trap (red-team A, 2026-06-13 — "0" is the intuitive *disable* value, and a
  // negative slipped the tokens path's `|| DEFAULT` because it's truthy). Defense-in-depth: the pure core
  // is brick-proof regardless of how the caller parsed env.
  const tt = Number.isFinite(thresholdTokens) && thresholdTokens > 0 ? thresholdTokens : null;
  const tp = Number.isFinite(thresholdPct) && thresholdPct > 0 ? thresholdPct : null;
  let over; let source; let detail;
  if (Number.isFinite(tokenCount) && tt != null) {
    over = tokenCount >= tt; source = 'tokens'; detail = `${tokenCount}>=${tt}`;
  } else if (Number.isFinite(usedPct) && tp != null) {
    over = usedPct >= tp; source = 'pct'; detail = `${usedPct}%>=${tp}%`;
  } else {
    return { decision: 'allow', reason: 'no-token-signal (fail-open)', source: 'none', over: false };
  }
  if (!over) return { decision: 'allow', reason: `under ceiling (${detail})`, source, over: false };
  return {
    decision: armed ? 'deny' : 'would_deny',
    reason: `nano context at/over ceiling — compact required (${detail})`,
    source, over: true,
  };
}

// Minimal transcript token-sum (mirrors token-status.parseTranscript): cumulative usage from the JSONL.
function sumTranscriptTokens(transcriptPath) {
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
    let input = 0; let output = 0; let cacheW = 0; let cacheR = 0;
    for (const line of lines) {
      try {
        const u = JSON.parse(line)?.message?.usage; if (!u) continue;
        input += u.input_tokens || 0; output += u.output_tokens || 0;
        cacheW += u.cache_creation_input_tokens || 0; cacheR += u.cache_read_input_tokens || 0;
      } catch { /* skip bad line */ }
    }
    return input + output + cacheW + cacheR;
  } catch { return null; }
}

/**
 * Read the freshest token signal available from a hook event, fail-soft. Order: an explicit
 * context_window.used_percentage (statusLine-style), else a transcript_path cumulative sum.
 * Returns { tokenCount, usedPct, sources } — any may be null.
 */
export function readTokenSignal(event = {}, { sumTranscript = sumTranscriptTokens } = {}) {
  const sources = [];
  let usedPct = null; let tokenCount = null;
  const pct = event?.context_window?.used_percentage;
  if (Number.isFinite(pct)) { usedPct = pct; sources.push('context_window.used_percentage'); }
  if (event?.transcript_path) {
    const t = sumTranscript(event.transcript_path);
    if (Number.isFinite(t)) { tokenCount = t; sources.push('transcript_path'); }
  }
  return { tokenCount, usedPct, sources };
}

function flagArmed(env = process.env) {
  if (env.YURI_NANO_COMPACT_ENFORCE === '1') return true;
  try { return fs.existsSync(env.YURI_NANO_COMPACT_FLAG || '/nonexistent-nano-compact-flag'); } catch { return false; }
}

/**
 * Orchestrate: scope -> signal -> decide. Returns { verdict, output } where output is the
 * hookSpecificOutput object to emit (or null for allow/no-op). Never throws.
 */
export function runGate(event = {}, env = process.env, opts = {}) {
  try {
    const isNano = isNanoSession(env, event);
    const { tokenCount, usedPct, sources } = readTokenSignal(event, opts);
    const verdict = decideCompact({
      tokenCount, usedPct,
      thresholdTokens: posNum(env.YURI_NANO_COMPACT_TOKENS) ?? DEFAULT_THRESHOLD_TOKENS,
      thresholdPct: posNum(env.YURI_NANO_COMPACT_PCT),
      isNano, armed: flagArmed(env), tool: event.tool_name || event.tool || '',
    });
    verdict.sources = sources;
    let output = null;
    if (verdict.decision === 'deny') {
      output = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `NANO_COMPACT_GATE: ${verdict.reason}` } };
    }
    return { verdict, output };
  } catch (e) {
    return { verdict: { decision: 'allow', reason: `gate-error (fail-open): ${e?.message || e}`, source: 'error', over: false }, output: null };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI self-check: print a sample verdict for a fake over-threshold nano event.
  const demo = runGate({ session_id: 'nano-demo', tool_name: 'Edit', context_window: { used_percentage: 80 } }, { YURI_NANO_ID: 'demo', YURI_NANO_COMPACT_PCT: '75' });
  process.stdout.write(`${JSON.stringify(demo.verdict)}\n`);
}
