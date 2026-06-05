#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const queueFile = path.join(cwd, '.claude', 'yuri-sentinel', 'learning', 'dream-queue.jsonl');
const offloadSh = path.join(cwd, '_SYSTEM', 'Scripts', 'llm-compat.sh');
const globalFile = path.join(cwd, '.claude', 'yuri-sentinel', 'learning', 'global.md');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const lines = fs.existsSync(queueFile) ? fs.readFileSync(queueFile, 'utf8').split('\n').filter(Boolean) : [];
const entries = lines.map((line, i) => ({ line, i, data: JSON.parse(line) }));
const targets = entries.filter(({ data }) => force || data.status === 'pending');
if (!targets.length) process.exit(0);

if (dryRun) {
  for (const { data } of targets) console.log(`${data.status}: ${data.promptFile}`);
  process.exit(0);
}

// Truncate to NEW sessions only + write targets section (reduces 60KB → ~8KB)
function truncatePrompt(raw) {
  const lines = raw.split('\n');
  const newLines = [];
  let inNew = false;
  let targetIdx = lines.findIndex(l => l.startsWith('## Where to write'));
  for (let i = 0; i < (targetIdx > 0 ? targetIdx : lines.length); i++) {
    if (lines[i].includes('★ NEW')) inNew = true;
    else if (lines[i].startsWith('  OLD')) inNew = false;
    if (inNew) newLines.push(lines[i]);
  }
  const targetSection = targetIdx > 0 ? lines.slice(targetIdx).join('\n') : '';
  const prefix = 'Output ONLY a numbered list of 1-5 rules to prevent repeated mistakes. Format: N. <rule>. No file paths, no preamble.\n\n## Recent sessions (new since last dream)\n';
  return prefix + newLines.join('\n') + '\n\n' + targetSection;
}

const runDeepSeek = (prompt) => new Promise((resolve, reject) => {
  const child = spawn('bash', [offloadSh, '-m', 'deepseek-v4-flash', truncatePrompt(prompt)], {
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', reject);
  child.on('close', (code, signal) => code === 0 ? resolve(out) : reject(new Error((err || `exit ${code}${signal ? ` ${signal}` : ''}`).trim())));
});

let queue = [...entries];
let append = '';
for (const { i, data } of targets) {
  try {
    const prompt = fs.readFileSync(data.promptFile, 'utf8');
    const text = await runDeepSeek(prompt);
    const rules = text.split('\n').map((s) => s.trim()).filter((s) => /^\d+\.\s+.+/.test(s)).map((s) => s.replace(/^\d+\.\s+/, ''));
    if (rules.length) append += `\n### Auto-synthesized ${new Date(data.ts || Date.now()).toISOString().slice(0, 10)}\n${rules.map((r) => `- ${r}`).join('\n')}\n`;
    queue[i] = { ...data, status: 'processed' };
  } catch {
    queue[i] = { ...data, status: 'failed' };
  }
}
if (append) {
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.appendFileSync(globalFile, append);
}
fs.writeFileSync(queueFile, queue.map((e) => JSON.stringify(e.data ?? e)).join('\n') + '\n');
