#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.claude/projects',
]);

const CAPABILITY_PATTERNS = [
  /SKILL\.md$/i,
  /\.skill$/i,
  /command\.md$/i,
  /agent\.md$/i,
  /TOOL\.md$/i,
  /TOOLS\.md$/i,
  /CAPABILITY\.md$/i,
  /WORKFLOW\.md$/i,
  /EXTENSION_REGISTRY\.yaml$/i,
  /DNA_MANIFEST\.yaml$/i,
];

const PATH_INDICATORS = [
  'skill',
  'tool',
  'agent',
  'command',
  'workflow',
  'pipeline',
  'adapter',
  'plugin',
  'extension',
  'offload',
  'lane',
  'protocol',
  'registry',
  'manifest',
  'superpower',
  'gstack',
];

const KNOWN_ROOTS = [
  '.claude/skills',
  '.claude/commands',
  '.claude/agents',
  '.claude/hooks',
  '.claude/plugins',
  '.claude/mcp-servers',
  '.agents/skills',
  '.gemini/skills',
  'Scripts',
  '01_PROJECTS/superpowers',
];

function shouldExcludeDir(dir) {
  return EXCLUDE_DIRS.has(dir) || dir.startsWith('.');
}

function isCapabilityFile(fileName) {
  return CAPABILITY_PATTERNS.some(pattern => pattern.test(fileName));
}

function hasPathIndicator(filePath) {
  const normalized = filePath.toLowerCase();
  return PATH_INDICATORS.some(indicator => normalized.includes(indicator));
}

function walkDir(dir, results = { files: [], pathHits: [] }) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldExcludeDir(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(repoRoot, fullPath);

      if (entry.isDirectory()) {
        walkDir(fullPath, results);
      } else {
        if (isCapabilityFile(entry.name)) {
          results.files.push(relPath);
        }
        if (hasPathIndicator(relPath)) {
          results.pathHits.push(relPath);
        }
      }
    }
  } catch (e) {
    // silently skip unreadable dirs
  }

  return results;
}

function summarizeRoot(root) {
  const fullPath = path.join(repoRoot, root);
  if (!fs.existsSync(fullPath)) {
    return { root, exists: false, count: 0, samples: [] };
  }

  const results = walkDir(fullPath);
  const samples = results.files.slice(0, 3).map(f => `  ${f}`);

  return {
    root,
    exists: true,
    count: results.files.length,
    samples,
  };
}

function main() {
  console.log('YURI CAPABILITY CENSUS');
  console.log('='.repeat(60));
  console.log();

  // CONTEXT
  console.log('CONTEXT');
  console.log('-'.repeat(60));
  console.log(`Repository Root: ${repoRoot}`);
  console.log(`Scan Date: ${new Date().toISOString()}`);
  console.log(`Excluded Directories: ${Array.from(EXCLUDE_DIRS).join(', ')}`);
  console.log();

  // Walk full repo
  const allResults = walkDir(repoRoot);

  // PATTERN COUNTS
  console.log('PATTERN COUNTS');
  console.log('-'.repeat(60));
  console.log(`Capability Files (SKILL.md, *.skill, etc): ${allResults.files.length}`);
  console.log(`Path-Indicator Hits (skill/tool/agent/...): ${allResults.pathHits.length}`);
  console.log();

  // KEY ROOT SUMMARY
  console.log('KEY ROOT SUMMARY');
  console.log('-'.repeat(60));
  const rootSummaries = KNOWN_ROOTS.map(summarizeRoot);
  for (const summary of rootSummaries) {
    const status = summary.exists ? '✓' : '✗';
    console.log(`${status} ${summary.root}: ${summary.count} items`);
    if (summary.samples.length > 0) {
      summary.samples.forEach(s => console.log(s));
    }
  }
  console.log();

  // GSTACK / SUPERPOWER HITS
  console.log('GSTACK / SUPERPOWER HITS');
  console.log('-'.repeat(60));
  const gstackHits = allResults.pathHits
    .filter(p => /gstack|superpower|01_projects/i.test(p))
    .slice(0, 10);
  if (gstackHits.length > 0) {
    gstackHits.forEach(p => console.log(`  ${p}`));
  } else {
    console.log('  (none found)');
  }
  console.log();

  // TOP LEVEL BUCKETS
  console.log('TOP LEVEL BUCKETS');
  console.log('-'.repeat(60));
  const buckets = {};
  for (const file of allResults.files) {
    const topLevel = file.split('/')[0];
    buckets[topLevel] = (buckets[topLevel] || 0) + 1;
  }
  const sortedBuckets = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [bucket, count] of sortedBuckets) {
    console.log(`  ${bucket}: ${count}`);
  }
  console.log();

  // SAMPLED PATHS
  console.log('SAMPLED PATHS (capability files, capped)');
  console.log('-'.repeat(60));
  const samples = allResults.files.slice(0, 20);
  samples.forEach(p => console.log(`  ${p}`));
  if (allResults.files.length > 20) {
    console.log(`  ... and ${allResults.files.length - 20} more`);
  }
  console.log();

  // NEXT REVIEW CANDIDATES
  console.log('NEXT REVIEW CANDIDATES');
  console.log('-'.repeat(60));
  const gstackReview = allResults.pathHits
    .filter(p => /01_projects|gstack/i.test(p))
    .slice(0, 5);
  const agentReview = allResults.files
    .filter(p => /\.claude\/agents|\.gemini/.test(p))
    .slice(0, 5);

  if (gstackReview.length > 0) {
    console.log('GStack / 01_PROJECTS roots:');
    gstackReview.forEach(p => console.log(`  ${p}`));
  }
  if (agentReview.length > 0) {
    console.log('Agent & Gemini files:');
    agentReview.forEach(p => console.log(`  ${p}`));
  }
  console.log();

  console.log('='.repeat(60));
  console.log(`SUMMARY: ${allResults.files.length} capability surfaces, ${rootSummaries.filter(r => r.exists).length}/${KNOWN_ROOTS.length} roots present`);
  console.log();
}

main();
