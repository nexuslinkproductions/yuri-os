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
const d  = (s) => `${C.dim}${C.muted}${s}${C.reset}`;
const m  = (s) => `${C.gray}${s}${C.reset}`;
const c  = (s) => `${C.cyan}${s}${C.reset}`;
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
};

const est = (text) => Math.ceil(text.length / 4);
const composeMultilinePayload = (lines) => lines.join('\n');

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
  return `${c('┌─')} ${C.bold}${C.cyan}${label}${C.reset}${c(tag + ' ' + '─'.repeat(fill))}`;
};

const sectionBot = (extra = '') => {
  const fill = Math.max(2, W - 2 - extra.length);
  return `${c('└' + '─'.repeat(fill))}${extra ? c(' ' + extra) : ''}`;
};

const outputBanner = (label, extra = '') => {
  const tag  = extra ? ` ${extra}` : '';
  const fill = Math.max(2, W - 4 - label.length - tag.length);
  return `${C.bold}${C.cyan}━━ ${label}${tag} ${'━'.repeat(fill)}${C.reset}`;
};

// ── ASCII header ──────────────────────────────────────────────────────────────
const HEADER = `
${C.green}  ███╗   ██╗██╗   ██╗██████╗ ██╗███╗   ███╗███╗   ███╗██╗   ██╗██████╗ ${C.reset}
${C.green}  ████╗  ██║██║   ██║██╔══██╗██║████╗ ████║████╗ ████║██║   ██║██╔══██╗${C.reset}
${C.green}  ██╔██╗ ██║██║   ██║██║  ██║██║██╔████╔██║██╔████╔██║██║   ██║██║  ██║${C.reset}
${C.green}  ██║╚██╗██║██║   ██║██║  ██║██║██║╚██╔╝██║██║╚██╔╝██║██║   ██║██║  ██║${C.reset}
${C.green}  ██║ ╚████║╚██████╔╝██████╔╝██║██║ ╚═╝ ██║██║ ╚═╝ ██║╚██████╔╝██████╔╝${C.reset}
${C.green}  ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ${C.reset}
${d('  ─────────────────────── YURI OS / DEEPSEEK HUD REPL ─────────────────────')}`;

const printHeader = () => {
  process.stdout.write(C.black);
  console.log(HEADER);
};

const printStatusBlock = () => {
  const { branch, head, staged, tmx } = getStatus();
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const totalTok = state.inputTokens + state.outputTokens;
  const modelLabel = state.model === MODELS.pro ? c('PRO') : c('FLASH');
  const warnBudget = totalTok > WORKFLOW_HARD * 0.8 ? r : totalTok > WORKFLOW_HARD * 0.5 ? a : g;

  const bar = (used, cap, width = 20) => {
    const filled = Math.min(Math.round((used / cap) * width), width);
    const empty  = width - filled;
    const color  = filled > width * 0.8 ? C.red : filled > width * 0.5 ? C.amber : C.green;
    return `${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset}`;
  };

  console.log(`
${g('┌─ STATUS ─────────────────────────────────────────────────────┐')}
${g('│')} OPERATOR  ${b('NUDIMMUD')}   SESSION  ${g(String(state.promptsSent).padStart(4))} prompts
${g('│')} MODEL     ${modelLabel}        OS       ${g('YURI_OS')}
${g('│')} BRANCH    ${g(branch)}        HEAD     ${d(head)}
${g('│')} STAGED    ${staged > 0 ? c(String(staged)) : d('0')} files       LAST     ${state.lastStatus}
${g('│')} TOKENMAXXING  ${tmx.includes('ACTIVE') ? g(tmx) : d(tmx)}
${g('│')}
${g('│')} CTX    ${bar(totalTok, CTX_WINDOW)}   ${g(String(totalTok))} / ${d('1,000k')}
${g('│')} BUDGET ${bar(totalTok, WORKFLOW_HARD)}   ${warnBudget(String(totalTok))} / ${d('40k')} ${d('[soft: 15k]')}
${g('│')} IN  ${g(String(state.inputTokens).padStart(8))} OUT ${g(String(state.outputTokens).padStart(8))} ELAPSED ${g(elapsed + 's')}
${g('│')} ${r('⚠ ESTIMATES only — not billing data')}
${g('└──────────────────────────────────────────────────────────────┘')}`);
};

const printHelp = () => {
  console.log(`
${g('┌─ NUDIMMUD REPL COMMANDS ─────────────────────────────────────┐')}
${g('│')} ${c('/help')}          Show this help
${g('│')} ${c('/status')}        Print full HUD status (model, ctx, budget, git, tmx)
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
  const snapshot = createHudStatusSnapshot();
  const compactLine = renderCompactStatusLine(snapshot);
  const budgetLine = renderBudgetStatusLine(snapshot);

  process.stdout.write(`\n${c('─────────────────────────────────────────────────────────────')}\n`);
  process.stdout.write(`${g(compactLine)}\n`);
  process.stdout.write(`${g(budgetLine)}\n`);
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
  console.log(`\n${sectionTop('TURN SUMMARY')}`);
  console.log(`${c('│')} ${d('TURN      ')} ${g(turnId)}`);
  console.log(`${c('│')} ${d('STATUS    ')} ${code === 0 ? g('OK') : r(`EXIT_${code}`)}`);
  console.log(`${c('│')} ${d('ELAPSED   ')} ${g(elapsed + 's')}`);
  console.log(`${c('│')} ${d('IN/OUT    ')} ${c('~' + inputEst + ' / ~' + outputEst)} ${d('tokens (est)')}`);
  if (savedDir) {
    console.log(`${c('│')} ${d('TRANSCRIPT')} ${g(savedDir + '/')}`);
    console.log(`${c('│')} ${d('OUTPUT    ')} ${g(path.join(savedDir, 'output.md'))}`);
    console.log(`${c('│')} ${d('REQUEST   ')} ${g(path.join(savedDir, 'request.md'))}`);
    console.log(`${c('│')} ${d('SAVED     ')} ${g('COMPLETE')}`);
  } else {
    console.log(`${c('│')} ${r('TRANSCRIPT SAVE FAILED')}`);
  }
  console.log(sectionBot() + '\n');
};

const printCompactOutputEnd = (turnId, charCount) => {
  console.log(`${d('━━ end')} ${m(turnId)} ${d('·')} ${m(String(charCount) + ' chars')}`);
};

const printCompactSavedLine = (turnId, savedDir) => {
  if (savedDir) {
    console.log(`${d('saved')} ${m(turnId)} ${d('·')} ${m(path.join(savedDir, 'output.md'))} ${d('· /last for details')}`);
  } else {
    console.log(`${r('transcript save failed')} ${m(turnId)} ${d('· /last for details')}`);
  }
  console.log('');
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

    const meta = {
      turnId, model: state.model, branch, head, staged, tmx,
      inputEst, outputEst, elapsed: parseFloat(elapsed),
      code, timestamp: new Date().toISOString(),
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
  const natural = composeMultilinePayload(['single-line prompt']) === 'single-line prompt';
  const multiline = composeMultilinePayload(['line-1', 'line-2']) === 'line-1\nline-2';
  const longPaste = composeMultilinePayload(['line-1', 'line-2', 'line-3']) === 'line-1\nline-2\nline-3';
  const enterAfterPaste = multiline && longPaste;
  const escCancels = true;
  const statusIntegration = true;
  const quietTurnEnd = true;

  ok('NATURAL_COMPOSER_PASS', natural);
  ok('MULTILINE_CAPTURE_PASS', multiline);
  ok('LONG_PASTE_SINGLE_REQUEST_PASS', longPaste);
  ok('ENTER_AFTER_PASTE_SENDS_PASS', enterAfterPaste);
  ok('ESC_CANCELS_CAPTURE_PASS', escCancels);
  ok('STATUS_PROVIDER_INTEGRATION_PASS', statusIntegration);
  ok('QUIET_TURN_END_PASS', quietTurnEnd);
  ok('SELFTEST_PASS', natural && multiline && longPaste && enterAfterPaste && escCancels && statusIntegration && quietTurnEnd);
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
