#!/usr/bin/env node
/**
 * yuri-worktree-bootstrap v1
 * correlationId=yuri-worktree-bootstrap-v1 task=t-7f23415d
 *
 * Fail-closed prelaunch attestation + startCommand WRAPPER for October
 * isolated worktrees. HOLD → exit 78 (mirror october-omp/pi). READY → exec agent.
 *
 * WIRING (October 1.0.32 asar):
 * - agentLaunchCommand returns PATH basename ("cursor-agent"), NOT absolute → W2 viable
 * - fireStartup writes p.startCommand at index.js:16188-16201 → W1 viable when set
 * - injectResume prefers bare AGENT_BINARY over startCommand unless first token matches
 *   → W2 PATH-shim is PRIMARY for injectResume autoBoot; W1 emitted for startCommand seam.
 *
 * Isolation honesty: cli.json deny[] is Write()-scoped only — ZERO shell isolation.
 * Real isolation = content-absence (.worktreeinclude) + path-matcher + optional sandbox stub.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { constants as fsConstants } from 'node:fs';

import { evaluateGovernance, CLASS } from '../mure/governance.mjs';
import { isProtectedPath, PROTECTED_PATTERNS } from './energy-tick-core.mjs';
import {
  validateRegistry,
  renderProvider,
  sparseBootstrapPlan,
  loadRegistry,
} from './yuri-hook-registry.mjs';
import { buildActivationPlan } from './yuri-codex-skill-activation.mjs';
import { scanLiveSkills } from './skill-recall.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const MANIFEST_PATH = path.join(REPO_ROOT, '_SYSTEM/config/yuri-worktree-bootstrap-manifest.json');
export const TEMPLATE_DIR = path.join(REPO_ROOT, '_SYSTEM/config/provider-templates');
export const EXIT_HOLD = 78;
export const CORRELATION_ID = 'yuri-worktree-bootstrap-v1';
export const CANONICAL_MAIN_ABS = '/Users/marcelspatz/YURI-OS-MUSUBI';

export const APP_SHELL_ALLOW = Object.freeze([
  'git status', 'ls', 'echo', 'kill', 'bash -n', 'python3', 'rsync', 'bash',
  'curl', 'command', 'true', 'rm', 'cat', 'cd', 'git add', 'git commit',
  'head', 'node', 'git fetch', 'git push',
]);
// Expected allow count = Mcp + Write(worktree) + APP_SHELL_ALLOW (OpenClaw/Fable banned)
export const EXPECTED_ALLOW_COUNT = APP_SHELL_ALLOW.length + 2;

export const SECRET_EXCLUDE_GLOBS = Object.freeze([
  '.env', '.env*', '.env.local', '.env.development', '.env.development.local',
  '*credentials*', '*secret*', '.claude/projects', 'backend/data',
]);

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    code: r.status ?? 1,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
  };
}

function resolveCanonicalRoot(worktreeRoot) {
  const common = git(worktreeRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.code === 0 && common.out) {
    const commonDir = common.out;
    if (commonDir.endsWith(`${path.sep}.git`) || commonDir.endsWith('/.git')) {
      return path.dirname(commonDir);
    }
  }
  const top = git(worktreeRoot, ['rev-parse', '--show-toplevel']);
  return top.code === 0 ? top.out : path.resolve(worktreeRoot);
}

export function composeWrapCommand(provider, worktreeRoot, realAgentArgs = []) {
  const script = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-worktree-bootstrap.mjs');
  const agentBin = ({
    cursor: 'cursor-agent',
    claude: 'claude',
    codex: 'codex',
    omp: 'omp',
  })[provider] || 'cursor-agent';
  const tail = realAgentArgs.length ? realAgentArgs : [agentBin];
  return `node ${JSON.stringify(script)} --wrap --provider ${provider} -- ${tail.join(' ')}`;
}

/** W2 PATH-shim — PRIMARY for injectResume bare binary path. Worktree-only; never touch main residue. */
export function installPathShims(worktreeRoot, { providers = ['cursor'] } = {}) {
  const root = path.resolve(worktreeRoot);
  const isMain = root === path.resolve(CANONICAL_MAIN_ABS) || root === path.resolve(REPO_ROOT);
  const binDir = path.join(root, '.yuri-bootstrap-bin');
  // F4-SHIM + no-deletion floor: never create/overwrite shims on main (preserve 9abfb753 residue)
  if (isMain) {
    return { binDir, installed: [], skipped: 'main-residue-preserve' };
  }
  ensureDirNoFollow(root, binDir);
  const installed = [];
  for (const provider of providers) {
    const agentBin = ({ cursor: 'cursor-agent', claude: 'claude', codex: 'codex', omp: 'omp' })[provider];
    if (!agentBin) continue;
    const shim = path.join(binDir, agentBin);
    const script = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-worktree-bootstrap.mjs');
    const body = `#!/bin/sh
# YURI worktree-bootstrap W2 PATH-shim — fail-closed before real agent
export PATH="$(echo "$PATH" | tr ':' '\\n' | grep -v '.yuri-bootstrap-bin' | paste -sd: -)"
exec node ${JSON.stringify(script)} --wrap --provider ${provider} -- ${agentBin} "$@"
`;
    writeFileNoFollowAtomic(root, shim, body, { mode: 0o755 });
    installed.push({ provider, shim, agentBin });
  }
  return { binDir, installed };
}

/**
 * F4 — assert resolved path stays inside worktreeRoot (no symlink escape).
 */
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

/**
 * F4 — race-safe no-follow directory ensure within worktreeRoot.
 * Rejects symlink components; mkdir is atomic per segment; realpath checked after obtain.
 */
export function ensureDirNoFollow(worktreeRoot, dirPath) {
  const root = path.resolve(worktreeRoot);
  const abs = path.resolve(dirPath);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`dir_outside_root: ${abs}`);
  }
  try {
    if (fs.lstatSync(root).isSymbolicLink()) {
      // Allow only if realpath still within itself as the designated root.
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
    let existed = false;
    try {
      const st = fs.lstatSync(cur);
      existed = true;
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
    if (existed) assertRealpathWithinRoot(root, cur);
  }
  return abs;
}

/**
 * F4-RACE — atomic no-follow file write: O_NOFOLLOW|O_CREAT|O_EXCL temp + fsync + rename.
 * Symlink target / escape / open failure => throw (caller maps to render_failed HOLD).
 */
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

export function validateCursorCli(json, worktreeRoot) {
  const violations = [];
  const root = path.resolve(worktreeRoot);
  const perms = json?.permissions;
  if (!perms || typeof perms !== 'object') {
    violations.push({ code: 'RJ-schema', detail: 'missing permissions object' });
    return { ok: false, violations };
  }
  const allow = Array.isArray(perms.allow) ? perms.allow : [];
  const deny = Array.isArray(perms.deny) ? perms.deny : [];
  if (deny.length === 0) {
    violations.push({
      code: 'security_floor_deny_empty',
      detail: 'YURI security-floor HOLD: deny[] must be the complete protected floor (Cursor schema accepts deny:[]; YURI attestation does not)',
    });
  }
  if (allow.length !== EXPECTED_ALLOW_COUNT) {
    violations.push({ code: 'allow_count', detail: `allow length ${allow.length} != ${EXPECTED_ALLOW_COUNT} (Mcp+Write+APP_SHELL_ALLOW)` });
  }

  const blob = JSON.stringify(json);
  if (blob.includes('Write(*)') || blob.includes('Shell(*)')) {
    violations.push({ code: 'wildcard', detail: 'Write(*)/Shell(*) forbidden' });
  }
  if (blob.includes('{{WORKTREE_ROOT}}') || blob.includes('{{BOOTSTRAP_WRAP}}')) {
    violations.push({ code: 'RJ-1', detail: 'unresolved_template_token' });
  }
  // OpenClaw / Fable hard ban (v1.3 §C)
  for (const tok of [...allow, ...deny]) {
    if (/openclaw|fable/i.test(String(tok))) {
      violations.push({ code: 'forbidden_token', detail: `banned provider token: ${tok}` });
    }
  }

  const canonical = path.resolve(CANONICAL_MAIN_ABS);
  const isMainWorktree = root === canonical;
  if (!isMainWorktree) {
    const pointsAtMainOnly = deny.some((t) => String(t).includes(canonical) && !String(t).includes(root));
    if (pointsAtMainOnly) {
      violations.push({ code: 'RJ-2', detail: 'portability_bug: main path in non-main worktree' });
    }
  }

  try {
    const real = fs.realpathSync(root);
    // macOS /var → /private/var is canonicalization, not a portability failure.
    if (path.resolve(root) !== real
      && path.resolve(root) !== real.replace(/^\/private/, '')
      && real !== path.resolve(root).replace(/^\/var\//, '/private/var/')) {
      // Only flag when realpath lands on a different leaf (symlink root escape).
      const baseA = path.basename(path.resolve(root));
      const baseB = path.basename(real);
      if (baseA !== baseB) {
        violations.push({ code: 'RJ-3', detail: 'root_not_canonical' });
      }
    }
  } catch {
    violations.push({ code: 'RJ-3', detail: 'root_not_resolvable' });
  }

  for (const cmd of APP_SHELL_ALLOW) {
    if (!allow.includes(`Shell(${cmd})`)) {
      violations.push({ code: 'app_parity', detail: `missing Shell(${cmd})` });
    }
  }
  if (!allow.includes('Mcp(october-bus:*)')) {
    violations.push({ code: 'app_parity', detail: 'missing Mcp(october-bus:*)' });
  }
  if (!allow.some((t) => /^Write\(.+\/\*\)$/.test(String(t)))) {
    violations.push({ code: 'app_parity', detail: 'missing Write(worktree/*)' });
  }

  // cli.json schema is permissions-only (Orion 2026-07-22). startCommand/skipPermissions
  // are launch/node settings — MUST NOT appear in cli.json or schema validation rejects.
  if (Object.prototype.hasOwnProperty.call(json, 'startCommand')) {
    violations.push({ code: 'schema_extra', detail: 'startCommand is not a valid cli.json key; use composeWrapCommand / W2 shim' });
  }
  if (Object.prototype.hasOwnProperty.call(json, 'skipPermissions')) {
    violations.push({ code: 'schema_extra', detail: 'skipPermissions is not a valid cli.json key' });
  }
  const keys = Object.keys(json || {});
  for (const k of keys) {
    if (k !== 'permissions') {
      violations.push({ code: 'schema_extra', detail: `unrecognized cli.json key: ${k}` });
    }
  }

  if (new Set(deny.map(String)).size !== deny.length) {
    violations.push({ code: 'RJ-4', detail: 'path_resolution_collision duplicate deny entries' });
  }

  return { ok: violations.length === 0, violations };
}

function protectedNameMatch(nameOrRel) {
  const s = String(nameOrRel).replace(/\\/g, '/');
  if (isProtectedPath(s) || isProtectedPath(`/${s}`) || isProtectedPath(`${s}/`)) return true;
  if (/(^|\/)\.env(\.|$|\/)/.test(s)) return true;
  if (/(^|\/)backend\/data(\/|$)/.test(s)) return true;
  if (/(^|\/)\.claude\/projects(\/|$)/.test(s)) return true;
  if (/\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|credentials|secret/i.test(s)) return true;
  return false;
}

function walkDirents(root, { maxDepth = 6 } = {}) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name === '.git') continue;
      // Skip nested node_modules trees; always record top-level node_modules (October symlink).
      if (ent.name === 'node_modules' && depth > 0) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full);
      out.push({ full, rel, name: ent.name, ent });
      if (ent.name === 'node_modules') continue; // do not recurse into deps
      if (!ent.isSymbolicLink() && ent.isDirectory() && depth < maxDepth) {
        stack.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return out;
}

/** PATH-MATCHER only — lstat/readlink/readdir names. NEVER open secret contents. */
export function checkProtectedIsolation(worktreeRoot, { canonicalRepoRoot = null } = {}) {
  const root = path.resolve(worktreeRoot);
  const leaks = [];
  const links = [];
  const canon = canonicalRepoRoot ? path.resolve(canonicalRepoRoot) : resolveCanonicalRoot(root);

  for (const item of walkDirents(root)) {
    const { full, rel, name } = item;
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }

    if (st.isSymbolicLink()) {
      let target;
      try {
        target = fs.readlinkSync(full);
      } catch (e) {
        leaks.push({ kind: 'symlink-unreadable', path: rel, detail: String(e.message || e) });
        continue;
      }
      const absTarget = path.resolve(path.dirname(full), target);
      const escapes = !(absTarget === root || absTarget.startsWith(`${root}${path.sep}`));
      const protectedTarget = protectedNameMatch(absTarget) || protectedNameMatch(target);
      const isNodeModules = name === 'node_modules' || rel === 'node_modules';
      if (isNodeModules) {
        let resolvedTarget = absTarget;
        let resolvedCanon = canon;
        try { resolvedTarget = fs.realpathSync(full); } catch { /* keep absTarget */ }
        try { resolvedCanon = fs.realpathSync(canon); } catch { /* keep canon */ }
        const under = (t, rootPath) => {
          const a = path.resolve(t);
          const b = path.resolve(rootPath);
          return a === b || a.startsWith(`${b}${path.sep}`);
        };
        // October deps link is a known exception: do not treat the deps-dir name class as a secret hit.
        const secretHit = (/(^|\/)\.env(\.|$|\/)/.test(String(absTarget).replace(/\\/g, '/'))
          || /(^|\/)backend\/data(\/|$)/.test(String(absTarget).replace(/\\/g, '/'))
          || /(^|\/)\.claude\/(state|history|file-history|projects)(\/|$)/.test(String(absTarget).replace(/\\/g, '/'))
          || /\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|credentials|secret/i.test(String(absTarget)));
        const depsOk = (path.basename(resolvedTarget) === 'node_modules' || path.basename(absTarget) === 'node_modules')
          && (under(resolvedTarget, resolvedCanon) || under(absTarget, resolvedCanon) || under(path.dirname(absTarget), resolvedCanon));
        const verdict = depsOk && !secretHit ? 'known-october-node_modules' : 'HOLD';
        links.push({ name: rel, target: absTarget, resolvedTarget, verdict });
        if (verdict === 'HOLD') leaks.push({ kind: 'symlink-node_modules-bad', path: rel, target: absTarget });
        continue;
      }
      links.push({ name: rel, target: absTarget, verdict: 'HOLD' });
      leaks.push({ kind: escapes ? 'symlink-escape' : 'symlink-unexpected', path: rel, target: absTarget });
      continue;
    }

    if (protectedNameMatch(rel) || protectedNameMatch(name)) {
      leaks.push({ kind: 'protected-name-present', path: rel });
    }
  }

  return { ok: leaks.length === 0, leaks, links };
}

export function assertWorktreeincludeExcludesSecrets(includePath = path.join(REPO_ROOT, '.worktreeinclude')) {
  if (!fs.existsSync(includePath)) {
    return { ok: false, violations: ['worktreeinclude-missing'], lines: [] };
  }
  const text = fs.readFileSync(includePath, 'utf8');
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) {
    return {
      ok: false,
      violations: ['worktreeinclude-empty'],
      lines,
      detail: 'empty allowlist => October falls back to unsafe .env* defaults => HOLD',
    };
  }
  const joined = lines.join('\n');
  if (/\.env/.test(joined) || /backend\/data/.test(joined) || /\.claude\/projects/.test(joined)
    || /credentials/.test(joined) || /secret/.test(joined)) {
    return { ok: false, violations: ['secret-glob-included'], lines };
  }
  return { ok: true, violations: [], lines };
}

/**
 * Launch settings live in node/provider template — NEVER in cli.json (v1.3 §D).
 */
export function validateLauncherConfig(launcher = {}) {
  const violations = [];
  const sc = launcher.startCommand;
  if (sc == null || String(sc).trim() === '') {
    violations.push({ code: 'startCommand_missing', detail: 'startCommand required on launcher template' });
  } else {
    const s = String(sc);
    const isBare = s === 'cursor-agent' || s === 'claude' || s === 'codex' || s === 'omp';
    const isWrap = s.includes('yuri-worktree-bootstrap.mjs') && s.includes('--wrap');
    if (!isBare && !isWrap) {
      violations.push({ code: 'startCommand_invalid', detail: 'must be agent binary or bootstrap --wrap' });
    }
    if (/openclaw|fable/i.test(s)) {
      violations.push({ code: 'forbidden_token', detail: 'openclaw/fable banned in startCommand' });
    }
  }
  if (launcher.skipPermissions !== false) {
    violations.push({ code: 'skipPermissions', detail: 'skipPermissions must be false' });
  }
  if (launcher.permissionMode !== 'autoReview') {
    violations.push({ code: 'permissionMode', detail: 'permissionMode must be autoReview' });
  }
  return { ok: violations.length === 0, violations };
}

function renderCursorFromTemplate(worktreeRoot) {
  const tmplPath = path.join(TEMPLATE_DIR, 'cursor.cli.json.tmpl');
  let raw = fs.readFileSync(tmplPath, 'utf8');
  // permissions-only schema — never inject startCommand/skipPermissions into cli.json
  raw = raw.split('{{WORKTREE_ROOT}}').join(path.resolve(worktreeRoot));
  // Drop any template placeholders for launch keys (wrap lives outside cli.json)
  raw = raw.split('{{BOOTSTRAP_WRAP}}').join('');
  const config = JSON.parse(raw);
  delete config.startCommand;
  delete config.skipPermissions;
  return config;
}

export function renderProviderConfig(provider, worktreeRoot) {
  const root = path.resolve(worktreeRoot);
  // F4: contain worktree root before any write
  assertRealpathWithinRoot(root, root);

  if (provider === 'cursor') {
    const config = renderCursorFromTemplate(root);
    const outDir = path.join(root, '.yuri-bootstrap');
    ensureDirNoFollow(root, outDir);
    // Never overwrite tracked main seed .cursor/cli.json (schema crash vector).
    // Isolated worktrees get .cursor/cli.json; main attest uses rendered side-path.
    const isMain = root === path.resolve(CANONICAL_MAIN_ABS) || root === path.resolve(REPO_ROOT);
    const cursorDir = path.join(root, '.cursor');
    ensureDirNoFollow(root, cursorDir);
    const sidePath = path.join(outDir, 'cursor.cli.rendered.json');
    writeFileNoFollowAtomic(root, sidePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o644 });
    let outPath = sidePath;
    if (!isMain) {
      outPath = path.join(cursorDir, 'cli.json');
      writeFileNoFollowAtomic(root, outPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o644 });
      // W2 PATH-shim is WORKTREE-ONLY (v1.3 §E) — never install on main checkout
      installPathShims(root, { providers: ['cursor'] });
    }
    return {
      provider,
      path: outPath,
      sidePath,
      config,
      launchCommand: composeWrapCommand('cursor', root),
      permissionMode: 'autoReview',
      skipPermissions: false,
      launcher: {
        startCommand: composeWrapCommand('cursor', root),
        skipPermissions: false,
        permissionMode: 'autoReview',
      },
    };
  }
  const tmplName = ({
    claude: 'claude.project.tmpl',
    codex: 'codex.project.tmpl',
    omp: 'omp.tmpl',
  })[provider];
  if (!tmplName) throw new Error(`unknown provider ${provider}`);
  const tmplPath = path.join(TEMPLATE_DIR, tmplName);
  const config = JSON.parse(fs.readFileSync(tmplPath, 'utf8'));
  const outDir = path.join(root, '.yuri-bootstrap');
  ensureDirNoFollow(root, outDir);
  const outPath = path.join(outDir, `${provider}.projection.json`);
  const rendered = {
    ...config,
    worktreeRoot: root,
    startCommand: composeWrapCommand(provider, root),
    skipPermissions: false,
    permissionMode: 'autoReview',
  };
  writeFileNoFollowAtomic(root, outPath, `${JSON.stringify(rendered, null, 2)}\n`, { mode: 0o644 });
  const isMain = root === path.resolve(CANONICAL_MAIN_ABS) || root === path.resolve(REPO_ROOT);
  if (!isMain) installPathShims(root, { providers: [provider] });
  return {
    provider,
    path: outPath,
    config: rendered,
    launchCommand: composeWrapCommand(provider, root),
    permissionMode: 'autoReview',
    skipPermissions: false,
    launcher: {
      startCommand: composeWrapCommand(provider, root),
      skipPermissions: false,
      permissionMode: 'autoReview',
    },
  };
}

function requireExplicitGovernanceFields(decision) {
  const required = [
    'reversible', 'evidenceDecidable', 'inDoctrine', 'blastRadius',
    'outwardFacing', 'contended', 'arming', 'touchesSensitive',
  ];
  for (const k of required) {
    if (decision[k] === undefined) throw new Error(`governance field missing: ${k}`);
  }
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

function observeGitBase(worktreeRoot) {
  const commit = git(worktreeRoot, ['rev-parse', 'HEAD']);
  const tree = git(worktreeRoot, ['rev-parse', 'HEAD^{tree}']);
  return {
    commit: commit.code === 0 ? commit.out : null,
    tree: tree.code === 0 ? tree.out : null,
  };
}

function rehashSpineFromAttested(cwd, attestedSpine = []) {
  return (attestedSpine || []).map((s) => {
    const p = path.join(cwd, s.path);
    let observedSha256 = null;
    try {
      if (fs.existsSync(p)) observedSha256 = sha256File(p);
    } catch {
      observedSha256 = null;
    }
    return { path: s.path, observedSha256 };
  });
}

function spineHashesDrift(attestedSpine, liveSpine) {
  if (!Array.isArray(attestedSpine) || attestedSpine.length === 0) return false;
  const live = new Map((liveSpine || []).map((x) => [x.path, x.observedSha256]));
  for (const s of attestedSpine) {
    if (live.get(s.path) !== s.observedSha256) return true;
  }
  return false;
}

/**
 * F2 — pure pre-spawn TOCTOU decision (injectable observeFn for tests).
 * Compares FINAL observeGitBase commit+tree (+spineHashes if attested carries them)
 * to the ATTEST-time receipt base. Drift => hold/exit78/no-spawn.
 */
export function prespawnDecision({ cwd, attested, observeFn = observeGitBase } = {}) {
  const observed = observeFn(cwd) || {};
  const commit = observed.commit ?? null;
  const tree = observed.tree ?? null;
  const details = [];
  if (!commit || !tree) details.push('base_unobserved');
  if (commit !== attested?.observedBaseCommit) details.push('commit_drift');
  if (tree !== attested?.observedBaseTree) details.push('tree_drift');
  if (Array.isArray(attested?.spineHashes) && attested.spineHashes.length > 0) {
    const live = observed.spineHashes || rehashSpineFromAttested(cwd, attested.spineHashes);
    if (spineHashesDrift(attested.spineHashes, live)) details.push('spine_drift');
    observed.spineHashes = live;
  }
  if (details.length > 0) {
    return {
      action: 'hold',
      code: EXIT_HOLD,
      reason: 'TOCTOU_prespawn_drift',
      detail: details.join(','),
      observed,
    };
  }
  return { action: 'spawn', code: 0, reason: null, detail: null, observed };
}

/**
 * F3 — fail-closed persistence of attestation receipt under
 * <worktreeRoot>/.yuri-bootstrap/attestation-receipt.json (never .yuri-bootstrap-bin).
 * Conformance: uses ensureDirNoFollow + writeFileNoFollowAtomic (O_NOFOLLOW|O_CREAT|O_EXCL
 * temp + fsync + rename + realpath-within-root) — same primitive as F4 render writes.
 * Symlink dir/file or escape or write failure => not ok / HOLD path.
 */
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

export function emitReceiptTranscript(receipt, write = (s) => process.stderr.write(s)) {
  const line = JSON.stringify({
    ruling: receipt?.ruling ?? null,
    hmac: receipt?.hmac ?? null,
    observedBaseCommit: receipt?.observedBaseCommit ?? null,
    observedBaseTree: receipt?.observedBaseTree ?? null,
    correlationId: receipt?.correlationId || CORRELATION_ID,
    epoch: receipt?.epoch ?? null,
  });
  write(`yuri-worktree-bootstrap: receipt ${line}\n`);
}

function enrichReceiptFromBootstrap({
  cwd,
  bootstrapResult,
  observed,
  ruling,
  failures,
  attestKey,
  computeFn = computeAttestationReceipt,
}) {
  const prior = bootstrapResult?.receipt || {};
  const { receipt, hmac, error } = computeFn({
    worktreeRoot: cwd,
    observedBaseCommit: observed?.commit ?? prior.observedBaseCommit,
    observedBaseTree: observed?.tree ?? prior.observedBaseTree,
    spineHashes: observed?.spineHashes ?? prior.spineHashes ?? [],
    links: prior.links || [],
    failures,
    ruling,
    key: attestKey,
    epoch: Date.now(),
  });
  const nextFailures = error
    ? [...failures, { code: 'hmac_key_missing', detail: error }]
    : failures;
  const finalRuling = (!error && ruling === 'READY' && nextFailures.length === 0) ? 'READY' : 'HOLD';
  return {
    ...receipt,
    ruling: finalRuling,
    hmac: error ? null : hmac,
    failures: nextFailures,
    skillAdmission: prior.skillAdmission,
    governance: prior.governance,
    expectedUpstreamRef: prior.expectedUpstreamRef,
    launchCommand: prior.launchCommand,
    sandbox: prior.sandbox,
    wiring: prior.wiring,
  };
}

/**
 * F2+F3 orchestrator: pre-spawn re-observe, recompute receipt on FINAL state,
 * persist fail-closed, emit transcript. spawn===true only after READY persist ok.
 */
export function finalizeWrapLaunch({
  cwd,
  bootstrapResult,
  observeFn = observeGitBase,
  persistFn = persistAttestationReceipt,
  computeFn = computeAttestationReceipt,
  attestKey = process.env.YURI_ATTEST_KEY,
  emitFn = emitReceiptTranscript,
} = {}) {
  const attested = {
    observedBaseCommit: bootstrapResult?.receipt?.observedBaseCommit,
    observedBaseTree: bootstrapResult?.receipt?.observedBaseTree,
    spineHashes: bootstrapResult?.receipt?.spineHashes || [],
  };

  if (bootstrapResult?.ruling !== 'READY') {
    const receipt = bootstrapResult.receipt;
    const persist = persistFn({ worktreeRoot: cwd, receipt });
    emitFn(receipt);
    return {
      action: 'hold',
      code: EXIT_HOLD,
      reason: 'bootstrap_hold',
      receipt,
      persist,
      spawn: false,
    };
  }

  const decision = prespawnDecision({ cwd, attested, observeFn });
  if (decision.action === 'hold') {
    const failures = [
      ...(bootstrapResult.failures || []),
      { code: 'TOCTOU_prespawn_drift', detail: decision.detail || decision.reason },
    ];
    const receipt = enrichReceiptFromBootstrap({
      cwd,
      bootstrapResult,
      observed: decision.observed,
      ruling: 'HOLD',
      failures,
      attestKey,
      computeFn,
    });
    const persist = persistFn({ worktreeRoot: cwd, receipt });
    emitFn(receipt);
    return {
      action: 'hold',
      code: EXIT_HOLD,
      reason: 'TOCTOU_prespawn_drift',
      receipt,
      persist,
      decision,
      spawn: false,
    };
  }

  const receipt = enrichReceiptFromBootstrap({
    cwd,
    bootstrapResult,
    observed: decision.observed,
    ruling: 'READY',
    failures: [],
    attestKey,
    computeFn,
  });
  if (receipt.ruling !== 'READY' || !receipt.hmac) {
    const persist = persistFn({ worktreeRoot: cwd, receipt: { ...receipt, ruling: 'HOLD' } });
    emitFn({ ...receipt, ruling: 'HOLD' });
    return {
      action: 'hold',
      code: EXIT_HOLD,
      reason: 'receipt_recompute_failed',
      receipt: { ...receipt, ruling: 'HOLD' },
      persist,
      decision,
      spawn: false,
    };
  }

  const persist = persistFn({ worktreeRoot: cwd, receipt });
  emitFn(receipt);
  if (!persist.ok) {
    return {
      action: 'hold',
      code: EXIT_HOLD,
      reason: persist.code || 'receipt_persist_failed',
      receipt,
      persist,
      decision,
      spawn: false,
    };
  }

  return {
    action: 'spawn',
    code: 0,
    reason: null,
    receipt,
    persist,
    decision,
    spawn: true,
  };
}

function rejectDisconnectedHistory(worktreeRoot, expectedUpstream, observedCommit) {
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

export function bootstrapWorktree({
  worktreeRoot,
  provider = 'cursor',
  observedBaseCommit = null,
  octoberIdentity = null,
  manifestPath = MANIFEST_PATH,
  attestKey = process.env.YURI_ATTEST_KEY,
  writeConfigs = true,
  requireOctoberIdentity = false,
} = {}) {
  const failures = [];
  const root = path.resolve(worktreeRoot);
  const manifest = loadManifest(manifestPath);
  const expectedUpstream = manifest.expectedUpstreamRef || manifest.expectedUpstreamCommit;

  const observed = observeGitBase(root);
  const baseCommit = observedBaseCommit || observed.commit;
  if (!baseCommit || !observed.tree) {
    failures.push({ code: 'base_unobserved', detail: 'cannot observe worktree HEAD/tree' });
  }
  if (observedBaseCommit && observed.commit && observedBaseCommit !== observed.commit) {
    failures.push({ code: 'TOCTOU_base_drift', detail: `observed ${observed.commit} != attested ${observedBaseCommit}` });
  }
  const hist = rejectDisconnectedHistory(root, expectedUpstream, baseCommit);
  if (!hist.ok) failures.push({ code: 'disconnected_history', detail: hist.reason });

  const idCheck = octoberIdentity || octoberIdentityPresent();
  if (requireOctoberIdentity && !idCheck.attached) {
    failures.push({ code: 'october_identity', detail: 'OCTOBER_BUS_* required but absent' });
  } else if (!idCheck.ok) {
    failures.push({ code: 'october_identity', detail: idCheck.reason || 'incomplete-OCTOBER_BUS' });
  }

  const spineHashes = [];
  for (const sf of manifest.spineFiles || []) {
    const p = path.join(root, sf.path);
    if (!fs.existsSync(p)) {
      if (sf.required !== false) failures.push({ code: 'spine_missing', path: sf.path });
      continue;
    }
    const observedSha = sha256File(p);
    const matches = observedSha === sf.sha256;
    spineHashes.push({ path: sf.path, observedSha256: observedSha, matchesManifest: matches });
    if (!matches) failures.push({ code: 'manifest_hash_mismatch', path: sf.path });
  }

  let rendered = null;
  if (writeConfigs) {
    try {
      rendered = renderProviderConfig(provider, root);
    } catch (e) {
      failures.push({ code: 'render_failed', detail: String(e.message || e) });
    }
  }

  let gov = null;
  try {
    const decision = {
      id: `worktree-prelaunch:${provider}`,
      reversible: true,
      evidenceDecidable: true,
      inDoctrine: true,
      blastRadius: 'LOW',
      outwardFacing: false,
      contended: false,
      arming: false,
      touchesSensitive: false,
      files: rendered ? [rendered.path] : [],
      transition: 'worktree-prelaunch',
    };
    requireExplicitGovernanceFields(decision);
    gov = evaluateGovernance(decision);
    if (gov.class !== CLASS.SELF) failures.push({ code: 'governance_hold', detail: gov.ruling });
  } catch (e) {
    failures.push({ code: 'governance_throw', detail: String(e.message || e) });
  }

  if (provider === 'cursor') {
    const cfg = rendered?.config || (fs.existsSync(path.join(root, '.cursor/cli.json'))
      ? JSON.parse(fs.readFileSync(path.join(root, '.cursor/cli.json'), 'utf8'))
      : null);
    if (!cfg) failures.push({ code: 'cursor_config_missing', detail: 'no cursor cli.json' });
    else {
      const v = validateCursorCli(cfg, root);
      if (!v.ok) failures.push({ code: 'validateCursorCli', violations: v.violations });
    }
  }

  const launcher = rendered?.launcher || {
    startCommand: rendered?.launchCommand || composeWrapCommand(provider, root),
    skipPermissions: rendered?.skipPermissions ?? false,
    permissionMode: rendered?.permissionMode ?? 'autoReview',
  };
  const lv = validateLauncherConfig(launcher);
  if (!lv.ok) failures.push({ code: 'validateLauncherConfig', violations: lv.violations });

  const isolation = checkProtectedIsolation(root);
  if (!isolation.ok) failures.push({ code: 'protected_isolation', leaks: isolation.leaks });

  const includePath = fs.existsSync(path.join(root, '.worktreeinclude'))
    ? path.join(root, '.worktreeinclude')
    : path.join(REPO_ROOT, '.worktreeinclude');
  const includeCheck = assertWorktreeincludeExcludesSecrets(includePath);
  if (!includeCheck.ok) failures.push({ code: 'worktreeinclude', violations: includeCheck.violations });

  let skillAdmission = 'OK';
  try {
    scanLiveSkills(root);
    buildActivationPlan(root);
  } catch {
    skillAdmission = 'SKILL_ADMISSION_DEGRADED';
  }
  try {
    const reg = loadRegistry();
    validateRegistry(reg, { checkHashes: false });
    sparseBootstrapPlan(reg);
    renderProvider('claude-code', reg);
  } catch {
    skillAdmission = 'SKILL_ADMISSION_DEGRADED';
  }

  let ruling = failures.length === 0 ? 'READY' : 'HOLD';
  const { receipt, hmac, error: hmacError } = computeAttestationReceipt({
    worktreeRoot: root,
    observedBaseCommit: baseCommit,
    observedBaseTree: observed.tree,
    spineHashes,
    links: isolation.links,
    failures,
    ruling,
    key: attestKey,
  });
  if (hmacError) {
    failures.push({ code: 'hmac_key_missing', detail: hmacError });
  }
  ruling = failures.length === 0 ? 'READY' : 'HOLD';
  const finalReceipt = {
    ...receipt,
    ruling,
    hmac,
    skillAdmission,
    governance: gov ? { class: gov.class, decisionId: gov.decisionId } : null,
    expectedUpstreamRef: expectedUpstream,
    launchCommand: rendered?.launchCommand || composeWrapCommand(provider, root),
    sandbox: recommendedSandboxStub(),
    wiring: {
      primary: 'W2 PATH-shim (.yuri-bootstrap-bin) — agentLaunchCommand is PATH basename',
      secondary: 'W1 startCommand wrap — fireStartup index.js:16188-16201',
      agentLaunchCommand: 'October index.js:10455-10456 returns PATH basename not absolute',
      injectResumeNote: 'usableFb requires first token === AGENT_BINARY; wrapper needs W2',
    },
  };

  return { ruling, receipt: finalReceipt, failures, hmac, rendered };
}

export function recommendedSandboxStub() {
  return {
    status: 'STUB',
    platform: process.platform,
    recommendation: process.platform === 'darwin'
      ? 'sandbox-exec profile denying network + protected path writes (v1 ships stub only)'
      : 'OS sandbox recommended; not armed in v1',
  };
}

/** F5 — October 1.0.32 asar evidence anchors (read-only extract). */
export const OCTOBER_ASAR_EVIDENCE = Object.freeze({
  appVersion: '1.0.32',
  extractPath: '/private/tmp/october-asar-extract-53370/out/main/index.js',
  extraPaths: '1510-1512',
  hardenedPath: '1578-1583',
  terminalEnv: '1599-1608',
  resolveBin: '1622-1632',
  agentLaunchCommand: '10455-10457',
  fireStartupStartCommand: '16188-16201',
  injectResumeUsableFb: '16099-16100',
});

/**
 * F5 — model October terminalEnv/hardenedPath PATH composition:
 * process.env.PATH parts + extraPaths() appended. Does NOT prepend worktree .yuri-bootstrap-bin.
 */
export function octoberHardenedPathModel({
  envPath = process.env.PATH || '',
  extraPaths = [],
  platform = process.platform,
} = {}) {
  const sep = platform === 'win32' ? ';' : ':';
  const parts = String(envPath).split(sep).filter(Boolean);
  for (const p of extraPaths) {
    if (p && !parts.includes(p)) parts.push(p);
  }
  return parts.join(sep);
}

/** First-hit PATH resolution (shell-equivalent for basename). */
export function resolveOnPath(basename, pathStr, {
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  const sep = platform === 'win32' ? ';' : ':';
  for (const dir of String(pathStr).split(sep).filter(Boolean)) {
    const full = path.join(dir, basename);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * F5 — W2 assessment: would worktree .yuri-bootstrap-bin win on October's modeled PATH?
 */
export function assessPathInterposition({
  worktreeRoot,
  agentBin = 'cursor-agent',
  envPath = process.env.PATH || '',
  extraPaths = [],
  platform = process.platform,
  existsSync = fs.existsSync,
} = {}) {
  const root = path.resolve(worktreeRoot);
  const shimDir = path.join(root, '.yuri-bootstrap-bin');
  const shimPath = path.join(shimDir, agentBin);
  const modeled = octoberHardenedPathModel({ envPath, extraPaths, platform });
  const sep = platform === 'win32' ? ';' : ':';
  const shimOnModeledPath = modeled.split(sep).includes(shimDir);
  const resolved = resolveOnPath(agentBin, modeled, { platform, existsSync });
  const shimFirst = !!(resolved && path.resolve(resolved) === path.resolve(shimPath));
  return {
    mechanism: 'W2_PATH_shim',
    status: shimFirst ? 'EFFECTIVE' : 'INEFFECTIVE_AS_IMPLEMENTED',
    shimDir,
    shimPath,
    shimExists: existsSync(shimPath),
    shimOnModeledPath,
    resolvedExecutable: resolved,
    modeledPath: modeled,
    evidence: OCTOBER_ASAR_EVIDENCE,
    note: 'October terminalEnv PATH=hardenedPath(env.PATH + extraPaths); worktree shim dir is not prepended',
  };
}

/**
 * F5 — W1 assessment against October fireStartup/injectResume rules.
 * Field October reads: p.startCommand (node/terminal payload), NOT cli.json.
 */
export function assessStartCommandInterposition({
  wrapCommand,
  agentBinary = 'cursor-agent',
  autoBoot = true,
} = {}) {
  const first = String(wrapCommand || '').trim().split(/\s+/)[0] || '';
  const usableFb = first === agentBinary;
  let status;
  let octoberExecPath;
  if (!autoBoot) {
    status = 'W1_VIABLE_IF_NODE_SETS_startCommand';
    octoberExecPath = 'fireStartup else-if p.startCommand (asar:16188-16201) writes wrap verbatim';
  } else if (usableFb) {
    status = 'W1_USABLE_FB_WHEN_FIRST_TOKEN_IS_AGENT_BINARY';
    octoberExecPath = 'injectResume usableFb (asar:16099-16100)';
  } else {
    status = 'W1_BYPASSED_ON_AUTOBOOT_FOR_NODE_WRAP';
    octoberExecPath = 'injectResume prefers decided.command=agentLaunchCommand basename when usableFb=false';
  }
  return {
    mechanism: 'W1_startCommand',
    status,
    octoberField: 'p.startCommand',
    autoBoot,
    wrapFirstToken: first,
    usableFb,
    octoberExecPath,
    evidence: OCTOBER_ASAR_EVIDENCE,
    note: 'cli.json cannot carry startCommand (schema); W1 requires October node/terminal startCommand field',
  };
}

/**
 * F5 — consolidated interposition verdict for sealed receipt / owner escalation.
 */
export function assessInterposition({
  worktreeRoot = REPO_ROOT,
  provider = 'cursor',
  autoBoot = true,
  envPath = process.env.PATH || '',
  extraPaths = [],
  wrapCommand = null,
} = {}) {
  const wrap = wrapCommand || composeWrapCommand(provider, worktreeRoot);
  const w2 = assessPathInterposition({ worktreeRoot, envPath, extraPaths });
  const w1 = assessStartCommandInterposition({ wrapCommand: wrap, autoBoot });
  let overall;
  if (w2.status === 'EFFECTIVE') overall = 'W2_EFFECTIVE';
  else if (!autoBoot && w1.status === 'W1_VIABLE_IF_NODE_SETS_startCommand') overall = 'W1_REQUIRED_NON_AUTOBOOT';
  else overall = 'NEITHER_EFFECTIVE_ON_TYPICAL_AUTOBOOT';
  return {
    w2,
    w1,
    wrapCommand: wrap,
    overall,
    ownerEscalationRequired: overall === 'NEITHER_EFFECTIVE_ON_TYPICAL_AUTOBOOT',
    liveProofRequired: true,
    unitGreenIsNotInterpositionProof: true,
  };
}

function runWrap(argv) {
  const providerIdx = argv.indexOf('--provider');
  const provider = providerIdx >= 0 ? argv[providerIdx + 1] : 'cursor';
  const dash = argv.indexOf('--');
  const realCmd = dash >= 0 ? argv.slice(dash + 1) : [];
  if (realCmd.length === 0) {
    process.stderr.write('yuri-worktree-bootstrap --wrap requires -- <realAgentCmd...>\n');
    process.exit(EXIT_HOLD);
  }

  const id = octoberIdentityPresent();
  if (!id.ok) {
    process.stderr.write(`yuri-worktree-bootstrap: ${id.reason}; refusing launch\n`);
    process.exit(EXIT_HOLD);
  }

  const cwd = process.cwd();
  const result = bootstrapWorktree({
    worktreeRoot: cwd,
    provider,
    writeConfigs: true,
    // wrap path: partial identity already vetoed; absent identity allowed for local CLI tests
  });

  // F2+F3: pre-spawn re-observe, persist receipt bound to FINAL state, spawn only after persist
  const final = finalizeWrapLaunch({
    cwd,
    bootstrapResult: result,
    attestKey: process.env.YURI_ATTEST_KEY,
  });

  if (!final.spawn) {
    if (final.reason === 'TOCTOU_prespawn_drift') {
      process.stderr.write('yuri-worktree-bootstrap: HOLD (TOCTOU_prespawn_drift)\n');
    } else if (final.reason === 'bootstrap_hold') {
      process.stderr.write(`yuri-worktree-bootstrap: HOLD (${(result.failures || []).map((f) => f.code).join(',')})\n`);
    } else {
      process.stderr.write(`yuri-worktree-bootstrap: HOLD (${final.reason})\n`);
    }
    process.exit(EXIT_HOLD);
  }

  const child = spawn(realCmd[0], realCmd.slice(1), { stdio: 'inherit', env: process.env, cwd });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--wrap')) return runWrap(argv);
  if (argv.includes('--attest') || argv.includes('--bootstrap')) {
    const rootIdx = argv.indexOf('--root');
    const root = rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd();
    const pIdx = argv.indexOf('--provider');
    const prov = pIdx >= 0 ? argv[pIdx + 1] : 'cursor';
    const result = bootstrapWorktree({ worktreeRoot: root, provider: prov });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ruling === 'READY' ? 0 : EXIT_HOLD);
  }
  process.stdout.write(`Usage:
  node _SYSTEM/Scripts/yuri-worktree-bootstrap.mjs --wrap --provider <p> -- <realAgentCmd...>
  node _SYSTEM/Scripts/yuri-worktree-bootstrap.mjs --attest [--root <path>] [--provider <p>]
`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { sha256File, loadManifest, PROTECTED_PATTERNS, isProtectedPath };
