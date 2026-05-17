#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'skills-index.jsonl');
const OUTPUT_FILE = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'skills-categorized.jsonl');
const PROGRESS_EVERY = 1000;

const TAXONOMY = [
  ['code-dev', ['code', 'review', 'debug', 'refactor', 'pull request', 'git', 'developer', 'programming', 'api', 'backend', 'frontend', 'typescript', 'python', 'rust', 'deploy']],
  ['security', ['security', 'audit', 'malware', 'scan', 'firewall', 'guard', 'permission', 'injection', 'vulnerability', 'threat']],
  ['marketing-seo', ['seo', 'competitor', 'ad', 'marketing', 'content', 'copywriting', 'landing page', 'campaign', 'sales enablement']],
  ['social-media', ['social', 'twitter', 'instagram', 'linkedin', 'facebook', 'tiktok', 'post', 'schedule', 'publish', 'engagement']],
  ['finance-trading', ['finance', 'budget', 'trading', 'stock', 'crypto', 'forex', 'investment', 'portfolio', 'market', 'macro']],
  ['productivity', ['todo', 'task', 'calendar', 'reminder', 'schedule', 'workflow', 'automation', 'productivity', 'meeting', 'project']],
  ['communication', ['email', 'slack', 'discord', 'telegram', 'whatsapp', 'message', 'chat', 'notification', 'webhook']],
  ['data-research', ['data', 'research', 'analysis', 'query', 'database', 'search', 'scrape', 'report', 'insight', 'news']],
  ['file-workspace', ['file', 'workspace', 'directory', 'folder', 'document', 'organize', 'manage', 'storage', 'backup']],
  ['ai-models', ['model', 'llm', 'prompt', 'ai', 'generate', 'image', 'vision', 'embedding', 'vector', 'fine-tune']],
  ['platform-integration', ['integration', 'api', 'bridge', 'connect', 'sync', 'webhook', 'third-party', 'plugin']],
  ['creative', ['creative', 'write', 'story', 'design', 'image', 'art', 'music', 'video', 'podcast', 'brand']],
  ['agent-system', ['agent', 'skill', 'tool', 'memory', 'update', 'install', 'configure', 'self', 'identity']],
  ['ecommerce', ['shop', 'product', 'order', 'payment', 'inventory', 'price', 'customer', 'store', 'cart']],
  ['health-personal', ['health', 'fitness', 'medical', 'recipe', 'food', 'diet', 'exercise', 'personal', 'life']],
];

const WORD_RE = /[\p{L}\p{N}]+/gu;

function ensureOutputDir() {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
}

function tokenize(text = '') {
  return String(text).toLowerCase().match(WORD_RE) ?? [];
}

function countPhrase(tokens, keywordTokens) {
  if (!tokens.length || !keywordTokens.length || keywordTokens.length > tokens.length) return 0;
  if (keywordTokens.length === 1) {
    const needle = keywordTokens[0];
    let count = 0;
    for (const token of tokens) {
      if (token === needle) count += 1;
    }
    return count;
  }

  let count = 0;
  outer: for (let index = 0; index <= tokens.length - keywordTokens.length; index += 1) {
    for (let offset = 0; offset < keywordTokens.length; offset += 1) {
      if (tokens[index + offset] !== keywordTokens[offset]) continue outer;
    }
    count += 1;
  }
  return count;
}

function makeRule([slug, keywords]) {
  return {
    slug,
    keywords,
    keywordTokens: keywords.map((keyword) => tokenize(keyword)),
  };
}

function scoreSkill(skill, rules) {
  const tokens = tokenize([skill.name, skill.description, skill.body_excerpt].filter(Boolean).join(' '));
  let bestSlug = 'uncategorized';
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const keywordTokens of rule.keywordTokens) {
      score += countPhrase(tokens, keywordTokens);
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlug = rule.slug;
    }
  }

  if (bestScore === 0) {
    return { category: 'uncategorized', score: 0 };
  }

  return { category: bestSlug, score: bestScore };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  ensureOutputDir();
  fs.writeFileSync(OUTPUT_FILE, '');

  const counts = Object.fromEntries([
    ...TAXONOMY.map(([slug]) => [slug, 0]),
    ['uncategorized', 0],
  ]);

  const rules = TAXONOMY.map(makeRule);
  const reader = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let buffer = [];

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const skill = JSON.parse(trimmed);
    const result = scoreSkill(skill, rules);

    counts[result.category] += 1;
    total += 1;

    buffer.push(JSON.stringify({ ...skill, category: result.category, score: result.score }));

    if (buffer.length >= PROGRESS_EVERY) {
      fs.appendFileSync(OUTPUT_FILE, `${buffer.join('\n')}\n`);
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    fs.appendFileSync(OUTPUT_FILE, `${buffer.join('\n')}\n`);
  }

  console.log(JSON.stringify({ total, counts }, null, 2));
}

main().catch((error) => {
  console.error(`[corpus-categorize] failed: ${error.message}`);
  process.exit(1);
});
