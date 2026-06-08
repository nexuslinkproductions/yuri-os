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

// denied path → veto
const den = discoveryPrecisionGate({ id: 'c4', paths: ['_SYSTEM/Scripts/secret/keys.mjs'] }, substrate);
ok(den.pass === false && den.vetoes.some((v) => v.reason === 'denied-path'), 'a denied-path claim is vetoed');

// precision: a lane that wandered out of scope scores < 1
const wander = discoveryPrecisionGate({ id: 'c5', discoveryFootprint: ['_SYSTEM/Scripts/math/ok.mjs', '01_PROJECTS/elsewhere.ts'] }, substrate);
ok(wander.precisionScore === 0.5, 'precision drops when the footprint wanders out of granted scope (0.5)');

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

console.log(`\ndiscovery-precision-gate.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
