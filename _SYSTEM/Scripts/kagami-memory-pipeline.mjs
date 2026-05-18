#!/usr/bin/env node
// kagami-memory-pipeline.mjs
// Two-agent autonomous memory pipeline:
//   Phase 1 — Qwen3.5-4B (local, free): extract memory candidates from a reflection
//   Phase 2 — codex-spark (review gate): APPROVE / REJECT each candidate
//   Phase 3 — write approved candidates to MEMORY.md + individual memory files
//
// Invocation: node kagami-memory-pipeline.mjs <reflectId> <content>
// Or via env: PIPELINE_REFLECT_ID=... PIPELINE_CONTENT=... node ...

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import http from 'node:http';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
const MEMORY_DIR = resolve(process.env.HOME, '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory');
const MEMORY_IDX = resolve(MEMORY_DIR, 'MEMORY.md');
const STATE_PATH = resolve(REPO_ROOT, '_SYSTEM/training/state/memory-pipeline-state.json');
const OFFLOAD_SH = resolve(REPO_ROOT, '_SYSTEM/Scripts/offload.sh');
const LOG_PATH   = resolve('/tmp/kagami-memory-pipeline.log');

const RAPID_MLX_URL    = process.env.RAPID_MLX_URL    || 'http://localhost:8000';
const RAPID_MLX_MODEL  = process.env.RAPID_MLX_MODEL  || 'qwen3.5-4b';
const REVIEW_LANE      = process.env.MEMORY_REVIEW_LANE || 'deepseek-v4-flash';

const log = (...a) => {
  const line = `[mem-pipeline ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG_PATH, line, { flag: 'a' }); } catch {}
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpPost(urlStr, bodyObj, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = http.request(u, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Phase 1: Local extraction via Rapid-MLX ─────────────────────────────────

async function extractCandidates(reflectId, content) {
  const existingMemories = existsSync(MEMORY_IDX)
    ? readFileSync(MEMORY_IDX, 'utf8').split('\n').filter(l => l.startsWith('-')).slice(0, 20).join('\n')
    : '(none yet)';

  const prompt = `You are a memory extraction agent for an AI developer's personal assistant system.

Given this recent interaction:
---
${content.slice(0, 3000)}
---

Existing memories (do not duplicate):
${existingMemories}

Extract 0-3 memory candidates that are:
- Non-obvious facts about the user's preferences, decisions, or project state
- Durable (will still matter in future sessions)
- Not already covered by existing memories above
- Specific enough to be actionable

Output ONLY a JSON array. If nothing worth memorizing, output [].
Format: [{"type":"user|project|feedback|reference","name":"short title","body":"memory content"}]`;

  try {
    const res = await httpPost(`${RAPID_MLX_URL}/v1/chat/completions`, {
      model: RAPID_MLX_MODEL,
      stream: false,
      enable_thinking: false,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '[]';
    // Extract JSON array from response (model may add explanation)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch (e) {
    log('extract error:', e.message);
    return [];
  }
}

// ─── Phase 2: codex-spark review gate ────────────────────────────────────────

function reviewCandidate(candidate, existingMemories) {
  const prompt = `You are a memory quality gate for a developer AI system.

Review this memory candidate and decide APPROVE or REJECT.

APPROVE if: factual, specific, durable across sessions, genuinely useful, not redundant
REJECT if: vague, ephemeral, already covered, potentially incorrect, too trivial

Candidate:
${JSON.stringify(candidate, null, 2)}

Existing memories:
${existingMemories}

Respond with ONLY this JSON: {"decision":"APPROVE","reason":"..."} or {"decision":"REJECT","reason":"..."}`;

  try {
    const result = spawnSync('bash', [OFFLOAD_SH, '-m', REVIEW_LANE], {
      input: prompt,
      env: { ...process.env, OFFLOAD_PROMPT_TEXT: prompt },
      timeout: 60000,
      encoding: 'utf8',
    });
    const raw = (result.stdout || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { decision: 'REJECT', reason: 'could not parse reviewer response' };
    return JSON.parse(match[0]);
  } catch (e) {
    log('review error:', e.message);
    return { decision: 'REJECT', reason: `review failed: ${e.message}` };
  }
}

// ─── Phase 3: Write approved memory ──────────────────────────────────────────

function writeMemory(candidate, reflectId) {
  mkdirSync(MEMORY_DIR, { recursive: true });

  const hash = createHash('sha256').update(candidate.name + candidate.body).digest('hex').slice(0, 8);
  const filename = `auto_${candidate.type}_${hash}.md`;
  const filepath = resolve(MEMORY_DIR, filename);

  if (existsSync(filepath)) {
    log(`memory ${filename} already exists — skipping`);
    return;
  }

  const content = `---
name: ${candidate.name}
description: ${candidate.body.split('\n')[0].slice(0, 120)}
type: ${candidate.type}
source: kagami-memory-pipeline
reflect_id: ${reflectId}
created_at: ${new Date().toISOString()}
---

${candidate.body}
`;
  writeFileSync(filepath, content);

  // Append to MEMORY.md index
  const indexLine = `- [${candidate.name}](${filename}) — ${candidate.body.split('\n')[0].slice(0, 100)}\n`;
  writeFileSync(MEMORY_IDX, indexLine, { flag: 'a' });

  log(`wrote memory: ${filename}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const reflectId = process.argv[2] || process.env.PIPELINE_REFLECT_ID || 'unknown';
  const content   = process.argv[3] || process.env.PIPELINE_CONTENT    || '';

  if (!content.trim()) { log('no content — exit'); return; }

  log(`processing reflect ${reflectId} (${content.length} chars)`);

  // Phase 1 — extract
  const candidates = await extractCandidates(reflectId, content);
  log(`extracted ${candidates.length} candidates`);
  if (!candidates.length) return;

  const existingMemories = existsSync(MEMORY_IDX)
    ? readFileSync(MEMORY_IDX, 'utf8').split('\n').filter(l => l.startsWith('-')).slice(0, 20).join('\n')
    : '(none)';

  // Phase 2+3 — review then write
  for (const candidate of candidates) {
    if (!candidate?.name || !candidate?.body) continue;
    const review = reviewCandidate(candidate, existingMemories);
    log(`${candidate.name} → ${review.decision} (${review.reason})`);
    if (review.decision === 'APPROVE') {
      writeMemory(candidate, reflectId);
    }
  }

  // Update state
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
  state.lastProcessedAt = new Date().toISOString();
  state.lastReflectId   = reflectId;
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

main().catch(e => log('fatal:', e.message));
