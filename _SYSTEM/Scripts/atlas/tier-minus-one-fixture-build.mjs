#!/usr/bin/env node
// @capability: tier-minus-one-fixture-builder
// @serves: frozen doctrine fixture | reproducible packet | C_inject surface verification
// @does: resolves the @-include graph of CLAUDE.md at a pinned commit, records the ordered
//         source list and per-file blob hashes, concatenates the file bytes with a deterministic
//         delimiter, and writes a fixture metadata JSON plus packet. Re-runs reproducibly.
// @use: run to produce `_SYSTEM/eval-evidence/tier-minus-one-fixture.{json,packet}`;
//       rerun with --verify to check packet integrity against the committed metadata.
// @exports: resolveIncludes, buildFixture, verifyFixture, main
//
// This fixture answers the need for a C_inject (injected doctrine) surface set that can be
// evaluated against the navigation benchmark without relying on the live working tree.
// The packet is assembled from git objects at the pinned commit, so the metadata is the only
// state needed to regenerate the exact bytes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_OUT_DIR = '_SYSTEM/eval-evidence';
const FIXTURE_NAME = 'tier-minus-one-fixture';
const SCHEMA = 'tier-minus-one-fixture/v1';
const ENTRY_FILE = 'CLAUDE.md';
// Delimiter is placed BEFORE every file except the first entry. The pattern is recorded
// verbatim in metadata; {path} and {commit} are substituted per file when assembling.
const DELIMITER_PATTERN = '\n\n=== TIER-MINUS-ONE-FIXTURE DELIMITER ===\npath: {path}\ncommit: {commit}\n===\n\n';

function runGit(args, { cwd = REPO_ROOT, encoding = 'utf8' } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: encoding === 'buffer' ? undefined : encoding, maxBuffer: 100 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = r.stderr ? (typeof r.stderr === 'string' ? r.stderr : r.stderr.toString('utf8')) : '';
    throw new Error(`git ${args.join(' ')} failed: ${err}`);
  }
  return r.stdout;
}

function pinCommit(commitish) {
  return runGit(['rev-parse', '--verify', `${commitish}^{commit}`]).trim();
}

function blobShaAt(commit, path) {
  return runGit(['rev-parse', `${commit}:${path}`]).trim();
}

function bytesAtCommit(commit, path) {
  return runGit(['show', `${commit}:${path}`], { encoding: 'buffer' });
}

function textAtCommit(commit, path) {
  return runGit(['show', `${commit}:${path}`]).trimEnd();
}

// Depth-first pre-order traversal of the @-include graph. Each include is a standalone line
// matching `^@<path>$`. Cycles are a hard error. A file is only emitted once, at its first
// visit.
export function resolveIncludes(commit, rootPath = ENTRY_FILE, _seen = new Set()) {
  const order = [];
  const visiting = new Set();
  const stack = [{ path: rootPath, state: 'enter' }];
  while (stack.length) {
    const frame = stack.pop();
    const p = frame.path;
    if (frame.state === 'exit') {
      visiting.delete(p);
      continue;
    }
    if (_seen.has(p)) continue;
    if (visiting.has(p)) throw new Error(`@include cycle detected at ${p}`);
    visiting.add(p);
    _seen.add(p);
    order.push(p);

    const content = textAtCommit(commit, p);
    const includes = [];
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      const m = line.match(/^@(\S+)$/);
      if (m) includes.push(m[1]);
    }
    // Push exit marker first so it runs after all descendants.
    stack.push({ path: p, state: 'exit' });
    // Push children in reverse so the first listed include is popped first.
    for (let i = includes.length - 1; i >= 0; i--) {
      stack.push({ path: includes[i], state: 'enter' });
    }
  }
  return order;
}

function makeDelimiter(path, commit) {
  return DELIMITER_PATTERN.replace(/{path}/g, path).replace(/{commit}/g, commit);
}

export function buildFixture({ commitish = 'origin/main', outDir = DEFAULT_OUT_DIR, write = true } = {}) {
  const commit = pinCommit(commitish);
  const sources = resolveIncludes(commit);
  const metadata = {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    repo: 'YURI-OS-MUSUBI',
    pinned_commit: commit,
    entry: ENTRY_FILE,
    order: 'depth-first pre-order of @-include graph, deduplicated, cycles hard-error',
    delimiter_pattern: DELIMITER_PATTERN,
    sources: sources.map((p) => {
      const buf = bytesAtCommit(commit, p);
      return {
        path: p,
        blob_sha: blobShaAt(commit, p),
        content_sha256: createHash('sha256').update(buf).digest('hex'),
        size: buf.length,
      };
    }),
    packet_path: join(outDir, `${FIXTURE_NAME}.packet`),
    packet_sha256: null,
    regenerator: '_SYSTEM/Scripts/atlas/tier-minus-one-fixture-build.mjs',
  };

  const pieces = [];
  for (const p of sources) {
    if (pieces.length > 0) pieces.push(Buffer.from(makeDelimiter(p, commit), 'utf8'));
    pieces.push(bytesAtCommit(commit, p));
  }
  const packet = Buffer.concat(pieces);
  metadata.packet_sha256 = createHash('sha256').update(packet).digest('hex');

  if (write) {
    const outPath = resolve(REPO_ROOT, outDir);
    mkdirSync(outPath, { recursive: true });
    const jsonPath = join(outPath, `${FIXTURE_NAME}.json`);
    const packetPath = join(outPath, `${FIXTURE_NAME}.packet`);
    writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf8');
    writeFileSync(packetPath, packet);
    return { metadata, packetPath, jsonPath, packet };
  }
  return { metadata, packet };
}

export function verifyFixture(metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.schema !== SCHEMA) throw new Error(`unsupported schema ${metadata.schema}`);
  const commit = metadata.pinned_commit;
  const sources = metadata.sources.map((s) => s.path);
  const pieces = [];
  for (const p of sources) {
    if (pieces.length > 0) pieces.push(Buffer.from(makeDelimiter(p, commit), 'utf8'));
    pieces.push(bytesAtCommit(commit, p));
  }
  const packet = Buffer.concat(pieces);
  const sha256 = createHash('sha256').update(packet).digest('hex');
  if (sha256 !== metadata.packet_sha256) {
    throw new Error(`packet sha256 mismatch: computed ${sha256}, metadata ${metadata.packet_sha256}`);
  }
  for (const s of metadata.sources) {
    const actual = blobShaAt(commit, s.path);
    if (actual !== s.blob_sha) {
      throw new Error(`blob sha mismatch for ${s.path}: computed ${actual}, metadata ${s.blob_sha}`);
    }
  }
  return { ok: true, packet_sha256: sha256, byteLength: packet.length, sourceCount: sources.length };
}

function parseArgs(argv) {
  const args = { write: true, verify: false, verifyPath: null, commit: 'origin/main', outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify') {
      args.verify = true;
      args.verifyPath = argv[++i];
    } else if (a === '--no-write') args.write = false;
    else if (a === '--commit') args.commit = argv[++i];
    else if (a === '--outdir') args.outDir = argv[++i];
    else if (a === '--help') {
      console.log('usage: tier-minus-one-fixture-build.mjs [--commit REF] [--outdir DIR] [--no-write] [--verify METADATA_JSON]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.verify) {
    const metadataPath = resolve(REPO_ROOT, args.verifyPath);
    const v = verifyFixture(metadataPath);
    console.log(JSON.stringify({ status: 'verified', ...v }, null, 2));
    return 0;
  }
  const r = buildFixture({ commitish: args.commit, outDir: args.outDir, write: args.write });
  if (args.write) {
    console.log(JSON.stringify({
      status: 'written',
      metadata: r.jsonPath,
      packet: r.packetPath,
      pinned_commit: r.metadata.pinned_commit,
      packet_sha256: r.metadata.packet_sha256,
      sources: r.metadata.sources.length,
      source_paths: r.metadata.sources.map((s) => s.path),
    }, null, 2));
  } else {
    console.log(JSON.stringify(r.metadata, null, 2));
  }
  return 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    process.exit(main() || 0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
