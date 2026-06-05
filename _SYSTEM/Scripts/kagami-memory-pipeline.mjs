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
const CORRECTION_PAIRS = resolve(MEMORY_DIR, 'correction-pairs.jsonl');
const STATE_PATH   = resolve(REPO_ROOT, '_SYSTEM/training/state/memory-pipeline-state.json');
const LLM_COMPAT_SH   = resolve(REPO_ROOT, '_SYSTEM/Scripts/llm-compat.sh');
const LOG_PATH     = resolve('/tmp/kagami-memory-pipeline.log');
const PULSE_BUS    = resolve(process.env.KAGAMI_PULSE_BUS_PATH ?? resolve(REPO_ROOT, '.claude/state/pulse-bus.jsonl'));
const PREFS_PATH   = resolve(MEMORY_DIR, 'preferences.json');
const PREFS_MAX    = 8;
const PREFS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RICK_KEYWORDS = ['listen', 'morty', 'obviously', 'portal', 'genius', 'science', 'rick', 'multiverse', 'interdimensional', 'szechuan'];
const RICK_DRIFT_THRESHOLD = 0.65;

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
    const result = spawnSync('bash', [LLM_COMPAT_SH, '-m', REVIEW_LANE], {
      input: prompt,
      env: { ...process.env, LLM_COMPAT_PROMPT_TEXT: prompt },
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

// ─── Correction capture ──────────────────────────────────────────────────────

function extractPreferences(prompt, response) {
  const prefs = [];
  const combined = `${prompt}\n${response}`;
  // Explicit preferences — "I prefer", "always do", "never do", "I want"
  const explicitRe = /(?:i (?:prefer|want|need|like|always|never)|(?:always|never) (?:use|show|include|skip|add|avoid))[^.!?\n]{5,80}/gi;
  for (const m of combined.matchAll(explicitRe)) {
    prefs.push({ type: 'explicit', text: m[0].trim().slice(0, 120) });
  }
  // Format preferences — JSON, markdown, bullets, code blocks
  const formatRe = /(?:show|give|use|output|format)[^.!?\n]{0,30}(?:json|yaml|markdown|table|bullets?|code block|plain text)/gi;
  for (const m of combined.matchAll(formatRe)) {
    prefs.push({ type: 'format', text: m[0].trim().slice(0, 120) });
  }
  return prefs.slice(0, 4);
}

function mergePreferences(existing, fresh) {
  const cutoff = Date.now() - PREFS_TTL_MS;
  const live = (existing ?? []).filter(p => new Date(p.updatedAt).getTime() > cutoff);
  for (const pref of fresh) {
    const dupe = live.find(p => normalizedLevenshtein(p.text, pref.text) < 0.25);
    if (!dupe) live.push({ ...pref, updatedAt: new Date().toISOString() });
  }
  return live.slice(-PREFS_MAX);
}

function splitPromptResponse(content) {
  const match = content.match(/^Q:\s*([\s\S]*?)\n\nA:\s*([\s\S]*)$/);
  if (!match) return { prompt: content.trim(), response: '' };
  return { prompt: (match[1] ?? '').trim(), response: (match[2] ?? '').trim() };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

function normalizedLevenshtein(a, b) {
  const left = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const right = b.toLowerCase().replace(/\s+/g, ' ').trim();
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 0;
  return levenshtein(left, right) / maxLen;
}

function captureRepeatedQuestionCorrection(state, reflectId, sessionId, prompt, response) {
  if (!sessionId || !prompt) return;

  const now = Date.now();
  const recent = Array.isArray(state.recentResponses) ? state.recentResponses : [];
  const previous = recent
    .filter(item => item?.sessionId === sessionId && item.prompt && item.response)
    .filter(item => now - Date.parse(item.ts ?? 0) <= 10 * 60 * 1000)
    .find(item => normalizedLevenshtein(item.prompt, prompt) < 0.3);

  if (previous) {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const pair = {
      ts: new Date().toISOString(),
      reflectId: previous.reflectId,
      prompt: previous.prompt,
      badResponse: previous.response,
      signal: 'repeated_question',
      sessionId,
    };
    writeFileSync(CORRECTION_PAIRS, `${JSON.stringify(pair)}\n`, { flag: 'a' });
    log(`captured correction pair for repeated question: ${previous.reflectId}`);
  }

  state.recentResponses = [
    ...recent.filter(item => now - Date.parse(item.ts ?? 0) <= 10 * 60 * 1000),
    { ts: new Date().toISOString(), reflectId, sessionId, prompt, response },
  ].slice(-100);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const reflectId = process.argv[2] || process.env.PIPELINE_REFLECT_ID || 'unknown';
  const content   = process.argv[3] || process.env.PIPELINE_CONTENT    || '';
  const sessionId = process.argv[4] || process.env.PIPELINE_SESSION_ID || '';

  if (!content.trim()) { log('no content — exit'); return; }

  log(`processing reflect ${reflectId} (${content.length} chars)`);

  const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
  const { prompt, response } = splitPromptResponse(content);
  captureRepeatedQuestionCorrection(state, reflectId, sessionId, prompt, response);

  // Phase 1 — extract
  const candidates = await extractCandidates(reflectId, content);
  log(`extracted ${candidates.length} candidates`);

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

  // V5 — Preference extraction
  const freshPrefs = extractPreferences(prompt, response);
  if (freshPrefs.length > 0) {
    try {
      const existing = existsSync(PREFS_PATH) ? JSON.parse(readFileSync(PREFS_PATH, 'utf8')) : [];
      const merged = mergePreferences(existing, freshPrefs);
      mkdirSync(dirname(PREFS_PATH), { recursive: true });
      writeFileSync(PREFS_PATH, JSON.stringify(merged, null, 2));
      log(`preferences updated: ${merged.length} total`);
    } catch (e) {
      log('preferences write failed:', e.message);
    }
  }

  // Drift detection — score response for Rick persona consistency
  const rickHits = RICK_KEYWORDS.filter(kw => response.toLowerCase().includes(kw)).length;
  const rickScoreVal = rickHits / RICK_KEYWORDS.length;
  if (rickScoreVal < RICK_DRIFT_THRESHOLD) {
    const anchorEvent = JSON.stringify({
      ts: new Date().toISOString(),
      source: 'kagami',
      kind: 'character_anchor',
      sessionId,
      reflectId,
      payload: { score: rickScoreVal, threshold: RICK_DRIFT_THRESHOLD },
    });
    try {
      mkdirSync(dirname(PULSE_BUS), { recursive: true });
      writeFileSync(PULSE_BUS, anchorEvent + '\n', { flag: 'a' });
      log(`character_anchor emitted (score=${rickScoreVal.toFixed(2)})`);
    } catch (e) {
      log('character_anchor write failed:', e.message);
    }
  }

  // Update state
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  state.lastProcessedAt = new Date().toISOString();
  state.lastReflectId   = reflectId;
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

main().catch(e => log('fatal:', e.message));
