#!/usr/bin/env node
/**
 * yuri-prelaunch-attest — Variant B YURI-side attestation executable (§2b)
 * correlationId=yuri-worktree-bootstrap-v1  task=t-7f23415d
 *
 * Called by October fireStartup() BEFORE agent autoboot:
 *   yuri-prelaunch-attest attest --cwd <resolvedCwd> --epoch <uuid>
 *
 * Exit 0  = PASS (agent may proceed)
 * Exit 78 = HOLD (fail-closed; October kills PTY, no agent command)
 * Other   = generic failure (same fail-closed)
 *
 * STANDALONE: NO import from yuri-worktree-bootstrap.mjs (Orion blocker 2 / Option A).
 * Receipt + nofollow write primitives are vendored below.
 * Residue .yuri-bootstrap-bin (9abfb753) must remain untouched.
 *
 * TOCTOU (Orion §2a erratum): October fireStartup attests sync then async
 * installDone.then(injectResume) → decideAgentStartup awaits before proc2.write.
 * Bootstrap F2 is NOT wired into October — NOT an operative control.
 * Operative TOCTOU control = Griffin §2a final synchronous re-attestation
 * immediately before each proc2.write (injectResume path + startCommand path).
 * This §2b module does not claim to close that October async gap.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const EXIT_HOLD = 78;
export const CORRELATION_ID = 'yuri-worktree-bootstrap-v1';
export const CANONICAL_MAIN_ABS = '/Users/marcelspatz/YURI-OS-MUSUBI';
/** Absolute SIP-protected git — never resolve via inherited PATH (Orion trust-anchor fix). */
export const GIT_BIN = '/usr/bin/git';
/** Owner-controlled manifest identity pin (Orion committed-minimal-manifest blocker). */
export const EXPECTED_MANIFEST_ID = 'yuri.prelaunch-attest.manifest.v1';
export const EXPECTED_SCHEMA_VERSION = 'yuri.governance-manifest.v1';
export const MANIFEST_ALLOWED_TOP_KEYS = Object.freeze([
  'schemaVersion',
  'manifestId',
  'expectedUpstreamRef',
  'expectedUpstreamCommit',
  'expectedUpstreamTree',
  'spineFiles',
]);
export const SPINE_ENTRY_REQUIRED_KEYS = Object.freeze(['path', 'sha256', 'role']);
export const SPINE_ENTRY_ALLOWED_KEYS = Object.freeze(['path', 'sha256', 'role', 'required']);

/** Manifest lives IN the worktree (standalone-binary safe; never __dirname / embed cwd). */
export function manifestPathFor(worktreeRoot) {
  return path.join(path.resolve(worktreeRoot), '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json');
}

/** Default October userData on macOS; overridable via YURI_OCTOBER_USER_DATA / OCTOBER_USER_DATA. */
export function defaultOctoberUserData() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'October');
}

function octoberUserData(env = process.env) {
  const override = String(env.YURI_OCTOBER_USER_DATA || env.OCTOBER_USER_DATA || '').trim();
  return override || defaultOctoberUserData();
}

export function realpathNative(p) {
  if (typeof fs.realpathSync.native === 'function') {
    return fs.realpathSync.native(p);
  }
  return fs.realpathSync(p);
}

/** Lexical + realpathed candidates for <userData>/worktrees (macOS /var twin included). */
export function worktreesRootCandidates(env = process.env) {
  const lexical = path.join(path.resolve(octoberUserData(env)), 'worktrees');
  const out = new Set([lexical]);
  if (lexical.startsWith('/var/')) out.add(`/private${lexical}`);
  if (lexical.startsWith('/private/var/')) out.add(lexical.slice('/private'.length));
  try { out.add(realpathNative(lexical)); } catch { /* missing ok */ }
  try { out.add(path.join(realpathNative(path.resolve(octoberUserData(env))), 'worktrees')); } catch { /* ok */ }
  return [...out];
}

export function resolveWorktreesRoot(env = process.env, { resolveSymlinks = true } = {}) {
  const lexical = path.join(path.resolve(octoberUserData(env)), 'worktrees');
  if (!resolveSymlinks) return lexical;
  try {
    return realpathNative(lexical);
  } catch {
    try {
      return path.join(realpathNative(path.resolve(octoberUserData(env))), 'worktrees');
    } catch {
      return lexical;
    }
  }
}

function underAnyRoot(absPath, roots) {
  const p = path.resolve(absPath);
  for (const root of roots) {
    if (!root) continue;
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (p === root || p.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * October asar:5111 equivalent — path under <userData>/worktrees/.
 * Lexical gating: { resolveSymlinks: false }. Resolved validation: default true.
 */
export function isSessionWorktreePath(candidateAbs, env = process.env, { resolveSymlinks = true } = {}) {
  try {
    const roots = worktreesRootCandidates(env);
    const p0 = path.resolve(String(candidateAbs));
    if (!resolveSymlinks) {
      if (underAnyRoot(p0, roots)) return true;
      const twin = p0.startsWith('/var/')
        ? `/private${p0}`
        : (p0.startsWith('/private/var/') ? p0.slice('/private'.length) : null);
      return twin ? underAnyRoot(twin, roots) : false;
    }
    let p = p0;
    try { p = realpathNative(p0); } catch { /* keep */ }
    return underAnyRoot(p, roots);
  } catch {
    return false;
  }
}

/** Boundary-safe: true when resolvedCwd is outside resolvedMain (October insert semantics). */
export function isOutsideCanonicalMain(resolvedCwd, resolvedMain) {
  const rel = path.relative(resolvedMain, resolvedCwd);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

function git(cwd, args) {
  // Absolute path only — inherited PATH may prepend writable user dirs (asar evidence).
  const r = spawnSync(GIT_BIN, args, { cwd, encoding: 'utf8' });
  return {
    code: r.status ?? 1,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
  };
}

export function resolveWorktreeRootFromCwd(cwdAbs) {
  const top = git(cwdAbs, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0 || !top.out) {
    return { ok: false, reason: 'git_toplevel_failed', detail: top.err || top.out };
  }
  let resolved;
  try {
    resolved = realpathNative(top.out);
  } catch (e) {
    return { ok: false, reason: 'toplevel_realpath_failed', detail: String(e?.message || e) };
  }
  return { ok: true, worktreeRoot: resolved };
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function loadManifest(manifestPath) {
  if (!manifestPath) throw new Error('manifest_path_required');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/**
 * Orion committed-minimal-manifest blocker: schema must be non-vacuous and pinned.
 * Rejects empty spineFiles, missing role/path/sha256, unknown keys, wrong manifestId.
 */
export function validateManifestSchema(manifest) {
  const failures = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return [{ code: 'manifest_schema', detail: 'manifest must be a non-null object' }];
  }
  const topKeys = Object.keys(manifest);
  for (const k of topKeys) {
    if (!MANIFEST_ALLOWED_TOP_KEYS.includes(k)) {
      failures.push({ code: 'manifest_unknown_key', detail: `unknown top-level key: ${k}` });
    }
  }
  if (manifest.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    failures.push({
      code: 'manifest_schema_version',
      detail: `expected=${EXPECTED_SCHEMA_VERSION} got=${manifest.schemaVersion}`,
    });
  }
  if (manifest.manifestId !== EXPECTED_MANIFEST_ID) {
    failures.push({
      code: 'manifest_id_mismatch',
      detail: `expected=${EXPECTED_MANIFEST_ID} got=${manifest.manifestId}`,
    });
  }
  const upstream = manifest.expectedUpstreamRef || manifest.expectedUpstreamCommit;
  if (!upstream || typeof upstream !== 'string' || !/^[0-9a-f]{40}$/i.test(upstream)) {
    failures.push({
      code: 'manifest_upstream_invalid',
      detail: 'expectedUpstreamRef/Commit must be a 40-char hex commit',
    });
  }
  if (!Array.isArray(manifest.spineFiles)) {
    failures.push({ code: 'manifest_spine_missing', detail: 'spineFiles must be an array' });
  } else if (manifest.spineFiles.length === 0) {
    failures.push({ code: 'manifest_spine_empty', detail: 'spineFiles must be non-empty' });
  } else {
    manifest.spineFiles.forEach((sf, i) => {
      if (!sf || typeof sf !== 'object' || Array.isArray(sf)) {
        failures.push({ code: 'manifest_spine_entry', detail: `spineFiles[${i}] not an object` });
        return;
      }
      for (const k of Object.keys(sf)) {
        if (!SPINE_ENTRY_ALLOWED_KEYS.includes(k)) {
          failures.push({ code: 'manifest_spine_unknown_key', detail: `spineFiles[${i}].${k}` });
        }
      }
      for (const req of SPINE_ENTRY_REQUIRED_KEYS) {
        if (typeof sf[req] !== 'string' || !String(sf[req]).trim()) {
          failures.push({ code: 'manifest_spine_field', detail: `spineFiles[${i}].${req} required string` });
        }
      }
      if (typeof sf.sha256 === 'string' && !/^[0-9a-f]{64}$/i.test(sf.sha256)) {
        failures.push({ code: 'manifest_spine_sha256', detail: `spineFiles[${i}].sha256 must be 64-hex` });
      }
    });
  }
  return failures;
}

/**
 * Reject expectedUpstreamRef === observed HEAD (trivial self-referencing bypass).
 */
export function rejectUpstreamSelfRef(expectedUpstream, observedCommit) {
  if (!expectedUpstream || !observedCommit) return { ok: false, reason: 'missing-refs' };
  if (String(expectedUpstream).toLowerCase() === String(observedCommit).toLowerCase()) {
    return { ok: false, reason: 'upstream_equals_head' };
  }
  return { ok: true };
}

// ---- Vendored F4/F3 primitives (copied; NOT imported from bootstrap WIP) ----

export function assertRealpathWithinRoot(worktreeRoot, candidate) {
  const root = path.resolve(worktreeRoot);
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch (e) {
    throw new Error(`root_unresolvable: ${root}: ${e.message}`);
  }
  let candReal;
  try {
    candReal = fs.realpathSync(candidate);
  } catch (e) {
    throw new Error(`path_unresolvable: ${candidate}: ${e.message}`);
  }
  if (candReal !== rootReal && !candReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error(`path_escape: ${candidate} -> ${candReal}`);
  }
  return candReal;
}

export function ensureDirNoFollow(worktreeRoot, dirPath) {
  const root = path.resolve(worktreeRoot);
  const abs = path.resolve(dirPath);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`dir_outside_root: ${abs}`);
  }
  try {
    if (fs.lstatSync(root).isSymbolicLink()) {
      assertRealpathWithinRoot(root, root);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`dir_escape_rel: ${rel}`);
  }
  const parts = rel === '' ? [] : rel.split(path.sep).filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = path.join(cur, part);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) throw new Error(`dir_symlink: ${cur}`);
      if (!st.isDirectory()) throw new Error(`not_a_dir: ${cur}`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      try {
        fs.mkdirSync(cur, { mode: 0o755 });
      } catch (e2) {
        if (e2.code === 'EEXIST') {
          if (fs.lstatSync(cur).isSymbolicLink()) throw new Error(`dir_symlink_race: ${cur}`);
          if (!fs.lstatSync(cur).isDirectory()) throw new Error(`not_a_dir: ${cur}`);
        } else {
          throw e2;
        }
      }
    }
    assertRealpathWithinRoot(root, cur);
  }
  return abs;
}

export function writeFileNoFollowAtomic(worktreeRoot, filePath, data, { mode = 0o644 } = {}) {
  const root = path.resolve(worktreeRoot);
  const abs = path.resolve(filePath);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`file_outside_root: ${abs}`);
  }
  const dir = path.dirname(abs);
  ensureDirNoFollow(root, dir);
  try {
    if (fs.lstatSync(abs).isSymbolicLink()) {
      throw new Error(`file_symlink: ${abs}`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const tmp = path.join(dir, `.${path.basename(abs)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | (fsConstants.O_NOFOLLOW || 0);
  let fd;
  try {
    fd = fs.openSync(tmp, flags, mode);
  } catch (e) {
    throw new Error(`nofollow_open_failed: ${tmp}: ${e.message}`);
  }
  try {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    fs.writeSync(fd, buf, 0, buf.length, 0);
    fs.fsyncSync(fd);
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
  if (fs.lstatSync(tmp).isSymbolicLink()) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error(`tmp_symlink: ${tmp}`);
  }
  try {
    if (fs.existsSync(abs) && fs.lstatSync(abs).isSymbolicLink()) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw new Error(`file_symlink: ${abs}`);
    }
  } catch (e) {
    if (String(e.message || e).startsWith('file_symlink')) throw e;
    if (e.code && e.code !== 'ENOENT') throw e;
  }
  fs.renameSync(tmp, abs);
  if (fs.lstatSync(abs).isSymbolicLink()) {
    throw new Error(`file_symlink_after_rename: ${abs}`);
  }
  assertRealpathWithinRoot(root, dir);
  return abs;
}

export function computeAttestationReceipt({
  worktreeRoot,
  observedBaseCommit,
  observedBaseTree,
  spineHashes,
  epoch = Date.now(),
  links = [],
  failures = [],
  ruling = 'HOLD',
  key,
} = {}) {
  const resolvedKey = key === undefined ? process.env.YURI_ATTEST_KEY : key;
  const payload = {
    schemaVersion: 'yuri.attestation-receipt.v1',
    correlationId: CORRELATION_ID,
    worktreeRoot: path.resolve(worktreeRoot),
    observedBaseCommit,
    observedBaseTree,
    spineHashes,
    epoch,
    links,
    failures,
    ruling,
  };
  const body = JSON.stringify(payload);
  if (!resolvedKey) return { receipt: payload, hmac: null, error: 'YURI_ATTEST_KEY missing' };
  const hmac = crypto.createHmac('sha256', resolvedKey).update(body).digest('hex');
  return { receipt: { ...payload, hmacAlg: 'sha256' }, hmac };
}

export function persistAttestationReceipt({
  worktreeRoot,
  receipt,
  deps = {},
} = {}) {
  const {
    ensureDir = ensureDirNoFollow,
    writeAtomic = writeFileNoFollowAtomic,
  } = deps;
  const root = path.resolve(worktreeRoot);
  const dir = path.join(root, '.yuri-bootstrap');
  const file = path.join(dir, 'attestation-receipt.json');
  try {
    ensureDir(root, dir);
    writeAtomic(root, file, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
    return { ok: true, path: file };
  } catch (e) {
    const msg = String(e?.message || e);
    let code = 'receipt_persist_failed';
    if (/dir_symlink/i.test(msg)) code = 'receipt_dir_symlink';
    else if (/file_symlink/i.test(msg)) code = 'receipt_file_symlink';
    else if (/path_escape|dir_outside|file_outside|dir_escape/i.test(msg)) code = 'receipt_dir_escape';
    else if (/nofollow_open_failed/i.test(msg)) code = 'receipt_nofollow_open_failed';
    return { ok: false, code, detail: msg, path: file };
  }
}

export function rejectDisconnectedHistory(worktreeRoot, expectedUpstream, observedCommit) {
  if (!expectedUpstream || !observedCommit) return { ok: false, reason: 'missing-refs' };
  const mb = git(worktreeRoot, ['merge-base', expectedUpstream, observedCommit]);
  if (mb.code !== 0 || !mb.out) return { ok: false, reason: 'disconnected-history-no-merge-base' };
  return { ok: true, mergeBase: mb.out };
}

export function octoberIdentityPresent(env = process.env) {
  const port = String(env.OCTOBER_BUS_PORT ?? '').trim();
  const canvas = String(env.OCTOBER_BUS_CANVAS ?? '').trim();
  const node = String(env.OCTOBER_BUS_NODE ?? '').trim();
  const present = [port, canvas, node].filter(Boolean).length;
  if (present === 0) return { ok: true, attached: false, partial: false };
  if (present !== 3) return { ok: false, attached: false, partial: true, reason: 'incomplete-OCTOBER_BUS' };
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return { ok: false, attached: false, partial: true, reason: 'invalid-OCTOBER_BUS_PORT' };
  }
  return { ok: true, attached: true, partial: false };
}

/**
 * Governance spine observe — schema first, then existence AND manifest sha256 match.
 */
export function observeSpine(worktreeRoot, manifestPath = null) {
  const failures = [];
  const spineHashes = [];
  const resolvedManifestPath = manifestPath || manifestPathFor(worktreeRoot);
  let manifest;
  try {
    manifest = loadManifest(resolvedManifestPath);
  } catch (e) {
    return {
      ok: false,
      failures: [{ code: 'manifest_unreadable', detail: String(e?.message || e), path: resolvedManifestPath }],
      spineHashes: [],
      manifest: null,
      manifestPath: resolvedManifestPath,
    };
  }
  const schemaFailures = validateManifestSchema(manifest);
  failures.push(...schemaFailures);
  if (schemaFailures.length > 0) {
    return {
      ok: false,
      failures,
      spineHashes: [],
      manifest,
      manifestPath: resolvedManifestPath,
    };
  }
  for (const sf of manifest.spineFiles) {
    const p = path.join(worktreeRoot, sf.path);
    if (!fs.existsSync(p)) {
      if (sf.required !== false) failures.push({ code: 'spine_missing', path: sf.path });
      continue;
    }
    let observedSha256 = null;
    try {
      observedSha256 = sha256File(p);
    } catch (e) {
      failures.push({ code: 'spine_unreadable', path: sf.path, detail: String(e?.message || e) });
      continue;
    }
    const matchesManifest = observedSha256 === sf.sha256;
    spineHashes.push({ path: sf.path, role: sf.role, observedSha256, matchesManifest });
    if (sf.sha256 && !matchesManifest) {
      failures.push({
        code: 'manifest_hash_mismatch',
        path: sf.path,
        detail: `observed=${observedSha256} expected=${sf.sha256}`,
      });
    }
  }
  return { ok: failures.length === 0, failures, spineHashes, manifest, manifestPath: resolvedManifestPath };
}

function observeGitBase(worktreeRoot) {
  const commit = git(worktreeRoot, ['rev-parse', 'HEAD']);
  const tree = git(worktreeRoot, ['rev-parse', 'HEAD^{tree}']);
  return {
    commit: commit.code === 0 ? commit.out : null,
    tree: tree.code === 0 ? tree.out : null,
  };
}

/**
 * Uncommitted working-tree integrity (Orion dirty_worktree blocker).
 * Coordinated uncommitted manifest+spine tamper leaves HEAD unchanged but
 * porcelain non-empty — HOLD before git base/history checks can falsely PASS.
 *
 * Attest-owned `.yuri-bootstrap/` outputs (receipt) are ignored so Griffin
 * §2a re-attest after a prior READY receipt write is not self-poisoned.
 */
export function observeDirtyWorktree(worktreeRoot) {
  const st = git(worktreeRoot, ['status', '--porcelain']);
  if (st.code !== 0) {
    return {
      dirty: true,
      porcelain: '',
      detail: st.err || st.out || 'git status --porcelain failed',
      statusFailed: true,
    };
  }
  const relevant = String(st.out || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      // porcelain: "XY path" or "XY old -> new" (optionally quoted)
      const rest = line.length >= 3 ? line.slice(3).trim() : line;
      const pathPart = rest.includes(' -> ') ? rest.split(' -> ').pop() : rest;
      const cleaned = String(pathPart || '').replace(/^"|"$/g, '');
      return cleaned !== '.yuri-bootstrap'
        && !cleaned.startsWith(`.yuri-bootstrap/`)
        && !cleaned.startsWith(`.yuri-bootstrap${path.sep}`);
    });
  const porcelain = relevant.join('\n');
  return {
    dirty: porcelain.length > 0,
    porcelain,
    detail: porcelain.length > 0 ? relevant.slice(0, 8).join('\n') : null,
    statusFailed: false,
  };
}

function parseArgv(argv) {
  const args = [...argv];
  const cmd = args.shift() || '';
  const out = { cmd, cwd: null, epoch: null, forceHold: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--cwd') out.cwd = args[++i];
    else if (a === '--epoch') out.epoch = args[++i];
    else if (a === '--force-hold') out.forceHold = true;
  }
  return out;
}

/**
 * Core attest decision.
 *
 * Symlink both-directions (Orion blocker 1 / v1.1 corrected):
 *   enter if isSessionWorktreePath(lexical) OR isSessionWorktreePath(resolved)
 *   then validate resolved is a genuine isolated worktree; fail-closed on mismatch.
 */
export function runAttest({
  cwd,
  epoch,
  forceHold = false,
  env = process.env,
  canonicalMainAbs = CANONICAL_MAIN_ABS,
  manifestPath = null,
  computeFn = computeAttestationReceipt,
  persistFn = persistAttestationReceipt,
  observeGitBaseFn = observeGitBase,
  attestKey = process.env.YURI_ATTEST_KEY,
  requireOctoberIdentity = false,
} = {}) {
  if (!cwd) {
    return { code: EXIT_HOLD, ruling: 'HOLD', reason: 'missing_cwd', receiptPath: null, receipt: null };
  }

  const lexicalCwd = path.resolve(String(cwd));
  const lexicalIsSessionWt = isSessionWorktreePath(lexicalCwd, env, { resolveSymlinks: false });

  let resolvedCwd;
  let resolvedMain;
  try {
    resolvedCwd = realpathNative(lexicalCwd);
    resolvedMain = realpathNative(canonicalMainAbs);
  } catch (e) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'realpath_failed',
      detail: String(e?.message || e),
      receiptPath: null,
      receipt: null,
      lexicalCwd,
    };
  }

  const resolvedIsSessionWt = isSessionWorktreePath(resolvedCwd, env, { resolveSymlinks: true });
  const enterAttest = lexicalIsSessionWt || resolvedIsSessionWt;

  if (!enterAttest) {
    if (!isOutsideCanonicalMain(resolvedCwd, resolvedMain)
      || !isOutsideCanonicalMain(lexicalCwd, resolvedMain)) {
      return {
        code: 0,
        ruling: 'SKIP_MAIN',
        reason: 'canonical_main_excluded',
        receiptPath: null,
        receipt: null,
        lexicalCwd,
        resolvedCwd,
        resolvedMain,
      };
    }
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'not_session_worktree',
      receiptPath: null,
      receipt: null,
      lexicalCwd,
      resolvedCwd,
    };
  }

  // Entered via lexical and/or resolved — resolved target must be genuine isolated worktree.
  const resolvedOutsideMain = isOutsideCanonicalMain(resolvedCwd, resolvedMain);
  if (!resolvedOutsideMain) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'symlink_escape_to_main',
      detail: `lexical=${lexicalCwd} resolved=${resolvedCwd}`,
      receiptPath: null,
      receipt: null,
      lexicalCwd,
      resolvedCwd,
      resolvedMain,
    };
  }
  if (!resolvedIsSessionWt) {
    // Lexical under worktrees but resolved escaped outside (not to main).
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'symlink_escape_outside_worktrees',
      detail: `lexical=${lexicalCwd} resolved=${resolvedCwd}`,
      receiptPath: null,
      receipt: null,
      lexicalCwd,
      resolvedCwd,
    };
  }
  // Mismatch cases still fail-closed above; both-true or outside→into (resolved true) continue.

  const top = resolveWorktreeRootFromCwd(resolvedCwd);
  if (!top.ok) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: top.reason,
      detail: top.detail,
      receiptPath: null,
      receipt: null,
      lexicalCwd,
      resolvedCwd,
    };
  }
  const worktreeRoot = top.worktreeRoot;

  if (!isSessionWorktreePath(worktreeRoot, env, { resolveSymlinks: true })) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'toplevel_not_session_worktree',
      receiptPath: null,
      receipt: null,
      worktreeRoot,
      lexicalCwd,
    };
  }
  if (!isOutsideCanonicalMain(worktreeRoot, resolvedMain)) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: 'toplevel_symlink_escape_to_main',
      receiptPath: null,
      receipt: null,
      worktreeRoot,
      lexicalCwd,
    };
  }

  const failures = [];
  if (forceHold || String(env.YURI_PRELAUNCH_FORCE_HOLD || '').trim() === '1') {
    failures.push({ code: 'force_hold', detail: 'YURI_PRELAUNCH_FORCE_HOLD or --force-hold' });
  }

  // Dirty BEFORE trusting manifest (Orion). Attest-owned .yuri-bootstrap/ ignored.
  const dirty = observeDirtyWorktree(worktreeRoot);
  if (dirty.dirty) {
    failures.push({
      code: 'dirty_worktree',
      detail: dirty.detail || 'uncommitted working-tree modifications',
    });
  }

  // Standalone-binary safe: manifest is ALWAYS under the worktree unless caller overrides.
  const resolvedManifestPath = manifestPath || manifestPathFor(worktreeRoot);
  const spine = observeSpine(worktreeRoot, resolvedManifestPath);
  failures.push(...spine.failures);

  const observed = observeGitBaseFn(worktreeRoot);
  if (!observed.commit || !observed.tree) {
    failures.push({ code: 'base_unobserved', detail: 'cannot observe worktree HEAD/tree' });
  }

  const expectedUpstream = spine.manifest?.expectedUpstreamRef || spine.manifest?.expectedUpstreamCommit;
  if (expectedUpstream && observed.commit) {
    const selfRef = rejectUpstreamSelfRef(expectedUpstream, observed.commit);
    if (!selfRef.ok) {
      failures.push({ code: 'upstream_self_ref', detail: selfRef.reason });
    } else {
      const hist = rejectDisconnectedHistory(worktreeRoot, expectedUpstream, observed.commit);
      if (!hist.ok) {
        failures.push({ code: 'disconnected_history', detail: hist.reason });
      }
    }
  } else if (!expectedUpstream) {
    failures.push({ code: 'manifest_upstream_missing', detail: 'expectedUpstreamRef required' });
  }

  const idCheck = octoberIdentityPresent(env);
  if (requireOctoberIdentity && !idCheck.attached) {
    failures.push({ code: 'october_identity', detail: 'OCTOBER_BUS_* required but absent' });
  } else if (!idCheck.ok) {
    failures.push({ code: 'october_identity', detail: idCheck.reason || 'incomplete-OCTOBER_BUS' });
  }

  const ruling = failures.length === 0 ? 'READY' : 'HOLD';
  const epochValue = epoch || crypto.randomUUID();
  const { receipt, hmac, error } = computeFn({
    worktreeRoot,
    observedBaseCommit: observed.commit,
    observedBaseTree: observed.tree,
    spineHashes: spine.spineHashes,
    epoch: epochValue,
    links: [],
    failures,
    ruling,
    key: attestKey,
  });
  const nextFailures = error
    ? [...failures, { code: 'hmac_key_missing', detail: error }]
    : failures;
  const finalRuling = (!error && ruling === 'READY' && nextFailures.length === 0) ? 'READY' : 'HOLD';
  const finalReceipt = {
    ...receipt,
    ruling: finalRuling,
    hmac: error ? null : hmac,
    failures: nextFailures,
    prelaunch: {
      module: 'yuri-prelaunch-attest',
      correlationId: CORRELATION_ID,
      lexicalCwd,
      resolvedCwd,
      worktreeRoot,
      epoch: epochValue,
      errata: ['v1.1-both-direction-symlink', 'v1.2-owner-install', 'blocker2-vendored-primitives', 'blocker3-manifest-hash-gov', 'dirty-worktree-porcelain', 'manifest-schema-pin'],
      toctouResidual: 'october-fireStartup-async-gap-BEFORE-proc2.write; operative-control=Griffin-§2a-final-sync-reattest; bootstrap-F2-NOT-wired-into-October',
      standalone: true,
      bootstrapImport: false,
      manifestPath: resolvedManifestPath,
    },
  };

  const persist = persistFn({ worktreeRoot, receipt: finalReceipt });
  if (!persist.ok) {
    return {
      code: EXIT_HOLD,
      ruling: 'HOLD',
      reason: persist.code || 'receipt_persist_failed',
      detail: persist.detail,
      receiptPath: persist.path || null,
      receipt: finalReceipt,
      worktreeRoot,
    };
  }

  const code = finalRuling === 'READY' ? 0 : EXIT_HOLD;
  return {
    code,
    ruling: finalRuling,
    reason: finalRuling === 'READY' ? null : (nextFailures[0]?.code || 'hold'),
    receiptPath: persist.path,
    receipt: finalReceipt,
    worktreeRoot,
    resolvedCwd,
    lexicalCwd,
  };
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const parsed = parseArgv(argv);
  if (parsed.cmd !== 'attest') {
    process.stderr.write(
      'yuri-prelaunch-attest: usage: attest --cwd <resolvedCwd> --epoch <uuid> [--force-hold]\n',
    );
    return EXIT_HOLD;
  }
  const forceHold = parsed.forceHold || String(opts.env?.YURI_PRELAUNCH_FORCE_HOLD || process.env.YURI_PRELAUNCH_FORCE_HOLD || '').trim() === '1';
  const result = runAttest({
    cwd: parsed.cwd,
    epoch: parsed.epoch,
    forceHold,
    env: opts.env || process.env,
    canonicalMainAbs: opts.canonicalMainAbs || CANONICAL_MAIN_ABS,
    manifestPath: opts.manifestPath || null,
    attestKey: opts.attestKey !== undefined ? opts.attestKey : process.env.YURI_ATTEST_KEY,
    computeFn: opts.computeFn,
    persistFn: opts.persistFn,
    requireOctoberIdentity: opts.requireOctoberIdentity === true,
  });
  const line = JSON.stringify({
    ruling: result.ruling,
    code: result.code,
    reason: result.reason || null,
    receiptPath: result.receiptPath,
    correlationId: CORRELATION_ID,
  });
  process.stderr.write(`yuri-prelaunch-attest: ${line}\n`);
  return result.code;
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirect) {
  process.exit(main());
}
