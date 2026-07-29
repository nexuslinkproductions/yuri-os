// NEXUS backend spine, module 2 — policy gate. Deny-by-default action
// registry; every authorize() call appends a hash-chained audit event to
// _SYSTEM/state/nexus/audit.jsonl. The approval rule lives here, not in the
// UI: post.execute denies unless the draft is approved.

import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE_DIR = path.join(ROOT, '_SYSTEM', 'state', 'nexus');
const DEFAULT_AUDIT = path.join(STATE_DIR, 'audit.jsonl');

const GENESIS = 'GENESIS';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// ── cross-process append lock ───────────────────────────────────────────────
// server.mjs and social-mcp.mjs share one audit.jsonl. The hash chain must be
// serialized across processes: take a lockfile, re-read the current chain
// head, then append — otherwise two processes fork the chain from stale heads.
const LOCK_STALE_MS = 10_000;
const _waitBuf = new Int32Array(new SharedArrayBuffer(4));

function acquireLock(lockPath) {
  for (let i = 0; i < 500; i++) {
    try {
      const fd = openSync(lockPath, 'wx');
      return fd;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath); // dead holder
      } catch { /* raced unlink is fine */ }
      Atomics.wait(_waitBuf, 0, 0, 5); // 5ms backoff; Atomics.wait is legal on node main thread
    }
  }
  throw new Error('audit_lock_timeout');
}

function releaseLock(fd, lockPath) {
  try { closeSync(fd); } finally { try { unlinkSync(lockPath); } catch { /* already gone */ } }
}

/** Hash of the last event currently in the file (GENESIS when empty/missing). */
function readChainHead(auditPath) {
  if (!existsSync(auditPath)) return GENESIS;
  const lines = readFileSync(auditPath, 'utf8').split('\n').filter(l => l.trim());
  if (!lines.length) return GENESIS;
  try { return JSON.parse(lines[lines.length - 1]).hash || GENESIS; }
  catch { return GENESIS; }
}

// Deterministic stringify (sorted keys) so args_sha256 is stable.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

// Event hash: sha256 over the previous hash + the event payload (sans hash).
function computeEventHash(event) {
  const payload = JSON.stringify({
    ts: event.ts, actor: event.actor, action: event.action,
    args_sha256: event.args_sha256, decision: event.decision, reason: event.reason,
    prev_hash: event.prev_hash,
  });
  return sha256(event.prev_hash + payload);
}

/** Re-verify a whole audit chain file. Pure: no store, no singletons. */
export function verifyAuditFile(auditPath = DEFAULT_AUDIT) {
  if (!existsSync(auditPath)) return { ok: true, events: 0, note: 'no_audit_file' };
  const lines = readFileSync(auditPath, 'utf8').split('\n').filter(l => l.trim());
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let ev;
    try { ev = JSON.parse(lines[i]); } catch { return { ok: false, events: i, broken_at: i, error: 'unparseable_line' }; }
    if (ev.prev_hash !== prev) return { ok: false, events: i, broken_at: i, error: 'prev_hash_mismatch' };
    if (computeEventHash(ev) !== ev.hash) return { ok: false, events: i, broken_at: i, error: 'hash_mismatch' };
    prev = ev.hash;
  }
  return { ok: true, events: lines.length, head: prev === GENESIS ? null : prev };
}

export function createPolicy({ store, auditPath = DEFAULT_AUDIT } = {}) {
  const db = store || getStore();
  mkdirSync(path.dirname(auditPath), { recursive: true });
  const lockPath = auditPath + '.lock';

  const listeners = [];

  // Action registry. Anything not listed here is denied by default.
  const registry = {
    'draft.edit': () => ({ decision: 'allow', reason: 'ok' }),

    'draft.approve': () => ({ decision: 'allow', reason: 'ok' }),

    'draft.disapprove': () => ({ decision: 'allow', reason: 'ok' }),

    'post.execute': (_actor, args) => {
      const id = args && args.id;
      if (!id) return { decision: 'deny', reason: 'id_required' };
      const draft = db.get(id);
      if (!draft || draft.type !== 'draft') return { decision: 'deny', reason: 'draft_not_indexed' };
      const status = draft.data.status || 'draft';
      if (status === 'approved' || db.hasRel(id, 'marcel', 'approved-by')) {
        return { decision: 'allow', reason: 'approved' };
      }
      return { decision: 'deny', reason: 'not_approved' };
    },

    'media.write': (_actor, args) =>
      args && typeof args.path === 'string' && args.path
        ? { decision: 'allow', reason: 'ok' }
        : { decision: 'deny', reason: 'path_required' },

    'store.delete': (actor) =>
      actor === 'marcel'
        ? { decision: 'allow', reason: 'ok' }
        : { decision: 'deny', reason: 'owner_only' },
  };

  /**
   * Gate one mutation. Returns { decision, reason } and ALWAYS appends a
   * hash-chained audit event (allow and deny alike), then notifies listeners
   * (the rules engine) with the event plus the raw args.
   */
  function authorize(actor, action, args = {}) {
    const fn = registry[action];
    const { decision, reason } = fn
      ? fn(actor, args)
      : { decision: 'deny', reason: 'unregistered_action' };

    // Serialize the append across processes: under the lock, re-read the
    // current chain head so this event links to the true tail, then append.
    const fd = acquireLock(lockPath);
    let event;
    try {
      const prevHash = readChainHead(auditPath);
      event = {
        ts: new Date().toISOString(),
        actor: String(actor),
        action: String(action),
        args_sha256: sha256(stableStringify(args ?? {})),
        decision,
        reason,
        prev_hash: prevHash,
      };
      event.hash = computeEventHash(event);
      appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf8');
    } finally {
      releaseLock(fd, lockPath);
    }

    for (const fn of listeners) {
      try { fn(event, args); } catch (err) { console.error('[nexus rules] listener error:', err.message); }
    }
    return { decision, reason };
  }

  return {
    authorize,
    verifyAuditChain: () => verifyAuditFile(auditPath),
    onEvent: (fn) => listeners.push(fn),
    actions: Object.keys(registry),
  };
}

// Default singleton, created lazily on first authorize() so importing this
// module is side-effect free. Listeners registered before first use are
// buffered and attached when the real policy is built.
let _policy = null;
const _pendingListeners = [];
export function getPolicy() {
  if (!_policy) {
    _policy = createPolicy();
    for (const fn of _pendingListeners) _policy.onEvent(fn);
    _pendingListeners.length = 0;
  }
  return _policy;
}

export const policy = {
  authorize: (...a) => getPolicy().authorize(...a),
  verifyAuditChain: () => getPolicy().verifyAuditChain(),
  onEvent: (fn) => { if (_policy) _policy.onEvent(fn); else _pendingListeners.push(fn); },
  get actions() { return getPolicy().actions; },
};
