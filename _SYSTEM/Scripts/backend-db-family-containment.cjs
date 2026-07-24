'use strict';
/**
 * backend-db-family-containment — recovery-grade DB family path/identity guards
 * correlationId=yuri-post-restoration-backend-readiness-v1
 *
 * Importable RUNTIME module (not test-only). Used by readiness harness and
 * available for production recovery APPLY gates.
 *
 * Hardened checks (owner-required):
 * 1. Symlink reject (lstat + O_NOFOLLOW open)
 * 2. Regular file (fstat S_ISREG)
 * 3. realpath under EPH root
 * 4. st_dev must match EPH_ROOT (bind-mount / other volume fail-closed)
 * 5. nlink === 1 (hard-link to outside inode fail-closed)
 *
 * TOCTOU: open O_NOFOLLOW once, then fstat the same fd. Path realpath is taken
 * only after a successful nofollow open (symlink swap fails open). Residual:
 * rename/replace of a regular file between open and realpath is outside this
 * sync harness's atomic window — documented, not masked.
 */

const fs = require('fs');
const path = require('path');
const { constants: FS } = fs;

const FAMILY_SUFFIXES = Object.freeze(['', '-wal', '-shm', '-journal']);

function ephRootReal(ephRoot) {
  const root = path.resolve(String(ephRoot));
  return typeof fs.realpathSync.native === 'function'
    ? fs.realpathSync.native(root)
    : fs.realpathSync(root);
}

function pathPresentNoFollow(candidatePath) {
  try {
    fs.lstatSync(candidatePath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    return true;
  }
}

/**
 * LEGACY path-only check (pre inode/device). Kept for red-baseline mutants.
 * Symlink reject + realpath-under-EPH + regular file via lstat/stat.
 * Does NOT check nlink or st_dev.
 */
function legacyPathOnlyHardened(candidatePath, ephRoot) {
  try {
    const lst = fs.lstatSync(candidatePath);
    if (lst.isSymbolicLink() || (lst.mode & FS.S_IFMT) === FS.S_IFLNK) return false;
    const st = fs.statSync(candidatePath);
    if (!st.isFile() || (st.mode & FS.S_IFMT) !== FS.S_IFREG) return false;
    const real = typeof fs.realpathSync.native === 'function'
      ? fs.realpathSync.native(candidatePath)
      : fs.realpathSync(candidatePath);
    const rootReal = ephRootReal(ephRoot);
    return real === rootReal || real.startsWith(rootReal + path.sep);
  } catch {
    return false;
  }
}

/**
 * LEGACY enumerate: silent-skip present non-hardened (journal omit gap).
 */
function legacyEnumerateDbFamilyOmitNonHardened(mainPath, ephRoot) {
  if (!mainPath || mainPath === ':memory:' || String(mainPath).startsWith('file:')) return [];
  const found = [];
  for (const suffix of FAMILY_SUFFIXES) {
    const candidate = mainPath + suffix;
    try {
      if (!fs.existsSync(candidate)) continue;
      if (!legacyPathOnlyHardened(candidate, ephRoot)) continue;
      const real = typeof fs.realpathSync.native === 'function'
        ? fs.realpathSync.native(candidate)
        : fs.realpathSync(candidate);
      found.push(real);
    } catch { /* ignore */ }
  }
  return found;
}

/**
 * Assess one candidate. Opens O_NOFOLLOW, fstats same fd.
 * @returns {{ ok: boolean, reason?: string, realPath?: string, stat?: fs.Stats }}
 */
function assessDbFamilyMember(candidatePath, ephRoot, opts = {}) {
  let fd;
  try {
    let lst;
    try {
      lst = fs.lstatSync(candidatePath);
    } catch (err) {
      return { ok: false, reason: err && err.code === 'ENOENT' ? 'absent' : 'lstat_failed' };
    }
    if (lst.isSymbolicLink() || (lst.mode & FS.S_IFMT) === FS.S_IFLNK) {
      return { ok: false, reason: 'symlink' };
    }

    const flags = FS.O_RDONLY
      | (FS.O_CLOEXEC || 0)
      | (FS.O_NOFOLLOW || 0);
    try {
      fd = fs.openSync(candidatePath, flags);
    } catch (err) {
      return { ok: false, reason: 'open_nofollow_failed', detail: String(err && err.message) };
    }

    const st = fs.fstatSync(fd);
    if (!st.isFile() || (st.mode & FS.S_IFMT) !== FS.S_IFREG) {
      return { ok: false, reason: 'not_regular_file', stat: st };
    }
    if (st.nlink !== 1) {
      return { ok: false, reason: 'hardlink_nlink', stat: st, nlink: st.nlink };
    }

    const ephStat = opts.ephRootStat || fs.statSync(path.resolve(String(ephRoot)));
    if (Number(st.dev) !== Number(ephStat.dev)) {
      return { ok: false, reason: 'st_dev_mismatch', stat: st, ephDev: ephStat.dev };
    }

    // Path identity after successful nofollow open (symlink TOCTOU mitigated by open).
    const real = typeof fs.realpathSync.native === 'function'
      ? fs.realpathSync.native(candidatePath)
      : fs.realpathSync(candidatePath);
    const rootReal = ephRootReal(ephRoot);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
      return { ok: false, reason: 'realpath_outside_eph', realPath: real };
    }

    if (opts.forbiddenInodes instanceof Set) {
      const key = `${st.dev}:${st.ino}`;
      if (opts.forbiddenInodes.has(key)) {
        return { ok: false, reason: 'forbidden_inode', stat: st };
      }
    }

    return { ok: true, realPath: real, stat: st };
  } catch (err) {
    return { ok: false, reason: 'assess_threw', detail: String(err && err.message) };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function isHardenedDbFamilyMember(candidatePath, ephRoot, opts = {}) {
  return assessDbFamilyMember(candidatePath, ephRoot, opts).ok === true;
}

/**
 * Enumerate family. Absent sidecars OK. Present non-hardened → presentViolations.
 */
function enumerateDbFamily(mainPath, ephRoot, opts = {}) {
  if (!mainPath || mainPath === ':memory:' || String(mainPath).startsWith('file:')) {
    return { members: [], presentViolations: [] };
  }
  const members = [];
  const presentViolations = [];
  for (const suffix of FAMILY_SUFFIXES) {
    const candidate = mainPath + suffix;
    if (!pathPresentNoFollow(candidate)) continue;
    const assessed = assessDbFamilyMember(candidate, ephRoot, opts);
    if (!assessed.ok) {
      presentViolations.push({
        path: candidate,
        suffix,
        reason: assessed.reason || 'present_non_hardened',
        detail: assessed.detail,
      });
      continue;
    }
    members.push(assessed.realPath);
  }
  return { members, presentViolations };
}

module.exports = {
  FAMILY_SUFFIXES,
  ephRootReal,
  pathPresentNoFollow,
  legacyPathOnlyHardened,
  legacyEnumerateDbFamilyOmitNonHardened,
  assessDbFamilyMember,
  isHardenedDbFamilyMember,
  enumerateDbFamily,
};
