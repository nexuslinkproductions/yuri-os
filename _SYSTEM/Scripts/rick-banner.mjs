#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const HEALTH_URL = 'http://localhost:4242/health.json';
const HEALTH_TIMEOUT_MS = 900;

const COLORS = {
  gold: '#FFD700',
  amber: '#FFBF00',
  bronze: '#CD7F32',
  cream: '#FFF8DC',
  dim: '#8B8682',
  good: '#8FBC8F',
  warn: '#FFD700',
  bad: '#FF6B6B',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM_FX = '\x1b[2m';

const TITLE = [
  '██╗  ██╗ █████╗  ██████╗  █████╗ ███╗   ███╗██╗',
  '██║ ██╔╝██╔══██╗██╔════╝ ██╔══██╗████╗ ████║██║',
  '█████╔╝ ███████║██║  ███╗███████║██╔████╔██║██║',
  '██╔═██╗ ██╔══██║██║   ██║██╔══██║██║╚██╔╝██║██║',
  '██║  ██╗██║  ██║╚██████╔╝██║  ██║██║ ╚═╝ ██║██║',
  '╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝',
];

const MIRROR = [
  '      ╲  │  ╱      ',
  '   ╭──────────╮    ',
  ' ╲ │  ╭────╮  │ ╱  ',
  '── │ ╭╯▓▒▒▓╰╮ │ ── ',
  ' ╱ │ │▒░██░▒│ │ ╲  ',
  '   │ ╰╮▓▒▒▓╭╯ │    ',
  '   ╰────╥─────╯    ',
  '      ╱ │ ╲        ',
  '        │          ',
  '     ───┴───       ',
];

const TIP_POOL = [
  'Route code work with @codex; use @deepseek for fast synthesis and architecture passes.',
  'Use @shintai when Rick needs squad review before deciding.',
  '/noexec toggles shell auto-exec; keep it on when you want advice only.',
  'Shell exec blocks run only after guardrail checks and time out automatically.',
  'browser-harness is the browse lane; use screenshots first, DOM only when needed.',
  'Persist the goal in the prompt when a turn spans multiple lanes.',
  'Tab autocomplete can wire slash commands and lane names once the completer is active.',
  'Health preflight should pass before fan-out; failed lanes are evidence, not noise.',
  'Kagami discipline logs show the last overseer intervention.',
  'Keep patch prep reviewable; Rick applies only after the plan is clear.',
];

function rgb(hex) {
  const clean = String(hex).replace('#', '').padStart(6, '0').slice(0, 6);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function color(text, hex, { bold = false, dim = false } = {}) {
  return `${bold ? BOLD : ''}${dim ? DIM_FX : ''}${rgb(hex)}${text}${RESET}`;
}

function stripAnsi(text) {
  return String(text ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function widthOf(text) {
  return Array.from(stripAnsi(text)).length;
}

function pad(text, width) {
  return `${text}${' '.repeat(Math.max(0, width - widthOf(text)))}`;
}

function truncate(text, width) {
  const chars = Array.from(String(text ?? ''));
  if (chars.length <= width) return chars.join('');
  if (width <= 1) return '…';
  return `${chars.slice(0, width - 1).join('')}…`;
}

function wrap(text, width) {
  const value = String(text ?? '').trim();
  if (!value) return [''];
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (widthOf(`${line} ${word}`) <= width) {
      line += ` ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines.flatMap((entry) => {
    if (widthOf(entry) <= width) return [entry];
    const chunks = [];
    let current = '';
    for (const ch of Array.from(entry)) {
      if (widthOf(current + ch) > width) {
        chunks.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  });
}

function center(text, width) {
  const size = widthOf(text);
  if (size >= width) return text;
  const left = Math.floor((width - size) / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(width - size - left)}`;
}

function piece(text, fg, opts = {}) {
  return color(String(text), fg, opts);
}

async function fetchHealthSnapshot() {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(HEALTH_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readLastLogLine(filePath) {
  try {
    if (!existsSync(filePath)) return '';
    const lines = readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) || '';
  } catch {
    return '';
  }
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['running', 'live', 'ok', 'active', 'exited_ok', 'exit_ok', 'healthy'].includes(raw)) return 'good';
  if (['gate_failed', 'warn', 'warning', 'degraded', 'cooldown'].includes(raw)) return 'warn';
  if (['crashed', 'failed', 'error', 'down', 'dead'].includes(raw)) return 'bad';
  if (['idle', 'standby', 'sleeping', 'paused', 'stopped'].includes(raw)) return 'idle';
  return 'idle';
}

function statusBadge(status) {
  if (status === 'good') return piece('✓', COLORS.good, { bold: true });
  if (status === 'warn') return piece('⚠', COLORS.warn, { bold: true });
  if (status === 'bad') return piece('✗', COLORS.bad, { bold: true });
  return piece('○', COLORS.dim, { dim: true });
}

function statusText(status, raw = '') {
  if (status === 'good') return piece(raw || 'running', COLORS.good, { bold: true });
  if (status === 'warn') return piece(raw || 'gate_failed', COLORS.warn, { bold: true });
  if (status === 'bad') return piece(raw || 'crashed', COLORS.bad, { bold: true });
  return piece(raw || 'idle', COLORS.dim, { dim: true });
}

function agentStatus(agent) {
  const status = normalizeStatus(agent?.status || agent?.state);
  const exitCode = Number(agent?.last_exit_code ?? agent?.exitCode);
  if (status === 'idle' && Number.isFinite(exitCode)) return exitCode === 0 ? 'good' : 'bad';
  if (status === 'idle' && Number(agent?.pid) > 0) return 'good';
  return status;
}

function healthAgents(health) {
  const agents = Array.isArray(health?.launchagents)
    ? health.launchagents
    : Array.isArray(health?.agents)
      ? health.agents
      : [];
  const rank = { bad: 0, warn: 1, good: 2, idle: 3 };
  return [...agents]
    .sort((a, b) => rank[agentStatus(a)] - rank[agentStatus(b)])
    .slice(0, 8)
    .map((agent) => {
      const raw = agent.status || agent.state || '';
      const status = agentStatus(agent);
      const name = agent.label || agent.name || agent.id || 'unknown-agent';
      return `${statusBadge(status)} ${statusText(status, raw || status)} ${piece(truncate(name, 42), COLORS.cream)}`;
    });
}

function laneStatus(health, laneName) {
  const key = laneName.replace(/^@/, '');
  const lane = health?.lanes?.[laneName] || health?.lanes?.[key];
  if (typeof lane === 'string') return normalizeStatus(lane);
  if (lane && typeof lane === 'object') return normalizeStatus(lane.status || lane.state || lane.value);
  const fallback = {
    deepseek: health?.services?.deepseek?.status,
    codex: health?.services?.codex?.status,
    claude: health?.services?.claude?.status || health?.services?.session_buffer?.status,
    nvidia: health?.services?.nvidia?.status || health?.services?.backend?.status,
    shintai: health?.services?.shintai?.status || health?.services?.worker_bridge?.status,
  };
  return normalizeStatus(fallback[key]);
}

function overseerStatus(health) {
  const agents = Array.isArray(health?.launchagents) ? health.launchagents : [];
  const match = agents.find((agent) => `${agent.name || ''} ${agent.label || ''}`.toLowerCase().includes('kagami'));
  const service = health?.services?.['kagami-overseer'] || health?.services?.kagami;
  const candidate = match || service;
  if (!candidate) return 'bad';
  return agentStatus(candidate) === 'good' ? 'good' : normalizeStatus(candidate.status || candidate.state);
}

function renderTitle(totalWidth) {
  const palette = [COLORS.gold, '#F9CC18', COLORS.amber, '#E8A33B', '#D48B36', COLORS.bronze];
  return TITLE
    .map((row, index) => piece(center(row, totalWidth), palette[index] || COLORS.bronze, { bold: true }))
    .join('\n');
}

function renderLeftPanel(sessionId, leftWidth) {
  const rows = MIRROR.map((row, index) => {
    const tone = index < 2 ? COLORS.gold : index < 7 ? COLORS.bronze : COLORS.dim;
    return piece(pad(row, leftWidth), tone, { bold: index < 7 });
  });
  rows.push(piece(pad('神鏡 · YURI OS', leftWidth), COLORS.gold, { bold: true }));
  rows.push(piece(pad(REPO_ROOT, leftWidth), COLORS.dim, { dim: true }));
  rows.push(piece(pad(`Session: ${sessionId}`, leftWidth), COLORS.dim, { dim: true }));
  return rows;
}

function renderRightPanel(health, disciplineLine, rightWidth) {
  if (!health) return [];
  const rows = [];
  rows.push(piece('Active Agents', COLORS.bronze, { bold: true }));
  const agents = healthAgents(health);
  rows.push(...(agents.length ? agents : [piece('No agents reported', COLORS.dim, { dim: true })]));
  rows.push('');
  rows.push(piece('Active Lanes', COLORS.bronze, { bold: true }));
  for (const lane of ['@deepseek', '@codex', '@claude', '@nvidia', '@shintai']) {
    const status = laneStatus(health, lane);
    rows.push(`${statusBadge(status)} ${piece(lane.padEnd(9), COLORS.cream, { bold: true })} ${statusText(status)}`);
  }
  rows.push('');
  const overseer = overseerStatus(health);
  rows.push(`${piece('Kagami Overseer', COLORS.bronze, { bold: true })} ${statusBadge(overseer)} ${statusText(overseer, overseer === 'good' ? 'running' : 'stopped')}`);
  if (disciplineLine) {
    for (const line of wrap(`last: ${disciplineLine}`, rightWidth)) {
      rows.push(piece(line, COLORS.dim, { dim: true }));
    }
  }
  return rows;
}

function renderPanel(sessionId, health, disciplineLine, totalWidth) {
  const leftWidth = 28;
  const left = renderLeftPanel(sessionId, leftWidth);
  if (!health) return left.join('\n');

  const rightWidth = Math.max(24, totalWidth - leftWidth - 3);
  const right = renderRightPanel(health, disciplineLine, rightWidth);
  const height = Math.max(left.length, right.length);
  const rows = [];
  for (let i = 0; i < height; i += 1) {
    const l = pad(left[i] || '', leftWidth);
    const r = pad(right[i] || '', rightWidth);
    rows.push(`${l} ${piece('│', COLORS.dim, { dim: true })} ${r}`);
  }
  return rows.join('\n');
}

function renderWelcome() {
  return color('Welcome to Kagami. Type your message or /help for commands.', COLORS.cream, { dim: true });
}

function renderTip() {
  const tip = TIP_POOL[Math.floor(Math.random() * TIP_POOL.length)] || TIP_POOL[0];
  return `${piece('Tip · ', COLORS.bronze, { dim: true })}${piece(tip, COLORS.cream)}`;
}

export async function printBanner(sessionId) {
  const width = Math.max(process.stdout.columns || 80, 80);
  const health = await fetchHealthSnapshot();
  const disciplineLine = readLastLogLine(path.join(REPO_ROOT, '_SYSTEM/monitoring/kagami-discipline.log'));
  const lines = [
    renderTitle(width),
    '',
    renderPanel(sessionId, health, disciplineLine, width),
    '',
    renderWelcome(),
    renderTip(),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
