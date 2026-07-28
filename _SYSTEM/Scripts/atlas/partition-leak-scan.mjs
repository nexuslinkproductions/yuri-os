#!/usr/bin/env node
// @capability: partition-leak-scan
// @serves: G-INJECTED-DOCTRINE candidate set | REGISTRY literal set | Channel-C static scan | doctrine vs registry overlap
// @does: regenerable static literal scan of find-40 expects against frozen DOCTRINE packet surfaces and REGISTRY files; writes versioned JSON under _SYSTEM/eval/ablation-evidence/
// @use: after partition class list changes, after packet surfaces change, before recording a partition freeze hash
// @exports: scanSurfaces, scanFind40, writeArtifacts, main
// @tier: atlas-eval
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------------------------
// 2026-07-28: Orion's DOCTRINE (12) and REGISTRY (~28) candidate sets lived only in /tmp.
// Atlas correctly refused to reconstruct them from memory. A freeze hash over /tmp evidence is a
// hash of nothing. This script is the regenerator; the JSON under _SYSTEM/eval/ablation-evidence/ is the
// committed snapshot. Re-run after packet or registry drift; do not hand-edit the JSON.
//
// USAGE
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --json
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --write

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const BENCH = join(REPO, '_SYSTEM', 'eval', 'atlas-benchmark.jsonl');
const OUT_DIR = join(REPO, '_SYSTEM', 'eval', 'ablation-evidence');

/** Frozen packet surfaces for Channel-C / G-INJECTED-DOCTRINE static candidates. */
export const DOCTRINE_SURFACES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursor/rules/sync.mdc',
];

/** Frozen REGISTRY class — backends of Tier-1 arms / need→path indexes. */
export const REGISTRY_SURFACES = [
  '_SYSTEM/capabilities.json',
  'skills/skill-index.json',
];

export function loadFind40(benchPath = BENCH) {
  return readFileSync(benchPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((x) => (x.type || 'find') === 'find')
    .slice(0, 40);
}

export function scanSurfaces(findItems, surfaces, { repoRoot = REPO } = {}) {
  const existing = surfaces.filter((p) => existsSync(join(repoRoot, p)));
  const missing = surfaces.filter((p) => !existsSync(join(repoRoot, p)));
  const candidates = [];
  for (const q of findItems) {
    const expect = String(q.expect[0]).replace(/^\.\//, '');
    const base = basename(expect);
    const evidence = [];
    for (const rel of existing) {
      const text = readFileSync(join(repoRoot, rel), 'utf8');
      const pathHit = text.includes(expect);
      const baseHit = text.includes(base);
      if (!pathHit && !baseHit) continue;
      const key = pathHit ? expect : base;
      const i = text.indexOf(key);
      const lo = Math.max(0, i - 40);
      const hi = Math.min(text.length, i + key.length + 40);
      evidence.push({
        surface: rel,
        match: pathHit ? 'full_path' : 'basename',
        snippet: text.slice(lo, hi).replace(/\s+/g, ' ').trim(),
      });
    }
    if (evidence.length) {
      candidates.push({
        question_id: q.id,
        expect,
        basename: base,
        q: q.q,
        surfaces: evidence.map((e) => e.surface),
        evidence,
      });
    }
  }
  return { surfaces_requested: surfaces, surfaces_present: existing, surfaces_missing: missing, candidates };
}

function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export function buildDoctrineArtifact(findItems, { measuredAt = new Date().toISOString() } = {}) {
  const scan = scanSurfaces(findItems, DOCTRINE_SURFACES);
  const body = {
    schema: 'G-INJECTED-DOCTRINE-candidates/v1',
    gate: 'G-INJECTED-DOCTRINE',
    status: 'CANDIDATE_SET_NOT_CONFIRMED',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: measuredAt,
    packet_surfaces_scanned: DOCTRINE_SURFACES,
    surfaces_present: scan.surfaces_present,
    surfaces_missing: scan.surfaces_missing,
    note: [
      'Static literal scan only. Proven Channel C = intersection with Tier -1 attended set.',
      'Stratify UNION(candidates, Tier-1 attended) out of slot-earning means.',
      'Valid only for packets that include these surfaces byte-identically; re-scan on prompt_hash change.',
      'q035 basename SKILL.md is WEAK (many mentions); keep tagged but do not treat as strong alone.',
    ].join(' '),
    n_find40: findItems.length,
    n_candidates: scan.candidates.length,
    question_ids: scan.candidates.map((c) => c.question_id),
    candidates: scan.candidates,
  };
  body.content_sha256 = sha256Json({
    schema: body.schema,
    surfaces: body.packet_surfaces_scanned,
    question_ids: body.question_ids,
    expects: body.candidates.map((c) => [c.question_id, c.expect, c.surfaces]),
  });
  return body;
}

export function buildRegistryArtifact(findItems, { measuredAt = new Date().toISOString() } = {}) {
  const scan = scanSurfaces(findItems, REGISTRY_SURFACES);
  const body = {
    schema: 'G-REGISTRY-literal-candidates/v1',
    gate: 'G-REGISTRY-HIT',
    status: 'CANDIDATE_SET_STATIC_LITERALS',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: measuredAt,
    registry_surfaces_scanned: REGISTRY_SURFACES,
    surfaces_present: scan.surfaces_present,
    surfaces_missing: scan.surfaces_missing,
    note: [
      'REGISTRY class = backend of a Tier-1 arm / need→path index (Hermes partition freeze 2026-07-28).',
      'capabilities.json entry shape {id,serves,does,mechanism:path} is an answer key, not a human routing map.',
      'Outcome REGISTRY_HIT never counts toward nav-tool slot credit without a tool-vs-own-registry contrast cell.',
      'skill-index.json is belt/subclass (low hit density on find-40).',
    ].join(' '),
    n_find40: findItems.length,
    n_candidates: scan.candidates.length,
    question_ids: scan.candidates.map((c) => c.question_id),
    candidates: scan.candidates,
  };
  body.content_sha256 = sha256Json({
    schema: body.schema,
    surfaces: body.registry_surfaces_scanned,
    question_ids: body.question_ids,
    expects: body.candidates.map((c) => [c.question_id, c.expect, c.surfaces]),
  });
  return body;
}

export function buildOverlapArtifact(doctrine, registry) {
  const d = new Set(doctrine.question_ids);
  const r = new Set(registry.question_ids);
  const intersection = doctrine.question_ids.filter((id) => r.has(id));
  const union = [...new Set([...doctrine.question_ids, ...registry.question_ids])].sort();
  const all = Array.from({ length: 40 }, (_, i) => `q${String(i + 1).padStart(3, '0')}`);
  const neither = all.filter((id) => !d.has(id) && !r.has(id));
  return {
    schema: 'find40-doctrine-registry-overlap/v1',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: new Date().toISOString(),
    doctrine_content_sha256: doctrine.content_sha256,
    registry_content_sha256: registry.content_sha256,
    n_find40: 40,
    doctrine_n: doctrine.n_candidates,
    registry_n: registry.n_candidates,
    intersection: { n: intersection.length, ids: intersection },
    union: { n: union.length, ids: union, share_of_40: union.length / 40 },
    neither: { n: neither.length, ids: neither },
    reading: [
      `Union ${union.length}/40 reachable as literals in DOCTRINE packet surfaces and/or REGISTRY files.`,
      `Intersection ${intersection.length}/40 appear in BOTH.`,
      `Remainder ${neither.length}/40 not in D∪R under this static scan.`,
    ],
  };
}

export function writeArtifacts({ outDir = OUT_DIR } = {}) {
  mkdirSync(outDir, { recursive: true });
  const findItems = loadFind40();
  const measuredAt = new Date().toISOString();
  const doctrine = buildDoctrineArtifact(findItems, { measuredAt });
  const registry = buildRegistryArtifact(findItems, { measuredAt });
  const overlap = buildOverlapArtifact(doctrine, registry);
  const paths = {
    doctrine: join(outDir, 'g-injected-doctrine-candidates.json'),
    registry: join(outDir, 'g-registry-literal-candidates.json'),
    overlap: join(outDir, 'find40-doctrine-registry-overlap.json'),
  };
  writeFileSync(paths.doctrine, JSON.stringify(doctrine, null, 2) + '\n');
  writeFileSync(paths.registry, JSON.stringify(registry, null, 2) + '\n');
  writeFileSync(paths.overlap, JSON.stringify(overlap, null, 2) + '\n');
  return { paths, doctrine, registry, overlap };
}

export function main(argv = process.argv.slice(2)) {
  const findItems = loadFind40();
  const doctrine = buildDoctrineArtifact(findItems);
  const registry = buildRegistryArtifact(findItems);
  const overlap = buildOverlapArtifact(doctrine, registry);
  if (argv.includes('--write')) {
    const { paths } = writeArtifacts();
    console.log(JSON.stringify({ wrote: paths, doctrine_n: doctrine.n_candidates, registry_n: registry.n_candidates, union_n: overlap.union.n }, null, 2));
    return 0;
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ doctrine, registry, overlap }, null, 2));
    return 0;
  }
  console.log(`partition-leak-scan — DOCTRINE ${doctrine.n_candidates}/40  REGISTRY ${registry.n_candidates}/40  UNION ${overlap.union.n}/40`);
  console.log(`  doctrine ids: ${doctrine.question_ids.join(', ')}`);
  console.log(`  registry  n: ${registry.n_candidates}`);
  console.log(`  intersection: ${overlap.intersection.n}  neither: ${overlap.neither.n}`);
  console.log('Re-run with --write to refresh _SYSTEM/eval/ablation-evidence/*.json');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
