#!/usr/bin/env node
// kagami-rag-curator.mjs
// Autonomous RAG indexer — Qwen3.5-4B summarizes each reflection into
// a search atom (title + summary + tags) and appends to rag-index.jsonl.
// No review needed — read-only information extraction.
//
// Invocation: node kagami-rag-curator.mjs <reflectId> <content>
// Or via env: RAG_REFLECT_ID=... RAG_CONTENT=... node ...

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RAG_INDEX = resolve(REPO_ROOT, '_SYSTEM/training/data/rag-index.jsonl');
const LOG_PATH  = resolve('/tmp/kagami-rag-curator.log');

const RAPID_MLX_URL   = process.env.RAPID_MLX_URL   || 'http://localhost:8000';
const RAPID_MLX_MODEL = process.env.RAPID_MLX_MODEL || 'qwen3.5-4b';

const log = (...a) => {
  const line = `[rag-curator ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG_PATH, line, { flag: 'a' }); } catch {}
};

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

async function buildSearchAtom(reflectId, content) {
  const prompt = `Summarize this AI assistant interaction into a search atom for future retrieval.

Content:
${content.slice(0, 2000)}

Output ONLY this JSON (no explanation):
{
  "title": "3-8 word title",
  "summary": "2-3 sentence summary of what was discussed and decided",
  "tags": ["tag1","tag2","tag3"],
  "type": "code|design|research|config|debug|planning|other"
}`;

  try {
    const res = await httpPost(`${RAPID_MLX_URL}/v1/chat/completions`, {
      model: RAPID_MLX_MODEL,
      stream: false,
      enable_thinking: false,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    log('atom build error:', e.message);
    return null;
  }
}

async function main() {
  const reflectId = process.argv[2] || process.env.RAG_REFLECT_ID || 'unknown';
  const content   = process.argv[3] || process.env.RAG_CONTENT    || '';

  if (!content.trim()) { log('no content — exit'); return; }

  // Skip if already indexed
  if (existsSync(RAG_INDEX)) {
    const existing = readFileSync(RAG_INDEX, 'utf8');
    if (existing.includes(reflectId)) {
      log(`${reflectId} already indexed — skip`);
      return;
    }
  }

  log(`indexing reflect ${reflectId}`);
  const atom = await buildSearchAtom(reflectId, content);
  if (!atom) { log('no atom produced — exit'); return; }

  const entry = JSON.stringify({
    reflectId,
    indexedAt: new Date().toISOString(),
    contentHash: createHash('sha256').update(content).digest('hex').slice(0, 12),
    ...atom,
  });

  mkdirSync(dirname(RAG_INDEX), { recursive: true });
  writeFileSync(RAG_INDEX, entry + '\n', { flag: 'a' });
  log(`indexed: "${atom.title}" [${atom.tags?.join(', ')}]`);
}

main().catch(e => log('fatal:', e.message));
