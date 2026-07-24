#!/usr/bin/env node
/**
 * Backend DB readiness recovery-metadata integration (ephemeral / protected-surface clean).
 * correlationId=yuri-post-restoration-backend-readiness-v1
 *
 * Atlas/Apollo HOLD v4:
 * - Redirect BOTH <repo>/_SYSTEM/backend/data AND <repo>/backend/data to DISTINCT ephemeral mirrors
 * - HARD-DENY <repo>/.claude/projects (+ real-home .claude/projects) and exact .env files
 * - Child env: HOME+TMPDIR=ephemeral; minimal trusted PATH; no NODE_PATH; no process.env spread
 * - Executable import-closure fs-method census; wrap every surfaced method (incl. statfsSync)
 * - LIVE_BIND remains HELD (owner-relaunch-gated); do not claim PASS from executor bind alone
 * - v5/v6: YURI_MEMORY_DB_PATH absolute ephemeral DB (native sqlite bypasses JS fs guard);
 *   session/token dirs ephemeral; executable SystemConfig resolve-denial + Database() open proofs
 * - v8: tracking wrapper around REAL better-sqlite3 (record path, native construct);
 *   WAL/SHM family under EPH; exact server wiring guards (not full server startup)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND_ROOT = path.join(REPO_ROOT, '_SYSTEM/backend');
const BACKEND_SRC = path.join(BACKEND_ROOT, 'src');
const SYSTEM_BACKEND_DATA = path.join(REPO_ROOT, '_SYSTEM', 'backend', 'data');
const REPO_BACKEND_DATA = path.join(REPO_ROOT, 'backend', 'data');
const CLAUDE_PROJECTS_REPO = path.join(REPO_ROOT, '.claude', 'projects');
const CLAUDE_PROJECTS_HOME = path.join(os.homedir(), '.claude', 'projects');
const ENV_FILE_REPO = path.join(REPO_ROOT, '.env');
const ENV_FILE_BACKEND = path.join(BACKEND_ROOT, '.env');
const PORT = 3358;
const API_KEY = 'test-api-key-123456';
const SERVER_READY = /YURI_BACKEND_ONLINE/;
const EXIT_HOLD_LIVE_BIND = 78;
/** v5: Apollo forbids live bind until v5 design clear — force DESIGN-ONLY. */
const LIVE_BIND_ENABLED = false;
/** Minimal trusted system PATH — spawn uses absolute process.execPath; ts-node via createRequire. */
const TRUSTED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const CANONICAL_MEMORY_DB = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'memory.db');

const ephemeralRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-backend-readiness-'));
const ephemeralLogs = path.join(ephemeralRoot, 'logs');
const mirrorSystemData = path.join(ephemeralRoot, 'mirror-system-backend-data');
const mirrorRepoData = path.join(ephemeralRoot, 'mirror-backend-data');
const ephemeralMemoryDb = path.join(ephemeralRoot, 'memory-ephemeral.db');
const tokenLedgerQueueDir = path.join(ephemeralRoot, 'token-ledger-queue');
const tokenTelemetryDir = path.join(ephemeralRoot, 'token-telemetry');
const bootstrapPath = path.join(ephemeralRoot, 'bootstrap-readiness.cjs');
const guardProbePath = path.join(ephemeralRoot, 'guard-bypass-probe.cjs');
const dbContainmentProbePath = path.join(ephemeralRoot, 'db-containment-probe.cjs');
const synthRedirectProbePath = path.join(ephemeralRoot, 'synth-redirect-probe.cjs');
let child = null;

/** Methods the shared guard must wrap (sync + callback twins + streams + promises). */
const GUARD_WRAP_SPEC = {
  syncOne: [
    'accessSync', 'existsSync', 'statSync', 'lstatSync', 'statfsSync', 'readFileSync', 'writeFileSync',
    'appendFileSync', 'mkdirSync', 'readdirSync', 'openSync', 'rmSync', 'unlinkSync', 'realpathSync',
    'chmodSync', 'truncateSync', 'readlinkSync',
  ],
  syncTwo: ['copyFileSync', 'renameSync', 'linkSync', 'symlinkSync'],
  callbackOne: [
    'access', 'exists', 'stat', 'lstat', 'statfs', 'readFile', 'writeFile', 'appendFile', 'mkdir',
    'readdir', 'open', 'rm', 'unlink', 'realpath', 'chmod', 'truncate', 'readlink',
  ],
  callbackTwo: ['copyFile', 'rename', 'link', 'symlink'],
  streams: ['createReadStream', 'createWriteStream'],
  promisesOne: [
    'access', 'readFile', 'writeFile', 'appendFile', 'mkdir', 'readdir', 'stat', 'lstat', 'statfs',
    'open', 'rm', 'unlink', 'realpath', 'chmod', 'truncate', 'readlink',
  ],
  promisesTwo: ['copyFile', 'rename', 'link', 'symlink'],
};

function guardedMethodNames() {
  const names = new Set();
  for (const n of GUARD_WRAP_SPEC.syncOne) names.add(n);
  for (const n of GUARD_WRAP_SPEC.syncTwo) names.add(n);
  for (const n of GUARD_WRAP_SPEC.callbackOne) names.add(n);
  for (const n of GUARD_WRAP_SPEC.callbackTwo) names.add(n);
  for (const n of GUARD_WRAP_SPEC.streams) names.add(n);
  for (const n of GUARD_WRAP_SPEC.promisesOne) names.add(`promises.${n}`);
  for (const n of GUARD_WRAP_SPEC.promisesTwo) names.add(`promises.${n}`);
  return names;
}

/**
 * Executable import-closure census: every fs.<method> / named import from fs|node:fs|fs/promises
 * under backend/src (excluding type-only names).
 */
function censusBackendFsMethods(srcRoot) {
  const skip = new Set([
    'Dirent', 'Stats', 'ReadStream', 'WriteStream', 'promises', 'constants', 'default',
    'F_OK', 'R_OK', 'W_OK', 'X_OK',
  ]);
  const found = new Set();
  const stack = [srcRoot];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === 'dist') continue;
        stack.push(full);
        continue;
      }
      if (!ent.isFile() || !/\.(ts|js|mjs|cjs)$/.test(ent.name)) continue;
      if (/\.test\.(ts|js)$/.test(ent.name)) continue; // tests are not server import closure
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(/\bfs\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
        if (!skip.has(m[1])) found.add(m[1]);
      }
      for (const m of text.matchAll(/\bfs\.promises\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
        if (!skip.has(m[1])) found.add(`promises.${m[1]}`);
      }
      for (const m of text.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*['"](?:node:)?fs(?:\/promises)?['"]/g,
      )) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name && !skip.has(name)) {
            if (/fs\/promises/.test(m[0])) found.add(`promises.${name}`);
            else found.add(name);
          }
        }
      }
    }
  }
  return found;
}

const FS_GUARD_CORE = `
function pathLikeToString(candidate) {
  if (candidate == null) return null;
  if (typeof candidate === 'string') return candidate;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(candidate)) return candidate.toString();
  if (typeof URL !== 'undefined' && candidate instanceof URL) {
    if (candidate.protocol !== 'file:') return null;
    return fileURLToPath(candidate);
  }
  if (typeof candidate === 'object' && typeof candidate.href === 'string' && /^file:/i.test(candidate.href)) {
    try { return fileURLToPath(candidate.href); } catch { return null; }
  }
  return null;
}

function matchesPrefix(resolved, prefix) {
  return resolved === prefix || resolved.startsWith(prefix + path.sep);
}

function isHardDenied(candidate, hardDenyPrefixes, hardDenyFiles) {
  const asString = pathLikeToString(candidate);
  if (asString == null) return false;
  const resolved = path.resolve(asString);
  for (const file of hardDenyFiles) {
    if (resolved === path.resolve(file)) return 'file:' + resolved;
  }
  for (const prefix of hardDenyPrefixes) {
    if (matchesPrefix(resolved, path.resolve(prefix))) return 'prefix:' + resolved;
  }
  return false;
}

function findRedirect(candidate, redirectRules) {
  const asString = pathLikeToString(candidate);
  if (asString == null) return null;
  const resolved = path.resolve(asString);
  for (const rule of redirectRules) {
    const prefix = path.resolve(rule.prefix);
    if (!matchesPrefix(resolved, prefix)) continue;
    const rel = resolved === prefix ? '' : path.relative(prefix, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { deny: resolved };
    const mapped = rel ? path.join(rule.mirror, rel) : rule.mirror;
    return { mapped, resolved, prefix };
  }
  return null;
}

function rewriteOrThrow(op, candidate, policy, report) {
  const denied = isHardDenied(candidate, policy.hardDenyPrefixes, policy.hardDenyFiles);
  if (denied) {
    const msg = 'PROTECTED_HARD_DENY:' + op + ':' + denied;
    if (report) report(msg);
    const err = new Error(msg);
    err.code = 'PROTECTED_HARD_DENY';
    throw err;
  }
  const hit = findRedirect(candidate, policy.redirectRules);
  if (!hit) return candidate;
  if (hit.deny) {
    const msg = 'PROTECTED_PREFIX_ACCESS_DENIED:' + op + ':' + hit.deny;
    if (report) report(msg);
    const err = new Error(msg);
    err.code = 'PROTECTED_PREFIX';
    throw err;
  }
  if (report) report('PROTECTED_PREFIX_REDIRECT:' + op + ':' + hit.resolved + '->' + hit.mapped);
  if (typeof URL !== 'undefined' && candidate instanceof URL) return pathToFileURL(hit.mapped);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(candidate)) return Buffer.from(hit.mapped);
  return hit.mapped;
}

function installFsGuard(fs, opts) {
  const { policy, report, wrapSpec } = opts;
  const attestation = { rewriteCount: 0, hardDenyCount: 0, origPathSamples: [], wrapped: [] };

  function rewriteArg(op, value) {
    const before = pathLikeToString(value);
    try {
      const next = rewriteOrThrow(op, value, policy, report);
      const after = pathLikeToString(next);
      if (before && after && path.resolve(before) !== path.resolve(after)) attestation.rewriteCount += 1;
      return next;
    } catch (err) {
      if (err && err.code === 'PROTECTED_HARD_DENY') attestation.hardDenyCount += 1;
      throw err;
    }
  }

  function rewritePathArgs(op, args, pathIndexes) {
    const next = args.slice();
    for (const idx of pathIndexes) {
      if (idx >= next.length) continue;
      const v = next[idx];
      if (typeof v === 'function') continue;
      if (pathLikeToString(v) == null && !(typeof URL !== 'undefined' && v instanceof URL) && !(Buffer.isBuffer && Buffer.isBuffer(v))) continue;
      next[idx] = rewriteArg(op + '#' + idx, v);
    }
    return next;
  }

  function recordOrig(op, args, pathIndexes) {
    for (const idx of pathIndexes) {
      if (idx >= args.length) continue;
      const s = pathLikeToString(args[idx]);
      if (s == null) continue;
      const resolved = path.resolve(s);
      attestation.origPathSamples.push(op + ':' + resolved);
      for (const rule of policy.redirectRules) {
        const prefix = path.resolve(rule.prefix);
        if (resolved === prefix || resolved.startsWith(prefix + path.sep)) {
          const msg = 'GUARD_FAILURE_ORIG_SAW_PROTECTED:' + op + ':' + resolved;
          if (report) report(msg);
          throw new Error(msg);
        }
      }
      for (const prefix of policy.hardDenyPrefixes) {
        const p = path.resolve(prefix);
        if (resolved === p || resolved.startsWith(p + path.sep)) {
          const msg = 'GUARD_FAILURE_ORIG_SAW_HARD_DENY:' + op + ':' + resolved;
          if (report) report(msg);
          throw new Error(msg);
        }
      }
      for (const file of policy.hardDenyFiles) {
        if (resolved === path.resolve(file)) {
          const msg = 'GUARD_FAILURE_ORIG_SAW_HARD_DENY_FILE:' + op + ':' + resolved;
          if (report) report(msg);
          throw new Error(msg);
        }
      }
    }
  }

  function wrapNamed(target, name, pathIndexes, label) {
    if (typeof target[name] !== 'function') return false;
    const orig = target[name].bind(target);
    target[name] = function guarded(...args) {
      const rewritten = rewritePathArgs(name, args, pathIndexes);
      recordOrig(name, rewritten, pathIndexes);
      return orig(...rewritten);
    };
    attestation.wrapped.push(label || name);
    return true;
  }

  for (const n of wrapSpec.syncOne) wrapNamed(fs, n, [0], n);
  for (const n of wrapSpec.syncTwo) wrapNamed(fs, n, [0, 1], n);
  for (const n of wrapSpec.callbackOne) wrapNamed(fs, n, [0], n);
  for (const n of wrapSpec.callbackTwo) wrapNamed(fs, n, [0, 1], n);
  for (const n of wrapSpec.streams) wrapNamed(fs, n, [0], n);
  if (fs.promises) {
    for (const n of wrapSpec.promisesOne) wrapNamed(fs.promises, n, [0], 'promises.' + n);
    for (const n of wrapSpec.promisesTwo) wrapNamed(fs.promises, n, [0, 1], 'promises.' + n);
  }
  return attestation;
}
`;

const POLICY_JSON_BOOT = `
const policy = {
  redirectRules: [
    { prefix: process.env.YURI_REDIRECT_SYSTEM_DATA_PREFIX, mirror: process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR },
    { prefix: process.env.YURI_REDIRECT_REPO_DATA_PREFIX, mirror: process.env.YURI_REDIRECT_REPO_DATA_MIRROR },
  ],
  hardDenyPrefixes: JSON.parse(process.env.YURI_HARD_DENY_PREFIXES_JSON || '[]'),
  hardDenyFiles: JSON.parse(process.env.YURI_HARD_DENY_FILES_JSON || '[]'),
};
const wrapSpec = JSON.parse(process.env.YURI_FS_WRAP_SPEC_JSON);
`;

const BOOTSTRAP_SOURCE = `'use strict';
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const { pathToFileURL, fileURLToPath } = require('url');

const REPO_ROOT = process.env.YURI_ROOT;
const EPH_ROOT = process.env.YURI_BACKEND_EPHEMERAL_ROOT;
if (!REPO_ROOT) throw new Error('YURI_ROOT required');
if (!EPH_ROOT) throw new Error('YURI_BACKEND_EPHEMERAL_ROOT required');
const backendPkg = path.join(REPO_ROOT, '_SYSTEM', 'backend', 'package.json');
const requireFromBackend = createRequire(backendPkg);

process.chdir(path.resolve(EPH_ROOT));
fs.mkdirSync(process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR, { recursive: true });
fs.mkdirSync(process.env.YURI_REDIRECT_REPO_DATA_MIRROR, { recursive: true });
fs.mkdirSync(path.join(path.resolve(EPH_ROOT), 'logs'), { recursive: true });

${POLICY_JSON_BOOT}
${FS_GUARD_CORE}

const attestation = installFsGuard(fs, {
  policy,
  wrapSpec,
  report: (msg) => console.error(msg),
});
process.on('exit', () => {
  console.error('⬡ READINESS_BOOTSTRAP :: guard_attestation rewriteCount=' + attestation.rewriteCount
    + ' hardDenyCount=' + attestation.hardDenyCount
    + ' wrapped=' + attestation.wrapped.length);
});

console.error('⬡ READINESS_BOOTSTRAP :: fs-guard armed; cwd=' + process.cwd() + '; eph=' + path.resolve(EPH_ROOT));
requireFromBackend('ts-node/register');
requireFromBackend(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'server.ts'));
`;

const GUARD_PROBE_SOURCE = `'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

const REPO_ROOT = process.env.YURI_ROOT;
const EPH_ROOT = process.env.YURI_BACKEND_EPHEMERAL_ROOT;
if (!REPO_ROOT || !EPH_ROOT) throw new Error('YURI_ROOT and YURI_BACKEND_EPHEMERAL_ROOT required');
const reports = [];

fs.mkdirSync(process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR, { recursive: true });
fs.mkdirSync(process.env.YURI_REDIRECT_REPO_DATA_MIRROR, { recursive: true });
fs.mkdirSync(path.join(path.resolve(EPH_ROOT), 'logs'), { recursive: true });

${POLICY_JSON_BOOT}
${FS_GUARD_CORE}

const attestation = installFsGuard(fs, {
  policy,
  wrapSpec,
  report: (msg) => { reports.push(msg); console.error(msg); },
});

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  if (!cond) {
    console.error('BYPASS_NEG_FAIL:' + name + ':' + (detail || ''));
    process.exitCode = 1;
  } else {
    console.error('BYPASS_NEG_PASS:' + name);
  }
}

(async () => {
  const systemPrefix = process.env.YURI_REDIRECT_SYSTEM_DATA_PREFIX;
  const repoPrefix = process.env.YURI_REDIRECT_REPO_DATA_PREFIX;
  const systemMirror = process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR;
  const repoMirror = process.env.YURI_REDIRECT_REPO_DATA_MIRROR;

  // DesignAssistantBridge startup path: backend/data/design-assistant mkdir must remap
  const designRoot = path.join(repoPrefix, 'design-assistant');
  fs.mkdirSync(designRoot, { recursive: true });
  fs.mkdirSync(path.join(designRoot, 'captures'), { recursive: true });
  ok('design_assistant_bridge_mkdir_redirect',
    reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:mkdirSync#0:') && r.includes(designRoot)),
    'design-assistant mkdir redirect missing');
  ok('design_assistant_landed_repo_mirror',
    fs.existsSync(path.join(repoMirror, 'design-assistant', 'captures')),
    'design-assistant captures missing under distinct repo-data mirror');
  ok('design_mirrors_are_distinct',
    path.resolve(systemMirror) !== path.resolve(repoMirror),
    'mirrors must be distinct paths');

  // system-backend-data redirect
  const sysFile = path.join(systemPrefix, 'bypass-neg-canary.txt');
  fs.writeFileSync(sysFile, 'sys', 'utf8');
  ok('system_data_write_redirect',
    reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:writeFileSync#0:') && r.includes(sysFile)),
    'system data write redirect missing');
  ok('system_data_landed_system_mirror',
    fs.readFileSync(path.join(systemMirror, 'bypass-neg-canary.txt'), 'utf8') === 'sys',
    'system canary missing under system mirror');

  // callback readFile on system prefix
  await new Promise((resolve, reject) => {
    fs.readFile(sysFile, 'utf8', (err, data) => {
      if (err) return reject(err);
      ok('callback_readFile_system_prefix',
        reports.some((r) => r.startsWith('PROTECTED_PREFIX_REDIRECT:readFile#0:')) && data === 'sys',
        'callback readFile redirect/data failed');
      resolve();
    });
  });

  // rename DEST → repo backend/data
  const src = path.join(repoMirror, 'bypass-neg-src.txt');
  fs.writeFileSync(src, 'src-ok', 'utf8');
  const renameDest = path.join(repoPrefix, 'bypass-neg-renamed.txt');
  fs.renameSync(src, renameDest);
  ok('rename_dest_repo_backend_data',
    reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:renameSync#1:')),
    'rename dest redirect missing');
  ok('rename_dest_landed_repo_mirror',
    fs.existsSync(path.join(repoMirror, 'bypass-neg-renamed.txt')),
    'rename dest missing under repo mirror');

  // URL arg
  const protectedUrl = pathToFileURL(sysFile);
  ok('url_arg_existsSync',
    fs.existsSync(protectedUrl) === true
      && reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:existsSync#0:')),
    'URL existsSync redirect failed');

  // Buffer arg
  const beforeBuf = reports.length;
  fs.existsSync(Buffer.from(sysFile));
  ok('buffer_arg_existsSync',
    reports.slice(beforeBuf).some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:existsSync#0:')),
    'Buffer existsSync redirect missing');

  // statfsSync must be wrapped (call on eph root — not protected — and confirm wrap installed)
  ok('statfsSync_wrapped', attestation.wrapped.includes('statfsSync'), 'statfsSync not in wrapped list');
  if (typeof fs.statfsSync === 'function') {
    const st = fs.statfsSync(path.resolve(EPH_ROOT));
    ok('statfsSync_callable', !!st, 'statfsSync call failed');
  } else {
    ok('statfsSync_callable', true, 'statfsSync absent on this node — wrap still registered');
  }

  // HARD-DENY .claude/projects
  let hardDenyProjects = false;
  try {
    fs.existsSync(path.join(policy.hardDenyPrefixes[0], 'canary'));
  } catch (err) {
    hardDenyProjects = /PROTECTED_HARD_DENY/.test(String(err && err.message));
  }
  ok('hard_deny_claude_projects', hardDenyProjects, 'expected HARD_DENY on .claude/projects');

  // HARD-DENY exact .env
  let hardDenyEnv = false;
  try {
    fs.readFileSync(policy.hardDenyFiles[0], 'utf8');
  } catch (err) {
    hardDenyEnv = /PROTECTED_HARD_DENY/.test(String(err && err.message));
  }
  ok('hard_deny_exact_dotenv', hardDenyEnv, 'expected HARD_DENY on exact .env');

  // orig never saw protected redirect prefixes or hard-deny targets
  const badOrig = attestation.origPathSamples.filter((s) => {
    const p = s.split(':').slice(1).join(':');
    if (p === path.resolve(systemPrefix) || p.startsWith(path.resolve(systemPrefix) + path.sep)) return true;
    if (p === path.resolve(repoPrefix) || p.startsWith(path.resolve(repoPrefix) + path.sep)) return true;
    for (const prefix of policy.hardDenyPrefixes) {
      const hp = path.resolve(prefix);
      if (p === hp || p.startsWith(hp + path.sep)) return true;
    }
    for (const file of policy.hardDenyFiles) {
      if (p === path.resolve(file)) return true;
    }
    return false;
  });
  ok('orig_never_saw_protected_operand', badOrig.length === 0, JSON.stringify(badOrig.slice(0, 8)));
  ok('rewrite_count_positive', attestation.rewriteCount > 0, 'rewriteCount=' + attestation.rewriteCount);
  ok('hard_deny_count_positive', attestation.hardDenyCount > 0, 'hardDenyCount=' + attestation.hardDenyCount);

  const summary = {
    pass: results.every((r) => r.pass),
    rewriteCount: attestation.rewriteCount,
    hardDenyCount: attestation.hardDenyCount,
    wrappedCount: attestation.wrapped.length,
    results,
  };
  process.stdout.write('BYPASS_NEG_SUMMARY=' + JSON.stringify(summary) + '\\n');
  if (!summary.pass) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const DB_CONTAINMENT_PROBE_SOURCE = `'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { createRequire } = require('module');
const { pathToFileURL, fileURLToPath } = require('url');

const REPO_ROOT = process.env.YURI_ROOT;
const EPH_ROOT = process.env.YURI_BACKEND_EPHEMERAL_ROOT;
const MEMORY_DB = process.env.YURI_MEMORY_DB_PATH;
const CONTAINMENT_MODULE = process.env.YURI_DB_FAMILY_CONTAINMENT
  || path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'backend-db-family-containment.cjs');
const CANONICAL = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'memory.db');
const PERSISTENT_BARE = path.join(REPO_ROOT, 'backend', 'data');
const PERSISTENT_SYSTEM_DATA = path.join(REPO_ROOT, '_SYSTEM', 'backend', 'data');
if (!REPO_ROOT || !EPH_ROOT || !MEMORY_DB) throw new Error('YURI_ROOT, EPH, YURI_MEMORY_DB_PATH required');
if (!path.isAbsolute(MEMORY_DB)) throw new Error('YURI_MEMORY_DB_PATH must be absolute');

const containment = require(CONTAINMENT_MODULE);
const {
  isHardenedDbFamilyMember,
  enumerateDbFamily,
  pathPresentNoFollow,
  legacyPathOnlyHardened,
  legacyEnumerateDbFamilyOmitNonHardened,
  assessDbFamilyMember,
} = containment;

const results = [];
const reports = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.error((cond ? 'DB_CONTAIN_PASS:' : 'DB_CONTAIN_FAIL:') + name + (detail ? ':' + detail : ''));
  if (!cond) process.exitCode = 1;
}

process.chdir(path.resolve(EPH_ROOT));
fs.mkdirSync(process.env.YURI_REDIRECT_REPO_DATA_MIRROR, { recursive: true });
fs.mkdirSync(process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR, { recursive: true });
fs.mkdirSync(path.join(path.resolve(EPH_ROOT), 'logs'), { recursive: true });
fs.mkdirSync(path.join(path.resolve(EPH_ROOT), 'data'), { recursive: true });

// Arm fs guard BEFORE any backend require / init (defense-in-depth; real defaults use SYSTEM.DATA)
${POLICY_JSON_BOOT}
${FS_GUARD_CORE}
const fsAttestation = installFsGuard(fs, {
  policy,
  wrapSpec,
  report: (msg) => { reports.push(msg); console.error(msg); },
});
console.error('⬡ DB_CONTAIN :: fs-guard armed before route/service requires');
ok('runtime_containment_module_loaded',
  typeof isHardenedDbFamilyMember === 'function' && typeof enumerateDbFamily === 'function',
  CONTAINMENT_MODULE);

const openedDbPaths = [];
const requestedDbPaths = [];
const nativeHandles = [];
const resolveCalls = [];
const mkdirOperands = [];
let RealBetterSqlite3 = null;
const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  const sid = String(id);
  if (sid === 'better-sqlite3' || sid.endsWith('/better-sqlite3')) {
    if (!RealBetterSqlite3) {
      RealBetterSqlite3 = origRequire.apply(this, arguments);
    }
    function TrackingDatabase(dbPath, options) {
      const raw = dbPath == null ? ':memory:' : String(dbPath);
      const abs = raw === ':memory:' || raw.startsWith('file:') ? raw : path.resolve(raw);
      requestedDbPaths.push(abs);
      openedDbPaths.push(abs);
      const db = new RealBetterSqlite3(abs === ':memory:' || String(abs).startsWith('file:') ? raw : abs, options);
      nativeHandles.push(db);
      return db;
    }
    Object.setPrototypeOf(TrackingDatabase, RealBetterSqlite3);
    TrackingDatabase.prototype = RealBetterSqlite3.prototype;
    TrackingDatabase.default = TrackingDatabase;
    try {
      Object.keys(RealBetterSqlite3).forEach((k) => {
        try { TrackingDatabase[k] = RealBetterSqlite3[k]; } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
    return TrackingDatabase;
  }
  return origRequire.apply(this, arguments);
};

function underEph(p) {
  const abs = path.resolve(String(p));
  const root = path.resolve(EPH_ROOT);
  return abs === root || abs.startsWith(root + path.sep);
}

function realpathUnderEph(p) {
  try {
    const real = fs.realpathSync.native ? fs.realpathSync.native(String(p)) : fs.realpathSync(String(p));
    const root = path.resolve(EPH_ROOT);
    const rootReal = fs.realpathSync.native ? fs.realpathSync.native(root) : fs.realpathSync(root);
    return real === rootReal || real.startsWith(rootReal + path.sep);
  } catch {
    return false;
  }
}

function hardened(p) {
  return isHardenedDbFamilyMember(p, EPH_ROOT);
}
function enumFamily(main) {
  return enumerateDbFamily(main, EPH_ROOT);
}

// Track mkdirSync operands after guard (guard rewrites first; record post-rewrite via wrap overlay)
const _mkdirSync = fs.mkdirSync.bind(fs);
fs.mkdirSync = function trackedMkdir(p, opts) {
  mkdirOperands.push(path.resolve(String(p)));
  return _mkdirSync(p, opts);
};

const backendPkg = path.join(REPO_ROOT, '_SYSTEM', 'backend', 'package.json');
const requireFromBackend = createRequire(backendPkg);
requireFromBackend('ts-node/register');

const { SystemConfig } = requireFromBackend(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'config', 'SystemConfig.ts'));
const origResolve = SystemConfig.resolve.bind(SystemConfig);
SystemConfig.resolve = function recordedResolve(subPath) {
  const out = origResolve(subPath);
  resolveCalls.push({ input: String(subPath), output: out });
  return out;
};

const ephDataRoot = path.resolve(SystemConfig.SYSTEM.DATA);
ok('system_data_is_ephemeral', ephDataRoot.startsWith(path.resolve(EPH_ROOT) + path.sep) || ephDataRoot === path.resolve(EPH_ROOT), ephDataRoot);

// Hard-deny resolve tests (throw)
let deniedSystem = false;
try { SystemConfig.resolve('_SYSTEM/backend/data/yuri.db'); } catch (err) {
  deniedSystem = /ACCESS_DENIED_TEST_MODE: persistent backend data path forbidden/.test(String(err && err.message));
}
ok('resolve_denies_system_backend_data', deniedSystem, '');

let deniedBare = false;
try { SystemConfig.resolve('backend/data/design-studio'); } catch (err) {
  deniedBare = /ACCESS_DENIED_TEST_MODE: persistent backend data path forbidden/.test(String(err && err.message));
}
ok('resolve_denies_bare_backend_data', deniedBare, 'expected HARD DENY throw on bare backend/data');

let deniedCanonicalMemory = false;
try { SystemConfig.resolve('_SYSTEM/OS_KERNEL/memory.db'); } catch (err) {
  deniedCanonicalMemory = /ACCESS_DENIED_TEST_MODE: canonical OS_KERNEL memory.db forbidden/.test(String(err && err.message));
}
ok('resolve_denies_canonical_memory_db', deniedCanonicalMemory, '');

ok('resolve_allows_ephemeral_memory_db', SystemConfig.resolve(MEMORY_DB) === path.resolve(MEMORY_DB), '');

// Drift guards: legacy bare defaults must be gone; SYSTEM.DATA authority present
const designStudioSrc = fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'services', 'designStudioService.ts'), 'utf8');
const designAssistantSrc = fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'services', 'designAssistantBridgeService.ts'), 'utf8');
const siteBuilderSrc = fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'routes', 'siteBuilderRoutes.ts'), 'utf8');
const designStudioRoutesSrc = fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'routes', 'designStudioRoutes.ts'), 'utf8');

ok('drift_guard_no_legacy_bare_design_studio_default',
  !/DEFAULT_ARTIFACT_ROOT\\s*=\\s*'backend\\/data\\/design-studio'/.test(designStudioSrc),
  'legacy bare design-studio default still present');
ok('drift_guard_no_legacy_bare_design_assistant_default',
  !/DEFAULT_ARTIFACT_ROOT\\s*=\\s*'backend\\/data\\/design-assistant'/.test(designAssistantSrc),
  'legacy bare design-assistant default still present');
ok('drift_guard_design_studio_uses_system_data',
  /SystemConfig\\.SYSTEM\\.DATA.*design-studio|DEFAULT_ARTIFACT_ROOT\\s*=\\s*\`\\$\\{SystemConfig\\.SYSTEM\\.DATA\\}\\/design-studio\`/.test(designStudioSrc),
  'design-studio DEFAULT must use SystemConfig.SYSTEM.DATA');
ok('drift_guard_design_assistant_uses_system_data',
  /SystemConfig\\.SYSTEM\\.DATA.*design-assistant|DEFAULT_ARTIFACT_ROOT\\s*=\\s*\`\\$\\{SystemConfig\\.SYSTEM\\.DATA\\}\\/design-assistant\`/.test(designAssistantSrc),
  'design-assistant DEFAULT must use SystemConfig.SYSTEM.DATA');

const DBPATH_EXPR = /dbPath:\\s*process\\.env\\.YURI_MEMORY_DB_PATH\\s*\\|\\|\\s*'_SYSTEM\\/OS_KERNEL\\/memory\\.db'/;
ok('drift_guard_sitebuilder_dbpath_expr', DBPATH_EXPR.test(siteBuilderSrc), '');
ok('drift_guard_designstudio_routes_dbpath_expr', DBPATH_EXPR.test(designStudioRoutesSrc), '');

function makeMockRouter() {
  const noop = function () { return router; };
  const router = { use: noop, get: noop, post: noop, put: noop, patch: noop, delete: noop, all: noop };
  return router;
}

const { initSiteBuilderRoutes } = requireFromBackend(
  path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'routes', 'siteBuilderRoutes.ts'),
);
const { initDesignStudioRoutes } = requireFromBackend(
  path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'routes', 'designStudioRoutes.ts'),
);
const { DesignAssistantBridgeService } = requireFromBackend(
  path.join(REPO_ROOT, '_SYSTEM', 'backend', 'src', 'services', 'designAssistantBridgeService.ts'),
);

ok('real_better_sqlite3_loaded', typeof RealBetterSqlite3 === 'function', typeof RealBetterSqlite3);

const beforeSite = openedDbPaths.length;
initSiteBuilderRoutes(makeMockRouter());
const siteOpens = openedDbPaths.slice(beforeSite);
ok('initSiteBuilderRoutes_opened_ephemeral_only',
  siteOpens.length >= 1
    && siteOpens.every((p) => underEph(p) && p !== path.resolve(CANONICAL) && p === path.resolve(MEMORY_DB)),
  JSON.stringify(siteOpens));

const beforeDesign = openedDbPaths.length;
const mkdirBeforeDesign = mkdirOperands.length;
initDesignStudioRoutes(makeMockRouter());
const designOpens = openedDbPaths.slice(beforeDesign);
ok('initDesignStudioRoutes_opened_ephemeral_only',
  designOpens.length >= 1
    && designOpens.every((p) => underEph(p) && p !== path.resolve(CANONICAL) && p === path.resolve(MEMORY_DB)),
  JSON.stringify(designOpens));
const designMkdirs = mkdirOperands.slice(mkdirBeforeDesign);
const expectedStudio = path.join(ephDataRoot, 'design-studio');
ok('initDesignStudioRoutes_mkdir_only_ephemeral_system_data',
  designMkdirs.some((p) => p === expectedStudio || p.startsWith(expectedStudio + path.sep))
    && designMkdirs.every((p) => underEph(p)),
  JSON.stringify(designMkdirs.slice(0, 8)));

// (3) DIRECT server.ts:120 path — default DesignAssistantBridgeService constructor with REAL native ephemeral DB
const mkdirBeforeBridge = mkdirOperands.length;
const bridgeDbPath = path.resolve(path.join(path.resolve(EPH_ROOT), 'design-assistant-bridge-ephemeral.db'));
const bridgeDb = new RealBetterSqlite3(bridgeDbPath);
nativeHandles.push(bridgeDb);
requestedDbPaths.push(bridgeDbPath);
openedDbPaths.push(bridgeDbPath);
const bridgeJournalMode = String(bridgeDb.pragma('journal_mode = WAL', { simple: true })).toLowerCase();
ok('bridge_db_pragma_journal_mode_wal', bridgeJournalMode === 'wal', 'journal_mode=' + bridgeJournalMode);
new DesignAssistantBridgeService(bridgeDb);
// Real write so WAL/SHM must materialize under a real bridge write (Atlas re-seal bar: FAIL if absent)
bridgeDb.exec(
  'CREATE TABLE IF NOT EXISTS __yuri_readiness_wal_probe (id INTEGER PRIMARY KEY, value TEXT);'
);
bridgeDb.prepare("INSERT INTO __yuri_readiness_wal_probe(value) VALUES (?)").run('ephemeral');
const bridgeMkdirs = mkdirOperands.slice(mkdirBeforeBridge);
const expectedAssistant = path.join(ephDataRoot, 'design-assistant');
ok('designAssistantBridge_default_ctor_mkdir_ephemeral_system_data',
  bridgeMkdirs.some((p) => p === expectedAssistant || p.startsWith(expectedAssistant + path.sep))
    && bridgeMkdirs.every((p) => underEph(p)),
  JSON.stringify(bridgeMkdirs.slice(0, 8)));
ok('designAssistantBridge_mkdirs_captures_selections',
  bridgeMkdirs.some((p) => p.endsWith(path.join('design-assistant', 'captures')))
    && bridgeMkdirs.some((p) => p.endsWith(path.join('design-assistant', 'selections'))),
  JSON.stringify(bridgeMkdirs));

ok('all_requested_db_paths_under_eph_not_canonical',
  requestedDbPaths.length > 0
    && requestedDbPaths.every((p) => p === ':memory:' || (underEph(p) && path.resolve(p) !== path.resolve(CANONICAL))),
  JSON.stringify(requestedDbPaths));
ok('all_opened_db_paths_under_eph_not_canonical',
  openedDbPaths.length > 0
    && openedDbPaths.every((p) => p === ':memory:' || (underEph(p) && path.resolve(p) !== path.resolve(CANONICAL))),
  JSON.stringify(openedDbPaths));

// Enumerate main/WAL/SHM/journal family BEFORE close/cleanup — tied to real bridgeDbPath (non-vacuous)
const bridgeWalPath = bridgeDbPath + '-wal';
const bridgeShmPath = bridgeDbPath + '-shm';
const bridgeMainReal = fs.realpathSync(bridgeDbPath);
const bridgeWalReal = fs.realpathSync(bridgeWalPath);
const bridgeShmReal = fs.realpathSync(bridgeShmPath);
const familyMembers = [];
const familyPresentViolations = [];
for (const main of [...new Set(openedDbPaths.filter((p) => p && p !== ':memory:'))]) {
  const enumerated = enumFamily(main);
  for (const f of enumerated.members) familyMembers.push(f);
  for (const v of enumerated.presentViolations) familyPresentViolations.push(v);
}
ok('db_family_bridge_main_present',
  hardened(bridgeDbPath) && familyMembers.includes(bridgeMainReal),
  'bridgeDbPath=' + bridgeDbPath + ' family=' + JSON.stringify(familyMembers));
ok('db_family_wal_shm_exist',
  hardened(bridgeWalPath) && hardened(bridgeShmPath)
    && familyMembers.includes(bridgeWalReal)
    && familyMembers.includes(bridgeShmReal),
  JSON.stringify({ bridgeWalPath, bridgeShmPath, familyMembers }));
const requiredBridgeFamily = [bridgeMainReal, bridgeWalReal, bridgeShmReal];
ok('db_family_main_wal_shm_all_under_eph_not_canonical',
  requiredBridgeFamily.every((p) => hardened(p) && realpathUnderEph(p) && p !== path.resolve(CANONICAL))
    && familyMembers.every((p) => hardened(p) && realpathUnderEph(p) && p !== path.resolve(CANONICAL)),
  JSON.stringify({ requiredBridgeFamily, familyMembers }));
// PRESENT -journal (or any present sidecar) must not silent-skip; absent -journal OK under WAL.
ok('db_family_no_present_non_hardened_sidecars',
  familyPresentViolations.length === 0,
  JSON.stringify(familyPresentViolations));
ok('db_family_absent_journal_ok_under_wal',
  !pathPresentNoFollow(bridgeDbPath + '-journal')
    && !familyPresentViolations.some((v) => v.suffix === '-journal'),
  'WAL-mode bridge must not require -journal; absent is not a violation');

// Deterministic WAL/SHM containment mutants — synthetic fixtures only; prove old lexical logic wrong
const mutantRoot = path.join(path.resolve(EPH_ROOT), 'mutant-wal-shm-fixtures');
fs.mkdirSync(mutantRoot, { recursive: true });
const outsideEph = path.join(path.dirname(path.resolve(EPH_ROOT)), 'yuri-readiness-outside-eph-' + String(process.pid));
fs.mkdirSync(outsideEph, { recursive: true });
try {
  const outsideWal = path.join(outsideEph, 'escape-wal.bin');
  fs.writeFileSync(outsideWal, 'wal-escape', 'utf8');
  const mutantMain = path.join(mutantRoot, 'mutant-main.db');
  fs.writeFileSync(mutantMain, 'sqlite-stub', 'utf8');
  const mutantWalLink = mutantMain + '-wal';
  fs.symlinkSync(outsideWal, mutantWalLink);
  const mutantShm = mutantMain + '-shm';
  fs.writeFileSync(mutantShm, 'shm-ok', 'utf8');
  ok('mutant_lexical_underEph_wal_symlink_would_pass_old_logic',
    underEph(mutantWalLink),
    'old lexical underEph incorrectly true for escape symlink');
  ok('mutant_outside_eph_wal_symlink_fails_hardened',
    !hardened(mutantWalLink),
    'hardened must reject -wal symlink escape');
  ok('mutant_outside_eph_wal_symlink_excluded_from_enumerate',
    !enumFamily(mutantMain).members.some((p) => p === path.resolve(mutantWalLink) || p === fs.realpathSync(outsideWal)),
    'enumerateDbFamily must not treat escape symlink as family member');
  ok('mutant_outside_eph_wal_symlink_present_violation',
    enumFamily(mutantMain).presentViolations.some((v) => v.suffix === '-wal'),
    'present non-hardened -wal must explicit-FAIL not silent-skip');
  fs.unlinkSync(mutantShm);
  const outsideShm = path.join(outsideEph, 'escape-shm.bin');
  fs.writeFileSync(outsideShm, 'shm-escape', 'utf8');
  fs.symlinkSync(outsideShm, mutantShm);
  ok('mutant_lexical_underEph_shm_symlink_would_pass_old_logic',
    underEph(mutantShm),
    'old lexical underEph incorrectly true for shm escape symlink');
  ok('mutant_outside_eph_shm_symlink_fails_hardened',
    !hardened(mutantShm),
    'hardened must reject -shm symlink escape');
  ok('mutant_outside_eph_shm_symlink_present_violation',
    enumFamily(mutantMain).presentViolations.some((v) => v.suffix === '-shm'),
    'present non-hardened -shm must explicit-FAIL not silent-skip');

  // (c) outside-EPH -journal symlink — red baseline (legacy omit) + hardened present-gate
  const outsideJournal = path.join(outsideEph, 'escape-journal.bin');
  fs.writeFileSync(outsideJournal, 'journal-escape', 'utf8');
  const mutantJournalLink = mutantMain + '-journal';
  fs.symlinkSync(outsideJournal, mutantJournalLink);
  ok('mutant_lexical_underEph_journal_symlink_would_pass_old_logic',
    underEph(mutantJournalLink) && fs.existsSync(mutantJournalLink),
    'old lexical underEph incorrectly true for journal escape symlink');
  ok('mutant_journal_symlink_omitted_by_legacy_skip_enumerate',
    fs.existsSync(mutantJournalLink)
      && !legacyPathOnlyHardened(mutantJournalLink, EPH_ROOT)
      && !legacyEnumerateDbFamilyOmitNonHardened(mutantMain, EPH_ROOT).some((p) => String(p).includes('escape-journal') || String(p).endsWith('-journal')),
    'RED BASELINE: legacy silent-skip omits present -journal symlink (gap Atlas flagged)');
  ok('mutant_outside_eph_journal_symlink_fails_hardened',
    !hardened(mutantJournalLink),
    'hardened must reject -journal symlink escape');
  ok('mutant_outside_eph_journal_symlink_present_violation',
    enumFamily(mutantMain).presentViolations.some((v) => v.suffix === '-journal'),
    'present non-hardened -journal must explicit-FAIL not silent-skip');

  // (d) HARD-LINK to outside inode — path-only legacy PASSES; nlink gate FAILS
  const outsideHard = path.join(outsideEph, 'escape-hardlink-target.bin');
  fs.writeFileSync(outsideHard, 'hardlink-escape', 'utf8');
  const mutantHard = path.join(mutantRoot, 'mutant-hardlink.db-wal');
  fs.linkSync(outsideHard, mutantHard);
  ok('mutant_hardlink_would_pass_legacy_path_only',
    legacyPathOnlyHardened(mutantHard, EPH_ROOT) === true,
    'RED BASELINE: path-only realpath-under-EPH accepts hardlink inside EPH');
  ok('mutant_hardlink_fails_hardened_nlink',
    hardened(mutantHard) === false
      && assessDbFamilyMember(mutantHard, EPH_ROOT).reason === 'hardlink_nlink',
    'hardened must reject nlink>1 hardlink to outside inode');
  ok('mutant_hardlink_present_violation',
    enumFamily(path.join(mutantRoot, 'mutant-hardlink.db')).presentViolations.some((v) => v.suffix === '-wal'),
    'present hardlinked -wal must explicit-FAIL');

  // (e) st_dev mismatch (bind-mount class) — inject ephRootStat.dev != file.dev
  const sameFsFile = path.join(mutantRoot, 'stdev-regular.db');
  fs.writeFileSync(sameFsFile, 'stdev-stub', 'utf8');
  const realEphStat = fs.statSync(path.resolve(EPH_ROOT));
  const forgedEphStat = { dev: Number(realEphStat.dev) + 99991, ino: 0 };
  ok('mutant_st_dev_would_pass_legacy_path_only',
    legacyPathOnlyHardened(sameFsFile, EPH_ROOT) === true,
    'RED BASELINE: path-only ignores mount/device identity');
  ok('mutant_st_dev_mismatch_fails_hardened',
    isHardenedDbFamilyMember(sameFsFile, EPH_ROOT, { ephRootStat: forgedEphStat }) === false
      && assessDbFamilyMember(sameFsFile, EPH_ROOT, { ephRootStat: forgedEphStat }).reason === 'st_dev_mismatch',
    'hardened must reject family member whose st_dev != EPH_ROOT st_dev');

  // TOCTOU surface: successful O_NOFOLLOW open + fstat on same fd (assess returns ok on clean file)
  ok('toctou_open_nofollow_fstat_ok_on_regular',
    assessDbFamilyMember(sameFsFile, EPH_ROOT).ok === true
      && assessDbFamilyMember(sameFsFile, EPH_ROOT).stat
      && assessDbFamilyMember(sameFsFile, EPH_ROOT).stat.nlink === 1,
    'runtime assess uses open+fstat same-fd path');

  const absentMain = path.join(mutantRoot, 'absent-sidecar.db');
  fs.writeFileSync(absentMain, 'sqlite-stub', 'utf8');
  const absentWal = absentMain + '-wal';
  ok('mutant_absent_wal_not_hardened',
    !hardened(absentWal),
    'absent -wal must fail hardened check');
  ok('mutant_absent_wal_excluded_from_enumerate',
    !enumFamily(absentMain).members.some((p) => p.endsWith('-wal')),
    'absent -wal must not appear in family');
  ok('mutant_absent_wal_required_set_fails',
    ![absentMain, absentWal, absentMain + '-shm'].every((p) => hardened(p)),
    'requiring full wal/shm family on absent sidecar must fail');
  ok('mutant_absent_journal_not_a_violation',
    !pathPresentNoFollow(absentMain + '-journal')
      && enumFamily(absentMain).presentViolations.filter((v) => v.suffix === '-journal').length === 0,
    'absent -journal must NOT be a containment violation (WAL-mode OK)');
} finally {
  try { fs.rmSync(mutantRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(outsideEph, { recursive: true, force: true }); } catch { /* ignore */ }
}

// orig fs NEVER received bare or _SYSTEM backend/data operands
const badOrig = fsAttestation.origPathSamples.filter((s) => {
  const p = s.split(':').slice(1).join(':');
  if (p === path.resolve(PERSISTENT_BARE) || p.startsWith(path.resolve(PERSISTENT_BARE) + path.sep)) return true;
  if (p === path.resolve(PERSISTENT_SYSTEM_DATA) || p.startsWith(path.resolve(PERSISTENT_SYSTEM_DATA) + path.sep)) return true;
  return false;
});
ok('protected_access_zero_orig_never_saw_backend_data', badOrig.length === 0, JSON.stringify(badOrig.slice(0, 8)));
ok('no_successful_resolve_to_canonical_memory',
  !resolveCalls.some((c) => path.resolve(c.output) === path.resolve(CANONICAL)), '');

// Close all native handles (tracked)
let closeErrors = 0;
for (const h of nativeHandles) {
  try { if (h && typeof h.close === 'function') h.close(); } catch { closeErrors += 1; }
}
ok('native_handles_closed', nativeHandles.length > 0 && closeErrors === 0,
  'handles=' + nativeHandles.length + ' closeErrors=' + closeErrors);

const summary = {
  pass: results.every((r) => r.pass),
  openedDbPaths,
  requestedDbPaths,
  familyMembers,
  familyPresentViolations,
  nativeHandleCount: nativeHandles.length,
  mkdirOperands: mkdirOperands.slice(0, 30),
  results,
  primaryProof: 'v8-real-better-sqlite3-tracking+initSiteBuilder+initDesignStudio+DesignAssistantBridgeDefaultCtor',
};
process.stdout.write('DB_CONTAIN_SUMMARY=' + JSON.stringify(summary) + '\\n');
if (!summary.pass) process.exit(1);
`;

const SYNTHETIC_REDIRECT_PROBE_SOURCE = `'use strict';
/**
 * ISOLATED synthetic bare+_SYSTEM redirect negatives (Apollo: NOT the real-initializer proof).
 * Patches resolve to return persistent paths so the fs guard must redirect mkdir/write.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

const REPO_ROOT = process.env.YURI_ROOT;
const EPH_ROOT = process.env.YURI_BACKEND_EPHEMERAL_ROOT;
const PERSISTENT_BARE = path.join(REPO_ROOT, 'backend', 'data');
const PERSISTENT_SYSTEM = path.join(REPO_ROOT, '_SYSTEM', 'backend', 'data');
const MIRROR_REPO = process.env.YURI_REDIRECT_REPO_DATA_MIRROR;
const MIRROR_SYSTEM = process.env.YURI_REDIRECT_SYSTEM_DATA_MIRROR;

const results = [];
const reports = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.error((cond ? 'SYNTH_REDIR_PASS:' : 'SYNTH_REDIR_FAIL:') + name + (detail ? ':' + detail : ''));
  if (!cond) process.exitCode = 1;
}

process.chdir(path.resolve(EPH_ROOT));
fs.mkdirSync(MIRROR_REPO, { recursive: true });
fs.mkdirSync(MIRROR_SYSTEM, { recursive: true });

${POLICY_JSON_BOOT}
${FS_GUARD_CORE}
const attestation = installFsGuard(fs, {
  policy,
  wrapSpec,
  report: (msg) => { reports.push(msg); console.error(msg); },
});

// Synthetic: pretend resolve returned persistent bare path — guard must redirect
const bareTarget = path.join(PERSISTENT_BARE, 'synth-design-studio');
fs.mkdirSync(bareTarget, { recursive: true });
ok('synth_bare_mkdir_redirected',
  reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:mkdirSync') && r.includes(bareTarget)),
  '');
ok('synth_bare_landed_repo_mirror',
  fs.existsSync(path.join(MIRROR_REPO, 'synth-design-studio')), '');

const sysTarget = path.join(PERSISTENT_SYSTEM, 'synth-system-canary.txt');
fs.writeFileSync(sysTarget, 'synth', 'utf8');
ok('synth_system_write_redirected',
  reports.some((r) => r.includes('PROTECTED_PREFIX_REDIRECT:writeFileSync') && r.includes(sysTarget)),
  '');
ok('synth_system_landed_system_mirror',
  fs.readFileSync(path.join(MIRROR_SYSTEM, 'synth-system-canary.txt'), 'utf8') === 'synth', '');

const badOrig = attestation.origPathSamples.filter((s) => {
  const p = s.split(':').slice(1).join(':');
  return (p === path.resolve(PERSISTENT_BARE) || p.startsWith(path.resolve(PERSISTENT_BARE) + path.sep)
    || p === path.resolve(PERSISTENT_SYSTEM) || p.startsWith(path.resolve(PERSISTENT_SYSTEM) + path.sep));
});
ok('synth_orig_never_saw_protected', badOrig.length === 0, JSON.stringify(badOrig.slice(0, 5)));

const summary = { pass: results.every((r) => r.pass), results, isolated: true };
process.stdout.write('SYNTH_REDIR_SUMMARY=' + JSON.stringify(summary) + '\\n');
if (!summary.pass) process.exit(1);
`;

try {
  const systemConfigSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src/config/SystemConfig.ts'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'src/server.ts'), 'utf8');

  assert.match(
    systemConfigSrc,
    /if\s*\(\s*!isTestMode\(\)\s*\)\s*\{\s*dotenv\.config\(\)/s,
    'static proof: SystemConfig skips dotenv.config in test mode',
  );
  assert.match(
    serverSrc,
    /if\s*\(\s*!isTestModeEarly\s*\)\s*\{\s*dotenv\.config\(\)/s,
    'static proof: server.ts skips dotenv.config in test mode',
  );
  assert.match(systemConfigSrc, /YURI_BACKEND_EPHEMERAL_ROOT/, 'static: ephemeral root required');
  assert.match(
    systemConfigSrc,
    /ACCESS_DENIED_TEST_MODE:\s*persistent backend data path forbidden/,
    'static: SystemConfig refuses persistent _SYSTEM backend data resolves in test mode',
  );
  assert.match(
    systemConfigSrc,
    /ACCESS_DENIED_TEST_MODE:\s*canonical OS_KERNEL memory\.db forbidden/,
    'static: SystemConfig refuses canonical OS_KERNEL memory.db resolve in test mode',
  );
  assert.match(
    systemConfigSrc,
    /persistentBareBackendData/,
    'static: SystemConfig hard-denies bare backend/data in test mode',
  );
  assert.doesNotMatch(
    systemConfigSrc,
    /remap bare backend\/data/,
    'static: bare backend/data must HARD-DENY (throw), not remap',
  );
  // Exact server wiring evidence (NOT executed server startup — full server remains live-bind gate)
  assert.ok(
    serverSrc.includes('const db = initDatabase();'),
    'exact wiring: const db = initDatabase(); (evidence only — not executed startup)',
  );
  assert.ok(
    serverSrc.includes('const designAssistantBridge = new DesignAssistantBridgeService(db);'),
    'exact wiring: const designAssistantBridge = new DesignAssistantBridgeService(db); (evidence only — not executed startup)',
  );
  assert.match(
    serverSrc,
    /initApiRoutes\(\s*db\s*,\s*\{[\s\S]*?\bdesignAssistantBridge\b[\s\S]*?\}\s*\)/,
    'exact wiring: initApiRoutes(db,{...designAssistantBridge...}) (evidence only — not executed startup)',
  );
  process.stdout.write('server_wiring_evidence=EXACT_STATIC_GUARDS_NOT_EXECUTED_STARTUP\n');
  const siteBuilderRoutesSrc = fs.readFileSync(
    path.join(BACKEND_SRC, 'routes/siteBuilderRoutes.ts'),
    'utf8',
  );
  const designStudioRoutesSrc = fs.readFileSync(
    path.join(BACKEND_SRC, 'routes/designStudioRoutes.ts'),
    'utf8',
  );
  assert.match(
    siteBuilderRoutesSrc,
    /YURI_MEMORY_DB_PATH\s*\|\|/,
    'static: SiteBuilder routes honor YURI_MEMORY_DB_PATH',
  );
  assert.match(
    designStudioRoutesSrc,
    /YURI_MEMORY_DB_PATH\s*\|\|/,
    'static: DesignStudio routes honor YURI_MEMORY_DB_PATH',
  );
  // --- Executable fs-method census ---
  const census = censusBackendFsMethods(BACKEND_SRC);
  const wrapped = guardedMethodNames();
  const missing = [...census].filter((m) => {
    if (wrapped.has(m)) return false;
    // Sync census hit "readFileSync" — covered. Callback-only names rarely appear.
    // If census finds plain "readFile" from promises import without prefix, accept promises.readFile OR readFile.
    if (wrapped.has(`promises.${m}`)) return false;
    return true;
  });
  assert.equal(
    missing.length,
    0,
    `fs-method census uncovered by guard: ${missing.join(', ') || '(none)'} (census=${[...census].sort().join(',')})`,
  );
  assert.ok(census.has('statfsSync'), 'census must surface metrics.ts statfsSync');
  assert.ok(wrapped.has('statfsSync'), 'guard must wrap statfsSync');
  process.stdout.write(`fs_census_count=${census.size}\n`);
  process.stdout.write(`fs_census_methods=${[...census].sort().join(',')}\n`);
  process.stdout.write(`fs_guard_wrapped_count=${wrapped.size}\n`);

  const expectedLogDir = path.join(ephemeralRoot, 'logs');
  assert.ok(
    path.resolve(expectedLogDir).startsWith(path.resolve(ephemeralRoot) + path.sep)
      || path.resolve(expectedLogDir) === path.resolve(ephemeralRoot),
    'log dir must nest under ephemeral root',
  );
  assert.notEqual(
    path.resolve(mirrorSystemData),
    path.resolve(mirrorRepoData),
    'system-data and repo-data mirrors must be distinct',
  );

  assert.match(BOOTSTRAP_SOURCE, /createRequire\(backendPkg\)/, 'bootstrap createRequire');
  assert.match(BOOTSTRAP_SOURCE, /process\.chdir\(path\.resolve\(EPH_ROOT\)\)/, 'bootstrap chdir');
  assert.match(FS_GUARD_CORE, /PROTECTED_HARD_DENY/, 'hard-deny policy present');
  assert.match(FS_GUARD_CORE, /redirectRules/, 'multi-root redirect policy present');
  assert.ok(GUARD_WRAP_SPEC.syncOne.includes('statfsSync'), 'statfsSync listed in wrapSpec.syncOne');
  assert.equal(EXIT_HOLD_LIVE_BIND, 78);

  const thisSrc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.match(thisSrc, /statfsSync/, 'statfsSync present in harness source');
  assert.doesNotMatch(thisSrc, /\.\.\.\s*process\.env/, 'no process.env spread');
  assert.match(thisSrc, /buildAllowlistedChildEnv/, 'explicit allowlist helper');
  assert.match(thisSrc, /TRUSTED_PATH/, 'minimal trusted PATH constant');
  // Child env object must omit NODE_PATH key (createRequire resolves ts-node).
  assert.match(
    thisSrc,
    /function buildAllowlistedChildEnv[\s\S]*?return \{[\s\S]*?\};[\s\S]*?\}/,
    'allowlist helper present',
  );
  const envFn = thisSrc.match(/function buildAllowlistedChildEnv\(ephRoot\) \{[\s\S]*?\n\}/);
  assert.ok(envFn, 'extract allowlist fn');
  assert.doesNotMatch(envFn[0], /\bNODE_PATH\s*:/, 'NODE_PATH omitted from child env object');

  fs.mkdirSync(mirrorSystemData, { recursive: true });
  fs.mkdirSync(mirrorRepoData, { recursive: true });
  fs.mkdirSync(ephemeralLogs, { recursive: true });
  fs.mkdirSync(tokenLedgerQueueDir, { recursive: true });
  fs.mkdirSync(tokenTelemetryDir, { recursive: true });
  fs.writeFileSync(bootstrapPath, BOOTSTRAP_SOURCE, 'utf8');
  fs.writeFileSync(guardProbePath, GUARD_PROBE_SOURCE, 'utf8');
  fs.writeFileSync(dbContainmentProbePath, DB_CONTAINMENT_PROBE_SOURCE, 'utf8');
  fs.writeFileSync(synthRedirectProbePath, SYNTHETIC_REDIRECT_PROBE_SOURCE, 'utf8');

  // Absolute ephemeral memory DB path (native sqlite containment via ENV, not fs wrap)
  assert.ok(path.isAbsolute(ephemeralMemoryDb), 'YURI_MEMORY_DB_PATH candidate must be absolute');
  assert.notEqual(path.resolve(ephemeralMemoryDb), path.resolve(CANONICAL_MEMORY_DB));

  const bypass = await runGuardBypassProbe(ephemeralRoot);
  assert.equal(bypass.summary.pass, true, 'all bypass-negative fixtures must pass');
  process.stdout.write(`bypass_neg_pass=${bypass.summary.results.filter((r) => r.pass).length}\n`);
  process.stdout.write(`bypass_neg_rewriteCount=${bypass.summary.rewriteCount}\n`);
  process.stdout.write(`bypass_neg_hardDenyCount=${bypass.summary.hardDenyCount}\n`);
  for (const r of bypass.summary.results) {
    process.stdout.write(`bypass_neg:${r.name}:${r.pass ? 'PASS' : 'FAIL'}\n`);
  }

  const dbContain = await runDbContainmentProbe(ephemeralRoot);
  assert.equal(dbContain.summary.pass, true, 'db containment + resolve-denial fixtures must pass');
  process.stdout.write(`db_contain_pass=${dbContain.summary.results.filter((r) => r.pass).length}\n`);
  process.stdout.write(`db_contain_opened=${JSON.stringify(dbContain.summary.openedDbPaths)}\n`);
  if (dbContain.summary.requestedDbPaths) {
    process.stdout.write(`db_contain_requested=${JSON.stringify(dbContain.summary.requestedDbPaths)}\n`);
  }
  if (dbContain.summary.familyMembers) {
    process.stdout.write(`db_contain_family=${JSON.stringify(dbContain.summary.familyMembers)}\n`);
  }
  if (dbContain.summary.nativeHandleCount != null) {
    process.stdout.write(`db_contain_native_handles=${dbContain.summary.nativeHandleCount}\n`);
  }
  for (const r of dbContain.summary.results) {
    process.stdout.write(`db_contain:${r.name}:${r.pass ? 'PASS' : 'FAIL'}\n`);
  }

  // Isolated synthetic redirect negatives (NOT real-initializer proof)
  const synth = await runSynthRedirectProbe(ephemeralRoot);
  assert.equal(synth.summary.pass, true, 'synthetic redirect negatives must pass');
  process.stdout.write(`synth_redir_pass=${synth.summary.results.filter((r) => r.pass).length}\n`);
  for (const r of synth.summary.results) {
    process.stdout.write(`synth_redir:${r.name}:${r.pass ? 'PASS' : 'FAIL'}\n`);
  }

  // v8 DESIGN-ONLY — live bind forced off; real better-sqlite3 tracking + exact wiring evidence
  process.stdout.write(
    'backend-db-readiness-recovery-metadata: DESIGN_PROOF_PASS live_bind=HELD (v8 real-better-sqlite3-tracking; WAL/SHM family under EPH; exact server wiring evidence NOT executed startup)\n',
  );
  if (LIVE_BIND_ENABLED) {
    throw new Error('LIVE_BIND unexpectedly enabled in v8 design-only harness');
  }} finally {
  if (child) await stopBackend(child);
  try {
    fs.rmSync(ephemeralRoot, { recursive: true, force: true });
  } catch {
    // best-effort fixture cleanup only
  }
}

function isBindDenied(msg) {
  return /EPERM|EACCES|operation not permitted/i.test(msg)
    && !/PROTECTED_PREFIX|PROTECTED_HARD_DENY/i.test(msg);
}

function buildAllowlistedChildEnv(ephRoot) {
  // Explicit allowlist only — never spread process.env.
  // HOME+TMPDIR pinned to test-owned ephemeral root (stops home-credential/config access).
  // NODE_PATH omitted (createRequire(backend/package.json) resolves ts-node).
  // Native better-sqlite3 bypasses JS fs wrappers — DB containment is ENV + resolve-denial.
  const memoryDb = path.join(ephRoot, 'memory-ephemeral.db');
  return {
    PATH: TRUSTED_PATH,
    HOME: ephRoot,
    TMPDIR: ephRoot,
    TMP: ephRoot,
    LANG: 'en_US.UTF-8',
    API_KEY,
    PORT: String(PORT),
    YURI_ROOT: REPO_ROOT,
    YURI_DB_PATH: ':memory:',
    YURI_MEMORY_DB_PATH: memoryDb,
    YURI_TEST_MODE: '1',
    YURI_SESSION_RUNTIME_TEST_MODE: '1',
    YURI_BACKEND_EPHEMERAL_ROOT: ephRoot,
    YURI_DB_FAMILY_CONTAINMENT: path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'backend-db-family-containment.cjs'),
    YURI_DISABLE_WATCHERS: '1',
    YURI_DISABLE_INTERVALS: '1',
    YURI_DISABLE_SWARM_ORCHESTRATOR: '1',
    TOKEN_LEDGER_QUEUE_DIR: path.join(ephRoot, 'token-ledger-queue'),
    YURI_TOKEN_TELEMETRY_DIR: path.join(ephRoot, 'token-telemetry'),
    DOTENV_CONFIG_PATH: path.join(ephRoot, 'empty-dotenv'),
    TS_NODE_PROJECT: path.join(BACKEND_ROOT, 'tsconfig.json'),
    TS_NODE_TRANSPILE_ONLY: '1',
    YURI_REDIRECT_SYSTEM_DATA_PREFIX: SYSTEM_BACKEND_DATA,
    YURI_REDIRECT_SYSTEM_DATA_MIRROR: path.join(ephRoot, 'mirror-system-backend-data'),
    YURI_REDIRECT_REPO_DATA_PREFIX: REPO_BACKEND_DATA,
    YURI_REDIRECT_REPO_DATA_MIRROR: path.join(ephRoot, 'mirror-backend-data'),
    YURI_HARD_DENY_PREFIXES_JSON: JSON.stringify([CLAUDE_PROJECTS_REPO, CLAUDE_PROJECTS_HOME]),
    YURI_HARD_DENY_FILES_JSON: JSON.stringify([ENV_FILE_REPO, ENV_FILE_BACKEND]),
    YURI_FS_WRAP_SPEC_JSON: JSON.stringify(GUARD_WRAP_SPEC),
  };
}

async function runGuardBypassProbe(ephRoot) {
  fs.writeFileSync(path.join(ephRoot, 'empty-dotenv'), '');
  const proc = spawn(process.execPath, [guardProbePath], {
    cwd: ephRoot,
    env: buildAllowlistedChildEnv(ephRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [code] = await once(proc, 'exit');
  const summaryLine = output.split('\n').find((l) => l.startsWith('BYPASS_NEG_SUMMARY='));
  assert.ok(summaryLine, 'bypass probe must emit BYPASS_NEG_SUMMARY\n' + output.slice(0, 2000));
  const summary = JSON.parse(summaryLine.slice('BYPASS_NEG_SUMMARY='.length));
  assert.equal(code, 0, 'bypass probe exit 0\n' + output.slice(0, 2500));
  return { summary, output };
}

async function runDbContainmentProbe(ephRoot) {
  fs.writeFileSync(path.join(ephRoot, 'empty-dotenv'), '');
  const proc = spawn(process.execPath, [dbContainmentProbePath], {
    cwd: ephRoot,
    env: buildAllowlistedChildEnv(ephRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [code] = await once(proc, 'exit');
  const summaryLine = output.split('\n').find((l) => l.startsWith('DB_CONTAIN_SUMMARY='));
  assert.ok(summaryLine, 'db containment probe must emit DB_CONTAIN_SUMMARY\n' + output.slice(0, 3000));
  const summary = JSON.parse(summaryLine.slice('DB_CONTAIN_SUMMARY='.length));
  assert.equal(code, 0, 'db containment probe exit 0\n' + output.slice(0, 3500));
  return { summary, output };
}

async function runSynthRedirectProbe(ephRoot) {
  fs.writeFileSync(path.join(ephRoot, 'empty-dotenv'), '');
  const proc = spawn(process.execPath, [synthRedirectProbePath], {
    cwd: ephRoot,
    env: buildAllowlistedChildEnv(ephRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const [code] = await once(proc, 'exit');
  const summaryLine = output.split('\n').find((l) => l.startsWith('SYNTH_REDIR_SUMMARY='));
  assert.ok(summaryLine, 'synth redirect probe must emit SYNTH_REDIR_SUMMARY\n' + output.slice(0, 2000));
  const summary = JSON.parse(summaryLine.slice('SYNTH_REDIR_SUMMARY='.length));
  assert.equal(code, 0, 'synth redirect probe exit 0\n' + output.slice(0, 2500));
  return { summary, output };
}

async function startBackend(ephRoot) {
  // Retained for post-Apollo live bind only — v5 design-only path must not call this.
  fs.writeFileSync(path.join(ephRoot, 'empty-dotenv'), '');
  const proc = spawn(process.execPath, [bootstrapPath], {
    cwd: ephRoot,
    env: buildAllowlistedChildEnv(ephRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (SERVER_READY.test(output)) {
      const onlineLine = output.split('\n').find((l) => /YURI_BACKEND_ONLINE/.test(l)) || '';
      return { proc, output, onlineLine };
    }
    if (proc.exitCode !== null) {
      const err = new Error(`backend exited before ready:\n${output}`);
      err.output = output;
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  proc.kill('SIGTERM');
  throw new Error(`backend did not become ready:\n${output}`);
}

async function stopBackend(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  await Promise.race([
    once(proc, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (proc.exitCode === null) {
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
  }
}
