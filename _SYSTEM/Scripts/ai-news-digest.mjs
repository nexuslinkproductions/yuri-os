#!/usr/bin/env node
/**
 * ai-news-digest.mjs — AI breakthrough signal extraction for Musubi
 *
 * Neuron-loop Phase 5. Sources:
 *   - Hacker News Algolia API (public, no auth) — high-score AI stories only
 *
 * Output: nisaba/learning/hn-digest.json
 *
 * CLI:
 *   node _SYSTEM/Scripts/ai-news-digest.mjs           # full run
 *   node _SYSTEM/Scripts/ai-news-digest.mjs --dry-run # fetch only, no writes
 *   node _SYSTEM/Scripts/ai-news-digest.mjs --status  # show last digest
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const OUT_PATH  = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'hn-digest.json');

const SIGNAL_QUERIES = ['AI agent', 'AGI', 'LLM', 'reasoning model', 'AI breakthrough'];
const SCORE_THRESHOLD = 150;

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS  = args.includes('--status');

function curlFetch(url) {
  return new Promise((resolve) => {
    const child = spawn('curl', ['-s', '--max-time', '15', url]);
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.on('close', code => resolve(code === 0 ? out : null));
    child.on('error', () => resolve(null));
  });
}

if (STATUS) {
  if (!existsSync(OUT_PATH)) { console.log('No digest yet.'); process.exit(0); }
  const d = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  console.log(`HN digest (${d.ts?.slice(0,10)}): ${d.stories?.length} stories`);
  (d.stories || []).slice(0, 5).forEach(s => console.log(`  [${s.score}] ${s.title}`));
  process.exit(0);
}

async function fetchQuery(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=10`;
  const raw = await curlFetch(url);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return (data.hits || [])
      .filter(h => (h.points || 0) >= SCORE_THRESHOLD)
      .map(h => ({
        title:     h.title,
        score:     h.points,
        url:       h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author:    h.author,
        created:   h.created_at?.slice(0, 10),
        query,
      }));
  } catch { return []; }
}

// Fan out all queries in parallel
const allResults = await Promise.all(SIGNAL_QUERIES.map(fetchQuery));
const flat = allResults.flat();

// Deduplicate by title
const seen = new Set();
const stories = flat
  .filter(s => { const k = s.title?.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => b.score - a.score)
  .slice(0, 20);

const digest = {
  ts:       new Date().toISOString(),
  stories,
  queries:  SIGNAL_QUERIES,
  threshold: SCORE_THRESHOLD,
};

console.log(`HN signal: ${stories.length} stories above score ${SCORE_THRESHOLD}`);
if (stories.length > 0) {
  console.log(`  Top: [${stories[0].score}] ${stories[0].title}`);
}

if (!DRY_RUN) {
  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(digest, null, 2));
  console.log('Wrote hn-digest.json');
}

export { digest };
