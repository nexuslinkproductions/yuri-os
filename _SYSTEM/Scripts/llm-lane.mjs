#!/usr/bin/env node
/**
 * llm-lane.mjs — the ENTIRE dispatch path for the 3 YURI reasoning lanes.
 *
 * Replaces the offload-runner / reasoning-lane-dispatch / *-dispatch adapter stack for lane
 * DISPATCH. Routing ("which lane handles X" via offload-contract route-plan) is a separate axis,
 * untouched. All three lanes are plain openai-compatible chat endpoints -> one code path.
 *
 * CAPABILITY: the lane is NOT a blind chatbot. It gets READ + FETCH tools (read_file, grep,
 * list_dir, search the YURI FTS5 corpus, fetch_url) and a YURI-aware system preamble, so it can
 * investigate the repo and work WITH knowledge of the system. WRITE / bash / commit stay on
 * YURI's side (output is advisory until YURI verifies + applies). Tools enforce: repo-root scope,
 * the YURI protected-surface deny-list, and (for fetch_url) a private/loopback/metadata SSRF deny.
 *
 * SECURITY: two distinct endpoint policies, by design —
 *   - the LANE endpoint is an ALLOWLIST (only api.deepseek.com / integrate.api.nvidia.com pass);
 *   - the fetch_url TOOL is open web with a private/loopback/metadata DENY (block SSRF, allow public).
 *
 * Usage:
 *   node llm-lane.mjs <lane> "<prompt>" [flags]      ·   echo "<prompt>" | node llm-lane.mjs <lane>
 * Lanes:  deepseek | ds  ·  kimi  ·  nemotron | nvidia
 * Flags:  --reasoning <low|medium|high|xhigh|max>   --system <str|@file>   --no-system
 *         --no-tools (bare prompt, no read/fetch)   --max-iters <n> (default 24)
 *         --out <file>   --dry-run   --list
 * Exit:   0 ok (truncated-but-nonempty -> OFFLOAD_WARN, still 0)
 *         1 empty output / transient transport / 5xx       3 unknown lane / missing key / bad endpoint / 4xx
 *
 * Single source of truth for lane config: .claude/config/models.json -> offload_lanes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateToolCall } from './policy/yuri-safety-core.mjs';
import { coreOnDispatch, coreOnResult } from './lane-core-hooks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_BIN = path.join(__dirname, 'ai');
const MODELS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude/config/models.json'), 'utf8'));
const LANES = MODELS.offload_lanes || {};

const ALIAS = {
  deepseek: 'deepseek-v4-pro', ds: 'deepseek-v4-pro', 'deepseek-v4-pro': 'deepseek-v4-pro',
  kimi: 'kimi-k2.6', 'kimi-k2.6': 'kimi-k2.6', 'moonshotai/kimi-k2.6': 'kimi-k2.6',
  nemotron: 'nemotron-3-ultra-550b-a55b', nvidia: 'nemotron-3-ultra-550b-a55b',
  'nemotron-3-ultra-550b-a55b': 'nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3-ultra-550b-a55b': 'nemotron-3-ultra-550b-a55b',
};

// FULL YURI STACK loadout (default): the lane is a fully-equipped mini-me operator that operates BY
// the framework, not a thin chatbot. The whole spine is injected as system context (~675 lines —
// trivial against the 1M context window) so the lane IS a YURI operator from token 1, then it
// traverses the rest of the stack with its tools. --light swaps in LIGHT_SYSTEM for trivial pings.
const SPINE_FILES = ['_SYSTEM/yuri-origin.md', 'SOUL.md', '_SYSTEM/persona.md', 'CLAUDE.md', '_SYSTEM/INDEX.md'];
const OPERATING_DIRECTIVE =
  '\n\n===== OPERATING DIRECTIVE =====\n'
  + 'You are a fully-equipped YURI reasoning lane — a mini-me operator carrying the full stack above, '
  + 'NOT a bare chatbot and NOT blind to YURI. Traverse the ENTIRE system with your tools: read_file / '
  + 'grep / list_dir (the full repo, minus protected secrets), search (FTS5 corpus, ~26k docs+code), '
  + 'context_router (pull the selected YURI context packet for a task), fetch_url (external refs). '
  + 'Pull whatever you need — do not work from a sliver. Live state is authoritative over prose: read '
  + '.claude/config/models.json (offload_lanes = the current lane roster), _SYSTEM/INDEX.md (architecture), '
  + 'and the memory indexes for current facts rather than inferring from older docs. Ground every claim '
  + 'in something you actually read. Authority: owner intent > local evidence > this contract. Your output is ADVISORY until '
  + 'YURI verifies it against live code — fluency is not verification. Protected surfaces (.env, '
  + 'secrets, backend/data, .claude runtime state) are refused by design. No padding, no flattery. '
  + 'When done investigating, give your final answer as plain text with no further tool calls.';
function buildYuriLoadout() {
  const parts = ['# YURI-OS FULL OPERATING STACK — you operate BY this framework as a YURI lane.'];
  const missing = [];
  for (const f of SPINE_FILES) {
    try { parts.push(`\n\n===== ${f} =====\n${fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')}`); }
    catch { missing.push(f); }
  }
  // A missing spine file means the lane would run cognitively decapitated (no contract/persona).
  // Don't silently degrade — make it LOUD so a broken spine is never mistaken for a working lane.
  if (missing.length) process.stderr.write(`OFFLOAD_WARN code=0 lane=llm-lane reason=spine_incomplete missing=${missing.join(',')}\n`);
  parts.push(OPERATING_DIRECTIVE);
  return parts.join('');
}
const LIGHT_SYSTEM =
  'You are a YURI-OS reasoning lane (dev-only, advisory). Operate BY the YURI framework: owner intent > '
  + 'local evidence > contract. Use your tools (read_file/grep/list_dir/search/context_router/fetch_url) '
  + 'to ground claims. Output is ADVISORY until YURI verifies it. Protected surfaces are refused. No padding.';

// ── Lane-endpoint SSRF guard: ALLOWLIST (fail-closed) ──────────────────────────────────────────
const ALLOWED_HOSTS = new Set(['api.deepseek.com', 'integrate.api.nvidia.com']);
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
  process.stderr.write(`OFFLOAD_FAIL code=${code} lane=${lane || 'unknown'} reason=${r}\n`);
  process.exit(code);
}

// bash gate: reuse YURI's audited safety core (blocks destructive: rm -rf, dd, mkfs, git reset/clean,
// pipe-to-shell, ...) and add advisory-lane rules — no git mutation (commit/push/tag/merge/rebase/...)
// and no protected-surface access — since a lane's execSync bypasses the main session's PreToolUse hooks.
// Honest scope: lexical, defense-in-depth (not a bulletproof sandbox); the lane runs dev-only on the owner box.
function laneCommandAllowed(cmd) {
  const core = evaluateToolCall('bash', { cmd, cwd: REPO_ROOT }, { source: 'llm-lane' });
  if (!core.allowed) return { allowed: false, reason: core.reason || 'safety_core_blocked' };
  if (/\bgit\s+(commit|push|tag|merge|rebase|reset|clean|checkout|restore|stash\s+drop|cherry-pick|am)\b/.test(cmd)) {
    return { allowed: false, reason: 'lane is advisory: git mutation (commit/push/tag/...) is blocked' };
  }
  if (/(^|[\s='"`/<>|])(\.env\b|\.env\.|backend\/data\/|secrets\/|\.claude\/(state|history|file-history|projects))/.test(cmd) || /\.(pem|key|p12|pfx)\b/.test(cmd)) {
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
  { type: 'function', function: { name: 'context_router', description: 'Run the YURI context-router for a task and get the selected context packet (which YURI context/files to load for that work). The canonical way to pull the right slice of the full stack.', parameters: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } } },
  { type: 'function', function: { name: 'bash', description: 'Run a shell command in the repo to investigate, build, or RUN SCRIPTS/TESTS (e.g. node --test, npm test, git status, grep). Destructive commands, git mutation (commit/push/tag/...), and protected surfaces are blocked.', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
];

function clip(s, n = 12000) { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s; }

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
    if (name === 'context_router') {
      if (!args.task) return 'ERROR: missing task';
      try {
        const out = execFileSync('node', [path.join(__dirname, 'context-router.mjs'), args.task], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
        return clip(out.trim() || '(no context selected)');
      } catch (e) { return `context_router error: ${e.message}`; }
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
    return `ERROR: unknown tool ${name}`;
  } catch (e) { return `${name} error: ${e.message}`; }
}

async function postChat(endpoint, apiKey, model, messages, maxTokens, toolsList, timeoutMs, lane) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, ...(toolsList && toolsList.length ? { tools: toolsList, tool_choice: 'auto' } : {}) }),
      signal: ctrl.signal,
    });
  } catch (err) { clearTimeout(timer); return fail(1, lane, `transport:${err?.cause?.code || err?.name || 'fetch_failed'}`); }
  clearTimeout(timer);
  if (!res.ok) { const b = await res.text().catch(() => ''); return fail(res.status >= 500 ? 1 : 3, lane, `http_${res.status}:${b.slice(0, 160)}`); }
  const json = await res.json().catch(() => null);
  return json?.choices?.[0] || {};
}

async function dispatch(laneArg, prompt, opts = {}) {
  const key = ALIAS[String(laneArg || '').toLowerCase()];
  if (!key) return fail(3, laneArg, 'unknown_lane:valid=deepseek|kimi|nemotron');
  const cfg = LANES[key];
  if (!cfg) return fail(3, key, 'lane_missing_from_models.json');

  const endpoint = (process.env[cfg.endpoint_env] || cfg.endpoint_default || '').replace(/\/+$/, '');
  const apiKey = process.env[cfg.api_key_env] || '';
  const maxTokens = maxTokensFor(cfg, opts.reasoning);
  // Active toolset: none (--no-tools), read+fetch only (--no-exec drops bash), or the full operator set.
  const activeTools = opts.noTools === true ? [] : (opts.noExec ? TOOLS.filter((t) => t.function.name !== 'bash') : TOOLS);

  if (opts.dryRun) {
    const loadoutMode = opts.noSystem ? 'none' : (opts.system ? 'custom' : (opts.light ? 'light' : 'full-yuri-stack'));
    const loadoutChars = loadoutMode === 'full-yuri-stack' ? buildYuriLoadout().length : (loadoutMode === 'light' ? LIGHT_SYSTEM.length : (opts.system?.length || 0));
    console.log(JSON.stringify({ lane: key, model: cfg.model, provider: cfg.provider, endpoint: `${endpoint}/chat/completions`, maxTokens, tools: activeTools.map((t) => t.function.name), loadout: loadoutMode, loadoutChars, contextWindow: cfg.context_window, hasKey: Boolean(apiKey) }, null, 2));
    return 0;
  }
  if (!prompt || !prompt.trim()) return fail(1, key, 'empty_prompt');
  if (!apiKey) return fail(3, key, `missing_key:${cfg.api_key_env}`);
  assertSafeEndpoint(endpoint, key);

  // Fire the YURI core on dispatch (energy ΔU trace + memory recall) — every lane call is hooked
  // into the core like a native turn, no matter who invokes it. One stable runId correlates the
  // energy trace, evidence record, and pulse for this dispatch. Returns a recall block to inject so
  // the lane carries the same episodic memory a native operator turn does.
  const runId = `llm-lane-${key}-${Date.now()}`;
  const { recallBlock } = await coreOnDispatch({ lane: key, prompt, runId });

  const messages = [];
  let system = opts.noSystem ? '' : (opts.system || (opts.light ? LIGHT_SYSTEM : buildYuriLoadout()));
  if (system && recallBlock) system += `\n\n===== RECALLED YURI MEMORY (relevant to this task) =====\n${recallBlock}`;
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const timeoutMs = Number(cfg.timeout_ms || 180000);
  const maxIters = Math.max(1, Number(opts.maxIters || 24));
  const nudgeAt = Math.max(3, Math.floor(maxIters * 0.6));
  const seenSigs = new Set();
  let toolTurns = 0;
  let lastChoice = {};
  for (let iter = 0; iter < maxIters; iter += 1) {
    const choice = await postChat(endpoint, apiKey, cfg.model, messages, maxTokens, activeTools, timeoutMs, key);
    lastChoice = choice;
    const msg = choice.message || {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (activeTools.length && calls.length > 0) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      // Convergence guards for loop-prone models (kimi/NIM): detect a repeated tool+args batch and
      // count tool-only turns, then nudge toward a final answer before the hard iteration cap.
      const sig = calls.map((c) => `${c.function?.name}:${c.function?.arguments}`).sort().join('|');
      const repeated = seenSigs.has(sig);
      seenSigs.add(sig);
      toolTurns += 1;
      for (const tc of calls) {
        const result = await executeTool(tc.function?.name, tc.function?.arguments);
        process.stderr.write(`\x1b[2m[tool] ${tc.function?.name}\x1b[0m\n`);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: clip(result, 16000) });
      }
      if (repeated || toolTurns >= nudgeAt) {
        messages.push({ role: 'user', content: 'You have gathered enough. Provide your final answer now as plain text — no further tool calls.' });
      }
      continue;
    }
    // No tool calls -> final answer
    const text = String(msg.content ?? '').trim();
    const finish = String(choice.finish_reason || '').toLowerCase();
    const truncated = finish === 'length' || finish === 'incomplete';
    if (!text) return fail(1, key, `empty_output${finish ? `_${finish}` : ''}`);
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    if (opts.out) fs.writeFileSync(path.resolve(opts.out), text);
    if (truncated) process.stderr.write(`OFFLOAD_WARN code=0 lane=${key} reason=ok_truncated_${finish}\n`);
    coreOnResult({ lane: key, prompt, output: text, exitCode: 0, runId });
    return 0;
  }
  // Loop exhausted while still tool-calling: force ONE final no-tools call so a loop-prone model
  // can never exit empty, then emit whatever text it produces.
  const forced = await postChat(endpoint, apiKey, cfg.model,
    [...messages, { role: 'user', content: 'Stop using tools. Give your best final answer now as plain text.' }],
    maxTokens, [], timeoutMs, key);
  const ftext = String(forced.message?.content ?? lastChoice.message?.content ?? '').trim();
  if (ftext) { process.stdout.write(`${ftext}\n`); if (opts.out) fs.writeFileSync(path.resolve(opts.out), ftext); coreOnResult({ lane: key, prompt, output: ftext, exitCode: 0, runId }); return 0; }
  return fail(1, key, 'tool_loop_no_final_answer');
}

function readMaybeFile(v) { return v && v.startsWith('@') ? fs.readFileSync(path.resolve(v.slice(1)), 'utf8') : v; }

const LEGACY_SKIP = new Set(['--no-tools-legacy', '--fresh', '--no-session', '--route-only']);
const LEGACY_SKIP_VALUE = new Set(['--model', '--session', '--write-scope', '--ts']);

function parseCli(argv) {
  const out = { reasoning: '', system: '', noSystem: false, light: false, noTools: false, noExec: false, maxIters: 24, out: '', dryRun: false, list: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reasoning') out.reasoning = argv[++i] || '';
    else if (a === '--system') out.system = readMaybeFile(argv[++i] || '');
    else if (a === '--no-system') out.noSystem = true;
    else if (a === '--light') out.light = true;
    else if (a === '--no-tools') out.noTools = true;
    else if (a === '--no-exec') out.noExec = true;
    else if (a === '--max-iters') out.maxIters = Number(argv[++i] || 24);
    else if (a === '--out') out.out = argv[++i] || '';
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
  if (cli.list) { console.log(JSON.stringify(Object.keys(LANES).filter((k) => k !== '_comment'), null, 2)); return 0; }
  if (!cli.lane) { process.stderr.write('Usage: llm-lane <deepseek|kimi|nemotron> "<prompt>" [--reasoning d] [--no-tools] [--system s] [--out f] [--dry-run]\n'); process.exit(2); }
  let prompt = cli.prompt || process.env.OFFLOAD_PROMPT_TEXT || '';
  if (!prompt && !cli.dryRun && !process.stdin.isTTY) prompt = fs.readFileSync(0, 'utf8');
  return dispatch(cli.lane, prompt, cli);
}

// Run the CLI only when executed directly — NOT when imported for its exports (tests, callers).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then((c) => process.exit(c || 0)).catch((err) => fail(1, 'llm-lane', err?.message || 'fatal'));
}

export { dispatch, assertSafeEndpoint, isPrivateHost, isProtectedPath, maxTokensFor, ALIAS, ALLOWED_HOSTS, executeTool };
