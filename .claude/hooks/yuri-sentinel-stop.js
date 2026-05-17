'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'yuri-sentinel', 'learning');
const SESSIONS_DIR = path.join(PROJECT_LEARNING_DIR, 'sessions');
const STATE_FILE = path.join(process.cwd(), '.claude', 'state', 'session-state.json');

const COOLDOWN_MS = 4 * 3_600_000;
const MIN_SESSIONS = 3;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const { session_id, transcript_path } = event;

    if (!transcript_path || !fs.existsSync(transcript_path)) {
      process.exit(0); return;
    }

    const obs = parseSession(session_id || 'unknown', transcript_path);
    writeObservation(obs);

    // Session lifecycle: extract learnings + write journal
    try {
      const reflect = require('./session-reflect.js');
      reflect.run();
    } catch (_) {}

    if (process.env.NUDIMMUD_DISABLE_SCOUTS !== '1' && shouldDream()) spawnDream();
  } catch (e) {}
  process.exit(0);
});

function parseSession(sessionId, transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const humanMessages = [];
  const agentsRun = [];
  const skillsRead = new Set();
  const corrections = [];
  let pendingAgent = null;

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    const role = e.message?.role;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (role === 'user' && block.type === 'text') {
        const text = (block.text || '').trim();
        if (text.length > 2) {
          humanMessages.push(text.slice(0, 800));
          const correctionPatterns = [
            /\bno[,.]?\s+(don'?t|remove|stop|never|avoid)/i,
            /\bwrong\b/i,
            /\bnot like that\b/i,
            /\bstill\b.*\bsame\b/i,
            /\bagain\b/i,
            /\bwtf\b/i,
            /\bplease don'?t\b/i
          ];
          const isCorrection = correctionPatterns.some(p => p.test(text));
          if (isCorrection) corrections.push(text.slice(0, 200));
        }
      }

      if (role === 'user' && block.type === 'tool_result' && pendingAgent) {
        const parts = Array.isArray(block.content) ? block.content : [{ type: 'text', text: String(block.content || '') }];
        const meta = parts.find(p => p.type === 'text' && p.text?.includes('agentId:'));
        if (meta) {
          const output = parts.filter(p => p !== meta && p.type === 'text' && p.text).map(p => p.text).join('\n').trim();
          agentsRun.push({
            type: pendingAgent.type,
            prompt_preview: pendingAgent.prompt,
            output_preview: output.slice(0, 400).replace(/\s+/g, ' '),
          });
          pendingAgent = null;
        }
      }

      if (role === 'assistant' && block.type === 'tool_use') {
        if (block.name === 'Agent') {
          const t = (block.input?.subagent_type || 'unknown').replace(/^[^:]+:/, '').toLowerCase();
          pendingAgent = { type: t, prompt: (block.input?.prompt || '').slice(0, 150) };
        }
        if (block.name === 'Read') {
          const m = (block.input?.file_path || '').match(/skills\/([^/]+)\/SKILL\.md$/i);
          if (m) skillsRead.add(m[1]);
        }
      }
    }
  }

  let files_modified = [];
  let error_snippets = [];
  let commit_messages = [];
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    files_modified = (state.files_written || []).map(f => path.basename(f));
    error_snippets = (state.errors || []).slice(0, 3).map(e => (e.snippet || '').slice(0, 120));
  } catch {}
  try {
    const { execSync } = require('child_process');
    const log = execSync('git log --oneline -5 --no-merges', { cwd: process.cwd(), timeout: 3000, encoding: 'utf8' });
    commit_messages = log.trim().split('\n').filter(Boolean).slice(0, 5);
  } catch {}

  return {
    id: `sess-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    ts: new Date().toISOString(),
    session_id: sessionId,
    project: path.basename(process.cwd()),
    human_messages: humanMessages,
    corrections: corrections,
    agents_run: agentsRun,
    skills_read: [...skillsRead],
    files_modified,
    error_snippets,
    commit_messages,
  };
}

function writeObservation(obs) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const file = path.join(SESSIONS_DIR, `${date}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(obs) + '\n');
}

function shouldDream() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  if (fs.existsSync(lockFile)) {
    const lastRun = parseInt(fs.readFileSync(lockFile, 'utf8'));
    if (Date.now() - lastRun < COOLDOWN_MS) return false;
  }
  const date = new Date().toISOString().split('T')[0];
  const file = path.join(SESSIONS_DIR, `${date}.jsonl`);
  if (!fs.existsSync(file)) return false;
  const count = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  return count >= MIN_SESSIONS;
}

function spawnDream() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, String(Date.now()));

  const dreamScript = path.join(__dirname, 'yuri-dream.js');
  const child = spawn('node', [dreamScript], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd()
  });
  child.unref();
}
