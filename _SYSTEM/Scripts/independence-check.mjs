#!/usr/bin/env node
// independence-check.mjs
// Static verifier for Yuri OS Anthropic-independence sprint.
// Walks subagents, hooks, skills, scripts, and routing contract; asserts
// no surface fires Anthropic when YURI_NO_ANTHROPIC=1.
//
// Usage:
//   node _SYSTEM/Scripts/independence-check.mjs            # full report, exit 0/1
//   node _SYSTEM/Scripts/independence-check.mjs --strict   # fail on any warn too
//   node _SYSTEM/Scripts/independence-check.mjs --check=<surface>   # one surface only
//
// Surfaces: subagents | hooks | skills | scripts | routing | settings | eot | all
//
// Read-only. No mutations. Never spawns an Agent.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '../..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const ONLY = (args.find(a => a.startsWith('--check=')) || '').slice(8) || 'all';

// Patterns that indicate an Anthropic surface fires automatically.
const ANTHROPIC_MODEL_RE = /claude[-:](opus|sonnet|haiku|3|4|5)/i;
const ANTHROPIC_SHELL_RE = /\bclaude\s+-p\b/;
const ANTHROPIC_API_RE = /api\.anthropic\.com/;
const ANTHROPIC_SDK_RE = /@anthropic-ai\/sdk/;
const HAIKU_AGENT_RE = /Agent\(\{[^}]*haiku/i;

// Surfaces that LEGITIMATELY mention Claude (pricing telemetry, guards, etc.)
// without firing it.
const ALLOWLIST_FILES = new Set([
  '.claude/hooks/agent-spawn-guard.js',
  '.claude/hooks/token-status.js',
  '.claude/hooks/token-session-end.js',
  '.claude/hooks/pre-tool-use.js',
  '_SYSTEM/Scripts/token-ledger.mjs',
  '_SYSTEM/Scripts/llm-compat-contract-dispatch-check.mjs',
  '_SYSTEM/Scripts/create-missing-commands.mjs',
  '_SYSTEM/Scripts/independence-check.mjs',
]);

const findings = { pass: [], warn: [], fail: [] };

function record(level, surface, file, line, excerpt, fix) {
  findings[level].push({ surface, file, line, excerpt: excerpt.slice(0, 120), fix });
}

function readSafe(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function walk(dir, pat = /\.(md|js|mjs|sh|json)$/) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.codex-worktrees', 'worktrees'].some(s => p.includes(s))) continue;
      out.push(...walk(p, pat));
    } else if (pat.test(e.name)) out.push(p);
  }
  return out;
}

function relPath(p) { return p.replace(REPO + '/', ''); }

function scanFile(path, surface) {
  const rel = relPath(path);
  if (ALLOWLIST_FILES.has(rel)) return;
  const content = readSafe(path);
  if (!content) return;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ANTHROPIC_SHELL_RE.test(ln)) {
      record('fail', surface, rel, i + 1, ln.trim(),
        'Replace `claude -p` with `_SYSTEM/Scripts/llm-compat.sh -m <non-anthropic-lane>` or strip the model call entirely.');
    } else if (HAIKU_AGENT_RE.test(ln)) {
      record('fail', surface, rel, i + 1, ln.trim(),
        'Replace haiku Agent spawn with @deepseek-v4-flash cloud or deepseek-r1:8b local.');
    } else if (ANTHROPIC_API_RE.test(ln)) {
      record('warn', surface, rel, i + 1, ln.trim(),
        'Direct api.anthropic.com call — billed under standard API, not Agent SDK; replace if affordable.');
    } else if (ANTHROPIC_SDK_RE.test(ln)) {
      record('warn', surface, rel, i + 1, ln.trim(),
        '@anthropic-ai/sdk import — billed under standard API; inventory for cost projection.');
    } else if (ANTHROPIC_MODEL_RE.test(ln)) {
      record('warn', surface, rel, i + 1, ln.trim(),
        'Anthropic model string — confirm whether default/automatic or opt-in only.');
    }
  }
}

// ============================================================ SUBAGENTS
function checkSubagents() {
  const dir = join(REPO, '.claude/agents');
  if (!existsSync(dir)) { record('warn', 'subagents', dir, 0, 'directory missing', 'create or skip'); return; }
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const path = join(dir, file);
    const content = readSafe(path);
    if (!content) continue;
    // Look for explicit model: field in frontmatter
    const fm = content.match(/^---([\s\S]*?)^---/m)?.[1] || content.slice(0, 800);
    const modelMatch = fm.match(/^\s*model:\s*(.+)$/m);
    const runtimeMatch = fm.match(/^\s*runtime[_ ]?kind:\s*native_function/m) || /native_function/.test(fm);
    if (!modelMatch && !runtimeMatch) {
      record('fail', 'subagents', relPath(path), 0, 'no model: field — will inherit session default',
        'Add explicit `model: <non-anthropic-lane>` OR convert to native_function deterministic.');
    } else if (modelMatch && ANTHROPIC_MODEL_RE.test(modelMatch[1])) {
      record('fail', 'subagents', relPath(path), 0, `model: ${modelMatch[1].trim()}`,
        'Replace with non-Anthropic lane: deepseek-v4-pro / qwen2.5:7b / deepseek-v4-flash.');
    } else {
      record('pass', 'subagents', relPath(path), 0,
        modelMatch ? `model: ${modelMatch[1].trim()}` : 'native_function', '');
    }
    // Also scan body for Anthropic spawns
    scanFile(path, 'subagents');
  }
}

// ============================================================ SETTINGS
function checkSettings() {
  const path = join(REPO, '.claude/settings.json');
  const content = readSafe(path);
  if (!content) return record('warn', 'settings', '.claude/settings.json', 0, 'missing', '');
  let json;
  try { json = JSON.parse(content); } catch { return record('fail', 'settings', '.claude/settings.json', 0, 'invalid JSON', 'fix syntax'); }
  if (!json.model) {
    record('pass', 'settings', '.claude/settings.json', 0, 'no default model — user-picked per session', '');
  } else if (/sonnet|opus|haiku|claude/i.test(json.model)) {
    record('fail', 'settings', '.claude/settings.json', 0, `model = ${json.model}`,
      'Remove "model" key or set to non-Anthropic placeholder.');
  } else {
    record('pass', 'settings', '.claude/settings.json', 0, `model = ${json.model}`, '');
  }
}

// ============================================================ HOOKS
function checkHooks() {
  for (const p of walk(join(REPO, '.claude/hooks'), /\.js$/)) scanFile(p, 'hooks');
}

// ============================================================ SKILLS
function checkSkills() {
  const dir = join(REPO, 'skills');
  if (!existsSync(dir)) return;
  for (const skill of readdirSync(dir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    for (const p of walk(join(dir, skill.name), /\.(md|mjs|js)$/)) scanFile(p, 'skills');
  }
}

// ============================================================ SCRIPTS
function checkScripts() {
  const dir = join(REPO, 'Scripts');
  if (!existsSync(dir)) return;
  for (const p of walk(dir, /\.(mjs|js|sh)$/)) scanFile(p, 'scripts');
}

// ============================================================ ROUTING
function checkRouting() {
  const path = join(REPO, '_SYSTEM/Scripts/llm-compat-contract.mjs');
  scanFile(path, 'routing');
}

// ============================================================ EOT
function checkEot() {
  const path = join(REPO, 'skills/end-of-transmission/SKILL.md');
  const before = findings.fail.length + findings.warn.length;
  scanFile(path, 'eot');
  const after = findings.fail.length + findings.warn.length;
  if (after === before) {
    record('pass', 'eot', relPath(path), 0, 'no automatic Anthropic EOT surface detected', '');
  }
}

// ============================================================ DISPATCH
const checks = {
  settings: checkSettings,
  subagents: checkSubagents,
  hooks: checkHooks,
  skills: checkSkills,
  scripts: checkScripts,
  routing: checkRouting,
  eot: checkEot,
};

if (ONLY === 'all') {
  for (const fn of Object.values(checks)) fn();
} else if (checks[ONLY]) {
  checks[ONLY]();
} else {
  console.error(`Unknown surface: ${ONLY}. Valid: ${Object.keys(checks).join(', ')}, all`);
  process.exit(2);
}

// ============================================================ REPORT
function color(c, s) {
  if (!process.stdout.isTTY) return s;
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 90, bold: 1 };
  return `\x1b[${codes[c] || 0}m${s}\x1b[0m`;
}

const total = findings.pass.length + findings.warn.length + findings.fail.length;
const sprintTarget = Math.round((findings.pass.length / Math.max(total, 1)) * 100);

console.log('');
console.log(color('bold', 'YURI OS INDEPENDENCE CHECK'));
console.log(color('dim', `  ran: ${ONLY}  strict: ${STRICT}  scanned: ${total}`));
console.log('');

if (findings.fail.length) {
  console.log(color('red', `FAIL (${findings.fail.length})`));
  for (const f of findings.fail) {
    console.log(`  ${color('red', '✗')} ${color('cyan', f.file)}${f.line ? ':' + f.line : ''}  [${f.surface}]`);
    console.log(`    ${color('dim', f.excerpt)}`);
    if (f.fix) console.log(`    ${color('yellow', '→ ' + f.fix)}`);
  }
  console.log('');
}

if (findings.warn.length) {
  console.log(color('yellow', `WARN (${findings.warn.length})`));
  for (const f of findings.warn) {
    console.log(`  ${color('yellow', '!')} ${color('cyan', f.file)}${f.line ? ':' + f.line : ''}  [${f.surface}]`);
    console.log(`    ${color('dim', f.excerpt)}`);
  }
  console.log('');
}

console.log(color('green', `PASS (${findings.pass.length})`));
console.log('');
console.log(color('bold', `Independence score (this run): ${sprintTarget} / 100`));
console.log(color('dim', `  fail=${findings.fail.length}  warn=${findings.warn.length}  pass=${findings.pass.length}`));
console.log('');

const exitCode = findings.fail.length > 0 ? 1 : (STRICT && findings.warn.length > 0 ? 1 : 0);
process.exit(exitCode);
