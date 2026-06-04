#!/usr/bin/env node
/**
 * YURI central path resolver (ESM source of truth).
 *
 * Portability keystone (T3). Every write-surface path in YURI must resolve
 * through exactly ONE place so the moat acceptance criterion — zero writes
 * outside the configured workspace — is reachable, and so repo-root is derived
 * once (fixing the historical 2-vs-3 `..` inconsistency across scripts).
 *
 * Resolution order for every path, mirroring the yuri-user.mjs idiom:
 *   1. explicit environment variable (operator/CI override) — wins
 *   2. optional `yuri.config.json` field at repo root (install-time config)
 *   3. deterministic in-repo / per-machine default
 *
 * Hard rules:
 *   - NEVER throws. A junk env value or a malformed config file must fall back
 *     to the deterministic default, never crash a caller path computation.
 *   - NO file writes. This module computes paths only; it never creates dirs.
 *   - NO baked machine-id literals. claudeMemoryDir() derives the project slug
 *     from cwd at runtime (the Claude Code convention), never a hardcoded
 *     `-Users-<operator>-` string, so the resolver is portable across machines.
 *
 * See full-system-sweep-detail-2026-06-04.md PORT-01 and the proven
 * yuri-user.mjs single-resolver pattern this is modeled on.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Derive repo root ONCE. This file lives at <repo>/_SYSTEM/Scripts/yuri-paths.mjs,
// so the repo root is two segments up. This is the single authoritative derivation.
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const _REPO_ROOT = path.resolve(_HERE, '..', '..');
const CONFIG_FILE = path.join(_REPO_ROOT, 'yuri.config.json');

/**
 * Default injectable config reader. Reads the optional install-time
 * `yuri.config.json` at repo root. Returns a plain object on success, or null
 * on any failure (missing file, unreadable, malformed JSON, non-object root).
 * Never throws.
 */
function defaultConfigReader() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // Guard against JSON that parses to a non-object (e.g. "null", "42", "[]")
    // so callers can safely read named fields without a type check each time.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}

/** True only for a usable non-empty string. Gate for env + config values. */
function usableString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Containment / traversal guard for an operator-supplied override candidate.
 *
 * The override surface (env var / yuri.config.json field) is install-time
 * portability config: an operator/CI may legitimately point a write surface at
 * any absolute install location (e.g. /opt/yuri, /var/lib/yuri). What it may
 * NEVER do is escape via traversal or inject a truncating NUL byte. A hostile
 * or misconfigured env value was previously returned RAW, so
 * `/…/_SYSTEM/state/../../../../etc` resolved to /etc and a `…\0/../evil`
 * value smuggled a NUL into downstream syscalls.
 *
 * Fail-CLOSED policy (preserves the module's "NEVER throws" hard contract):
 *   - reject any NUL byte (no legitimate path contains one)
 *   - reject any `..` traversal segment (a clean absolute install path never
 *     needs one; its presence IS the escape vector)
 *   - require the override to be (or normalize to) an ABSOLUTE path; a relative
 *     override is ambiguous and was itself an escape vector
 * On rejection return null so the resolver falls back to the deterministic
 * in-base default — exactly the fail-safe path junk env/config already takes.
 *
 * @param {string} raw trimmed candidate string (already usableString-checked)
 * @returns {string|null} the safe absolute path, or null to reject + fall back
 */
function sanitizeOverride(raw) {
  // NUL byte: pure injection / truncation attack — never a real path.
  if (raw.indexOf('\x00') !== -1) return null;
  // Traversal: reject `..` as a whole path segment (posix or win32 separators).
  // Splitting on both separators catches `a/../b`, `..`, `a\..\b`, and `../x`.
  const segments = raw.split(/[/\\]+/);
  if (segments.some((seg) => seg === '..')) return null;
  // Require an absolute override. A relative value is ambiguous (cwd-relative)
  // and was a live escape vector; only accept paths that are already absolute.
  if (!path.isAbsolute(raw)) return null;
  // Normalize (collapses `.` and duplicate separators) without resolving against
  // cwd — input is already absolute and traversal-free, so this only canonicalizes.
  return path.normalize(raw);
}

/**
 * Core resolver: env var -> config field -> deterministic default.
 * Each candidate is validated as a usable string AND passed through the
 * containment guard; junk (empty, whitespace, non-string) and hostile values
 * (traversal, NUL, relative) are skipped so resolution never lands on garbage,
 * never escapes the install base, and never throws.
 *
 * @param {string} envName    environment variable name to check first
 * @param {string} configKey  field name to read from yuri.config.json
 * @param {() => string} defaultFn deterministic fallback (lazy — only called if needed)
 * @param {() => (object|null)} configReader injectable reader (tests inject)
 * @returns {string} resolved absolute path
 */
function resolvePath(envName, configKey, defaultFn, configReader) {
  const envVal = process.env[envName];
  if (usableString(envVal)) {
    const safe = sanitizeOverride(envVal.trim());
    if (safe !== null) return safe;
    // hostile env override → fall through to config / default (fail closed)
  }

  let cfg = null;
  try { cfg = (configReader ?? defaultConfigReader)(); } catch { cfg = null; }
  if (cfg && usableString(cfg[configKey])) {
    const safe = sanitizeOverride(cfg[configKey].trim());
    if (safe !== null) return safe;
    // hostile config override → fall through to default (fail closed)
  }

  return defaultFn();
}

/** Repo root, derived once. Pure constant accessor. */
export function repoRoot() {
  return _REPO_ROOT;
}

/**
 * Derive the Claude Code project slug from an absolute cwd, runtime only.
 * Convention (matches ~/.claude/projects/<slug>/): replace every run of
 * non-alphanumeric characters in the absolute path with a single `-`, with a
 * leading `-`. NEVER a hardcoded machine-id literal.
 *
 * @param {string} [cwd] absolute working directory (defaults to process.cwd())
 * @returns {string} slug, e.g. "-Users-alice-my-repo"
 */
export function projectSlugFromCwd(cwd = process.cwd()) {
  const safe = typeof cwd === 'string' && cwd ? cwd : process.cwd();
  // Absolute-ize so a relative cwd still produces a stable, machine-correct slug.
  const abs = path.resolve(safe);
  // Collapse any non-alphanumeric run to one `-`, then ensure a single leading `-`.
  const body = abs.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  return '-' + body;
}

/** State dir: YURI_STATE_DIR || yuri.config.json.stateDir || <repo>/_SYSTEM/state */
export function stateDir(opts = {}) {
  return resolvePath(
    'YURI_STATE_DIR', 'stateDir',
    () => path.join(_REPO_ROOT, '_SYSTEM', 'state'),
    opts.configReader,
  );
}

/**
 * Claude auto-memory dir:
 *   YURI_MEMORY_DIR || yuri.config.json.memoryDir ||
 *   ~/.claude/projects/<slug-derived-from-cwd>/memory
 * The default derives the project slug at runtime — never a baked machine-id.
 */
export function claudeMemoryDir(opts = {}) {
  return resolvePath(
    'YURI_MEMORY_DIR', 'memoryDir',
    () => path.join(os.homedir(), '.claude', 'projects', projectSlugFromCwd(opts.cwd), 'memory'),
    opts.configReader,
  );
}

/** Kernel DB dir: YURI_KERNEL_DIR || yuri.config.json.kernelDir || <repo>/_SYSTEM/OS_KERNEL */
export function kernelDbDir(opts = {}) {
  return resolvePath(
    'YURI_KERNEL_DIR', 'kernelDir',
    () => path.join(_REPO_ROOT, '_SYSTEM', 'OS_KERNEL'),
    opts.configReader,
  );
}

/** Self dir (energy-weights home): YURI_SELF_DIR || yuri.config.json.selfDir || <repo>/_SYSTEM/SELF */
export function selfDir(opts = {}) {
  return resolvePath(
    'YURI_SELF_DIR', 'selfDir',
    () => path.join(_REPO_ROOT, '_SYSTEM', 'SELF'),
    opts.configReader,
  );
}

/** Audit log path: YURI_AUDIT_LOG || yuri.config.json.auditLog || ~/.yuri-audit.log */
export function auditLog(opts = {}) {
  return resolvePath(
    'YURI_AUDIT_LOG', 'auditLog',
    () => path.join(os.homedir(), '.yuri-audit.log'),
    opts.configReader,
  );
}

/** Config home: YURI_CONFIG_HOME || yuri.config.json.configHome || ~/.config/yuri */
export function configHome(opts = {}) {
  return resolvePath(
    'YURI_CONFIG_HOME', 'configHome',
    () => path.join(os.homedir(), '.config', 'yuri'),
    opts.configReader,
  );
}

export { CONFIG_FILE };
