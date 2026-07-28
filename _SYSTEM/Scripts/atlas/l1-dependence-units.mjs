#!/usr/bin/env node
// @capability: l1-dependence-units
// @serves: dependence unit for benchmark scoring | which directories split to file level | can two questions share a unit | drift check on the split set
// @does: holds the LOCKED L1 file-unit set as a frozen constant with provenance, resolves any path to its dependence unit, and flags when the corpus has drifted enough that a human must re-derive
// @use: any gate deciding whether two scored questions are independent, and in CI so the lock cannot silently go stale
// @exports: FILE_UNIT_DIRS, unitFor, checkDrift, main
// @tier: seam
// @couples: corpus provider — checkDrift(dirCounts, hasChildren) takes {dir -> direct file count} + a set of dirs having subdirectories; unitFor is pure
// @deps: none
//
// l1-dependence-units.mjs — the LOCK, and the thing that stops it going stale.
//
// WHY A SET AND NOT A THRESHOLD
// ---------------------------------------------------------------------------------------------
// The dependence unit for scored benchmark questions was originally going to be "one question per
// directory". That blinds the benchmark to _SYSTEM/Scripts (689 files, 16% of corpus), which is the
// densest mechanism neighbourhood and exactly where humans get stuck — a construct-validity failure
// against the HELP-WHEN-STUCK claim the navigation layer is built on.
//
// The repair (L1): a directory groups files only when it has structure beyond co-location. A FLAT
// directory of 689 siblings is a NAMESPACE, not a group; those files share a path prefix and
// nothing else. So oversized non-terminal directories split to per-file units.
//
// The threshold that identified them, T = max direct-file count among childless directories = 120,
// FAILED an adversarial stability test (Orion, 2026-07-28): T is set by ONE directory — a vendored
// retro-terminal shader pack — and leave-one-out halves it to 64, which would additionally split
// Scripts/math, alpha-factor-library, mure and state. A threshold riding on an asset dump is not a
// stable live input.
//
// But the DECISION is stable even though the FORMULA is not. Measured: the split set is invariant
// for T in [108, 126] — a 19-wide band, with the nominated 120 sitting 12 above the floor and 6
// below the ceiling. T=127 drops `reports`; T=107 adds `Scripts/math`.
//
// So the SET is locked and the threshold is demoted to provenance. Do not model the unstable
// quantity; constrain to the stable one.
//
// CHANGING THIS SET IS A HUMAN DECISION. checkDrift() never auto-updates it — it reports that the
// corpus has moved enough that someone must look. A lock with no re-derivation trigger is an inert
// marker with a date on it.

import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------
// THE LOCK
// ---------------------------------------------------------------------------------------------

export const FILE_UNIT_DIRS = Object.freeze([
  '_SYSTEM/Scripts',
  '02_RESOURCES/RESEARCH',
  '_SYSTEM/reports',
]);

// THE LANDMARK — the authoritative derivation. Read the REJECTED one below before changing this.
export const LANDMARK_DIR = '_SYSTEM/Scripts/math';

export const LOCK_PROVENANCE = Object.freeze({
  lockedOn: '2026-07-28 corpus snapshot',

  // AUTHORITATIVE DERIVATION (Orion, 2026-07-28):
  //   FILE-UNIT := non-terminal directories holding MORE direct files than the largest
  //                authored mechanism neighbourhood under _SYSTEM/Scripts.
  // The landmark is _SYSTEM/Scripts/math at 108 files, code ratio 0.991 — unambiguously an
  // authored library. The rule says: a namespace bigger than our biggest real code grouping is
  // not a grouping. Verified to yield EXACTLY the locked set.
  derivation: 'non-terminal dirs with direct_files > |_SYSTEM/Scripts/math| (108 at freeze)',
  landmarkDir: '_SYSTEM/Scripts/math',
  landmarkCountAtFreeze: 108,
  landmarkCharacter: 'code ratio 0.991 — an authored mechanism library, not a dump',

  // WHY THE SET IS THESE THREE, in character terms rather than size terms:
  //   RESEARCH code ratio 0.008 · reports 0.000 · Scripts/math 0.991
  // The rule file-units the DUMPS and preserves the CODE LIBRARY, which is what HELP-WHEN-STUCK
  // actually needs. That is a stronger justification than "these were the biggest".
  memberCharacter: { '02_RESOURCES/RESEARCH': 0.008, '_SYSTEM/reports': 0.000, '_SYSTEM/Scripts': 'mixed, uniquely forced at 689' },
  memberCounts: { '_SYSTEM/Scripts': 689, '02_RESOURCES/RESEARCH': 132, '_SYSTEM/reports': 127 },

  // REJECTED DERIVATION — kept deliberately, because a discarded reason is evidence too.
  //   "T = max direct-file count among childless dirs = 120", setter
  //   _SYSTEM/Presets/skins/retro-source/app/shaders (a vendored shader asset pack).
  // FAILED adversarial stability (Orion T2): leave-one-out halves T to 64, which would
  // additionally split Scripts/math, alpha-factor-library, mure and state. Freezing the OUTPUT of
  // a shader-contingent discovery and calling it stable is a launder with a date on it — which is
  // precisely why the provenance had to be re-derived from a landmark that is not a vendored dump.
  rejectedDerivation: 'T = max(childless direct-file count) = 120, set by a vendored shader pack — FAILED leave-one-out stability',

  invariantBandAtFreeze: [108, 126],
  adversarialRuling: 'T1 PASS · T2 FAIL · T3 MIXED · T4 PASS -> threshold demoted, SET locked, provenance re-derived from the math landmark',
});

// ---------------------------------------------------------------------------------------------
// PURE — resolve a path to its dependence unit
// ---------------------------------------------------------------------------------------------

/**
 * The unit two scored questions must NOT share.
 * Inside a file-unit dir -> the file itself. Anywhere else -> its directory.
 * Note the directory test is EXACT, not prefix: _SYSTEM/Scripts/math is its own group and must not
 * be shredded just because it sits under a split namespace.
 */
export function unitFor(repoRelPath) {
  const norm = String(repoRelPath).replace(/^\.\//, '');
  const dir = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '.';
  return FILE_UNIT_DIRS.includes(dir) ? norm : dir;
}

/** Convenience for gates: may these two answers both appear in one scored set? */
export function independentUnits(pathA, pathB) {
  return unitFor(pathA) !== unitFor(pathB);
}

// ---------------------------------------------------------------------------------------------
// DRIFT — surfaces that a human decision is due. NEVER updates the set.
// ---------------------------------------------------------------------------------------------

/**
 * dirCounts:   { [dir]: directFileCount }
 * hasChildren: Set of dirs that contain subdirectories
 * Flags when the locked set is no longer the set this corpus would produce.
 */
export function checkDrift(dirCounts, hasChildren) {
  const findings = [];

  // THE DETECTOR IS THE DERIVATION. Rather than hardcoding the freeze-date band edges and asking
  // "has anything crossed them", we RE-RUN the recorded rule against the live corpus and ask
  // "would this corpus still produce the locked set?"
  //
  // This closes four silent failure modes measured against the hardcoded-band version (Orion,
  // 2026-07-28): a newcomer at exactly the ceiling slipped an off-by-one; two newcomers just under
  // the ceiling collapsed the band to width 2 with no flag; interior erosion went unseen. It also
  // removes two invented free parameters (a minimum band width and a growth delta), each of which
  // would have been its own fraud surface. The rule that justifies the lock is the rule that
  // audits it — they cannot drift apart because they are the same computation.
  const landmark = dirCounts[LANDMARK_DIR];

  if (landmark === undefined) {
    findings.push({
      kind: 'LANDMARK_VANISHED',
      dir: LANDMARK_DIR,
      why: `the derivation landmark no longer exists in the corpus. The rule that produced this set cannot be evaluated, so the lock is unverifiable rather than merely stale.`,
    });
    return { drifted: true, findings, lockedSet: [...FILE_UNIT_DIRS], landmark: null, derivedSet: null, action: HUMAN_ACTION };
  }

  // Re-derive from scratch under the recorded rule.
  const derivedSet = Object.entries(dirCounts)
    .filter(([dir, count]) => hasChildren.has(dir) && count > landmark)
    .map(([dir]) => dir)
    .sort();
  const locked = [...FILE_UNIT_DIRS].sort();

  for (const dir of derivedSet) {
    if (!locked.includes(dir)) {
      findings.push({
        kind: 'SHOULD_BE_FILE_UNIT',
        dir,
        count: dirCounts[dir],
        why: `holds ${dirCounts[dir]} direct files, more than the landmark ${LANDMARK_DIR} (${landmark}), so the recorded rule would file-unit it — but it is not in the locked set and is being scored as ONE dependence unit.`,
      });
    }
  }
  for (const dir of locked) {
    if (!derivedSet.includes(dir)) {
      findings.push({
        kind: 'SHOULD_NOT_BE_FILE_UNIT',
        dir,
        count: dirCounts[dir] ?? 0,
        why: `holds ${dirCounts[dir] ?? 0} direct files, no longer above the landmark ${LANDMARK_DIR} (${landmark}), so the recorded rule would treat it as one group — but it is locked as a file-unit namespace.`,
      });
    }
  }

  // ADVISORY, never a flag: how much headroom before the nearest non-member qualifies. Reported so
  // approaching drift is visible early, WITHOUT inventing a threshold on it.
  // The landmark is the reference point, not a candidate — including it would report headroom 0
  // forever and make this advisory useless. (Caught by its own test, 2026-07-28.)
  const outside = Object.entries(dirCounts)
    .filter(([dir, c]) => hasChildren.has(dir) && !locked.includes(dir) && dir !== LANDMARK_DIR && c <= landmark)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    drifted: findings.length > 0,
    findings,
    lockedSet: locked,
    landmark: { dir: LANDMARK_DIR, count: landmark, atFreeze: LOCK_PROVENANCE.landmarkCountAtFreeze },
    derivedSet,
    headroom: outside ? { dir: outside[0], count: outside[1], gapToLandmark: landmark - outside[1] } : null,
    action: findings.length ? HUMAN_ACTION : 'lock still matches what the recorded rule produces on this corpus',
  };
}

const HUMAN_ACTION = 'HUMAN RE-DERIVATION DUE — re-run the derivation, decide the set, update the lock in this file with an explicit commit. This check NEVER auto-updates.';

// ---------------------------------------------------------------------------------------------

function selfTest() {
  let pass = 0, fail = 0;
  const check = (n, ok) => { if (ok) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}`); } };

  // THE DISTINGUISHING PROBES — these are what separate L1 from the naive dirname rule.
  check('two files in a mega-namespace are DIFFERENT units (naive rule would collapse them)',
    independentUnits('_SYSTEM/Scripts/xref-query.mjs', '_SYSTEM/Scripts/atlas-score.mjs'));
  check('two files in a normal leaf are the SAME unit',
    !independentUnits('_SYSTEM/Scripts/voice/a.mjs', '_SYSTEM/Scripts/voice/b.mjs'));

  // The exact-match test: a genuine group nested under a split namespace must survive intact.
  check('Scripts/math is NOT shredded by Scripts being a file-unit dir (exact dir match, not prefix)',
    unitFor('_SYSTEM/Scripts/math/x.mjs') === '_SYSTEM/Scripts/math');
  check('a file directly in Scripts IS its own unit',
    unitFor('_SYSTEM/Scripts/x.mjs') === '_SYSTEM/Scripts/x.mjs');

  // Drift detection — observed firing, not assumed.
  const clean = { '_SYSTEM/Scripts': 689, '02_RESOURCES/RESEARCH': 132, '_SYSTEM/reports': 127, '_SYSTEM/Scripts/math': 108 };
  const kids = new Set(['_SYSTEM/Scripts', '02_RESOURCES/RESEARCH', '_SYSTEM/reports', '_SYSTEM/Scripts/math']);
  check('no drift on the corpus the lock was derived from', !checkDrift(clean, kids).drifted);

  const grown = { ...clean, '_SYSTEM/newthing': 200 };
  const grownKids = new Set([...kids, '_SYSTEM/newthing']);
  const d1 = checkDrift(grown, grownKids);
  check('DETECTS a new mega-namespace', d1.drifted && d1.findings[0].kind === 'SHOULD_BE_FILE_UNIT');

  const shrunk = { ...clean, '_SYSTEM/reports': 40 };
  const d2 = checkDrift(shrunk, kids);
  check('DETECTS a member falling below the landmark', d2.drifted && d2.findings[0].kind === 'SHOULD_NOT_BE_FILE_UNIT');

  // A terminal directory is a group no matter how large — it must not trip the detector.
  const bigTerminal = { ...clean, '_SYSTEM/assets/pack': 400 };
  check('a large TERMINAL dir does NOT trip drift (terminals are groups by construction)',
    !checkDrift(bigTerminal, kids).drifted);

  check('drift never mutates the locked set',
    checkDrift(grown, grownKids).lockedSet.length === 3 && FILE_UNIT_DIRS.length === 3);

  // ---- THE FOUR HOLES ORION MEASURED IN THE HARDCODED-BAND VERSION ----
  // Each of these returned NO FLAG under the old 108/126 edge-crossing form. Kept as named
  // regression probes so a future edit back toward hardcoded edges fails loudly.

  const atCeiling = { ...clean, '_SYSTEM/edge': 126 };
  check('HOLE 3 closed — newcomer at exactly the old ceiling (126) now flags (off-by-one)',
    checkDrift(atCeiling, new Set([...kids, '_SYSTEM/edge'])).drifted);

  const twoJustUnder = { ...clean, '_SYSTEM/n1': 125, '_SYSTEM/n2': 125 };
  check('HOLE 2 closed — two newcomers just under the old ceiling now flag',
    checkDrift(twoJustUnder, new Set([...kids, '_SYSTEM/n1', '_SYSTEM/n2'])).drifted);

  // Holes 1 and 4 are RESOLVED BY THE RULE CHANGE rather than by a new trigger, and the tests
  // assert the new intended semantics rather than the old complaint:
  const mathGrown = { ...clean, '_SYSTEM/Scripts/math': 125 };
  const dm = checkDrift(mathGrown, kids);
  check('HOLE 1 reframed — landmark growth is not drift while the set is unchanged (math defines the floor, so it can never join)',
    !dm.drifted && dm.landmark.count === 125);

  const reportsShrunkInBand = { ...clean, '_SYSTEM/reports': 110 };
  check('HOLE 4 reframed — a member still above the landmark stays a namespace under the recorded rule',
    !checkDrift(reportsShrunkInBand, kids).drifted);

  const mathHuge = { ...clean, '_SYSTEM/Scripts/math': 700 };
  const dh = checkDrift(mathHuge, kids);
  check('landmark overtaking the set empties the derived set and flags every member',
    dh.drifted && dh.findings.length === 3);

  const noLandmark = { '_SYSTEM/Scripts': 689, '02_RESOURCES/RESEARCH': 132, '_SYSTEM/reports': 127 };
  check('DETECTS the landmark vanishing — lock becomes unverifiable, not merely stale',
    checkDrift(noLandmark, kids).findings[0].kind === 'LANDMARK_VANISHED');

  check('reports headroom to the nearest non-member without gating on it',
    checkDrift({ ...clean, '_SYSTEM/close': 100 }, new Set([...kids, '_SYSTEM/close'])).headroom.gapToLandmark === 8);

  console.log(`\nSELF-TEST: ${pass}/${pass + fail} passed`);
  return fail === 0;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;
  console.log('L1 dependence units — LOCKED SET (threshold demoted to provenance)');
  for (const d of FILE_UNIT_DIRS) console.log(`  file-unit: ${d}  (${LOCK_PROVENANCE.memberCounts[d]} direct files)`);
  console.log(`  every other directory is ONE unit`);
  console.log(`\n  invariant band: T in [${BAND_FLOOR}, ${BAND_CEIL}] all produce this set`);
  console.log(`  derivation:     ${LOCK_PROVENANCE.derivation}`);
  console.log(`  setter:         ${LOCK_PROVENANCE.setterPath}`);
  console.log(`  caveat:         ${LOCK_PROVENANCE.setterCaveat}`);
  console.log(`  ruling:         ${LOCK_PROVENANCE.adversarialRuling}`);
  console.log('\n  Drift is checked by checkDrift(dirCounts, hasChildren) against a live corpus scan.');
  console.log('  It NEVER auto-updates. Changing the set is a human decision with an explicit commit.');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
