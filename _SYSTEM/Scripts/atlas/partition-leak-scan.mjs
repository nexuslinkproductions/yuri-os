#!/usr/bin/env node
// @capability: partition-leak-scan
// @serves: G-INJECTED-DOCTRINE candidate set | REGISTRY literal set | Channel-C static scan | doctrine vs registry overlap
// @does: regenerable static literal scan of find-40 expects against frozen DOCTRINE packet surfaces and REGISTRY files under partition-literal-matcher-v1; writes versioned JSON under _SYSTEM/eval/ablation-evidence/
// @use: after partition class list changes, after packet surfaces change, before recording a partition freeze hash
// @exports: loadMatcherSpec, scanSurfaces, writeArtifacts, main
// @tier: atlas-eval
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------------------------
// 2026-07-28: Orion's DOCTRINE/REGISTRY candidate sets lived only in /tmp. Atlas refused to
// reconstruct from memory. Matcher must be frozen BEFORE rerun (Hermes). This script implements
// partition-literal-matcher-v1.json exactly — do not change match rules here without a new
// matcher-spec version committed first.
//
// USAGE
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --json
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --write

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const BENCH = join(REPO, '_SYSTEM', 'eval', 'atlas-benchmark.jsonl');
const OUT_DIR = join(REPO, '_SYSTEM', 'eval', 'ablation-evidence');
const MATCHER_PATH = join(OUT_DIR, 'partition-literal-matcher-v1.json');

function sha256Bytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
function sha256Json(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}
function gitHashObject(absPath) {
  try {
    return execFileSync('git', ['hash-object', absPath], { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function loadMatcherSpec(path = MATCHER_PATH) {
  const raw = readFileSync(path, 'utf8');
  const spec = JSON.parse(raw);
  return {
    spec,
    raw,
    content_sha256: sha256Bytes(raw),
    path: '_SYSTEM/eval/ablation-evidence/partition-literal-matcher-v1.json',
  };
}

export function loadFind40(benchPath = BENCH) {
  return readFileSync(benchPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((x) => (x.type || 'find') === 'find')
    .slice(0, 40);
}

/**
 * Implements partition-literal-matcher-v1 predicates only:
 *   full_path = surfaceText.includes(expect_path)  (case-sensitive)
 *   basename  = surfaceText.includes(basename)     (case-sensitive)
 * Stem / casefold / word-boundary are disabled by the frozen spec.
 */
export function scanSurfaces(findItems, surfaces, { repoRoot = REPO } = {}) {
  const existing = surfaces.filter((p) => existsSync(join(repoRoot, p)));
  const missing = surfaces.filter((p) => !existsSync(join(repoRoot, p)));
  const surface_sha256 = {};
  const surface_text = {};
  for (const rel of existing) {
    const buf = readFileSync(join(repoRoot, rel));
    surface_sha256[rel] = sha256Bytes(buf);
    surface_text[rel] = buf.toString('utf8');
  }
  const candidates = [];
  for (const q of findItems) {
    const expect = String(q.expect[0]).replace(/^\.\//, '');
    const base = basename(expect);
    const evidence = [];
    for (const rel of existing) {
      const text = surface_text[rel];
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
        surfaces: [...new Set(evidence.map((e) => e.surface))],
        evidence,
      });
    }
  }
  return {
    surfaces_requested: surfaces,
    surfaces_present: existing,
    surfaces_missing: missing,
    surface_sha256,
    candidates,
  };
}

function matcherBlock(matcher) {
  return {
    matcher_spec_schema: matcher.spec.schema,
    matcher_spec_path: matcher.path,
    matcher_spec_content_sha256: matcher.content_sha256,
    match_predicates: ['full_path', 'basename'],
    match_disabled: matcher.spec.match_rules.explicitly_disabled,
    incomparable_prior: matcher.spec.incomparable_prior,
  };
}

export function buildClassArtifact(findItems, className, surfaces, matcher, { measuredAt = new Date().toISOString() } = {}) {
  const scan = scanSurfaces(findItems, surfaces);
  const benchSha = gitHashObject(BENCH);
  const body = {
    schema: className === 'DOCTRINE' ? 'G-INJECTED-DOCTRINE-candidates/v1' : 'G-REGISTRY-literal-candidates/v1',
    gate: className === 'DOCTRINE' ? 'G-INJECTED-DOCTRINE' : 'G-REGISTRY-HIT',
    class: className,
    status: className === 'DOCTRINE' ? 'CANDIDATE_SET_NOT_CONFIRMED' : 'CANDIDATE_SET_STATIC_LITERALS',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: measuredAt,
    ...matcherBlock(matcher),
    question_set: {
      path: '_SYSTEM/eval/atlas-benchmark.jsonl',
      filter: "(type||'find')==='find'; slice(0,40)",
      blob_sha1: benchSha,
      n: findItems.length,
    },
    surfaces_scanned: surfaces,
    surfaces_present: scan.surfaces_present,
    surfaces_missing: scan.surfaces_missing,
    surface_sha256_at_scan: scan.surface_sha256,
    n_find40: findItems.length,
    n_candidates: scan.candidates.length,
    question_ids: scan.candidates.map((c) => c.question_id),
    candidates: scan.candidates,
  };
  if (className === 'REGISTRY') {
    // Capabilities-only under THE SAME frozen matcher — for audit, not a second official count.
    const capsOnly = scanSurfaces(findItems, ['_SYSTEM/capabilities.json']);
    body.capabilities_json_only_under_same_matcher = {
      n: capsOnly.candidates.length,
      question_ids: capsOnly.candidates.map((c) => c.question_id),
      note: 'Same matcher as REGISTRY class. skill-index adds candidates not already in capabilities.json; it cannot lower this count. Official REGISTRY count is n_candidates above (capabilities ∪ skill-index).',
    };
  }
  body.content_sha256 = sha256Json({
    schema: body.schema,
    matcher_spec_content_sha256: body.matcher_spec_content_sha256,
    question_set_blob_sha1: body.question_set.blob_sha1,
    surfaces: body.surfaces_scanned,
    surface_sha256_at_scan: body.surface_sha256_at_scan,
    question_ids: body.question_ids,
    expects: body.candidates.map((c) => [c.question_id, c.expect, c.surfaces]),
  });
  return body;
}

export function buildOverlapArtifact(doctrine, registry, matcher) {
  const d = new Set(doctrine.question_ids);
  const r = new Set(registry.question_ids);
  const intersection = doctrine.question_ids.filter((id) => r.has(id));
  const union = [...new Set([...doctrine.question_ids, ...registry.question_ids])].sort();
  const all = findIds(40);
  const neither = all.filter((id) => !d.has(id) && !r.has(id));
  return {
    schema: 'find40-doctrine-registry-overlap/v1',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: new Date().toISOString(),
    ...matcherBlock(matcher),
    doctrine_content_sha256: doctrine.content_sha256,
    registry_content_sha256: registry.content_sha256,
    n_find40: 40,
    doctrine_n: doctrine.n_candidates,
    registry_n: registry.n_candidates,
    capabilities_json_only_n: registry.capabilities_json_only_under_same_matcher?.n ?? null,
    intersection: { n: intersection.length, ids: intersection },
    union: { n: union.length, ids: union, share_of_40: union.length / 40 },
    neither: { n: neither.length, ids: neither },
    reading: [
      `Union ${union.length}/40 reachable as literals under frozen matcher v1.`,
      `Intersection ${intersection.length}/40 appear in BOTH classes.`,
      `capabilities.json alone under same matcher: ${registry.capabilities_json_only_under_same_matcher?.n ?? '?'}/40.`,
      `Remainder ${neither.length}/40 not in D∪R.`,
      'Verbal prior "28" is INCOMPARABLE_PRIOR_RESULT — not cited.',
    ],
  };
}

function findIds(n) {
  return Array.from({ length: n }, (_, i) => `q${String(i + 1).padStart(3, '0')}`);
}

export function writeArtifacts({ outDir = OUT_DIR } = {}) {
  mkdirSync(outDir, { recursive: true });
  const matcher = loadMatcherSpec();
  const findItems = loadFind40();
  const measuredAt = new Date().toISOString();
  const doctrine = buildClassArtifact(findItems, 'DOCTRINE', matcher.spec.surfaces.DOCTRINE, matcher, { measuredAt });
  const registry = buildClassArtifact(findItems, 'REGISTRY', matcher.spec.surfaces.REGISTRY, matcher, { measuredAt });
  const overlap = buildOverlapArtifact(doctrine, registry, matcher);
  const paths = {
    doctrine: join(outDir, 'g-injected-doctrine-candidates.json'),
    registry: join(outDir, 'g-registry-literal-candidates.json'),
    overlap: join(outDir, 'find40-doctrine-registry-overlap.json'),
  };
  writeFileSync(paths.doctrine, JSON.stringify(doctrine, null, 2) + '\n');
  writeFileSync(paths.registry, JSON.stringify(registry, null, 2) + '\n');
  writeFileSync(paths.overlap, JSON.stringify(overlap, null, 2) + '\n');
  return { paths, doctrine, registry, overlap, matcher };
}

export function main(argv = process.argv.slice(2)) {
  if (!existsSync(MATCHER_PATH)) {
    console.error('MISSING frozen matcher spec:', MATCHER_PATH);
    console.error('Commit partition-literal-matcher-v1.json BEFORE running a scan.');
    return 1;
  }
  if (argv.includes('--write')) {
    const { paths, doctrine, registry, overlap } = writeArtifacts();
    console.log(JSON.stringify({
      wrote: paths,
      doctrine_n: doctrine.n_candidates,
      registry_n: registry.n_candidates,
      capabilities_only_n: registry.capabilities_json_only_under_same_matcher.n,
      union_n: overlap.union.n,
      inter_n: overlap.intersection.n,
      matcher_sha: doctrine.matcher_spec_content_sha256,
    }, null, 2));
    return 0;
  }
  const matcher = loadMatcherSpec();
  const findItems = loadFind40();
  const doctrine = buildClassArtifact(findItems, 'DOCTRINE', matcher.spec.surfaces.DOCTRINE, matcher);
  const registry = buildClassArtifact(findItems, 'REGISTRY', matcher.spec.surfaces.REGISTRY, matcher);
  const overlap = buildOverlapArtifact(doctrine, registry, matcher);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ doctrine, registry, overlap }, null, 2));
    return 0;
  }
  console.log(`partition-leak-scan — matcher ${matcher.content_sha256.slice(0, 12)}…`);
  console.log(`  DOCTRINE ${doctrine.n_candidates}/40  REGISTRY ${registry.n_candidates}/40  caps-only ${registry.capabilities_json_only_under_same_matcher.n}/40`);
  console.log(`  UNION ${overlap.union.n}/40  INTERSECTION ${overlap.intersection.n}/40`);
  console.log('Re-run with --write to refresh ablation-evidence JSON.');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
