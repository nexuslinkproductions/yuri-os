// Hermetic tests for claim-heal.mjs (S3). Each test proves ONE guard. No git/fs/spawn — results injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  healOne, healAll, undoLastJournalEntry, resolveStaleToken,
  isPrecededByNegation, hasContradictionModifier, countIn, HEAL_FLOOR,
} from './claim-heal.mjs';

// harness: tmp claim file + journal + a constructed claim/result. Defaults produce a HEALABLE case.
function harness(opts = {}) {
  const {
    statement = 'Status: UNCOMMITTED.',
    claimedStatus = 'UNCOMMITTED',
    claimType = 'git_status',
    verifier = 'git_status',
    verifiedStatus = 'SHIPPED+PUSHED',
    confidence = 0.98,
    proposedFix = 'SHIPPED+PUSHED',
    match = false,
    pinned = false,
    evidence = ['git branch -r --contains cbdca5c0 -> on origin/main'],
  } = opts;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-heal-'));
  const filePath = path.join(dir, 'claim.md');
  fs.writeFileSync(filePath, statement + '\n', 'utf8');
  const claim = {
    id: 'test:git_status', target: 'test', claimType, claimedStatus,
    _source: { filePath, statement, matchedVerb: 'is' },
  };
  const result = { id: claim.id, verifier, verifiedStatus, match, evidence, confidence, proposedFix };
  const registry = { schema: 'yuri.claim-registry.v1', updatedMs: 1, claims: { [claim.id]: { pinned } } };
  const journalPath = path.join(dir, 'journal.jsonl');
  return { dir, filePath, claim, result, registry, journalPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const readJournal = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean) : [];

// ── happy path: guards 1+2+5 PASS → heal, file rewritten, journal 1 line ────────────────────────
test('healOne heals a stale UNCOMMITTED claim when armed (token-swap, journal-first)', () => {
  const h = harness();
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, true);
    assert.equal(r.diff.length, 1);
    const after = fs.readFileSync(h.filePath, 'utf8');
    assert.match(after, /SHIPPED\+PUSHED/);
    assert.doesNotMatch(after, /UNCOMMITTED/);
    const j = readJournal(h.journalPath);
    assert.equal(j.length, 1);
    assert.equal(JSON.parse(j[0]).claimId, 'test:git_status');
    assert.equal(JSON.parse(j[0]).reverted, false);
  } finally { h.cleanup(); }
});

// ── guard 2: confidence < floor → skip, NO file/journal change ──────────────────────────────────
test('guard 2 — below HEAL_FLOOR confidence is refused without touching file or journal', () => {
  const h = harness({ confidence: HEAL_FLOOR - 0.01 });
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.equal(r.skipped, true);
    assert.match(r.reason, /confidence/);
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /UNCOMMITTED/);
    assert.deepEqual(readJournal(h.journalPath), []);
  } finally { h.cleanup(); }
});

// ── guard 3: pinned + hard mismatch → NO heal, surfaced ────────────────────────────────────────
test('guard 3 — a pinned claim is never rewritten even on a hard high-confidence mismatch', () => {
  const h = harness({ pinned: true });
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /pinned/);
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /UNCOMMITTED/);
    assert.deepEqual(readJournal(h.journalPath), []);
  } finally { h.cleanup(); }
});

// ── guard 5: negation — "NOT ARMED" must NOT heal to "DISARMED" via blind token swap ───────────
test('guard 5 — a token preceded by NOT/NEVER/NO is refused (no meaning-inversion)', () => {
  const h = harness({ statement: 'The lane is NOT ARMED.', claimedStatus: 'ARMED', claimType: 'arm_state',
    verifier: 'arm_state', verifiedStatus: 'DISARMED', proposedFix: 'DISARMED', confidence: 0.92,
    evidence: ['flag absent'] });
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /negated/i);
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /NOT ARMED/);
  } finally { h.cleanup(); }
});

// ── guard 5: contextual contradiction — the merge-memory smoking gun is SURFACED, not auto-healed
test('guard 5 — "UNCOMMITTED pending sign-off" is refused (token-swap would self-contradict)', () => {
  // this is EXACTLY the merge-memory stale prose; auto-heal refuses because the surrounding modifier
  // ("pending sign-off") would make "SHIPPED+PUSHED pending sign-off" a lie. Surfaced for human heal.
  const h = harness({ statement: 'merge is UNCOMMITTED pending sign-off' });
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /contextual contradiction/i);
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /UNCOMMITTED pending sign-off/);
  } finally { h.cleanup(); }
});

// ── guard 5: ambiguous token count in statement → refuse ───────────────────────────────────────
test('guard 5 — a status token appearing >1x in the statement is refused (ambiguous location)', () => {
  const h = harness({ statement: 'ARMED and also ARMED here.', claimedStatus: 'ARMED', claimType: 'arm_state',
    verifier: 'arm_state', verifiedStatus: 'DISARMED', proposedFix: 'DISARMED', confidence: 0.92, evidence: ['x'] });
  try {
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /ambiguous/i);
  } finally { h.cleanup(); }
});

// ── guard 5: statement drift (statement not found in file) → refuse ────────────────────────────
test('guard 5 — statement absent from file (already healed / hand-edited) is refused', () => {
  const h = harness();
  try {
    fs.writeFileSync(h.filePath, 'totally different content now\n');
    const r = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /not found in file/);
  } finally { h.cleanup(); }
});

// ── guard 6: dry-run default — diff emitted, NO file/journal write ──────────────────────────────
test('guard 6 — disarmed heal emits a diff and touches neither file nor journal', () => {
  const h = harness();
  try {
    const r = healOne(h.claim, h.result, { armed: false, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.equal(r.dryRun, true);
    assert.equal(r.diff.length, 1);
    assert.equal(r.diff[0].staleToken, 'UNCOMMITTED');
    assert.equal(r.diff[0].proposedFix, 'SHIPPED+PUSHED');
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /UNCOMMITTED/);
    assert.deepEqual(readJournal(h.journalPath), []);
  } finally { h.cleanup(); }
});

// ── guard 4: undo restores oldText, appends a compensating record ──────────────────────────────
test('guard 4 — undoLastJournalEntry restores the original line + appends reverted:true', () => {
  const h = harness();
  try {
    healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /SHIPPED\+PUSHED/);
    const u = undoLastJournalEntry({ journalPath: h.journalPath });
    assert.equal(u.undone, true);
    assert.match(fs.readFileSync(h.filePath, 'utf8'), /UNCOMMITTED/);
    assert.doesNotMatch(fs.readFileSync(h.filePath, 'utf8'), /SHIPPED\+PUSHED/);
    // 2 journal lines: the heal + the compensating reverted record (original never mutated)
    const j = readJournal(h.journalPath);
    assert.equal(j.length, 2);
    assert.equal(JSON.parse(j[0]).reverted, false);
    assert.equal(JSON.parse(j[1]).reverted, true);
  } finally { h.cleanup(); }
});

// ── guard 1: no verifier / no evidence → refuse ────────────────────────────────────────────────
test('guard 1 — a result with no verifier (no deterministic evidence) is refused', () => {
  const h = harness();
  try {
    const r = healOne(h.claim, { ...h.result, verifier: null, evidence: [] }, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r.healed, false);
    assert.match(r.reason, /no verifier/);
  } finally { h.cleanup(); }
});

// ── resolveStaleToken: token resolved FROM THE STATEMENT, not claimedStatus ────────────────────
test('resolveStaleToken pulls the status word from the statement (claimedStatus is advisory)', () => {
  // claimType git_status, statement mentions UNCOMMITTED → resolves UNCOMMITTED even if claimedStatus is noise
  const r = resolveStaleToken({ claimType: 'git_status', claimedStatus: 'trusted',
    _source: { statement: 'hook says UNCOMMITTED awaiting sign-off' } });
  assert.equal(r.token, 'UNCOMMITTED');
  // ambiguous → 2 status words in one statement
  const amb = resolveStaleToken({ claimType: 'git_status', claimedStatus: 'x',
    _source: { statement: 'went from UNCOMMITTED to SHIPPED' } });
  assert.ok(amb.ambiguous && amb.ambiguous.length >= 2);
  // nothing → null
  assert.equal(resolveStaleToken({ claimType: 'git_status', _source: { statement: 'nothing here' } }), null);
});

// ── pure helper units ──────────────────────────────────────────────────────────────────────────
test('isPrecededByNegation catches NOT/NEVER/NO prefixes', () => {
  assert.equal(isPrecededByNegation('foo NOT ARMED', 'ARMED'), true);
  assert.equal(isPrecededByNegation('foo NEVER LIVE', 'LIVE'), true);
  assert.equal(isPrecededByNegation('foo NO BUILT', 'BUILT'), true);
  assert.equal(isPrecededByNegation('foo ARMED', 'ARMED'), false);
  assert.equal(isPrecededByNegation('ARMED at start', 'ARMED'), false);
});

test('hasContradictionModifier detects temporal/conditional modifiers + dates', () => {
  assert.equal(hasContradictionModifier('pending sign-off'), true);
  assert.equal(hasContradictionModifier('shipped 2026-07-05'), true);
  assert.equal(hasContradictionModifier('blocked on Marcel'), true);
  assert.equal(hasContradictionModifier('not yet wired'), true);
  assert.equal(hasContradictionModifier('Status: UNCOMMITTED.'), false);
});

test('countIn: case-sensitive + case-insensitive counts', () => {
  assert.equal(countIn('ARMED ARMED', 'ARMED'), 2);
  assert.equal(countIn('armed ARMED', 'armed', { ci: true }), 2);
  assert.equal(countIn('none here', 'ARMED'), 0);
  assert.equal(countIn('xxx', ''), 0);
});

// ── healAll end-to-end with an injected verify fn (hermetic — no real verifyAll/git) ───────────
test('healAll heals across multiple claims + stamps the registry overlay (injected verify)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-heal-all-'));
  try {
    const f1 = path.join(dir, 'a.md'); fs.writeFileSync(f1, 'Status: UNCOMMITTED.\n');
    const f2 = path.join(dir, 'b.md'); fs.writeFileSync(f2, 'Lane: ARMED.\n');
    const ledger = path.join(dir, 'ledger.json');
    fs.writeFileSync(ledger, JSON.stringify({ claims: [
      { id: 'a:git_status', target: 'a', claimType: 'git_status', claimedStatus: 'UNCOMMITTED', _source: { filePath: f1, statement: 'Status: UNCOMMITTED.' } },
      { id: 'b:arm_state', target: 'b', claimType: 'arm_state', claimedStatus: 'ARMED', _source: { filePath: f2, statement: 'Lane: ARMED.' } },
    ]}));
    const registry = path.join(dir, 'registry.json');
    const journalPath = path.join(dir, 'journal.jsonl');
    const verify = ({ joined }) => ({
      results: [
        { id: 'a:git_status', verifier: 'git_status', verifiedStatus: 'SHIPPED', match: false, evidence: ['git: on origin'], confidence: 0.98, proposedFix: 'SHIPPED' },
        { id: 'b:arm_state', verifier: 'arm_state', verifiedStatus: 'DISARMED', match: false, evidence: ['flag absent'], confidence: 0.92, proposedFix: 'DISARMED' },
      ],
      registry: { schema: 'yuri.claim-registry.v1', updatedMs: 1, claims: {} },
    });
    const r = await healAll({ ledger, registry, journalPath, armed: true, verify });
    assert.equal(r.healed.length, 2);
    assert.equal(r.skipped.length, 0);
    assert.match(fs.readFileSync(f1, 'utf8'), /SHIPPED/);
    assert.match(fs.readFileSync(f2, 'utf8'), /DISARMED/);
    assert.equal(readJournal(journalPath).length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── idempotency: re-healing an already-healed claim is a no-op (statement no longer matches) ───
test('idempotency — re-running heal on an already-healed claim is a no-op', () => {
  const h = harness();
  try {
    healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    // the file now has SHIPPED+PUSHED; the original statement "Status: UNCOMMITTED." is gone
    const r2 = healOne(h.claim, h.result, { armed: true, journalPath: h.journalPath, registry: h.registry });
    assert.equal(r2.healed, false);
    assert.match(r2.reason, /not found in file|drift/);
    // journal still has exactly 1 heal entry (no double-write)
    const heals = readJournal(h.journalPath).filter(l => !JSON.parse(l).reverted);
    assert.equal(heals.length, 1);
  } finally { h.cleanup(); }
});
