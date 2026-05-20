#!/usr/bin/env node
/**
 * rick-repl.mjs — Rick/YURI local harness.
 *
 * Plain stdout scroll, fixed bottom prompt, lane routing, advisory Shintai,
 * memory recall, shell-block auto-exec guardrails, and browser-harness bridge.
 */

import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { printBanner } from './rick-banner.mjs';
import { healthCheckAll } from './worker-tmux.mjs';
import { harnessViewport } from './browser-harness-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_SH = path.join(__dirname, 'ai');
const MEMORY_PATH = path.join(__dirname, 'lane-memory.mjs');
const HISTORY_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'rick-history.jsonl');

const SESSION_ID = `rick-${Date.now()}`;
const HISTORY_TTL = 24 * 60 * 60 * 1000;
const CTX_BUDGET = 50_000;
const SHELL_EXEC_TIMEOUT_MS = 30_000;
const MAX_AUTOEXEC_ROUNDS = 8;

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
  '@codex': { lane: '@codex-spark', label: 'Codex' },
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

let shellAutoExecEnabled = true;
let mem = null;

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

function buildHistoryContext(entries) {
  if (!entries.length) return '';
  const block = entries.map((entry) => {
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
    if (!results.length) return '';
    return '[Persistent memory — relevant]\n' + results
      .map(({ row, similarity }) =>
        `[${row.lane} · ${(similarity * 100).toFixed(0)}%] ${row.content.slice(0, 200)}`)
      .join('\n');
  } catch {
    return '';
  }
}

async function writeMemory(input, response) {
  try {
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
  const parts = [
    '[Rick · Marcel · YURI]',
    'Rick full harness active. Terse, evidence-first, no fluff.',
    'Honor no-auto-commit/no-push guardrails. Suggest patch-ready code, but do not assume shell execution.',
  ];
  if (memories) parts.push('\n' + memories);
  if (historyCtx) parts.push('\n[Conversation — last 24h, oldest dropped when over budget]\n' + historyCtx);
  parts.push('\nMarcel: ' + input);
  return parts.join('\n');
}

function extractBashBlocks(text) {
  const blocks = [];
  for (const match of String(text ?? '').matchAll(/```(?:bash|sh|shell)\s*([\s\S]*?)```/gi)) {
    const cmd = match[1].trim();
    if (cmd) blocks.push(cmd);
  }
  return blocks;
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
  };

  const columns = () => Math.max(40, stdout.columns || 80);
  const rows = () => Math.max(8, stdout.rows || 24);

  function reserveBottom() {
    stdout.write('\n\n\n\x1b[3A');
  }

  function clearBottom() {
    const y = Math.max(1, rows() - 2);
    stdout.write('\x1b7');
    for (let i = 0; i < 3; i += 1) {
      stdout.write(`\x1b[${y + i};1H\x1b[2K`);
    }
    stdout.write('\x1b8');
  }

  function redrawBottom() {
    if (state.closed || !stdout.isTTY) return;
    const width = columns();
    const y = Math.max(1, rows() - 2);
    const rule = '─'.repeat(width);
    const inputWidth = Math.max(1, width - 4);
    const visibleInput = truncateLeft(state.input, inputWidth - 1);
    const status = `  ⚕ ${state.lane} · session ${sessionId} · tokens ${formatTokenCount(state.tokens)} · ${shellAutoExecEnabled ? 'exec:on' : 'noexec'} · ctrl+c exit  `;
    const statusLine = padVisible(truncateRight(status, width), width);

    stdout.write('\x1b7');
    stdout.write(`\x1b[${y};1H\x1b[2K${fg(PALETTE.bronze)}${rule}${RESET}`);
    stdout.write(`\x1b[${y + 1};1H\x1b[2K${fg(PALETTE.gold, { bold: true })}> ${RESET}${fg(PALETTE.cream)}${visibleInput}${RESET}${fg(PALETTE.cream)}█${RESET}`);
    stdout.write(`\x1b[${y + 2};1H\x1b[2K${bg(PALETTE.navyBg)}${fg(PALETTE.dim)}${statusLine}${RESET}`);
    stdout.write('\x1b8');
  }

  function beforeOutput() {
    if (stdout.isTTY) clearBottom();
  }

  function afterOutput() {
    redrawBottom();
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
    for (const line of lines) {
      if (kind === 'dispatch') {
        stdout.write(`${fg(PALETTE.bronze)}━━━ ${line} ━━━${RESET}\n`);
      } else if (kind === 'system') {
        stdout.write(`${fg(PALETTE.dim)}${line}${RESET}\n`);
      } else if (kind === 'error') {
        stdout.write(`${prefix('error')} ${line}\n`);
      } else {
        stdout.write(`${prefix(kind)} ${fg(PALETTE.cream)}${line}${RESET}\n`);
      }
    }
    afterOutput();
  }

  function beginStream(kind) {
    let out = '';
    let atLineStart = true;
    beforeOutput();
    return {
      append(chunk) {
        const normalized = normalizeText(chunk);
        if (!normalized) return;
        state.tokens += estimateTokens(normalized);
        out += normalized;
        for (const ch of normalized) {
          if (atLineStart) {
            stdout.write(`${prefix(kind)} ${fg(PALETTE.cream)}`);
            atLineStart = false;
          }
          if (ch === '\n') {
            stdout.write(`${RESET}\n`);
            atLineStart = true;
          } else {
            stdout.write(ch);
          }
        }
        afterOutput();
        beforeOutput();
      },
      finish() {
        if (!atLineStart) stdout.write(`${RESET}\n`);
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

  function shutdown(code = 0) {
    state.closed = true;
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {}
    if (stdout.isTTY) stdout.write('\x1b[?25h\n');
    process.exit(code);
  }

  return {
    state,
    reserveBottom,
    redrawBottom,
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
    ui.appendDispatch(`${lane} dispatched`);
    const stream = ui.beginRickStream();
    const child = spawn('bash', [AI_SH, lane, prompt], { cwd: REPO_ROOT });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      out += text;
      stream.append(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('[cache]') || text.includes('[lane-session]')) return;
      ui.appendSystem(text);
    });

    child.on('error', (err) => {
      ui.appendError(`${label} failed to start: ${err.message}`);
    });

    child.on('close', () => {
      stream.finish();
      resolve(out.trim());
    });
  });
}

async function streamLaneWithShell(ui, lane, prompt, label) {
  const turns = [];
  let currentPrompt = prompt;
  let response = '';
  let pendingBlocks = [];

  for (let round = 0; round < MAX_AUTOEXEC_ROUNDS; round += 1) {
    ui.setLane(lane);
    response = await streamLane(ui, lane, currentPrompt, label);
    turns.push({ role: 'assistant', content: response });

    pendingBlocks = shellAutoExecEnabled ? extractBashBlocks(response) : [];
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
  const report = await healthCheckAll(['@codex-spark', '@deepseek-v4-pro']);
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

  const detected = detectRoute(input);

  if (detected?.tag === '@shintai') {
    const task = input.replace(/@shintai/gi, '').trim() || input;
    ui.appendDispatch('@shintai advisory dispatched');
    ui.setLane('@shintai');
    const { runAdvisory } = await import('./rick-shintai.mjs');
    const stream = {
      write(chunk) {
        const text = normalizeText(chunk).trimEnd();
        if (text) ui.appendSystem(text);
      },
    };
    const result = await runAdvisory(buildPrompt(task, historyCtx, memories), { stream });
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
    );
    const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant: response };
    if (turns.some((turn) => turn.role === 'tool')) entry.turns = turns;
    appendHistory(entry);
    history.push(entry);
    await writeMemory(input, response);
    return;
  }

  const { response, turns } = await streamLaneWithShell(
    ui,
    '@deepseek-v4-flash',
    buildPrompt(input, historyCtx, memories),
    'Rick',
  );
  const entry = { ts: Date.now(), session: SESSION_ID, user: input, assistant: response };
  if (turns.some((turn) => turn.role === 'tool')) entry.turns = turns;
  appendHistory(entry);
  history.push(entry);
  await writeMemory(input, response);
}

function helpText() {
  return [
    'Rick harness commands:',
    '/help                  show this surface',
    '/noexec [on|off]       toggle shell-block auto-exec',
    '/health                run worker PONG health checks',
    '/browser <python>      run browser-harness Python via repo-local CLI',
    '@shintai <task>        advisory squad: fan-out, critique, synthesis, patch prep',
    '@codex/@deepseek/...   route a turn to a lane',
    'ctrl+c                 exit',
  ].join('\n');
}

async function main() {
  const history = pruneHistoryFile();
  const ui = createHarnessUi({ sessionId: SESSION_ID });

  await printBanner(SESSION_ID);
  ui.reserveBottom();
  ui.redrawBottom();
  ui.appendSystem(`${history.length} turns loaded from last 24h · session ${SESSION_ID}`);
  ui.appendSystem('Route: @deepseek  @codex  @claude  @nvidia  @shintai');

  let busy = false;

  const submit = async (rawValue) => {
    const input = String(rawValue ?? '').trim();
    if (!input) return;

    if (busy) {
      ui.appendSystem('Rick is still processing the previous turn.');
      return;
    }

    if (input === '/help') {
      ui.appendSystem(helpText());
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
      try {
        await handleHealth(ui);
      } catch (err) {
        ui.appendError(err.message);
      } finally {
        busy = false;
        ui.setLane('deepseek-v4-flash');
      }
      return;
    }

    if (input.startsWith('/browser ')) {
      busy = true;
      try {
        await handleBrowser(ui, input.slice('/browser '.length));
      } catch (err) {
        ui.appendError(err.message);
      } finally {
        busy = false;
        ui.setLane('deepseek-v4-flash');
      }
      return;
    }

    const detected = detectRoute(input);
    const lane = detected?.tag === '@shintai' ? '@shintai' : detected?.route?.lane ?? '@deepseek-v4-flash';
    busy = true;
    ui.state.busy = true;
    ui.setLane(lane);
    ui.appendUser(input);
    try {
      await handleInput(ui, input, history);
    } catch (err) {
      ui.appendError(`error: ${err.message}`);
    } finally {
      busy = false;
      ui.state.busy = false;
      ui.setLane('@deepseek-v4-flash');
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
  process.on('exit', () => {
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdout.write('\x1b[?25h');
    } catch {}
  });
}

main().catch((err) => {
  process.stderr.write(`${fg(PALETTE.bad)}fatal: ${err.message}${RESET}\n`);
  process.exit(1);
});
