#!/usr/bin/env node
/**
 * prose-claim-extract.mjs — PostToolUse hook (Write|Edit|MultiEdit).  ADVISORY / OWNER-GATED.
 *
 * The LIVE collector for the 3b prose-claim source. On every write of prose/code it extracts
 * structured claims (anchor-bound identity), folds them into the advisory SHADOW ledger, and
 * appends grounding metrics — so P_emit / veto-storm / partition rates are measured on FRESH
 * session work (where a claim and its evidence are co-located), which is the correct corpus the
 * batch `measure` over historical memory could only approximate.
 *
 * HARD CONTRACT (why this is safe to run):
 *   - ADVISORY ONLY. Never feeds energy-enforce, never returns a deny, ALWAYS exits 0.
 *   - FAIL-OPEN by design (the inverse of a security gate): a measurement hook must NEVER
 *     break the session. Any error → silent exit 0.
 *   - It only READS the written content (already on disk / in the payload) and WRITES to
 *     _SYSTEM/state/claim-extractor/ (a non-protected runtime-state dir). No protected path.
 *
 * NOT auto-wired into .claude/settings.json — wiring a PostToolUse hook changes session
 * behavior, so it is the OWNER-GATED step (same pattern as math-register-guard). To arm the
 * live collector, add to settings.json PostToolUse (matcher "Write|Edit|MultiEdit"):
 *     { "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/prose-claim-extract.mjs\"" }
 * Until then, run the collector manually:  node _SYSTEM/Scripts/prose-claim-extractor.mjs measure <files>
 *
 * Related: _SYSTEM/Scripts/prose-claim-extractor.mjs (the core), ops plan §3③/§11/§12.
 */

import {
  extractClaims, measureClaims, loadShadowLedger, persistShadow, mergeLedgers,
} from '../../_SYSTEM/Scripts/prose-claim-extractor.mjs';

const MAX_CONTENT = 200_000; // never scan an enormous blob in a hook
// Bounded ROLLING WINDOW for the shadow ledger (pre-arm safety audit, 2026-06-13): measureClaims
// is O(ledger) and runs on every write, so an uncapped ledger would eventually exceed the hook
// timeout and silently break the collector. 5000 ⇒ ~235ms measure (≈5% of the 5s budget) with
// generous cross-write history for the partition/churn signals. Old claims age out by recency.
const MAX_LEDGER_CLAIMS = 5000;

async function main() {
  // Read the PostToolUse payload from stdin.
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch { process.exit(0); }
  let event;
  try { event = JSON.parse(raw); } catch { process.exit(0); }

  const tool = event?.tool_name || '';
  if (!/^(Write|Edit|MultiEdit)$/.test(tool)) process.exit(0);
  if (event?.tool_response?.is_error) process.exit(0); // failed write — nothing landed

  const filePath = event?.tool_input?.file_path || event?.tool_input?.path || '';
  // Gather the written prose: Write→content, Edit→new_string, MultiEdit→all new_strings.
  let content = '';
  const ti = event?.tool_input || {};
  if (typeof ti.content === 'string') content = ti.content;
  else if (typeof ti.new_string === 'string') content = ti.new_string;
  else if (Array.isArray(ti.edits)) content = ti.edits.map((e) => e?.new_string || '').join('\n');
  if (!content || content.length > MAX_CONTENT) process.exit(0);

  // Only prose/code carries claims; skip data/lock/binary-ish extensions.
  if (filePath && !/\.(md|mjs|js|ts|cjs|jsx|tsx|txt|json|sh|py|rs)$/i.test(filePath)) process.exit(0);

  const nowMs = Date.now();
  try {
    // inferSubjectFromFile: ON here — the written file IS the implicit subject for anaphoric
    // claims ("this module is wired"), which gives a stable, meaningful anchor (the basename).
    const fresh = extractClaims(content, { filePath, nowMs, inferSubjectFromFile: true });
    if (!fresh.length) process.exit(0);
    const prior = loadShadowLedger();
    const merged = mergeLedgers(prior.claims, fresh, { nowMs, maxClaims: MAX_LEDGER_CLAIMS });
    const { metrics } = measureClaims(merged, { nowMs, priorClaims: prior.claims });
    metrics.ledgerCapped = merged.length >= MAX_LEDGER_CLAIMS;
    metrics.event = 'posttooluse';
    metrics.tool = tool;
    metrics.filePath = filePath || null;
    metrics.freshClaims = fresh.length;
    persistShadow(merged, metrics);
    // Advisory visibility only (PostToolUse stderr is surfaced but NON-blocking): note the
    // aggregate over-claim count in the shadow ledger when this write contributed claims.
    const retracts = metrics.byVerdict?.RETRACT || 0;
    if (retracts > 0) {
      process.stderr.write(`[prose-claim-extract] advisory: ${retracts} over-claim(s) in shadow ledger (P_emit≈${metrics.pEmitEstimate}); not blocking.\n`);
    }
  } catch { /* fail-open: measurement must never break the session */ }
  process.exit(0);
}

main();
