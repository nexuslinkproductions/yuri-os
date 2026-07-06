#!/usr/bin/env node
/** math-register-guard.test.mjs — pure decision + helper asserts (no stdin/disk). */
import { decide, exemptReason, isRegistered } from './math-register-guard.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

const MATH = '_SYSTEM/Scripts/math/new-thing.mjs';
const base = '{"filenameExemptions":{"rules":[]},"pathExemptions":{"rules":[]}}';

// scope gating
ok(decide({ tool: 'Read', fileRel: MATH, contractTxt: base, manualTxt: '', graphTxt: '' }).action === 'allow', 'allow: non-Write/Edit tool');
ok(decide({ tool: 'Write', fileRel: 'README.md', contractTxt: base, manualTxt: '', graphTxt: '' }).action === 'allow', 'allow: non-math file');
ok(decide({ tool: 'Write', fileRel: '_SYSTEM/Scripts/math/new-thing.test.mjs', contractTxt: base, manualTxt: '', graphTxt: '' }).action === 'allow', 'allow: math test file');

// the core gate
ok(decide({ tool: 'Write', fileRel: MATH, contractTxt: base, manualTxt: '', graphTxt: '{"nodes":[]}' }).action === 'deny', 'DENY: unregistered new math module');
ok(decide({ tool: 'Edit', fileRel: MATH, contractTxt: base, manualTxt: 'see new-thing.mjs here', graphTxt: '{"nodes":[]}' }).action === 'allow', 'allow: registered in manual (by basename)');
ok(decide({ tool: 'Write', fileRel: MATH, contractTxt: base, manualTxt: '', graphTxt: JSON.stringify({ nodes: [{ files: [MATH] }] }) }).action === 'allow', 'allow: registered in graph (files[])');

// exemption
const exC = JSON.stringify({ filenameExemptions: { rules: [{ match: 'new-thing\\.mjs$', reason: 'scratch' }] }, pathExemptions: { rules: [] } });
ok(decide({ tool: 'Write', fileRel: MATH, contractTxt: exC, manualTxt: '', graphTxt: '{"nodes":[]}' }).action === 'allow', 'allow: contract-exempted');

// helpers
ok(exemptReason('_SYSTEM/Scripts/math/x.mjs', JSON.stringify({ pathExemptions: { rules: [{ path: '_SYSTEM/Scripts/math/x.mjs', reason: 'r' }] } })) === 'r', 'exemptReason: path match');
ok(exemptReason('a.mjs', JSON.stringify({ filenameExemptions: { rules: [{ match: '[', reason: 'bad' }] } })) === null, 'exemptReason: invalid regex fails closed (no throw)');
ok(isRegistered('x.mjs', '_SYSTEM/Scripts/math/x.mjs', 'mentions x.mjs', '{}') === true, 'isRegistered: manual basename');
ok(isRegistered('x.mjs', '_SYSTEM/Scripts/math/x.mjs', '', '{"nodes":[{"files":["_SYSTEM/Scripts/math/x.mjs"]}]}') === true, 'isRegistered: graph files');
ok(isRegistered('x.mjs', '_SYSTEM/Scripts/math/x.mjs', '', '{"nodes":[]}') === false, 'isRegistered: neither');

console.log(`math-register-guard.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
