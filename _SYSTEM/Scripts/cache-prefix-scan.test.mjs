#!/usr/bin/env node
/**
 * cache-prefix-scan.test.mjs — detects planted volatile tokens, warns, NEVER mutates the prefix.
 * Run: node _SYSTEM/Scripts/cache-prefix-scan.test.mjs
 * SECRET-SAFE: every fixture token is synthetic. NO real-prefix secrets (no sk-/AKIA/AIza/ghp_/nvapi-).
 */
import { scanPrefix, VOLATILE_PATTERNS, LANE_RESULT_LABEL, redact } from './cache-prefix-scan.mjs';
import { parseResultLabel } from './contract-conformance.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

// ── synthetic, secret-safe fixtures (none use a real token prefix) ──
const UUID = '550e8400-e29b-41d4-a716-446655440000';                    // RFC-4122 nil-ish synthetic
const ISO = '2026-06-13T18:42:07Z';                                     // synthetic ISO timestamp
const EPOCH = '1718304127000';                                          // 13-digit ms epoch (synthetic)
const HEXHASH = 'deadbeefcafef00d0123456789abcdef0123456789abcdef';     // 48-char bare hex (synthetic sha-shape)
// JWT STRUCTURE only — three base64url segments. Decodes to nothing sensitive; never a real credential.
const JWT = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0LW9ubHkifQ.c2lnbmF0dXJlLXBsYWNlaG9sZGVy';

// ── clean prefix → no findings, still a successful lane (X) ──
const cleanPrefix = 'You are the YURI Claude lane. Follow the stable contract.\nNo volatile tokens here.';
const clean = scanPrefix(cleanPrefix);
ok(clean.clean === true && clean.count === 0, 'clean prefix: zero findings');
ok(clean.prefix === cleanPrefix, 'clean prefix: returned byte-for-byte unchanged');
ok(clean.label === LANE_RESULT_LABEL, 'clean prefix: still emits the canonical label (lane RAN ok)');

// ── each volatile class is detected ──
const cases = [
  { name: 'uuid', text: `header\nrequest-id: ${UUID}\nbody`, cls: 'uuid' },
  { name: 'iso-ts', text: `generated at ${ISO} then more`, cls: 'iso-ts' },
  { name: 'epoch-ms', text: `ts=${EPOCH} in the preamble`, cls: 'epoch-ms' },
  { name: 'hex-hash', text: `commit ${HEXHASH} pinned`, cls: 'hex-hash' },
  { name: 'jwt', text: `auth: ${JWT} leaked`, cls: 'jwt' },
];
for (const c of cases) {
  const r = scanPrefix(c.text);
  ok(r.leaked === true, `detects ${c.name}: leaked=true`);
  ok(r.findings.some((f) => f.cls === c.cls), `detects ${c.name}: finding has class ${c.cls}`);
  ok(r.prefix === c.text, `${c.name}: prefix returned UNCHANGED (no mutation)`);
}

// ── NEVER MUTATES: scan a token-heavy prefix, assert byte-identical return ──
const dirty = `id=${UUID} time=${ISO} sha=${HEXHASH} jwt=${JWT} epoch=${EPOCH}`;
const before = dirty;
const rd = scanPrefix(dirty);
ok(rd.prefix === before, 'INVARIANT: token-heavy prefix returned byte-for-byte unchanged');
ok(dirty === before, 'INVARIANT: caller string variable not mutated');
ok(rd.count >= 5, 'token-heavy prefix: all planted classes flagged');
ok(Object.keys(rd.byClass).length >= 4, 'byClass tallies multiple distinct classes');

// ── findings carry line/col + REDACTED excerpt (no raw secret echo) ──
const multiline = `line1 fine\nline2 ${UUID} here\nline3 fine`;
const rm = scanPrefix(multiline);
const u = rm.findings.find((f) => f.cls === 'uuid');
ok(u && u.line === 2, 'finding reports correct line number');
ok(u && typeof u.col === 'number' && u.col > 0, 'finding reports a column');
ok(u && /…/.test(u.excerpt) && u.excerpt !== UUID, 'excerpt is REDACTED (not the raw token)');
ok(redact('abcdef1234567890').includes('…'), 'redact masks the middle');

// ── overlap dedupe: a JWT region is not double-counted as hex-hash too ──
const jwtOnly = `token ${JWT}`;
const rjw = scanPrefix(jwtOnly);
ok(rjw.findings.filter((f) => f.cls === 'jwt').length === 1, 'JWT counted once');
ok(!rjw.findings.some((f) => f.cls === 'hex-hash' && f.col === rjw.findings[0].col), 'JWT span not double-flagged as hex-hash');

// ── prefixBytes scoping: a volatile token PAST the hot region is NOT flagged ──
const scoped = `STABLE PREAMBLE OK.${' '.repeat(20)}|VOLATILE BODY id=${UUID}`;
const hotLen = scoped.indexOf('|'); // everything before the bar is the cache-hot prefix
const rsc = scanPrefix(scoped, { prefixBytes: hotLen });
ok(rsc.clean === true, 'prefixBytes scope: token in the volatile body is NOT flagged');
const rfull = scanPrefix(scoped);
ok(rfull.leaked === true, 'without scope: same token IS flagged (control)');

// ── Lane Result Grammar: the BARE label is canonical per the REAL parser ──
const p = parseResultLabel(LANE_RESULT_LABEL);
ok(p.ok === true, 'RESULT_LABEL parses ok');
ok(p.canonical === true, 'RESULT_LABEL is CANONICAL (no issues)');
ok(p.laneId === '04CP' && p.description === 'CACHE_PREFIX_SCAN' && p.passTypeNorm === 'X' && p.terminal === 'COMMITTED',
  'RESULT_LABEL decomposes to 04CP / CACHE_PREFIX_SCAN / X / COMMITTED');
ok(!LANE_RESULT_LABEL.startsWith('RESULT_LABEL:'), 'label is BARE (no RESULT_LABEL: prefix)');
// negative: the brief-flagged invalid form must FAIL
ok(parseResultLabel('04CP_CACHE_PREFIX_SCAN_X_PASS').ok === false, 'NEGATIVE: bare _X_PASS terminal FAILS the parser (as warned)');

// ── secret-safe self-check: this test file carries NO real-prefix tokens ──
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const selfTxt = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
ok(!/\bsk-[A-Za-z0-9]{8}|\bAKIA[0-9A-Z]{8}|\bAIza[0-9A-Za-z_-]{8}|\bghp_[A-Za-z0-9]{8}|\bnvapi-[A-Za-z0-9]{8}/.test(selfTxt),
  'SECRET-SAFE: test fixtures contain no real-prefix tokens');

console.log(`\ncache-prefix-scan.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
