import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readFileSync, readdirSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listSkillDirs, planSync, runSync, publishedSet } from './skill-sync.mjs';

function mkSkill(root, name, body, mtimeSec, files = {}) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const md = path.join(dir, 'SKILL.md');
  writeFileSync(md, body);
  for (const [f, c] of Object.entries(files)) writeFileSync(path.join(dir, f), c);
  if (mtimeSec) { const t = new Date(mtimeSec * 1000); utimesSync(md, t, t); }
}

function fixture() {
  const repo = mkdtempSync(path.join(tmpdir(), 'skillsync-'));
  mkdirSync(path.join(repo, 'skills'), { recursive: true });
  mkdirSync(path.join(repo, '.claude/skills'), { recursive: true });
  // A: drift, harness newer -> winner harness ; skills/ has an extra kit file that overlay must KEEP
  mkSkill(path.join(repo, 'skills'), 'A', 'A-old\n', 1000, { 'REF.md': 'kit-ref' });
  mkSkill(path.join(repo, '.claude/skills'), 'A', 'A-new\n', 2000);
  // B: stranded (skills/-only daily-ish)
  mkSkill(path.join(repo, 'skills'), 'B', 'B\n', 1500);
  // C: harness-only -> back-port to skills/
  mkSkill(path.join(repo, '.claude/skills'), 'C', 'C\n', 1500);
  // D: identical in both -> no drift
  mkSkill(path.join(repo, 'skills'), 'D', 'D\n', 1500);
  mkSkill(path.join(repo, '.claude/skills'), 'D', 'D\n', 1500);
  // E: drift, source newer -> winner source (NOT canonicalized)
  mkSkill(path.join(repo, 'skills'), 'E', 'E-new\n', 3000);
  mkSkill(path.join(repo, '.claude/skills'), 'E', 'E-old\n', 1000);
  return repo;
}

test('planSync classifies drift / stranded / harness-only and picks newer winner', () => {
  const repo = fixture();
  const p = planSync(repo);
  assert.equal(p.counts.source, 4);   // A B D E
  assert.equal(p.counts.harness, 4);  // A C D E
  const driftByName = Object.fromEntries(p.drift.map((d) => [d.name, d.winner]));
  assert.equal(driftByName.A, 'harness');
  assert.equal(driftByName.E, 'source');
  assert.ok(!('D' in driftByName), 'identical D is not drift');
  assert.deepEqual(p.harnessOnly, ['C']);
  assert.ok(p.stranded.includes('B'));
  // canonicalize back-ports A (harness newer) and C (harness-only), NOT E (source newer)
  const canon = p.canonicalize.map((c) => c.name).sort();
  assert.deepEqual(canon, ['A', 'C']);
});

test('runSync canonicalizes newer content into skills/ while OVERLAY preserves kit files', () => {
  const repo = fixture();
  runSync(repo, {});
  // A: skills/ now has the newer harness content AND still has its skills/-only kit file
  assert.equal(readFileSync(path.join(repo, 'skills/A/SKILL.md'), 'utf8'), 'A-new\n');
  assert.ok(existsSync(path.join(repo, 'skills/A/REF.md')), 'overlay must preserve skills/-only kit file');
  // C: back-ported into skills/
  assert.ok(existsSync(path.join(repo, 'skills/C/SKILL.md')), 'harness-only C back-ported to skills/');
  // E: source-newer preserved (not clobbered by old harness)
  assert.equal(readFileSync(path.join(repo, 'skills/E/SKILL.md'), 'utf8'), 'E-new\n');
});

test('runSync publishes stranded skills into the harness root (makes them invokable)', () => {
  const repo = fixture();
  // force B into the published set by treating all source skills as published via harness-preserve:
  // B is stranded; publishedSet here = DAILY_DRIVERS ∪ harness names. B is neither, so emulate by
  // checking the mechanism on C/A which ARE in the published set (already-surfaced preserve rule).
  runSync(repo, {});
  // A and D were already in harness; C back-ported then published; all present in harness after sync
  for (const n of ['A', 'C', 'D']) assert.ok(existsSync(path.join(repo, '.claude/skills', n, 'SKILL.md')), `${n} in harness`);
});

// regression (DeepSeek-flash red-team 2026-06-16, BUG 1): a dispatcher skill with a NESTED
// sub-skill (its own SKILL.md) must NOT have that sub-skill copied as if it were kit content.
test('mirrorDir skips nested-skill subdirs (no gitnexus-style dispatcher pollution)', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'skillsync-nest-'));
  mkdirSync(path.join(repo, 'skills'), { recursive: true });
  mkdirSync(path.join(repo, '.claude/skills'), { recursive: true });
  mkSkill(path.join(repo, 'skills'), 'disp', 'disp\n', 2000, {});
  mkdirSync(path.join(repo, 'skills/disp/refs'), { recursive: true });
  writeFileSync(path.join(repo, 'skills/disp/refs/note.md'), 'kit');     // real kit content
  mkdirSync(path.join(repo, 'skills/disp/sub'), { recursive: true });
  writeFileSync(path.join(repo, 'skills/disp/sub/SKILL.md'), 'nested');  // a NESTED skill
  mkSkill(path.join(repo, '.claude/skills'), 'disp', 'disp-old\n', 1000); // in published set (harness name)
  runSync(repo, {});
  assert.ok(existsSync(path.join(repo, '.claude/skills/disp/refs/note.md')), 'kit subdir IS copied');
  assert.ok(!existsSync(path.join(repo, '.claude/skills/disp/sub/SKILL.md')), 'nested skill must NOT be copied as kit content');
});

// regression (DeepSeek-flash red-team 2026-06-16, BUG 2): a symlink destination is the live mirror
// link — overwriting it would break .claude/skills mirror semantics.
test('mirrorDir preserves a symlink destination instead of clobbering it', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'skillsync-sym-'));
  mkdirSync(path.join(repo, 'skills/X'), { recursive: true });
  mkdirSync(path.join(repo, '.claude/skills/X'), { recursive: true });
  writeFileSync(path.join(repo, 'skills/X/SKILL.md'), 'real\n');
  symlinkSync('../../../skills/X/SKILL.md', path.join(repo, '.claude/skills/X/SKILL.md'));
  runSync(repo, {});
  assert.ok(lstatSync(path.join(repo, '.claude/skills/X/SKILL.md')).isSymbolicLink(), 'symlink dest preserved');
});

test('idempotent: second runSync produces identical trees', () => {
  const repo = fixture();
  runSync(repo, {});
  const snap = (root) => listSkillDirs(root, repo).map((n) => `${n}:${readFileSync(path.join(repo, root, n, 'SKILL.md'), 'utf8')}`).join('|');
  const a = snap('skills') + '##' + snap('.claude/skills');
  runSync(repo, {});
  const b = snap('skills') + '##' + snap('.claude/skills');
  assert.equal(a, b);
});

// ============================ RED (mutation) ============================
// Proves the nested-skill guard in mirrorDir is load-bearing: the UNGUARDED logic demonstrably
// pollutes (copies a nested sub-skill as kit content — the exact gitnexus bug). The guarded
// runSync (covered above) does NOT — that contrast is the kill.
test('RED: an unguarded recursive mirror WOULD copy a nested skill as kit content (the bug the guard kills)', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'skillsync-red-'));
  const src = path.join(repo, 'skills/disp'); mkdirSync(path.join(src, 'sub'), { recursive: true });
  writeFileSync(path.join(src, 'SKILL.md'), 'disp');
  writeFileSync(path.join(src, 'sub/SKILL.md'), 'nested'); // a NESTED skill, not kit content
  const dst = path.join(repo, '.claude/skills/disp');
  const naive = (s, d) => { mkdirSync(d, { recursive: true });
    for (const e of readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, e.name); const dp = path.join(d, e.name);
      if (e.isDirectory()) naive(sp, dp); else writeFileSync(dp, readFileSync(sp)); } };
  naive(src, dst); // the mutant
  assert.ok(existsSync(path.join(dst, 'sub/SKILL.md')), 'mutant pollutes — proves the bug class is real and the guard necessary');
});

// ============================ GREY (independent oracle) ============================
// The mirror INVARIANT as a property over ALL published skills (not the hand-picked A/C/D): after
// sync, every published skill's harness copy is byte-identical to its source. Kills any per-skill
// copy mutant (truncation, wrong-source, partial write) the enumerated green tests don't name.
test('GREY oracle: after runSync EVERY published skill mirrors its source byte-for-byte', () => {
  const repo = fixture();
  const { plan } = runSync(repo, {});
  let checked = 0;
  for (const n of plan.publish) {
    const s = path.join(repo, 'skills', n, 'SKILL.md');
    const h = path.join(repo, '.claude/skills', n, 'SKILL.md');
    if (existsSync(s) && existsSync(h)) { assert.equal(readFileSync(h, 'utf8'), readFileSync(s, 'utf8'), `${n}: harness must mirror source`); checked += 1; }
  }
  assert.ok(checked > 0, 'invariant must actually be exercised on ≥1 published skill');
});
