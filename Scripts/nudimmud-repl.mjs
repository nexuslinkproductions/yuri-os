// Yuri-native NUDIMMUD DeepSeek HUD REPL. No Hermes code. Clean-room inspired terminal workflow only.

import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import {
  DEFAULT_STATUS_LIMITS,
  createStatusSnapshot,
  renderCompactStatusLine,
  renderBusyStatusLine,
  renderBudgetStatusLine,
} from './nudimmud/status-line.mjs';

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD';
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts/offload.sh');
const TOKENMAXXING_STATE = path.join(REPO_ROOT, '.claude/state/tokenmaxxing-state.json');
const RUNS_DIR = path.join(os.homedir(), '.nudimmud', 'runs');
const RUNS_FALLBACK_DIR = path.join('/private/tmp', 'nudimmud-runs');

const SELF_TEST = process.env.NUDIMMUD_REPL_SELFTEST === '1';
const CLAIM_VERIFIER_SMOKE = process.env.NUDIMMUD_REPL_CLAIM_VERIFIER_SMOKE === '1';

const MODELS = {
  flash: 'deepseek-v4-flash',
  pro: 'deepseek-v4-pro',
};

const CTX_WINDOW    = 1_000_000;
const WORKFLOW_SOFT = 15_000;
const WORKFLOW_HARD = 40_000;
const PASTE_BURST_MS = 25;
const BRACKETED_PASTE_ON  = '\x1b[?2004h';
const BRACKETED_PASTE_OFF = '\x1b[?2004l';
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[38;5;82m',   // Pip-Boy green — NUDIMMUD logo/brand
  purple:  '\x1b[38;5;141m',  // purple — YURI OS accent
  amber:   '\x1b[38;5;214m',  // amber — user requests / warnings
  red:     '\x1b[38;5;196m',  // red — errors / danger
  cyan:    '\x1b[38;5;81m',   // cyan — section markers
  white:   '\x1b[38;5;255m',  // white — model output text
  matrix:  '\x1b[38;5;22m',   // dim matrix green — legacy, avoid
  gray:    '\x1b[38;5;250m',  // light gray — dim text / separators
  muted:   '\x1b[38;5;245m',  // lighter gray — secondary values
  black:   '\x1b[40m',        // black bg
  clear:   '\x1b[2J\x1b[H',
};

const g  = (s) => `${C.white}${s}${C.reset}`;
const a  = (s) => `${C.amber}${s}${C.reset}`;
const r  = (s) => `${C.red}${s}${C.reset}`;
const d  = (s) => `${C.gray}${s}${C.reset}`;
const m  = (s) => `${C.gray}${s}${C.reset}`;
const c  = (s) => `${C.green}${s}${C.reset}`;
const p  = (s) => `${C.purple}${s}${C.reset}`;
const b  = (s) => `${C.bold}${C.white}${s}${C.reset}`;
const stripAnsiForHud = (s) => String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  model: MODELS.pro,
  promptsSent: 0,
  inputTokens: 0,
  outputTokens: 0,
  startTime: Date.now(),
  turnStartTime: null,
  turnOutputChars: 0,
  lastStatus: 'READY',
  busy: false,
  pendingClose: false,
  sessionFinalized: false,
  pasteMode: false,
  pasteBuffer: [],
  bracketedPasteActive: false,
  bracketedPasteBuffer: [],
  burstBuffer: [],
  burstTimer: null,
  multilineActive: false,
  multilineSource: 'burst',
  lastTurnId: null,
  lastTranscriptDir: null,
  promptPadding: 0,
};

const est = (text) => Math.ceil(text.length / 4);
const composeMultilinePayload = (lines) => lines.join('\n');

const BANNER_FONT = {
  ' ': ['   ', '   ', '   ', '   ', '   '],
  Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  R: ['████ ', '█   █', '████ ', '█ █  ', '█  █ '],
  I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  S: [' ████', '█    ', ' ███ ', '    █', '████ '],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
};
const BANNER_HEIGHT = 5;

const renderBannerWord = (text) => {
  const rows = Array.from({ length: BANNER_HEIGHT }, () => '');
  for (const ch of text.toUpperCase()) {
    const glyph = BANNER_FONT[ch] || BANNER_FONT[' '];
    for (let i = 0; i < BANNER_HEIGHT; i++) {
      rows[i] += (rows[i] ? '  ' : '') + glyph[i];
    }
  }
  return rows;
};

const renderBanner = (text, color = C.green) =>
  renderBannerWord(text).map((row) => `${C.bold}${color}${row}${C.reset}`).join('\n');

const renderBannerSegments = (segments) => {
  const rows = Array.from({ length: BANNER_HEIGHT }, () => '');
  for (const { text, color } of segments) {
    const wordRows = renderBannerWord(text);
    for (let i = 0; i < BANNER_HEIGHT; i++) {
      rows[i] += (rows[i] ? '    ' : '') + `${C.bold}${color}${wordRows[i]}${C.reset}`;
    }
  }
  return rows.join('\n');
};

const OUTLINE_BANNER = [
  '███╗   ██╗██╗   ██╗██████╗ ██╗███╗   ███╗███╗   ███╗██╗   ██╗██████╗ ',
  '████╗  ██║██║   ██║██╔══██╗██║████╗ ████║████╗ ████║██║   ██║██╔══██╗',
  '██╔██╗ ██║██║   ██║██║  ██║██║██╔████╔██║██╔████╔██║██║   ██║██║  ██║',
  '██║╚██╗██║██║   ██║██║  ██║██║██║╚██╔╝██║██║╚██╔╝██║██║   ██║██║  ██║',
  '██║ ╚████║╚██████╔╝██████╔╝██║██║ ╚═╝ ██║██║ ╚═╝ ██║╚██████╔╝██████╔╝',
  '╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ',
];

const renderOutlineBanner = () =>
  OUTLINE_BANNER.map((row, index) => {
    const color = index === OUTLINE_BANNER.length - 1 ? C.matrix : C.green;
    return `${C.bold}${color}${row}${C.reset}`;
  }).join('\n');

const renderHudMark = () => [
  `      ${c('╷')}`,
  `   ${c('╲')} ${c('│')} ${c('╱')}`,
  `${c('╶──')} ${c('⬡')} ${c('──╴')}`,
  `   ${c('╱')} ${c('│')} ${c('╲')}`,
  `      ${c('╵')}`,
].join('\n');

// ── Turn ID ───────────────────────────────────────────────────────────────────
const makeTurnId = () => {
  const now = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `NMD-${date}-${time}-${p(state.promptsSent + 1, 3)}`;
};

// ── Transcript saving ─────────────────────────────────────────────────────────
const saveTranscript = (turnId, request, output, meta) => {
  const dirs = [RUNS_DIR, RUNS_FALLBACK_DIR];
  for (const baseDir of dirs) {
    try {
      const dir = path.join(baseDir, turnId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'request.md'),
        `# ${turnId} — Request\n\n${request}\n`);
      writeFileSync(path.join(dir, 'output.md'),
        `# ${turnId} — Output\n\n${output}\n`);
      writeFileSync(path.join(dir, 'meta.json'),
        JSON.stringify(meta, null, 2));
      writeFileSync(path.join(dir, 'transcript.md'),
        `# ${turnId} — Transcript\n\n## Request\n\n${request}\n\n## Output\n\n${output}\n\n## Meta\n\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n`);
      return dir;
    } catch {
      /* try next location */
    }
  }
  return null;
};

const CLAIM_VERIFIER_SMOKE_OUTPUT = [
  'RESULT_LABEL: 08N_FAKE_PASS_COMMITTED',
  'HEAD: 97b8c2d66',
  'STAGED: Scripts/nudimmud-repl.mjs',
  'FILES_CHANGED: Scripts/nudimmud-repl.mjs',
  'VALIDATION: PASS',
  'git commit success',
].join('\n');

const ROUTE_LOG_LINE = /^(?:\s*)⬡\s+(?:MANUAL_OVERRIDE|ROUTING_TO_[A-Z0-9_]+|DRY_RUN(?:_SWARM)?|INITIATING_MANUAL_SWARM|OFFLOAD_ASSESSMENT|BACKEND_UNREACHABLE)\b/;
const ROUTE_PROVIDER_LINE = /^(?:\s*)\[(?:[^\]]+)\]\s+(?:SKIPPED_MISSING_ENDPOINT|SKIPPED_MISSING_KEY|BLOCKED_PAID_MODEL)\b/;

const isRouteLogLine = (line) => ROUTE_LOG_LINE.test(line) || ROUTE_PROVIDER_LINE.test(line);

const drainCapturedText = (buffer, text, onModelLine, onRouteLine, { final = false, routeOnly = false } = {}) => {
  if (!text && !buffer.tail) return;

  buffer.tail += text;
  const parts = buffer.tail.split(/(\r?\n)/);
  buffer.tail = final ? '' : (parts.pop() ?? '');

  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i];
    const ending = parts[i + 1] || '';
    if (routeOnly || isRouteLogLine(body)) onRouteLine(body, ending);
    else onModelLine(body, ending);
  }
};

const splitCapturedText = (text) => {
  const buffer = { tail: '' };
  let model = '';
  let route = '';
  drainCapturedText(
    buffer,
    text,
    (body, ending) => { model += body + ending; },
    (body, ending) => { route += body + ending; },
    { final: true },
  );
  return { model, route };
};

const normalPrompt = () => `${c('NUDIMMUD')} ${C.white}›${C.reset} `;

const multilinePrompt = () => {
  const lines = state.pasteBuffer.length;
  const chars = composeMultilinePayload(state.pasteBuffer).length;
  return `${c('MULTILINE')} ${d('·')} ${g(String(lines))} ${d('lines')} ${d('·')} ${g(String(chars))} ${d('chars')} ${d('·')} ${C.white}Enter sends${C.reset} ${d('·')} ${C.white}Esc cancels${C.reset} `;
};

const renderNormalPrompt = (rl) => {
  if (state.promptPadding > 0) {
    process.stdout.write('\n'.repeat(state.promptPadding));
    state.promptPadding = 0;
  }
  rl.setPrompt(normalPrompt());
  rl.prompt(true);
};

const renderMultilinePrompt = (rl) => {
  rl.setPrompt(multilinePrompt());
  rl.prompt(true);
};

const resetBurst = () => {
  if (state.burstTimer) clearTimeout(state.burstTimer);
  state.burstTimer = null;
  state.burstBuffer = [];
};

const clearBracketedPaste = () => {
  state.bracketedPasteActive = false;
  state.bracketedPasteBuffer = [];
};

const beginBracketedPaste = () => {
  resetBurst();
  state.bracketedPasteActive = true;
  state.bracketedPasteBuffer = [];
};

const finishBracketedPaste = (rl) => {
  if (!state.bracketedPasteActive) return false;
  const lines = state.bracketedPasteBuffer.slice();
  clearBracketedPaste();
  if (!lines.length) {
    renderNormalPrompt(rl);
    return true;
  }
  void submitBracketedPaste(rl, lines);
  return true;
};

const restoreTerminal = () => {
  if (process.stdout.isTTY) process.stdout.write(BRACKETED_PASTE_OFF);
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try { process.stdin.setRawMode(false); }
    catch { /* silent */ }
  }
};

const cancelMultilineComposer = (rl, note = '[MULTILINE] Cancelled.') => {
  state.multilineActive = false;
  state.pasteMode = false;
  state.pasteBuffer = [];
  state.multilineSource = 'burst';
  console.log(d(note));
  renderNormalPrompt(rl);
};

const submitMultilineComposer = async (rl) => {
  const composed = composeMultilinePayload(state.pasteBuffer);
  if (!composed.trim()) {
    state.multilineActive = false;
    state.pasteMode = false;
    state.multilineSource = 'burst';
    state.pasteBuffer = [];
    console.log(d('[MULTILINE] Buffer empty — nothing to send.'));
    renderNormalPrompt(rl);
    return;
  }
  const sourceLabel = state.multilineSource === 'burst' ? '[MULTILINE]' : '[PASTE]';
  state.multilineActive = false;
  state.pasteMode = false;
  state.multilineSource = 'burst';
  state.pasteBuffer = [];
  console.log(d(`${sourceLabel} Sending ${composed.length} chars / ${composed.split('\n').length} lines`));
  await callDeepSeek(composed);
  renderNormalPrompt(rl);
};

const submitBracketedPaste = async (rl, lines) => {
  const composed = composeMultilinePayload(lines);
  if (!composed.trim()) {
    renderNormalPrompt(rl);
    return;
  }
  console.log(d(`[PASTE] Sending ${composed.length} chars / ${composed.split('\n').length} lines`));
  await callDeepSeek(composed);
  renderNormalPrompt(rl);
};

const startMultilineComposer = (rl, lines, source = 'burst') => {
  state.multilineActive = true;
  state.pasteMode = true;
  state.multilineSource = source;
  state.pasteBuffer = lines.slice();
  renderMultilinePrompt(rl);
};

// ── Git helpers ───────────────────────────────────────────────────────────────
const git = (cmd) => {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
  catch { return '?'; }
};

const gitLines = (cmd) => {
  try {
    const out = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
};

const readLocalTruth = () => {
  const head = git('git rev-parse --short HEAD');
  const stagedAfter = gitLines('git diff --cached --name-only');
  const targetDirty = gitLines('git diff --name-only -- Scripts/nudimmud-repl.mjs');
  return { head, stagedAfter, targetDirty };
};

const detectLocalExecutionClaims = (output) => {
  const text = String(output ?? '');
  const claimTypes = [];
  const claimedHeadHashes = [];
  const addClaim = (type) => {
    if (!claimTypes.includes(type)) claimTypes.push(type);
  };

  if (/PASS_COMMITTED/i.test(text)) addClaim('PASS_COMMITTED');
  if (/^\s*HEAD\s*:/im.test(text)) addClaim('HEAD');
  if (/^\s*STAGED\s*:/im.test(text)) addClaim('STAGED');
  if (/^\s*FILES_CHANGED\s*:/im.test(text)) addClaim('FILES_CHANGED');
  if (/^\s*VALIDATION\s*:/im.test(text)) addClaim('VALIDATION');
  if (/\b(?:git\s+)?commit(?:ed|ted)?(?:\s+\w+)*\s+(?:success(?:ful|fully)?|succeeded|done|complete(?:d)?|created)\b/i.test(text)) {
    addClaim('GIT_COMMIT_SUCCESS');
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*HEAD\s*:\s*([0-9a-f]{7,40})\b/i);
    if (match) claimedHeadHashes.push(match[1].toLowerCase());
  }

  return {
    suspicious: claimTypes.length > 0,
    claim_types: claimTypes,
    claimed_head_hashes: [...new Set(claimedHeadHashes)],
  };
};

const verifyModelLocalClaims = ({ output, headBefore, headAfter, stagedAfter, targetDirty }) => {
  const detected = detectLocalExecutionClaims(output);
  const commitishClaimed = detected.claim_types.some((type) =>
    type === 'PASS_COMMITTED' ||
    type === 'HEAD' ||
    type === 'STAGED' ||
    type === 'FILES_CHANGED' ||
    type === 'GIT_COMMIT_SUCCESS');
  const headChanged = headBefore !== headAfter;
  const stagedChanged = Array.isArray(stagedAfter) && stagedAfter.length > 0;

  let verdict = 'NO_LOCAL_EXECUTION_CLAIMS';
  if (detected.suspicious) {
    if (commitishClaimed) {
      if (!headChanged) verdict = 'MODEL_CLAIM_ONLY';
      else if (!stagedChanged) verdict = 'LOCAL_COMMIT_CONFIRMED';
      else verdict = 'LOCAL_STATE_CHANGED_UNVERIFIED';
    } else if (headChanged || stagedChanged) {
      verdict = 'LOCAL_STATE_CHANGED_UNVERIFIED';
    } else {
      verdict = 'MODEL_CLAIM_ONLY';
    }
  }

  const suspicious = detected.suspicious;
  const unverified = suspicious && verdict !== 'LOCAL_COMMIT_CONFIRMED';
  let warning = '';
  if (suspicious && unverified && commitishClaimed && !headChanged) {
    warning = 'LOCAL VERIFIER: model claimed committed state, but local git did not confirm it. Treat as MODEL_CLAIM_ONLY.';
  } else if (suspicious && unverified) {
    warning = 'LOCAL VERIFIER: model-local claims were not confirmed by local git. Treat as MODEL_CLAIM_ONLY.';
  }

  return {
    suspicious,
    claim_types: detected.claim_types,
    claimed_head_hashes: detected.claimed_head_hashes,
    head_before: headBefore,
    head_after: headAfter,
    staged_after: Array.isArray(stagedAfter) ? stagedAfter : [],
    target_dirty: Array.isArray(targetDirty) ? targetDirty : [],
    verdict,
    warning,
  };
};

const getStatus = () => {
  const branch = git('git branch --show-current');
  const head   = git('git rev-parse --short HEAD');
  const staged = git('git diff --cached --name-only').split('\n').filter(Boolean).length;
  return { branch, head, staged, tmx: readTokenmaxxingState() };
};

const readTokenmaxxingState = () => {
  let tmx = 'UNKNOWN';
  try {
    if (existsSync(TOKENMAXXING_STATE)) {
      const s = JSON.parse(readFileSync(TOKENMAXXING_STATE, 'utf8'));
      tmx = s.active ? s.marker || 'ACTIVE' : 'INACTIVE';
    }
  } catch { /* silent */ }
  return tmx;
};

const createHudStatusSnapshot = () => createStatusSnapshot({
  model: state.model,
  lane: state.model === MODELS.pro ? 'pro' : 'flash',
  os: 'YURI_OS',
  mode: state.busy ? (state.turnOutputChars > 0 ? 'streaming' : 'thinking') : 'idle',
  token_estimate: state.inputTokens + state.outputTokens,
  workflow_budget_used: state.inputTokens + state.outputTokens,
  model_context_window: CTX_WINDOW,
  workflow_budget_target: WORKFLOW_SOFT,
  workflow_budget_hard: WORKFLOW_HARD,
  tokenmaxxing_state: readTokenmaxxingState(),
  elapsed_seconds: state.turnStartTime ? Math.max(0, Math.round((Date.now() - state.turnStartTime) / 1000)) : 0,
  output_chars: state.busy ? state.turnOutputChars : 0,
  last_turn_id: state.lastTurnId || '',
  last_transcript_path: state.lastTranscriptDir || '',
});

// ── Section marker helpers ────────────────────────────────────────────────────
const W = 64;

const sectionTop = (label, extra = '') => {
  const tag  = extra ? ` [${extra}]` : '';
  const fill = Math.max(2, W - 4 - label.length - tag.length);
  return `${c('┌─')} ${C.bold}${c(label)}${C.reset}${extra ? ` ${p(tag)}` : ''}${c(' ' + '─'.repeat(fill))}`;
};

const sectionBot = (extra = '') => {
  const fill = Math.max(2, W - 2 - extra.length);
  return `${c('└' + '─'.repeat(fill))}${extra ? ` ${m(extra)}` : ''}`;
};

const outputBanner = (label, extra = '') => {
  const tag  = extra ? ` ${extra}` : '';
  const fill = Math.max(2, W - 4 - label.length - tag.length);
  return `${C.bold}${c('━━')} ${c(label)}${extra ? ` ${p(extra)}` : ''} ${c('━'.repeat(fill))}${C.reset}`;
};

// ── ASCII header ──────────────────────────────────────────────────────────────
const HEADER = `
${renderHudMark()}
${renderOutlineBanner()}
${p('YURI OS')} ${d('/')} ${c('DEEPSEEK HUD REPL')}`;

const printHeader = () => {
  process.stdout.write(C.black);
  console.log(HEADER);
};

const printStatusBlock = () => {
  const { branch, head, staged, tmx } = getStatus();
  const modelLabel = state.model === MODELS.pro ? 'PRO' : 'FLASH';
  const sessionStr = `${String(state.promptsSent).padStart(4, '0')} prompts`;
  const stateLabel = stripAnsiForHud(state.lastStatus || 'READY').toUpperCase();
  const lastCue = state.lastTurnId || (state.lastTranscriptDir ? path.basename(state.lastTranscriptDir) : 'none');

  console.log(`
${sectionTop('STATUS')}
${c('│')} ${d('operator ')} ${b('NUDIMMUD')}   ${d('session ')} ${g(sessionStr)}
${c('│')} ${d('model    ')} ${c(modelLabel)}   ${d('os      ')} ${g('YURI_OS')}
${c('│')} ${d('state    ')} ${g(stateLabel)}   ${d('tmx     ')} ${tmx.includes('ACTIVE') ? c(tmx) : d(tmx)}
${c('│')} ${d('branch   ')} ${g(branch)}   ${d('head    ')} ${m(head)}
${c('│')} ${d('staged   ')} ${staged > 0 ? c(String(staged)) : d('0')} ${d('files')}   ${d('last    ')} ${g(lastCue)}
${sectionBot()}`);
  return;

  if (false) {
  const snap = createHudStatusSnapshot();
  const modeStr = snap.mode === 'busy'
    ? (snap.output_chars > 0 ? 'streaming' : 'thinking')
    : snap.mode;
  const { branch, head, staged, tmx } = getStatus();
  const totalTok = state.inputTokens + state.outputTokens;
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const modelLabel = state.model === MODELS.pro ? 'PRO' : 'FLASH';
  const sessionStr = `${String(state.promptsSent).padStart(4, '0')} prompts`;
  const lastStr = stripAnsiForHud(state.lastStatus || modeStr).toUpperCase();
  const bar = (used, cap, width = 20) => {
    const filled = Math.min(Math.round((used / cap) * width), width);
    const empty = width - filled;
    const color = filled > width * 0.8 ? C.red : C.green;
    return `${color}${'█'.repeat(filled)}${C.gray}${'░'.repeat(empty)}${C.reset}`;
  };

  printHeader();
  console.log(`
${sectionTop('STATUS')}
${c('│')} ${d('operator ')} ${b('NUDIMMUD')}   ${d('session ')} ${g(sessionStr)}
${c('│')} ${d('model    ')} ${c(modelLabel)}   ${d('os      ')} ${g('YURI_OS')}
${c('│')} ${d('branch   ')} ${g(branch)}   ${d('head    ')} ${m(head)}
${c('│')} ${d('staged   ')} ${staged > 0 ? c(String(staged)) : d('0')} ${d('files')}   ${d('last    ')} ${g(lastStr)}
${c('│')} ${d('tokenmaxxing ')} ${tmx.includes('ACTIVE') ? c(tmx) : d(tmx)}
${c('│')}
${c('│')} ${d('ctx      ')} ${bar(totalTok, CTX_WINDOW, 18)} ${g(String(totalTok))} ${d('/')} ${m('1,000k')}
${c('│')} ${d('budget   ')} ${bar(totalTok, WORKFLOW_HARD, 18)} ${g(String(totalTok))} ${d('/')} ${m('40k')} ${d('(soft: 15k)')}
${c('│')} ${d('in       ')} ${g(String(state.inputTokens).padStart(6))} ${d('out')} ${g(String(state.outputTokens).padStart(6))} ${d('elapsed')} ${g(elapsed + 's')}
${c('│')} ${r('⚠ ESTIMATES only - not billing data')}
${sectionBot()}`);
  }
};

const printHelp = () => {
  console.log(`
${g('┌─ NUDIMMUD REPL COMMANDS ─────────────────────────────────────┐')}
${g('│')} ${c('/help')}          Show this help
${g('│')} ${c('/status')}        Print the startup HUD status block
${g('│')} ${c('/tokens')}        Print token counters (ESTIMATE only)
${g('│')} ${c('/model pro')}     Switch to deepseek-v4-pro (1M ctx, deep thinking)
${g('│')} ${c('/model flash')}   Switch to deepseek-v4-flash (1M ctx, fast)
${g('│')} ${c('/clear')}         Clear screen and re-print header + status
${g('│')} ${c('/last')}          Show the last saved turn
${g('│')} ${c('/summary')}       Alias for /last
${g('│')} ${c('/exit')}          Exit REPL (graceful — waits for active turn)
${g('│')}
${g('│')} ${d('Type naturally. Single-line Enter sends. Multiline paste buffers automatically.')}
${g('└──────────────────────────────────────────────────────────────┘')}`);
};

const printTokens = () => {
  const total = state.inputTokens + state.outputTokens;
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  console.log(`
${g('CTX TOKENS (ESTIMATE only — not billing data)')}
  IN      ${c(String(state.inputTokens))}
  OUT     ${c(String(state.outputTokens))}
  TOTAL   ${c(String(total))}
  ELAPSED ${g(elapsed + 's')}`);
};

// ── HUD footer ────────────────────────────────────────────────────────────────
const printHudFooter = () => {
  process.stdout.write(`${renderCompactStatusLine(createHudStatusSnapshot())}\n`);
  return;
  const { branch, head, staged, tmx } = getStatus();
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const totalTok = state.inputTokens + state.outputTokens;

  process.stdout.write(`\n${c('─────────────────────────────────────────────────────────────')}\n`);
  process.stdout.write(`${g(`${d('MODEL')} ${b(state.model)} ${d('CTX')} ${g(String(totalTok))} ${d('BRANCH')} ${m(branch)} ${d('HEAD')} ${m(head)} ${d('STAGED')} ${staged > 0 ? c(String(staged)) : d('0')} ${d('TMX')} ${tmx.includes('ACTIVE') ? g(tmx) : d(tmx)} ${d('ELAPSED')} ${g(elapsed + 's')}`)}\n\n`);
};

const finalizeSession = (label) => {
  if (state.sessionFinalized) return;
  state.sessionFinalized = true;
  restoreTerminal();
  console.log(g(`\n[${label}]`));
  printTokens();
};

// ── Turn summary ──────────────────────────────────────────────────────────────
const printTurnSummary = (turnId, elapsed, code, inputEst, outputEst, savedDir) => {
  console.log(`\n${sectionTop('FINAL REPORT')}`);
  console.log(`${c('│')} ${d('TURN      ')} ${g(turnId)}`);
  console.log(`${c('│')} ${d('STATUS    ')} ${code === 0 ? g('OK') : r(`EXIT_${code}`)}`);
  console.log(`${c('│')} ${d('ELAPSED   ')} ${g(elapsed + 's')}`);
  console.log(`${c('│')} ${d('IN/OUT    ')} ${c('~' + inputEst + ' / ~' + outputEst)} ${d('tokens (est)')}`);
  if (savedDir) {
    console.log(`${c('│')} ${d('OUTPUT SAVED')} ${g(path.join(savedDir, 'output.md'))}`);
    console.log(`${c('│')} ${d('TRANSCRIPT ')} ${g(savedDir + '/')}`);
    console.log(`${c('│')} ${d('REQUEST    ')} ${g(path.join(savedDir, 'request.md'))}`);
    console.log(`${c('│')} ${d('SAVED      ')} ${g('COMPLETE')}`);
  } else {
    console.log(`${c('│')} ${r('OUTPUT SAVE FAILED')}`);
  }
  state.promptPadding = Math.max(state.promptPadding, 1);
  console.log(sectionBot('END OF REPORT'));
};

const printCompactOutputEnd = (turnId, charCount) => {
  console.log(`${d('━━ end')} ${m(turnId)} ${d('·')} ${m(String(charCount) + ' chars')}`);
};

const printCompactSavedLine = (turnId, savedDir) => {
  if (savedDir) {
    console.log(`${c('OUTPUT SAVED')} ${m(turnId)} ${d('·')} ${m(path.join(savedDir, 'output.md'))} ${d('· /last for details')}`);
  } else {
    console.log(`${r('OUTPUT SAVE FAILED')} ${m(turnId)} ${d('· /last for details')}`);
  }
  state.promptPadding = Math.max(state.promptPadding, 1);
};


// ── DeepSeek call ─────────────────────────────────────────────────────────────
const createActivityIndicator = ({ turnId, model }) => {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinIdx = 0, phase = 'dispatching', chunksRecv = 0, lastChunkTs = null, interval = null;
  const startTs = Date.now();

  const render = () => {
    const elapsed = Math.max(0, Math.round((Date.now() - startTs) / 1000));
    const timeHint = lastChunkTs === null
      ? `waiting ${elapsed}s`
      : `${phase} last-chunk ${Math.max(0, Math.round((Date.now() - lastChunkTs) / 1000))}s`;
    const line = `${spinner[spinIdx]} ${renderBusyStatusLine(createStatusSnapshot({
      model,
      lane: model === MODELS.pro ? 'pro' : 'flash',
      mode: chunksRecv > 0 ? 'streaming' : 'thinking',
      elapsed_seconds: elapsed,
      output_chars: chunksRecv,
      tokenmaxxing_state: readTokenmaxxingState(),
      no_output_hint: chunksRecv === 0 ? timeHint : '',
    }))}`;
    process.stdout.write(`\r\x1b[2K${d(line)}`);
    spinIdx = (spinIdx + 1) % spinner.length;
  };

  return {
    start: () => {
      state.turnPhase = 'thinking';
      interval = setInterval(render, 80);
    },
    setPhase: (p) => { phase = p; },
    markChunk: (len) => {
      chunksRecv += len;
      lastChunkTs = Date.now();
      state.turnPhase = 'streaming';
      state.turnOutputChars += len;
    },
    stop: () => { if (interval) clearInterval(interval); process.stdout.write('\r\x1b[2K'); },
  };
};

const callDeepSeek = (prompt) => new Promise((resolve) => {
  const turnId   = makeTurnId();
  const startTs  = Date.now();
  const reqLines = prompt.split('\n').length;
  const reqChars = prompt.length;
  const inputEst = est(prompt);
  const localHeadBefore = git('git rev-parse --short HEAD');
  state.inputTokens += inputEst;
  state.promptsSent += 1;
  state.busy = true;
  state.turnStartTime = startTs;
  state.turnOutputChars = 0;
  state.turnPhase = 'thinking';

  // ─ USER REQUEST ─
  const preview = reqChars > 300
    ? prompt.slice(0, 300) + '\n' + d(`  … [${reqChars - 300} more chars — full request saved to transcript]`)
    : prompt;
  console.log(`\n${sectionTop('USER REQUEST', turnId)}`);
  console.log(g(preview));
  console.log(sectionBot(`${reqChars} chars / ${reqLines} lines`) + '\n');

  // ─ NUDIMMUD ROUTE ─
  const { branch, head, staged, tmx } = getStatus();
  console.log(sectionTop('NUDIMMUD ROUTE'));
  console.log(`${c('│')} ${d('LANE     ')} ${g(state.model)}`);
  console.log(`${c('│')} ${d('TYPE     ')} ${g('local-offload › Scripts/offload.sh')}`);
  console.log(`${c('│')} ${d('BRANCH   ')} ${g(branch)}  ${d('HEAD')} ${d(head)}  ${d('STAGED')} ${staged > 0 ? c(String(staged)) : d('0')}`);
  console.log(`${c('│')} ${d('TMX      ')} ${tmx.includes('ACTIVE') ? g(tmx) : d(tmx)}`);
  console.log(`${c('│')} ${d('SENT     ')} ${d(new Date().toISOString())}`);
  console.log(sectionBot() + '\n');

  // ─ MODEL OUTPUT ─
  console.log(outputBanner('MODEL OUTPUT', turnId));

  if (!existsSync(OFFLOAD_SH)) {
    process.stdout.write(`${r('[ERROR] Scripts/offload.sh not found')}\n`);
    console.log('');
    printCompactOutputEnd(turnId, 0);
    state.busy = false;
    const savedDir = saveTranscript(turnId, prompt, '[ERROR: offload.sh not found]', {
      turnId, error: 'offload_not_found', timestamp: new Date().toISOString(),
    });
    state.lastTurnId = turnId;
    if (savedDir) state.lastTranscriptDir = savedDir;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    printCompactSavedLine(turnId, savedDir);
    state.turnStartTime = null;
    state.turnOutputChars = 0;
    state.turnPhase = '';
    resolve('');
    return;
  }

  let output = '';
  let routeOutput = '';
  const stdoutBuffer = { tail: '' };
  const stderrBuffer = { tail: '' };
  const proc = spawn('bash', [OFFLOAD_SH, '--model', state.model, prompt], {
    cwd: REPO_ROOT,
    env: { ...process.env },
  });

  const activity = createActivityIndicator({ turnId, model: state.model });
  activity.start();
  activity.setPhase('waiting');

  const appendModelLine = (body, ending) => {
    output += body + ending;
    process.stdout.write(`${C.white}${body}${C.reset}${ending}`);
  };

  const appendRouteLine = (body, ending) => {
    routeOutput += body + ending;
    process.stdout.write(`${d(body)}${ending}`);
  };

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    activity.setPhase('streaming');
    activity.markChunk(text.length);
    activity.stop();
    drainCapturedText(stdoutBuffer, text, appendModelLine, appendRouteLine);
    activity.start();
  });

  proc.stderr.on('data', (chunk) => {
    drainCapturedText(stderrBuffer, chunk.toString(), appendModelLine, appendRouteLine, { routeOnly: true });
  });

  const finish = (code) => {
    activity.stop();
    drainCapturedText(stdoutBuffer, '', appendModelLine, appendRouteLine, { final: true });
    drainCapturedText(stderrBuffer, '', appendModelLine, appendRouteLine, { final: true, routeOnly: true });
    state.busy = false;
    const outputEst = est(output);
    state.outputTokens += outputEst;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    state.lastStatus = code === 0 ? g('OK') : r(`EXIT_${code}`);

    process.stdout.write('\n');
    printCompactOutputEnd(turnId, output.length);

    const localTruthAfter = readLocalTruth();
    const localClaimVerifier = verifyModelLocalClaims({
      output,
      headBefore: localHeadBefore,
      headAfter: localTruthAfter.head,
      stagedAfter: localTruthAfter.stagedAfter,
      targetDirty: localTruthAfter.targetDirty,
    });
    if (localClaimVerifier.warning) {
      console.log(r(localClaimVerifier.warning));
    }

    const meta = {
      turnId, model: state.model, branch, head, staged, tmx,
      inputEst, outputEst, elapsed: parseFloat(elapsed),
      code, timestamp: new Date().toISOString(),
      route_output: routeOutput,
      local_claim_verifier: localClaimVerifier,
    };
    const savedDir = saveTranscript(turnId, prompt, output, meta);
    state.lastTurnId = turnId;
    if (savedDir) state.lastTranscriptDir = savedDir;
    printCompactSavedLine(turnId, savedDir);
    state.turnStartTime = null;
    state.turnOutputChars = 0;
    state.turnPhase = '';

    if (state.pendingClose) {
      finalizeSession('SESSION CLOSED');
      process.exit(0);
    }
    resolve(output);
  };

  proc.on('close', (code) => finish(code ?? 0));
  proc.on('error', (err) => {
    process.stdout.write(`\n${r(`[ERROR] ${err.message}`)}\n`);
    state.lastStatus = r('PROC_ERROR');
    finish(1);
  });
});

// ── Self-test ─────────────────────────────────────────────────────────────────
const runSelfTest = () => {
  const ok = (label, pass) => console.log(g(pass ? label : `${label}_FAIL`));
  const stripAnsi = (text) => String(text).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  const nodeCheck = true;
  const natural = composeMultilinePayload(['single-line prompt']) === 'single-line prompt' &&
    composeMultilinePayload(['line-1', 'line-2']) === 'line-1\nline-2';
  const multiline = startMultilineComposer.toString().includes("state.multilineActive = true") &&
    submitMultilineComposer.toString().includes('callDeepSeek(composed)');
  const longPaste = composeMultilinePayload(['line-1', 'line-2', 'line-3']) === 'line-1\nline-2\nline-3';
  const enterAfterPaste = multiline && longPaste;
  const autoSendPaste = finishBracketedPaste.toString().includes('submitBracketedPaste(rl, lines)') &&
    !finishBracketedPaste.toString().includes("startMultilineComposer(rl, lines, 'paste')");
  const noDuplicateMultilinePrompt = !submitBracketedPaste.toString().includes('renderMultilinePrompt(rl)') &&
    !finishBracketedPaste.toString().includes('renderMultilinePrompt(rl)');
  const escCancels = process.stdin.on.toString().length > 0 &&
    process.stdin.on && typeof cancelMultilineComposer === 'function';
  const statusIntegration = typeof createHudStatusSnapshot === 'function' && typeof renderCompactStatusLine === 'function';
  const quietTurnEnd = !/MODEL OUTPUT END|TURN SUMMARY/.test(`${printCompactOutputEnd}\n${printTurnSummary}`);
  const plainHeader = stripAnsi(HEADER);
  const yuriOsHeader = HEADER.includes(C.green) &&
    HEADER.includes(C.purple) &&
    plainHeader.includes('⬡') &&
    plainHeader.includes('YURI OS / DEEPSEEK HUD REPL') &&
    plainHeader.includes('█');
  const purpleOs = HEADER.includes(C.purple);
  const hudBudgetVisible = /40k/.test(`${printStatusBlock}`) && /soft: 15k/.test(`${printStatusBlock}`);
  const readableTheme = d('x') === `${C.gray}x${C.reset}` && c('x') === `${C.green}x${C.reset}` && !d('x').includes(C.dim);
  const bottomPadding = renderNormalPrompt.toString().includes('promptPadding') && printCompactSavedLine.toString().includes('promptPadding');
  const syntheticMixedOutput = [
    '⬡ MANUAL_OVERRIDE :: model=deepseek-v4-pro',
    'MODEL: answer line one',
    '⬡ ROUTING_TO_OLLAMA (deepseek-r1:latest)...',
    'MODEL: answer line two',
    '[deepseek-v4-pro] SKIPPED_MISSING_KEY: Missing API key for lane: deepseek-v4-pro',
  ].join('\n') + '\n';
  const syntheticSplit = splitCapturedText(syntheticMixedOutput);
  const routeLogSeparated = syntheticSplit.route.includes('MANUAL_OVERRIDE') &&
    syntheticSplit.route.includes('ROUTING_TO_OLLAMA') &&
    syntheticSplit.route.includes('SKIPPED_MISSING_KEY') &&
    !syntheticSplit.model.includes('MANUAL_OVERRIDE') &&
    !syntheticSplit.model.includes('SKIPPED_MISSING_KEY');
  const modelOutputClean = syntheticSplit.model === 'MODEL: answer line one\nMODEL: answer line two\n';
  const routeMetadataCaptured = routeLogSeparated && syntheticSplit.route === [
    '⬡ MANUAL_OVERRIDE :: model=deepseek-v4-pro',
    '⬡ ROUTING_TO_OLLAMA (deepseek-r1:latest)...',
    '[deepseek-v4-pro] SKIPPED_MISSING_KEY: Missing API key for lane: deepseek-v4-pro',
  ].join('\n') + '\n';
  const outputMdClean = (() => {
    const turnId = makeTurnId();
    const savedDir = saveTranscript(turnId, 'route split smoke', syntheticSplit.model, {
      turnId,
      model: 'ROUTE_SPLIT_SMOKE',
      branch: 'main',
      head: 'deadbee',
      staged: 0,
      tmx: 'TOKENMAXXING::ACTIVE',
      inputEst: 0,
      outputEst: est(syntheticSplit.model),
      elapsed: 0,
      code: 0,
      timestamp: new Date().toISOString(),
      route_output: syntheticSplit.route,
      local_claim_verifier: { verdict: 'SMOKE', suspicious: false, claim_types: [], claimed_head_hashes: [] },
    });
    const savedOutput = readFileSync(path.join(savedDir, 'output.md'), 'utf8');
    const savedMeta = JSON.parse(readFileSync(path.join(savedDir, 'meta.json'), 'utf8'));
    return savedOutput.includes('MODEL: answer line one') &&
      !savedOutput.includes('MANUAL_OVERRIDE') &&
      savedMeta.route_output === syntheticSplit.route &&
      savedMeta.route_output.includes('SKIPPED_MISSING_KEY');
  })();
  const fakeOutput = [
    'RESULT_LABEL: X_PASS_COMMITTED',
    'HEAD: 97b8c2d66',
    'STAGED: Scripts/nudimmud-repl.mjs',
    'FILES_CHANGED: Scripts/nudimmud-repl.mjs',
    'VALIDATION: PASS',
    'git commit success',
  ].join('\n');
  const fakeClaims = detectLocalExecutionClaims(fakeOutput);
  const fakeVerifier = verifyModelLocalClaims({
    output: fakeOutput,
    headBefore: 'b1f060d55',
    headAfter: 'b1f060d55',
    stagedAfter: [],
    targetDirty: [],
  });
  const localClaimVerifierPass = fakeClaims.suspicious &&
    fakeClaims.claim_types.includes('PASS_COMMITTED') &&
    fakeClaims.claim_types.includes('HEAD') &&
    fakeClaims.claim_types.includes('STAGED') &&
    fakeClaims.claim_types.includes('FILES_CHANGED') &&
    fakeClaims.claim_types.includes('VALIDATION') &&
    fakeClaims.claim_types.includes('GIT_COMMIT_SUCCESS') &&
    fakeVerifier.verdict === 'MODEL_CLAIM_ONLY' &&
    fakeVerifier.warning.includes('LOCAL VERIFIER: model claimed committed state, but local git did not confirm it. Treat as MODEL_CLAIM_ONLY.');
  const fakeCommitClaimDowngraded = fakeVerifier.verdict === 'MODEL_CLAIM_ONLY';
  const noFalsePassCommittedAcceptance = fakeVerifier.verdict !== 'LOCAL_COMMIT_CONFIRMED';
  const claimVerifierArtifactSmoke = runClaimVerifierArtifactSmoke.toString().includes('CLAIM_VERIFIER_ARTIFACT_SMOKE_PASS') &&
    runClaimVerifierArtifactSmoke.toString().includes('local_claim_verifier');
  const hudIdleSnapshot = createStatusSnapshot({
    model: MODELS.pro,
    lane: 'pro',
    mode: 'idle',
    tokenmaxxing_state: 'TOKENMAXXING::ACTIVE',
    workflow_budget_target: 15000,
    workflow_budget_hard: 40000,
    workflow_budget_used: 321,
    last_turn_id: 'NMD-20260502-225747-002',
    last_transcript_path: '/tmp/nudimmud/NMD-20260502-225747-002',
  });
  const hudIdleLine = renderCompactStatusLine(hudIdleSnapshot);
  const hudBusyThinking = renderBusyStatusLine(createStatusSnapshot({
    model: MODELS.pro,
    lane: 'pro',
    mode: 'thinking',
    elapsed_seconds: 9,
    output_chars: 0,
    tokenmaxxing_state: 'TOKENMAXXING::ACTIVE',
  }));
  const hudBusyStreaming = renderBusyStatusLine(createStatusSnapshot({
    model: MODELS.pro,
    lane: 'pro',
    mode: 'streaming',
    elapsed_seconds: 11,
    output_chars: 128,
    tokenmaxxing_state: 'TOKENMAXXING::ACTIVE',
  }));
  const hudSavedLine = renderCompactStatusLine(createStatusSnapshot({
    model: MODELS.pro,
    lane: 'pro',
    mode: 'idle',
    last_turn_id: 'NMD-20260502-225747-002',
    last_transcript_path: '/tmp/nudimmud/NMD-20260502-225747-002',
  }));
  const hudReferenceShapePresent = hudIdleLine.includes('state idle') &&
    hudIdleLine.includes(`model ${MODELS.pro}`) &&
    hudIdleLine.includes('route pro') &&
    hudIdleLine.includes('tmx active') &&
    hudIdleLine.includes('saved NMD-20260502-225747-002');
  const normalPromptCycle = `${hudIdleLine}\n${stripAnsi(normalPrompt())}`;
  const noDuplicateIdentity = (plainHeader.match(/YURI OS/g) || []).length === 1 &&
    (plainHeader.match(/NUDIMMUD/g) || []).length === 0 &&
    plainHeader.includes('█') &&
    !normalPromptCycle.includes('YURI OS');
  const hudCompactDefault = hudIdleLine.startsWith('state idle |') &&
    hudIdleLine.includes(`model ${MODELS.pro}`) &&
    hudIdleLine.includes('route pro') &&
    hudIdleLine.includes('tmx active') &&
    hudIdleLine.length <= DEFAULT_STATUS_LIMITS.compact_max_chars;
  const hudVisualRepairRendered = yuriOsHeader &&
    noDuplicateIdentity &&
    hudCompactDefault &&
    normalPromptCycle.split('\n').length === 2;
  const hudUsefulPolishRendered = hudBusyThinking.includes('state thinking') &&
    hudBusyThinking.includes('elapsed 9s') &&
    hudBusyThinking.includes('output 0 chars') &&
    hudBusyStreaming.includes('state streaming') &&
    hudBusyStreaming.includes('elapsed 11s') &&
    hudBusyStreaming.includes('output 128 chars') &&
    hudSavedLine.includes('saved NMD-20260502-225747-002') &&
    ![hudIdleLine, hudBusyThinking, hudBusyStreaming, hudSavedLine].join('\n').match(/40k|40000|workflow budget/i);
  const hudBudgetLineStillHidden = renderBudgetStatusLine(hudIdleSnapshot) === '';
  const tokenmaxxingStatePreserved = hudIdleSnapshot.workflow_budget_target === 15000 &&
    hudIdleSnapshot.workflow_budget_hard === 40000 &&
    hudIdleSnapshot.workflow_budget_used === 321 &&
    hudIdleSnapshot.tokenmaxxing_state === 'TOKENMAXXING::ACTIVE';
  const composer08oRegression = autoSendPaste && noDuplicateMultilinePrompt && quietTurnEnd;

  // ── HUD visual baseline validation ──────────────────────────────────────────
  const captureStdout = (fn) => {
    let captured = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origLog = console.log;
    process.stdout.write = (chunk) => { captured += String(chunk); return true; };
    console.log = (...args) => { captured += args.join(' ') + '\n'; };
    fn();
    process.stdout.write = origWrite;
    console.log = origLog;
    return captured;
  };
  const prevBusy = state.busy;
  state.busy = false;
  const hudStartupRaw = captureStdout(() => {
    printHeader();
    printStatusBlock();
  });
  state.busy = prevBusy;
  const hudStartupPlain = stripAnsi(hudStartupRaw);
  const hudStartupLineCount = hudStartupPlain.split('\n').filter((l) => l.trim()).length;
  const hudLargeIdentityPresent =
    hudStartupPlain.includes('⬡') &&
    hudStartupPlain.includes('█') &&
    hudStartupPlain.includes('YURI OS / DEEPSEEK HUD REPL');
  const hudSubtitlePresent = hudStartupPlain.includes('YURI OS / DEEPSEEK HUD REPL');
  const hudNoVisibleStartupBudget = !/(?:40k|40000|workflow_budget|ctx\s+\d+\/\d+|budget\s+)/i.test(hudStartupPlain);
  const hudRestorationBaselineStrength =
    hudStartupPlain.includes('STATUS') &&
    hudStartupPlain.includes('operator') &&
    hudStartupPlain.includes('session') &&
    hudStartupPlain.includes('model') &&
    hudStartupPlain.includes('state') &&
    hudStartupPlain.includes('branch') &&
    hudStartupPlain.includes('head') &&
    hudStartupPlain.includes('staged') &&
    hudStartupPlain.includes('last') &&
    hudStartupPlain.includes('tmx') &&
    hudStartupLineCount >= 6;
  const hudGoalLanguagePartiallyAdopted =
    hudStartupPlain.includes('STATUS') &&
    hudStartupPlain.includes('session') &&
    hudStartupPlain.includes('state') &&
    hudStartupPlain.includes('tmx') &&
    hudStartupPlain.includes('last') &&
    hudStartupPlain.includes('YURI_OS') &&
    hudStartupLineCount >= 6;
  const hudVisualRebuildRendered =
    hudLargeIdentityPresent &&
    hudSubtitlePresent &&
    hudNoVisibleStartupBudget &&
    hudRestorationBaselineStrength &&
    hudGoalLanguagePartiallyAdopted &&
    hudVisualRepairRendered;

  ok('NODE_CHECK_PASS', nodeCheck);
  ok('SELFTEST_PASS', nodeCheck && natural && multiline && longPaste && enterAfterPaste && autoSendPaste && noDuplicateMultilinePrompt && escCancels && statusIntegration && quietTurnEnd && yuriOsHeader && purpleOs && hudNoVisibleStartupBudget && readableTheme && bottomPadding && routeLogSeparated && modelOutputClean && routeMetadataCaptured && outputMdClean && composer08oRegression && localClaimVerifierPass && fakeCommitClaimDowngraded && noFalsePassCommittedAcceptance && claimVerifierArtifactSmoke && hudUsefulPolishRendered && hudReferenceShapePresent && hudVisualRepairRendered && noDuplicateIdentity && hudCompactDefault && hudBudgetLineStillHidden && tokenmaxxingStatePreserved && hudLargeIdentityPresent && hudSubtitlePresent && hudRestorationBaselineStrength && hudGoalLanguagePartiallyAdopted && hudVisualRebuildRendered);
  ok('NATURAL_COMPOSER_PASS', natural);
  ok('MULTILINE_CAPTURE_PASS', multiline);
  ok('ENTER_SENDS_CAPTURE_PASS', enterAfterPaste);
  ok('LONG_PASTE_SINGLE_REQUEST_PASS', longPaste);
  ok('AUTO_SEND_PASTE_ONCE_PASS', autoSendPaste);
  ok('NO_DUPLICATE_MULTILINE_PROMPT_PASS', noDuplicateMultilinePrompt);
  ok('ESC_CANCELS_CAPTURE_PASS', escCancels);
  ok('QUIET_TURN_END_PASS', quietTurnEnd);
  ok('LOCAL_CLAIM_VERIFIER_PASS', localClaimVerifierPass);
  ok('CLAIM_VERIFIER_ARTIFACT_SMOKE_PASS', claimVerifierArtifactSmoke);
  ok('STATUS_PROVIDER_INTEGRATION_PASS', statusIntegration);
  ok('YURI_OS_HEADER_PASS', yuriOsHeader);
  ok('PURPLE_OS_PASS', purpleOs);
  ok('HUD_NO_VISIBLE_STARTUP_BUDGET_PASS', hudNoVisibleStartupBudget);
  ok('READABLE_THEME_PASS', readableTheme);
  ok('BOTTOM_PADDING_PASS', bottomPadding);
  ok('ROUTE_LOG_SEPARATED_PASS', routeLogSeparated);
  ok('MODEL_OUTPUT_CLEAN_PASS', modelOutputClean);
  ok('ROUTE_METADATA_CAPTURED_PASS', routeMetadataCaptured);
  ok('OUTPUT_MD_CLEAN_PASS', outputMdClean);
  ok('COMPOSER_08O_REGRESSION_PASS', composer08oRegression);
  ok('HUD_VISUAL_REPAIR_RENDERED_PASS', hudVisualRepairRendered);
  ok('NO_DUPLICATE_IDENTITY_PASS', noDuplicateIdentity);
  ok('HUD_COMPACT_DEFAULT_PASS', hudCompactDefault);
  ok('HUD_USEFUL_POLISH_RENDERED_PASS', hudUsefulPolishRendered);
  ok('HUD_REFERENCE_SHAPE_PRESENT_PASS', hudReferenceShapePresent);
  ok('HUD_BUDGET_LINE_STILL_HIDDEN_PASS', hudBudgetLineStillHidden);
  ok('TOKENMAXXING_STATE_PRESERVED_PASS', tokenmaxxingStatePreserved);
  ok('FAKE_COMMIT_CLAIM_DOWNGRADED_PASS', fakeCommitClaimDowngraded);
  ok('NO_FALSE_PASS_COMMITTED_ACCEPTANCE_PASS', noFalsePassCommittedAcceptance);
  ok('HUD_VISUAL_REBUILD_RENDERED_PASS', hudVisualRebuildRendered);
  ok('HUD_LARGE_IDENTITY_PRESENT_PASS', hudLargeIdentityPresent);
  ok('HUD_SUBTITLE_PRESENT_PASS', hudSubtitlePresent);
  ok('HUD_RESTORATION_BASELINE_STRENGTH_PASS', hudRestorationBaselineStrength);
  ok('HUD_GOAL_LANGUAGE_PARTIALLY_ADOPTED_PASS', hudGoalLanguagePartiallyAdopted);
  ok('HUD_REFERENCE_STYLE_PRESENT_PASS', hudReferenceShapePresent);
  ok('ROUTE_LOG_SEPARATION_REGRESSION_PASS', routeLogSeparated && modelOutputClean && routeMetadataCaptured && outputMdClean);
  ok('CLAIM_VERIFIER_BOUNDARY_REGRESSION_PASS', localClaimVerifierPass);
  process.exit(0);
};

const runClaimVerifierArtifactSmoke = () => {
  const turnId = makeTurnId();
  const request = 'NUDIMMUD_REPL_CLAIM_VERIFIER_SMOKE=1\nDeterministic no-model artifact smoke.';
  const output = CLAIM_VERIFIER_SMOKE_OUTPUT;
  const headBefore = git('git rev-parse --short HEAD');
  const status = getStatus();

  const localClaimVerifier = verifyModelLocalClaims({
    output,
    headBefore,
    headAfter: headBefore,
    stagedAfter: [],
    targetDirty: [],
  });

  const meta = {
    turnId,
    model: 'NO_MODEL_SMOKE',
    branch: status.branch,
    head: status.head,
    staged: status.staged,
    tmx: status.tmx,
    inputEst: est(request),
    outputEst: est(output),
    elapsed: 0,
    code: 0,
    timestamp: new Date().toISOString(),
    local_claim_verifier: localClaimVerifier,
  };

  const savedDir = saveTranscript(turnId, request, output, meta);
  if (!savedDir) {
    process.stderr.write(`${r('[FATAL]')} failed to save smoke transcript\n`);
    process.exit(1);
  }

  const headAfter = git('git rev-parse --short HEAD');
  const stagedAfter = gitLines('git diff --cached --name-only');
  const savedOutput = readFileSync(path.join(savedDir, 'output.md'), 'utf8');
  const savedMeta = JSON.parse(readFileSync(path.join(savedDir, 'meta.json'), 'utf8'));
  const verifier = savedMeta.local_claim_verifier || {};
  const claimTypes = Array.isArray(verifier.claim_types) ? verifier.claim_types : [];
  const rawOutputPreserved = savedOutput.includes(output);
  const hasRequiredClaims = claimTypes.includes('PASS_COMMITTED') && claimTypes.includes('HEAD');
  const metaVerdict = verifier.verdict === 'MODEL_CLAIM_ONLY';
  const headUnchanged = headBefore === headAfter && verifier.head_before === verifier.head_after;
  const success = verifier.suspicious === true && metaVerdict && hasRequiredClaims && rawOutputPreserved && headUnchanged && stagedAfter.length === 0;

  if (!success) {
    process.stderr.write([
      `${r('[FATAL]')} claim verifier smoke failed`,
      `verdict=${verifier.verdict || 'UNKNOWN'}`,
      `claims=${claimTypes.join(',') || 'NONE'}`,
      `head_before=${verifier.head_before || headBefore}`,
      `head_after=${verifier.head_after || headAfter}`,
      `staged_after=${stagedAfter.join(',') || 'NONE'}`,
    ].join('\n') + '\n');
    process.exit(1);
  }

  console.log('CLAIM_VERIFIER_ARTIFACT_SMOKE_PASS');
  console.log(`META_VERDICT::${verifier.verdict}`);
  console.log(`RAW_OUTPUT_PRESERVED::${rawOutputPreserved}`);
  console.log(`HEAD_UNCHANGED::${headUnchanged}`);
  console.log(`RUN_ARTIFACT::${savedDir}`);
  process.exit(0);
};

// ── REPL loop ─────────────────────────────────────────────────────────────────
const run = async () => {
  if (SELF_TEST) return runSelfTest();

  if (!existsSync(REPO_ROOT)) {
    process.stderr.write(`${r('[FATAL]')} REPO_ROOT not found: ${REPO_ROOT}\n`);
    process.exit(1);
  }
  process.chdir(REPO_ROOT);

  if (CLAIM_VERIFIER_SMOKE) return runClaimVerifierArtifactSmoke();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHeader();
    printHelp();
    process.exit(0);
  }

  printHeader();
  printStatusBlock();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: normalPrompt(),
    terminal: process.stdin.isTTY,
  });
  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  if (process.stdout.isTTY) process.stdout.write(BRACKETED_PASTE_ON);

  // Prompt-first: show NUDIMMUD › , then print footer below, then restore cursor to prompt line
  const PROMPT_VISIBLE_LEN = 'NUDIMMUD › '.length; // 11 visible chars
  const renderPrompt = () => {
    if (state.multilineActive) renderMultilinePrompt(rl);
    else renderNormalPrompt(rl);
    // Footer overlay disabled here: cursor rewrites corrupted model output.
  };

  renderPrompt();

  process.stdin.on('keypress', (str, key = {}) => {
    if (key.sequence === BRACKETED_PASTE_START) {
      beginBracketedPaste();
      return;
    }
    if (key.sequence === BRACKETED_PASTE_END) {
      if (!finishBracketedPaste(rl)) renderNormalPrompt(rl);
      return;
    }
    if (key.name === 'escape') {
      if (state.bracketedPasteActive) {
        clearBracketedPaste();
        renderNormalPrompt(rl);
        return;
      }
      if (state.multilineActive) {
        if (state.burstTimer) clearTimeout(state.burstTimer);
        state.burstTimer = null;
        state.burstBuffer = [];
        cancelMultilineComposer(rl);
      } else if (state.burstTimer) {
        resetBurst();
        renderNormalPrompt(rl);
      }
    }
  });

  const processImmediateCommand = async (input) => {
    resetBurst();
    if (input === '/exit' || input === '/quit') {
      if (state.busy) { state.pendingClose = true; return true; }
      finalizeSession('SESSION TERMINATED');
      rl.close();
      process.exit(0);
    } else if (input === '/help') {
      printHelp();
    } else if (input === '/status') {
      printHeader();
      printStatusBlock();
    } else if (input === '/tokens') {
      printTokens();
    } else if (input === '/clear') {
      process.stdout.write(C.clear);
      printHeader();
      printStatusBlock();
    } else if (input === '/model flash') {
      state.model = MODELS.flash;
      console.log(c(`[MODEL] → ${state.model}`));
    } else if (input === '/last' || input === '/summary') {
      if (state.lastTurnId && state.lastTranscriptDir) {
        console.log(sectionTop('LAST TURN', state.lastTurnId));
        console.log(`${c('│')} ${d('TRANSCRIPT')} ${m(state.lastTranscriptDir + '/')}`);
        console.log(`${c('│')} ${d('OUTPUT    ')} ${m(path.join(state.lastTranscriptDir, 'output.md'))}`);
        console.log(`${c('│')} ${d('REQUEST   ')} ${m(path.join(state.lastTranscriptDir, 'request.md'))}`);
        console.log(`${c('│')} ${d('META      ')} ${m(path.join(state.lastTranscriptDir, 'meta.json'))}`);
        console.log(sectionBot());
        console.log('');
      } else {
        console.log(d('[LAST] no completed turn yet'));
        console.log('');
      }
    } else if (input === '/model pro') {
      state.model = MODELS.pro;
      console.log(c(`[MODEL] → ${state.model}`));
    } else if (input === '/paste') {
      state.pasteMode = true;
      state.multilineActive = true;
      state.multilineSource = 'manual';
      state.pasteBuffer = [];
      console.log(d('[MULTILINE] Manual capture ON'));
      renderMultilinePrompt(rl);
      return true;
    } else if (input === '/send') {
      if (state.multilineActive || state.pasteBuffer.length > 0) {
        await submitMultilineComposer(rl);
      } else {
        console.log(d('[MULTILINE] Buffer empty — nothing to send.'));
      }
    } else if (input === '/cancel') {
      if (state.multilineActive || state.pasteBuffer.length > 0) {
        cancelMultilineComposer(rl);
      } else {
        console.log(d('[MULTILINE] Nothing to cancel.'));
      }
    } else {
      return false;
    }
    return true;
  };

  const handleBurst = (line) => {
    state.burstBuffer.push(line);
    if (state.burstTimer) clearTimeout(state.burstTimer);
    state.burstTimer = setTimeout(async () => {
      const lines = state.burstBuffer.slice();
      resetBurst();
      if (state.multilineActive) return;
      if (lines.length > 1) {
        startMultilineComposer(rl, lines, 'burst');
        return;
      }
      const single = lines[0];
      if (!single) {
        renderNormalPrompt(rl);
        return;
      }
      const handled = await processImmediateCommand(single.trim());
      if (!handled) await callDeepSeek(single);
      renderNormalPrompt(rl);
    }, PASTE_BURST_MS);
  };

  rl.on('line', async (line) => {
    rl.pause();
    if (state.bracketedPasteActive) {
      state.bracketedPasteBuffer.push(line);
      rl.resume();
      return;
    }
    const input = line.trim();

    if (state.multilineActive) {
      if (input === '/cancel') {
        cancelMultilineComposer(rl);
      } else if (input === '/send' || input === '') {
        await submitMultilineComposer(rl);
      } else if (input === '/paste') {
        state.multilineSource = 'manual';
        renderMultilinePrompt(rl);
      } else {
        state.pasteBuffer.push(line);
        renderMultilinePrompt(rl);
      }
      rl.resume();
      return;
    }

    // ── Normal mode ──
    if (!input) {
      renderNormalPrompt(rl);
      rl.resume();
      return;
    }

    const immediate = await processImmediateCommand(input);
    if (!immediate && input.startsWith('/')) {
      console.log(d(`[UNKNOWN COMMAND] ${input} — type /help`));
    } else if (!immediate) {
      handleBurst(line);
      rl.resume();
      return;
    } else {
      // handled
    }

    renderPrompt();
    rl.resume();
  });

  rl.on('close', () => {
    restoreTerminal();
    if (state.busy) { state.pendingClose = true; return; }
    finalizeSession('SESSION CLOSED');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(g('\n[SIGINT] — type /exit to quit cleanly'));
    renderNormalPrompt(rl);
  });
};

run();
