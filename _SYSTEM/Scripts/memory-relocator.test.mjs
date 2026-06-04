import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openColdStore, getCold, coldCount } from './memory-cold-store.mjs';
import { buildItem, planRelocations, loadItems, executeRelocation, promoteHot, lastContentChangeMs, seedDryRun, applySupersession, familyPrefix } from './memory-relocator.mjs';

const DAY = 86400000;
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reloc-'));
const writeMem = (root, name, body) => { const f = path.join(root, name); fs.writeFileSync(f, body); return f; };
const tmpSidecar = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fseen-')), 'memory-first-seen.json');

test('planRelocations (pure): decayed demotes, fresh + force-keep stay', () => {
  const now = 300 * DAY;
  const items = [
    { slug: 'stale', baseStabilityDays: 14, lastUsedMs: 0, useCount: 0, salience: 0, forceKeep: false },
    { slug: 'fresh', baseStabilityDays: 14, lastUsedMs: now, useCount: 0, salience: 0, forceKeep: false },
    { slug: 'locked', baseStabilityDays: 14, lastUsedMs: 0, useCount: 0, salience: 0, forceKeep: true },
  ];
  const { demote, keep } = planRelocations(items, { nowMs: now, rFloor: 0.6 });
  assert.deepEqual(demote.map((d) => d.slug), ['stale']);
  assert.deepEqual(keep.map((k) => k.slug).sort(), ['fresh', 'locked']);
});

test('buildItem: force_keep flag honored; tier sets base stability', () => {
  assert.equal(buildItem('/x/a.md', '---\nname: a\nforce_keep: true\n---\nbody', { nowMs: 1000 }).forceKeep, true);
  assert.equal(buildItem('/x/b.md', '---\nname: b\ntier: semantic\n---\nbody', { nowMs: 1000 }).baseStabilityDays, 60);
  assert.equal(buildItem('/x/c.md', '---\nname: c\narchive: false\n---\nbody', { nowMs: 1000 }).forceKeep, true);
});

test('full demote -> cold -> promote round-trip preserves the body BYTE-IDENTICAL', () => {
  const root = tmpRoot();
  const body = '---\nname: doomed\n---\n# Doomed\nverbatim ⟦body⟧ 100% kept and long enough to clear the quality floor here\n';
  const f = writeMem(root, 'doomed.md', body);
  const old = new Date(Date.now() - 400 * DAY);
  fs.utimesSync(f, old, old);                                  // looks long-unused
  const db = openColdStore(':memory:');

  const items = loadItems(root, { nowMs: Date.now(), usageIndex: {}, firstSeen: {} });
  // redundancyFloor:0 = the pure-FSRS A/B baseline switch (MEM-02). This test exercises the
  // cold→promote I/O round-trip, not the redundancy policy: a single unique file alone in the
  // store is IRREDUCIBLE-given-rest by definition, so the two-axis path would (correctly)
  // protect it. The baseline switch isolates the R-axis so the round-trip machinery is tested.
  const plan = planRelocations(items, { nowMs: Date.now(), rFloor: 0.6, redundancyFloor: 0 });
  assert.ok(plan.demote.some((d) => d.slug === 'doomed'), 'old unused memory should demote');

  const res = executeRelocation(plan, { coldDb: db, root, dryRun: false, nowMs: Date.now() });
  assert.ok(res.demoted >= 1);
  assert.equal(fs.existsSync(f), false);                                          // moved out of active
  assert.equal(fs.existsSync(path.join(root, 'relocated', 'doomed.md')), true);   // reversible copy kept
  assert.equal(getCold(db, 'doomed').body, body);                                 // in cold, byte-identical

  const promo = promoteHot('doomed', { coldDb: db, root, nowMs: Date.now() });
  assert.equal(promo.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'doomed.md'), 'utf8'), body);       // restored byte-identical
  assert.equal(coldCount(db), 0);                                                  // cleared from cold
  db.close();
});

test('dry-run plans without touching the filesystem', () => {
  const root = tmpRoot();
  const f = writeMem(root, 'd.md', '---\nname: d\n---\n' + 'x'.repeat(200));
  const old = new Date(Date.now() - 400 * DAY);
  fs.utimesSync(f, old, old);
  const items = loadItems(root, { nowMs: Date.now(), usageIndex: {}, firstSeen: {} });
  const plan = planRelocations(items, { nowMs: Date.now(), rFloor: 0.6 });
  const res = executeRelocation(plan, { coldDb: null, root, dryRun: true });
  assert.equal(res.dryRun, true);
  assert.equal(fs.existsSync(f), true);                                            // untouched
});

// MEM-02 — the headline test: a file touched by checkout (mtime=now) but content-unchanged
// for 60 days (git author-date = 60d ago) must score as ~60d-old, NOT 0d. Proves the prior
// no longer keys on the checkout-fragile mtime.
test('MEM-02: git-author-date 60d ago + mtime=now → lastUsedMs reflects 60d, not 0d', () => {
  let gitOk = true;
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitOk = false; }
  if (!gitOk) return; // environment without git — the fallback chain is covered by the next test

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'reloc-git-'));
  const run = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore', env: { ...process.env,
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  run('init', '-q');
  const sixtyAgoSecs = Math.floor((Date.now() - 60 * DAY) / 1000);
  const iso = new Date(sixtyAgoSecs * 1000).toISOString();
  const body = '---\nname: aged\ntier: episodic\n---\n' + 'content that has not changed in two months '.repeat(4);
  const f = path.join(repo, 'aged.md');
  fs.writeFileSync(f, body);
  run('add', 'aged.md');
  execFileSync('git', ['commit', '-q', '-m', 'seed', '--date', iso], { cwd: repo, stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  // simulate a checkout/reindex that reset mtime to now
  const nowDate = new Date();
  fs.utimesSync(f, nowDate, nowDate);
  const nowMs = Date.now();

  const ms = lastContentChangeMs(f, { mtimeMs: nowMs, nowMs, slug: 'aged' });
  const ageDays = (nowMs - ms) / DAY;
  assert.ok(ageDays >= 55 && ageDays <= 65, `git author-date prior should be ~60d, got ${ageDays.toFixed(1)}d`);

  // and through buildItem (no ledger entry → uses the stable prior, NOT mtime)
  const item = buildItem(f, body, { usageIndex: {}, nowMs, mtimeMs: nowMs });
  const itemAgeDays = (nowMs - item.lastUsedMs) / DAY;
  assert.ok(itemAgeDays >= 55 && itemAgeDays <= 65, `buildItem.lastUsedMs should reflect 60d, got ${itemAgeDays.toFixed(1)}d`);
});

// MEM-02 — fallthrough chain for the UNTRACKED live store: no git history → sidecar prior
// is pinned at first observation and survives a later mtime reset (checkout-stable).
test('MEM-02: untracked file → sidecar pins first-seen, survives mtime reset', () => {
  const root = tmpRoot();
  const sidecar = tmpSidecar();
  const f = writeMem(root, 'untracked.md', '---\nname: untracked\n---\n' + 'real body '.repeat(20));
  const sixtyAgo = new Date(Date.now() - 60 * DAY);
  fs.utimesSync(f, sixtyAgo, sixtyAgo);                       // first observation = 60d-old mtime
  const nowMs = Date.now();
  // first read: git yields nothing (untracked) → seeds sidecar with the 60d mtime
  const first = lastContentChangeMs(f, { sidecar, mtimeMs: sixtyAgo.getTime(), nowMs, slug: 'untracked' });
  assert.ok((nowMs - first) / DAY >= 55, 'first-seen seeded from 60d mtime');
  // now a checkout/reindex resets mtime to now
  const nowDate = new Date();
  fs.utimesSync(f, nowDate, nowDate);
  const second = lastContentChangeMs(f, { sidecar, mtimeMs: nowMs, nowMs, slug: 'untracked' });
  assert.equal(second, first, 'sidecar prior is checkout-stable: unchanged after mtime reset');
});

// MEM-02 — quality/length floor: a near-empty file must NOT masquerade as fresh.
test('MEM-02: sub-quality file pinned to fully-decayed (lastUsedMs=0), not fresh', () => {
  const f = '/x/garbled.md';
  const item = buildItem(f, '---\nname: garbled\n---\n', { usageIndex: {}, nowMs: 1000 * DAY, mtimeMs: 1000 * DAY });
  assert.equal(item.lowQuality, true);
  assert.equal(item.lastUsedMs, 0);                          // epoch → fully decayed
  const { demote } = planRelocations([item], { nowMs: 1000 * DAY, rFloor: 0.6 });
  assert.deepEqual(demote.map((d) => d.slug), ['garbled'], 'garbled low-content file demotes (not false-protected as fresh)');
});

// MEM-02 — ledger still wins over the stable prior (real USE beats last-touch).
test('MEM-02: ledger lastUsedMs takes priority over the content-change prior', () => {
  const f = '/x/used.md';
  const nowMs = 500 * DAY;
  const item = buildItem(f, '---\nname: used\n---\n' + 'body '.repeat(40),
    { usageIndex: { used: { useCount: 4, lastUsedMs: nowMs } }, nowMs, mtimeMs: 1 });
  assert.equal(item.lastUsedMs, nowMs, 'ledger lastUsedMs overrides the stable last-touch prior');
});

// MEM-04 — exclusion set + size cap drop telemetry from the scan (skips observed, not silent).
test('MEM-04: session-journal.md excluded; oversized file capped; skips reported', () => {
  const root = tmpRoot();
  writeMem(root, 'keep-me.md', '---\nname: keep-me\n---\n' + 'normal body '.repeat(20));
  writeMem(root, 'session-journal.md', 'telemetry '.repeat(50));     // excluded by NAME
  writeMem(root, 'huge.md', '---\nname: huge\n---\n' + 'x'.repeat(70 * 1024)); // > MAX_DEMOTABLE_BYTES (64KB)
  const skips = [];
  const items = loadItems(root, { nowMs: Date.now(), usageIndex: {}, firstSeen: {}, onSkip: (f, why) => skips.push(`${f}:${why}`) });
  const slugs = items.map((i) => i.slug).sort();
  assert.deepEqual(slugs, ['keep-me'], 'only the normal file is scored');
  assert.ok(skips.some((s) => s.startsWith('session-journal.md:')), 'journal skip reported');
  assert.ok(skips.some((s) => s.startsWith('huge.md:')), 'oversized skip reported');
});

// MEM-04 / safety — PROTECTED_TYPES (feedback/user) are exempt even when stale.
test('PROTECTED_TYPES feedback/user never demote, even fully decayed', () => {
  const nowMs = 1000 * DAY;
  const fb = buildItem('/x/fb.md', '---\nname: fb\ntype: feedback\n---\n' + 'rule '.repeat(40), { usageIndex: {}, nowMs, mtimeMs: 0, firstSeen: {} });
  const usr = buildItem('/x/usr.md', '---\nname: usr\ntype: user\n---\n' + 'pref '.repeat(40), { usageIndex: {}, nowMs, mtimeMs: 0, firstSeen: {} });
  assert.equal(fb.forceKeep, true);
  assert.equal(usr.forceKeep, true);
  const { demote, keep } = planRelocations([fb, usr], { nowMs, rFloor: 0.6 });
  assert.equal(demote.length, 0, 'no protected type demotes');
  assert.deepEqual(keep.map((k) => k.slug).sort(), ['fb', 'usr']);
});

// ── MEM-02 (card 14, MDL redundancy axis) ──────────────────────────────────────────────

// Realistic-length bodies — full sentences repeated, the way real memory files read. Short
// token-bag fixtures don't give gzip enough context to separate redundant from novel; multi-
// sentence prose does (matching the live session-resume / reference files this axis governs).
const PROSE = (sentence, n = 6) => (sentence + ' ').repeat(n);

// The headline MEM-02 regression: a stale-but-UNIQUE memory is now KEPT where the pure-FSRS
// baseline would have demoted it; a stale-but-REDUNDANT restatement is flagged and demotes.
test('MEM-02: stale+unique KEPT (protected) vs stale+duplicate DEMOTED — the two-axis fix', () => {
  const now = 400 * DAY;
  const fsrsFloor = { nowMs: now, rFloor: 0.6, supersessionPenaltyDays: 0 };
  const refSentence = 'The subconscious memory loop demotes low-retrievability traces into the reversible cold store while preserving the body byte identical for later promotion back into active recall.';
  const uniqSentence = 'Quantum tunneling in Josephson junctions enables flux qubits via macroscopic phase coherence across the niobium oxide barrier under millikelvin cryogenic operating conditions here.';
  // a fresh, kept reference body that the duplicate will be redundant against
  const keptRef = '---\nname: kept-ref\n---\n' + PROSE(refSentence);
  const uniqueBody = '---\nname: unique\n---\n' + PROSE(uniqSentence);
  const dupBody = '---\nname: dup\n---\n' + PROSE(refSentence);   // verbatim restatement of kept-ref

  const items = [
    { slug: 'kept-ref', baseStabilityDays: 14, lastUsedMs: now, useCount: 0, salience: 0, forceKeep: false, body: keptRef },     // fresh → kept, forms "rest"
    { slug: 'unique',   baseStabilityDays: 14, lastUsedMs: 0,   useCount: 0, salience: 0, forceKeep: false, body: uniqueBody }, // stale + novel
    { slug: 'dup',      baseStabilityDays: 14, lastUsedMs: 0,   useCount: 0, salience: 0, forceKeep: false, body: dupBody },    // stale + redundant vs kept-ref
  ];

  // pure-FSRS baseline (redundancyFloor:0): BOTH stale items demote
  const base = planRelocations(items, { ...fsrsFloor, redundancyFloor: 0 });
  assert.deepEqual(base.demote.map((d) => d.slug).sort(), ['dup', 'unique'], 'pure-FSRS demotes both stale items');

  // two-axis (default floor): unique is PROTECTED (irreducible), dup is DEMOTED (redundant)
  const twoAxis = planRelocations(items, { ...fsrsFloor, redundancyFloor: 0.15 });
  assert.deepEqual(twoAxis.demote.map((d) => d.slug), ['dup'], 'only the redundant restatement demotes');
  assert.ok(twoAxis.keep.some((k) => k.slug === 'unique' && /PROTECTED/.test(k.reason)), 'stale+unique is protected by the MDL axis');
});

// GUARD: a low-quality (near-empty) stale file must NOT false-protect itself as "novel".
test('MEM-02 GUARD: low-quality stale file is NOT protected (quality floor)', () => {
  const now = 400 * DAY;
  const keptRef = '---\nname: ref\n---\n' + PROSE('A substantial reference body with real lexical content spanning multiple distinct clauses and ideas.');
  const items = [
    { slug: 'ref',     baseStabilityDays: 14, lastUsedMs: now, useCount: 0, forceKeep: false, body: keptRef },
    { slug: 'garbled', baseStabilityDays: 14, lastUsedMs: 0,   useCount: 0, forceKeep: false, body: '---\nname: garbled\n---\nx' },
  ];
  const { demote } = planRelocations(items, { nowMs: now, rFloor: 0.6, redundancyFloor: 0.15, supersessionPenaltyDays: 0 });
  assert.ok(demote.some((d) => d.slug === 'garbled'), 'low-quality stale file demotes, not false-protected as novel');
});

// MEM-02: redundancyFloor flows from the cfg (energy-weights.json fsrs block) — it is a LIVE knob.
test('MEM-02: redundancyFloor is a live knob (0 = pure-FSRS baseline, higher = stricter)', () => {
  const now = 400 * DAY;
  const s = 'A consolidated reference describing the cross-domain mechanism transfer pipeline with source domain target domain shared mechanism mismatch and confidence stages.';
  const ref = '---\nname: ref\n---\n' + PROSE(s);
  const dup = '---\nname: dup\n---\n' + PROSE(s);
  const items = [
    { slug: 'ref', baseStabilityDays: 14, lastUsedMs: now, forceKeep: false, body: ref },
    { slug: 'dup', baseStabilityDays: 14, lastUsedMs: 0,   forceKeep: false, body: dup },
  ];
  const off = planRelocations(items, { nowMs: now, rFloor: 0.6, redundancyFloor: 0, supersessionPenaltyDays: 0 });
  assert.ok(off.demote.some((d) => d.slug === 'dup'));
  const on = planRelocations(items, { nowMs: now, rFloor: 0.6, redundancyFloor: 0.15, supersessionPenaltyDays: 0 });
  assert.ok(on.demote.some((d) => d.slug === 'dup'), 'duplicate still demotes — redundant AND low-R');
});

// ── MEM-05 (supersession: superseded same-family session-resume anchors) ──────────────────

test('MEM-05: familyPrefix groups dated anchors; null for non-family slugs', () => {
  assert.equal(familyPrefix('session-resume-2026-06-04-wave0'), 'session-resume');
  assert.equal(familyPrefix('session-resume-2026-05-31'), 'session-resume');
  assert.equal(familyPrefix('feedback-identity'), null);
  assert.equal(familyPrefix('cross-domain-transfer-engine'), null);
});

test('MEM-05: 3 same-family anchors → 2 older demote, newest kept (supersession back-date)', () => {
  const now = 100 * DAY;
  // All three are FRESH (recent lastUsedMs) so pure-FSRS keeps all; supersession back-dates the
  // two older ones past rFloor while the newest stays warm. Bodies are unique enough that the
  // redundancy axis does not also protect them (disabled here to isolate supersession).
  const mk = (slug, lastUsedMs, seed) => ({ slug, baseStabilityDays: 3, lastUsedMs, useCount: 0, forceKeep: false, body: `---\nname: ${slug}\n---\n` + (seed + ' ').repeat(40) });
  const items = [
    mk('session-resume-2026-05-31', now - 2 * DAY, 'older anchor one alpha bravo charlie delta'),
    mk('session-resume-2026-06-01', now - 1 * DAY, 'older anchor two echo foxtrot golf hotel'),
    mk('session-resume-2026-06-04-newest', now,     'newest anchor india juliet kilo lima'),
  ];
  // Without supersession: all fresh → none demote (rFloor=0.6, working tier, ~1-2d old)
  const noPenalty = planRelocations(items, { nowMs: now, rFloor: 0.6, redundancyFloor: 0, supersessionPenaltyDays: 0 });
  assert.equal(noPenalty.demote.length, 0, 'without supersession all fresh anchors are kept');

  // With supersession: the two older anchors are back-dated and cross rFloor; newest kept.
  const withPenalty = planRelocations(items, { nowMs: now, rFloor: 0.6, redundancyFloor: 0, supersessionPenaltyDays: 30 });
  const demoted = withPenalty.demote.map((d) => d.slug).sort();
  assert.deepEqual(demoted, ['session-resume-2026-05-31', 'session-resume-2026-06-01'], 'two older same-family anchors demote');
  assert.ok(withPenalty.keep.some((k) => k.slug === 'session-resume-2026-06-04-newest'), 'newest anchor stays warm');
});

test('MEM-05: applySupersession never mutates input and skips force-kept members', () => {
  const items = [
    { slug: 'session-resume-2026-06-01', lastUsedMs: 1000, forceKeep: false },
    { slug: 'session-resume-2026-06-04', lastUsedMs: 2000, forceKeep: false },
    { slug: 'session-resume-2026-05-01', lastUsedMs: 500, forceKeep: true },   // pinned → untouched
  ];
  const before = JSON.stringify(items);
  const out = applySupersession(items, { penaltyDays: 30 });
  assert.equal(JSON.stringify(items), before, 'input not mutated');
  const pinned = out.find((o) => o.slug === 'session-resume-2026-05-01');
  assert.equal(pinned.lastUsedMs, 500, 'force-kept member is not back-dated');
  assert.ok(!pinned.superseded, 'force-kept member not marked superseded');
});

// MEM-05 GUARD — a poisoned incoming `superseded:true` flag on a non-superseded item must be
// STRIPPED, so it can't bypass MDL protection in planRelocations (defense-in-depth).
test('MEM-05 GUARD: stale incoming superseded flag is stripped (cannot poison the demote path)', () => {
  const now = 400 * DAY;
  // single-member family arriving pre-flagged superseded=true, fully decayed + unique body
  const poisoned = { slug: 'session-resume-2099-01-01-solo', baseStabilityDays: 14, lastUsedMs: 0, forceKeep: false, superseded: true, body: '---\nname: solo\n---\n' + ('a genuinely unique standalone insight worth keeping forever here. '.repeat(8)) };
  const stripped = applySupersession([poisoned], { penaltyDays: 30 });
  assert.ok(!stripped[0].superseded, 'single-member family: incoming superseded flag stripped');
  // disabled path strips too
  const strippedOff = applySupersession([poisoned], { penaltyDays: 0 });
  assert.ok(!strippedOff[0].superseded, 'disabled supersession path also strips the flag');
  // and in planRelocations the unique-but-stale solo item is PROTECTED (not bypassed by stale flag)
  const ref = { slug: 'other-ref', baseStabilityDays: 14, lastUsedMs: now, forceKeep: false, body: '---\nname: ref\n---\n' + ('completely different reference about cold call openers and sales objection rebuttals. '.repeat(8)) };
  const { demote, keep } = planRelocations([poisoned, ref], { nowMs: now, rFloor: 0.6, redundancyFloor: 0.15, supersessionPenaltyDays: 30 });
  assert.ok(!demote.some((d) => d.slug === poisoned.slug), 'unique stale solo item not demoted despite poisoned flag');
  assert.ok(keep.some((k) => k.slug === poisoned.slug && /PROTECTED/.test(k.reason)), 'it is MDL-protected as irreducible');
});

test('MEM-05: feedback/user types remain exempt under the new two-axis + supersession path', () => {
  const now = 1000 * DAY;
  const fb = buildItem('/x/fb.md', '---\nname: session-resume-2026-01-01\ntype: feedback\n---\n' + 'rule '.repeat(40), { usageIndex: {}, nowMs: now, mtimeMs: 0, firstSeen: {} });
  const usr = buildItem('/x/usr.md', '---\nname: session-resume-2026-01-02\ntype: user\n---\n' + 'pref '.repeat(40), { usageIndex: {}, nowMs: now, mtimeMs: 0, firstSeen: {} });
  // even named like a family AND fully decayed AND with siblings, protected types never demote
  const { demote } = planRelocations([fb, usr], { nowMs: now, rFloor: 0.6, redundancyFloor: 0.15, supersessionPenaltyDays: 30 });
  assert.equal(demote.length, 0, 'feedback/user exempt even under supersession + redundancy axes');
});

// STEP 3 — seedDryRun produces a sorted demote-set table and executes NOTHING.
test('seedDryRun: returns sorted demote rows, touches nothing', () => {
  const root = tmpRoot();
  const f = writeMem(root, 'old.md', '---\nname: old\ntier: working\n---\n' + 'stale body '.repeat(20));
  const sixtyAgo = new Date(Date.now() - 200 * DAY);
  fs.utimesSync(f, sixtyAgo, sixtyAgo);
  const seed = seedDryRun(root, { rFloor: 0.6, firstSeen: {} });
  assert.equal(typeof seed.scanned, 'number');
  assert.ok(Array.isArray(seed.rows));
  assert.equal(fs.existsSync(f), true, 'seed dry-run never relocates');
  if (seed.rows.length) {
    assert.ok(seed.rows[0].slug && typeof seed.rows[0].R === 'number' && typeof seed.rows[0].ageDays === 'number');
  }
});
