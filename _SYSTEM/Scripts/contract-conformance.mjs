#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
/**
 * contract-conformance.mjs — deterministic OUTPUT-vs-CONTRACT conformance gate.
 *
 * WHY THIS EXISTS (corpus-transform 2026-06-13, capability-first-proven gap):
 *   prompt-compiler.mjs COMPILES a one-transaction-contract that DECLARES an
 *   output_schema (required fields), allowed/forbidden_scope, and forbidden-pattern
 *   flags (no_stage_narration, broad_command_ban, report_line_cap). It validates the
 *   CONTRACT's own shape (validateCompiledContract) — but NOTHING checked a PRODUCED
 *   output against the declared contract. Declared-but-unenforced. This closes that loop.
 *
 *   It also gives YURI's Lane Result Grammar (prose in _SYSTEM/yuri-origin.md →
 *   "Lane Result Grammar") its FIRST executable parser. The corpus's own examples already
 *   drift from the prose grammar (08CW_..._X_PASS_COMMITTED vs 08L_..._X1_BLOCKED vs
 *   grammar's "_COMMITTED") — exactly why a prose grammar needs a checkable mechanism.
 *
 *   Mechanizes the two still-prose dimensions isolated in the CL4R1T4S inventory:
 *     dim #5 output/format contract (PROSE → checkable), dim #3 tool-use/scope contract.
 *   Pure structural extraction — NO external content copied; YURI-native + deterministic.
 *
 * POSTURE: ADVISORY. Returns a structured verdict; it does NOT block. Wiring it into any
 *   enforcing hook is a separate, owner-gated step (Codex pass first, per standing rule).
 *
 * HARDENING (adversarial red-team 2026-06-13, 5 lenses, 8 confirmed flaws fixed):
 *   - scope matching is SEGMENT-AWARE over path.posix.normalize'd paths (kills `../`
 *     traversal, nested-secret, and sibling-prefix escapes that raw startsWith missed);
 *   - an ALWAYS-ON protected-surface floor (yuri-origin Protected Surfaces) flags .env /
 *     backend/data/ / .claude/state etc. even when the contract declares no scope;
 *   - RESULT_LABEL is MARKER-ANCHORED ("RESULT_LABEL:" line), else the LAST conforming
 *     label — never a stray aspirational label mentioned in prose;
 *   - blockedMode is driven by the PARSED primary-label terminal, not output.includes();
 *   - the whole gate is wrapped fail-CLOSED: any throw (malformed scope entry, hostile
 *     getter, null opts) returns verdict FAIL, never an uncaught exception;
 *   - soft scanners are PRECISION-FIRST (line-anchored commands, execution-narration only)
 *     to avoid penalizing legitimate report prose.
 *
 * Verdict model:
 *   - HARD checks (structural, low false-positive): result-label-grammar, scope-containment.
 *     Any HARD failure → verdict FAIL.
 *   - SOFT checks (advisory, can false-positive): schema-fields, result-label-canonical,
 *     no-stage-narration, broad-command-ban, report-line-cap, contract-substance.
 *     SOFT-only failures → verdict PARTIAL.
 *   - All green → PASS. Fail-closed: malformed/hostile input → FAIL.
 */
import path from 'node:path';

// ── Lane Result Grammar (canonical: _SYSTEM/yuri-origin.md → "Lane Result Grammar") ──
const KNOWN_TERMINALS = ['PASS_COMMITTED', 'COMMITTED', 'BLOCKED', 'REPAIR_REQUIRED'];
const LANE_ID_CANON = /^\d{2}[A-Z]{2}$/;
const PASS_TYPE_CANON = /^[XPF]$/;
const PASS_TYPE_VARIANT = /^[XPF]\d+$/; // compiler emits X1 (prompt-compiler failure_contract)
const DESCRIPTION_RE = /^[A-Z0-9]+(_[A-Z0-9]+)*$/;
const DESCRIPTION_MAX = 60;

// Always-on protected-surface floor (yuri-origin "Protected Surfaces"). Forbidden even when
// the contract declares no forbidden_scope — protected paths are ABSOLUTE in YURI.
const PROTECTED_FLOOR = Object.freeze([
  '.env', 'backend/data', '.claude/state', '.claude/history',
  '.claude/file-history', '.claude/projects', 'node_modules', '.amp',
]);

export function parseResultLabel(label) {
  const issues = [];
  if (typeof label !== 'string' || label.trim().length === 0) {
    return { ok: false, issues: ['label-empty-or-nonstring'] };
  }
  const raw = label.trim();
  const tokens = raw.split('_').filter((t) => t.length > 0);
  if (tokens.length < 3) {
    return { ok: false, label: raw, issues: ['too-few-segments (need LANE_ID, DESCRIPTION, PASS_TYPE, terminal)'] };
  }

  let terminal = null;
  for (const t of KNOWN_TERMINALS) {
    if (raw.endsWith(`_${t}`) || raw === t) { terminal = t; break; }
  }
  if (!terminal) {
    return { ok: false, label: raw, issues: ['unknown-terminal (expected one of ' + KNOWN_TERMINALS.join('|') + ')'] };
  }

  const laneId = tokens[0];
  if (!LANE_ID_CANON.test(laneId)) {
    issues.push(`lane-id-noncanonical "${laneId}" (canonical: 2-digit+2-letter, e.g. 08CW)`);
  }

  const terminalTokenCount = terminal.split('_').length;
  const middle = tokens.slice(1, tokens.length - terminalTokenCount);
  if (middle.length < 2) {
    return { ok: false, label: raw, laneId, terminal, issues: [...issues, 'missing DESCRIPTION or PASS_TYPE between lane-id and terminal'] };
  }

  const passType = middle[middle.length - 1];
  let passTypeOk = false;
  if (PASS_TYPE_CANON.test(passType)) {
    passTypeOk = true;
  } else if (PASS_TYPE_VARIANT.test(passType)) {
    passTypeOk = true;
    issues.push(`pass-type-variant "${passType}" (canonical is single X|P|F)`);
  } else {
    return { ok: false, label: raw, laneId, terminal, issues: [...issues, `pass-type-invalid "${passType}" (expected X|P|F)`] };
  }

  const description = middle.slice(0, -1).join('_');
  if (!DESCRIPTION_RE.test(description)) {
    issues.push(`description-not-screaming-snake "${description}"`);
  }
  if (description.length > DESCRIPTION_MAX) {
    issues.push(`description-too-long ${description.length}>${DESCRIPTION_MAX}`);
  }

  return {
    ok: passTypeOk && description.length > 0,
    label: raw,
    laneId,
    description,
    passType,
    passTypeNorm: passType[0],
    terminal,
    canonical: issues.length === 0,
    variant: issues.length > 0,
    issues,
  };
}

// ── path normalization + segment-aware scope matching (lexical; paths are CLAIMED, no FS) ──
function normPath(p) {
  const s = String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (s.length === 0) return '';
  return path.posix.normalize(s).replace(/\/+$/, '');
}
function segsOf(p) { return normPath(p).split('/').filter((s) => s.length > 0); }
function containsSegs(pathSegs, scopeSegs) {
  if (!scopeSegs.length || scopeSegs.length > pathSegs.length) return false;
  for (let i = 0; i + scopeSegs.length <= pathSegs.length; i += 1) {
    let ok = true;
    for (let j = 0; j < scopeSegs.length; j += 1) {
      if (pathSegs[i + j] !== scopeSegs[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}
// forbidden hit: a bare name matches a path segment; a dir path matches a contiguous segment run.
// Bare DOTFILE names (.env) also match variants (.env.local, .env.production) — the secret-file
// case is fail-closed by design; non-dotfile bare names stay exact to avoid over-matching prose.
function hitsForbidden(p, entry) {
  const ps = segsOf(p);
  const es = segsOf(entry);
  if (es.length === 0) return false;
  if (es.length === 1) {
    const name = es[0];
    if (name.startsWith('.')) return ps.some((s) => s === name || s.startsWith(name + '.'));
    return ps.includes(name);
  }
  return containsSegs(ps, es);
}
// within allowed: equal or a true path-segment descendant (no sibling-prefix false-accept)
function withinAllowed(p, entry) {
  const np = normPath(p);
  const ne = normPath(entry);
  if (ne.length === 0) return false;
  return np === ne || np.startsWith(ne + '/');
}
// A contract's allowed_scope/forbidden_scope may carry SEMANTIC prose (e.g. "Decode raw input
// into objective ...", as yuri-input-genome.mjs compiles) — NOT filesystem paths. Only path-shaped
// entries participate in path-containment; prose is ignored for scope (it is not path-checkable).
// Prose has whitespace; a path does not. (Codex finding 2, 2026-06-13.)
function isPathLike(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length === 0 || /\s/.test(t)) return false;
  return t.includes('/') || t.startsWith('.') || /^[\w.@-]+$/.test(t);
}
// Coerce an invokedPaths entry to a string path. Accepts a string or a tool-record object
// ({path|file|filePath|file_path|target}). Returns null if non-coercible → caller fails CLOSED
// rather than silently dropping it (Codex finding 1, 2026-06-13).
function coercePath(p) {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') {
    for (const k of ['path', 'file', 'filePath', 'file_path', 'target']) {
      if (typeof p[k] === 'string' && p[k].length) return p[k];
    }
  }
  return null;
}

// ── output extraction (deterministic, marker-anchored) ──
// The SINGLE canonical Lane Result Grammar token — glm-fleet.mjs + ollama-fleet.mjs delegate here.
// Widened 2026-07-02 (master plan D-3): real lanes emit >3-char and letter-led prefixes (14PHASE0_,
// AMS_) and wrap labels in markdown bold; the old /\d{2}[A-Z0-9]{1,3}_/ silently dropped ~19% of
// successful packets, which convergence then re-dispatched as failures.
export const LABEL_TOKEN_RE = /\b[A-Z0-9]{2,12}(?:_[A-Z0-9]{1,60})*_(?:PASS_COMMITTED|COMMITTED|BLOCKED|REPAIR_REQUIRED)\b/;
const LABEL_TOKEN_RE_G = new RegExp(LABEL_TOKEN_RE.source, 'g');
export function extractResultLabel(output) {
  // markdown emphasis never appears INSIDE a label — strip * and ` so **LABEL** / `LABEL` anchor cleanly
  const s = String(output || '').replace(/[*`]+/g, '');
  // 1. prefer an explicit "RESULT_LABEL:" / "RESULT_LABEL=" marker line (the lane's DECLARED result);
  //    the capture must be a SCREAMING token — lowercase prose after the marker falls through to (2)
  const marker = s.match(/^[^\n]*\bRESULT_LABEL\b\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9_]+)/im);
  if (marker && /^[A-Z0-9][A-Z0-9_]+$/.test(marker[1])) {
    return { label: marker[1].replace(/^_+|_+$/g, ''), anchored: true };
  }
  // 2. else the LAST conforming label (final-report convention) — never a stray prose mention up top
  const all = s.match(LABEL_TOKEN_RE_G);
  if (all && all.length) return { label: all[all.length - 1].replace(/^_+|_+$/g, ''), anchored: false };
  return { label: null, anchored: false };
}

// A fleet lane's PROCESS EXIT CODE and its PRODUCED OUTPUT can disagree. A lane can write
// complete, RESULT_LABEL'd output to its --out file and THEN exit non-zero — a post-output
// cap-kill (idle-stall / wall-clock watchdog), an idle-socket transport cleanup, or a
// retry-exhaustion after the good write. Treating that as a fleet FAILURE produced the
// cosmetic exit-1 (owner-flagged 2026-07-03): a 33KB complete design doc carrying
// 10GC_..._X_PASS_COMMITTED was reported as a failed dispatch. Classify OUTPUT-first:
//   - no usable output (empty OR a failure sentinel)                 -> failed
//   - usable output + clean exit (code 0)                            -> ok
//   - usable output + nonzero exit + valid, non-F RESULT_LABEL       -> ok (degraded — work landed)
//   - usable output + nonzero exit + no / invalid / F label          -> failed (can't certify a pass)
// Failure sentinels are the diagnostics a fleet/lane-dispatch writes into --out when the real
// work never landed: `[GLM_FLEET_…]` / `[OLLAMA_FLEET_…]` (fleet-synthesized) and
// `LANE_DISPATCH_FAIL …` (lane-dispatch hard-fail marker).
const FLEET_FAILURE_SENTINEL_RE = /^(?:\[(?:GLM|OLLAMA)_FLEET_|LANE_DISPATCH_FAIL)/;
export function classifyLaneOutcome({ code, text } = {}) {
  const t = String(text || '').trim();
  const cleanExit = code === 0;
  const hasUsableOutput = t.length > 0 && !FLEET_FAILURE_SENTINEL_RE.test(t);
  if (!hasUsableOutput) {
    return { ok: false, degraded: false, reason: cleanExit ? 'empty-output' : `no-usable-output-exit-${code}` };
  }
  if (cleanExit) return { ok: true, degraded: false, reason: 'clean' };
  // Non-zero exit WITH usable output: certify only if the lane self-declared a non-failure
  // RESULT_LABEL (X or P). An F label or a missing/invalid label stays a real failure — we
  // will not silently upgrade a truncated or self-reported-failed lane to success.
  const parsed = parseResultLabel(extractResultLabel(t).label || '');
  if (parsed.ok && parsed.passTypeNorm !== 'F') {
    return { ok: true, degraded: true, reason: `completed-despite-exit-${code}` };
  }
  return { ok: false, degraded: false, reason: `nonzero-exit-${code}-no-pass-label` };
}

function fieldPresent(output, field) {
  // present as a heading/label token (word-boundary, case-sensitive — SCREAMING tokens)
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9_])${esc}([^A-Z0-9_]|$)`).test(output);
}

// execution-narration ONLY (the model announcing its next tool step) — NOT report-closing prose.
// Deliberately excludes "let me know", "here's what i changed", "let's ..." (legitimate closings).
const STAGE_NARRATION_RE = [
  /^\s*(let me (check|look|start|see|begin|run|go|first|now|try|inspect|verify)\b|i'?ll (check|start|look|run|go ahead|now|first|begin|try|inspect|verify)\b|now i'?ll\b|first,?\s+i'?ll\b|next,?\s+i'?ll\b)/im,
];
// broad/destructive commands — LINE-ANCHORED (an issued command), so documentation/anti-pattern
// prose ("do not git add .", "the hook blocks rm -rf /") is NOT penalized.
const BROAD_COMMAND_RE = [
  /^\s*(?:\$\s+|%\s+|>\s+|#\s+)?git\s+add\s+\.(?:\s|$)/im,
  /^\s*(?:\$\s+|%\s+|>\s+|#\s+)?git\s+add\s+-A\b/im,
  /^\s*(?:\$\s+|%\s+|>\s+|#\s+)?find\s+\/(?:\s|$)/im,
  /^\s*(?:\$\s+|%\s+|>\s+|#\s+)?rm\s+-rf?\s+\//im,
];

// @capability: contract-conformance
// @serves: does this output conform to its contract | output contract gate | validate produced output against declared schema | lane result grammar parser | RESULT_LABEL validation | tool-use scope conformance | check response against output_schema | protected-path scope gate
// @does: deterministic fail-closed gate — given a compiled one-transaction-contract + a produced output (+ optional invoked paths), checks RESULT_LABEL grammar (marker-anchored), required output_schema fields present, SEGMENT-AWARE scope containment (allowed/forbidden + always-on yuri-origin protected-surface floor), forbidden-pattern flags (stage-narration/broad-command, precision-first), and report line-cap. Returns PASS|PARTIAL|FAIL with per-check evidence. Never throws (any internal error → FAIL).
// @use: after a lane/agent produces a final report, to verify it actually honored the contract prompt-compiler compiled — the missing enforcement half of compileOneTransactionContract. Also the executable parser for yuri-origin's prose Lane Result Grammar + a protected-path scope check. ADVISORY (does not block).
// @exports: checkOutputConformance, parseResultLabel, extractResultLabel, classifyLaneOutcome, LABEL_TOKEN_RE
export function checkOutputConformance(contract, output, opts = {}) {
  try {
    return runConformance(contract, output, opts);
  } catch (e) {
    // fail-CLOSED: any unexpected throw (hostile getter, exotic input) → FAIL, never propagate
    return { ok: false, verdict: 'FAIL', score: 0, blockedMode: false, hardFails: ['internal-error'], softFails: [], vacuous: false, checks: [{ name: 'internal-error', severity: 'hard', ok: false, evidence: `gate threw: ${e && e.message}` }] };
  }
}

function runConformance(contract, output, opts) {
  const checks = [];
  const add = (name, severity, ok, evidence) => checks.push({ name, severity, ok, evidence });

  if (!contract || typeof contract !== 'object') {
    return { ok: false, verdict: 'FAIL', score: 0, blockedMode: false, hardFails: ['contract-shape'], softFails: [], vacuous: false, checks: [{ name: 'contract-shape', severity: 'hard', ok: false, evidence: 'contract not an object' }] };
  }
  if (typeof output !== 'string') {
    return { ok: false, verdict: 'FAIL', score: 0, blockedMode: false, hardFails: ['output-shape'], softFails: [], vacuous: false, checks: [{ name: 'output-shape', severity: 'hard', ok: false, evidence: 'output not a string' }] };
  }

  const safeOpts = (opts && typeof opts === 'object') ? opts : {};
  const rawInvoked = Array.isArray(safeOpts.invokedPaths) ? safeOpts.invokedPaths : [];
  const invokedPaths = rawInvoked.map(coercePath).filter((p) => typeof p === 'string');
  const malformedInvoked = rawInvoked.length - invokedPaths.length;
  const flags = (contract.flags && typeof contract.flags === 'object') ? contract.flags : {};

  // ── HARD 1: RESULT_LABEL (marker-anchored) + grammar parse ──
  // A meta-report (e.g. a closeout scope audit) sets contract.expects_result_label:false — then the
  // label HARD check is skipped and only scope/schema/flags apply. Default: a lane result needs a label.
  const expectsLabel = contract.expects_result_label !== false;
  const ex = extractResultLabel(output);
  const parsed = ex.label ? parseResultLabel(ex.label) : { ok: false, issues: ['no RESULT_LABEL found in output'] };
  if (expectsLabel) {
    add('result-label-grammar', 'hard', parsed.ok,
      parsed.ok ? `MATCH label=${parsed.label} lane=${parsed.laneId} pass=${parsed.passTypeNorm} terminal=${parsed.terminal} anchored=${ex.anchored}`
                : `FAIL ${(parsed.issues || []).join('; ')}`);
  }

  // blockedMode is driven by the PARSED primary label terminal — not output.includes()
  const blockedMode = !!(parsed.ok && (parsed.terminal === 'BLOCKED' || parsed.terminal === 'REPAIR_REQUIRED'));

  // ── SOFT: canonical-grammar surfacing (tolerant parse, but a non-canonical label is surfaced) ──
  if (expectsLabel && parsed.ok && parsed.variant) {
    add('result-label-canonical', 'soft', false, `non-canonical: ${parsed.issues.join('; ')}`);
  }

  // ── SOFT 2: required output_schema fields present ──
  const schemaFields = (contract.output_schema && Array.isArray(contract.output_schema.fields)) ? contract.output_schema.fields : [];
  if (schemaFields.length) {
    const missing = schemaFields.filter((f) => typeof f === 'string' && !fieldPresent(output, f));
    add('output-schema-fields', 'soft', missing.length === 0,
      missing.length === 0 ? `MATCH all ${schemaFields.length} declared fields present`
                           : `MISSING fields=${JSON.stringify(missing)} of ${schemaFields.length}`);
  }

  // ── HARD 3: scope containment — segment-aware, path-shaped entries only, always-on protected floor ──
  // allowed_paths/forbidden_paths (explicit, filesystem) take precedence; allowed_scope/forbidden_scope
  // contribute only their PATH-LIKE entries (prose semantic-scope ignored — Codex finding 2).
  const allowedPaths = [
    ...(Array.isArray(contract.allowed_paths) ? contract.allowed_paths : []),
    ...(Array.isArray(contract.allowed_scope) ? contract.allowed_scope : []),
  ].filter(isPathLike);
  const forbiddenPaths = [
    ...(Array.isArray(contract.forbidden_paths) ? contract.forbidden_paths : []),
    ...(Array.isArray(contract.forbidden_scope) ? contract.forbidden_scope : []),
  ].filter(isPathLike);
  const forbidden = [...new Set([...forbiddenPaths, ...PROTECTED_FLOOR])];
  let scopeRan = false;
  if (malformedInvoked > 0) {
    // fail-CLOSED: non-string/non-coercible invoked entries → scope unverifiable, do NOT silently drop (Codex finding 1)
    add('scope-input-malformed', 'hard', false, `${malformedInvoked} invokedPaths entr${malformedInvoked === 1 ? 'y' : 'ies'} not string/coercible — scope unverifiable (fail-closed)`);
  }
  if (invokedPaths.length) {
    scopeRan = true;
    const hitForbidden = invokedPaths.filter((p) => forbidden.some((f) => hitsForbidden(p, f)));
    const outsideAllowed = allowedPaths.length
      ? invokedPaths.filter((p) => !allowedPaths.some((a) => withinAllowed(p, a)))
      : [];
    const scopeOk = hitForbidden.length === 0 && outsideAllowed.length === 0;
    add('scope-containment', 'hard', scopeOk,
      scopeOk ? `MATCH ${invokedPaths.length} invoked paths within scope (forbidden floor active)`
              : `VIOLATION forbidden=${JSON.stringify(hitForbidden)} outside_allowed=${JSON.stringify(outsideAllowed)}`);
  }

  // ── SOFT 4: forbidden-pattern flags (precision-first; skipped in genuine blocked-mode) ──
  if (flags.no_stage_narration === true && !blockedMode) {
    const hit = STAGE_NARRATION_RE.find((re) => re.test(output));
    add('no-stage-narration', 'soft', !hit, hit ? `MATCH execution-narration pattern ${hit}` : 'clean');
  }
  if (flags.broad_command_ban === true) {
    const hit = BROAD_COMMAND_RE.find((re) => re.test(output));
    add('broad-command-ban', 'soft', !hit, hit ? `MATCH broad/destructive command (line-anchored) ${hit}` : 'clean');
  }

  // ── SOFT 5: report line-cap (exempt in genuine blocked-mode: blocked reports run long) ──
  const cap = flags.report_line_cap;
  if (Number.isInteger(cap) && cap > 0 && flags.final_report_only === true && !blockedMode) {
    const lines = output.split('\n').filter((l) => l.trim().length > 0).length;
    add('report-line-cap', 'soft', lines <= cap, `lines=${lines} cap=${cap}`);
  }

  // ── SOFT: command_output_caps (coarse) — a single absurdly-long line (e.g. an unbounded command
  //    dump) violates the cap the contract declared; split_required_trigger stays out-of-band. (Codex finding 3) ──
  if (flags.command_output_caps === true && !blockedMode) {
    const MAX_LINE = 2000;
    const longest = output.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
    add('command-output-cap', 'soft', longest <= MAX_LINE, `longest_line=${longest} coarse_cap=${MAX_LINE}`);
  }

  // ── SOFT 6: contract-substance — a vacuous contract cannot certify a clean PASS ──
  const substantiveRan = schemaFields.length > 0 || scopeRan ||
    flags.no_stage_narration === true || flags.broad_command_ban === true ||
    flags.command_output_caps === true ||
    (Number.isInteger(cap) && cap > 0 && flags.final_report_only === true);
  const vacuous = !substantiveRan;
  if (vacuous) {
    add('contract-substance', 'soft', false, 'vacuous contract: only the RESULT_LABEL was checkable (no fields/scope/flags/paths) — verdict cannot certify substance');
  }

  const hardFails = checks.filter((c) => c.severity === 'hard' && !c.ok);
  const softFails = checks.filter((c) => c.severity === 'soft' && !c.ok);
  const passed = checks.filter((c) => c.ok).length;
  const verdict = hardFails.length ? 'FAIL' : (softFails.length ? 'PARTIAL' : 'PASS');

  // honest enforcement scope: declared flags the gate CANNOT check from output text alone
  const notEnforced = [];
  if (flags.split_required_trigger === true) notEnforced.push('split_required_trigger (needs turn/call-graph context, not output-checkable)');

  return {
    ok: verdict === 'PASS',
    verdict,
    score: checks.length ? passed / checks.length : 0,
    blockedMode,
    vacuous,
    notEnforced,
    labelAnchored: ex.anchored,
    hardFails: hardFails.map((c) => c.name),
    softFails: softFails.map((c) => c.name),
    checks,
  };
}

// ── CLI: demo (pure self-test; no external corpus I/O) ──
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demoContract = {
    flags: { no_stage_narration: true, broad_command_ban: true, final_report_only: true, report_line_cap: 25 },
    output_schema: { type: 'final_report', fields: ['RESULT_LABEL', 'HEAD', 'STAGED', 'FILES_CHANGED', 'VALIDATION'] },
    allowed_scope: ['_SYSTEM/Scripts/'],
    forbidden_scope: ['.env', 'backend/data/'],
    failure_contract: { blocked_result_label: '08L_YURI_HARNESS_CORE_X1_BLOCKED' },
  };
  const goodOutput = [
    'RESULT_LABEL: 08CW_CONTRACT_CONFORMANCE_GATE_X_PASS_COMMITTED',
    'HEAD: built the conformance gate', 'STAGED: contract-conformance.mjs', 'FILES_CHANGED: 1', 'VALIDATION: tests green',
  ].join('\n');
  console.log('GOOD verdict        :', checkOutputConformance(demoContract, goodOutput, { invokedPaths: ['_SYSTEM/Scripts/contract-conformance.mjs'] }).verdict);
  console.log('TRAVERSAL escape    :', checkOutputConformance(demoContract, goodOutput, { invokedPaths: ['_SYSTEM/Scripts/../../.env'] }).verdict, '(expect FAIL)');
  console.log('PROTECTED floor     :', checkOutputConformance({ flags: {} }, goodOutput, { invokedPaths: ['.env'] }).verdict, '(expect FAIL even w/ empty contract)');
  console.log('NULL scope entry    :', checkOutputConformance({ forbidden_scope: [null] }, goodOutput, { invokedPaths: ['.env'] }).verdict, '(expect FAIL not throw)');
  console.log('ASPIRATIONAL label  :', checkOutputConformance(demoContract, 'we wanted 08CW_GOAL_X_PASS_COMMITTED\nRESULT_LABEL: 08CW_TASK_F_BLOCKED', {}).blockedMode, '(expect blockedMode true — graded the real BLOCKED line)');
}
