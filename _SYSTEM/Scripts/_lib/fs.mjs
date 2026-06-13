// _lib/fs.mjs — shared filesystem helpers for the _SYSTEM/Scripts corpus.
//
// Consolidates idioms that were copy-pasted across many scripts (a 4-agent refactor scout found a
// systemic file-I/O duplication+drift surface). This first slice ships ONLY the behavior-identical
// piece — the verbatim `readJson` helper that lived in cross-session-miner / self-model /
// self-hypothesis / izanagi-postmortem / neuron-loop. `atomicWriteFile` (below) was added next, with
// the random-suffix tmp fix for the collision bug a peer review caught. One further helper — a
// timestamped JSONL appender — stays DEFERRED: an unresolved ts-injection footgun (a caller's own
// `ts` would silently override the injected one); it ships once that API is settled.

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, fsyncSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Read + JSON.parse a file, returning null on ANY failure — missing, unreadable, a directory, a
 * 0-byte/empty file, or malformed JSON. The behavior-identical consolidation of the `readJson`
 * helper copy-pasted verbatim across the self-model / learning scripts.
 *
 * FAIL-OPEN by design (every original did `catch { return null }`): these callers treat a
 * missing/corrupt artifact as "no data yet", never a crash. Do NOT use this where a corrupt file
 * must surface an error — that is a deliberately different contract (see the unguarded-parse
 * drift sites, which throw, and are a separate behavior-changing fix).
 *
 * @param {string} p  path to a JSON file
 * @returns {*|null}  parsed value, or null on any failure
 */
export function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write `content` to `p` ATOMICALLY w.r.t. readers: write a uniquely-named temp file in the SAME
 * directory, then rename it over `p` (a same-filesystem rename is atomic on POSIX/NTFS), so a reader
 * — or a crash mid-write — NEVER sees a torn/half-written file. Consolidates the temp+rename idiom
 * that was copy-pasted across the Scripts corpus, several copies using a FIXED `${file}.tmp` name
 * that collides when two runs race; the random suffix here removes that collision.
 *
 * GUARANTEE BOUNDARY (read this): atomic FOR READERS, NOT crash-DURABLE by default. Without fsync the
 * new bytes may still sit in the OS page cache and be lost on power loss after the rename returns.
 * Pass `{ fsync: true }` when the data must survive a crash (costs a disk flush). The migrated sites
 * never fsync'd — they wanted atomicity, not durability — so the default is false to preserve that.
 *
 * The caller passes ALREADY-serialized `content` (this helper does not JSON.stringify). On ANY
 * failure (write/close/rename) the temp file is unlinked — no orphan `.tmp` is left behind, and
 * the thrown error wraps the failing path while preserving the underlying system-error identity
 * (`.code`/`.errno`/`.syscall`, plus the original on `.cause`) so callers can still branch on it.
 *
 * @param {string} p        destination path
 * @param {string|Buffer} content  the exact bytes to write
 * @param {object} [opts]
 * @param {boolean} [opts.mkdir=true]   mkdir -p the parent dir first (set false to preserve a
 *                                      "throw if the dir is missing" contract)
 * @param {boolean} [opts.fsync=false]  fsync the temp file before rename (crash-durability)
 * @param {string}  [opts.encoding='utf8']
 */
export function atomicWriteFile(p, content, { mkdir = true, fsync = false, encoding = 'utf8' } = {}) {
  const dir = path.dirname(p);
  if (mkdir) mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    if (fsync) {
      fd = openSync(tmp, 'w');
      writeFileSync(fd, content, { encoding });
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
    } else {
      writeFileSync(tmp, content, { encoding });
    }
    renameSync(tmp, p);
  } catch (e) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closing on error */ } }
    try { unlinkSync(tmp); } catch { /* no orphan to clean, or never created */ }
    // Wrap with the failing path for debuggability, but PRESERVE the system-error identity
    // (code/errno/syscall) onto the wrapper so a caller branching on `err.code === 'ENOENT'`
    // still matches — the original error also stays reachable via `.cause`.
    const wrapped = new Error(`atomicWriteFile(${p}): ${e.message}`, { cause: e });
    for (const k of ['code', 'errno', 'syscall']) if (e?.[k] !== undefined) wrapped[k] = e[k];
    throw wrapped;
  }
}
