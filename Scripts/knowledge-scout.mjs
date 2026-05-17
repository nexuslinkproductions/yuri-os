#!/usr/bin/env node
/**
 * knowledge-scout.mjs — External knowledge ingestion for Musubi
 *
 * Neuron-loop Phase 4. Two channels:
 *   1. GitHub API — trending AI/ML/agent repos (public, no auth required)
 *   2. ArXiv atom feed — latest cs.AI + cs.LG papers
 *
 * Outputs:
 *   nisaba/learning/github-trending.json
 *   nisaba/learning/arxiv-pulse.json
 *
 * CLI:
 *   node Scripts/knowledge-scout.mjs           # full run
 *   node Scripts/knowledge-scout.mjs --dry-run # fetch only, no writes
 *   node Scripts/knowledge-scout.mjs --status  # show last results
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NISABA_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning');

const PATHS = {
  githubTrending: path.join(NISABA_DIR, 'github-trending.json'),
  arxivPulse:     path.join(NISABA_DIR, 'arxiv-pulse.json'),
};

const RELEVANCE_KEYWORDS = [
  'agent', 'llm', 'reasoning', 'memory', 'self-improvement', 'embodied',
  'multimodal', 'agi', 'autonomous', 'orchestrat', 'swarm', 'tool-use',
  'claude', 'gpt', 'deepseek', 'kimi', 'inference', 'fine-tun',
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS  = args.includes('--status');

function isRelevant(text = '') {
  const t = text.toLowerCase();
  return RELEVANCE_KEYWORDS.some(k => t.includes(k));
}

function curlFetch(url) {
  return new Promise((resolve) => {
    const child = spawn('curl', ['-s', '--max-time', '15', url]);
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.on('close', code => resolve(code === 0 ? out : null));
    child.on('error', () => resolve(null));
  });
}

function ensureDir(p) {
  mkdirSync(path.dirname(p), { recursive: true });
}

// ── Status ────────────────────────────────────────────────────────────────────

if (STATUS) {
  const gh = existsSync(PATHS.githubTrending)
    ? JSON.parse(readFileSync(PATHS.githubTrending, 'utf8'))
    : null;
  const ax = existsSync(PATHS.arxivPulse)
    ? JSON.parse(readFileSync(PATHS.arxivPulse, 'utf8'))
    : null;
  console.log('GitHub trending:', gh ? `${gh.repos?.length} repos (${gh.ts?.slice(0,10)})` : 'none');
  console.log('ArXiv pulse:',    ax ? `${ax.papers?.length} papers (${ax.ts?.slice(0,10)})` : 'none');
  process.exit(0);
}

// ── GitHub trending ───────────────────────────────────────────────────────────

async function fetchGitHub() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=stars:>50+pushed:>${sevenDaysAgo}&sort=stars&order=desc&per_page=30`;

  const raw = await curlFetch(url);
  if (!raw) return { repos: [], error: 'fetch_failed', ts: new Date().toISOString() };

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { repos: [], error: 'parse_failed', ts: new Date().toISOString() }; }

  const repos = (parsed.items || [])
    .filter(r => isRelevant(r.name) || isRelevant(r.description) || isRelevant((r.topics || []).join(' ')))
    .slice(0, 15)
    .map(r => ({
      name:        r.full_name,
      description: (r.description || '').slice(0, 120),
      stars:       r.stargazers_count,
      topics:      (r.topics || []).slice(0, 5),
      url:         r.html_url,
      pushed:      r.pushed_at?.slice(0, 10),
    }));

  return { repos, ts: new Date().toISOString(), source: 'github-api' };
}

// ── ArXiv ─────────────────────────────────────────────────────────────────────

async function fetchArxiv() {
  const url = 'https://export.arxiv.org/api/query?search_query=cat:cs.AI+cat:cs.LG&sortBy=lastUpdatedDate&sortOrder=descending&max_results=20';

  const raw = await curlFetch(url);
  if (!raw) return { papers: [], error: 'fetch_failed', ts: new Date().toISOString() };

  // Minimal XML parse — no external deps
  const entries = [...raw.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);

  const papers = entries
    .map(entry => {
      const title   = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 200) || '';
      const id      = (entry.match(/<id>(.*?)<\/id>/) || [])[1]?.trim() || '';
      const updated = (entry.match(/<updated>(.*?)<\/updated>/) || [])[1]?.slice(0, 10) || '';
      return { title, summary, id, updated };
    })
    .filter(p => isRelevant(p.title) || isRelevant(p.summary))
    .slice(0, 10);

  return { papers, ts: new Date().toISOString(), source: 'arxiv-api' };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [github, arxiv] = await Promise.all([fetchGitHub(), fetchArxiv()]);

console.log(`GitHub: ${github.repos?.length ?? 0} relevant repos${github.error ? ` (${github.error})` : ''}`);
console.log(`ArXiv:  ${arxiv.papers?.length ?? 0} relevant papers${arxiv.error ? ` (${arxiv.error})` : ''}`);

if (!DRY_RUN) {
  ensureDir(PATHS.githubTrending);
  writeFileSync(PATHS.githubTrending, JSON.stringify(github, null, 2));
  writeFileSync(PATHS.arxivPulse,     JSON.stringify(arxiv, null, 2));
  console.log('Wrote github-trending.json + arxiv-pulse.json');
}

export { github, arxiv };
