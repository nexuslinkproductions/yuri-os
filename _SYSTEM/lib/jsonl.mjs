// @capability: lib-jsonl
// @serves: jsonl append | jsonl read | jsonl tail | append-only ledger primitive | fail-open event log
// @does: shared JSONL primitives — fail-open single-write append, corrupt-line-tolerant read, tail of last N records
// @use: replace hand-rolled appendFileSync/JSON.parse loops (12 occurrences across runtime/mure/fleet per seam census 2026-07-05)
// @exports: appendJsonl, readJsonl, tailJsonl

import fs from 'node:fs';
import path from 'node:path';

/**
 * Append one record as a single JSONL line (one appendFileSync call — atomic
 * enough for line-oriented logs under PIPE_BUF-sized records).
 * @param {string} file - target path
 * @param {object} obj - record to append
 * @param {{failOpen?: boolean, mkdir?: boolean}} [opts]
 *   failOpen (default true): swallow errors and return false instead of throwing.
 *   mkdir (default true): create the parent directory if missing.
 * @returns {boolean} true if written
 */
export function appendJsonl(file, obj, { failOpen = true, mkdir = true } = {}) {
  try {
    if (mkdir) fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(obj)}\n`);
    return true;
  } catch (e) {
    if (failOpen) return false;
    throw e;
  }
}

/**
 * Read a JSONL file, skipping corrupt lines (counted, never fatal).
 * @param {string} file
 * @param {{limit?: number, failOpen?: boolean}} [opts]
 *   limit: cap on returned records (from the start).
 *   failOpen (default true): missing/unreadable file -> {records:[], corrupt:0}.
 * @returns {{records: object[], corrupt: number}}
 */
export function readJsonl(file, { limit, failOpen = true } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (failOpen) return { records: [], corrupt: 0 };
    throw e;
  }
  const records = [];
  let corrupt = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      corrupt += 1;
    }
    if (limit != null && records.length >= limit) break;
  }
  return { records, corrupt };
}

/**
 * Last n parsed records of a JSONL file (corrupt lines skipped).
 * @param {string} file
 * @param {number} n
 * @returns {object[]}
 */
export function tailJsonl(file, n) {
  const { records } = readJsonl(file);
  if (!Number.isFinite(n) || n <= 0) return [];
  return records.slice(-n);
}
