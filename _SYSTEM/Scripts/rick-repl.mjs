#!/usr/bin/env node
/**
 * rick-repl.mjs — Rick/YURI local harness.
 *
 * Plain stdout scroll, fixed bottom prompt, lane routing, advisory Shintai,
 * memory recall, shell-block auto-exec guardrails, and browser-harness bridge.
 */

import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, appendFileSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printBanner } from './rick-banner.mjs';
import { healthCheckAll } from './worker-tmux.mjs';
import { harnessViewport } from './browser-harness-bridge.mjs';
import { classifyRickRoute, formatRouteDecision } from './rick-route-classifier.mjs';
import { appendRouteDecisionEvent } from './kagami-event-bus.mjs';
import { buildUserProfilePromptBlock } from './kagami-user-profile.mjs';
import { recommendKagamiFanout } from './kagami-control-domain.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RICK_REPL_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_SH = path.join(__dirname, 'ai');
const MEMORY_PATH = path.join(__dirname, 'lane-memory.mjs');
const HISTORY_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'rick-history.jsonl');
const GOAL_DOC = path.join(REPO_ROOT, '_SYSTEM', 'docs', 'YURI_OS_FORENSIC_SUPERCHARGE_GOAL_2026-05-20.md');
const PATCH_WAVES_DOC = path.join(REPO_ROOT, '_SYSTEM', 'docs', 'YURI_OS_SUPERCHARGE_PATCH_WAVES_2026-05-20.md');
const GOAL_CHECKLIST_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'goal-checklist.json');
const ADVISORY_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'shintai-advisory');
const RELEASE_GATE_EVIDENCE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'release-gate', 'automation-evidence.jsonl');
const ROUTING_LOG_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'rick-routing.jsonl');

const SESSION_ID = `rick-${Date.now()}`;
const HISTORY_TTL = 24 * 60 * 60 * 1000;
const MAX_HISTORY_CONTEXT_TURNS = 8;
const CTX_BUDGET = 50_000;
const SHELL_EXEC_TIMEOUT_MS = 30_000;
const MAX_AUTOEXEC_ROUNDS = 8;

const PROMPT_POISON_PATTERNS = [
  /\bHARDBORDER\b/i,
  /\bYURI-OS\s+v\d+(?:\.\d+)?\b/i,
  /\btokens used\b/i,
  /\bInput persistence is working\b/i,
  /\bTerminal is no longer naked\b/i,
  /\bReady for next command\b/i,
  /\bagent\/channel\/trigger configs written\b/i,
  /\bscan the Codex `?\.agents\/?`? directory\b/i,
  /\byour input (?:buffer is )?preserved\b/i,
  /(^|\n)\s*[|│]?\s*Rick\s*>\s*/i,
];

const PALETTE = {
  gold: '#FFD700',
  amber: '#FFBF00',
  bronze: '#CD7F32',
  cream: '#FFF8DC',
  dim: '#8B8682',
  good: '#8FBC8F',
  warn: '#FFD700',
  bad: '#FF6B6B',
  navyBg: '#1a1a2e',
};

const ROUTES = {
  '@deepseek': { lane: '@deepseek-v4-pro', label: 'DeepSeek' },
  '@codex-mini': { lane: '@codex-mini', label: 'Codex Mini' },
  '@codex-spark': { lane: '@codex-spark', label: 'Codex Spark' },
  '@codex': { lane: '@codex', label: 'Codex' },
  '@claude-sonnet-code': { lane: '@claude-sonnet-code', label: 'Claude Sonnet Code' },
  '@claude-opus': { lane: '@claude-opus-comain', label: 'Claude Opus' },
  '@claude-code': { lane: '@claude-sonnet-code', label: 'Claude Sonnet Code' },
  '@sonnet-code': { lane: '@claude-sonnet-code', label: 'Claude Sonnet Code' },
  '@sonnet': { lane: '@claude-sonnet-code', label: 'Claude Sonnet Code' },
  '@opus': { lane: '@claude-opus-comain', label: 'Claude Opus' },
  '@claude': { lane: '@claude', label: 'Claude' },
  '@nvidia': { lane: '@nvidia-nemotron-120b', label: 'Nvidia' },
  '@ds': { lane: '@deepseek-v4-pro', label: 'DeepSeek' },
  '@flash': { lane: '@deepseek-v4-flash', label: 'Rick' },
};

const DENIED_SHELL_PATTERNS = [
  /\bgit\s+push\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+add\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\brm\s+-[^;\n]*r[^;\n]*f\b/i,
  /\bsudo\b/i,
  /\bchmod\s+-R\b/i,
  /\bchown\s+-R\b/i,
  /\blaunchctl\s+unload\b/i,
  /\bmkfs\b/i,
];

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM_FX = '\x1b[2m';
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

let shellAutoExecEnabled = true;
let kagamiRouteMode = process.env.KAGAMI_RICK_MODE || 'auto';
let mem = null;
const ACTIVE_DISPATCHES = new Map();

function rgb(hex, mode = 'fg') {
  const clean = String(hex).replace('#', '').padStart(6, '0').slice(0, 6);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `\x1b[${mode === 'bg' ? 48 : 38};2;${r};${g};${b}m`;
}

function fg(hex, { bold = false, dim = false } = {}) {
  return `${bold ? BOLD : ''}${dim ? DIM_FX : ''}${rgb(hex)}`;
}

function bg(hex) {
  return rgb(hex, 'bg');
}

function stripAnsi(text) {
  return String(text ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function normalizeText(text) {
  return stripAnsi(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitDisplayLines(text) {
  const normalized = normalizeText(text);
  return normalized.length ? normalized.split('\n') : [''];
}

function visibleLength(text) {
  return Array.from(stripAnsi(text)).length;
}

function padVisible(text, width) {
  return `${text}${' '.repeat(Math.max(0, width - visibleLength(text)))}`;
}

function truncateRight(text, width) {
  const chars = Array.from(String(text ?? ''));
  if (chars.length <= width) return chars.join('');
  if (width <= 1) return '…';
  return `${chars.slice(0, width - 1).join('')}…`;
}

function truncateLeft(text, width) {
  const chars = Array.from(String(text ?? ''));
  if (chars.length <= width) return chars.join('');
  if (width <= 1) return '…';
  return `…${chars.slice(chars.length - width + 1).join('')}`;
}

function estimateTokens(text) {
  const normalized = normalizeText(text).trim();
  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
}

function formatTokenCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

function ensureStateDir() {
  mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
}

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  const cutoff = Date.now() - HISTORY_TTL;
  try {
    return readFileSync(HISTORY_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.ts >= cutoff);
  } catch {
    return [];
  }
}

function appendHistory(entry) {
  try {
    ensureStateDir();
    appendFileSync(HISTORY_FILE, `${JSON.stringify(entry)}\n`);
  } catch {}
}

function appendRoutingLog(decision, extra = {}) {
  try {
    ensureStateDir();
    appendFileSync(ROUTING_LOG_FILE, `${JSON.stringify({
      ts: Date.now(),
      session: SESSION_ID,
      ...decision,
      ...extra,
    })}\n`);
    appendRouteDecisionEvent(decision, {
      source: extra.source || 'rick',
      session: SESSION_ID,
    });
  } catch {}
}

function pruneHistoryFile() {
  const entries = loadHistory();
  try {
    ensureStateDir();
    writeFileSync(
      HISTORY_FILE,
      entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : ''),
    );
  } catch {}
  return entries;
}

function historyEntryText(entry) {
  const parts = [entry?.user, entry?.assistant];
  if (Array.isArray(entry?.turns)) {
    for (const turn of entry.turns) parts.push(turn?.content);
  }
  return parts.filter(Boolean).join('\n');
}

function containsPromptPoison(value) {
  const text = normalizeText(value);
  return PROMPT_POISON_PATTERNS.some((pattern) => pattern.test(text));
}

function promptSafeHistory(entries) {
  return entries
    .filter((entry) => !containsPromptPoison(historyEntryText(entry)))
    .slice(-MAX_HISTORY_CONTEXT_TURNS);
}

function clearHistoryState(history) {
  history.splice(0, history.length);
  try {
    ensureStateDir();
    writeFileSync(HISTORY_FILE, '');
  } catch {}
}

function buildHistoryContext(entries) {
  const safeEntries = promptSafeHistory(entries);
  if (!safeEntries.length) return '';
  const block = safeEntries.map((entry) => {
    if (Array.isArray(entry.turns) && entry.turns.length) {
      const turns = entry.turns
        .map((turn) => `${turn.role === 'tool' ? 'Tool' : 'Rick'}: ${turn.content}`)
        .join('\n');
      return `Marcel: ${entry.user}\n${turns}`;
    }
    return `Marcel: ${entry.user}\nRick: ${entry.assistant}`;
  });
  let joined = block.join('\n\n');
  let i = 0;
  while (joined.length > CTX_BUDGET && i < block.length - 1) {
    i += 1;
    joined = block.slice(i).join('\n\n');
  }
  return joined;
}

async function getMemory() {
  if (!mem) mem = await import(MEMORY_PATH);
  return mem;
}

async function recallMemory(query) {
  try {
    const m = await getMemory();
    const results = await m.recall({ query, topN: 5 });
    const safeResults = results.filter(({ row }) => !containsPromptPoison(row?.content ?? ''));
    if (!safeResults.length) return '';
    return '[Persistent memory — relevant]\n' + safeResults
      .map(({ row, similarity }) =>
        `[${row.lane} · ${(similarity * 100).toFixed(0)}%] ${row.content.slice(0, 200)}`)
      .join('\n');
  } catch {
    return '';
  }
}

async function writeMemory(input, response) {
  try {
    if (containsPromptPoison(response)) return;
    const m = await getMemory();
    await m.write({
      lane: 'rick',
      session: SESSION_ID,
      type: 'finding',
      tags: ['rick-session', 'harness'],
      content: `Marcel: ${input}\nRick: ${String(response || '').slice(0, 400)}`,
      confidence: 1.0,
    });
  } catch {}
}

function buildPrompt(input, historyCtx, memories) {
  let userProfile = '';
  try {
    userProfile = buildUserProfilePromptBlock();
  } catch {
    userProfile = '';
  }
  const parts = [
    '[Rick · Marcel · YURI]',
    'Rick full harness active. Terse, evidence-first, no fluff.',
    'Honor no-auto-commit/no-push guardrails. Suggest patch-ready code, but do not assume shell execution.',
    'Never emit terminal chrome: no fake borders, banners, status bars, token counters, or "Rick >" prefixes. The harness renders all UI.',
  ];
  if (userProfile) parts.push('\n' + userProfile);
  if (memories) parts.push('\n' + memories);
  if (historyCtx) parts.push('\n[Conversation — sanitized recent turns, terminal chrome omitted]\n' + historyCtx);
  parts.push('\nMarcel: ' + input);
  return parts.join('\n');
}

function buildKagamiRoutePrompt(input, historyCtx, memories, routeDecision) {
  const prompt = buildPrompt(input, historyCtx, memories);
  const routeLines = [
    '[Kagami Route]',
    `class: ${routeDecision.class}`,
    `lane: ${routeDecision.lane || 'blocked'}`,
    `mode: ${routeDecision.mode}`,
    `reason: ${routeDecision.reason}`,
  ];
  if (routeDecision.class === 'cyber') {
    routeLines.push('cyber rail: defensive or owned-lab only; external targets require explicit engagement scope.');
  }
  if (routeDecision.advisory?.length) {
    routeLines.push(`advisory: ${routeDecision.advisory.join(', ')}`);
  }
  routeLines.push('Codex/main remains final verifier for code, claims, memory promotion, and release decisions.');
  return `${prompt}\n\n${routeLines.join('\n')}`;
}

function cyberBlockText(routeDecision) {
  return [
    'Kagami blocked this before dispatch.',
    `reason: ${routeDecision.reason}`,
    '',
    'To run cybersecurity work, make it explicitly scoped:',
    '- use `cyber:` for defensive or owned-lab work',
    '- name the owned sandbox/lab or authorized engagement',
    '- avoid real external targets unless an engagement scope exists',
    '',
    'Example: cyber: run a local lab assessment on my sandbox API',
  ].join('\n');
}

function goalText() {
  if (!existsSync(GOAL_DOC)) return `current goal doc missing: ${GOAL_DOC}`;
  const text = readFileSync(GOAL_DOC, 'utf8');
  const title = text.match(/^#\s+(.+)$/m)?.[1] || 'YURI OS current goal';
  const goal = text.match(/## Goal\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
  const taskList = text.match(/## Task List\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() || '';
  const compactTasks = taskList
    .split('\n')
    .filter((line) => /^###\s+Gate\b/.test(line) || /^-\s+/.test(line))
    .slice(0, 28)
    .join('\n');
  return [
    title,
    '',
    goal,
    renderGoalChecklist(),
    compactTasks ? '\nTask gates:\n' + compactTasks : '',
    existsSync(PATCH_WAVES_DOC) ? `\npatch waves: ${PATCH_WAVES_DOC}` : '',
    latestAdvisoryPath() ? `latest Shintai advisory: ${latestAdvisoryPath()}` : '',
    '',
    `source: ${GOAL_DOC}`,
  ].filter(Boolean).join('\n');
}

function renderGoalChecklist() {
  const checklist = loadGoalChecklist();
  if (!checklist.items.length) return '';
  const lines = checklist.items.map((item) => {
    const marker = item.met ? '[✓]' : '[✗]';
    const rating = item.rating ? ` ${item.rating}` : '';
    const detail = item.evidence || item.note || '';
    return `${marker}${rating} ${item.goal}${detail ? ` — ${detail}` : ''}`;
  });
  const unmet = checklist.items.filter((item) => !item.met);
  if (unmet.length) {
    lines.push(`warning: ${unmet.length} goal item(s) still need verification; see ${GOAL_CHECKLIST_FILE}`);
  }
  return `\nGoal checklist:\n${lines.join('\n')}`;
}

function loadGoalChecklist() {
  if (!existsSync(GOAL_CHECKLIST_FILE)) return { items: [] };
  try {
    const parsed = JSON.parse(readFileSync(GOAL_CHECKLIST_FILE, 'utf8'));
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { items: [] };
  }
}

function latestAdvisoryPath() {
  if (!existsSync(ADVISORY_DIR)) return '';
  const files = readdirSync(ADVISORY_DIR)
    .filter((name) => /^shintai-.*\.md$/.test(name))
    .map((name) => {
      const fullPath = path.join(ADVISORY_DIR, name);
      return { fullPath, mtimeMs: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.fullPath || '';
}

async function statusText() {
  let healthSummary = null;
  let preflightEvidenceHash = '';
  try {
    const { getHealthSummary } = await import('./kagami-overseer.mjs');
    healthSummary = getHealthSummary({ autoUnquarantine: true });
  } catch (err) {
    healthSummary = { ok: false, status: 'fail', error: err?.message || String(err), quarantinedLanes: [], crashCounts: {} };
  }
  try {
    const { loadControlPlaneEvidence } = await import('./memory-kernel.mjs');
    const evidence = loadControlPlaneEvidence();
    preflightEvidenceHash = sha256Stable(evidence.hashes || {});
  } catch {}

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    session: SESSION_ID,
    activeDispatches: activeDispatchesSnapshot(),
    healthStatus: healthSummary.status || (healthSummary.ok ? 'ok' : 'fail'),
    quarantinedLanes: healthSummary.quarantinedLanes || [],
    crashCounts: healthSummary.crashCounts || {},
    preflightEvidenceHash,
    lastReleaseGate: latestReleaseGateEvidence(),
    latestShintaiAdvisory: latestAdvisoryPath() || null,
  }, null, 2);
}

function latestReleaseGateEvidence() {
  if (!existsSync(RELEASE_GATE_EVIDENCE)) return null;
  try {
    const lines = readFileSync(RELEASE_GATE_EVIDENCE, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return null;
    const latest = JSON.parse(lines[lines.length - 1]);
    return {
      generatedAt: latest.generatedAt || '',
      gateStatus: latest.gateStatus || '',
      preflightSha256: latest.preflightSha256 || '',
      path: RELEASE_GATE_EVIDENCE,
    };
  } catch {
    return {
      gateStatus: 'unreadable',
      path: RELEASE_GATE_EVIDENCE,
    };
  }
}

function sha256Stable(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function activeDispatchesSnapshot() {
  return Array.from(ACTIVE_DISPATCHES.values()).map((entry) => ({
    ...entry,
    elapsedMs: Date.now() - entry.startedAt,
  }));
}

function startDispatchRecord(lane, label, state = 'waiting') {
  const id = `${lane}-${Date.now()}-${ACTIVE_DISPATCHES.size + 1}`;
  ACTIVE_DISPATCHES.set(id, {
    id,
    lane,
    label,
    state,
    startedAt: Date.now(),
    chars: 0,
  });
  return id;
}

function updateDispatchRecord(id, patch = {}) {
  if (!ACTIVE_DISPATCHES.has(id)) return;
  ACTIVE_DISPATCHES.set(id, {
    ...ACTIVE_DISPATCHES.get(id),
    ...patch,
    updatedAt: Date.now(),
  });
}

function finishDispatchRecord(id) {
  ACTIVE_DISPATCHES.delete(id);
}

function extractBashBlocks(text) {
  const blocks = [];
  for (const match of String(text ?? '').matchAll(/```(?:bash|sh|shell)\s*([\s\S]*?)```/gi)) {
    const cmd = match[1].trim();
    if (cmd) blocks.push(cmd);
  }
  return blocks;
}

function filterExecutableShellBlocks(blocks, userShellBlocks = []) {
  const userSet = new Set(userShellBlocks.map((block) => String(block || '').trim()).filter(Boolean));
  return blocks.filter((block) => !userSet.has(String(block || '').trim()));
}

function renderTurn(turn) {
  return `${turn.role === 'tool' ? 'Tool' : 'Rick'}: ${turn.content}`;
}

function extendPromptWithTurns(basePrompt, turns) {
  if (!turns.length) return basePrompt;
  return `${basePrompt}\n\n[Current turn transcript]\n${turns.map(renderTurn).join('\n\n')}`;
}

function createHarnessUi({ sessionId }) {
  const stdout = process.stdout;
  const state = {
    input: '',
    lane: 'deepseek-v4-flash',
    tokens: 0,
    busy: false,
    closed: false,
    status: 'ready',
    turnStartedAt: null,
    lastActivityAt: null,
    spinnerTick: 0,
    ticker: null,
  };

  const columns = () => Math.max(40, stdout.columns || 80);
  const rows = () => Math.max(8, stdout.rows || 24);
  const bottomHeight = 3;
  const scrollBottom = () => Math.max(1, rows() - bottomHeight);
  const bottomTop = () => Math.max(1, rows() - bottomHeight + 1);
  const writeQueue = [];
  let writing = false;
  let configuredScrollBottom = null;

  function terminalWrite(chunk) {
    if (!chunk) return;
    writeQueue.push(chunk);
    if (writing) return;
    writing = true;
    try {
      while (writeQueue.length) stdout.write(writeQueue.shift());
    } finally {
      writing = false;
    }
  }

  function configureScrollRegion({ force = false } = {}) {
    if (!stdout.isTTY || state.closed) return;
    const bottom = scrollBottom();
    if (!force && configuredScrollBottom === bottom) return;
    terminalWrite(`\x1b7\x1b[1;${bottom}r\x1b8`);
    configuredScrollBottom = bottom;
  }

  function resetScrollRegion({ preserveCursor = false } = {}) {
    if (!stdout.isTTY) return;
    configuredScrollBottom = null;
    terminalWrite(preserveCursor ? '\x1b7\x1b[r\x1b8' : '\x1b[r');
  }

  function reserveBottom() {
    if (!stdout.isTTY) {
      terminalWrite('\n\n\n');
      return;
    }
    terminalWrite('\n\n\n');
    configureScrollRegion({ force: true });
    terminalWrite(`\x1b[${scrollBottom()};1H`);
  }

  function clearBottom() {
    const y = bottomTop();
    let chunk = '\x1b7';
    for (let i = 0; i < bottomHeight; i += 1) {
      chunk += `\x1b[${y + i};1H\x1b[2K`;
    }
    chunk += '\x1b8';
    terminalWrite(chunk);
  }

  function redrawBottom() {
    if (state.closed || !stdout.isTTY) return;
    const width = columns();
    configureScrollRegion();
    const y = bottomTop();
    const rule = '─'.repeat(width);
    const inputWidth = Math.max(1, width - 4);
    const visibleInput = truncateLeft(state.input, inputWidth - 1);
    const elapsed = state.busy && state.turnStartedAt ? ` · ${formatDuration(Date.now() - state.turnStartedAt)}` : '';
    const spinner = state.busy ? `${SPINNER_FRAMES[state.spinnerTick % SPINNER_FRAMES.length]} ` : '';
    const statusText = `${spinner}${state.status || (state.busy ? 'running' : 'ready')}${elapsed}`;
    const status = `  ⚕ ${statusText} │ ${state.lane} · session ${sessionId} · tokens ${formatTokenCount(state.tokens)} · ${shellAutoExecEnabled ? 'exec:on' : 'noexec'} · ctrl+c exit  `;
    const statusLine = padVisible(truncateRight(status, width), width);

    terminalWrite([
      '\x1b7',
      `\x1b[${y};1H\x1b[2K${fg(PALETTE.bronze)}${rule}${RESET}`,
      `\x1b[${y + 1};1H\x1b[2K${fg(PALETTE.gold, { bold: true })}> ${RESET}${fg(PALETTE.cream)}${visibleInput}${RESET}${fg(PALETTE.cream)}█${RESET}`,
      `\x1b[${y + 2};1H\x1b[2K${bg(PALETTE.navyBg)}${fg(PALETTE.dim)}${statusLine}${RESET}`,
      '\x1b8',
    ].join(''));
  }

  function beforeOutput() {
    if (stdout.isTTY) configureScrollRegion();
  }

  function afterOutput() {
    redrawBottom();
  }

  function startTicker() {
    if (!stdout.isTTY || state.ticker) return;
    state.ticker = setInterval(() => {
      if (state.closed || !state.busy) return;
      state.spinnerTick += 1;
      redrawBottom();
    }, 120);
  }

  function stopTicker() {
    if (!state.ticker) return;
    clearInterval(state.ticker);
    state.ticker = null;
  }

  function prefix(kind) {
    switch (kind) {
      case 'user':
        return `${fg(PALETTE.gold, { bold: true })}>${RESET}`;
      case 'rick':
        return `${fg(PALETTE.amber)}▎ Rick >${RESET}`;
      case 'shell':
        return `${fg(PALETTE.good, { dim: true })}[shell]${RESET}`;
      case 'dispatch':
        return `${fg(PALETTE.bronze)}━━━`;
      case 'error':
        return `${fg(PALETTE.bad)}✗${RESET}`;
      case 'system':
      default:
        return `${fg(PALETTE.dim)}`;
    }
  }

  function append(kind, text, { countTokens = true } = {}) {
    const lines = splitDisplayLines(text);
    if (countTokens) state.tokens += estimateTokens(text);
    beforeOutput();
    let chunk = '';
    for (const line of lines) {
      if (kind === 'dispatch') {
        chunk += `${fg(PALETTE.bronze)}━━━ ${line} ━━━${RESET}\n`;
      } else if (kind === 'system') {
        chunk += `${fg(PALETTE.dim)}${line}${RESET}\n`;
      } else if (kind === 'error') {
        chunk += `${prefix('error')} ${line}\n`;
      } else {
        chunk += `${prefix(kind)} ${fg(PALETTE.cream)}${line}${RESET}\n`;
      }
    }
    terminalWrite(chunk);
    afterOutput();
  }

  function beginStream(kind) {
    let out = '';
    let atLineStart = true;
    let started = false;
    let pending = '';
    let flushTimer = null;
    beforeOutput();
    function writePrefix() {
      if (!atLineStart) return;
      terminalWrite(`${prefix(kind)} ${fg(PALETTE.cream)}`);
      atLineStart = false;
      started = true;
    }
    function flushPending() {
      if (!pending) return;
      const normalized = pending;
      pending = '';
      beforeOutput();
      let chunk = '';
      for (const ch of normalized) {
        if (atLineStart) {
          chunk += `${prefix(kind)} ${fg(PALETTE.cream)}`;
          atLineStart = false;
        }
        if (ch === '\n') {
          chunk += `${RESET}\n`;
          atLineStart = true;
        } else {
          chunk += ch;
        }
      }
      terminalWrite(chunk);
      afterOutput();
    }
    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPending();
      }, 16);
    }
    return {
      start() {
        if (!started) {
          beforeOutput();
          writePrefix();
          afterOutput();
        }
      },
      append(chunk) {
        const normalized = normalizeText(chunk);
        if (!normalized) return;
        state.tokens += estimateTokens(normalized);
        out += normalized;
        state.lastActivityAt = Date.now();
        pending += normalized;
        scheduleFlush();
      },
      finish() {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushPending();
        beforeOutput();
        if (!atLineStart) terminalWrite(`${RESET}\n`);
        afterOutput();
        return out;
      },
      get text() {
        return out;
      },
    };
  }

  function setInput(value) {
    state.input = value;
    redrawBottom();
  }

  function clearInput() {
    setInput('');
  }

  function setLane(lane) {
    state.lane = lane || 'idle';
    redrawBottom();
  }

  function markActivity(status) {
    state.status = status || state.status || 'running';
    state.lastActivityAt = Date.now();
    redrawBottom();
  }

  function startTurn(lane, status = 'dispatching') {
    state.busy = true;
    state.turnStartedAt = Date.now();
    state.lastActivityAt = state.turnStartedAt;
    state.spinnerTick = 0;
    state.status = status;
    state.lane = lane || state.lane;
    startTicker();
    redrawBottom();
  }

  function finishTurn(lane = 'deepseek-v4-flash') {
    state.busy = false;
    state.turnStartedAt = null;
    state.lastActivityAt = Date.now();
    state.status = 'ready';
    state.lane = lane || state.lane;
    stopTicker();
    redrawBottom();
  }

  function shutdown(code = 0) {
    state.closed = true;
    stopTicker();
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {}
    if (stdout.isTTY) {
      stdout.off('resize', resizeHandler);
      resetScrollRegion();
      terminalWrite('\x1b[?25h\n');
    }
    process.exit(code);
  }

  const resizeHandler = () => {
    resetScrollRegion({ preserveCursor: true });
    configureScrollRegion({ force: true });
    clearBottom();
    redrawBottom();
  };

  if (stdout.isTTY) stdout.on('resize', resizeHandler);

  return {
    state,
    reserveBottom,
    redrawBottom,
    resetScrollRegion,
    markActivity,
    startTurn,
    finishTurn,
    setInput,
    clearInput,
    setLane,
    shutdown,
    appendUser: (text) => append('user', text),
    appendRick: (text) => append('rick', text),
    appendShell: (text) => append('shell', text),
    appendDispatch: (text) => append('dispatch', text, { countTokens: false }),
    appendSystem: (text) => append('system', text, { countTokens: false }),
    appendError: (text) => append('error', text, { countTokens: false }),
    beginRickStream: () => beginStream('rick'),
  };
}

function detectRoute(input) {
  const lower = input.toLowerCase();
  if (lower.includes('@shintai')) return { tag: '@shintai' };
  for (const tag of Object.keys(ROUTES)) {
    if (lower.includes(tag)) return { tag, route: ROUTES[tag] };
  }
  return null;
}

function guardShellCommand(cmd) {
  const value = String(cmd || '').trim();
  if (!value) return { ok: false, reason: 'empty shell command' };
  for (const pattern of DENIED_SHELL_PATTERNS) {
    if (pattern.test(value)) return { ok: false, reason: `blocked by execution rail: ${pattern}` };
  }
  return { ok: true };
}

function runShellBlock(cmd) {
  const guard = guardShellCommand(cmd);
  if (!guard.ok) {
    return { ok: false, stdout: '', stderr: '', message: guard.reason, blocked: true };
  }
  try {
    const stdout = execFileSync('bash', ['-lc', cmd], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: SHELL_EXEC_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const stdout = String(err?.stdout ?? '');
    const stderr = String(err?.stderr ?? '');
    const timedOut =
      String(err?.message ?? '').includes('ETIMEDOUT') ||
      err?.code === 'ETIMEDOUT' ||
      (err?.signal === 'SIGTERM' && err?.killed);
    const message = timedOut
      ? `TIMEOUT after ${SHELL_EXEC_TIMEOUT_MS}ms`
      : err?.message || 'shell command failed';
    return { ok: false, stdout, stderr, message, timedOut };
  }
}

function formatShellTurn(result) {
  if (result.ok) {
    let content = `SHELL OUTPUT:\n${result.stdout}`;
    if (result.stderr) content += `\nSTDERR:\n${result.stderr}`;
    return content;
  }
  let content = `${result.blocked ? 'SHELL BLOCKED' : 'SHELL ERROR'}:\n${result.message}`;
  if (result.stdout) content += `\nSTDOUT:\n${result.stdout}`;
  if (result.stderr) content += `\nSTDERR:\n${result.stderr}`;
  return content;
}

function finalAssistantFromTurns(turns, fallback = '') {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'assistant') return turns[i].content;
  }
  return fallback;
}

function streamLane(ui, lane, prompt, label) {
  return new Promise((resolve) => {
    let out = '';
    let stderrOut = '';
    let settled = false;
    let firstTokenAt = null;
    const startedAt = Date.now();
    const dispatchId = startDispatchRecord(lane, label, 'connecting');
    ui.appendDispatch(`${lane} dispatched`);
    ui.markActivity('connecting to lane');
    const stream = ui.beginRickStream();
    stream.start();
    const child = spawn('bash', [AI_SH, lane, prompt], {
      cwd: REPO_ROOT,
      env: { ...process.env, OFFLOAD_STREAM: '1', OFFLOAD_STREAM_STATUS: '1' },
    });

    const firstTokenWatch = setTimeout(() => {
      if (!firstTokenAt && !settled) {
        updateDispatchRecord(dispatchId, { state: 'waiting_first_token' });
        ui.markActivity(`waiting for first token from ${label}`);
      }
    }, 900);

    const heartbeat = setInterval(() => {
      if (settled) return;
      const elapsed = formatDuration(Date.now() - startedAt);
      if (firstTokenAt) {
        updateDispatchRecord(dispatchId, { state: 'streaming', chars: out.length });
        ui.markActivity(`streaming ${formatTokenCount(out.length)} chars`);
      } else {
        updateDispatchRecord(dispatchId, { state: 'waiting_first_token' });
        ui.markActivity(`waiting for ${label} · ${elapsed}`);
      }
    }, 1000);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      if (!firstTokenAt && text) {
        firstTokenAt = Date.now();
        updateDispatchRecord(dispatchId, { state: 'first_token', firstTokenMs: firstTokenAt - startedAt });
        ui.markActivity(`first token ${formatDuration(firstTokenAt - startedAt)}`);
      }
      out += text;
      updateDispatchRecord(dispatchId, { state: 'streaming', chars: out.length });
      stream.append(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('[cache]') || text.includes('[lane-session]')) return;
      if (text.includes('[stream]')) {
        ui.markActivity(text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\[stream\]/g, '').trim() || 'stream active');
        return;
      }
      stderrOut += text;
      ui.appendSystem(text);
    });

    child.on('error', (err) => {
      settled = true;
      updateDispatchRecord(dispatchId, { state: 'start_error', error: err.message });
      clearTimeout(firstTokenWatch);
      clearInterval(heartbeat);
      ui.appendError(`${label} failed to start: ${err.message}`);
      finishDispatchRecord(dispatchId);
    });

    child.on('close', (code, signal) => {
      settled = true;
      updateDispatchRecord(dispatchId, { state: code === 0 ? 'done' : 'failed', status: code, signal, chars: out.length });
      clearTimeout(firstTokenWatch);
      clearInterval(heartbeat);
      stream.finish();
      if (code !== 0) {
        const reason = signal ? `signal ${signal}` : `exit ${code}`;
        ui.appendError(`${label} lane ended with ${reason}${stderrOut ? `: ${stderrOut.trim().slice(0, 600)}` : ''}`);
      } else if (!out.trim()) {
        ui.appendError(`${label} lane returned no visible output`);
      }
      finishDispatchRecord(dispatchId);
      resolve(out.trim());
    });
  });
}

async function streamLaneWithShell(ui, lane, prompt, label, options = {}) {
  const turns = [];
  let currentPrompt = prompt;
  let response = '';
  let pendingBlocks = [];
  const userShellBlocks = options.userShellBlocks || [];

  for (let round = 0; round < MAX_AUTOEXEC_ROUNDS; round += 1) {
    ui.setLane(lane);
    response = await streamLane(ui, lane, currentPrompt, label);
    turns.push({ role: 'assistant', content: response });

    pendingBlocks = shellAutoExecEnabled
      ? filterExecutableShellBlocks(extractBashBlocks(response), userShellBlocks)
      : [];
    if (shellAutoExecEnabled && userShellBlocks.length && extractBashBlocks(response).length > pendingBlocks.length) {
      ui.appendSystem('user-provided shell block was not auto-executed');
    }
    if (!pendingBlocks.length) break;

    for (const cmd of pendingBlocks) {
      ui.setLane('shell');
      const result = runShellBlock(cmd);
      const content = formatShellTurn(result);
      turns.push({ role: 'tool', content });
      ui.appendShell(content);
      ui.setLane(lane);
    }

    currentPrompt = extendPromptWithTurns(prompt, turns);
  }

  if (shellAutoExecEnabled && pendingBlocks.length) {
    ui.appendShell(`auto-exec stopped after ${MAX_AUTOEXEC_ROUNDS} rounds`);
  }

  return {
    response: finalAssistantFromTurns(turns, response),
    turns,
  };
}

async function handleHealth(ui) {
  ui.setLane('health');
  const report = await healthCheckAll(['gpt-5.5', '@deepseek-v4-pro', '@nvidia-nemotron-120b', '@nvidia-qwen3-next']);
  ui.appendSystem(JSON.stringify(report, null, 2));
  return report;
}

async function handleBrowser(ui, script) {
  ui.setLane('browser-harness');
  ui.appendDispatch('browser-harness dispatched');
  const output = await harnessViewport(script);
  ui.appendShell(output || '[browser] no output');
  return output;
}

async function handleInput(ui, input, history) {
  const [memories, historyCtx] = await Promise.all([
    recallMemory(input),
    Promise.resolve(buildHistoryContext(history)),
  ]);
  const userShellBlocks = extractBashBlocks(input);

  const detected = detectRoute(input);

  if (detected?.tag === '@shintai') {
    const task = input.replace(/@shintai/gi, '').trim() || input;
    ui.appendDispatch('@shintai advisory dispatched');
    ui.setLane('@shintai');
    const dispatchId = startDispatchRecord('@shintai', 'Shintai advisory', 'Gate 0');
    const { runAdvisory } = await import('./shintai-dispatch.mjs');
    const stream = {
      write(chunk) {
        const text = normalizeText(chunk).trimEnd();
        if (!text) return;
        updateShintaiPhaseStatus(ui, text);
        updateDispatchRecord(dispatchId, { state: stripAnsi(text).split('\n').at(-1)?.slice(0, 80) || 'running' });
        ui.appendSystem(text);
      },
    };
    ui.markActivity('loading YURI control-plane Gate 0');
    let result;
    try {
      result = await runAdvisory(buildPrompt(task, historyCtx, memories), {
        stream,
      });
    } catch (err) {
      result = { ok: false, error: err?.message || String(err) };
    } finally {
      finishDispatchRecord(dispatchId);
    }
    if (!result.ok) {
      ui.appendError(result.error || 'Shintai advisory failed');
      if (result.health) ui.appendSystem(JSON.stringify(result.health, null, 2));
    } else {
      ui.appendRick(result.synthesis);
      if (result.artifacts?.markdown) ui.appendSystem(`advisory saved → ${result.artifacts.markdown}`);
    }
    const assistant = result.ok ? result.synthesis : `[Shintai advisory failed: ${result.error || 'unknown'}]`;
    const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant };
    appendHistory(entry);
    history.push(entry);
    await writeMemory(input, assistant);
    return;
  }

  if (detected) {
    const { tag, route } = detected;
    const msg = input.replace(new RegExp(tag, 'gi'), '').trim() || input;
    const { response, turns } = await streamLaneWithShell(
      ui,
      route.lane,
      buildPrompt(msg, historyCtx, memories),
      route.label,
      { userShellBlocks },
    );
    const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant: response };
    if (turns.some((turn) => turn.role === 'tool')) entry.turns = turns;
    appendHistory(entry);
    history.push(entry);
    await writeMemory(input, response);
    return;
  }

  const routeDecision = classifyRickRoute(input, { mode: kagamiRouteMode });
  appendRoutingLog(routeDecision, { source: 'plain-input' });
  if (routeDecision.blocked) {
    const assistant = cyberBlockText(routeDecision);
    ui.appendError(assistant);
    const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant };
    appendHistory(entry);
    history.push(entry);
    await writeMemory(input, assistant);
    return;
  }
  ui.appendDispatch(`Kagami auto → ${routeDecision.lane} (${routeDecision.class})`);
  const { response, turns } = await streamLaneWithShell(
    ui,
    routeDecision.lane,
    buildKagamiRoutePrompt(input, historyCtx, memories, routeDecision),
    routeDecision.label,
    { userShellBlocks },
  );
  const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant: response };
  if (turns.some((turn) => turn.role === 'tool')) entry.turns = turns;
  appendHistory(entry);
  history.push(entry);
  await writeMemory(input, response);
}

function updateShintaiPhaseStatus(ui, text) {
  const clean = stripAnsi(text).toLowerCase();
  if (clean.includes('yuri control-plane gate 0')) ui.markActivity('Shintai Gate 0 evidence');
  else if (clean.includes('shintai health preflight')) ui.markActivity('Shintai health preflight');
  else if (clean.includes('shintai advisory: fan-out')) ui.markActivity('Shintai fan-out');
  else if (clean.includes('shintai advisory: critique')) ui.markActivity('Shintai critique');
  else if (clean.includes('shintai advisory: synthesis')) ui.markActivity('Shintai synthesis');
  else if (clean.includes('advisory saved')) ui.markActivity('Shintai artifact saved');
  else if (/^\s*[✓⚠]\s+/.test(stripAnsi(text))) ui.markActivity(stripAnsi(text).replace(/^\s*[✓⚠]\s+/, '').slice(0, 64));
}

function helpText() {
  return [
    'Rick harness commands:',
    '/help                  show this surface',
    '/goal                  show current YURI supercharge goal',
    '/status                show Kagami lane health and latest Shintai artifact',
    '/why <task>            dry-run Kagami auto-route without dispatch',
    '/fanout <task>         preview adaptive solo/pair/trio/council lane plan',
    '/mode [auto|codex|rick|cheap] show or set default route posture',
    '/clear                 clear Rick prompt history',
    '/noexec [on|off]       toggle shell-block auto-exec',
    '/health                run worker PONG health checks',
    '/browser <python>      run browser-harness Python via repo-local CLI',
    '@shintai <task>        advisory squad: fan-out, critique, synthesis, patch prep',
    '@codex/@codex-mini/@sonnet/@opus route a turn to a lane',
    'ctrl+c                 exit',
  ].join('\n');
}

async function main() {
  const history = pruneHistoryFile();
  const ui = createHarnessUi({ sessionId: SESSION_ID });

  await printBanner(SESSION_ID);
  ui.reserveBottom();
  ui.redrawBottom();
  ui.appendSystem(`${history.length} turns loaded from last 24h · ${promptSafeHistory(history).length} usable for prompt · session ${SESSION_ID}`);
  ui.appendSystem('Route: @deepseek  @codex  @codex-mini  @sonnet  @opus  @nvidia  @shintai');

  let busy = false;

  const submit = async (rawValue) => {
    const input = String(rawValue ?? '').trim();
    if (!input) return;

    if (input === '/help') {
      ui.appendSystem(helpText());
      return;
    }

    if (input === '/clear') {
      clearHistoryState(history);
      ui.appendSystem('Rick prompt history cleared.');
      return;
    }

    if (input === '/goal') {
      ui.appendSystem(goalText());
      return;
    }

    if (input === '/status') {
      ui.appendSystem(await statusText());
      return;
    }

    if (input === '/mode') {
      ui.appendSystem(`Kagami route mode: ${kagamiRouteMode}`);
      return;
    }

    if (input.startsWith('/mode ')) {
      const value = input.slice('/mode '.length).trim().toLowerCase();
      if (!['auto', 'codex', 'rick', 'cheap'].includes(value)) {
        ui.appendError('mode must be one of: auto, codex, rick, cheap');
        return;
      }
      kagamiRouteMode = value;
      ui.appendSystem(`Kagami route mode: ${kagamiRouteMode}`);
      return;
    }

    if (input.startsWith('/why ') || input.startsWith('why ')) {
      const task = input.startsWith('/why ') ? input.slice('/why '.length) : input.slice('why '.length);
      const decision = classifyRickRoute(task, { mode: kagamiRouteMode });
      appendRoutingLog(decision, { source: 'route-dry-run' });
      ui.appendSystem(formatRouteDecision(decision));
      return;
    }

    if (input.startsWith('/fanout ')) {
      const task = input.slice('/fanout '.length).trim();
      ui.appendSystem(JSON.stringify(recommendKagamiFanout(task), null, 2));
      return;
    }

    if (busy) {
      ui.appendSystem('Rick is still processing the previous turn. /status and /goal stay available.');
      return;
    }

    if (input.startsWith('/noexec')) {
      const [, value] = input.split(/\s+/, 2);
      if (!value) shellAutoExecEnabled = !shellAutoExecEnabled;
      else if (['on', 'true', '1', 'disable-exec'].includes(value.toLowerCase())) shellAutoExecEnabled = false;
      else if (['off', 'false', '0', 'enable-exec'].includes(value.toLowerCase())) shellAutoExecEnabled = true;
      ui.appendSystem(`shell auto-exec ${shellAutoExecEnabled ? 'enabled' : 'disabled'}`);
      ui.redrawBottom();
      return;
    }

    if (input === '/health') {
      busy = true;
      ui.startTurn('health', 'checking workers');
      try {
        await handleHealth(ui);
      } catch (err) {
        ui.appendError(err.message);
      } finally {
        busy = false;
        ui.finishTurn('deepseek-v4-flash');
      }
      return;
    }

    if (input.startsWith('/browser ')) {
      busy = true;
      ui.startTurn('browser-harness', 'running browser-harness');
      try {
        await handleBrowser(ui, input.slice('/browser '.length));
      } catch (err) {
        ui.appendError(err.message);
      } finally {
        busy = false;
        ui.finishTurn('deepseek-v4-flash');
      }
      return;
    }

    const detected = detectRoute(input);
    const autoDecision = detected ? null : classifyRickRoute(input, { mode: kagamiRouteMode });
    const lane = detected?.tag === '@shintai' ? '@shintai' : detected?.route?.lane ?? autoDecision?.lane ?? '@deepseek-v4-flash';
    busy = true;
    ui.startTurn(autoDecision?.blocked ? 'blocked' : lane, autoDecision?.blocked ? 'blocked by Kagami rail' : 'preparing prompt');
    ui.appendUser(input);
    try {
      await handleInput(ui, input, history);
    } catch (err) {
      ui.appendError(`error: ${err.message}`);
    } finally {
      busy = false;
      ui.finishTurn(kagamiRouteMode === 'codex' ? 'gpt-5.5' : '@deepseek-v4-flash');
    }
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdout.write('\x1b[?25l');
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('keypress', (str, key = {}) => {
    if (key.ctrl && key.name === 'c') ui.shutdown(0);
    if (key.name === 'return' || key.name === 'enter') {
      const value = ui.state.input;
      ui.clearInput();
      submit(value);
      return;
    }
    if (key.name === 'backspace') {
      ui.setInput(Array.from(ui.state.input).slice(0, -1).join(''));
      return;
    }
    if (key.name === 'tab') {
      ui.setInput(`${ui.state.input}  `);
      return;
    }
    if (str && !key.ctrl && !key.meta && str >= ' ') {
      ui.setInput(`${ui.state.input}${str}`);
    }
  });

  process.on('SIGINT', () => ui.shutdown(0));
  process.on('SIGTERM', () => ui.shutdown(0));
  process.on('exit', () => {
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write('\x1b[r\x1b[?25h');
    } catch {}
  });
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === path.resolve(RICK_REPL_PATH);
}

export const __test__ = {
  buildPrompt,
  buildHistoryContext,
  containsPromptPoison,
  detectRoute,
  extractBashBlocks,
  filterExecutableShellBlocks,
  formatDuration,
  guardShellCommand,
  goalText,
  statusText,
  normalizeText,
};

if (isCliEntrypoint()) {
  main().catch((err) => {
    process.stderr.write(`${fg(PALETTE.bad)}fatal: ${err.message}${RESET}\n`);
    process.exit(1);
  });
}
