// Yuri-native NUDIMMUD DeepSeek HUD REPL. No Hermes code. Clean-room inspired terminal workflow only.

import readline from 'readline';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD';
const OFFLOAD_SH = path.join(REPO_ROOT, 'Scripts/offload.sh');
const TOKENMAXXING_STATE = path.join(REPO_ROOT, '.claude/state/tokenmaxxing-state.json');

const MODELS = {
  flash: 'deepseek-v4-flash',
  pro: 'deepseek-v4-pro',
};

// ── ANSI palette ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[38;5;82m',   // Pip-Boy green
  amber:   '\x1b[38;5;214m',  // amber warning
  red:     '\x1b[38;5;196m',  // red danger
  matrix:  '\x1b[38;5;22m',   // dim matrix green secondary
  black:   '\x1b[40m',        // black bg
  clear:   '\x1b[2J\x1b[H',
};

const g  = (s) => `${C.green}${s}${C.reset}`;
const a  = (s) => `${C.amber}${s}${C.reset}`;
const r  = (s) => `${C.red}${s}${C.reset}`;
const d  = (s) => `${C.dim}${C.matrix}${s}${C.reset}`;
const b  = (s) => `${C.bold}${C.green}${s}${C.reset}`;

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  model: MODELS.pro,
  promptsSent: 0,
  inputTokens: 0,
  outputTokens: 0,
  startTime: Date.now(),
  lastStatus: 'READY',
  busy: false,      // true while a DeepSeek call is in flight
  pendingClose: false, // deferred close requested while busy
};

const est = (text) => Math.ceil(text.length / 4);

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
${g('│')} ${a('/help')}       Show this help
${g('│')} ${a('/status')}     Print HUD status block
${g('│')} ${a('/tokens')}     Print token counters (ESTIMATE)
${g('│')} ${a('/model pro')}  Switch to deepseek-v4-pro (thinking)
${g('│')} ${a('/model flash')}Switch to deepseek-v4-flash (fast)
${g('│')} ${a('/clear')}      Clear screen and re-print header
${g('│')} ${a('/exit')}       Exit REPL
${g('│')}
${g('│')} ${d('Any other input is sent to DeepSeek.')}
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

// ── DeepSeek call ─────────────────────────────────────────────────────────────
const callDeepSeek = (prompt) => new Promise((resolve) => {
  if (!existsSync(OFFLOAD_SH)) {
    console.log(r(`[ERROR] Scripts/offload.sh not found`));
    return resolve('');
  }

  const inputEst = est(prompt);
  state.inputTokens += inputEst;
  state.promptsSent += 1;
  state.busy = true;

  process.stdout.write(`${g('⬡')} ${d('DISPATCHING → ')}${a(state.model)} ${d('...')}\n`);

  let output = '';
  const proc = spawn('bash', [OFFLOAD_SH, '--model', state.model, prompt], {
    cwd: REPO_ROOT,
    env: { ...process.env },
  });

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(g(text));
  });

  proc.stderr.on('data', (chunk) => {
    process.stdout.write(d(chunk.toString()));
  });

  const finish = (output, code) => {
    state.busy = false;
    const outputEst = est(output);
    state.outputTokens += outputEst;
    state.lastStatus = code === 0 ? g('OK') : r(`EXIT_${code}`);
    process.stdout.write('\n');
    if (state.pendingClose) {
      console.log(g('\n[SESSION CLOSED]'));
      printTokens();
      process.exit(0);
    }
    resolve(output);
  };

  proc.on('close', (code) => { finish(output, code ?? 0); });
  proc.on('error', (err) => {
    console.log(r(`[ERROR] ${err.message}`));
    state.lastStatus = r('PROC_ERROR');
    finish(output, 1);
  });
});

// ── REPL loop ─────────────────────────────────────────────────────────────────
const run = async () => {
  // Confirm REPO_ROOT exists
  if (!existsSync(REPO_ROOT)) {
    process.stderr.write(`${r('[FATAL]')} REPO_ROOT not found: ${REPO_ROOT}\n`);
    process.exit(1);
  }
  process.chdir(REPO_ROOT);

  // --help flag
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
    prompt: `\n${g('NUDIMMUD')}${d('>')} `,
    terminal: process.stdin.isTTY,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    const input = line.trim();

    if (!input) {
      rl.prompt();
      rl.resume();
      return;
    }

    if (input === '/exit' || input === '/quit') {
      if (state.busy) {
        state.pendingClose = true;
        return; // finish() will call process.exit after DeepSeek resolves
      }
      console.log(g('\n[SESSION TERMINATED]'));
      printTokens();
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
    } else if (input.startsWith('/')) {
      console.log(d(`[UNKNOWN COMMAND] ${input} — type /help`));
    } else {
      await callDeepSeek(input);
    }

    rl.prompt();
    rl.resume();
  });

  rl.on('close', () => {
    if (state.busy) {
      state.pendingClose = true; // defer until DeepSeek call finishes
      return;
    }
    console.log(g('\n[SESSION CLOSED]'));
    printTokens();
    process.exit(0);
  });

  // Graceful Ctrl+C
  process.on('SIGINT', () => {
    console.log(g('\n[SIGINT] — type /exit to quit cleanly'));
    rl.prompt();
  });
};

run();
