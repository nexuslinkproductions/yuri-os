#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openMass, rankPool, poolTotal, categoryPools, whatIsUnfinished, staleness,
  navigateCentrality, DEFAULT_WEIGHTS, OPEN_PROCESS_TYPES,
} from './openprocess-pool.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const procs = [
  { id: 'p-fresh', type: 'task', title: 'fresh', state: 'active', evidence: [{ base: 0.9, age: 1, halfLife: 14 }], value: 0.5 },
  { id: 'p-stale', type: 'research', title: 'stale', state: 'open', evidence: [{ base: 0.8, age: 60, halfLife: 14 }], value: 0.8 },
  { id: 'p-closed', type: 'bug', title: 'done', state: 'closed', evidence: [{ base: 0.9, age: 2, halfLife: 14 }] },
  { id: 'p-blocked', type: 'experiment', title: 'blocked', state: 'blocked', dependencies: ['a', 'b', 'c'], evidence: [{ base: 0.7, age: 30, halfLife: 14 }], value: 0.9 },
];

// staleness: stale-but-open rises back into attention
ok(staleness(procs[1]) > staleness(procs[0]), 'stale evidence is MUCH more stale than fresh (rises into attention)');
ok(staleness({ id: 'x', evidence: [] }) === 1, 'a process with no evidence is maximally stale (1)');

// openMass terms present + the verify term SUBTRACTS (closed work loses mass)
const m = openMass(procs[2]);
ok('status' in m.terms && 'age' in m.terms && 'dep' in m.terms && 'risk' in m.terms && 'value' in m.terms && 'verify' in m.terms, 'openMass exposes all 6 OpenMass terms');
ok(m.terms.verify < 0, 'verified_closure_evidence SUBTRACTS mass (a closed process')

// ranking: blocked+valuable+stale tops; closed sinks below the open ones
const ranked = rankPool(procs);
ok(ranked[0].id === 'p-blocked', 'the blocked+deep+valuable+stale process has the highest open mass');
ok(ranked[ranked.length - 1].id === 'p-closed' && ranked[ranked.length - 1].mass < 0, 'the closed process has the lowest (negative) mass');
ok(ranked.every((x, i) => i === 0 || ranked[i - 1].mass >= x.mass), 'rankPool is sorted by mass desc');

// determinism
ok(JSON.stringify(rankPool(procs)) === JSON.stringify(rankPool(procs)), 'rankPool is deterministic');
const src = fs.readFileSync(path.join(__dirname, 'openprocess-pool.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic; ages carried on evidence)');

// pools + the operator question
ok(typeof poolTotal(procs) === 'number', 'poolTotal sums the open mass');
const cats = categoryPools(procs);
ok(OPEN_PROCESS_TYPES.includes('research') && typeof cats.research === 'number', 'categoryPools sums per type');
const unfinished = whatIsUnfinished(procs, { top: 5 });
ok(!unfinished.some((u) => u.id === 'p-closed'), 'whatIsUnfinished EXCLUDES closed processes');
ok(unfinished[0].id === 'p-blocked' && 'nextCandidateAction' in unfinished[0], 'whatIsUnfinished ranks open by mass + carries the next action');
ok(whatIsUnfinished(procs, { top: 0 }).length === 0, 'O-4: whatIsUnfinished honors explicit top:0');

// w_dep term is wired to yuri-navigate (the convergence: OpenProcess rides on navigate centrality)
const cof = await navigateCentrality();
const depTerm = openMass({ id: 'x', type: 'task', state: 'open', anchors: ['energy-fn'], evidence: [{ base: 0.5, age: 10, halfLife: 14 }] }, { centralityOf: cof }).terms.dep;
ok(depTerm > 0, 'the dependency-centrality term is wired to yuri-navigate (real centrality for an energy-fn anchor)');
ok(openMass({ id: 'y', type: 'task', state: 'open', anchors: [], evidence: [] }).terms.dep === 0, 'no centralityOf provided ⇒ dep term is honestly 0, not faked');

// malformed pool entries degrade per-row instead of crashing the whole organ
const invalidMass = openMass(null);
ok(invalidMass.invalid === true && invalidMass.mass === 0 && invalidMass.terms.status === 0, 'O-3: openMass(null) returns explicit zero-mass invalid row');
ok(rankPool([null, procs[0]]).length === 1 && rankPool([null, procs[0]])[0].id === 'p-fresh',
  'O-3: rankPool filters malformed entries instead of throwing');
ok(staleness({ id: 'bad-evidence', evidence: [null, 'x', { base: 1, age: 0, halfLife: 14 }] }) === 0,
  'O-3: staleness skips malformed evidence entries instead of throwing');

// weights are configurable
ok(DEFAULT_WEIGHTS.verify > DEFAULT_WEIGHTS.status, 'verified-closure is weighted to decisively reduce mass');

console.log(`\nopenprocess-pool.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
