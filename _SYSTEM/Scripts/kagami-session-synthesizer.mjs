#!/usr/bin/env node
// kagami-session-synthesizer.mjs
// Daily cloud task (21:00) — deepseek-flash reads today's Kagami reflections
// and appends a compact daily synthesis to session-journal.md
// Uses llm-compat.sh → deepseek-v4-flash (cheap, fast)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
const LLM_COMPAT_SH = resolve(REPO_ROOT, '_SYSTEM/Scripts/llm-compat.sh');
const DB_PATH    = process.env.KAGAMI_DB_PATH ?? resolve(REPO_ROOT, '_SYSTEM/OS_KERNEL/kagami.db');
const RAG_INDEX  = resolve(REPO_ROOT, '_SYSTEM/training/data/rag-index.jsonl');
const JOURNAL    = resolve(process.env.HOME, '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/session-journal.md');
const LOG        = '/tmp/kagami-session-synthesizer.log';
const SYNTH_LANE = process.env.SYNTH_LANE || 'deepseek-v4-flash';

const log = (...a) => {
  const line = `[session-synth ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG, line, { flag: 'a' }); } catch {}
};

function getTodayReflections() {
  if (!existsSync(DB_PATH)) return [];
  try {
    const require = createRequire(import.meta.url);
    const Database = require(resolve(REPO_ROOT, '.codex-worktrees/kagami-rebuild/_SYSTEM/kagami/node_modules/better-sqlite3'));
    const db = new Database(DB_PATH, { readonly: true });
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT command_preview, lane, response_content, latency_ms, created_at
      FROM reflections
      WHERE created_at >= ? ORDER BY created_at DESC LIMIT 20
    `).all(`${today}T00:00:00.000Z`);
    db.close();
    return rows;
  } catch (e) {
    log('db error:', e.message);
    return [];
  }
}

function getTodayRagAtoms() {
  if (!existsSync(RAG_INDEX)) return [];
  const today = new Date().toISOString().slice(0, 10);
  return readFileSync(RAG_INDEX, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(e => e?.indexedAt?.startsWith(today))
    .slice(0, 10);
}

async function main() {
  log('starting session synthesis');
  const today = new Date().toISOString().slice(0, 10);

  // Check if already synthesized today
  if (existsSync(JOURNAL)) {
    if (readFileSync(JOURNAL, 'utf8').match(new RegExp(`^## ${today}$`, 'm'))) {
      log('already synthesized today — skip');
      return;
    }
  }

  const reflections = getTodayReflections();
  const atoms = getTodayRagAtoms();
  log(`reflections=${reflections.length} rag-atoms=${atoms.length}`);

  if (!reflections.length && !atoms.length) {
    log('nothing to synthesize today');
    return;
  }

  const reflectionSummary = reflections.map(r =>
    `- [${r.lane}] ${(r.command_preview ?? '').slice(0, 120)}`
  ).join('\n');

  const atomSummary = atoms.map(a =>
    `- ${a.title}: ${a.summary?.slice(0, 100)}`
  ).join('\n');

  const prompt = `Synthesize today's AI assistant session (${today}) into a compact journal entry.

Today's interactions (${reflections.length}):
${reflectionSummary || '(none)'}

Key topics indexed:
${atomSummary || '(none)'}

Write a 3-5 bullet journal entry covering:
- What was built or decided
- Key technical discoveries
- Next steps if any

Format: markdown bullets, max 200 words, factual only.`;

  const result = spawnSync('bash', [LLM_COMPAT_SH, '-m', SYNTH_LANE], {
    input: prompt,
    env: { ...process.env, LLM_COMPAT_PROMPT_TEXT: prompt },
    timeout: 60000,
    encoding: 'utf8',
  });

  const synthesis = (result.stdout || '').trim()
    .split('\n').filter(l => !l.startsWith('⬡')).join('\n').trim();

  if (!synthesis) { log('empty synthesis — skip'); return; }

  const entry = `\n## ${today}\n${synthesis}\n`;
  mkdirSync(dirname(JOURNAL), { recursive: true });
  writeFileSync(JOURNAL, entry, { flag: 'a' });
  log(`written ${entry.length} chars to session-journal.md`);
}

main().catch(e => log('fatal:', e.message));
