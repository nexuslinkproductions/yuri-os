#!/usr/bin/env node
// @capability: partition-leak-scan
// @serves: G-INJECTED-DOCTRINE candidate set | REGISTRY literal set | Channel-C static scan | doctrine vs registry overlap | C_disk vs C_inject channel split
// @does: regenerable static literal scan of benchmark expects against frozen matcher surfaces; writes versioned JSON under _SYSTEM/eval-evidence/. After R2 ruling (2026-07-28): DOCTRINE_C_DISK (full partition class) and DOCTRINE_C_INJECT (packet floor) are separate; the old conflated DOCTRINE key is retired.
// @use: after partition class changes, after packet surfaces change, before recording a partition freeze hash
// @exports: loadMatcherSpec, loadFixtureMetadata, assertFixtureSources, surfaceBuffersFromFixture, scanSurfaces, scanSurfacesFromBuffers, expandDiskSurfaces, buildClassArtifact, buildCInjectArtifact, buildOverlapArtifact, writeArtifacts, writeCInjectArtifacts, main
// @tier: atlas-eval
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------------------------
// 2026-07-28: The first DOCTRINE/REGISTRY candidate sets were generated in a temp worktree and
// could not be reconstructed from memory. The matcher must be frozen BEFORE rerun (R2 ruling). This script implements
// partition-literal-matcher-v1.json exactly — do not change match PREDICATES here without a new
// matcher-spec version committed first. Surface CHANNEL lists may be corrected under the same
// predicate freeze (R2 ruling: under-scoped 12 was CHANNEL-CONFLATED).
//
// USAGE
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --json
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --write
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --c-inject [--fixture PATH] [--write]
//   node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --c-inject --fixture _SYSTEM/eval-evidence/tier-minus-one-fixture.json --write

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const BENCH = join(REPO, '_SYSTEM', 'eval', 'atlas-benchmark.jsonl');
const OUT_DIR = join(REPO, '_SYSTEM', 'eval-evidence');
const MATCHER_PATH = join(OUT_DIR, 'partition-literal-matcher-v1.json');
const MATCHER_V2_PATH = join(OUT_DIR, 'partition-literal-matcher-v2.json');

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

function gitBlobSha(commit, path) {
  try {
    return execFileSync('git', ['rev-parse', `${commit}:${path}`], { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitShowBuffer(commit, path) {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { cwd: REPO, encoding: 'buffer' });
  } catch {
    return null;
  }
}

function gitShowText(commit, path) {
  const buf = gitShowBuffer(commit, path);
  return buf ? buf.toString('utf8') : null;
}

export function loadMatcherSpec(path = MATCHER_PATH) {
  const raw = readFileSync(path, 'utf8');
  const spec = JSON.parse(raw);
  return {
    spec,
    raw,
    content_sha256: sha256Bytes(raw),
    path: path.replace(REPO + '/', '').replace(REPO, ''),
  };
}

export function loadFixtureMetadata(path = join(REPO, '_SYSTEM', 'eval-evidence', 'tier-minus-one-fixture.json')) {
  const raw = readFileSync(path, 'utf8');
  const fixture = JSON.parse(raw);
  if (fixture.schema !== 'tier-minus-one-fixture/v1') {
    throw new Error(`unsupported fixture schema: ${fixture.schema}`);
  }
  return {
    fixture,
    raw,
    content_sha256: sha256Bytes(raw),
    path: path.replace(REPO + '/', '').replace(REPO, ''),
  };
}

export function assertFixtureSources(fixture) {
  const failures = [];
  for (const s of fixture.sources) {
    const blobSha = gitBlobSha(fixture.pinned_commit, s.path);
    if (blobSha !== s.blob_sha) {
      failures.push(`${s.path}: blob sha mismatch (expected ${s.blob_sha}, got ${blobSha})`);
    }
    const buf = gitShowBuffer(fixture.pinned_commit, s.path);
    if (!buf) {
      failures.push(`${s.path}: missing at pinned commit ${fixture.pinned_commit}`);
      continue;
    }
    const contentSha256 = sha256Bytes(buf);
    if (contentSha256 !== s.content_sha256) {
      failures.push(`${s.path}: content sha256 mismatch (expected ${s.content_sha256}, got ${contentSha256})`);
    }
  }
  if (failures.length) throw new Error(`fixture source mismatch:\n${failures.join('\n')}`);
}

export function surfaceBuffersFromFixture(fixture) {
  assertFixtureSources(fixture);
  const buffers = {};
  const sha256 = {};
  for (const s of fixture.sources) {
    const buf = gitShowBuffer(fixture.pinned_commit, s.path);
    if (!buf) throw new Error(`fixture source missing at pinned commit: ${s.path}`);
    buffers[s.path] = { text: buf.toString('utf8'), sha256: sha256Bytes(buf) };
    sha256[s.path] = sha256Bytes(buf);
  }
  return { buffers, sha256 };
}

export function loadFind40(benchPath = BENCH) {
  return readFileSync(benchPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((x) => (x.type || 'find') === 'find')
    .slice(0, 40);
}

export function loadAllQuestions(benchPath = BENCH) {
  return readFileSync(benchPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

/**
 * Expand DOCTRINE_C_DISK members + members_glob into a concrete repo-relative list.
 * Glob is directory listing of `.claude/rules/*.md` only — no recursive **.
 */
export function expandDiskSurfaces(spec, { repoRoot = REPO } = {}) {
  const block = spec.surfaces.DOCTRINE_C_DISK;
  if (!block) throw new Error('matcher missing surfaces.DOCTRINE_C_DISK — channel split required');
  const out = [...(block.members || [])];
  for (const g of block.members_glob || []) {
    if (!g.endsWith('/*.md')) {
      throw new Error(`unsupported members_glob (only dir/*.md): ${g}`);
    }
    const dirRel = g.slice(0, -'/*.md'.length);
    const abs = join(repoRoot, dirRel);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (!name.endsWith('.md')) continue;
      out.push(join(dirRel, name).replace(/\\/g, '/'));
    }
  }
  return [...new Set(out)];
}

export function injectSurfaces(spec) {
  const block = spec.surfaces.DOCTRINE_C_INJECT;
  if (!block) throw new Error('matcher missing surfaces.DOCTRINE_C_INJECT — channel split required');
  return [...(block.members || [])];
}

/**
 * Implements partition-literal-matcher-v2 predicates:
 *   full_path = surfaceText.includes(expect_path)  (case-sensitive)
 *   basename  = surfaceText.includes(basename)       (case-sensitive)
 * Every declared expect path for a question is checked; a hit on any expect makes it a candidate.
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
    const expects = (q.expect || [])
      .map((e) => String(e).replace(/^\.\//, ''))
      .filter(Boolean);
    if (!expects.length) continue;
    const evidence = [];
    for (const expect of expects) {
      const base = basename(expect);
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
          expect,
          surface: rel,
          match: pathHit ? 'full_path' : 'basename',
          snippet: text.slice(lo, hi).replace(/\s+/g, ' ').trim(),
        });
      }
    }
    if (evidence.length) {
      candidates.push({
        question_id: q.id,
        expect: evidence[0].expect,
        basename: basename(evidence[0].expect),
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

/**
 * Same predicates as scanSurfaces, but reads from supplied { text, sha256 } buffers rather than
 * the working tree. Used for C_inject scans against the fixture at a pinned commit.
 * Every declared expect path is checked.
 */
export function scanSurfacesFromBuffers(findItems, surfaceBuffers) {
  const candidates = [];
  for (const q of findItems) {
    const expects = (q.expect || [])
      .map((e) => String(e).replace(/^\.\//, ''))
      .filter(Boolean);
    if (!expects.length) continue;
    const evidence = [];
    for (const expect of expects) {
      const base = basename(expect);
      for (const [rel, { text }] of Object.entries(surfaceBuffers)) {
        const pathHit = text.includes(expect);
        const baseHit = text.includes(base);
        if (!pathHit && !baseHit) continue;
        const key = pathHit ? expect : base;
        const i = text.indexOf(key);
        const lo = Math.max(0, i - 40);
        const hi = Math.min(text.length, i + key.length + 40);
        evidence.push({
          expect,
          surface: rel,
          match: pathHit ? 'full_path' : 'basename',
          snippet: text.slice(lo, hi).replace(/\s+/g, ' ').trim(),
        });
      }
    }
    if (evidence.length) {
      candidates.push({
        question_id: q.id,
        expect: evidence[0].expect,
        basename: basename(evidence[0].expect),
        q: q.q,
        surfaces: [...new Set(evidence.map((e) => e.surface))],
        evidence,
      });
    }
  }
  return { surfaceBuffers, candidates };
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

function contentSha(body) {
  return sha256Json({
    schema: body.schema,
    channel: body.channel,
    matcher_spec_content_sha256: body.matcher_spec_content_sha256,
    question_set_blob_sha1: body.question_set.blob_sha1,
    surfaces: body.surfaces_scanned,
    surface_sha256_at_scan: body.surface_sha256_at_scan,
    question_ids: body.question_ids,
    expects: body.candidates.map((c) => [c.question_id, c.expect, c.surfaces]),
  });
}

export function buildClassArtifact(findItems, {
  schema,
  gate,
  className,
  channel,
  status,
  surfaces,
  matcher,
  measuredAt = new Date().toISOString(),
  extra = {},
} = {}) {
  const scan = scanSurfaces(findItems, surfaces);
  const benchSha = gitHashObject(BENCH);
  const body = {
    schema,
    gate,
    class: className,
    channel,
    status,
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
    ...extra,
  };
  if (className === 'REGISTRY') {
    const capsOnly = scanSurfaces(findItems, ['_SYSTEM/capabilities.json']);
    body.capabilities_json_only_under_same_matcher = {
      n: capsOnly.candidates.length,
      question_ids: capsOnly.candidates.map((c) => c.question_id),
      note: 'Same matcher as REGISTRY class. skill-index adds candidates not already in capabilities.json; it cannot lower this count. Official REGISTRY count is n_candidates above (capabilities ∪ skill-index).',
    };
  }
  body.content_sha256 = contentSha(body);
  return body;
}

export function buildCInjectArtifact(findItems, fixtureMeta, matcher, { measuredAt = new Date().toISOString() } = {}) {
  const { fixture } = fixtureMeta;
  const expectedSurfaces = injectSurfaces(matcher.spec).sort();
  const fixturePaths = fixture.sources.map((s) => s.path).sort();
  if (expectedSurfaces.length !== fixturePaths.length || expectedSurfaces.some((p, i) => p !== fixturePaths[i])) {
    throw new Error(
      `C_INJECT surface mismatch: matcher declares ${JSON.stringify(injectSurfaces(matcher.spec))}, fixture carries ${JSON.stringify(fixture.sources.map((s) => s.path))}`
    );
  }
  const { buffers, sha256 } = surfaceBuffersFromFixture(fixture);
  const scan = scanSurfacesFromBuffers(findItems, buffers);
  const benchSha = gitHashObject(BENCH);
  const body = {
    schema: 'G-CINJECT-DOCTRINE-candidates/v1',
    gate: 'G-CINJECT-DOCTRINE',
    class: 'DOCTRINE_C_INJECT',
    channel: 'C_INJECT',
    status: 'CANDIDATE_SET_NOT_CONFIRMED',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: measuredAt,
    ...matcherBlock(matcher),
    question_set: {
      path: '_SYSTEM/eval/atlas-benchmark.jsonl',
      filter: matcher.spec.question_set?.filter || "(type||'find')==='find'; slice(0,40)",
      blob_sha1: benchSha,
      n: findItems.length,
    },
    fixture: {
      metadata_path: fixtureMeta.path,
      metadata_content_sha256: fixtureMeta.content_sha256,
      packet_path: fixture.packet_path,
      packet_sha256: fixture.packet_sha256,
      pinned_commit: fixture.pinned_commit,
      sources: fixture.sources,
    },
    surfaces_scanned: expectedSurfaces,
    surfaces_present: expectedSurfaces,
    surfaces_missing: [],
    surface_sha256_at_scan: sha256,
    n_find40: findItems.length,
    n_candidates: scan.candidates.length,
    question_ids: scan.candidates.map((c) => c.question_id),
    candidates: scan.candidates,
  };
  body.content_sha256 = contentSha(body);
  return body;
}

export function buildOverlapArtifact(doctrineDisk, registry, matcher, { priorUnionFloor = 33 } = {}) {
  const d = new Set(doctrineDisk.question_ids);
  const r = new Set(registry.question_ids);
  const intersection = doctrineDisk.question_ids.filter((id) => r.has(id));
  const union = [...new Set([...doctrineDisk.question_ids, ...registry.question_ids])].sort();
  const all = findIds(40);
  const neither = all.filter((id) => !d.has(id) && !r.has(id));
  return {
    schema: 'find40-doctrine-registry-overlap/v1',
    regenerator: '_SYSTEM/Scripts/atlas/partition-leak-scan.mjs',
    measured_at: new Date().toISOString(),
    doctrine_channel: 'C_DISK',
    ...matcherBlock(matcher),
    doctrine_content_sha256: doctrineDisk.content_sha256,
    registry_content_sha256: registry.content_sha256,
    n_find40: 40,
    doctrine_n: doctrineDisk.n_candidates,
    registry_n: registry.n_candidates,
    capabilities_json_only_n: registry.capabilities_json_only_under_same_matcher?.n ?? null,
    intersection: { n: intersection.length, ids: intersection },
    union: { n: union.length, ids: union, share_of_40: union.length / 40 },
    neither: { n: neither.length, ids: neither },
    under_scoped_prior: {
      union_n: priorUnionFloor,
      doctrine_n: 12,
      status: 'UNDER_SCOPED_FLOOR',
      note: `Prior union ${priorUnionFloor}/40 used the CHANNEL-CONFLATED 3-surface DOCTRINE scan. Full C_disk DOCTRINE can only add hits (monotone). Cite the C_disk union below, not ${priorUnionFloor}/40.`,
    },
    reading: [
      `C_disk DOCTRINE ${doctrineDisk.n_candidates}/40 · REGISTRY ${registry.n_candidates}/40 · UNION ${union.length}/40 · INTERSECTION ${intersection.length}/40.`,
      `Prior conflated-scan union ${priorUnionFloor}/40 is an UNDER_SCOPED_FLOOR — do not cite as the figure.`,
      `Remainder ${neither.length}/40 not in C_disk-D ∪ R (static-clean ceiling under matcher v1).`,
      'Verbal prior "28" is INCOMPARABLE_PRIOR_RESULT — not cited.',
      'C_inject candidate list is a separate Channel-C artifact; never merge with C_disk for union arithmetic.',
    ],
  };
}

function findIds(n) {
  return Array.from({ length: n }, (_, i) => `q${String(i + 1).padStart(3, '0')}`);
}

function retireConflatedArtifact(priorPath, measuredAt) {
  if (!existsSync(priorPath)) return null;
  const prior = JSON.parse(readFileSync(priorPath, 'utf8'));
  if (prior.status === 'RETIRED_SCAN_SURFACE_MISMATCHED_AND_CHANNEL_CONFLATED') return prior;
  return {
    ...prior,
    status: 'RETIRED_SCAN_SURFACE_MISMATCHED_AND_CHANNEL_CONFLATED',
    retired_at: measuredAt,
    retire_reasons: ['SCAN-SURFACE-MISMATCHED', 'CHANNEL-CONFLATED'],
    retire_authority: 'R2 ruling 2026-07-28 — surface set conflated C_disk and C_inject channels',
    defect: 'Scanned CLAUDE.md + AGENTS.md + sync.mdc. Mixed never-injected adapters (AGENTS/sync) with an incomplete inject set (missed SOUL.md, persona.md, yuri-origin.md transitive includes).',
    superseded_by: {
      c_disk: '_SYSTEM/eval-evidence/g-disk-doctrine-candidates.json',
      c_inject: '_SYSTEM/eval-evidence/g-cinject-doctrine-candidates.json',
    },
    do_not_cite_n_candidates: true,
    preserved_prior_n_candidates: prior.n_candidates,
    preserved_prior_question_ids: prior.question_ids,
  };
}

export function writeArtifacts({ outDir = OUT_DIR } = {}) {
  mkdirSync(outDir, { recursive: true });
  const matcher = loadMatcherSpec();
  const findItems = loadFind40();
  const measuredAt = new Date().toISOString();

  const diskSurfaces = expandDiskSurfaces(matcher.spec);
  const doctrineDisk = buildClassArtifact(findItems, {
    schema: 'G-DISK-DOCTRINE-candidates/v1',
    gate: 'G-DISK-DOCTRINE',
    className: 'DOCTRINE',
    channel: 'C_DISK',
    status: 'CANDIDATE_SET_STATIC_LITERALS',
    surfaces: diskSurfaces,
    matcher,
    measuredAt,
    extra: {
      source_partition: '_SYSTEM/eval-evidence/source-partition-v1.json',
      note: 'Full declared in-repo DOCTRINE class under matcher v1 predicates. Global ~/.claude/CLAUDE.md declared but out of repo scope — counts remain a lower bound if it adds literals.',
    },
  });

  const registry = buildClassArtifact(findItems, {
    schema: 'G-REGISTRY-literal-candidates/v1',
    gate: 'G-REGISTRY-HIT',
    className: 'REGISTRY',
    channel: 'REGISTRY',
    status: 'CANDIDATE_SET_STATIC_LITERALS',
    surfaces: matcher.spec.surfaces.REGISTRY,
    matcher,
    measuredAt,
  });

  const overlap = buildOverlapArtifact(doctrineDisk, registry, matcher);

  const retiredPath = join(outDir, 'g-injected-doctrine-candidates.json');
  const retired = retireConflatedArtifact(retiredPath, measuredAt);

  const paths = {
    doctrine_c_disk: join(outDir, 'g-disk-doctrine-candidates.json'),
    registry: join(outDir, 'g-registry-literal-candidates.json'),
    overlap: join(outDir, 'find40-doctrine-registry-overlap.json'),
    doctrine_retired: retiredPath,
  };
  writeFileSync(paths.doctrine_c_disk, JSON.stringify(doctrineDisk, null, 2) + '\n');
  writeFileSync(paths.registry, JSON.stringify(registry, null, 2) + '\n');
  writeFileSync(paths.overlap, JSON.stringify(overlap, null, 2) + '\n');
  if (retired) writeFileSync(paths.doctrine_retired, JSON.stringify(retired, null, 2) + '\n');

  return { paths, doctrineDisk, registry, overlap, retired, matcher, diskSurfaces };
}

export function writeCInjectArtifacts({ fixturePath = join(REPO, '_SYSTEM', 'eval-evidence', 'tier-minus-one-fixture.json'), outDir = OUT_DIR, matcherPath = MATCHER_V2_PATH } = {}) {
  mkdirSync(outDir, { recursive: true });
  const matcher = loadMatcherSpec(matcherPath);
  const findItems = loadAllQuestions();
  const measuredAt = new Date().toISOString();
  const fixtureMeta = loadFixtureMetadata(fixturePath);
  const artifact = buildCInjectArtifact(findItems, fixtureMeta, matcher, { measuredAt });
  const paths = { c_inject: join(outDir, 'g-cinject-doctrine-candidates.json') };
  writeFileSync(paths.c_inject, JSON.stringify(artifact, null, 2) + '\n');
  return { paths, artifact, matcher, fixtureMeta };
}

export function main(argv = process.argv.slice(2)) {
  if (!existsSync(MATCHER_PATH)) {
    console.error('MISSING frozen matcher spec:', MATCHER_PATH);
    console.error('Commit partition-literal-matcher-v1.json BEFORE running a scan.');
    return 1;
  }

  const cInject = argv.includes('--c-inject');
  if (cInject) {
    const fixtureFlagIndex = argv.indexOf('--fixture');
    const fixturePath = fixtureFlagIndex >= 0 && argv[fixtureFlagIndex + 1]
      ? (isAbsolute(argv[fixtureFlagIndex + 1]) ? argv[fixtureFlagIndex + 1] : join(REPO, argv[fixtureFlagIndex + 1]))
      : join(REPO, '_SYSTEM', 'eval-evidence', 'tier-minus-one-fixture.json');
    if (argv.includes('--write')) {
      const { paths, artifact, matcher, fixtureMeta } = writeCInjectArtifacts({ fixturePath });
      console.log(JSON.stringify({
        wrote: paths,
        channel: 'C_INJECT',
        c_inject_n: artifact.n_candidates,
        fixture_metadata: fixtureMeta.path,
        fixture_packet_sha256: artifact.fixture.packet_sha256,
        pinned_commit: artifact.fixture.pinned_commit,
        matcher_sha: artifact.matcher_spec_content_sha256,
      }, null, 2));
      return 0;
    }
    const matcher = loadMatcherSpec(MATCHER_V2_PATH);
    const findItems = loadAllQuestions();
    const fixtureMeta = loadFixtureMetadata(fixturePath);
    const artifact = buildCInjectArtifact(findItems, fixtureMeta, matcher);
    if (argv.includes('--json')) {
      console.log(JSON.stringify({ c_inject: artifact, fixture: fixtureMeta.fixture }, null, 2));
      return 0;
    }
    console.log(`partition-leak-scan — C_INJECT matcher ${matcher.content_sha256.slice(0, 12)}…`);
    console.log(`  fixture sources: ${artifact.surfaces_scanned.join(', ')}`);
    console.log(`  C_INJECT DOCTRINE ${artifact.n_candidates}/50 (not confirmed)`);
    console.log('Re-run with --write to refresh g-cinject-doctrine-candidates.json.');
    return 0;
  }

  if (argv.includes('--write')) {
    const { paths, doctrineDisk, registry, overlap, diskSurfaces } = writeArtifacts();
    console.log(JSON.stringify({
      wrote: paths,
      channel: 'C_DISK',
      disk_surfaces_n: diskSurfaces.length,
      doctrine_c_disk_n: doctrineDisk.n_candidates,
      registry_n: registry.n_candidates,
      capabilities_only_n: registry.capabilities_json_only_under_same_matcher.n,
      union_n: overlap.union.n,
      inter_n: overlap.intersection.n,
      neither_n: overlap.neither.n,
      matcher_sha: doctrineDisk.matcher_spec_content_sha256,
      note: 'C_inject candidates are a separate Channel-C artifact (g-cinject-doctrine-candidates.json); not written here.',
    }, null, 2));
    return 0;
  }
  const matcher = loadMatcherSpec();
  const findItems = loadFind40();
  const diskSurfaces = expandDiskSurfaces(matcher.spec);
  const doctrineDisk = buildClassArtifact(findItems, {
    schema: 'G-DISK-DOCTRINE-candidates/v1',
    gate: 'G-DISK-DOCTRINE',
    className: 'DOCTRINE',
    channel: 'C_DISK',
    status: 'CANDIDATE_SET_STATIC_LITERALS',
    surfaces: diskSurfaces,
    matcher,
  });
  const registry = buildClassArtifact(findItems, {
    schema: 'G-REGISTRY-literal-candidates/v1',
    gate: 'G-REGISTRY-HIT',
    className: 'REGISTRY',
    channel: 'REGISTRY',
    status: 'CANDIDATE_SET_STATIC_LITERALS',
    surfaces: matcher.spec.surfaces.REGISTRY,
    matcher,
  });
  const overlap = buildOverlapArtifact(doctrineDisk, registry, matcher);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ doctrineDisk, registry, overlap, diskSurfaces }, null, 2));
    return 0;
  }
  console.log(`partition-leak-scan — matcher ${matcher.content_sha256.slice(0, 12)}…`);
  console.log(`  C_DISK DOCTRINE ${doctrineDisk.n_candidates}/40  REGISTRY ${registry.n_candidates}/40  caps-only ${registry.capabilities_json_only_under_same_matcher.n}/40`);
  console.log(`  UNION ${overlap.union.n}/40  INTERSECTION ${overlap.intersection.n}/40  NEITHER ${overlap.neither.n}/40`);
  console.log(`  (prior conflated union 33/40 = UNDER_SCOPED_FLOOR)`);
  console.log('Re-run with --write to refresh eval-evidence JSON. C_inject not written here.');
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
