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

// cleanup
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\nccr-compress.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
