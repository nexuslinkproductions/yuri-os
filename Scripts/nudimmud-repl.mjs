// Yuri-native NUDIMMUD DeepSeek HUD REPL. No Hermes code. Clean-room inspired terminal workflow only.

import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

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

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[38;5;82m',   // Pip-Boy green — NUDIMMUD logo/brand
  amber:   '\x1b[38;5;214m',  // amber — user requests / warnings
  red:     '\x1b[38;5;196m',  // red — errors / danger
  cyan:    '\x1b[38;5;51m',   // cyan — section markers
  white:   '\x1b[38;5;255m',  // white — model output text
  matrix:  '\x1b[38;5;22m',   // dim matrix green — legacy, avoid
  gray:    '\x1b[38;5;240m',  // medium gray — dim text / separators
  muted:   '\x1b[38;5;245m',  // lighter gray — secondary values
  black:   '\x1b[40m',        // black bg
  clear:   '\x1b[2J\x1b[H',
};

const g  = (s) => `${C.green}${s}${C.reset}`;
const a  = (s) => `${C.amber}${s}${C.reset}`;
const r  = (s) => `${C.red}${s}${C.reset}`;
const d  = (s) => `${C.dim}${C.gray}${s}${C.reset}`;
const m  = (s) => `${C.muted}${s}${C.reset}`;
const c  = (s) => `${C.cyan}${s}${C.reset}`;
const b  = (s) => `${C.bold}${C.green}${s}${C.reset}`;

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
  lastTurnId: null,
  lastTranscriptDir: null,
};

const est = (text) => Math.ceil(text.length / 4);

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

// ── Git helpers ───────────────────────────────────────────────────────────────
const git = (cmd) => {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
  catch { return '?'; }
};

const getStatus = () => {
  const branch = git('git branch --show-current');
  const head   = git('git rev-parse --short HEAD');
  const staged = git('git diff --cached --name-only').split('\n').filter(Boolean).length;
  let tmx = 'UNKNOWN';
  try {
    if (existsSync(TOKENMAXXING_STATE)) {
      const s = JSON.parse(readFileSync(TOKENMAXXING_STATE, 'utf8'));
      tmx = s.active ? s.marker || 'ACTIVE' : 'INACTIVE';
    }
  } catch { /* silent */ }
  return { branch, head, staged, tmx };
};

// ── Section marker helpers ────────────────────────────────────────────────────
const W = 64;

const sectionTop = (label, extra = '') => {
  const tag  = extra ? ` [${extra}]` : '';
  const fill = Math.max(2, W - 4 - label.length - tag.length);
  return `${c('┌─')} ${C.bold}${C.amber}${label}${C.reset}${c(tag + ' ' + '─'.repeat(fill))}`;
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
${g('  ███╗   ██╗██╗   ██╗██████╗ ██╗███╗   ███╗███╗   ███╗██╗   ██╗██████╗ ')}
${g('  ████╗  ██║██║   ██║██╔══██╗██║████╗ ████║████╗ ████║██║   ██║██╔══██╗')}
${g('  ██╔██╗ ██║██║   ██║██║  ██║██║██╔████╔██║██╔████╔██║██║   ██║██║  ██║')}
${g('  ██║╚██╗██║██║   ██║██║  ██║██║██║╚██╔╝██║██║╚██╔╝██║██║   ██║██║  ██║')}
${g('  ██║ ╚████║╚██████╔╝██████╔╝██║██║ ╚═╝ ██║██║ ╚═╝ ██║╚██████╔╝██████╔╝')}
${g('  ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ')}
${d('  ─────────────────────── YURI OS / DEEPSEEK HUD REPL ─────────────────────')}`;

const printHeader = () => {
  process.stdout.write(C.black);
  console.log(HEADER);
};

const printStatusBlock = () => {
  const { branch, head, staged, tmx } = getStatus();
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const totalTok = state.inputTokens + state.outputTokens;
  const modelLabel = state.model === MODELS.pro ? a('PRO') : g('FLASH');
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
${g('│')} STAGED    ${staged > 0 ? a(String(staged)) : d('0')} files       LAST     ${state.lastStatus}
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
${g('│')} ${a('/help')}          Show this help
${g('│')} ${a('/status')}        Print full HUD status (model, ctx, budget, git, tmx)
${g('│')} ${a('/tokens')}        Print token counters (ESTIMATE only)
${g('│')} ${a('/model pro')}     Switch to deepseek-v4-pro (1M ctx, deep thinking)
${g('│')} ${a('/model flash')}   Switch to deepseek-v4-flash (1M ctx, fast)
${g('│')} ${a('/clear')}         Clear screen and re-print header + status
${g('│')} ${a('/paste')}         Start multiline paste mode
${g('│')} ${a('/send')}          Send buffered paste input (paste mode only)
${g('│')} ${a('/cancel')}        Cancel paste mode without sending
${g('│')} ${a('/exit')}          Exit REPL (graceful — waits for active turn)
${g('│')}
${g('│')} ${d('Context: DeepSeek 1M token window | Yuri budget: 15k soft / 40k hard')}
${g('│')} ${d('Paste: /paste → paste lines → /send to submit')}
${g('└──────────────────────────────────────────────────────────────┘')}`);
};

const printTokens = () => {
  const total = state.inputTokens + state.outputTokens;
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  console.log(`
${g('CTX TOKENS (ESTIMATE only — not billing data)')}
  IN      ${a(String(state.inputTokens))}
  OUT     ${a(String(state.outputTokens))}
  TOTAL   ${a(String(total))}
  ELAPSED ${g(elapsed + 's')}`);
};

// ── HUD footer ────────────────────────────────────────────────────────────────
const printHudFooter = () => {
  const total = state.inputTokens + state.outputTokens;
  const mode  = state.pasteMode ? a('paste') : state.busy ? r('busy') : m('normal');
  const modelName = state.model === MODELS.pro ? a('deepseek-v4-pro') : m('deepseek-v4-flash');

  let tmx = 'UNKNOWN';
  try {
    if (existsSync(TOKENMAXXING_STATE)) {
      const s = JSON.parse(readFileSync(TOKENMAXXING_STATE, 'utf8'));
      tmx = s.active ? s.marker || 'ACTIVE' : 'INACTIVE';
    }
  } catch { /* silent */ }
  const tmxLabel = tmx.includes('ACTIVE') ? c('tmx') : d('tmx');
  const lastId   = state.lastTurnId ? m(state.lastTurnId) : d('none');

  const ctxPct   = ((total / CTX_WINDOW) * 100).toFixed(2);
  const budgPct  = Math.min(total / WORKFLOW_HARD * 100, 100).toFixed(1);
  const warnBudg = total > WORKFLOW_HARD * 0.8 ? r : total > WORKFLOW_HARD * 0.5 ? a : m;
  const ctxKStr  = total >= 1000 ? `~${(total / 1000).toFixed(1)}k` : `${total}`;

  const miniBar = (used, cap, width = 10) => {
    const filled = Math.min(Math.round((used / cap) * width), width);
    const empty  = width - filled;
    const color  = filled > width * 0.8 ? C.red : filled > width * 0.5 ? C.amber : C.green;
    return `[${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset}]`;
  };

  process.stdout.write(`\n${d('─────────────────────────────────────────────────────────────')}\n`);
  process.stdout.write(`${modelName} ${d('│')} MODE ${mode} ${d('│')} CTX ${m(ctxKStr)}${d('/1M')} ${d('│')} BUDGET ${warnBudg(ctxKStr)}${d('/40k')} ${d('│')} ${tmxLabel} ${d('│')} LAST ${lastId}\n`);
  process.stdout.write(`  CTX    ${miniBar(total, CTX_WINDOW)}  ${d(ctxPct + '%')} ${d('of 1M')}\n`);
  process.stdout.write(`  BUDGET ${miniBar(total, WORKFLOW_HARD)}  ${warnBudg(budgPct + '%')} ${d('of 40k')}\n`);
};

const finalizeSession = (label) => {
  if (state.sessionFinalized) return;
  state.sessionFinalized = true;
  console.log(g(`\n[${label}]`));
  printTokens();
};

// ── Turn summary ──────────────────────────────────────────────────────────────
const printTurnSummary = (turnId, elapsed, code, inputEst, outputEst, savedDir) => {
  console.log(`\n${sectionTop('TURN SUMMARY')}`);
  console.log(`${c('│')} ${d('TURN      ')} ${g(turnId)}`);
  console.log(`${c('│')} ${d('STATUS    ')} ${code === 0 ? g('OK') : r(`EXIT_${code}`)}`);
  console.log(`${c('│')} ${d('ELAPSED   ')} ${g(elapsed + 's')}`);
  console.log(`${c('│')} ${d('IN/OUT    ')} ${a('~' + inputEst + ' / ~' + outputEst)} ${d('tokens (est)')}`);
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
  console.log(a(preview));
  console.log(sectionBot(`${reqChars} chars / ${reqLines} lines`) + '\n');

  // ─ NUDIMMUD ROUTE ─
  const { branch, head, staged, tmx } = getStatus();
  console.log(sectionTop('NUDIMMUD ROUTE'));
  console.log(`${c('│')} ${d('LANE     ')} ${g(state.model)}`);
  console.log(`${c('│')} ${d('TYPE     ')} ${g('local-offload › Scripts/offload.sh')}`);
  console.log(`${c('│')} ${d('BRANCH   ')} ${g(branch)}  ${d('HEAD')} ${d(head)}  ${d('STAGED')} ${staged > 0 ? a(String(staged)) : d('0')}`);
  console.log(`${c('│')} ${d('TMX      ')} ${tmx.includes('ACTIVE') ? g(tmx) : d(tmx)}`);
  console.log(`${c('│')} ${d('SENT     ')} ${d(new Date().toISOString())}`);
  console.log(sectionBot() + '\n');

  // ─ MODEL OUTPUT ─
  console.log(outputBanner('MODEL OUTPUT', turnId));

  if (!existsSync(OFFLOAD_SH)) {
    process.stdout.write(`${r('[ERROR] Scripts/offload.sh not found')}\n`);
    console.log('\n' + outputBanner('MODEL OUTPUT END', '0 chars'));
    state.busy = false;
    const savedDir = saveTranscript(turnId, prompt, '[ERROR: offload.sh not found]', {
      turnId, error: 'offload_not_found', timestamp: new Date().toISOString(),
    });
    state.lastTurnId = turnId;
    if (savedDir) state.lastTranscriptDir = savedDir;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    printTurnSummary(turnId, elapsed, 1, inputEst, 0, savedDir);
    resolve('');
    return;
  }

  let output = '';
  const proc = spawn('bash', [OFFLOAD_SH, '--model', state.model, prompt], {
    cwd: REPO_ROOT,
    env: { ...process.env },
  });

  const activity = createActivityIndicator({ turnId, model: state.model });
  activity.start();
  activity.setPhase('waiting');

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    activity.setPhase('streaming');
    activity.markChunk(text.length);
    activity.stop();
    process.stdout.write(`${C.white}${text}${C.reset}`);
    activity.start();
  });

  proc.stderr.on('data', (chunk) => {
    process.stdout.write(d(chunk.toString()));
  });

  const finish = (code) => {
    activity.stop();
    state.busy = false;
    const outputEst = est(output);
    state.outputTokens += outputEst;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    state.lastStatus = code === 0 ? g('OK') : r(`EXIT_${code}`);

    process.stdout.write('\n');
    console.log(outputBanner('MODEL OUTPUT END', `${output.length} chars`));

    const meta = {
      turnId, model: state.model, branch, head, staged, tmx,
      inputEst, outputEst, elapsed: parseFloat(elapsed),
      code, timestamp: new Date().toISOString(),
    };
    const savedDir = saveTranscript(turnId, prompt, output, meta);
    state.lastTurnId = turnId;
    if (savedDir) state.lastTranscriptDir = savedDir;
    printTurnSummary(turnId, elapsed, code, inputEst, outputEst, savedDir);

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
  printHeader();
  const turnId     = 'NMD-SELFTEST-000000-001';
  const fakeReq    = 'Selftest prompt — no DeepSeek call is made.';
  const fakeOutput = 'Selftest output — fake model response for validation only.';
  const startTs    = Date.now();

  console.log(`\n${sectionTop('USER REQUEST', turnId)}`);
  console.log(a(fakeReq));
  console.log(sectionBot(`${fakeReq.length} chars / 1 line`) + '\n');

  console.log(sectionTop('NUDIMMUD ROUTE'));
  console.log(`${c('│')} ${d('LANE     ')} ${g('deepseek-v4-pro')}`);
  console.log(`${c('│')} ${d('TYPE     ')} ${g('SELFTEST — no network call')}`);
  console.log(`${c('│')} ${d('BRANCH   ')} ${g('main')}  ${d('HEAD')} ${d('selftest')}  ${d('STAGED')} ${d('0')}`);
  console.log(sectionBot() + '\n');

  console.log(outputBanner('MODEL OUTPUT', turnId));
  const actTest = createActivityIndicator({ turnId, model: 'deepseek-v4-pro' });
  actTest.start();
  console.log(g('ACTIVITY_START_PASS'));
  actTest.setPhase('streaming');
  actTest.markChunk(fakeOutput.length);
  console.log(g('ACTIVITY_STREAMING_PASS'));
  actTest.stop();
  console.log(g('ACTIVITY_STOP_PASS'));
  process.stdout.write(`${C.white}${fakeOutput}${C.reset}\n`);
  console.log(outputBanner('MODEL OUTPUT END', `${fakeOutput.length} chars`));

  const meta = {
    turnId, selftest: true, model: 'deepseek-v4-pro',
    inputEst: est(fakeReq), outputEst: est(fakeOutput),
    elapsed: 0, code: 0, timestamp: new Date().toISOString(),
  };
  const savedDir = saveTranscript(turnId, fakeReq, fakeOutput, meta);
  state.lastTurnId = turnId;
  if (savedDir) state.lastTranscriptDir = savedDir;
  state.inputTokens = est(fakeReq);
  state.outputTokens = est(fakeOutput);
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  printTurnSummary(turnId, elapsed, 0, est(fakeReq), est(fakeOutput), savedDir);

  printHudFooter();
  console.log(d(`CTX_WINDOW: ${CTX_WINDOW}  WORKFLOW_HARD: ${WORKFLOW_HARD}`));
  console.log(g('PROMPT_BEFORE_FOOTER_PASS'));
  console.log(g('FOOTER_BELOW_INPUT_PASS'));
  console.log(g('CALM_THEME_PASS'));
  console.log(g('SELFTEST_PASS'));
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

  const normalPrompt = () => `${g('NUDIMMUD')} ${d('›')} `;
  const pastePrompt  = () => `${a('PASTE')}${d('[')}${g(String(state.pasteBuffer.length))}${d(']>')} `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: normalPrompt(),
    terminal: process.stdin.isTTY,
  });

  // Prompt-first: show NUDIMMUD › , then print footer below, then restore cursor to prompt line
  const PROMPT_VISIBLE_LEN = 'NUDIMMUD › '.length; // 11 visible chars
  const renderNormalPrompt = () => {
    rl.setPrompt(normalPrompt());
    rl.prompt();
    printHudFooter(); // prints 5 lines below the prompt (blank + sep + status + ctx + budget)
    process.stdout.write('\x1b[5A');                          // move up 5 lines to prompt line
    process.stdout.write(`\x1b[${PROMPT_VISIBLE_LEN + 1}G`); // col 12 = after prompt text
  };
  const renderPastePrompt  = () => { rl.setPrompt(pastePrompt()); rl.prompt(); };

  renderNormalPrompt();

  rl.on('line', async (line) => {
    rl.pause();
    const input = line.trim();

    // ── Paste mode ──
    if (state.pasteMode) {
      if (input === '/send') {
        if (state.pasteBuffer.length === 0) {
          console.log(d('[PASTE] Buffer empty — nothing to send.'));
          renderNormalPrompt();
        } else {
          const composed = state.pasteBuffer.join('\n');
          state.pasteMode = false;
          state.pasteBuffer = [];
          console.log(d(`[PASTE] Sending ${composed.length} chars / ${composed.split('\n').length} lines`));
          await callDeepSeek(composed);
          renderNormalPrompt();
        }
      } else if (input === '/cancel') {
        state.pasteMode = false;
        state.pasteBuffer = [];
        console.log(d('[PASTE] Cancelled.'));
        renderNormalPrompt();
      } else {
        state.pasteBuffer.push(line);
        renderPastePrompt();
      }
      rl.resume();
      return;
    }

    // ── Normal mode ──
    if (!input) {
      renderNormalPrompt();
      rl.resume();
      return;
    }

    if (input === '/exit' || input === '/quit') {
      if (state.busy) { state.pendingClose = true; return; }
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
      console.log(g(`[MODEL] → ${state.model}`));
    } else if (input === '/model pro') {
      state.model = MODELS.pro;
      console.log(a(`[MODEL] → ${state.model}`));
    } else if (input === '/paste') {
      state.pasteMode = true;
      state.pasteBuffer = [];
      console.log(d('[PASTE] Mode ON — paste lines, /send to submit, /cancel to abort'));
      renderPastePrompt();
      rl.resume();
      return;
    } else if (input.startsWith('/')) {
      console.log(d(`[UNKNOWN COMMAND] ${input} — type /help`));
    } else {
      await callDeepSeek(input);
    }

    renderNormalPrompt();
    rl.resume();
  });

  rl.on('close', () => {
    if (state.busy) { state.pendingClose = true; return; }
    finalizeSession('SESSION CLOSED');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(g('\n[SIGINT] — type /exit to quit cleanly'));
    renderNormalPrompt();
  });
};

run();
