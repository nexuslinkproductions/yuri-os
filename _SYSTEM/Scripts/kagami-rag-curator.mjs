#!/usr/bin/env node
// kagami-rag-curator.mjs
// Autonomous RAG indexer — DeepSeek flash summarizes each reflection into
// a search atom (title + summary + tags) and appends to rag-index.jsonl.
//
// Invocation: node kagami-rag-curator.mjs <reflectId> <content>
// Or via env: RAG_REFLECT_ID=... RAG_CONTENT=... node ...

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RAG_INDEX = resolve(process.env.HOME ?? '/Users/marcelspatz', '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/rag-index.jsonl');
const LOG_PATH  = resolve('/tmp/kagami-rag-curator.log');

const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY  || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

const GARBAGE_PATTERNS = ['no commits', 'command not found', 'server unreachable', 'zsh:'];

const log = (...a) => {
  const line = `[rag-curator ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG_PATH, line, { flag: 'a' }); } catch {}
};

function httpsPost(urlStr, bodyObj, headers, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...headers,
    };
    const req = https.request(u, { method: 'POST', headers: reqHeaders, timeout: timeoutMs }, (res) => {
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

async function buildSearchAtom(content) {
  if (!DEEPSEEK_API_KEY) { log('no DEEPSEEK_API_KEY — skip'); return null; }

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
    const res = await httpsPost(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      { model: 'deepseek-chat', stream: false, max_tokens: 256, messages: [{ role: 'user', content: prompt }] },
      { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    );
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    log('atom build error:', e.message);
    return null;
  }
}

async function scoreFaithfulness(content, atom) {
  if (!DEEPSEEK_API_KEY) return 1.0;
  const prompt = 'Rate how faithfully this summary represents the source interaction. Reply with ONLY a number 0.0-1.0.\n\nSource:\n' + content.slice(0, 1500) + '\n\nSummary: ' + atom.summary;
  try {
    const res = await httpsPost(
      DEEPSEEK_BASE_URL + '/chat/completions',
      { model: 'deepseek-chat', stream: false, max_tokens: 10, messages: [{ role: 'user', content: prompt }] },
      { Authorization: 'Bearer ' + DEEPSEEK_API_KEY },
    );
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '0';
    const score = parseFloat(raw);
    return isNaN(score) ? 0 : score;
  } catch { return 0; }
}

async function main() {
  const reflectId = process.argv[2] || process.env.RAG_REFLECT_ID || 'unknown';
  const content   = process.argv[3] || process.env.RAG_CONTENT    || '';

  if (!content.trim()) { log('no content — exit'); return; }

  // Quality gate — extract assistant response (format: "Q: ...\n\nA: ...")
  const aIdx = content.indexOf('\n\nA: ');
  const assistantText = aIdx >= 0 ? content.slice(aIdx + 4) : content;
  if (assistantText.trim().length < 80) {
    log(`skip ${reflectId}: response too short (${assistantText.trim().length} chars)`);
    return;
  }
  const lower = assistantText.toLowerCase();
  for (const pattern of GARBAGE_PATTERNS) {
    if (lower.includes(pattern)) {
      log(`skip ${reflectId}: garbage pattern "${pattern}" detected`);
      return;
    }
  }

  // Skip if already indexed
  if (existsSync(RAG_INDEX)) {
    const existing = readFileSync(RAG_INDEX, 'utf8');
    if (existing.includes(reflectId)) {
      log(`${reflectId} already indexed — skip`);
      return;
    }
  }

  log(`indexing reflect ${reflectId}`);
  const atom = await buildSearchAtom(content);
  if (!atom) { log('no atom produced — exit'); return; }
  const faithfulness = await scoreFaithfulness(content, atom);
  if (faithfulness < 0.75) {
    log('skip ' + reflectId + ': faithfulness ' + faithfulness.toFixed(2) + ' < 0.75');
    return;
  }

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
