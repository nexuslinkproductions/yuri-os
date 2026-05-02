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

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[38;5;82m',   // Pip-Boy green — NUDIMMUD system
  amber:   '\x1b[38;5;214m',  // amber — user requests
  red:     '\x1b[38;5;196m',  // red — errors / danger
  cyan:    '\x1b[38;5;51m',   // cyan — section markers
  white:   '\x1b[38;5;255m',  // white — model output text
  matrix:  '\x1b[38;5;22m',   // dim matrix green — secondary / process events
  black:   '\x1b[40m',        // black bg
  clear:   '\x1b[2J\x1b[H',
};

const g  = (s) => `${C.green}${s}${C.reset}`;
const a  = (s) => `${C.amber}${s}${C.reset}`;
const r  = (s) => `${C.red}${s}${C.reset}`;
const d  = (s) => `${C.dim}${C.matrix}${s}${C.reset}`;
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
${g('│')} CTX [EST] ${bar(totalTok, 40000)} ${a(String(totalTok).padStart(6))}/${d('40k')}
${g('│')} IN  ${g(String(state.inputTokens).padStart(8))} OUT ${g(String(state.outputTokens).padStart(8))} ELAPSED ${g(elapsed + 's')}
${g('│')} ${r('⚠ ESTIMATES only — not billing data')}
${g('└──────────────────────────────────────────────────────────────┘')}`);
};

const printHelp = () => {
  console.log(`
${g('┌─ NUDIMMUD REPL COMMANDS ─────────────────────────────────────┐')}
${g('│')} ${a('/help')}          Show this help
${g('│')} ${a('/status')}        Print HUD status block
${g('│')} ${a('/tokens')}        Print token counters (ESTIMATE)
${g('│')} ${a('/model pro')}     Switch to deepseek-v4-pro (thinking)
${g('│')} ${a('/model flash')}   Switch to deepseek-v4-flash (fast)
${g('│')} ${a('/clear')}         Clear screen and re-print header
${g('│')} ${a('/paste')}         Start multiline paste mode
${g('│')} ${a('/send')}          Send buffered multiline input (paste mode)
${g('│')} ${a('/cancel')}        Cancel paste mode without sending
${g('│')} ${a('/exit')}          Exit REPL
${g('│')}
${g('│')} ${d('Paste mode: /paste → paste lines → /send to submit')}
${g('│')} ${d('Single-line: type directly and press Enter')}
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

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(`${C.white}${text}${C.reset}`);
  });

  proc.stderr.on('data', (chunk) => {
    process.stdout.write(d(chunk.toString()));
  });

  const finish = (code) => {
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
  process.stdout.write(`${C.white}${fakeOutput}${C.reset}\n`);
  console.log(outputBanner('MODEL OUTPUT END', `${fakeOutput.length} chars`));

  const meta = {
    turnId, selftest: true, model: 'deepseek-v4-pro',
    inputEst: est(fakeReq), outputEst: est(fakeOutput),
    elapsed: 0, code: 0, timestamp: new Date().toISOString(),
  };
  const savedDir = saveTranscript(turnId, fakeReq, fakeOutput, meta);
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  printTurnSummary(turnId, elapsed, 0, est(fakeReq), est(fakeOutput), savedDir);

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

  const normalPrompt = () => `\n${g('NUDIMMUD')}${d('>')} `;
  const pastePrompt  = () => `${a('PASTE')}${d('[')}${g(String(state.pasteBuffer.length))}${d(']>')} `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: normalPrompt(),
    terminal: process.stdin.isTTY,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    const input = line.trim();

    // ── Paste mode ──
    if (state.pasteMode) {
      if (input === '/send') {
        if (state.pasteBuffer.length === 0) {
          console.log(d('[PASTE] Buffer empty — nothing to send.'));
        } else {
          const composed = state.pasteBuffer.join('\n');
          state.pasteMode = false;
          state.pasteBuffer = [];
          console.log(d(`[PASTE] Sending ${composed.length} chars / ${composed.split('\n').length} lines`));
          await callDeepSeek(composed);
        }
        rl.setPrompt(normalPrompt());
      } else if (input === '/cancel') {
        state.pasteMode = false;
        state.pasteBuffer = [];
        console.log(d('[PASTE] Cancelled.'));
        rl.setPrompt(normalPrompt());
      } else {
        state.pasteBuffer.push(line);
        rl.setPrompt(pastePrompt());
      }
      rl.prompt();
      rl.resume();
      return;
    }

    // ── Normal mode ──
    if (!input) {
      rl.prompt();
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
      rl.setPrompt(pastePrompt());
    } else if (input.startsWith('/')) {
      console.log(d(`[UNKNOWN COMMAND] ${input} — type /help`));
    } else {
      await callDeepSeek(input);
    }

    rl.prompt();
    rl.resume();
  });

  rl.on('close', () => {
    if (state.busy) { state.pendingClose = true; return; }
    finalizeSession('SESSION CLOSED');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(g('\n[SIGINT] — type /exit to quit cleanly'));
    rl.prompt();
  });
};

run();
