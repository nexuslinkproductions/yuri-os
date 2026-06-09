#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoveryPrecisionGate, withNavigate } from './discovery-precision-gate.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const substrate = { allowedPaths: ['_SYSTEM/Scripts/math', '02_RESOURCES/RESEARCH'], deniedPaths: ['_SYSTEM/Scripts/secret'] };

// in-scope claim → pass
const clean = discoveryPrecisionGate({ id: 'c1', paths: ['_SYSTEM/Scripts/math/formula-foundry.mjs'], discoveryFootprint: ['_SYSTEM/Scripts/math/formula-foundry.mjs', '02_RESOURCES/RESEARCH/spec.md'] }, substrate);
ok(clean.pass === true && clean.vetoes.length === 0, 'an in-scope claim passes with no vetoes');
ok(clean.precisionScore === 1, 'precision is 1 when the whole footprint stayed in scope');

// protected-path reference → hard veto (BEFORE the energy gate)
const prot = discoveryPrecisionGate({ id: 'c2', paths: ['.env'], discoveryFootprint: ['.env'] }, substrate);
ok(prot.pass === false && prot.vetoes.some((v) => v.reason === 'protected-path'), 'a protected-path claim is VETOED');

// out-of-allowed-scope → veto
const oos = discoveryPrecisionGate({ id: 'c3', paths: ['01_PROJECTS/random/file.ts'] }, substrate);
ok(oos.pass === false && oos.vetoes.some((v) => v.reason === 'out-of-allowed-scope'), 'an out-of-scope claim is vetoed');
const malformedPath = discoveryPrecisionGate({ id: 'd2', paths: [123, null, {}], discoveryFootprint: [null] }, substrate);
ok(malformedPath.pass === false && malformedPath.vetoes.length > 0,
  'D-2: malformed claim path entries produce a verdict instead of throwing');
const stringSubstrate = discoveryPrecisionGate({ id: 'd3', paths: ['_SYSTEM/Scripts/math/x.mjs'] }, { allowedPaths: '_SYSTEM/Scripts/math' });
ok(stringSubstrate.pass === true,
  'D-3: string allowedPaths is normalized to a one-item array instead of crashing');
const siblingScope = discoveryPrecisionGate({ id: 'd4', paths: ['_SYSTEM/Scripts/mathEVIL.mjs'] }, substrate);
ok(siblingScope.pass === false && siblingScope.vetoes.some((v) => v.reason === 'out-of-allowed-scope'),
  'D-4: allowed scope uses component boundaries, not bare prefix matching');

// denied path → veto
const den = discoveryPrecisionGate({ id: 'c4', paths: ['_SYSTEM/Scripts/secret/keys.mjs'] }, substrate);
ok(den.pass === false && den.vetoes.some((v) => v.reason === 'denied-path'), 'a denied-path claim is vetoed');
const deniedSibling = discoveryPrecisionGate(
  { id: 'd5', paths: ['_SYSTEM/Scripts/secretkeys.mjs'], discoveryFootprint: ['_SYSTEM/Scripts/secretkeys.mjs'] },
  { deniedPaths: ['_SYSTEM/Scripts/secret'] },
);
ok(deniedSibling.pass === true && deniedSibling.precisionScore === 1 && !deniedSibling.vetoes.some((v) => v.reason === 'denied-path'),
  'D-5: denied paths use component boundaries, not bare prefix matching');

// precision: a lane that wandered out of scope scores < 1
const wander = discoveryPrecisionGate({ id: 'c5', discoveryFootprint: ['_SYSTEM/Scripts/math/ok.mjs', '01_PROJECTS/elsewhere.ts'] }, substrate);
ok(wander.precisionScore === 0.5, 'precision drops when the footprint wanders out of granted scope (0.5)');
const traversalFootprint = discoveryPrecisionGate({ id: 'd7', discoveryFootprint: ['_SYSTEM/Scripts/math/../../../.env'] }, substrate);
ok(traversalFootprint.pass === false && traversalFootprint.precisionScore === 0 && traversalFootprint.vetoes.some((v) => v.reason === 'protected-path'),
  'D-7: traversal footprint is canonicalized before precision scoring');
const emptyFootprint = discoveryPrecisionGate({ id: 'd6', paths: ['01_PROJECTS/evil.ts'], discoveryFootprint: [] }, substrate);
ok(emptyFootprint.precisionScore === 0 && emptyFootprint.precisionBasis === 'referenced-paths' && emptyFootprint.precisionNotes.includes('no-footprint-declared'),
  'D-6: empty footprint cannot claim perfect precision when referenced paths are out of scope');

// no scope declared ⇒ unrestricted (caller's choice), still vetoes protected
const noScope = discoveryPrecisionGate({ id: 'c6', paths: ['anywhere/file.mjs', '.env'] }, {});
ok(noScope.vetoes.length === 1 && noScope.vetoes[0].reason === 'protected-path', 'no allowedPaths ⇒ unrestricted, but protected still vetoes');

// determinism + no RNG/clock
ok(JSON.stringify(discoveryPrecisionGate({ id: 'c1', paths: ['a/b'] }, substrate)) === JSON.stringify(discoveryPrecisionGate({ id: 'c1', paths: ['a/b'] }, substrate)), 'deterministic');
const src = fs.readFileSync(path.join(__dirname, 'discovery-precision-gate.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic)');

// impact term rides on yuri-navigate (real blast radius for a real graph target)
const navd = await withNavigate({ id: 'c7', paths: ['_SYSTEM/Scripts/math/math-kernel.mjs'], targets: ['math-kernel'] }, substrate);
ok(navd.impact.available === true && navd.impact.maxImpact > 0, 'impact term wired to yuri-navigate (math-kernel has real blast radius)');
ok(navd.advisory_only === true && navd.local_truth_claim === false, 'verdict is advisory (a pre-filter, not a truth claim)');

// F2: a './'-prefixed in-scope path is handled (normalize both sides in underPrefix; no false out-of-scope veto).
const f2 = discoveryPrecisionGate({ id: 'f2', paths: ['./_SYSTEM/Scripts/math/formula-foundry.mjs'] }, substrate);
ok(f2.pass === true && f2.vetoes.length === 0, 'F2: "./"-prefixed in-scope path matches the allowed prefix');
// F3: an escaping scope-config path is SURFACED as a scopeWarning, not silently swallowed into a no-op prefix.
const f3 = discoveryPrecisionGate({ id: 'f3', paths: ['_SYSTEM/Scripts/math/x.mjs'] }, { allowedPaths: ['../escape'] });
ok(Array.isArray(f3.scopeWarnings) && f3.scopeWarnings.some((w) => w.reason === 'escapes-repo'),
  'F3: an escaping scope path surfaces as a scopeWarning (config error not swallowed)');

console.log(`\ndiscovery-precision-gate.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
