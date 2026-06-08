#!/usr/bin/env node
import {
  canonicalize, parseCanonical, parseCodeId, isProtectedPath, normalizePath, memStem,
  loadRecords, loadGraphRaw, EXTENDED_PROTECTED_PREFIXES,
} from './yuri-id-bridge.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

// --- canonical id: surface::localId, split on FIRST '::' ---
ok(canonicalize('code', '_SYSTEM/x.mjs:computeU') === 'code::_SYSTEM/x.mjs:computeU', 'canonicalize code id');
const pc = parseCanonical('code::_SYSTEM/x.mjs:computeU');
ok(pc.surface === 'code' && pc.localId === '_SYSTEM/x.mjs:computeU', 'parseCanonical splits on first :: (localId keeps single colons)');
ok(parseCanonical('graph::energy-fn').localId === 'energy-fn', 'parseCanonical graph slug');

// --- the verified collision: doc path vs code module (trailing :) vs mem, disambiguated by surface ---
const docId = canonicalize('doc', '_SYSTEM/x.mjs');
const codeModId = canonicalize('code', '_SYSTEM/x.mjs:');
ok(docId !== codeModId, 'surface prefix disambiguates doc path vs code module collision');

// --- parseCodeId: split on first ':', test/module/symbol disambiguation ---
ok(parseCodeId('_SYSTEM/a.mjs:fn').kind === 'symbol', 'parseCodeId symbol');
ok(parseCodeId('_SYSTEM/a.mjs:').kind === 'module', 'parseCodeId module (empty symbol)');
ok(parseCodeId('_SYSTEM/a.test.mjs:').kind === 'test', 'parseCodeId test (.test.mjs)');
ok(parseCodeId('_SYSTEM/a.mjs:obj:weird').symbol === 'obj:weird', 'parseCodeId keeps colons after the first in symbol');

// --- mem stem (NOT frontmatter name) + prefix expansion ---
ok(memStem('feedback-foo.md') === 'feedback-foo', 'memStem strips .md');
ok(memStem('fb-foo') === 'feedback-foo', 'memStem expands fb- prefix to feedback-');

// --- EXTENDED protected veto: must catch the 3 the inherited 4-prefix set misses ---
ok(isProtectedPath('.claude/projects/abc/memory/x.md'), 'EXTENDED veto catches .claude/projects/*/memory (inherited set MISSES this)');
ok(isProtectedPath('.claude/file-history/x'), 'EXTENDED veto catches .claude/file-history');
ok(isProtectedPath('node_modules/x'), 'EXTENDED veto catches node_modules');
ok(isProtectedPath('.amp/x'), 'EXTENDED veto catches .amp');
ok(isProtectedPath('.claude/state/cortex-state.json'), 'EXTENDED veto catches .claude/state');
ok(!isProtectedPath('_SYSTEM/Scripts/yuri-energy.mjs'), 'a normal source path is NOT vetoed');
// mutation-test: the inherited incomplete set would MISS .claude/projects — prove the extension is load-bearing
const INHERITED = ['backend/data/', '.claude/state/', '.claude/history/', '.env'];
const inheritedMisses = !INHERITED.some((p) => '.claude/projects/abc/memory/x.md'.startsWith(p));
ok(inheritedMisses && isProtectedPath('.claude/projects/abc/memory/x.md'), 'the inherited set would leak .claude/projects/*/memory; the EXTENDED set plugs it');
ok(EXTENDED_PROTECTED_PREFIXES.length === 8, 'EXTENDED prefix set has all 8 entries');

// --- loadRecords (graph surface): 108 nodes, phantom flagged, protected files stripped, spine many-to-many ---
const { records, byCanonicalId, fileToNodes } = loadRecords({ surfaces: ['graph'] });
const graphNodeCount = loadGraphRaw().nodes.length;
ok(records.length === graphNodeCount, `graph surface records mirror graph nodes (${records.length} === ${graphNodeCount})`);
ok(records.length >= 108, `graph has at least the verified 108 nodes (got ${records.length})`);
ok(records.every((r, i) => i === 0 || records[i - 1].canonicalId.localeCompare(r.canonicalId) <= 0), 'records are canonicalId-sorted (determinism)');
const phantom = records.filter((r) => r.phantom);
ok(phantom.length === 1 && phantom[0].canonicalId === 'graph::cross-domain-transfer-engine', 'the 1 phantom node (empty files) is flagged, not dropped');
ok(phantom[0].files.length === 0, 'phantom node has no spine entry');
// cortex-state node owned a protected file — it must be stripped from the record
const cortex = byCanonicalId.get('graph::cortex-state');
ok(cortex && cortex.files.every((f) => !isProtectedPath(f)), 'cortex-state node carries no protected file (.claude/state stripped)');
ok(cortex && cortex.protected === true, 'cortex-state flagged protected (it owned a now-stripped protected file)');
// file-spine many-to-many (verified: memory-kernel.mjs owned by 2 nodes)
const mk = fileToNodes.get('_SYSTEM/Scripts/memory-kernel.mjs');
ok(mk && mk.length === 2, `memory-kernel.mjs is multi-owned (2 nodes), got ${mk ? mk.length : 0}`);
ok(mk && mk.every((id, i) => i === 0 || mk[i - 1].localeCompare(id) <= 0), 'fileToNodes values are sorted');
// naive id-equality join (slug vs rel:symbol) yields ZERO — proving the spine is necessary
const naiveMatch = records.some((r) => r.localId === '_SYSTEM/Scripts/math/yuri-energy.mjs:computeU');
ok(!naiveMatch, 'graph slug ids never equal a code rel:symbol id (the headline namespace split)');

console.log(`\nyuri-id-bridge.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
