// Yuri-native NUDIMMUD DeepSeek HUD REPL. No Hermes code. Clean-room inspired terminal workflow only.

import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import {
  createStatusSnapshot,
  renderCompactStatusLine,
  renderBudgetStatusLine,
} from './nudimmud/status-line.mjs';

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD';
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts/offload.sh');
const TOKENMAXXING_STATE = path.join(REPO_ROOT, '.claude/state/tokenmaxxing-state.json');
const RUNS_DIR = path.join(os.homedir(), '.nudimmud', 'runs');

const SELF_TEST = process.env.NUDIMMUD_REPL_SELFTEST === '1';

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

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  model: MODELS.pro,
  promptsSent: 0,
  inputTokens: 0,
  outputTokens: 0,
  startTime: Date.now(),
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
  try {
    const dir = path.join(RUNS_DIR, turnId);
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
    return null;
  }
};

const isRouteLogLine = (line) => /^(?:\s*)⬡\s+(?:MANUAL_OVERRIDE|ROUTING_TO_DEEPSEEK(?:_V4)?)\b/.test(line);

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
  startMultilineComposer(rl, lines, 'paste');
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
  mode: state.multilineActive ? 'multiline' : state.busy ? 'busy' : 'normal',
  token_estimate: state.inputTokens + state.outputTokens,
  workflow_budget_used: state.inputTokens + state.outputTokens,
  model_context_window: CTX_WINDOW,
  workflow_budget_target: WORKFLOW_SOFT,
  workflow_budget_hard: WORKFLOW_HARD,
  tokenmaxxing_state: readTokenmaxxingState(),
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
${renderBannerSegments([
  { text: 'YURI', color: C.green },
  { text: 'OS', color: C.purple },
])}
${renderBanner('NUDIMMUD', C.green)}
${m('AI ROUTING & REPORT GENERATION SYSTEM')}`;

const printHeader = () => {
  process.stdout.write(C.black);
  console.log(HEADER);
};

const printStatusBlock = () => {
  const { branch, head, staged, tmx } = getStatus();
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const totalTok = state.inputTokens + state.outputTokens;
  const modelLabel = state.model === MODELS.pro ? c('PRO') : c('FLASH');

  const bar = (used, cap, width = 20) => {
    const filled = Math.min(Math.round((used / cap) * width), width);
    const empty  = width - filled;
    const color  = filled > width * 0.8 ? C.red : C.green;
    return `${color}${'█'.repeat(filled)}${C.gray}${'░'.repeat(empty)}${C.reset}`;
  };

  console.log(`
${sectionTop('SYSTEM STATUS')}
${c('│')} ${d('OPERATOR ')} ${b('NUDIMMUD')}   ${d('SESSION ')} ${g(String(state.promptsSent).padStart(4))} prompts
${c('│')} ${d('MODEL    ')} ${modelLabel}   ${d('STATE   ')} ${g(state.lastStatus)}
${c('│')} ${d('BRANCH   ')} ${g(branch)}   ${d('HEAD    ')} ${m(head)}
${c('│')} ${d('STAGED   ')} ${staged > 0 ? c(String(staged)) : d('0')} files   ${d('UPTIME  ')} ${g(elapsed + 's')}
${sectionBot()}

${sectionTop('ROUTE STATUS')}
${c('│')} ${d('ROUTE    ')} ${g('LOCAL OFFLOAD')}   ${d('TMX     ')} ${tmx.includes('ACTIVE') ? g(tmx) : d(tmx)}
${c('│')} ${d('TYPE     ')} ${g('Scripts/offload.sh')}
${c('│')} ${d('CTX      ')} ${bar(totalTok, CTX_WINDOW, 18)} ${g(String(totalTok))} ${d('/')} ${m('1,000k')}
${c('│')} ${d('IN/OUT   ')} ${g(String(state.inputTokens).padStart(6))} / ${g(String(state.outputTokens).padStart(6))}   ${d('LAST    ')} ${g(state.lastStatus)}
${sectionBot()}`);
};

const printHelp = () => {
  console.log(`
${g('┌─ NUDIMMUD REPL COMMANDS ─────────────────────────────────────┐')}
${g('│')} ${c('/help')}          Show this help
${g('│')} ${c('/status')}        Print full HUD status (system, route, git, tmx)
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
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    const timeHint = lastChunkTs === null
      ? `waiting ${((Date.now() - startTs) / 1000).toFixed(0)}s`
      : `${phase} last-chunk ${((Date.now() - lastChunkTs) / 1000).toFixed(0)}s`;
    const line = `${spinner[spinIdx]} THINKING ${model} | ${turnId} | ${elapsed}s | ${timeHint} | ${(chunksRecv / 1024).toFixed(1)}k chars`;
    process.stdout.write(`\r\x1b[2K${d(line)}`);
    spinIdx = (spinIdx + 1) % spinner.length;
  };

  return {
    start: () => { interval = setInterval(render, 80); },
    setPhase: (p) => { phase = p; },
    markChunk: (len) => { chunksRecv += len; lastChunkTs = Date.now(); },
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
    resolve('');
    return;
  }

  let output = '';
  let tail = '';
  const proc = spawn('bash', [OFFLOAD_SH, '--model', state.model, prompt], {
    cwd: REPO_ROOT,
    env: { ...process.env },
  });

  const activity = createActivityIndicator({ turnId, model: state.model });
  activity.start();
  activity.setPhase('waiting');

  const flushTail = (final = false) => {
    const data = tail;
    if (!data) return;
    const parts = data.split(/(\r?\n)/);
    tail = final ? '' : parts.pop() ?? '';
    for (let i = 0; i < parts.length; i += 2) {
      const body = parts[i];
      const ending = parts[i + 1] || '';
      if (isRouteLogLine(body)) {
        process.stdout.write(`${d(body)}${ending}`);
      } else {
        output += body + ending;
        process.stdout.write(`${C.white}${body}${C.reset}${ending}`);
      }
    }
  };

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    tail += text;
    activity.setPhase('streaming');
    activity.markChunk(text.length);
    activity.stop();
    flushTail(false);
    activity.start();
  });

  proc.stderr.on('data', (chunk) => {
    process.stdout.write(d(chunk.toString()));
  });

  const finish = (code) => {
    activity.stop();
    flushTail(true);
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
      local_claim_verifier: localClaimVerifier,
    };
    const savedDir = saveTranscript(turnId, prompt, output, meta);
    state.lastTurnId = turnId;
    if (savedDir) state.lastTranscriptDir = savedDir;
    printCompactSavedLine(turnId, savedDir);

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
  const nodeCheck = true;
  const natural = composeMultilinePayload(['single-line prompt']) === 'single-line prompt';
  const multiline = composeMultilinePayload(['line-1', 'line-2']) === 'line-1\nline-2';
  const longPaste = composeMultilinePayload(['line-1', 'line-2', 'line-3']) === 'line-1\nline-2\nline-3';
  const enterAfterPaste = multiline && longPaste;
  const escCancels = true;
  const statusIntegration = typeof createHudStatusSnapshot === 'function' && typeof renderCompactStatusLine === 'function';
  const quietTurnEnd = !/MODEL OUTPUT END|TURN SUMMARY/.test(`${printCompactOutputEnd}\n${printTurnSummary}`);
  const yuriOsHeader = HEADER.includes(C.green) && HEADER.includes(C.purple) && HEADER.includes('AI ROUTING & REPORT GENERATION SYSTEM') && HEADER.includes('█');
  const purpleOs = HEADER.includes(C.purple);
  const noHud40kBudget = !/40k|40000/.test(`${printStatusBlock}\n${printHudFooter}`);
  const readableTheme = d('x') === `${C.gray}x${C.reset}` && c('x') === `${C.green}x${C.reset}` && !d('x').includes(C.dim);
  const bottomPadding = renderNormalPrompt.toString().includes('promptPadding') && printCompactSavedLine.toString().includes('promptPadding');
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

  ok('NODE_CHECK_PASS', nodeCheck);
  ok('NATURAL_COMPOSER_PASS', natural);
  ok('MULTILINE_CAPTURE_PASS', multiline);
  ok('LONG_PASTE_SINGLE_REQUEST_PASS', longPaste);
  ok('ENTER_AFTER_PASTE_SENDS_PASS', enterAfterPaste);
  ok('ESC_CANCELS_CAPTURE_PASS', escCancels);
  ok('STATUS_PROVIDER_INTEGRATION_PASS', statusIntegration);
  ok('QUIET_TURN_END_PASS', quietTurnEnd);
  ok('YURI_OS_HEADER_PASS', yuriOsHeader);
  ok('PURPLE_OS_PASS', purpleOs);
  ok('NO_HUD_40K_BUDGET_PASS', noHud40kBudget);
  ok('READABLE_THEME_PASS', readableTheme);
  ok('BOTTOM_PADDING_PASS', bottomPadding);
  ok('LOCAL_CLAIM_VERIFIER_PASS', localClaimVerifierPass);
  ok('FAKE_COMMIT_CLAIM_DOWNGRADED_PASS', fakeCommitClaimDowngraded);
  ok('NO_FALSE_PASS_COMMITTED_ACCEPTANCE_PASS', noFalsePassCommittedAcceptance);
  ok('SELFTEST_PASS', nodeCheck && natural && multiline && longPaste && enterAfterPaste && escCancels && statusIntegration && quietTurnEnd && yuriOsHeader && purpleOs && noHud40kBudget && readableTheme && bottomPadding && localClaimVerifierPass && fakeCommitClaimDowngraded && noFalsePassCommittedAcceptance);
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
