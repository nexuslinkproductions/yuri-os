#!/usr/bin/env node
/**
 * golden-path.test.mjs — RED e2e test: install → govern → remember → recall
 *
 * P2 definition-of-done (02-DECISION.md:37, 00-PREPARED-PACKAGE.md:76).
 * Built RED to expose the four wiring gaps between stages. A test goes GREEN
 * only when the gap it identifies is closed. Do NOT stub to pass.
 *
 * Run:
 *   node --test _SYSTEM/Scripts/golden-path.test.mjs
 *
 * PATH ANCHORS (verified 2026-07-08):
 *   install:  REPO_ROOT/yuri-init.sh
 *             _SYSTEM/Scripts/yuri-merge-settings.mjs → export mergeSettings
 *   govern:   _SYSTEM/Scripts/policy/yuri-safety-core.mjs → evaluateToolCall
 *             .claude/settings.json PreToolUse hook chain (11 hooks, 0 call yuri-safety-core)
 *   remember: _SYSTEM/Scripts/memory-kernel.mjs → appendMemoryEntry / MEMORY_AUDIT_LOG
 *             _SYSTEM/Scripts/memory-session-write.mjs → Stop hook → memory_governor.py
 *   recall:   _SYSTEM/Scripts/skill-recall.mjs → rankSkills
 *             _SYSTEM/Scripts/xref-query.mjs → xrefQuery (reads search-index.db + canonical store)
 *             _SYSTEM/OS_KERNEL/search-index.db (FTS5, 1.4 GB)
 *
 * EXPECTED OUTCOMES:
 *   GREEN (7): init artifacts exist, merge-settings self-test, evaluateToolCall blocks,
 *              memory-kernel exports, Stop hook wiring, skill-recall exports, FTS5 DB exists
 *   RED   (4): S1→S2 hook-chain orphan, S2→S3 governance-no-audit, S3→S4 ledger-not-indexed,
 *              S4→S1 no-reindex-on-install
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: INSTALL
// Entry: yuri-init.sh --apply (or dry-run on dev)
// Docs:  yuri-init.sh:1-134, _SYSTEM/Scripts/yuri-merge-settings.mjs:1-130
// ─────────────────────────────────────────────────────────────────────────────

test('S1:install — yuri-init.sh exists and is executable', () => {
  const initPath = join(REPO_ROOT, 'yuri-init.sh');
  assert.ok(existsSync(initPath), `yuri-init.sh missing at ${initPath}`);
  const mode = statSync(initPath).mode;
  assert.ok(mode & 0o111, 'yuri-init.sh is not executable — chmod +x required');
});

test('S1:install — yuri-merge-settings.mjs exports mergeSettings', () => {
  // _SYSTEM/Scripts/yuri-merge-settings.mjs:56
  const msPath = join(REPO_ROOT, '_SYSTEM/Scripts/yuri-merge-settings.mjs');
  assert.ok(existsSync(msPath), `yuri-merge-settings.mjs missing at ${msPath}`);
  const src = readFileSync(msPath, 'utf8');
  assert.ok(
    /export function mergeSettings\b/.test(src),
    'yuri-merge-settings.mjs does not export mergeSettings — install wiring broken at source'
  );
});

test('S1:install — merge-settings self-test passes', () => {
  // Runs the built-in self-test (yuri-merge-settings.mjs:99-127) without needing --apply
  const res = spawnSync(
    process.execPath,
    [join(REPO_ROOT, '_SYSTEM/Scripts/yuri-merge-settings.mjs'), '--self-test'],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(
    res.status,
    0,
    `yuri-merge-settings.mjs --self-test failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
  );
});

// ── S1→S2 WIRING GAP ─────────────────────────────────────────────────────────
// [RED] The canonical governance policy (yuri-safety-core.mjs::evaluateToolCall)
//       is NOT referenced by any PreToolUse hook in .claude/settings.json.
//       11 PreToolUse hooks exist; grep for 'yuri-safety-core' across .claude/hooks/
//       returns nothing. bash-security-guard.js has its own inline CJS denylist.
//
// MISSING WIRING:
//   Option A — Add a PreToolUse hook entry to .claude/settings.json:
//     { "command": "node \"$CLAUDE_PROJECT_DIR/_SYSTEM/Scripts/policy/yuri-safety-core.mjs\"" }
//   Option B — In bash-security-guard.js:1 add:
//     const { evaluateToolCall } = require('../_SYSTEM/Scripts/policy/yuri-safety-core.mjs')
//     and delegate dangerous-command evaluation there.
// ─────────────────────────────────────────────────────────────────────────────

test('[RED] S1→S2:WIRE — PreToolUse hook chain must call yuri-safety-core.mjs evaluateToolCall', () => {
  const settingsPath = join(REPO_ROOT, '.claude/settings.json');
  assert.ok(existsSync(settingsPath), `.claude/settings.json missing — cannot verify hook chain`);

  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const preToolGroups = settings?.hooks?.PreToolUse ?? [];
  const cmds = preToolGroups.flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ''));

  // Also scan the PreToolUse hook source files for any import of yuri-safety-core
  const hookFiles = [
    join(REPO_ROOT, '.claude/hooks/bash-security-guard.js'),
    join(REPO_ROOT, '.claude/hooks/pre-tool-use.js'),
    join(REPO_ROOT, '.claude/hooks/claude-protocol-guard.mjs'),
  ];
  const hookSrcMentionsSafetyCore = hookFiles
    .filter(existsSync)
    .some((p) => readFileSync(p, 'utf8').includes('yuri-safety-core'));

  assert.ok(
    cmds.some((cmd) => cmd.includes('yuri-safety-core')) || hookSrcMentionsSafetyCore,
    `[RED] No PreToolUse hook references yuri-safety-core.mjs (evaluateToolCall).\n` +
      `  Hook commands in .claude/settings.json PreToolUse:\n` +
      `${cmds.map((c) => `    ${c}`).join('\n')}\n` +
      `  bash-security-guard.js / pre-tool-use.js / claude-protocol-guard.mjs:\n` +
      `  none import yuri-safety-core. The canonical SEC-1 denylist is orphaned.\n\n` +
      `  FIX (Option A): add to .claude/settings.json hooks.PreToolUse:\n` +
      `    { "_yuri": true, "hooks": [{ "command": "node \\"$CLAUDE_PROJECT_DIR/_SYSTEM/Scripts/policy/yuri-safety-core.mjs\\"" }] }\n` +
      `  FIX (Option B): in bash-security-guard.js require evaluateToolCall from\n` +
      `    '../../_SYSTEM/Scripts/policy/yuri-safety-core.mjs' and delegate to it.`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: GOVERN
// Entry: evaluateToolCall from policy/yuri-safety-core.mjs
// Docs:  _SYSTEM/Scripts/policy/yuri-safety-core.mjs:133-170
// ─────────────────────────────────────────────────────────────────────────────

test('S2:govern — yuri-safety-core.mjs exports evaluateToolCall', async () => {
  const safetyPath = join(REPO_ROOT, '_SYSTEM/Scripts/policy/yuri-safety-core.mjs');
  assert.ok(existsSync(safetyPath), `yuri-safety-core.mjs missing at ${safetyPath}`);
  const mod = await import(safetyPath);
  assert.equal(typeof mod.evaluateToolCall, 'function', 'evaluateToolCall is not a function');
  assert.equal(typeof mod.evaluateHookEvent, 'function', 'evaluateHookEvent is not a function');
});

test('S2:govern — evaluateToolCall blocks protected credential read', async () => {
  // SEC-4: cat ~/.aws/credentials must be blocked (yuri-safety-core.mjs:56-114)
  const { evaluateToolCall } = await import(
    join(REPO_ROOT, '_SYSTEM/Scripts/policy/yuri-safety-core.mjs'),
  );
  const verdict = evaluateToolCall('bash', { command: 'cat ~/.aws/credentials' });
  assert.equal(verdict.allowed, false, `Expected blocked, got: ${JSON.stringify(verdict)}`);
  assert.ok(verdict.decision === 'deny' || typeof verdict.reason === 'string',
    'Expected a deny decision or reason string');
});

// ── S2→S3 WIRING GAP ─────────────────────────────────────────────────────────
// [RED] evaluateToolCall returns a verdict object but NEVER writes to any memory
//       store. Governance decisions — including blocks of dangerous commands — are
//       silent. No audit trail exists in MEMORY_AUDIT_LOG or memory-ledger.jsonl.
//
//       Confirmed: grep for 'appendMemoryEntry\|auditMemoryEvent\|MEMORY_AUDIT'
//       in policy/yuri-safety-core.mjs returns zero hits.
//
// MISSING WIRING:
//   When evaluateToolCall returns { allowed: false }, it should call:
//     auditMemoryEvent({ kind: 'governance-block', toolName, command, reason }, opts)
//   from memory-kernel.mjs:647 (auditMemoryEvent), writing to MEMORY_AUDIT_LOG.
//   Alternatively: a PostToolUse hook captures denied calls and writes them.
// ─────────────────────────────────────────────────────────────────────────────

test('[RED] S2→S3:WIRE — governance block must be recorded to MEMORY_AUDIT_LOG', async () => {
  const { evaluateToolCall } = await import(
    join(REPO_ROOT, '_SYSTEM/Scripts/policy/yuri-safety-core.mjs'),
  );
  const { MEMORY_AUDIT_LOG } = await import(
    join(REPO_ROOT, '_SYSTEM/Scripts/memory-kernel.mjs'),
  );

  const linesBefore = existsSync(MEMORY_AUDIT_LOG)
    ? readFileSync(MEMORY_AUDIT_LOG, 'utf8').split('\n').filter(Boolean).length
    : 0;

  // Fire a governance block — this SHOULD write to the audit log
  const verdict = evaluateToolCall('bash', { command: 'rm -rf /' });
  assert.equal(verdict.allowed, false, 'rm -rf / must be blocked for this test to be meaningful');

  const linesAfter = existsSync(MEMORY_AUDIT_LOG)
    ? readFileSync(MEMORY_AUDIT_LOG, 'utf8').split('\n').filter(Boolean).length
    : 0;

  assert.ok(
    linesAfter > linesBefore,
    `[RED] Governance block not recorded to MEMORY_AUDIT_LOG.\n` +
      `  MEMORY_AUDIT_LOG: ${MEMORY_AUDIT_LOG}\n` +
      `  Lines before evaluateToolCall: ${linesBefore}\n` +
      `  Lines after  evaluateToolCall: ${linesAfter}  (no change — write missing)\n\n` +
      `  FIX: in evaluateToolCall() before returning a deny verdict, call:\n` +
      `    auditMemoryEvent({ kind: 'governance-block', toolName, command, reason })\n` +
      `  from memory-kernel.mjs:647 (auditMemoryEvent export).`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3: REMEMBER
// Entry: memory-kernel.mjs::appendMemoryEntry (Track-A canonical)
//        memory-session-write.mjs (Stop hook → memory_governor.py)
// Docs:  _SYSTEM/Scripts/memory-kernel.mjs:319-374, memory-session-write.mjs:1-20
// ─────────────────────────────────────────────────────────────────────────────

test('S3:remember — memory-kernel.mjs exports appendMemoryEntry, MEMORY_AUDIT_LOG, MEMORY_LEDGER_LOG', async () => {
  const mod = await import(join(REPO_ROOT, '_SYSTEM/Scripts/memory-kernel.mjs'));
  assert.equal(typeof mod.appendMemoryEntry, 'function', 'appendMemoryEntry missing');
  assert.equal(typeof mod.recallMemory, 'function', 'recallMemory missing');
  assert.equal(typeof mod.MEMORY_AUDIT_LOG, 'string', 'MEMORY_AUDIT_LOG not exported');
  assert.equal(typeof mod.MEMORY_LEDGER_LOG, 'string', 'MEMORY_LEDGER_LOG not exported');
  assert.equal(typeof mod.MEMORY_ROOT, 'string', 'MEMORY_ROOT not exported');
  // Path anchors
  assert.ok(mod.MEMORY_LEDGER_LOG.includes('_SYSTEM/state'), `MEMORY_LEDGER_LOG unexpected: ${mod.MEMORY_LEDGER_LOG}`);
  assert.ok(mod.MEMORY_ROOT.includes('_SYSTEM/memory'), `MEMORY_ROOT unexpected: ${mod.MEMORY_ROOT}`);
});

test('S3:remember — memory-session-write.mjs is registered in Stop hook', () => {
  // Stop hook wiring: .claude/settings.json hooks.Stop → memory-session-write.mjs
  const mswPath = join(REPO_ROOT, '_SYSTEM/Scripts/memory-session-write.mjs');
  assert.ok(existsSync(mswPath), `memory-session-write.mjs missing at ${mswPath}`);

  const settings = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8'));
  const stopHooks = (settings?.hooks?.Stop ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ''));
  assert.ok(
    stopHooks.some((cmd) => cmd.includes('memory-session-write')),
    `memory-session-write.mjs not in Stop hook chain.\nFound Stop hooks:\n${stopHooks.map((c) => `  ${c}`).join('\n')}`,
  );

  // Inform: the Stop hook writes via Python (memory_governor.py), NOT via memory-kernel.mjs
  const mswSrc = readFileSync(mswPath, 'utf8');
  assert.ok(
    mswSrc.includes('memory_governor.py'),
    'memory-session-write.mjs must delegate to memory_governor.py (Python path, not Track-A kernel)',
  );
  // The Stop hook path does NOT use appendMemoryEntry — two separate write paths exist
  assert.ok(
    !mswSrc.includes('appendMemoryEntry'),
    'Unexpected: memory-session-write.mjs now uses appendMemoryEntry — update this test and the gap analysis',
  );
});

// ── S3→S4 WIRING GAP ─────────────────────────────────────────────────────────
// [RED] appendMemoryEntry (Track-A) writes to:
//         MEMORY_LEDGER_LOG = _SYSTEM/state/memory-ledger.jsonl
//         MEMORY_ROOT       = _SYSTEM/memory/
//
//       xrefQuery reads from:
//         search-index.db (FTS5)          = _SYSTEM/OS_KERNEL/search-index.db
//         canonical truth store (passCanonical) = memory-canonical-store.mjs shards
//         mnemopi DB (passMnemopi)         = OMP native memory
//         circuitry graph (passGraph)      = 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json
//
//       None of those paths overlap with what appendMemoryEntry writes.
//       xref-query.mjs imports: memory-canonical-store.mjs, NOT memory-kernel.mjs.
//
// MISSING WIRING (choose one):
//   (a) appendMemoryEntry should bridge to appendClaim (canonical-store) so the entry
//       appears in xrefQuery's passCanonical leg — same write, two stores.
//   (b) Add a passMemoryKernel leg to xrefQuery that reads memory-ledger.jsonl.
//   (c) The FTS5 indexer must re-run after appendMemoryEntry (expensive).
// ─────────────────────────────────────────────────────────────────────────────

test('[RED] S3→S4:WIRE — xref-query must read memory-kernel ledger to surface appendMemoryEntry output', () => {
  // Structural gap: xref-query.mjs never imports memory-kernel.mjs or reads
  // _SYSTEM/state/memory-ledger.jsonl / _SYSTEM/memory/
  const xrefSrc = readFileSync(join(REPO_ROOT, '_SYSTEM/Scripts/xref-query.mjs'), 'utf8');

  const readsMemoryKernel = xrefSrc.includes('memory-kernel');
  const readsLedger = xrefSrc.includes('memory-ledger.jsonl');
  const readsMemoryRoot = xrefSrc.includes("'_SYSTEM/memory'") || xrefSrc.includes('"_SYSTEM/memory"');

  assert.ok(
    readsMemoryKernel || readsLedger || readsMemoryRoot,
    `[RED] xref-query.mjs does not read memory-kernel's data paths.\n` +
      `  appendMemoryEntry writes to:\n` +
      `    MEMORY_LEDGER_LOG = _SYSTEM/state/memory-ledger.jsonl\n` +
      `    MEMORY_ROOT       = _SYSTEM/memory/\n` +
      `  xref-query.mjs imports:\n` +
      `    memory-canonical-store.mjs (passCanonical)\n` +
      `    skill-recall.mjs (skill hits)\n` +
      `    xref-drift-scan.mjs, yuri-search.mjs, canonical-recall.mjs\n` +
      `  → memory-kernel.mjs is NOT imported; _SYSTEM/state/memory-ledger.jsonl NOT read.\n\n` +
      `  FIX (a): In appendMemoryEntry, after writing to ledger, also call:\n` +
      `    appendClaim(originLane, sessionId, { subject, predicate: 'memory', object: content })\n` +
      `  FIX (b): Add passMemoryKernel(rawQuery) to xref-query.mjs that reads\n` +
      `    readJsonlRows(MEMORY_LEDGER_LOG) and scores against the query.`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4: RECALL
// Entry: skill-recall.mjs::rankSkills, xref-query.mjs::xrefQuery
// Docs:  _SYSTEM/Scripts/skill-recall.mjs:76-110, xref-query.mjs:760-910
// ─────────────────────────────────────────────────────────────────────────────

test('S4:recall — skill-recall.mjs exports rankSkills, scanLiveSkills, tokenize', async () => {
  const mod = await import(join(REPO_ROOT, '_SYSTEM/Scripts/skill-recall.mjs'));
  assert.equal(typeof mod.rankSkills, 'function', 'rankSkills missing');
  assert.equal(typeof mod.scanLiveSkills, 'function', 'scanLiveSkills missing');
  assert.equal(typeof mod.tokenize, 'function', 'tokenize missing');
});

test('S4:recall — rankSkills("governance install") surfaces skills', async () => {
  const { rankSkills } = await import(join(REPO_ROOT, '_SYSTEM/Scripts/skill-recall.mjs'));
  const results = rankSkills('governance install');
  assert.ok(Array.isArray(results), 'rankSkills did not return an array');
  assert.ok(
    results.length > 0,
    `No skills returned for "governance install" — live skill corpus may be empty or skill roots missing.\n` +
      `  SKILL_ROOTS: skills/, .claude/skills/`,
  );
});

test('S4:recall — search-index.db (FTS5) exists for xrefQuery corpus leg', () => {
  const fts5Path = join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
  assert.ok(
    existsSync(fts5Path),
    `search-index.db missing at ${fts5Path}\n` +
      `  Run: cd ${REPO_ROOT} && node _SYSTEM/Scripts/ai reindex`,
  );
  // Size sanity (> 1 MB = indexed content present)
  const size = statSync(fts5Path).size;
  assert.ok(size > 1_000_000, `search-index.db appears empty (${size} bytes) — reindex required`);
});

// ── S4→S1 WIRING GAP ─────────────────────────────────────────────────────────
// [RED] yuri-init.sh (install) does not trigger FTS5 reindex after linking skills.
//       After --apply, newly-installed skills are on disk but NOT in search-index.db.
//       xrefQuery's FTS5 corpus leg won't find them until `ai reindex` runs.
//       skill-recall.mjs::rankSkills reads the filesystem directly (no index needed),
//       but xrefQuery's richer ranked search is blind to the installed content.
//
// MISSING WIRING:
//   In yuri-init.sh, after step 5 (link skills + commands), add:
//     say "6. reindex skill corpus in FTS5"
//     act "node '$YURI_ROOT/_SYSTEM/Scripts/ai' reindex"
//   This ensures xrefQuery's first hit in the new session sees all installed skills.
// ─────────────────────────────────────────────────────────────────────────────

test('[RED] S4→S1:WIRE — yuri-init.sh must trigger FTS5 reindex after install', () => {
  const initSrc = readFileSync(join(REPO_ROOT, 'yuri-init.sh'), 'utf8');

  const triggersReindex =
    initSrc.includes('reindex') ||
    initSrc.includes('search-index') ||
    initSrc.includes('index-build') ||
    // Also accept an explicit `ai reindex` call style
    (initSrc.includes('/ai') && initSrc.includes('index'));

  assert.ok(
    triggersReindex,
    `[RED] yuri-init.sh does not trigger FTS5 reindex after install.\n` +
      `  After step 5 (link skills + commands) in yuri-init.sh, the FTS5 corpus\n` +
      `  (search-index.db) is not updated. xrefQuery's corpus leg won't find\n` +
      `  newly-installed skills until a manual 'ai reindex' is run.\n\n` +
      `  FIX: add to yuri-init.sh after the skills+commands link step:\n` +
      `    say "6. reindex FTS5 skill corpus"\n` +
      `    act "node '$YURI_ROOT/_SYSTEM/Scripts/ai' reindex"\n` +
      `  skill-recall.mjs::rankSkills reads disk directly (already works post-install);\n` +
      `  this gap only affects xrefQuery's richer BM25 corpus leg.`,
  );
});
