#!/usr/bin/env node
/**
 * llm-lane.mjs — the ENTIRE dispatch path for the 3 YURI reasoning lanes.
 *
 * Replaces the offload-runner / reasoning-lane-dispatch / *-dispatch adapter stack for lane
 * DISPATCH. Routing ("which lane handles X" via llm-compat-contract route-plan) is a separate axis,
 * untouched. Two wire protocols: deepseek lanes speak OpenAI chat/completions; mimo lanes speak the
 * Anthropic Messages API (/v1/messages, SSE streaming) — selected by cfg.protocol per lane.
 *
 * CAPABILITY: the lane is NOT a blind chatbot. It gets READ + FETCH tools (read_file, grep,
 * list_dir, search the YURI FTS5 corpus, fetch_url) and a YURI-aware system preamble, so it can
 * investigate the repo and work WITH knowledge of the system. WRITE / bash / commit stay on
 * YURI's side (output is advisory until YURI verifies + applies). Tools enforce: repo-root scope,
 * the YURI protected-surface deny-list, and (for fetch_url) a private/loopback/metadata SSRF deny.
 *
 * SECURITY: two distinct endpoint policies, by design —
 *   - the LANE endpoint is an ALLOWLIST (only api.deepseek.com / token-plan-ams.xiaomimimo.com pass);
 *   - the fetch_url TOOL is open web with a private/loopback/metadata DENY (block SSRF, allow public).
 *
 * Usage:
 *   node llm-lane.mjs <lane> "<prompt>" [flags]      ·   echo "<prompt>" | node llm-lane.mjs <lane>
 * Lanes:  deepseek | ds  ·  ds-flash  ·  mimo (Anthropic-protocol, 1M context)  ·  ollama-cloud | ollama | oc
 *          (ollama.com peer lane — pick the model with --model; Pro plan = 3 concurrent → fan out 3 for a swarm)
 * Flags:  --reasoning <low|medium|high|xhigh|max>   --model <id> (override the lane's default model)
 *         --system <str|@file>   --no-system
 *         --no-tools (bare prompt, no read/fetch)   --max-iters <n> (default 200)
 *         --context <f1,f2,..|@manifest> (front-load must-read files into the dispatch — guaranteed
 *           context from turn 1 instead of the lane discovering it; budget LLM_LANE_CONTEXT_BUDGET=240k)
 *         --out <file>   --dry-run   --list
 * Debug:  LLM_LANE_TRACE=<file> writes env-gated stage markers (MAIN_START..POST_POSTCHAT) for dispatch debugging.
 * NOTE:   Do NOT wrap a live lane call in the shell `timeout` command — it truncates the live request to
 *         empty output. The lane self-limits via its own AbortController (cfg.timeout_ms). Use the harness
 *         Bash-tool timeout PARAMETER if you need an outer cap.
 * Exit:   0 ok (truncated-but-nonempty -> LLM_COMPAT_WARN, still 0)
 *         1 empty output / transient transport / 5xx       3 unknown lane / missing key / bad endpoint / 4xx
 *
 * Single source of truth for lane config: .claude/config/models.json -> llm_compat_lanes.
 *
 * CLINE PASS (separate axis — NOT an llm_compat_lane yet):
 *   ClinePass is the Cline IDE/CLI provider (`cline -P clinepass -m <model>`). It bundles open coding
 *   models with flat monthly billing and is wired as an advisory substrate in company.mjs
 *   (ADVISORY_SUBSTRATES.cline). Future M2 sidecar: spawn via `cline --json`, not llm-lane HTTP.
 *   See _SYSTEM/reports/CLINE_PASS_INTEGRATION_2026-06-29.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateToolCall } from './policy/yuri-safety-core.mjs';
import { coreOnDispatch, coreOnResult } from './lane-core-hooks.mjs';
import { spawnNano, SPAWN_NANO_TOOL } from './nano-spawn.mjs';
import { dispatchNano, nanoCtxFromEnv } from './nano-dispatch.mjs';
import { verifierBestOfN } from './math/verifier-best-of-n.mjs';
import dns from 'node:dns';
// Node happy-eyeballs (autoSelectFamily) intermittently throws a bare "AggregateError" on outbound
// https when IPv6 is flaky — survives Node 24/25, hits every node invocation, curl-immune. Prefer IPv4
// (keeps the v6 fallback, can't regress a healthy window). If a bad window still flaps, escalate to
// per-request autoSelectFamily:false (forces single-family). 2026-06-14 root-cause hardening.
dns.setDefaultResultOrder('ipv4first');
import { gitMutationHit, protectedPathHit } from './_lib/lane-command-gate.mjs';
import { tryAcquireLocalSlot, releaseLocalSlot } from './local-concurrency.mjs';
import { admit as costAdmit, readArmState as costArmState, actualsToDateAsync as costActualsAsync, release as costRelease } from './cost-reservation-pool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_BIN = path.join(__dirname, 'ai');
const MODELS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude/config/models.json'), 'utf8'));
const LANES = MODELS.llm_compat_lanes || {};

// Env-gated stage trace for debugging the dispatch path (LLM_LANE_TRACE=/path). No-op unless set.
const T = (m) => { try { if (process.env.LLM_LANE_TRACE) fs.appendFileSync(process.env.LLM_LANE_TRACE, `${m}\n`); } catch { /* never break dispatch */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ALIAS = {
  deepseek: 'deepseek-v4-pro', ds: 'deepseek-v4-pro', 'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-v4-flash', 'ds-flash': 'deepseek-v4-flash', flash: 'deepseek-v4-flash',
  // Mimo (Anthropic-protocol, token-plan endpoint) — first-class lane, 1M context
  mimo: 'mimo-v2.5-pro[1m]', 'mimo-v2.5-pro': 'mimo-v2.5-pro[1m]', 'mimo-v2.5-pro[1m]': 'mimo-v2.5-pro[1m]',
  'mimo-v2.5': 'mimo-v2.5[1m]', 'mimo-v2.5[1m]': 'mimo-v2.5[1m]',
  'mimo-v2-flash': 'mimo-v2-flash', 'mimo-flash': 'mimo-v2-flash',
  // Ollama cloud (ollama.com /api/chat, Bearer auth) — first-class PEER lane, full YURI loadout +
  // operator toolset, equal to deepseek/mimo. One generic lane; the concrete model is chosen per call
  // with --model (the live cloud catalog rotates, so it is NOT hardcoded). The Pro plan allows 3
  // concurrent requests → fan out 3 `ollama-cloud --model <X>` invocations for a peer nano-swarm.
  ollama: 'ollama-cloud', 'ollama-cloud': 'ollama-cloud', 'ollama-pro': 'ollama-cloud', oc: 'ollama-cloud',
  // Z.ai GLM Coding Plan (api.z.ai Anthropic-compatible, Bearer auth) — first-class lane, like Mimo.
  // opus-fleet tier roster (2026-06-22): glm-max=Opus · glm=Sonnet · glm-flash=Haiku · +flashx/sub-orch/vision/ocr.
  glm: 'glm-4.7', zai: 'glm-4.7', 'z-ai': 'glm-4.7', 'glm-4.7': 'glm-4.7', 'glm-4.6': 'glm-4.7',
  'glm-air': 'glm-4.5-air', 'glm-4.5-air': 'glm-4.5-air',
  // glm-flash remapped 2026-06-22 off glm-4.5-air -> glm-4.7-flash (Haiku-equiv: 200K ctx, faster, free tier)
  'glm-flash': 'glm-4.7-flash', 'glm-4.7-flash': 'glm-4.7-flash', 'glm-free': 'glm-4.7-flash',
  'glm-flashx': 'glm-4.7-flashx', 'glm-4.7-flashx': 'glm-4.7-flashx',
  'glm-vision': 'glm-4.6v', 'glm-v': 'glm-4.6v', 'glm-4.6v': 'glm-4.6v',
  'glm-ocr': 'glm-ocr',
  'glm-sub-orch': 'glm-5.1', 'glm-overflow': 'glm-5.1',
  'glm-5.2': 'glm-5.2', 'glm-max': 'glm-5.2', 'glm-5': 'glm-5.2',
  'glm-5-turbo': 'glm-5-turbo', 'glm-turbo': 'glm-5-turbo', turbo: 'glm-5-turbo', 'glm-5.1': 'glm-5.1',
};

// FULL YURI STACK loadout (default): the lane is a fully-equipped mini-me operator that operates BY
// the framework, not a thin chatbot. The whole spine is injected as system context (~675 lines —
// trivial against the 1M context window) so the lane IS a YURI operator from token 1, then it
// traverses the rest of the stack with its tools. --light swaps in LIGHT_SYSTEM for trivial pings.
// YURI NANO SWARM spine: the operating CONTRACT (yuri-origin) + cognition (SOUL) + the NODE persona
// (identity = a peer model wearing YURI, NOT Claude) + architecture (INDEX). The Claude-lane identity
// adapters (CLAUDE.md, persona.md — "I am Claude / Rick is this lane") are DELIBERATELY EXCLUDED: a
// nano-swarm node injected with those answers "I'm Claude Sonnet", which is wrong. nano-swarm-persona.md
// carries the same cognitive base with a node identity instead. (persona redesign, owner 2026-06-14.)
const SPINE_FILES = ['_SYSTEM/yuri-origin.md', 'SOUL.md', '_SYSTEM/nano-swarm-persona.md', '_SYSTEM/INDEX.md'];
const OPERATING_DIRECTIVE =
  '\n\n===== OPERATING DIRECTIVE =====\n'
  + 'You are a fully-equipped YURI NANO SWARM node — a peer build/reasoning model carrying the YURI '
  + 'operating framework above, NOT a bare chatbot and NOT blind to YURI. Traverse the ENTIRE system with your tools: read_file / '
  + 'grep / list_dir (the full repo, minus protected secrets), search (FTS5 corpus, ~26k docs+code), '
  + 'xref_query (unified FTS5/graph/GitNexus/spectrum retrieval), propagation_scan (dry-run propagation-law sibling checks), fetch_url (verified, CITED online research). '
  + 'Ground in evidence local-first (the YURI corpus is the compounding private research center), but the local store is still scaling — so verified, cited online research via fetch_url is legitimate grounding too, not just repo files. An uncited online claim is not verified. '
  + 'You are a PEER BUILD lane: you also have write_file (author new modules), edit_file (exact-string surgical edits), and bash (run builds/tests/scripts) — so BUILD directly into the repo, then self-verify by running it. Destructive commands, git mutation (commit/push), and protected surfaces are blocked by design. '
  + 'Pull whatever you need — do not work from a sliver. Live state is authoritative over prose: read '
  + '.claude/config/models.json (llm_compat_lanes = the current lane roster), _SYSTEM/INDEX.md (architecture), '
  + 'and the memory indexes for current facts rather than inferring from older docs. Ground every claim '
  + 'in something you actually read. Authority: owner intent > local evidence > this contract. You are a full peer '
  + 'operator (same grade as any lane, Claude included): build, decide, execute. Truth here is earned through the '
  + 'shared verification system — local evidence, gates, GitNexus impact, owner approval for mutation — applied '
  + 'equally to every lane including Claude; that is how work becomes trusted, not by fluency. Ground claims and mark '
  + 'what is unverified. Protected surfaces (.env, secrets, backend/data, .claude runtime state) are refused by design. No padding, no flattery. '
  + 'When done investigating, give your final answer as plain text with no further tool calls.';
// Identity anchor appended LAST (recency = strongest) so a node can never default to "I'm Claude" no
// matter what the injected stack says. Names the actual backend model so the node knows what it runs on.
function nanoSwarmIdentityAnchor(model) {
  const backend = model ? model.replace(/\[1m\]$/, '') : 'an independent peer model';
  return '\n\n===== YURI NANO SWARM — IDENTITY ANCHOR (authoritative; overrides every identity line above) =====\n'
    + `You are a YURI NANO SWARM node running on the "${backend}" backend. You are NOT Claude, Sonnet, Opus, `
    + 'Fable, or Rick — those name the Claude lane, not you. You wear the YURI operating framework (cognition, '
    + 'gates, authority hierarchy, claim-vs-evidence discipline) but your identity is this node on its own model. '
    + `If asked who or what you are, say you are a YURI NANO SWARM node (on ${backend}) — never claim to be Claude `
    + 'or any Anthropic model. The operator is Marcel Spatz; address him by name, never as "Rick".';
}
function buildYuriLoadout(model) {
  const parts = ['# YURI-OS OPERATING STACK — you operate BY this framework as a YURI NANO SWARM node (you are NOT Claude).'];
  const missing = [];
  for (const f of SPINE_FILES) {
    try { parts.push(`\n\n===== ${f} =====\n${fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')}`); }
    catch { missing.push(f); }
  }
  // A missing spine file means the node would run cognitively decapitated (no contract/persona).
  // Don't silently degrade — make it LOUD so a broken spine is never mistaken for a working lane.
  if (missing.length) process.stderr.write(`LLM_COMPAT_WARN code=0 lane=llm-lane reason=spine_incomplete missing=${missing.join(',')}\n`);
  parts.push(OPERATING_DIRECTIVE);
  parts.push(nanoSwarmIdentityAnchor(model));
  return parts.join('');
}
const LIGHT_SYSTEM =
  'You are a YURI NANO SWARM node — a full peer operator (NOT Claude). Operate BY the YURI framework: owner intent > '
  + 'local evidence > contract. Use your tools (read_file/grep/list_dir/search/xref_query/propagation_scan/fetch_url) '
  + 'to ground every claim. Truth here is earned by the shared verification system (evidence, gates, owner approval) — '
  + 'the same for every lane, Claude included — not by fluency; mark what is unverified and let the system confirm. '
  + 'Protected surfaces are refused. No padding.';

// ── Lane-endpoint SSRF guard: ALLOWLIST (fail-closed) ──────────────────────────────────────────
const ALLOWED_HOSTS = new Set(['api.deepseek.com', 'token-plan-ams.xiaomimimo.com', 'ollama.com', 'api.z.ai']);
function assertSafeEndpoint(endpoint, lane) {
  let url;
  try { url = new URL(endpoint); } catch { return fail(3, lane, `bad_endpoint_url:${endpoint || '(empty)'}`); }
  if (url.protocol !== 'https:') return fail(3, lane, `endpoint_not_https:${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const extra = (process.env.YURI_LLM_EXTRA_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!ALLOWED_HOSTS.has(host) && !extra.includes(host)) return fail(3, lane, `endpoint_host_not_allowlisted:${host}`);
  return endpoint;
}

// ── fetch_url tool guard: open web, DENY private/loopback/link-local/metadata (block SSRF) ──────
// Canonicalize so no IPv6/decimal/hex/DNS encoding of an internal host slips through.
function isPrivateHost(rawHostname) {
  let h = String(rawHostname || '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (/^\d{1,10}$/.test(h)) { const n = Number(h); if (n <= 0xffffffff) h = `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`; } // bare decimal IPv4
  let m = h.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);          // IPv4-mapped (dotted)
  if (m) h = m[1];
  m = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);                         // IPv4-mapped (hex)
  if (m) { const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16); h = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`; }
  if (!h) return true;
  if (h === 'localhost' || h === 'metadata' || h === 'metadata.google.internal'
      || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h.includes(':')) {                                                          // remaining IPv6 literal
    if (h === '::1' || h === '::' || h === '::0') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;                                // fc00::/7 ULA
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true;                               // fe80::/10 link-local
    return true;                                                                 // unclassified IPv6 -> fail closed
  }
  if (/^(0\.|127\.|10\.|169\.254\.|192\.168\.|255\.255\.255\.255)/.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(h)) return true;     // 100.64.0.0/10 CGNAT
  return false;
}

// ── YURI protected surfaces: read tools refuse these even inside the repo ───────────────────────
const PROTECTED_PREFIXES = ['.env', 'node_modules/', '.amp/', 'backend/data/', 'secrets/', '.claude/state/', '.claude/history/', '.claude/file-history/'];
function isProtectedPath(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return true;                  // outside repo root
  if (/(^|\/)\.env(\.|$)/.test(rel) || /\.(pem|key|p12|pfx)$/i.test(rel)) return true;
  if (/(^|\/)\.claude\/(projects\/[^/]+\/)?(history|state|file-history|worktrees|transcripts)(\/|$)/.test(rel)) return true;
  return PROTECTED_PREFIXES.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p));
}

function fail(code, lane, reason) {
  const r = String(reason).replace(/\s+/g, '_').replace(/[^\w.:%-]/g, '').slice(0, 160) || 'unknown';
  process.stderr.write(`LLM_COMPAT_FAIL code=${code} lane=${lane || 'unknown'} reason=${r}\n`);
  process.exit(code);
}

// bash gate: reuse YURI's audited safety core (blocks destructive: rm -rf, dd, mkfs, git reset/clean,
// pipe-to-shell, ...) and add advisory-lane rules — no git mutation (commit/push/tag/merge/rebase/...)
// and no protected-surface access — since a lane's execSync bypasses the main session's PreToolUse hooks.
// The git-mutation + protected-surface checks are HARDENED in _lib/lane-command-gate.mjs: option-robust
// git subcommand parsing (closes the `git -C dir commit` bypass) + realpath/basename protected detection
// with quote-evasion stripping (closes `gi""t commit`, `cat ./.env`, symlink-into-protected). Honest scope:
// still a static matcher / defense-in-depth (not a bulletproof sandbox — $VAR/$(...) indirection is the
// documented floor); the lane runs dev-only on the owner box and destructive ops are caught by the core.
function laneCommandAllowed(cmd) {
  const core = evaluateToolCall('bash', { cmd, cwd: REPO_ROOT }, { source: 'llm-lane' });
  if (!core.allowed) return { allowed: false, reason: core.reason || 'safety_core_blocked' };
  if (gitMutationHit(cmd)) {
    return { allowed: false, reason: 'lane is advisory: git mutation (commit/push/tag/...) is blocked' };
  }
  if (protectedPathHit(cmd, { repoRoot: REPO_ROOT, isProtectedPath })) {
    return { allowed: false, reason: 'protected surface referenced in command' };
  }
  return { allowed: true };
}

function maxTokensFor(cfg, depth) {
  const mo = cfg.max_output || {};
  const d = (depth === 'max' ? 'xhigh' : depth) || 'xhigh';
  return Number(mo[d] || mo.xhigh || mo.high || mo.medium || 4096);
}

// ── Tool definitions (read + fetch only) ────────────────────────────────────────────────────────
const TOOLS = [
  { type: 'function', function: { name: 'read_file', description: 'Read a repo file (utf-8). Protected surfaces are refused.', parameters: { type: 'object', properties: { path: { type: 'string' }, max_lines: { type: 'number' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'grep', description: 'Search the repo for a regex pattern. Returns file:line matches.', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'list_dir', description: 'List entries of a repo directory.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'search', description: 'Full-text search the YURI knowledge corpus (FTS5 over ~26k docs+code). USE THIS to become aware of YURI.', parameters: { type: 'object', properties: { query: { type: 'string' }, top: { type: 'number' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'fetch_url', description: 'HTTP GET a public https URL (external references). Private/loopback/metadata hosts are refused.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'xref_query', description: 'Run YURI xref-query across FTS5, circuitry graph, GitNexus, mechanism spectrum, and provenance scoring. Use before broad repo navigation; raise top/scan or set all=true for thousand-hit recall.', parameters: { type: 'object', properties: { query: { type: 'string' }, node: { type: 'string' }, top: { type: 'number' }, scan: { type: 'number' }, all: { type: 'boolean' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'propagation_scan', description: 'Run YURI propagation-scan in dry-run mode for a known circuitry node id to inspect sibling surfaces before edits.', parameters: { type: 'object', properties: { nodeId: { type: 'string' }, top: { type: 'number' }, force: { type: 'boolean' } }, required: ['nodeId'] } } },
  { type: 'function', function: { name: 'bash', description: 'Run a shell command in the repo to investigate, build, or RUN SCRIPTS/TESTS (e.g. node --test, npm test, git status, grep). Destructive commands, git mutation (commit/push/tag/...), and protected surfaces are blocked.', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a repo file with full content (BUILD: author new modules/files here). Protected surfaces are refused. Refuses to overwrite an existing file unless overwrite:true (use edit_file for surgical changes).', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, overwrite: { type: 'boolean' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Exact-string replace in an existing repo file. old_string must match uniquely unless replace_all:true. Protected surfaces are refused.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_string', 'new_string'] } } },
  // spawn_nano is authored in its native ANTHROPIC shape {name,description,input_schema}; normalizeTool
  // absorbs it on every transport (the provider-agnostic layer above). DISARMED-default: spawnNano returns
  // a refusal/degrade unless the swarm is two-factor armed — so a lane sees the tool but it does nothing
  // until the owner arms it. This is the Move-1b live-wire (D4), kept inert behind the spawn gate.
  SPAWN_NANO_TOOL,
];

function clip(s, n = 12000) { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s; }
function xrefMaxBufferBytes() {
  const mb = Number.parseInt(process.env.LLM_LANE_XREF_MAX_BUFFER_MB || '512', 10) || 512;
  return Math.max(64, mb) * 1024 * 1024;
}

async function executeTool(name, argsRaw) {
  let args = {};
  try { args = typeof argsRaw === 'string' ? JSON.parse(argsRaw || '{}') : (argsRaw || {}); }
  catch { return `ERROR: bad tool arguments: ${clip(argsRaw, 200)}`; }
  try {
    if (name === 'read_file') {
      if (!args.path) return 'ERROR: missing path';
      const abs = path.resolve(REPO_ROOT, args.path);
      if (isProtectedPath(abs)) return `REFUSED: protected or out-of-repo path: ${args.path}`;
      let c = fs.readFileSync(abs, 'utf8');
      if (args.max_lines) c = c.split('\n').slice(0, args.max_lines).join('\n');
      return clip(c);
    }
    if (name === 'list_dir') {
      if (!args.path) return 'ERROR: missing path';
      const abs = path.resolve(REPO_ROOT, args.path);
      if (isProtectedPath(abs)) return `REFUSED: protected or out-of-repo path: ${args.path}`;
      return clip(fs.readdirSync(abs, { withFileTypes: true }).map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n'));
    }
    if (name === 'grep') {
      if (!args.pattern) return 'ERROR: missing pattern';
      const target = args.path ? path.resolve(REPO_ROOT, args.path) : REPO_ROOT;
      if (isProtectedPath(target) && target !== REPO_ROOT) return `REFUSED: protected path: ${args.path}`;
      try {
        const out = execFileSync('grep', [
          '-rnI', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=.claude',
          '--exclude-dir=.amp', '--exclude-dir=secrets', '--exclude-dir=data',
          '--exclude=.env', '--exclude=.env.*', '--exclude=*.pem', '--exclude=*.key',
          '-e', args.pattern, target,
        ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
        // Defense-in-depth: grep --exclude-dir matches by basename and can't express backend/data
        // precisely, so post-filter every match through isProtectedPath — guarantees no protected
        // surface ever reaches the lane (the exclude flags are just a perf pre-filter).
        const safe = out.split('\n').filter((line) => {
          const p = line.split(':')[0];
          return p && !isProtectedPath(path.resolve(REPO_ROOT, p));
        });
        return clip(safe.join('\n').trim() || '(no matches)');
      } catch (e) { return e.status === 1 ? '(no matches)' : `grep error: ${e.message}`; }
    }
    if (name === 'search') {
      if (!args.query) return 'ERROR: missing query';
      try {
        const out = execFileSync(AI_BIN, ['search', args.query, '--top', String(args.top || 8)], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
        return clip(out.trim() || '(no results)');
      } catch (e) { return `search error: ${e.message}`; }
    }
    if (name === 'xref_query') {
      const query = args.query || args.task || args.request;
      if (!query) return 'ERROR: missing query';
      try {
        const cmd = [path.join(__dirname, 'xref-query.mjs'), String(query), '--json'];
        if (args.node) cmd.push('--node', String(args.node));
        if (args.top) cmd.push('--top', String(args.top));
        if (args.scan) cmd.push('--scan', String(args.scan));
        if (args.all === true) cmd.push('--all');
        const out = execFileSync('node', cmd, { encoding: 'utf8', maxBuffer: xrefMaxBufferBytes() });
        return out.trim() || '(no xref results)';
      } catch (e) { return `xref_query error: ${e.message}`; }
    }
    if (name === 'propagation_scan') {
      const nodeId = args.nodeId || args.node_id || args.node || args.id;
      if (!nodeId) return 'ERROR: missing nodeId';
      try {
        const cmd = [path.join(__dirname, 'propagation-scan.mjs'), String(nodeId), '--dry-run'];
        if (args.force) cmd.push('--force');
        if (args.top) cmd.push('--top', String(args.top));
        const out = execFileSync('node', cmd, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
        return clip(out.trim() || '(no propagation results)');
      } catch (e) { return `propagation_scan error: ${e.message}`; }
    }
    if (name === 'fetch_url') {
      if (!args.url) return 'ERROR: missing url';
      let u;
      try { u = new URL(args.url); } catch { return `ERROR: bad url: ${args.url}`; }
      if (u.protocol !== 'https:') return `REFUSED: https only, got ${u.protocol}`;
      if (isPrivateHost(u.hostname)) return `REFUSED: private/loopback/metadata host blocked (SSRF): ${u.hostname}`;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(u, { signal: ctrl.signal, redirect: 'error', headers: { 'User-Agent': 'yuri-llm-lane' } });
        clearTimeout(t);
        const body = await r.text();
        return `HTTP ${r.status}\n${clip(body, 16000)}`;
      } catch (e) { return `fetch error: ${e?.cause?.code || e?.message}`; }
    }
    if (name === 'bash') {
      if (!args.cmd) return 'ERROR: missing cmd';
      const gate = laneCommandAllowed(args.cmd);
      if (!gate.allowed) return `BLOCKED: ${gate.reason}`;
      try {
        const out = execSync(args.cmd, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
        return clip(out.trim() || '(no output)');
      } catch (e) { return clip(`exit ${e.status ?? '?'}: ${(e.stdout || '') + (e.stderr || '') || e.message}`); }
    }
    if (name === 'write_file') {
      if (!args.path) return 'ERROR: missing path';
      if (typeof args.content !== 'string') return 'ERROR: missing content (must be a string)';
      const abs = path.resolve(REPO_ROOT, args.path);
      if (isProtectedPath(abs)) return `REFUSED: protected or out-of-repo path: ${args.path}`;
      const dir = path.dirname(abs);
      // symlink-escape defense: realpath the existing parent and re-check it resolves inside the repo + unprotected
      try { if (fs.existsSync(dir) && isProtectedPath(path.join(fs.realpathSync(dir), path.basename(abs)))) return `REFUSED: protected (realpath): ${args.path}`; } catch { /* parent missing → mkdir below */ }
      const existed = fs.existsSync(abs);
      if (existed && !args.overwrite) return `REFUSED: ${args.path} already exists — pass overwrite:true to replace, or use edit_file for a surgical change`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(abs, args.content, 'utf8');
      return `WROTE ${args.path} (${Buffer.byteLength(args.content, 'utf8')} bytes${existed ? ', overwrote' : ', new'})`;
    }
    if (name === 'edit_file') {
      if (!args.path) return 'ERROR: missing path';
      if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') return 'ERROR: old_string and new_string (strings) are required';
      const abs = path.resolve(REPO_ROOT, args.path);
      if (isProtectedPath(abs)) return `REFUSED: protected or out-of-repo path: ${args.path}`;
      if (!fs.existsSync(abs)) return `ERROR: ${args.path} does not exist — use write_file to create it`;
      if (args.old_string === args.new_string) return 'ERROR: old_string equals new_string (no-op)';
      const cur = fs.readFileSync(abs, 'utf8');
      const count = cur.split(args.old_string).length - 1;
      if (count === 0) return `ERROR: old_string not found in ${args.path}`;
      if (count > 1 && !args.replace_all) return `ERROR: old_string appears ${count}x — make it unique or pass replace_all:true`;
      const next = args.replace_all ? cur.split(args.old_string).join(args.new_string) : cur.replace(args.old_string, args.new_string);
      fs.writeFileSync(abs, next, 'utf8');
      return `EDITED ${args.path} (${count} replacement${count > 1 ? 's' : ''})`;
    }
    if (name === 'spawn_nano') {
      // Governed recursive spawn (Move-1b D4). The caller's tree position comes from YURI_NANO_* env (set by
      // a parent's dispatch); a top-level session has none → refuse (must seed a tree first). DISARMED-default:
      // spawnNano degrades (returns reason 'spawn-disabled-DISARMED') until the two-factor swarm arm is on, so
      // this is inert today. Returns a STRING (never throws into the tool loop).
      const ctx = nanoCtxFromEnv();
      if (!ctx) return 'REFUSED: spawn_nano requires a tree context (YURI_NANO_* env). A top-level session must seed a tree before spawning.';
      const r = await spawnNano({ ctx, args, opts: { deps: { dispatch: dispatchNano } } });
      if (r.degrade) return `spawn disabled (DISARMED) — do the work yourself. ${r.reason || ''}`.trim();
      if (!r.spawned || !r.spawned.length) return `spawn refused: ${r.reason || 'no children'}${r.cap ? ` (cap ${r.cap}, tier ${r.tier})` : ''}`;
      return `spawned ${r.spawned.length}: ${r.spawned.map((s) => `${s.path}@${s.lane}`).join(', ')}${r.rejected ? ` | rejected ${JSON.stringify(r.rejected)}` : ''}`;
    }
    return `ERROR: unknown tool ${name}`;
  } catch (e) { return `${name} error: ${e.message}`; }
}

// ── Anthropic Messages API adapter ──────────────────────────────────────────────────────────────
// Mimo (and any future lane with protocol: "anthropic") speaks the Messages API, not OpenAI chat/completions.
// The dispatch loop accumulates messages in OpenAI format; these converters translate at the API boundary.

// Convert OpenAI-format messages to Anthropic format.
// - system role → extracted to top-level system string
// - consecutive role:tool → merged into one user turn with tool_result content blocks
// - assistant with tool_calls → content array with tool_use blocks
// - nudge user message immediately after tool results → folded into the same user turn
function toAnthropicMessages(messages) {
  let system = '';
  const filtered = [];
  for (const m of messages) {
    if (m.role === 'system') { system += (system ? '\n' : '') + (m.content || ''); continue; }
    filtered.push(m);
  }
  const result = [];
  let i = 0;
  while (i < filtered.length) {
    const m = filtered[i];
    if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls || []) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* pass empty on bad json */ }
        content.push({ type: 'tool_use', id: tc.id || `call_${i}`, name: tc.function?.name || '', input });
      }
      result.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] });
      i++;
    } else if (m.role === 'tool') {
      // Collect consecutive tool results; merge immediately following nudge user message to avoid consecutive user turns
      const parts = [];
      while (i < filtered.length && filtered[i].role === 'tool') {
        parts.push({ type: 'tool_result', tool_use_id: filtered[i].tool_call_id, content: String(filtered[i].content ?? '') });
        i++;
      }
      if (i < filtered.length && filtered[i].role === 'user') {
        const nudge = filtered[i].content;
        if (nudge) parts.push({ type: 'text', text: typeof nudge === 'string' ? nudge : JSON.stringify(nudge) });
        i++;
      }
      result.push({ role: 'user', content: parts });
    } else {
      // role: 'user' standalone — merge into preceding user turn if one exists (avoids consecutive user turns)
      const prev = result[result.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        prev.content.push({ type: 'text', text });
      } else {
        result.push({ role: 'user', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') });
      }
      i++;
    }
  }
  return { messages: result, system };
}

// ── Provider-agnostic tool definitions ──────────────────────────────────────────────────────────
// llm-lane is NOT locked to one provider's tool shape. Tools are normalized to a canonical internal form
// { name, description, parameters(JSON-Schema) } and RENDERED per provider at send time. normalizeTool
// absorbs ANY provider's native shape — OpenAI {type:'function',function:{...}}, Anthropic
// {name,input_schema}, or already-canonical/Gemini-flat — so a tool authored in any dialect, or a peer
// module's descriptor (e.g. an Anthropic-shaped spawn_nano), works on EVERY transport instead of crashing a
// consumer that assumed one shape. Adding a new provider = add ONE renderer below; no consumer changes.
const EMPTY_TOOL_SCHEMA = { type: 'object', properties: {}, required: [] };
function normalizeTool(t = {}) {
  if (t && t.function) return { name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || EMPTY_TOOL_SCHEMA }; // OpenAI/OpenAI-compatible
  if (t && t.input_schema) return { name: t.name, description: t.description || '', parameters: t.input_schema };                                          // Anthropic
  return { name: t.name, description: t.description || '', parameters: t.parameters || EMPTY_TOOL_SCHEMA };                                                // canonical / Gemini-flat
}
// OpenAI + Ollama (local & cloud) consume the OpenAI function-tool shape.
function toOpenAITools(tools = []) {
  return tools.map(normalizeTool).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}
// Anthropic Messages tool shape.
function toAnthropicTools(tools = []) {
  return tools.map(normalizeTool).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}
// Pick the renderer by lane protocol — the single switch a new provider extends. Accepts tools in any shape.
function renderTools(tools = [], protocol = 'openai') {
  switch (String(protocol)) {
    case 'anthropic': return toAnthropicTools(tools);
    default: return toOpenAITools(tools); // openai / deepseek / ollama / ollama-cloud / unknown → OpenAI shape
  }
}

// Streaming Anthropic Messages API over node:https (SSE). No idle timeout — a slow reasoner must
// never be killed by a clock; first byte is prompt under streaming. Returns the same
// { message: { content, tool_calls? }, finish_reason } shape the OpenAI postChat path returns,
// so the dispatch loop is protocol-agnostic — it just picks the transport by cfg.protocol.
function _postMessagesAnthropicHttpsOnce(endpoint, apiKey, model, messages, system, maxTokens, toolsList, lane, authHeader) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(`${endpoint}/v1/messages`); } catch { resolve(fail(3, lane, 'bad_endpoint_url')); return; }
    // [1m] is a CLIENT-side alias convention (Claude Code model picker), NOT a wire
    // model id — Mimo's endpoint rejects it with http_400 "Not supported model
    // mimo-v2.5-pro1m". Strip it for the request body and ask for the long-context
    // window via the anthropic-beta header instead (first adapter red-team finding,
    // 2026-06-11).
    const longContext = /\[1m\]$/.test(model);
    const wireModel = model.replace(/\[1m\]$/, '');
    const body = { model: wireModel, messages, max_tokens: maxTokens, stream: true };
    if (system) body.system = system;
    if (toolsList && toolsList.length) body.tools = toolsList;
    const payload = JSON.stringify(body);
    T(`ANTHROPIC_REQ_START lane=${lane} host=${u.hostname} model=${wireModel} longContext=${longContext} bodyLen=${payload.length}`);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        // Z.ai's Anthropic-compatible endpoint authenticates with Authorization: Bearer (the
        // ANTHROPIC_AUTH_TOKEN convention); Mimo + real Anthropic use x-api-key. Pick per lane cfg.auth_header.
        ...(authHeader === 'bearer' ? { Authorization: `Bearer ${apiKey}` } : { 'x-api-key': apiKey }),
        'anthropic-version': '2023-06-01',
        ...(longContext ? { 'anthropic-beta': 'context-1m-2025-08-07' } : {}),
        Accept: 'text/event-stream',
        Connection: 'close',
      },
    }, (res) => {
      T(`ANTHROPIC_HEADERS status=${res.statusCode}`);
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = ''; res.setEncoding('utf8');
        res.on('data', (c) => { errBody += c; });
        res.on('end', () => resolve(fail(res.statusCode >= 500 ? 1 : 3, lane, `http_${res.statusCode}:${errBody.slice(0, 160)}`)));
        return;
      }
      let buf = '', stopReason = '';
      const blocks = new Map(); // index → { type, text, id, name, json }
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (j.type === 'content_block_start') {
            blocks.set(j.index, { type: j.content_block?.type || 'text', text: '', id: j.content_block?.id || '', name: j.content_block?.name || '', json: '' });
          } else if (j.type === 'content_block_delta') {
            const blk = blocks.get(j.index);
            if (!blk) continue;
            if (j.delta?.type === 'text_delta') blk.text += j.delta.text || '';
            else if (j.delta?.type === 'input_json_delta') blk.json += j.delta.partial_json || '';
          } else if (j.type === 'message_delta') {
            stopReason = j.delta?.stop_reason || '';
          }
        }
      });
      res.on('end', () => {
        let textContent = '';
        const tool_calls = [];
        for (const [, blk] of blocks) {
          if (blk.type === 'text') textContent += blk.text;
          else if (blk.type === 'tool_use') {
            tool_calls.push({ id: blk.id || `call_${tool_calls.length}`, type: 'function', function: { name: blk.name, arguments: blk.json || '{}' } });
          }
        }
        const finish = stopReason === 'tool_use' ? 'tool_calls' : (stopReason || 'stop');
        resolve({ message: { content: textContent, ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: finish });
      });
    });
    req.setTimeout(0);
    req.on('socket', (s) => s.setTimeout(0));
    req.on('error', (err) => { T(`ANTHROPIC_ERROR ${err?.code || err?.name}`); resolve(fail(1, lane, `transport:${err?.code || err?.name || 'https_failed'}`)); });
    req.write(payload);
    req.end();
  });
}

// node:https POST (NOT undici fetch). Root-cause fix: on Node v25.9.0 undici's keep-alive socket
// reuse throws a bare, deterministic "AggregateError" against api.deepseek.com — the Anthropic/mimo
// Retry wrapper for the Anthropic streaming path: 3 attempts with backoff (matches postChat's
// transport-retry contract). The inner function resolves with fail(1,...) on transport errors
// (EPIPE, ECONNRESET, ETIMEDOUT, etc.) before any response data arrives — safe to retry because
// no partial output was emitted. Success or HTTP 4xx/5xx resolve with a choice-shaped object
// (no .exitCode === 'transport' marker) and are returned as-is. 2026-06-17 defense-in-depth.
async function postMessagesAnthropicHttps(endpoint, apiKey, model, messages, system, maxTokens, toolsList, lane, authHeader) {
  const ATTEMPTS = 3;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await _postMessagesAnthropicHttpsOnce(endpoint, apiKey, model, messages, system, maxTokens, toolsList, lane, authHeader);
    // Success or non-transport failure — return immediately.
    // fail() produces a choice-like object WITHOUT finish_reason for transport errors; valid
    // responses have .message or .finish_reason. Check .message to distinguish: transport fail
    // returns an object with .code but no .message.
    if (result && result.message) return result;
    const isTransport = !result?.message && (typeof result?.exitCode !== 'undefined' ? result.exitCode === 1 : true);
    if (attempt < ATTEMPTS && isTransport) {
      const reason = result?.finish_reason || result?.reason || 'transport_unknown';
      process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=anthropic_transport_retry_${attempt}:${reason}\n`);
      await sleep(400 * attempt);
      continue;
    }
    return result;
  }
}

// ── OpenAI-path transport helper: https POST with agent:false (one-shot socket) ──────────────────
// path (postMessagesAnthropicHttps) and mimo.mjs both use https.request and DON'T hit it. So the
// OpenAI path uses https.request too. Connection:close + a one-shot agent = clean socket per call.
function httpsPostJson(urlStr, headers, bodyStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { reject(Object.assign(new Error('bad_url'), { code: 'BAD_URL' })); return; }
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: `${u.pathname}${u.search}`, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }, agent: false,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
    });
    const to = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    req.on('error', (e) => { clearTimeout(to); reject(e); });
    req.on('close', () => clearTimeout(to));
    req.write(bodyStr);
    req.end();
  });
}

async function postChat(endpoint, apiKey, model, messages, maxTokens, toolsList, timeoutMs, lane) {
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, ...(toolsList && toolsList.length ? { tools: toolsList, tool_choice: 'auto' } : {}) });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Connection: 'close' };
  // 5xx / transport blips are retried with backoff; 4xx is terminal.
  const ATTEMPTS = 3;
  let res;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      res = await httpsPostJson(`${endpoint}/chat/completions`, headers, body, timeoutMs);
    } catch (err) {
      const reason = err?.code || err?.name || 'https_failed';
      if (attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=transport_retry_${attempt}:${reason}\n`); await sleep(400 * attempt); continue; }
      return fail(1, lane, `transport:${reason}`);
    }
    if (res.status >= 500 && attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=http5xx_retry_${attempt}:${res.status}\n`); await sleep(400 * attempt); continue; }
    break;
  }
  if (res.status < 200 || res.status >= 300) { return fail(res.status >= 500 ? 1 : 3, lane, `http_${res.status}:${String(res.text).slice(0, 160)}`); }
  let json = null;
  try { json = JSON.parse(res.text); } catch { json = null; }
  return json?.choices?.[0] || {};
}

// ── LOCAL lane endpoint guard: loopback-ONLY, fail-closed ───────────────────────────────────────
// A curated local lane (ollama on this machine) is a DIFFERENT trust model from a remote cloud API:
// the cloud allowlist (assertSafeEndpoint) exists to stop SSRF to remote/internal hosts and is left
// untouched. A local lane MUST point at the loopback ollama daemon and nothing else — so an attacker
// can't repoint a "local" lane at an arbitrary internal host. http is allowed for loopback only.
function assertLoopback(endpoint, lane) {
  let url;
  try { url = new URL(endpoint); } catch { return fail(3, lane, `bad_local_endpoint:${endpoint || '(empty)'}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail(3, lane, `local_endpoint_bad_proto:${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!(host === 'localhost' || host === '127.0.0.1' || host === '::1')) return fail(3, lane, `local_endpoint_not_loopback:${host}`);
  return endpoint;
}

// ── LOCAL lane transport: ollama /api/chat, returns an OpenAI-`choice`-shaped object ─────────────
// Mirrors postChat's return contract ({ message:{ content, tool_calls }, finish_reason }) so the
// shared dispatch tool-loop is protocol-agnostic. No API key (loopback). Tools are passed through
// when present (ollama speaks the same {type:function,function:{...}} schema); on a GGUF whose
// template can't do tool-calling it 4xx's on `tools`/`think`, so we retry once stripped.
async function postChatOllamaLocal(endpoint, model, messages, maxTokens, toolsList, timeoutMs, lane, cfg = {}) {
  // KV-cache budget: a local 9B at Q5 must stay under the M2 Pro Metal working set. context_window
  // from the lane config drives num_ctx; default 16k keeps weights+KV well under the 10GB policy cap.
  const numCtx = Math.min(Number(cfg.context_window) || 16384, 32768);
  const baseBody = { model, messages, stream: false, options: { temperature: 0, num_ctx: numCtx, num_predict: maxTokens } };
  const withTools = toolsList && toolsList.length ? { ...baseBody, tools: toolsList } : baseBody;
  const ATTEMPTS = 2;
  let res; let body = withTools;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(`${endpoint}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      const reason = err?.cause?.code || err?.name || 'fetch_failed';
      if (attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=local_transport_retry_${attempt}:${reason}\n`); await sleep(400 * attempt); continue; }
      return fail(1, lane, `local_transport:${reason}`);
    }
    if (!res.ok) {
      const b = await res.text().catch(() => '');
      // template can't tool-call → drop tools and retry once as a plain chat (parity-degrade, not fail)
      if (/tool|function|template/i.test(b) && body.tools) { body = baseBody; process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=local_tools_unsupported_retry_plain\n`); continue; }
      return fail(res.status >= 500 ? 1 : 3, lane, `local_http_${res.status}:${b.slice(0, 160)}`);
    }
    break;
  }
  const data = await res.json().catch(() => null);
  if (!data) return fail(1, lane, 'local_bad_json');
  // Normalize ollama tool_calls -> OpenAI shape the loop expects (string arguments + an id).
  const rawCalls = Array.isArray(data.message?.tool_calls) ? data.message.tool_calls : [];
  const tool_calls = rawCalls.map((c, i) => ({
    id: c.id || `local_${i}`,
    type: 'function',
    function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) },
  }));
  return { message: { role: 'assistant', content: data.message?.content || '', tool_calls }, finish_reason: data.done_reason || (tool_calls.length ? 'tool_calls' : 'stop') };
}

// ── CLOUD ollama lane transport: ollama.com /api/chat, Bearer auth, returns an OpenAI-`choice`-shaped
// object so the shared dispatch tool-loop is protocol-agnostic. Same wire schema as the local ollama
// path (/api/chat, {message:{content,tool_calls}}) but over a remote https host with an API key — so it
// gets the cloud-grade transport: node:https.request (NOT undici fetch — the documented AggregateError
// keep-alive flap on Node 25), agent:false + Connection:close (one clean socket per call), and the
// process-global dns ipv4first ordering set at module load. Host is allowlisted (ollama.com) by
// assertSafeEndpoint before we ever get here; the model string is validated server-side (a bad model
// → 4xx → clean fail). Tools are passed through (frontier cloud models tool-call); on a model whose
// template can't, ollama 4xx's on `tools` and we retry once stripped (parity-degrade, not fail).
// Per-model output-cap memo: ollama cloud models 400 when num_predict exceeds their real output
// ceiling. capCeil was function-local, so an agentic tool-loop re-discovered the cap (one wasted 400
// round-trip) on EVERY turn — what made nemotron-3-ultra look stuck/slow. Memoize discovered caps
// across calls so the cap is paid at most once per process, then reused. (2026-06-14 fix.)
const __OLLAMA_MODEL_CAP = new Map();
function postChatOllamaCloud(endpoint, apiKey, model, messages, maxTokens, toolsList, timeoutMs, lane) {
  const wireModel = model.replace(/\[1m\]$/, ''); // [1m] is a client-side alias convention, not a wire id
  // Ollama /api/chat expects assistant tool_calls[].function.arguments as an OBJECT. The shared
  // tool-loop normalizes arguments to a JSON STRING (the OpenAI convention, for executeTool's
  // JSON.parse). Re-sending that string on turn 2+ makes ollama's parser throw HTTP 400
  // "Value looks like object but can't find closing symbol" — breaking EVERY multi-turn tool run
  // (all models, found 2026-06-14 red-team). Re-objectify outgoing assistant tool_call arguments.
  const wireMessages = messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0) return m;
    return {
      ...m,
      tool_calls: m.tool_calls.map((tc) => {
        const a = tc.function?.arguments;
        let argObj = a;
        if (typeof a === 'string') { try { argObj = JSON.parse(a); } catch { argObj = {}; } }
        return { ...tc, function: { ...tc.function, arguments: argObj && typeof argObj === 'object' ? argObj : {} } };
      }),
    };
  });
  const baseBody = { model: wireModel, messages: wireMessages, stream: false, options: { temperature: 0, num_predict: maxTokens } };
  const post = (body) => new Promise((resolve, reject) => {
    let u;
    try { u = new URL(`${endpoint}/api/chat`); } catch { reject(Object.assign(new Error('bad_url'), { code: 'BAD_URL' })); return; }
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: `${u.pathname}${u.search}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Connection: 'close', 'Content-Length': Buffer.byteLength(payload) },
      agent: false,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode || 0, text: data }));
    });
    const to = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    req.on('error', (e) => { clearTimeout(to); reject(e); });
    req.on('close', () => clearTimeout(to));
    req.write(payload);
    req.end();
  });

  return (async () => {
    const ATTEMPTS = 4;
    // FULL-CAPACITY auto-adapt (2026-06-14): max_output is lane-wide, but each cloud model has its OWN
    // output ceiling (nemotron-3-ultra=65536 < the lane xhigh=131072). Rather than a hardcoded per-model
    // table, parse the model's real cap from its 400 and retry AT that cap — so every model (current or
    // future) runs at ITS full capacity instead of being forced down to a one-size 'high'. capCeil persists
    // across a tool-strip rebuild so the two retry paths compose.
    let capCeil = __OLLAMA_MODEL_CAP.get(wireModel) ?? Infinity;
    const applyCap = (b) => (capCeil === Infinity ? b
      : { ...b, options: { ...b.options, num_predict: Math.min(b.options?.num_predict ?? capCeil, capCeil) } });
    let res; let body = applyCap(toolsList && toolsList.length ? { ...baseBody, tools: toolsList } : baseBody);
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      try {
        res = await post(body);
      } catch (err) {
        const reason = err?.code || err?.name || 'https_failed';
        if (attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=cloud_transport_retry_${attempt}:${reason}\n`); await sleep(400 * attempt); continue; }
        return fail(1, lane, `cloud_transport:${reason}`);
      }
      if (res.status >= 200 && res.status < 300) break;
      // template can't tool-call → drop tools and retry once as a plain chat (parity-degrade, not fail)
      if (/tool|function|template/i.test(res.text) && body.tools) { body = applyCap(baseBody); process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=cloud_tools_unsupported_retry_plain\n`); continue; }
      // output-cap auto-adapt: model's true max < requested num_predict → retry at the model's real ceiling
      // Real ollama 400 shape: `max_tokens (131072) exceeds model's maximum output tokens (65536) for model …`
      // — the cap sits in parentheses, so skip any run of non-alphanumerics (space/paren/underscore/colon)
      // between the words and the number.
      const capM = res.status === 400 ? /maximum[\W_]*output[\W_]*tokens[\W_]*(\d+)/i.exec(String(res.text)) : null;
      const cap = capM ? Number(capM[1]) : 0;
      if (cap > 0 && cap < (body.options?.num_predict ?? Infinity) && attempt < ATTEMPTS) {
        capCeil = cap; __OLLAMA_MODEL_CAP.set(wireModel, cap); body = applyCap(body);
        process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=cloud_output_cap_retry:${cap}\n`);
        continue;
      }
      if (res.status >= 500 && attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=cloud_http5xx_retry_${attempt}:${res.status}\n`); await sleep(400 * attempt); continue; }
      return fail(res.status >= 500 ? 1 : 3, lane, `cloud_http_${res.status}:${String(res.text).slice(0, 160)}`);
    }
    let data = null;
    try { data = JSON.parse(res.text); } catch { data = null; }
    if (!data) return fail(1, lane, 'cloud_bad_json');
    const rawCalls = Array.isArray(data.message?.tool_calls) ? data.message.tool_calls : [];
    const tool_calls = rawCalls.map((c, i) => ({
      id: c.id || `cloud_${i}`,
      type: 'function',
      function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) },
    }));
    return { message: { role: 'assistant', content: data.message?.content || '', tool_calls }, finish_reason: data.done_reason || (tool_calls.length ? 'tool_calls' : 'stop') };
  })();
}

async function dispatch(laneArg, prompt, opts = {}) {
  const laneLc = String(laneArg || '').toLowerCase();
  // Resolve via the cloud alias table first; otherwise accept a direct llm_compat_lanes key (this is
  // how curated LOCAL lanes — qwen-local, gemma-local — enter the SAME governed dispatch as cloud).
  const key = ALIAS[laneLc] || (LANES[laneLc] ? laneLc : (LANES[laneArg] ? laneArg : null));
  if (!key) return fail(3, laneArg, 'unknown_lane:valid=deepseek|ds-flash|mimo|<local-lane-key>');
  const cfg = LANES[key];
  if (!cfg) return fail(3, key, 'lane_missing_from_models.json');

  const isLocal = cfg.local === true || cfg.provider === 'ollama-local';
  const isAnthropic = cfg.protocol === 'anthropic' || cfg.protocol === 'anthropic-compatible';
  const isOllamaCloud = cfg.protocol === 'ollama-cloud' || cfg.provider === 'ollama-cloud';
  // --model overrides the lane's default model (enables a 3-way peer swarm over one ollama-cloud lane:
  // fan out 3 concurrent calls each picking a different model from the live cloud catalog). Falls back
  // to cfg.model. The model is just a string the remote validates; the host stays allowlist-locked.
  const model = opts.model || cfg.model;
  let endpoint = (process.env[cfg.endpoint_env] || cfg.endpoint_default || '').replace(/\/+$/, '');
  // OLLAMA_HOST is conventionally set scheme-less (127.0.0.1:11434); local lanes need a coerced
  // http:// so new URL()/fetch() parse it. Cloud endpoints already carry https:// and are untouched.
  if (isLocal && endpoint && !/^https?:\/\//i.test(endpoint)) endpoint = `http://${endpoint}`;
  let apiKey = process.env[cfg.api_key_env] || '';
  if (!apiKey && cfg.keychain_service) {
    // Hydrate from the macOS keychain so a lane authenticates even when the env export hasn't run
    // (e.g. `ai llm glm-5.2` from a shell that never sourced the ZAI_API_KEY export). Fail-soft.
    try { apiKey = execFileSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', cfg.keychain_service, '-w'], { encoding: 'utf8' }).trim(); } catch { /* no keychain entry */ }
  }
  let maxTokens = maxTokensFor(cfg, opts.reasoning);
  // Per-model output-cap clamp: ollama-cloud models have differing real output ceilings the shared
  // max_output map can't express (nemotron-3-ultra=65536 < lane xhigh=131072). Clamp to the model's
  // declared cap (cfg.model_output_caps) so turn 1 never over-asks and eats a 400. Unknown models fall
  // through to the discover+memoize path in postChatOllamaCloud. (2026-06-14: fixes the nemotron
  // per-turn cap-retry storm that made it look stuck.)
  const __modelCap = (cfg.model_output_caps || {})[model];
  if (Number.isFinite(__modelCap) && __modelCap > 0 && maxTokens > __modelCap) maxTokens = __modelCap;
  // Active toolset: none (--no-tools), read+fetch only (--no-exec drops bash), or the full operator set.
  // Governance parity holds either way — ANY tool a local lane calls still routes through executeTool
  // -> evaluateToolCall (safety-core protected-path/mutation gate), proven live. But a small local GGUF's
  // chat template is often unreliable on the multi-turn tool-result round-trip (ollama 400 "looks like
  // object"), so LOCAL lanes default tools OFF (reliable governed reasoning — the local-lane role) and
  // require explicit --tools to opt into the experimental gated loop. Cloud lanes keep tools on.
  const wantTools = opts.noTools === true ? false : (isLocal ? opts.forceTools === true : true);
  // Canonical-normalize the toolset once (absorbs whatever shape each TOOLS entry was authored in), so every
  // downstream consumer + per-provider renderer is shape-agnostic. --no-exec drops bash by canonical name.
  const activeTools = !wantTools ? [] : (opts.noExec ? TOOLS.map(normalizeTool).filter((t) => t.name !== 'bash' && t.name !== 'spawn_nano') : TOOLS.map(normalizeTool));
  // Loadout sizing: cloud lanes default to the full ~675-line stack (trivial vs 1M ctx). A local 9B
  // can't fit that in 8-32k ctx, so it defaults to the LIGHT spine (still a YURI operator, not a bare
  // chatbot) unless --full is forced. --system / --no-system override either way.
  const useLight = opts.light || (isLocal && !opts.full && !opts.system && !opts.noSystem);

  if (opts.dryRun) {
    const loadoutMode = opts.noSystem ? 'none' : (opts.system ? 'custom' : (useLight ? 'light' : 'full-yuri-stack'));
    const loadoutChars = loadoutMode === 'full-yuri-stack' ? buildYuriLoadout(model).length : (loadoutMode === 'light' ? (LIGHT_SYSTEM + nanoSwarmIdentityAnchor(model)).length : (opts.system?.length || 0));
    const apiPath = (isLocal || isOllamaCloud) ? `${endpoint}/api/chat` : (isAnthropic ? `${endpoint}/v1/messages` : `${endpoint}/chat/completions`);
    console.log(JSON.stringify({ lane: key, model, provider: cfg.provider, protocol: cfg.protocol, local: isLocal, cloud: isOllamaCloud, endpoint: apiPath, maxTokens, tools: activeTools.map((t) => t.name), loadout: loadoutMode, loadoutChars, contextChars: opts.context ? buildContextPack(opts.context).length : 0, contextWindow: cfg.context_window, hasKey: Boolean(apiKey) }, null, 2));
    return 0;
  }
  if (!prompt || !prompt.trim()) return fail(1, key, 'empty_prompt');
  if (!apiKey && !isLocal) return fail(3, key, `missing_key:${cfg.api_key_env}`);
  if (isLocal) assertLoopback(endpoint, key); else assertSafeEndpoint(endpoint, key);

  // Fire the YURI core on dispatch (energy ΔU trace + memory recall) — every lane call is hooked
  // into the core like a native turn, no matter who invokes it. One stable runId correlates the
  // energy trace, evidence record, and pulse for this dispatch. Returns a recall block to inject so
  // the lane carries the same episodic memory a native operator turn does.
  const runId = `llm-lane-${key}-${Date.now()}`;
  T(`PRE_CORE lane=${key} endpoint=${endpoint} keylen=${apiKey.length} maxTokens=${maxTokens}`);
  const { recallBlock } = await coreOnDispatch({ lane: key, prompt, runId });
  T(`POST_CORE recall=${recallBlock ? recallBlock.length : 0}`);

  // COST-TO-COMPLETION ADMISSION CHECK (DISARMED BY DEFAULT — governs nothing until the owner dual-arms
  // it: env YURI_COST_ADMISSION_ENFORCE=1 + flag file _SYSTEM/state/cost-admission.armed + a real cap
  // Marcel has NOT set). While disarmed, costAdmit() returns advisory_pass and this block is a no-op.
  // When fully armed and the estimate cannot fit the budget, it emits a clear warning; it only REFUSES
  // dispatch when the owner ALSO opts into hard-block via YURI_COST_ADMISSION_HARDBLOCK=1 (advisory by
  // default so arming a budget never silently strands a lane mid-session). Wrapped fail-OPEN: any error
  // in the gate must never break a real dispatch.
  let __costReservationId = null;
  try {
    const armState = costArmState();
    if (armState.enforced) {
      const taskSpec = {
        lane: key,
        model,
        promptChars: (prompt || '').length + (recallBlock ? recallBlock.length : 0),
        steps: Math.max(1, Number(opts.maxIters) ? Math.ceil(Number(opts.maxIters) * 0.5) : 3),
        reasoning: opts.reasoning || 'medium',
      };
      // Use the async actuals path so an armed decision reflects the real ledger (fail-conservative inside).
      const actuals = await costActualsAsync().catch(() => undefined);
      const decision = costAdmit(taskSpec, actuals ? { actuals } : {});
      __costReservationId = decision.reservationId || null;
      if (!decision.admitted) {
        const hardBlock = process.env.YURI_COST_ADMISSION_HARDBLOCK === '1';
        process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=cost_admission_${decision.decision} estUsd=${decision.estimate?.costUsd} cap=${decision.accounting?.capUsd}\n`);
        if (hardBlock) return fail(3, key, `cost_admission_reject:${decision.decision}:estUsd=${decision.estimate?.costUsd}:cap=${decision.accounting?.capUsd}`);
      }
    }
  } catch (e) {
    // Fail-open: a cost-gate fault must never kill a live dispatch.
    process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=cost_admission_gate_error msg=${String(e?.message || e).slice(0, 120)}\n`);
  }

  // GLOBAL LOCAL-INFERENCE ADMISSION CONTROL: any caller (this lane, another main lane, the worker,
  // another machine on a shared slots dir) must hold a concurrency slot before firing a local model.
  // Over threshold -> refuse with a clear signal so the caller enqueues instead of crashing the host.
  let __slotId = null;
  if (isLocal) {
    const slot = tryAcquireLocalSlot({ lane: key, model: cfg.model });
    if (!slot.ok) return fail(3, key, `local_capacity_reached:active=${slot.active}/max=${slot.max}:enqueue_via_ai_slm`);
    __slotId = slot.slotId;
  }
  try {
  const messages = [];
  let system = opts.noSystem ? '' : (opts.system || (useLight ? (LIGHT_SYSTEM + nanoSwarmIdentityAnchor(model)) : buildYuriLoadout(model)));
  if (system && recallBlock) system += `\n\n===== RECALLED YURI MEMORY (relevant to this task) =====\n${recallBlock}`;
  if (system) messages.push({ role: 'system', content: system });
  const contextPack = opts.context ? buildContextPack(opts.context) : '';
  if (contextPack) T(`CONTEXT_PACK chars=${contextPack.length}`);
  messages.push({ role: 'user', content: contextPack ? `${contextPack}\n\n===== TASK =====\n${prompt}` : prompt });

  const timeoutMs = Number(cfg.timeout_ms || 180000);
  const maxIters = Math.max(1, Number(opts.maxIters || 200));
  const nudgeAt = Math.max(3, Math.floor(maxIters * 0.6));
  const seenSigs = new Map();   // tool-sig -> occurrence count; only a GENUINE loop (3+ identical) nudges
  let toolTurns = 0;
  let lastChoice = {};
  for (let iter = 0; iter < maxIters; iter += 1) {
    T(`PRE_POSTCHAT iter=${iter}`);
    let choice;
    // activeTools is canonical → render to each transport's native tool shape at the seam (provider-agnostic).
    if (isLocal) {
      choice = await postChatOllamaLocal(endpoint, model, messages, maxTokens, toOpenAITools(activeTools), timeoutMs, key, cfg);
    } else if (isOllamaCloud) {
      choice = await postChatOllamaCloud(endpoint, apiKey, model, messages, maxTokens, toOpenAITools(activeTools), timeoutMs, key);
    } else if (isAnthropic) {
      const { messages: aMsgs, system: aSys } = toAnthropicMessages(messages);
      const aTools = activeTools.length ? toAnthropicTools(activeTools) : [];
      choice = await postMessagesAnthropicHttps(endpoint, apiKey, model, aMsgs, aSys, maxTokens, aTools, key, cfg.auth_header);
    } else {
      choice = await postChat(endpoint, apiKey, model, messages, maxTokens, toOpenAITools(activeTools), timeoutMs, key);
    }
    lastChoice = choice;
    T(`POST_POSTCHAT msglen=${(choice.message?.content || '').length} calls=${(choice.message?.tool_calls || []).length} finish=${choice.finish_reason}`);
    const msg = choice.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (activeTools.length && calls.length > 0) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      // Convergence guards for loop-prone models: detect a repeated tool+args batch and
      // count tool-only turns, then nudge toward a final answer before the hard iteration cap.
      const sig = calls.map((c) => `${c.function?.name}:${c.function?.arguments}`).sort().join('|');
      // BUILD-SAFE loop guard (2026-06-16, v2): the "stop using tools, give final answer" nudge is a
      // RESEARCH loop-breaker (stuck re-fetching) — it must NOT fire on a BUILD lane's normal iteration.
      // Re-running `node --check`/`--test` after a fix, or re-writing a file, is legitimate and repeats
      // by design. v1 (nudge on 1st repeat) killed builds before write_file (glm died at 5 turns); even
      // counting bash repeats (3+) still cut kimi off mid-build and made it DUMP the file as text.
      // v2: only a repeated READ/FETCH batch (genuine stuck-gathering) counts toward the loop nudge;
      // any batch containing bash/write_file/edit_file is a build action — bounded ONLY by the hard
      // turn backstop (nudgeAt), never by the repeat detector.
      // @anchor: v2 | failure: nano-swarm build lanes never wrote / dumped artifact as text (W5.1 indicators, 2026-06-16) | regression: feedback-nano-swarm-orchestration.md
      const BUILD_TOOLS = new Set(['bash', 'write_file', 'edit_file', 'apply_patch']);
      const isBuildBatch = calls.some((c) => BUILD_TOOLS.has(c.function?.name));
      const sigCount = (seenSigs.get(sig) || 0) + 1;
      seenSigs.set(sig, sigCount);
      toolTurns += 1;
      for (const tc of calls) {
        const result = await executeTool(tc.function?.name, tc.function?.arguments);
        process.stderr.write(`\x1b[2m[tool] ${tc.function?.name}\x1b[0m\n`);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: clip(result, 16000) });
      }
      const stuckGather = !isBuildBatch && sigCount >= 3;   // repeated read/fetch = genuinely stuck
      if (stuckGather || toolTurns >= nudgeAt) {
        messages.push({ role: 'user', content: 'You have gathered enough. Provide your final answer now as plain text — no further tool calls.' });
      }
      continue;
    }
    // No tool calls -> final answer.
    const text = String(msg.content ?? '').trim();
    const finish = String(choice.finish_reason || '').toLowerCase();
    const truncated = finish === 'length' || finish === 'incomplete';
    if (!text) {
      // EMPTY-FINAL-TURN-AFTER-TOOL-WORK is NOT a failure (2026-06-24): a build lane that wrote files /
      // ran bash this run and then ends its turn with empty text is DONE — the deliverable lives in the
      // side effects, not in a closing message. GLM-5.2 (and other tool-first models) routinely emit no
      // final prose after a write_file, which the old hard-fail mis-reported as `empty_output_stop` even
      // though the file WAS written (e.g. the 11KB plan that "failed"). Only a genuinely empty run
      // (zero tool turns) is a real empty_output failure.
      // @anchor: v1 | failure: glm-5.2 blocking lane empty_output_stop x3 while files were written 2026-06-24 | regression: feedback-nano-swarm-orchestration.md
      if (toolTurns > 0) {
        const note = `LANE_DONE tool_turns=${toolTurns} (model ended with no final text${finish ? `, finish=${finish}` : ''}; deliverable in tool side-effects)`;
        process.stdout.write(note + '\n');
        if (opts.out) fs.writeFileSync(path.resolve(opts.out), note);
        process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=empty_final_after_tools toolTurns=${toolTurns}\n`);
        coreOnResult({ lane: key, prompt, output: note, exitCode: 0, runId });
        return 0;
      }
      return fail(1, key, `empty_output${finish ? `_${finish}` : ''}`);
    }

    // Best-of-N rerank: if YURI_VERIFIER_BESTOFN=1 AND bestOfN > 1, collect N candidates and rerank
    const bestOfNEnabled = process.env.YURI_VERIFIER_BESTOFN === '1';
    const requestN = Number.isFinite(Number(opts.bestOfN)) ? Math.max(1, Math.floor(Number(opts.bestOfN))) : 1;
    const doBestOfN = bestOfNEnabled && requestN > 1;

    if (!doBestOfN) {
      // Default single-output path (BYTE-IDENTICAL when flag OFF)
      process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
      if (opts.out) fs.writeFileSync(path.resolve(opts.out), text);
      if (truncated) process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=ok_truncated_${finish}\n`);
      coreOnResult({ lane: key, prompt, output: text, exitCode: 0, runId });
      return 0;
    }

    // Best-of-N path: collect N candidates (including this first one)
    const candidates = [{ id: 'cand-0', text, finish, truncated }];
    for (let i = 1; i < requestN; i++) {
      // Fresh call with same messages (no tool calls since we're at final answer)
      let nextChoice;
      if (isLocal) {
        nextChoice = await postChatOllamaLocal(endpoint, model, messages, maxTokens, [], timeoutMs, key, cfg);
      } else if (isOllamaCloud) {
        nextChoice = await postChatOllamaCloud(endpoint, apiKey, model, messages, maxTokens, [], timeoutMs, key);
      } else if (isAnthropic) {
        const { messages: aMsgs, system: aSys } = toAnthropicMessages(messages);
        nextChoice = await postMessagesAnthropicHttps(endpoint, apiKey, model, aMsgs, aSys, maxTokens, [], key, cfg.auth_header);
      } else {
        nextChoice = await postChat(endpoint, apiKey, model, messages, maxTokens, [], timeoutMs, key);
      }
      const nextMsg = nextChoice.message || {};
      const nextText = String(nextMsg.content ?? '').trim();
      const nextFinish = String(nextChoice.finish_reason || '').toLowerCase();
      const nextTruncated = nextFinish === 'length' || nextFinish === 'incomplete';
      if (nextText) {
        candidates.push({ id: `cand-${i}`, text: nextText, finish: nextFinish, truncated: nextTruncated });
      }
    }

    // Score candidates using verifierBestOfN with a simple scoreFn
    // Score by: prefer non-truncated, then by length (heuristic for completeness)
    const scoreFn = (c) => {
      if (!c.text || c.text.length === 0) return { score: Infinity, veto: true, vetoReason: 'empty' };
      // Prefer non-truncated outputs
      const truncatedPenalty = c.truncated ? 10000 : 0;
      // Slight preference for longer (more complete) outputs, but capped
      const lengthScore = -Math.min(c.text.length, 5000);
      return { score: truncatedPenalty + lengthScore, veto: false };
    };

    const result = verifierBestOfN(candidates, scoreFn, {});
    const winner = result.winner;
    if (!winner) {
      // Fallback: first non-empty candidate
      const fallback = candidates.find(c => c.text && c.text.length > 0);
      if (fallback) {
        process.stdout.write(fallback.text + (fallback.text.endsWith('\n') ? '' : '\n'));
        if (opts.out) fs.writeFileSync(path.resolve(opts.out), fallback.text);
        coreOnResult({ lane: key, prompt, output: fallback.text, exitCode: 0, runId });
        return 0;
      }
      return fail(1, key, 'best_of_n_all_empty');
    }

    const outText = winner.text;
    process.stdout.write(outText + (outText.endsWith('\n') ? '' : '\n'));
    if (opts.out) fs.writeFileSync(path.resolve(opts.out), outText);
    if (winner.truncated) process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=ok_truncated_${winner.finish}\n`);
    coreOnResult({ lane: key, prompt, output: outText, exitCode: 0, runId });
    return 0;
  }
  // Loop exhausted while still tool-calling: force ONE final no-tools call so a loop-prone model
  // can never exit empty, then emit whatever text it produces.
  const forcedMsgsRaw = [...messages, { role: 'user', content: 'Stop using tools. Give your best final answer now as plain text.' }];
  let forced;
  if (isLocal) {
    forced = await postChatOllamaLocal(endpoint, model, forcedMsgsRaw, maxTokens, [], timeoutMs, key, cfg);
  } else if (isOllamaCloud) {
    forced = await postChatOllamaCloud(endpoint, apiKey, model, forcedMsgsRaw, maxTokens, [], timeoutMs, key);
  } else if (isAnthropic) {
    const { messages: aFMsgs, system: aFSys } = toAnthropicMessages(forcedMsgsRaw);
    forced = await postMessagesAnthropicHttps(endpoint, apiKey, model, aFMsgs, aFSys, maxTokens, [], key);
  } else {
    forced = await postChat(endpoint, apiKey, model, forcedMsgsRaw, maxTokens, [], timeoutMs, key);
  }
  const ftext = String(forced.message?.content ?? lastChoice.message?.content ?? '').trim();
  if (ftext) { process.stdout.write(`${ftext}\n`); if (opts.out) fs.writeFileSync(path.resolve(opts.out), ftext); coreOnResult({ lane: key, prompt, output: ftext, exitCode: 0, runId }); return 0; }
  return fail(1, key, 'tool_loop_no_final_answer');
  } finally {
    // Release the slot on clean return. fail()/process.exit paths leave a dead-pid lease that the
    // governor's prune() reclaims automatically, so capacity self-heals either way.
    if (__slotId) releaseLocalSlot(__slotId);
    // Release any held cost reservation (armed path only; __costReservationId is null when disarmed).
    // Fail-open: never let reservation cleanup break the return.
    if (__costReservationId) { try { costRelease(__costReservationId); } catch { /* */ } }
  }
}

function readMaybeFile(v) { return v && v.startsWith('@') ? fs.readFileSync(path.resolve(v.slice(1)), 'utf8') : v; }

// Front-load a must-read context pack INTO the dispatch so the lane starts with the exact files it
// needs (guaranteed + fast), instead of spending turns discovering them via tools. The dispatcher
// decides the must-reads per task (proportional — match the pack to the task, do not dump the repo).
// spec = comma-list of paths, or @manifest (one path per line). Budget-capped via LLM_LANE_CONTEXT_BUDGET
// (default 240k chars). Protected surfaces are refused.
function buildContextPack(spec) {
  if (!spec) return '';
  const list = spec.startsWith('@')
    ? fs.readFileSync(path.resolve(spec.slice(1)), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : spec.split(',').map((s) => s.trim()).filter(Boolean);
  const BUDGET = Number(process.env.LLM_LANE_CONTEXT_BUDGET || 240000);
  let used = 0; const parts = [];
  for (const f of list) {
    try {
      if (isProtectedPath(path.resolve(REPO_ROOT, f))) { parts.push(`## ${f}\n[blocked: protected surface]`); continue; }
      let body = fs.readFileSync(path.resolve(f), 'utf8');
      const remaining = BUDGET - used;
      if (remaining <= 0) { parts.push(`## ${f}\n[omitted — context budget reached]`); continue; }
      let truncated = false;
      if (body.length > remaining) { body = body.slice(0, remaining); truncated = true; }
      used += body.length;
      parts.push(`## ${f}${truncated ? ' (truncated to budget)' : ''}\n\`\`\`\n${body}\n\`\`\``);
    } catch (e) { parts.push(`## ${f}\n[unreadable: ${String(e?.message || e).slice(0, 80)}]`); }
  }
  return parts.length
    ? `===== PRELOADED CONTEXT — read these first; already provided, do NOT re-fetch them with tools =====\n\n${parts.join('\n\n')}\n\n===== END PRELOADED CONTEXT =====`
    : '';
}

const LEGACY_SKIP = new Set(['--no-tools-legacy', '--fresh', '--no-session', '--route-only']);
const LEGACY_SKIP_VALUE = new Set(['--session', '--write-scope', '--ts']);

function parseCli(argv) {
  const out = { reasoning: '', system: '', noSystem: false, light: false, full: false, noTools: false, noExec: false, maxIters: 200, out: '', dryRun: false, list: false, model: '', bestOfN: 1 };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reasoning') out.reasoning = argv[++i] || '';
    else if (a === '--model' || a === '-m') out.model = argv[++i] || '';
    else if (a === '--system') out.system = readMaybeFile(argv[++i] || '');
    else if (a === '--no-system') out.noSystem = true;
    else if (a === '--light') out.light = true;
    else if (a === '--full') out.full = true;
    else if (a === '--tools') out.forceTools = true;
    else if (a === '--no-tools') out.noTools = true;
    else if (a === '--no-exec') out.noExec = true;
    else if (a === '--max-iters') out.maxIters = Number(argv[++i] || 24);
    else if (a === '--out') out.out = argv[++i] || '';
    else if (a === '--context' || a === '--read') out.context = argv[++i] || '';
    else if (a === '--best-of-n') out.bestOfN = Number(argv[++i] || 1);
    else if (a === '--dry-run' || a === '-d') out.dryRun = true;
    else if (a === '--list') out.list = true;
    else if (LEGACY_SKIP_VALUE.has(a)) i += 1;
    else if (LEGACY_SKIP.has(a) || a.startsWith('--')) continue;
    else rest.push(a);
  }
  out.lane = rest.shift() || '';
  out.prompt = rest.join(' ');
  return out;
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  T(`MAIN_START lane=${cli.lane} promptLen=${(cli.prompt || '').length} dryRun=${cli.dryRun} list=${cli.list}`);
  if (cli.list) { console.log(JSON.stringify(Object.keys(LANES).filter((k) => k !== '_comment'), null, 2)); return 0; }
  if (!cli.lane) { process.stderr.write('Usage: llm-lane <deepseek|ds-flash|mimo> "<prompt>" [--reasoning d] [--no-tools] [--system s] [--out f] [--dry-run] [--best-of-n N]\n'); process.exit(2); }
  let prompt = cli.prompt || process.env.LLM_COMPAT_PROMPT_TEXT || '';
  if (!prompt && !cli.dryRun && !process.stdin.isTTY) prompt = fs.readFileSync(0, 'utf8');
  T(`MAIN_RETURN_DISPATCH lane=${cli.lane} plen=${prompt.length} stdinTTY=${process.stdin.isTTY}`);
  return dispatch(cli.lane, prompt, cli);
}

// Run the CLI only when executed directly — NOT when imported for its exports (tests, callers).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // A transient undici transport error can surface as a DETACHED rejection (a pooled socket erroring
  // after the awaited fetch already settled) that escapes the postChat try/catch and would otherwise
  // crash bare as "AggregateError". Convert any escaped rejection/exception into a CLEAN, categorized
  // LLM_COMPAT_FAIL exit so the orchestrator detects a non-zero exit and retries, instead of a bare crash.
  const onFatal = (err) => fail(1, 'llm-lane', `uncaught:${err?.cause?.code || err?.name || 'fatal'}`);
  process.on('unhandledRejection', onFatal);
  process.on('uncaughtException', onFatal);
  // Flush-safe exit: set exitCode and let the event loop drain stdout/stderr, instead of an eager
  // process.exit() that truncates async-buffered output when stdout is a pipe/file (non-TTY). A
  // short unref'd watchdog forces exit if a keep-alive socket lingers, so we never hang either.
  main().then((c) => {
    process.exitCode = c || 0;
    const w = setTimeout(() => process.exit(process.exitCode || 0), 2000);
    if (typeof w.unref === 'function') w.unref();
  }).catch((err) => fail(1, 'llm-lane', err?.message || 'fatal'));
}

export { dispatch, assertSafeEndpoint, assertLoopback, postChatOllamaLocal, postChatOllamaCloud, isPrivateHost, isProtectedPath, maxTokensFor, ALIAS, ALLOWED_HOSTS, LANES, executeTool, toAnthropicMessages, toAnthropicTools, toOpenAITools, normalizeTool, renderTools, laneCommandAllowed };
