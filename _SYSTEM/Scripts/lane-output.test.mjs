#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneOutfile, isWithinLaneOutput, laneOutputRoot } from './lane-output.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// laneOutfile resolves + ensures the categorized dir, returns the outfile path inside it
const out = laneOutfile({ lane: 'codex', task: 'enforcement test', operation: 'fix', outputType: 'diff', file: 'r.json' });
ok(out.includes('_SYSTEM/lane-output/codex/enforcement-test/fix/diff/r.json'), `laneOutfile categorized path [${out.split('/lane-output/')[1]}]`);
ok(fs.existsSync(out.replace(/\/r\.json$/, '')), 'laneOutfile ensures the directory exists');

// confinement: a path inside the lane output is within; a live-tree path is NOT
ok(isWithinLaneOutput(out, { lane: 'codex', task: 'enforcement test', operation: 'fix', outputType: 'diff' }) === true, 'a path inside the lane output is confined-OK');
ok(isWithinLaneOutput(path.join(REPO, '_SYSTEM/Scripts/yuri-decode.mjs'), { lane: 'codex', task: 'enforcement test', operation: 'fix', outputType: 'diff' }) === false, 'a LIVE-tree path is NOT within the lane output (boundary held)');
// a sibling-prefix path must not be falsely confined (component boundary)
ok(isWithinLaneOutput(laneOutputRoot() + '-evil/x', { lane: 'codex', task: 't', operation: 'fix', outputType: 'diff' }) === false, 'sibling-prefix path is not falsely confined');

ok(laneOutputRoot().endsWith('_SYSTEM/lane-output'), 'laneOutputRoot points at the staging root');

console.log(`\nlane-output.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
