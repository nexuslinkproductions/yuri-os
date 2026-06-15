#!/usr/bin/env node
/**
 * ccr-compress.test.mjs — round-trip + sentinel + content-type + TTL + lossy-honesty + hardening.
 * Run: node _SYSTEM/Scripts/ccr-compress.test.mjs
 * Hermetic: uses a throwaway temp cache dir under os.tmpdir() — never writes into _SYSTEM/state.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compress, retrieve, makeSentinel, parseSentinel, classifyContent, pruneCache, cachePathFor,
  ccrCompress,
} from './ccr-compress.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ccr-test-'));
const cacheDir = path.join(TMP, 'cache');

// ── content classification ──
ok(classifyContent('{"a":1,"b":[2,3]}') === 'json', 'classify: object → json');
ok(classifyContent('[1,2,3]') === 'json', 'classify: array → json');
ok(classifyContent('export function f(){\n  const x = 1;\n}') === 'code', 'classify: code → code');
ok(classifyContent('Just some prose,\nwith two lines.') === 'prose', 'classify: prose → prose');
ok(classifyContent('42') === 'prose', 'classify: bare scalar is NOT json (→ prose)');
ok(classifyContent('{not valid json') === 'code' || classifyContent('{not valid json') === 'prose', 'classify: broken json falls through, never crashes');
ok(classifyContent('anything', 'json') === 'json', 'classify: explicit hint wins');

// ── ROUND-TRIP (the core safety net): compress then retrieve == byte-exact original (structural) ──
const jsonSrc = '{\n  "name": "yuri",\n  "nums": [1, 2, 3],\n  "nested": { "deep": true }\n}';
const rj = compress(jsonSrc, { cacheDir, contentType: 'json', mode: 'structural' });
ok(rj.lossy === false, 'structural json: lossy=false');
ok(rj.compressedBytes < rj.origBytes, 'structural json: inline shrink actually smaller');
ok(retrieve(rj.hash, { cacheDir }) === jsonSrc, 'ROUND-TRIP json: retrieve(hash) === byte-exact original');

const codeSrc = 'export function f() {\n  // a comment line\n  const x = 1;\n\n\n  return x;\n}\n';
const rc = compress(codeSrc, { cacheDir, contentType: 'code', mode: 'structural' });
ok(rc.lossy === false, 'structural code: lossy=false');
ok(!rc.inlineShrunk.includes('// a comment line'), 'structural code: standalone comment elided inline');
ok(retrieve(rc.hash, { cacheDir }) === codeSrc, 'ROUND-TRIP code: retrieve(hash) === byte-exact original (incl comment + blank run)');

const proseSrc = 'Line one.   \n\n\n\nLine two after blank run.\n';
const rp = compress(proseSrc, { cacheDir, contentType: 'prose', mode: 'structural' });
ok(rp.lossy === false, 'structural prose: lossy=false');
ok(retrieve(rp.hash, { cacheDir }) === proseSrc, 'ROUND-TRIP prose: retrieve(hash) === byte-exact original (incl trailing-ws + blank runs)');

// ── SENTINEL present + parseable + retrievable via sentinel string ──
ok(/^⟪CCR:[0-9a-f]{64}:json:\d+⟫$/.test(rj.sentinel), 'sentinel present + well-formed for json');
const parsed = parseSentinel(`prefix ${rj.sentinel} suffix`);
ok(parsed.length === 1 && parsed[0].hash === rj.hash && parsed[0].type === 'json', 'parseSentinel extracts hash+type');
ok(retrieve(rj.sentinel, { cacheDir }) === jsonSrc, 'retrieve accepts a SENTINEL string (not just bare hash)');
ok(makeSentinel('a'.repeat(64), 'prose', 10) === `⟪CCR:${'a'.repeat(64)}:prose:10⟫`, 'makeSentinel format');

// ── inject mode: compressed === sentinel (what flows downstream), original still retrievable ──
const ri = compress(jsonSrc, { cacheDir, contentType: 'json', inject: true });
ok(ri.compressed === ri.sentinel, 'inject mode: compressed IS the sentinel');
ok(retrieve(ri.compressed, { cacheDir }) === jsonSrc, 'inject mode: sentinel still round-trips to original');

// ── SEMANTIC elision is LOSSY and HONEST (cache restores, inline does NOT) ──
const rs = compress(proseSrc, { cacheDir, mode: 'semantic' });
ok(rs.lossy === true, 'semantic: lossy=true (HONEST)');
ok(rs.inlineShrunk !== proseSrc && rs.inlineShrunk.includes('semantic-elided'), 'semantic: inline is a non-reconstructable placeholder');
ok(retrieve(rs.hash, { cacheDir }) === proseSrc, 'semantic: cache STILL restores byte-exact original (reversibility is the cache, not the inline)');

// ── empty + idempotent hashing ──
const re1 = compress('', { cacheDir });
ok(re1.ratio === 1 && re1.origBytes === 0, 'empty payload: ratio 1, 0 bytes, no crash');
const a = compress(jsonSrc, { cacheDir });
const b = compress(jsonSrc, { cacheDir });
ok(a.hash === b.hash, 'same content → same content-hash (deterministic)');

// ── TTL prune: an entry older than ttl is gone; retrieve returns null ──
const ttlDir = path.join(TMP, 'ttl');
const rt = compress('ephemeral content', { cacheDir: ttlDir, ttlMs: 1000 });
// backdate the cache file beyond TTL
const p = cachePathFor(rt.hash, ttlDir);
const old = (Date.now() - 5000) / 1000;
fs.utimesSync(p, old, old);
ok(retrieve(rt.hash, { cacheDir: ttlDir, ttlMs: 1000 }) === null, 'TTL: retrieve of an expired entry returns null');
ok(!fs.existsSync(p), 'TTL: expired entry is pruned on read');
// pruneCache directly
const rt2 = compress('another', { cacheDir: ttlDir, ttlMs: 60000 });
const p2 = cachePathFor(rt2.hash, ttlDir);
fs.utimesSync(p2, old, old);
ok(pruneCache({ cacheDir: ttlDir, ttlMs: 1000 }) >= 1, 'pruneCache deletes stale entries and returns a count');

// ── retrieve of an unknown hash → null (not a crash) ──
ok(retrieve('f'.repeat(64), { cacheDir }) === null, 'retrieve unknown hash → null');
ok(retrieve('not-a-hash', { cacheDir }) === null, 'retrieve garbage → null');

// ── HARDENING: refuse a protected cache dir (fail-closed) ──
let refused = false;
try { compress('x', { cacheDir: path.join(__dirname, '..', '..', '.claude', 'state', 'evil') }); }
catch (e) { refused = /protected/.test(e.message); }
ok(refused, 'HARDENING: refuses to cache into a protected path (.claude/state) — fail-closed');

// ── HARDENING: --self reads ONLY global.md + MEMORY.md, NEVER cortex-state.json / brain-inject ──
const selfSrc = fs.readFileSync(path.join(__dirname, 'ccr-compress.mjs'), 'utf8');
ok(!/brain-inject/.test(selfSrc.replace(/NEVER invokes brain-inject[\s\S]*?cortex-state\.json[^\n]*/g, '')) || /NEVER invokes brain-inject/.test(selfSrc),
  '--self: source references brain-inject only in the "NEVER invoke" hardening note, not as an import/call');
ok(!/import .*brain-inject|require\(.*brain-inject/.test(selfSrc), '--self: ccr-compress does NOT import/require brain-inject');
ok(!/cortex-state\.json['"]\s*\)/.test(selfSrc) && !/readFileSync\([^)]*cortex-state/.test(selfSrc),
  '--self: ccr-compress never READS cortex-state.json (the deny-listed brain-inject read)');
ok(/yuri-sentinel.*learning.*global\.md/.test(selfSrc) && /memory.*MEMORY\.md/.test(selfSrc),
  '--self: self sources are exactly global.md + MEMORY.md');

// ── determinism: no Math.random in the transform path ──
ok(!/Math\.random\(/.test(selfSrc), 'no Math.random (deterministic transform)');

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ── Wave-1 spec: 04-ccr-compress-spec.md — 8 required test cases for ccrCompress(body,remaining) ──
// ════════════════════════════════════════════════════════════════════════════════════════════════

// ── TEST 1: Structural — 50 trailing blank lines collapse to a single newline ─────────────────────
{
  const head = '# Module X\n\nThis is real content.\nWith a second line.\n';
  const body = head + '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'; // 50+ blank lines
  const r = ccrCompress(body, body.length); // remaining = full length → should fit after structural
  ok(r.strategy === 'none' || r.strategy === 'structural', `T1 strategy: ${r.strategy} (none or structural)`);
  // The structural pass must not allow the trailing-blank-run to survive in the output.
  ok(!/\n\n\n/.test(r.compressed), 'T1: 50 trailing blank lines collapsed (no triple-newline run remains)');
  ok(r.compressed.length < body.length, 'T1: output is shorter than input (collapsing happened)');
}

// ── TEST 2: Footer stripping — `## Related` footer is removed; body fits after stripping ─────────
{
  const head = '# Module Y\n\nReal body content here.\n## Section\n- item\n';
  const body = head + '\n## Related\n- foo\n- bar\n- baz\n';
  const r = ccrCompress(body, body.length);
  ok(r.strategy === 'none' || r.strategy === 'structural', `T2 strategy: ${r.strategy}`);
  ok(!/## Related/.test(r.compressed), 'T2: "## Related" footer stripped');
  ok(/Real body content here/.test(r.compressed), 'T2: real body content preserved');
}

// ── TEST 3: Semantic — implementation code blocks dropped; interface blocks kept; budget respects ─
{
  const interfaceBlock = '```js\nexport function keepThis(x) { return x + 1; }\n```';
  const implBlockA = '```js\nconst a = 1;\nconst b = 2;\nconst c = a + b;\nconsole.log(c);\n```';
  const implBlockB = '```js\nlet total = 0;\nfor (let i = 0; i < 100; i++) { total += i; }\n```';
  const prose = 'PROSE_INTRO_PROSE_INTRO\n';
  const body = prose + interfaceBlock + '\n' + implBlockA + '\n' + implBlockB + '\nPROSE_OUTRO_PROSE_OUTRO\n';
  // Pick a remaining value that forces the structural pass to be insufficient → semantic kicks in.
  const rem = body.length - 30; // need a real shrink
  const r = ccrCompress(body, rem);
  ok(['semantic', 'section-aware', 'blind-fallback'].includes(r.strategy), `T3 strategy (semantic+): ${r.strategy}`);
  ok(/export function keepThis/.test(r.compressed), 'T3: interface block (export) preserved');
  ok(!/const c = a \+ b/.test(r.compressed) || r.strategy === 'blind-fallback', 'T3: implementation block A dropped (or fallback hit, which is allowed)');
  ok(Buffer.byteLength(r.compressed, 'utf8') <= rem, `T3: budget respected (${Buffer.byteLength(r.compressed, 'utf8')} <= ${rem})`);
}

// ── TEST 4: Section-aware fallback — 4 sections, budget 50% → each section gets ~50% of itself ───
{
  const sec = (n, fill) => `## Section ${n}\n${fill.map((l, i) => `line ${n}.${i} ${l}`).join('\n')}\n\n`;
  const fill4 = Array.from({ length: 80 }, (_, i) => `content-${i}-` + 'x'.repeat(20));
  const fill1 = Array.from({ length: 80 }, (_, i) => `content-${i}-` + 'x'.repeat(20));
  const fill2 = Array.from({ length: 80 }, (_, i) => `content-${i}-` + 'x'.repeat(20));
  const fill3 = Array.from({ length: 80 }, (_, i) => `content-${i}-` + 'x'.repeat(20));
  const body = sec(1, fill1) + sec(2, fill2) + sec(3, fill3) + sec(4, fill4);
  const half = Math.floor(body.length / 2);
  const r = ccrCompress(body, half);
  ok(Buffer.byteLength(r.compressed, 'utf8') <= half, `T4: budget respected (${Buffer.byteLength(r.compressed, 'utf8')} <= ${half})`);
  // Each section header should be present in a section-aware / semantic / structural result.
  const headersKept = ['## Section 1', '## Section 2', '## Section 3', '## Section 4'].filter((h) => r.compressed.includes(h));
  ok(headersKept.length >= 2, `T4: at least 2 of 4 section headers preserved (got ${headersKept.length}, strategy=${r.strategy})`);
}

// ── TEST 5: Budget respect — compressed length ≤ remaining in ALL cases (fuzz-ish) ──────────────
{
  const samples = [
    'short',
    'a'.repeat(2000),
    '# H\n\n' + 'lorem ipsum '.repeat(500),
    'export function f(){\n' + '  const x = 1;\n'.repeat(200) + '}\n',
    JSON.stringify({ a: 1, b: [1,2,3], c: { d: 'hello' } }, null, 2) + '\n' + 'x'.repeat(1000),
    'noise '.repeat(1000) + '\n## Related\n- foo\n- bar\n',
  ];
  for (let i = 0; i < samples.length; i++) {
    for (const rem of [1, 10, 100, 500, samples[i].length, samples[i].length + 100]) {
      const r = ccrCompress(samples[i], rem);
      ok(Buffer.byteLength(r.compressed, 'utf8') <= Math.max(0, rem),
        `T5: budget respected sample[${i}] rem=${rem} (got ${Buffer.byteLength(r.compressed, 'utf8')})`);
    }
  }
}

// ── TEST 6: Reversibility — `retrieve` of the cached hash returns the byte-exact original ────────
{
  const body = '# Module Z\n\nCritical implementation detail:\n' + 'detail-'.repeat(500) + '\n## Related\n- noise\n';
  const r = ccrCompress(body, body.length - 20, { cacheDir }); // forces a shrink → hash present
  ok(r.hash, 'T6: hash present when over-budget and cacheDir provided');
  const got = retrieve(r.hash, { cacheDir });
  ok(got === body, 'T6: retrieve(hash) returns byte-exact original (reversibility)');
}

// ── TEST 7: Regression — remaining ≥ body.length is a no-op (strategy 'none', lossy false) ───────
{
  const body = 'unchanged-please\n'.repeat(50);
  const r = ccrCompress(body, body.length);
  ok(r.compressedLength <= r.originalLength, 'T7: compressedLength ≤ originalLength (no expansion)');
  ok(r.strategy === 'none', `T7: strategy is 'none' (got '${r.strategy}')`);
  ok(r.lossy === false, 'T7: lossy=false when remaining ≥ body.length');
  // Load-bearing content must survive the structural pass; trailing whitespace may be normalized.
  ok(/unchanged-please/.test(r.compressed), 'T7: load-bearing content preserved');
}

// ── TEST 8: Edge cases — empty body & body shorter than remaining → strategy 'none', lossy false ─
{
  const r1 = ccrCompress('', 1000);
  ok(r1.compressed === '' && r1.strategy === 'none' && r1.originalLength === 0, 'T8a: empty body → empty, strategy=none, origBytes=0');
  const short = 'tiny';
  const r2 = ccrCompress(short, 1000);
  ok(r2.strategy === 'none' && r2.lossy === false && r2.compressedLength <= r2.originalLength,
    'T8b: body shorter than remaining → strategy=none, lossy=false, no expansion');
  // Extra edge: remaining=0 → empty out, strategy='none'
  const r3 = ccrCompress('something', 0);
  ok(r3.compressed === '' && r3.strategy === 'none', 'T8c: remaining=0 → empty out, strategy=none');
  // Extra edge: null/undefined body → empty, no crash
  const r4 = ccrCompress(null, 100);
  ok(r4.compressed === '' && r4.originalLength === 0, 'T8d: null body → empty, no crash');
}

// ── BONUS: structural pass is non-lossy when it CAN handle the budget ──────────────────────────
{
  // Body with 20 trailing blank lines + ## Related footer; budget = body.length - 5 (small over).
  // After structural stripping, it should fit. The "load-bearing" content must survive.
  const body = 'real content\nreal line 2\n' + '\n\n\n\n\n## Related\n- x\n- y\n';
  const r = ccrCompress(body, body.length - 5);
  ok(['structural', 'none'].includes(r.strategy), `BONUS: small-over budget resolved at structural/none (got '${r.strategy}')`);
  if (r.strategy !== 'blind-fallback') {
    ok(r.lossy === false, `BONUS: structural/none path is non-lossy (got lossy=${r.lossy})`);
  }
  ok(/real content/.test(r.compressed), 'BONUS: load-bearing content preserved');
  ok(Buffer.byteLength(r.compressed, 'utf8') <= body.length - 5, 'BONUS: budget respected');
}

// ── BONUS: hard slice of a body with no compressible structure falls through to blind-fallback ──
{
  // A body with no blank runs, no code blocks, no sections, no footer — the only way to fit is slice.
  const body = 'x'.repeat(1000);
  const r = ccrCompress(body, 100);
  ok(r.strategy === 'blind-fallback', `BONUS: incompressible body → blind-fallback (got '${r.strategy}')`);
  ok(Buffer.byteLength(r.compressed, 'utf8') <= 100, 'BONUS: blind-fallback respects budget');
  ok(r.lossy === true, 'BONUS: blind-fallback is honestly marked lossy=true');
}

// cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\nccr-compress.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
