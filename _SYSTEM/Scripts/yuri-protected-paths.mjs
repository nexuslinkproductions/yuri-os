#!/usr/bin/env node
/**
 * yuri-protected-paths.mjs — canonical protected-path primitives for YURI scripts.
 *
 * This module intentionally promotes the C3-hardened path normalization from
 * regenerative-nexus-guard.mjs: collapse ./ and ../ before prefix matching, fail
 * closed on absolute paths and repo escapes, and realpath-check containment when
 * reading from disk.
 */
import fs from 'node:fs';
import path from 'node:path';

// Canonical protected prefixes for repo-relative path checks. The broad
// `.claude/projects/` prefix covers the narrower yuri-origin runtime subtrees
// (history/state/file-history/worktrees/transcripts) fail-closed.
export const PROTECTED_PREFIXES = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
]);

const toRel = (p) => String(p).split(path.sep).join('/');

/** Collapse ./ and ../ to a forward-slash repo-relative path so a protected-prefix
 *  check cannot be bypassed by a `./.env`-style prefix. */
export function normalizeRel(rel) {
  return toRel(path.normalize(rel)).replace(/^(\.\/)+/, '');
}

export function isProtectedRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return false;
  if (path.isAbsolute(rel)) return true;               // fail-closed: absolute paths are out of bounds
  const n = normalizeRel(rel);
  if (n === '..' || n.startsWith('../')) return true;  // fail-closed: escapes the repo root
  return PROTECTED_PREFIXES.some((p) => n === p.replace(/\/$/, '') || n.startsWith(p));
}

export function assertContained(abs, root, label = 'path') {
  const realRoot = fs.realpathSync(root);
  let real; try { real = fs.realpathSync(abs); } catch { return abs; }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`${label} escapes repo: ${abs}`);
  return real;
}
