#!/usr/bin/env node
/**
 * yuri-match-adapters.test.mjs — focused contract test for universal matcher corpus adapters.
 */
import {
  MAX_TEXT_CHARS,
  PROTECTED_PREFIXES,
  allAdapters,
  codeAdapter,
  docAdapter,
  graphAdapter,
  isProtectedRel,
  memoryAdapter,
  protectedSkips,
  skillAdapter,
} from './yuri-match-adapters.mjs';

let pass = 0, fail = 0;
const counts = {};
const ok = (cond, name) => { if (cond) pass += 1; else { fail += 1; console.log(`  FAIL ${name}`); } };

function protectedPatternFound(value) {
  const s = String(value || '');
  return PROTECTED_PREFIXES.some((p) => {
    if (p === '.env') return /(^|[\s"'`=:/])\.env($|[\s"'`:/])/.test(s);
    const bare = p.replace(/\/$/, '');
    return s.includes(p) || s.includes(`${bare}/`);
  });
}

function checkRecords(name, records) {
  counts[name] = records.length;
  ok(Array.isArray(records), `${name}: returns an array`);
  ok(records.length > 0, `${name}: non-empty`);
  const ids = new Set(records.map((r) => r.id));
  ok(ids.size === records.length, `${name}: unique ids`);
  ok(records.every((r) => r && typeof r.id === 'string' && r.id.length > 0), `${name}: every id is non-empty string`);
  ok(records.every((r) => typeof r.text === 'string' && r.text.length > 0), `${name}: every text is non-empty string`);
  ok(records.every((r) => r.text.length <= MAX_TEXT_CHARS), `${name}: text clipped to ${MAX_TEXT_CHARS}`);
  ok(records.every((r) => !isProtectedRel(r.id)), `${name}: no protected ids`);
  ok(records.every((r) => !protectedPatternFound(r.id) && !protectedPatternFound(r.text)), `${name}: no protected path strings`);
}

const surfaces = {
  code: codeAdapter(),
  graph: graphAdapter(),
  skills: skillAdapter(),
  memory: memoryAdapter(),
  docs: docAdapter(),
};

for (const [name, records] of Object.entries(surfaces)) checkRecords(name, records);

const registry = allAdapters();
const expected = ['code', 'graph', 'skills', 'memory', 'docs'];
ok(expected.every((name) => typeof registry[name] === 'function'), 'allAdapters maps every required surface');
ok(Object.keys(registry).sort().join(',') === expected.sort().join(','), 'allAdapters has only required surfaces');

// Explicitly exercise protected opt-in behavior: Track-B defaults are skipped, and a protected
// opt-in root records a skip rather than reading owner-private content.
const beforeSkips = protectedSkips.length;
const trackB = memoryAdapter({ trackBRoot: '.claude/projects/example/memory' });
ok(trackB.every((r) => !isProtectedRel(r.id)), 'memoryAdapter protected Track-B opt-in still skips protected ids');
ok(protectedSkips.length > beforeSkips, 'memoryAdapter records protected Track-B skip');
const beforeDbSkips = protectedSkips.length;
ok(docAdapter({ dbPath: '.env' }).length === 0, 'docAdapter skips protected custom db path');
ok(protectedSkips.length > beforeDbSkips, 'docAdapter records protected custom db skip');

console.log(`\nyuri-match-adapters.test: ${pass} passed, ${fail} failed`);
console.log(JSON.stringify({ counts, protectedSkips: protectedSkips.length }, null, 2));
process.exitCode = fail === 0 ? 0 : 1;
