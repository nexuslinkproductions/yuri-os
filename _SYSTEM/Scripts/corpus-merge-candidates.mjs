#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_FILE = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'skills-categorized.jsonl');
const MERGE_OUTPUT = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'merge-candidates.jsonl');
const TOP_SKILLS_OUTPUT = path.join(REPO_ROOT, '_SYSTEM', 'corpus-output', 'top-skills-per-category.jsonl');
const SIMILARITY_THRESHOLD = 0.45;

const WORD_RE = /[\p{L}\p{N}]+/gu;

function ensureOutputDir() {
  fs.mkdirSync(path.dirname(MERGE_OUTPUT), { recursive: true });
}

function tokenizeSet(text = '') {
  return new Set(String(text).toLowerCase().match(WORD_RE) ?? []);
}

function compareTopSkills(left, right) {
  return (
    (right.description?.length ?? 0) - (left.description?.length ?? 0) ||
    (right.triggers?.length ?? 0) - (left.triggers?.length ?? 0) ||
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path)
  );
}

function countSharedTokens(currentTokens, tokenIndex) {
  const counts = new Map();
  for (const token of currentTokens) {
    const priorIndices = tokenIndex.get(token);
    if (!priorIndices) continue;
    for (const priorIndex of priorIndices) {
      counts.set(priorIndex, (counts.get(priorIndex) ?? 0) + 1);
    }
  }
  return counts;
}

function buildTopSkillRecord(category, record, rank) {
  return {
    category,
    rank,
    path: record.path,
    name: record.name,
    description: record.description,
    triggers: record.triggers,
    body_excerpt: record.body_excerpt,
    contributor: record.contributor,
    description_length: record.description?.length ?? 0,
    trigger_count: record.triggers?.length ?? 0,
  };
}

function buildMergeCandidate(category, left, right, similarity) {
  return {
    category,
    skill_a: { name: left.name, path: left.path },
    skill_b: { name: right.name, path: right.path },
    similarity,
    reason: 'description-overlap',
  };
}

function appendJsonLines(filePath, buffer) {
  if (buffer.length === 0) return;
  fs.appendFileSync(filePath, `${buffer.join('\n')}\n`);
  buffer.length = 0;
}

async function readCategorizedSkills(filePath) {
  const groups = new Map();
  const reader = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const skill = JSON.parse(trimmed);
    const category = skill.category || 'uncategorized';
    const enriched = {
      ...skill,
      descriptionTokenSet: tokenizeSet(skill.description),
    };

    if (!groups.has(category)) {
      groups.set(category, []);
    }

    groups.get(category).push(enriched);
  }

  return groups;
}

function findMergeCandidates(records, category, emitCandidate) {
  const ordered = [...records].sort((left, right) => left.path.localeCompare(right.path));
  const tokenIndex = new Map();

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const currentTokens = current.descriptionTokenSet;
    const currentSize = currentTokens.size;

    const sharedCounts = countSharedTokens(currentTokens, tokenIndex);

    for (const [priorIndex, shared] of sharedCounts) {
      const previous = ordered[priorIndex];
      const previousTokens = previous.descriptionTokenSet;
      const previousSize = previousTokens.size;
      const smaller = Math.min(currentSize, previousSize);
      const larger = Math.max(currentSize, previousSize);

      if (!smaller || smaller / larger <= SIMILARITY_THRESHOLD) continue;

      const union = currentSize + previousSize - shared;
      if (!union) continue;

      const similarity = shared / union;
      if (similarity > SIMILARITY_THRESHOLD) {
        emitCandidate(buildMergeCandidate(category, previous, current, similarity));
      }
    }

    for (const token of currentTokens) {
      const bucket = tokenIndex.get(token) ?? [];
      bucket.push(index);
      tokenIndex.set(token, bucket);
    }
  }
}

function getTopSkills(records, category) {
  return [...records]
    .sort(compareTopSkills)
    .slice(0, 3)
    .map((record, rankIndex) => buildTopSkillRecord(category, record, rankIndex + 1));
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  ensureOutputDir();
  fs.writeFileSync(MERGE_OUTPUT, '');
  fs.writeFileSync(TOP_SKILLS_OUTPUT, '');

  const groups = await readCategorizedSkills(INPUT_FILE);
  const categories = [...groups.keys()].sort((left, right) => left.localeCompare(right));
  let mergeCount = 0;
  let topSkillCount = 0;
  let mergeBuffer = [];
  let topBuffer = [];

  for (const category of categories) {
    const records = groups.get(category) ?? [];
    findMergeCandidates(records, category, (candidate) => {
      mergeBuffer.push(JSON.stringify(candidate));
      mergeCount += 1;
      if (mergeBuffer.length >= 1000) {
        appendJsonLines(MERGE_OUTPUT, mergeBuffer);
      }
    });
    const topSkills = getTopSkills(records, category);

    for (const record of topSkills) {
      topBuffer.push(JSON.stringify(record));
      topSkillCount += 1;
    }

    if (topBuffer.length >= 1000) {
      appendJsonLines(TOP_SKILLS_OUTPUT, topBuffer);
    }
  }

  appendJsonLines(MERGE_OUTPUT, mergeBuffer);

  appendJsonLines(TOP_SKILLS_OUTPUT, topBuffer);

  console.error(`[corpus-merge] categories=${categories.length} merge_candidates=${mergeCount} top_skills=${topSkillCount}`);
}

main().catch((error) => {
  console.error(`[corpus-merge] failed: ${error.message}`);
  process.exit(1);
});
