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
 * Lanes:  deepseek | ds  ·  ds-flash  ·  mimo (Anthropic-protocol, 1M context)
 * Flags:  --reasoning <low|medium|high|xhigh|max>   --system <str|@file>   --no-system
 *         --no-tools (bare prompt, no read/fetch)   --max-iters <n> (default 24)
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
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateToolCall } from './policy/yuri-safety-core.mjs';
import { coreOnDispatch, coreOnResult } from './lane-core-hooks.mjs';

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
  + 'xref_query (unified FTS5/graph/GitNexus/spectrum retrieval), propagation_scan (dry-run propagation-law sibling checks), fetch_url (external refs). '
  + 'Pull whatever you need — do not work from a sliver. Live state is authoritative over prose: read '
  + '.claude/config/models.json (llm_compat_lanes = the current lane roster), _SYSTEM/INDEX.md (architecture), '
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
  if (missing.length) process.stderr.write(`LLM_COMPAT_WARN code=0 lane=llm-lane reason=spine_incomplete missing=${missing.join(',')}\n`);
  parts.push(OPERATING_DIRECTIVE);
  return parts.join('');
}
const LIGHT_SYSTEM =
  'You are a YURI-OS reasoning lane (dev-only, advisory). Operate BY the YURI framework: owner intent > '
  + 'local evidence > contract. Use your tools (read_file/grep/list_dir/search/xref_query/propagation_scan/fetch_url) '
  + 'to ground claims. Output is ADVISORY until YURI verifies it. Protected surfaces are refused. No padding.';

// ── Lane-endpoint SSRF guard: ALLOWLIST (fail-closed) ──────────────────────────────────────────
const ALLOWED_HOSTS = new Set(['api.deepseek.com', 'token-plan-ams.xiaomimimo.com']);
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
  { type: 'function', function: { name: 'xref_query', description: 'Run YURI xref-query across FTS5, circuitry graph, GitNexus, mechanism spectrum, and provenance scoring. Use before broad repo navigation; raise top/scan or set all=true for thousand-hit recall.', parameters: { type: 'object', properties: { query: { type: 'string' }, node: { type: 'string' }, top: { type: 'number' }, scan: { type: 'number' }, all: { type: 'boolean' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'propagation_scan', description: 'Run YURI propagation-scan in dry-run mode for a known circuitry node id to inspect sibling surfaces before edits.', parameters: { type: 'object', properties: { nodeId: { type: 'string' }, top: { type: 'number' }, force: { type: 'boolean' } }, required: ['nodeId'] } } },
  { type: 'function', function: { name: 'bash', description: 'Run a shell command in the repo to investigate, build, or RUN SCRIPTS/TESTS (e.g. node --test, npm test, git status, grep). Destructive commands, git mutation (commit/push/tag/...), and protected surfaces are blocked.', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } },
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

// Convert OpenAI tool definitions to Anthropic tool definitions.
function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || '',
    input_schema: t.function.parameters || { type: 'object', properties: {}, required: [] },
  }));
}

// Streaming Anthropic Messages API over node:https (SSE). No idle timeout — a slow reasoner must
// never be killed by a clock; first byte is prompt under streaming. Returns the same
// { message: { content, tool_calls? }, finish_reason } shape the OpenAI postChat path returns,
// so the dispatch loop is protocol-agnostic — it just picks the transport by cfg.protocol.
function postMessagesAnthropicHttps(endpoint, apiKey, model, messages, system, maxTokens, toolsList, lane) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(`${endpoint}/v1/messages`); } catch { resolve(fail(3, lane, 'bad_endpoint_url')); return; }
    const body = { model, messages, max_tokens: maxTokens, stream: true };
    if (system) body.system = system;
    if (toolsList && toolsList.length) body.tools = toolsList;
    const payload = JSON.stringify(body);
    T(`ANTHROPIC_REQ_START lane=${lane} host=${u.hostname} bodyLen=${payload.length}`);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        Accept: 'text/event-stream',
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

async function postChat(endpoint, apiKey, model, messages, maxTokens, toolsList, timeoutMs, lane) {
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, ...(toolsList && toolsList.length ? { tools: toolsList, tool_choice: 'auto' } : {}) });
  // Transient transport failures (undici keep-alive socket reuse against a server that drops idle
  // connections → "AggregateError: fetch failed", ECONNRESET, DNS blips) are RETRIED with a fresh
  // connection + backoff. `Connection: close` opts out of pooled-socket reuse — the actual root cause
  // of the intermittent AggregateError — so each one-shot lane call gets a clean socket. 5xx is retried
  // (transient server); 4xx is terminal. This keeps the night's repeated dispatches from dying on a blip.
  const ATTEMPTS = 3;
  let res;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Connection: 'close' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      const reason = err?.cause?.code || err?.name || 'fetch_failed';
      if (attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=transport_retry_${attempt}:${reason}\n`); await sleep(400 * attempt); continue; }
      return fail(1, lane, `transport:${reason}`);
    }
    if (res.status >= 500 && attempt < ATTEMPTS) { process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${lane} reason=http5xx_retry_${attempt}:${res.status}\n`); await sleep(400 * attempt); continue; }
    break;
  }
  if (!res.ok) { const b = await res.text().catch(() => ''); return fail(res.status >= 500 ? 1 : 3, lane, `http_${res.status}:${b.slice(0, 160)}`); }
  const json = await res.json().catch(() => null);
  return json?.choices?.[0] || {};
}

async function dispatch(laneArg, prompt, opts = {}) {
  const key = ALIAS[String(laneArg || '').toLowerCase()];
  if (!key) return fail(3, laneArg, 'unknown_lane:valid=deepseek|ds-flash|mimo');
  const cfg = LANES[key];
  if (!cfg) return fail(3, key, 'lane_missing_from_models.json');

  const isAnthropic = cfg.protocol === 'anthropic' || cfg.protocol === 'anthropic-compatible';
  const endpoint = (process.env[cfg.endpoint_env] || cfg.endpoint_default || '').replace(/\/+$/, '');
  const apiKey = process.env[cfg.api_key_env] || '';
  const maxTokens = maxTokensFor(cfg, opts.reasoning);
  // Active toolset: none (--no-tools), read+fetch only (--no-exec drops bash), or the full operator set.
  const activeTools = opts.noTools === true ? [] : (opts.noExec ? TOOLS.filter((t) => t.function.name !== 'bash') : TOOLS);

  if (opts.dryRun) {
    const loadoutMode = opts.noSystem ? 'none' : (opts.system ? 'custom' : (opts.light ? 'light' : 'full-yuri-stack'));
    const loadoutChars = loadoutMode === 'full-yuri-stack' ? buildYuriLoadout().length : (loadoutMode === 'light' ? LIGHT_SYSTEM.length : (opts.system?.length || 0));
    const apiPath = isAnthropic ? `${endpoint}/v1/messages` : `${endpoint}/chat/completions`;
    console.log(JSON.stringify({ lane: key, model: cfg.model, provider: cfg.provider, protocol: cfg.protocol, endpoint: apiPath, maxTokens, tools: activeTools.map((t) => t.function.name), loadout: loadoutMode, loadoutChars, contextChars: opts.context ? buildContextPack(opts.context).length : 0, contextWindow: cfg.context_window, hasKey: Boolean(apiKey) }, null, 2));
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
  T(`PRE_CORE lane=${key} endpoint=${endpoint} keylen=${apiKey.length} maxTokens=${maxTokens}`);
  const { recallBlock } = await coreOnDispatch({ lane: key, prompt, runId });
  T(`POST_CORE recall=${recallBlock ? recallBlock.length : 0}`);

  const messages = [];
  let system = opts.noSystem ? '' : (opts.system || (opts.light ? LIGHT_SYSTEM : buildYuriLoadout()));
  if (system && recallBlock) system += `\n\n===== RECALLED YURI MEMORY (relevant to this task) =====\n${recallBlock}`;
  if (system) messages.push({ role: 'system', content: system });
  const contextPack = opts.context ? buildContextPack(opts.context) : '';
  if (contextPack) T(`CONTEXT_PACK chars=${contextPack.length}`);
  messages.push({ role: 'user', content: contextPack ? `${contextPack}\n\n===== TASK =====\n${prompt}` : prompt });

  const timeoutMs = Number(cfg.timeout_ms || 180000);
  const maxIters = Math.max(1, Number(opts.maxIters || 24));
  const nudgeAt = Math.max(3, Math.floor(maxIters * 0.6));
  const seenSigs = new Set();
  let toolTurns = 0;
  let lastChoice = {};
  for (let iter = 0; iter < maxIters; iter += 1) {
    T(`PRE_POSTCHAT iter=${iter}`);
    let choice;
    if (isAnthropic) {
      const { messages: aMsgs, system: aSys } = toAnthropicMessages(messages);
      const aTools = activeTools.length ? toAnthropicTools(activeTools) : [];
      choice = await postMessagesAnthropicHttps(endpoint, apiKey, cfg.model, aMsgs, aSys, maxTokens, aTools, key);
    } else {
      choice = await postChat(endpoint, apiKey, cfg.model, messages, maxTokens, activeTools, timeoutMs, key);
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
    // No tool calls -> final answer.
    const text = String(msg.content ?? '').trim();
    const finish = String(choice.finish_reason || '').toLowerCase();
    const truncated = finish === 'length' || finish === 'incomplete';
    if (!text) return fail(1, key, `empty_output${finish ? `_${finish}` : ''}`);
    process.stdout.write(text + (text.endsWith('\n') ? '' : '\n'));
    if (opts.out) fs.writeFileSync(path.resolve(opts.out), text);
    if (truncated) process.stderr.write(`LLM_COMPAT_WARN code=0 lane=${key} reason=ok_truncated_${finish}\n`);
    coreOnResult({ lane: key, prompt, output: text, exitCode: 0, runId });
    return 0;
  }
  // Loop exhausted while still tool-calling: force ONE final no-tools call so a loop-prone model
  // can never exit empty, then emit whatever text it produces.
  const forcedMsgsRaw = [...messages, { role: 'user', content: 'Stop using tools. Give your best final answer now as plain text.' }];
  let forced;
  if (isAnthropic) {
    const { messages: aFMsgs, system: aFSys } = toAnthropicMessages(forcedMsgsRaw);
    forced = await postMessagesAnthropicHttps(endpoint, apiKey, cfg.model, aFMsgs, aFSys, maxTokens, [], key);
  } else {
    forced = await postChat(endpoint, apiKey, cfg.model, forcedMsgsRaw, maxTokens, [], timeoutMs, key);
  }
  const ftext = String(forced.message?.content ?? lastChoice.message?.content ?? '').trim();
  if (ftext) { process.stdout.write(`${ftext}\n`); if (opts.out) fs.writeFileSync(path.resolve(opts.out), ftext); coreOnResult({ lane: key, prompt, output: ftext, exitCode: 0, runId }); return 0; }
  return fail(1, key, 'tool_loop_no_final_answer');
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
      if (isProtectedPath(path.relative(REPO_ROOT, path.resolve(f)))) { parts.push(`## ${f}\n[blocked: protected surface]`); continue; }
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
    else if (a === '--context' || a === '--read') out.context = argv[++i] || '';
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
  if (!cli.lane) { process.stderr.write('Usage: llm-lane <deepseek|ds-flash|mimo> "<prompt>" [--reasoning d] [--no-tools] [--system s] [--out f] [--dry-run]\n'); process.exit(2); }
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

export { dispatch, assertSafeEndpoint, isPrivateHost, isProtectedPath, maxTokensFor, ALIAS, ALLOWED_HOSTS, executeTool, toAnthropicMessages, toAnthropicTools };
