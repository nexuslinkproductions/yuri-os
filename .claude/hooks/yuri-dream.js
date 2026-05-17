'use strict';
if (process.env.NUDIMMUD_DISABLE_SCOUTS === '1') {
  process.exit(0);
}
const fs = require('fs');
const path = require('path');

const LEARNING_DIR = path.join(process.env.HOME || process.cwd(), '.claude', 'yuri-sentinel', 'learning');
const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'yuri-sentinel', 'learning');
const SESSIONS_DIR = path.join(PROJECT_LEARNING_DIR, 'sessions');

function buildDreamPrompt() {
  const sessions = loadRecentSessions(20);
  const lastDreamTime = getLastDreamTime();

  const sessionBlocks = sessions.map((s, i) => {
    const isNew = new Date(s.ts).getTime() > lastDreamTime;
    const marker = isNew ? '★ NEW' : '  OLD';
    const corrections = s.corrections?.length > 0
      ? `\nCORRECTIONS DETECTED:\n${s.corrections.map(c => `  - "${c}"`).join('\n')}`
      : '';
    return `${marker} | ${s.ts} | agents:[${s.agents_run.map(a => a.type).join(', ')}] | skills:[${s.skills_read.join(', ')}]
Human messages:
${s.human_messages.map((m, idx) => `  ${idx + 1}. "${m}"`).join('\n')}${corrections}
${s.agents_run.map(a => `${a.type} output: "${a.output_preview}"`).join('\n')}`;
  }).join('\n\n---\n\n');

  return `You analyze recent Claude Code sessions and write one-line rules to prevent repeated mistakes.

★ = new since last dream. These are fresh signal. OLD sessions provide pattern confirmation.

## Sessions
${sessionBlocks}

## Where to write rules
- ${path.join(LEARNING_DIR, 'global.md')} — lessons that apply to EVERY agent in EVERY project
- ${path.join(LEARNING_DIR, 'agents/{type}.md')} — lessons for one specific agent type, all projects
- ${path.join(PROJECT_LEARNING_DIR, 'global.md')} — lessons for every agent in THIS project only
- ${path.join(PROJECT_LEARNING_DIR, 'agents/{type}.md')} — lessons for one agent in THIS project only

Write the rules now. Read target files first. Write only what is new. Stop after 5 rules.`;
}

function loadRecentSessions(max) {
  const sessions = [];
  if (!fs.existsSync(SESSIONS_DIR)) return sessions;
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).sort().reverse();
  for (const file of files) {
    const lines = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        sessions.push(JSON.parse(line));
        if (sessions.length >= max) return sessions;
      } catch {}
    }
  }
  return sessions;
}

function getLastDreamTime() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  if (!fs.existsSync(lockFile)) return 0;
  try { return parseInt(fs.readFileSync(lockFile, 'utf8')); }
  catch { return 0; }
}

const prompt = buildDreamPrompt();
const promptFile = path.join(PROJECT_LEARNING_DIR, '.dream-prompt.txt');
fs.mkdirSync(path.dirname(promptFile), { recursive: true });
fs.writeFileSync(promptFile, prompt);

const queueFile = path.join(PROJECT_LEARNING_DIR, 'dream-queue.jsonl');
const queueEntry = {
  ts: new Date().toISOString(),
  promptFile,
  promptLength: prompt.length,
  status: 'pending',
};
try {
  fs.appendFileSync(queueFile, JSON.stringify(queueEntry) + '\n');
} catch (e) {
  fs.appendFileSync(
    path.join(PROJECT_LEARNING_DIR, 'dream-errors.log'),
    `${new Date().toISOString()}: queue write failed: ${e.message}\n`
  );
}
