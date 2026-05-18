#!/usr/bin/env node
// kagami-memory-consolidator.mjs
// Daily local-model task (06:00) — Qwen3.5-4B reviews all memory files and:
//   1. Flags stale/contradicted memories (>30 days without validation)
//   2. Identifies near-duplicates
//   3. Writes a consolidation report to _SYSTEM/training/state/memory-health.json
//   4. Appends action items to /tmp/kagami-memory-consolidator.log
// Does NOT auto-delete. Flags for downstream approval pipeline.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
const MEMORY_DIR = resolve(process.env.HOME, '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory');
const MEMORY_IDX = resolve(MEMORY_DIR, 'MEMORY.md');
const STATE_DIR  = resolve(REPO_ROOT, '_SYSTEM/training/state');
const REPORT     = resolve(STATE_DIR, 'memory-health.json');
const LOG        = '/tmp/kagami-memory-consolidator.log';

const RAPID_MLX_URL   = process.env.RAPID_MLX_URL   || 'http://localhost:8000';
const RAPID_MLX_MODEL = process.env.RAPID_MLX_MODEL || 'qwen3.5-4b';
const STALE_DAYS      = parseInt(process.env.MEMORY_STALE_DAYS || '30', 10);

const log = (...a) => {
  const line = `[mem-consolidator ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG, line, { flag: 'a' }); } catch {}
};

function httpPost(urlStr, bodyObj, timeoutMs = 45000) {
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
    req.write(body); req.end();
  });
}

function readMemoryFiles() {
  if (!existsSync(MEMORY_DIR)) return [];
  const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
  return files.map(f => {
    const path = resolve(MEMORY_DIR, f);
    const content = readFileSync(path, 'utf8');
    const stat = statSync(path);
    const agedays = (Date.now() - stat.mtimeMs) / 86400000;
    return { filename: f, content: content.slice(0, 600), agedays: Math.round(agedays) };
  });
}

async function analyzeMemories(memories) {
  if (!memories.length) return { stale: [], duplicates: [], total: 0 };

  const memList = memories.map((m, i) =>
    `[${i}] ${m.filename} (${m.agedays}d old):\n${m.content.slice(0, 300)}`
  ).join('\n\n---\n\n');

  const prompt = `You are a memory health analyzer. Review these ${memories.length} memory files and identify issues.

${memList}

Identify:
1. STALE: memories older than ${STALE_DAYS} days that likely need validation
2. DUPLICATE: memories that cover the same topic and should be merged
3. CONTRADICTION: memories that conflict with each other

Output ONLY this JSON:
{
  "stale": [{"filename": "...", "reason": "..."}],
  "duplicates": [{"files": ["...", "..."], "reason": "..."}],
  "contradictions": [{"files": ["...", "..."], "conflict": "..."}],
  "health_score": 0-100
}`;

  try {
    const res = await httpPost(`${RAPID_MLX_URL}/v1/chat/completions`, {
      model: RAPID_MLX_MODEL,
      stream: false,
      enable_thinking: false,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { stale: [], duplicates: [], contradictions: [], health_score: 100 };
    return JSON.parse(match[0]);
  } catch (e) {
    log('analyze error:', e.message);
    return { stale: [], duplicates: [], contradictions: [], health_score: 100, error: e.message };
  }
}

async function main() {
  log('starting memory consolidation run');

  // Check Rapid-MLX available
  try {
    const check = await new Promise((res, rej) => {
      const req = http.request(new URL('/v1/models', RAPID_MLX_URL), { timeout: 2000 }, r => {
        res(r.statusCode === 200);
        r.resume();
      });
      req.on('error', () => res(false));
      req.on('timeout', () => { req.destroy(); res(false); });
      req.end();
    });
    if (!check) { log('rapid-mlx not available — skip'); return; }
  } catch { log('rapid-mlx check failed — skip'); return; }

  const memories = readMemoryFiles();
  log(`found ${memories.length} memory files`);

  if (!memories.length) { log('no memories to consolidate'); return; }

  const analysis = await analyzeMemories(memories);
  log(`health_score=${analysis.health_score} stale=${analysis.stale?.length ?? 0} dupes=${analysis.duplicates?.length ?? 0} contradictions=${analysis.contradictions?.length ?? 0}`);

  // Write report
  mkdirSync(STATE_DIR, { recursive: true });
  const report = {
    analyzedAt: new Date().toISOString(),
    totalFiles: memories.length,
    ...analysis,
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log(`report written → ${REPORT}`);

  // Log action items
  for (const s of analysis.stale ?? []) {
    log(`STALE: ${s.filename} — ${s.reason}`);
  }
  for (const d of analysis.duplicates ?? []) {
    log(`DUPLICATE: ${d.files?.join(' + ')} — ${d.reason}`);
  }
  for (const c of analysis.contradictions ?? []) {
    log(`CONFLICT: ${c.files?.join(' vs ')} — ${c.conflict}`);
  }
}

main().catch(e => log('fatal:', e.message));
