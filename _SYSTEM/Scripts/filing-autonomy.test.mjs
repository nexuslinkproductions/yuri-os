#!/usr/bin/env node
/**
 * filing-autonomy.test.mjs — hermetic tests for the governed autonomy runner.
 *
 * The default run is HERMETIC: pure predicates + a READ-ONLY dry-run smoke; it mutates NOTHING in the repo.
 * The live execute+rollback proof (creates a throwaway probe file, arms, moves it, rolls it back, asserts the
 * working tree is byte-identical) only runs under FILING_AUTONOMY_LIVE_TEST=1 and always self-cleans.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  armedState, isSafeTier, queueReason, partitionPlans, planHashOf,
  enumerateMisplaced, verifyNoStaleRefs, runFiling, DEFAULT_BUDGET,
} from './filing-autonomy.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// synthetic plan helpers (shape mirrors filing-mutator.planMove output)
const safePlan = (over = {}) => ({
  source: '_SYSTEM/loose-note.md', target: '_SYSTEM/docs/loose-note.md', zone: '_SYSTEM/docs',
  risk: 'LOW', refCount: 2, basenameOnlyCount: 0, protectedRefHosts: [], blocked: false, blockMove: false,
  refsToUpdate: [{ file: 'a.md' }, { file: 'b.md' }], ...over,
});

// ── armedState: BOTH env AND flag file required (stricter AND, unlike energy-enforce OR) ──
ok(armedState({ envFlag: '1', flagFileExists: true }).armed === true, 'armed when env=1 AND flag file present');
ok(armedState({ envFlag: '1', flagFileExists: false }).armed === false, 'DISARMED with env only (no flag file)');
ok(armedState({ envFlag: undefined, flagFileExists: true }).armed === false, 'DISARMED with flag file only (no env)');
ok(armedState({ envFlag: '0', flagFileExists: true }).armed === false, 'DISARMED when env=0');
ok(armedState({ envFlag: 'true', flagFileExists: true }).armed === true, 'env=true also arms (with flag file)');
ok(armedState({}).armed === false, 'DISARMED by default (neither present)');

// ── isSafeTier: the strict auto-execute predicate (target-absent case) ──
ok(isSafeTier(safePlan(), false) === true, 'safe: LOW + refCount<=3 + 0 basename + 0 protectedHosts + target-absent');
ok(isSafeTier(safePlan(), true) === false, 'NOT safe: target already exists');
ok(isSafeTier(safePlan({ risk: 'MEDIUM' }), false) === false, 'NOT safe: risk MEDIUM');
ok(isSafeTier(safePlan({ risk: 'HIGH' }), false) === false, 'NOT safe: risk HIGH');
ok(isSafeTier(safePlan({ risk: 'CRITICAL' }), false) === false, 'NOT safe: risk CRITICAL');
ok(isSafeTier(safePlan({ refCount: 4 }), false) === false, 'NOT safe: refCount 4 > 3');
ok(isSafeTier(safePlan({ refCount: 3 }), false) === true, 'safe at the refCount boundary (==3)');
ok(isSafeTier(safePlan({ basenameOnlyCount: 1 }), false) === false, 'NOT safe: any basename-only ref');
ok(isSafeTier(safePlan({ protectedRefHosts: ['.env'] }), false) === false, 'NOT safe: a protected ref-host');
ok(isSafeTier(safePlan({ blocked: true }), false) === false, 'NOT safe: blocked plan');
ok(isSafeTier(safePlan({ blockMove: true }), false) === false, 'NOT safe: blockMove (pinned flag)');
ok(isSafeTier(safePlan({ source: 'SOUL.md' }), false) === false, 'NOT safe: pinned source (defense-in-depth)');
ok(isSafeTier(safePlan({ source: '.claude/state/x.json', target: '_SYSTEM/state/x.json' }), false) === false, 'NOT safe: protected source');
ok(isSafeTier(safePlan({ target: '.claude/state/x.json' }), false) === false, 'NOT safe: protected target');
ok(isSafeTier(safePlan({ target: null }), false) === false, 'NOT safe: null target');
ok(isSafeTier(null, false) === false, 'NOT safe: null plan');

// ── queueReason: a clear reason for everything not auto ──
ok(/MEDIUM/.test(queueReason(safePlan({ risk: 'MEDIUM' }), false)), 'queueReason names the risk tier');
ok(/basename/.test(queueReason(safePlan({ basenameOnlyCount: 2 }), false)), 'queueReason names basename-only refs');
ok(/exists/.test(queueReason(safePlan(), true)), 'queueReason names an existing target');

// ── partitionPlans: split, budget cap, blocked → queued ──
{
  const noExist = () => false;
  const part = partitionPlans([safePlan({ source: '_SYSTEM/a.md', target: '_SYSTEM/docs/a.md' }), safePlan({ source: '_SYSTEM/b.md', target: '_SYSTEM/docs/b.md', risk: 'HIGH' }), { source: '_SYSTEM/c.bak', blocked: true, reason: 'ephemeral — purge candidate' }], { existsFn: noExist });
  ok(part.auto.length === 1 && part.auto[0].source === '_SYSTEM/a.md', 'partition: one safe plan → auto');
  ok(part.queued.length === 2, 'partition: HIGH + blocked → queued');
  ok(part.queued.some((q) => /ephemeral/i.test(q.reason)), 'partition: EPHEMERAL/blocked carries its reason (never auto)');
}
{
  const noExist = () => false;
  const many = Array.from({ length: DEFAULT_BUDGET + 3 }, (_, i) => safePlan({ source: `_SYSTEM/n${String(i).padStart(2, '0')}.md`, target: `_SYSTEM/docs/n${String(i).padStart(2, '0')}.md` }));
  const part = partitionPlans(many, { existsFn: noExist, budget: DEFAULT_BUDGET });
  ok(part.auto.length === DEFAULT_BUDGET, `budget cap: auto capped at ${DEFAULT_BUDGET}`);
  ok(part.queued.length === 3 && part.queued.every((q) => /budget cap/.test(q.reason)), 'budget cap: overflow queued as budget-deferred');
}
{
  // existsFn drives the target-exists branch deterministically
  const existsAll = () => true;
  const part = partitionPlans([safePlan()], { existsFn: existsAll });
  ok(part.auto.length === 0 && /exists/.test(part.queued[0].reason), 'partition: target-exists pushes a would-be-safe plan to queued');
}

// ── planHashOf: deterministic, order-independent, content-sensitive ──
{
  const a = [safePlan({ source: '_SYSTEM/a.md', target: '_SYSTEM/docs/a.md' }), safePlan({ source: '_SYSTEM/b.md', target: '_SYSTEM/docs/b.md' })];
  const aReordered = [a[1], a[0]];
  ok(/^[0-9a-f]{64}$/.test(planHashOf(a)), 'planHash is a 64-hex sha256');
  ok(planHashOf(a) === planHashOf(aReordered), 'planHash is order-independent (sorted internally)');
  const changed = [a[0], safePlan({ source: '_SYSTEM/b.md', target: '_SYSTEM/OTHER/b.md' })];
  ok(planHashOf(a) !== planHashOf(changed), 'planHash changes when a target changes');
  const withBlocked = [...a, { source: '_SYSTEM/z.bak', blocked: true }];
  ok(planHashOf(a) === planHashOf(withBlocked), 'planHash excludes blocked plans (only the move plan is hashed)');
  ok(planHashOf([]) === planHashOf([{ source: 'x', blocked: true }]), 'planHash of an empty move plan is stable');
}

// ── enumerateMisplaced: pinned/protected/settled excluded, genuine misplaced kept (uses the real assessor) ──
{
  const injected = [
    'SOUL.md',                                              // pinned
    '_SYSTEM/yuri-origin.md',                               // pinned
    '.claude/state/foo.json',                              // protected
    '.claude/skills/x/SKILL.md',                           // settled (dotdir)
    '02_RESOURCES/RESEARCH/proj/data.json',                // settled (research project subfolder)
    '_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md',       // genuinely misplaced → docs/handoffs
  ];
  const m = enumerateMisplaced({ files: injected });
  ok(m.length === 1 && m[0] === '_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md', 'enumerate: only the genuinely-misplaced loose file survives');
  ok(!m.includes('SOUL.md') && !m.includes('_SYSTEM/yuri-origin.md'), 'enumerate: pinned @-include anchors never enumerated');
  ok(!m.some((p) => p.startsWith('.claude/')), 'enumerate: protected/settled dotdir paths never enumerated');
}

// ── verifyNoStaleRefs: clean for an unreferenced path, detects a widely-referenced one ──
// assemble the path at runtime so the literal never appears in this source file (git grep would self-match it)
const absentPath = ['__no', 'ref', String(7 * 13)].join('_') + '/' + ['q', 'absent', 'marker'].join('-') + '.none';
ok(verifyNoStaleRefs([absentPath]).clean === true, 'verify: a never-referenced path is CLEAN');
{
  const v = verifyNoStaleRefs(['_SYSTEM/yuri-origin.md']);   // referenced across the repo
  ok(v.clean === false && v.stale.length === 1, 'verify: a referenced path is reported STALE (detect branch works)');
}

// ── runFiling: dry-run + the gate fail-safe (READ-ONLY; mutates nothing) ──
function gitStatus() { try { return execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); } catch { return null; } }
{
  const before = gitStatus();
  const probe = { files: ['_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md'], noWrite: true, now: '2026-06-13T00:00:00.000Z' };

  const dry = await runFiling({ ...probe, armed: false, execute: false });
  ok(dry.dryRun === true && dry.movesExecuted === 0, 'runFiling: dry-run by default — nothing executed');

  const armedNoExec = await runFiling({ ...probe, armed: true, execute: false });
  ok(armedNoExec.dryRun === true && armedNoExec.movesExecuted === 0, 'runFiling: armed but no --execute still only plans');

  const execDisarmed = await runFiling({ ...probe, armed: false, execute: true });
  ok(execDisarmed.dryRun === true && execDisarmed.movesExecuted === 0 && /DISARMED/.test(execDisarmed.gateReason), 'runFiling: --execute while DISARMED is refused (gate fail-safe)');

  ok(dry.planHash === armedNoExec.planHash, 'runFiling: planHash is byte-identical across two runs on the same state');
  ok(/^[0-9a-f]{64}$/.test(dry.planHash), 'runFiling: planHash is a sha256');

  const after = gitStatus();
  ok(before === after, 'runFiling: dry-run MUTATED NOTHING (git status byte-identical before/after)');
}

// ── live execute + rollback proof (opt-in: FILING_AUTONOMY_LIVE_TEST=1; always self-cleans) ──
if (process.env.FILING_AUTONOMY_LIVE_TEST === '1') {
  const probeRel = '_SYSTEM/docs/handoffs/__filing_autonomy_probe_handoff__.md';
  const movedRel = '_SYSTEM/docs/handoffs/__filing_autonomy_probe_handoff__.md';
  const probeAbs = path.join(REPO, probeRel);
  const movedAbs = path.join(REPO, movedRel);
  const flagAbs = path.join(process.env.YURI_STATE_DIR || path.join(REPO, '_SYSTEM', 'state'), 'filing-autonomy.enabled');
  const flagPre = (() => { try { return fs.existsSync(flagAbs); } catch { return false; } })();
  const before = gitStatus();
  try {
    fs.writeFileSync(probeAbs, '# probe handoff (throwaway)\n\nNo inbound references. Safe-tier round-trip proof.\n');
    if (!flagPre) fs.writeFileSync(flagAbs, 'armed-by-live-test\n');
    process.env.YURI_FILING_AUTONOMY = '1';

    const run = await runFiling({ files: [probeRel], execute: true, skipReindex: true, noWrite: true, now: '2026-06-13T00:00:00.000Z' });
    ok(run.dryRun === false && /armed \+ execute/.test(run.gateReason), 'live: armed + --execute mutates');
    ok(run.movesExecuted === 1 && run.executed[0].target === movedRel, 'live: exactly the one safe probe moved → docs/handoffs');
    ok(fs.existsSync(movedAbs) && !fs.existsSync(probeAbs), 'live: probe physically relocated to the canonical zone');
    ok(run.staleRefVerification && run.staleRefVerification.clean === true, 'live: zero stale refs after the move');

    // rollback (untracked source ⇒ mutator used fs.rename ⇒ reverse with fs.rename)
    fs.renameSync(movedAbs, probeAbs);
  } finally {
    try { if (fs.existsSync(movedAbs)) fs.unlinkSync(movedAbs); } catch { /* best-effort */ }
    try { if (fs.existsSync(probeAbs)) fs.unlinkSync(probeAbs); } catch { /* best-effort */ }
    try { if (!flagPre && fs.existsSync(flagAbs)) fs.unlinkSync(flagAbs); } catch { /* best-effort */ }
    delete process.env.YURI_FILING_AUTONOMY;
  }
  const after = gitStatus();
  ok(before === after, 'live: full rollback — working tree byte-identical to before (git status unchanged)');
}

console.log(`\nfiling-autonomy.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
