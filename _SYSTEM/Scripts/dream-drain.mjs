#!/usr/bin/env node
// @capability: dream-drain
// @serves: dream queue drain | dream-queue processor | learned rules synthesis | mistake→rule pipeline | overnight dream drain | yuri-sentinel learning drain
// @does: RUNNABLE drainer for .claude/yuri-sentinel/learning/dream-queue.jsonl. Reads pending entries
//   (oldest-first, since the queue is append-only chronological), dedups by content-hash of the
//   CURRENT bytes at each entry's promptFile (the queue only ever recorded a POINTER to a single
//   ephemeral, gitignored prompt-dump file that gets overwritten every session — historical content
//   for old entries is unrecoverable, so hashing "what promptFile resolves to right now" is the
//   honest dedup key, not a fiction), and categorizes by simple heuristics (has a "CORRECTIONS
//   DETECTED:" block / has imperative rule-like sentences). --preview (default) is fully DISARMED:
//   read-only, shows what WOULD be synthesized, writes nothing. --once processes ONE batch (oldest
//   N=50 not-yet-processed pending entries): extracts learned-rule candidates DETERMINISTICALLY (no
//   LLM call — pulls from "CORRECTIONS DETECTED:" blocks first as the highest-confidence signal, then
//   scans for imperative rule sentences matching the deprecated yuri-dream-processor.mjs's own
//   "N. <rule>" numbered-list convention for continuity), appends a dated section to global.md,
//   and marks the batch as consumed in an own processed-ledger (dream-processed.jsonl — NEVER
//   rewrites dream-queue.jsonl itself). Idempotent: consumed entries are tracked by their `ts` key
//   in the ledger, so re-running --once again advances to the NEXT unconsumed batch rather than
//   reprocessing the same one. No scheduler of its own — the runtime/overnight-runner (or any
//   caller) invokes this directly; nothing here self-arms a cron/launchd.
// @use:
//   node _SYSTEM/Scripts/dream-drain.mjs --preview [--batch-size 50]
//   node _SYSTEM/Scripts/dream-drain.mjs --once [--batch-size 50]
//   node _SYSTEM/Scripts/dream-drain.mjs --status --json
// @exports: loadQueue, loadProcessedLedger, selectBatch, hashPromptFile, categorizeEntry,
//   extractRuleCandidates, dedupAgainstGlobal, appendToGlobal, appendProcessedLedger,
//   previewBatch, runOnce, getStatus
//
// BUILD-ON (capability-first — not a reimplementation):
//   - _SYSTEM/Scripts/yuri-dream-processor.mjs: deprecated-by-header manual-fallback drain (do
//     NOT wire it to launchd). Read for the intended synthesis shape (rule-numbered-list convention,
//     global.md append format) — this script is the runnable replacement the packet asked for,
//     built fresh rather than reactivating the deprecated one.
//   - _SYSTEM/runtime/overnight-runner.mjs: the sibling "own append-only state, DISARMED-first,
//     status --json" pattern this script mirrors for shape consistency.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const LEARNING_DIR   = path.resolve(REPO_ROOT, '.claude/yuri-sentinel/learning');
const QUEUE_FILE     = path.resolve(LEARNING_DIR, 'dream-queue.jsonl');
const GLOBAL_FILE    = path.resolve(LEARNING_DIR, 'global.md');
// Processed ledger lives one level up (.claude/yuri-sentinel/), per the packet's exact path.
const SENTINEL_DIR   = path.resolve(REPO_ROOT, '.claude/yuri-sentinel');
const PROCESSED_FILE = path.resolve(SENTINEL_DIR, 'dream-processed.jsonl');
const EVENTS_FILE    = path.resolve(REPO_ROOT, '_SYSTEM/state/runtime/events.jsonl');

const DEFAULT_BATCH_SIZE = 50;

// ─── Queue + ledger I/O ───────────────────────────────────────────────────────

/** Read the dream-queue as parsed entries. Never mutates the file. Malformed lines are skipped
 * (logged to stderr) rather than throwing — a single corrupt line must not kill the drain. */
export function loadQueue(queueFile = QUEUE_FILE) {
  if (!fs.existsSync(queueFile)) return [];
  const lines = fs.readFileSync(queueFile, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); }
    catch (e) { process.stderr.write(`[dream-drain] skip malformed queue line: ${e.message}\n`); }
  }
  return out;
}

/** Read the processed-ledger. Each line is {ts, batchId, consumedTs:[...], promptHash, ruleCount, at}.
 * Returns the flat Set of every consumed entry `ts` key across all prior batches (the idempotency
 * guard) plus the raw records (for --status reporting). */
export function loadProcessedLedger(processedFile = PROCESSED_FILE) {
  if (!fs.existsSync(processedFile)) return { consumed: new Set(), records: [] };
  const lines = fs.readFileSync(processedFile, 'utf8').split('\n').filter(Boolean);
  const consumed = new Set();
  const records = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      records.push(rec);
      for (const ts of (rec.consumedTs || [])) consumed.add(ts);
    } catch (e) { process.stderr.write(`[dream-drain] skip malformed ledger line: ${e.message}\n`); }
  }
  return { consumed, records };
}

function appendProcessedLedgerRecord(rec, processedFile = PROCESSED_FILE) {
  fs.mkdirSync(path.dirname(processedFile), { recursive: true });
  fs.appendFileSync(processedFile, JSON.stringify(rec) + '\n');
}
export { appendProcessedLedgerRecord as appendProcessedLedger };

// ─── Batch selection ──────────────────────────────────────────────────────────

/**
 * Select the oldest N `pending` entries not already consumed by a prior batch (per the
 * processed-ledger). The queue is append-only chronological, so array order already IS
 * oldest-first — no timestamp sort needed, just filter + slice.
 */
export function selectBatch(entries, consumedSet, batchSize = DEFAULT_BATCH_SIZE) {
  const eligible = entries.filter((e) => e.status === 'pending' && !consumedSet.has(e.ts));
  return eligible.slice(0, batchSize);
}

// ─── Content hashing + dedup ──────────────────────────────────────────────────

/**
 * Hash the CURRENT bytes at an entry's promptFile. NOTE: promptFile is a single ephemeral,
 * gitignored file overwritten every session — this hash reflects "what that path resolves to
 * right now", not the historical content at enqueue time (which is unrecoverable; the queue
 * never snapshotted content, only a path pointer). Missing files hash to null (skipped, not
 * a fabricated hash) so a stale/moved-repo path (e.g. the pre-rename /YURI/ path) doesn't
 * silently collapse into a fake dedup bucket.
 */
export function hashPromptFile(promptFile) {
  if (!promptFile || !fs.existsSync(promptFile)) return null;
  try {
    const content = fs.readFileSync(promptFile, 'utf8');
    return { hash: crypto.createHash('sha256').update(content).digest('hex').slice(0, 16), content };
  } catch { return null; }
}

/** Group a batch by promptFile content-hash. Entries whose file is missing/unreadable land in
 * a `null` bucket — reported separately, never silently dropped from the count. */
export function dedupBatch(batch) {
  const buckets = new Map(); // hash -> { hash, content, entries: [] }
  const unreadable = [];
  for (const e of batch) {
    const h = hashPromptFile(e.promptFile);
    if (!h) { unreadable.push(e); continue; }
    if (!buckets.has(h.hash)) buckets.set(h.hash, { hash: h.hash, content: h.content, entries: [] });
    buckets.get(h.hash).entries.push(e);
  }
  return { buckets: [...buckets.values()], unreadable };
}

// ─── Categorization (simple heuristics, no LLM) ──────────────────────────────

const CORRECTIONS_RE = /CORRECTIONS DETECTED:/;
const RULE_LINE_RE = /^\s*\d+\.\s+.{8,}/m; // "N. <rule text>" (yuri-dream-processor.mjs convention)

/** Categorize one deduped bucket's content by cheap structural signals. Never scores via a
 * model call — pure regex presence checks. */
export function categorizeEntry(content) {
  return {
    hasCorrections: CORRECTIONS_RE.test(content),
    hasNumberedRules: RULE_LINE_RE.test(content),
    length: content.length,
  };
}

// ─── Deterministic rule-candidate extraction ─────────────────────────────────

// Rule-shape gate: an imperative verb opener, OR an explicit "should/must/never" modal,
// anywhere near the start of the line. This is the ONE shape bar applied to BOTH the
// corrections-block tier and the free-bullet tier below — a bullet under "CORRECTIONS
// DETECTED:" is NOT auto-qualified just by being there. Real corpus evidence (2026-07-04
// dream-prompt.txt) showed the upstream corrections-detector flags quoted human messages
// that merely OPEN a paragraph (e.g. "Base directory for this skill: ...") as if they were
// corrections — passing those through verbatim would poison global.md with non-rules.
const IMPERATIVE_OPENER_RE = /^(?:Always|Never|Don't|Do not|Avoid|Prefer|Ensure|Check|Verify|Treat|Route|Use|Keep|Diagnose|Respect|Handle|Lock|Deliver|Complete|Verify|Stop|Confirm)\b/i;
const MODAL_RE = /\b(?:should|must|never|always)\b/i;
function looksLikeRule(text) {
  const t = text.trim();
  if (t.length < 12 || t.length > 200) return false;
  // Reject lines that are clearly path/header/label declarations, not instructions.
  if (/^(?:Base directory|#|https?:\/\/|\/Users\/|\/[A-Za-z0-9_.\/-]+:)/i.test(t)) return false;
  return IMPERATIVE_OPENER_RE.test(t) || MODAL_RE.test(t);
}

const IMPERATIVE_RE = /^(?:-|\*|\d+\.)\s*(.{10,180})$/gim;

/**
 * Extract rule candidates from ONE piece of prompt content, deterministically:
 *   1. Lines inside a "CORRECTIONS DETECTED:" block that ALSO pass looksLikeRule() —
 *      highest-confidence signal (a human/agent already flagged these as corrections),
 *      but the corrections-detector itself is noisy upstream, so the rule-shape gate still
 *      applies rather than trusting the marker alone.
 *   2. Any remaining bullet lines elsewhere in the content that pass looksLikeRule()
 *      ("Always X", "Never X", "Don't X", "X should/must Y", ...) — the same rule-shape the
 *      deprecated processor's "N. <rule>" numbered-list convention targeted, generalized to
 *      bullets too since the CURRENT dream-prompt.txt format uses "- " session bullets, not
 *      numbered lists.
 * Conservative by construction: only lines matching an explicit rule-shape qualify; free
 * prose, path declarations, and paragraph openers are never promoted to a "rule". Caps
 * output per bucket so a giant prompt can't flood global.md.
 */
export function extractRuleCandidates(content, { maxPerBucket = 8 } = {}) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (text) => {
    const clean = text.replace(/\s+/g, ' ').trim().replace(/^"|"$/g, '');
    if (!looksLikeRule(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(clean);
  };

  // 1. CORRECTIONS DETECTED blocks — bullet lines immediately following the marker,
  //    filtered through the same looksLikeRule() gate as tier 2.
  const lines = content.split('\n');
  let inCorrections = false;
  for (const line of lines) {
    if (CORRECTIONS_RE.test(line)) { inCorrections = true; continue; }
    if (inCorrections) {
      if (/^\s*-\s+/.test(line)) pushCandidate(line.replace(/^\s*-\s+/, ''));
      else if (line.trim() === '' || /^\s{0,1}\S/.test(line) && !/^\s+/.test(line)) {
        // blank line or a new top-level (non-indented) line ends the block
        if (line.trim() !== '' && !/^\s*-\s+/.test(line)) inCorrections = false;
      }
    }
    if (candidates.length >= maxPerBucket) break;
  }

  // 2. Bullet lines anywhere else in the content, same rule-shape gate.
  if (candidates.length < maxPerBucket) {
    for (const m of content.matchAll(IMPERATIVE_RE)) {
      pushCandidate(m[1]);
      if (candidates.length >= maxPerBucket) break;
    }
  }

  return candidates.slice(0, maxPerBucket);
}

/** Filter out candidates whose normalized text already appears verbatim in global.md — avoid
 * re-appending the same learned rule on every batch. */
export function dedupAgainstGlobal(candidates, globalFile = GLOBAL_FILE) {
  const existing = fs.existsSync(globalFile) ? fs.readFileSync(globalFile, 'utf8').toLowerCase() : '';
  return candidates.filter((c) => !existing.includes(c.toLowerCase()));
}

// ─── global.md append ────────────────────────────────────────────────────────

export function appendToGlobal(rules, { globalFile = GLOBAL_FILE, dateStr } = {}) {
  if (!rules.length) return { appended: false, count: 0 };
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const section = `\n### Auto-synthesized ${date} (dream-drain)\n${rules.map((r) => `- ${r}`).join('\n')}\n`;
  fs.mkdirSync(path.dirname(globalFile), { recursive: true });
  fs.appendFileSync(globalFile, section);
  return { appended: true, count: rules.length, section };
}

// ─── Event emission ───────────────────────────────────────────────────────────

function emitEvent(event, data, eventsFile = EVENTS_FILE) {
  try {
    fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
    fs.appendFileSync(eventsFile, JSON.stringify({ t: new Date().toISOString(), comp: 'dream-drain', event, data }) + '\n');
  } catch { /* event-bus write failure must never break the drain */ }
}

// ─── Preview (--preview, DISARMED, default) ──────────────────────────────────

export function previewBatch({ batchSize = DEFAULT_BATCH_SIZE, queueFile = QUEUE_FILE, processedFile = PROCESSED_FILE } = {}) {
  const entries = loadQueue(queueFile);
  const { consumed } = loadProcessedLedger(processedFile);
  const batch = selectBatch(entries, consumed, batchSize);
  const { buckets, unreadable } = dedupBatch(batch);

  const bucketPreviews = buckets.map((b) => {
    const cat = categorizeEntry(b.content);
    const candidates = extractRuleCandidates(b.content);
    const novel = dedupAgainstGlobal(candidates);
    return {
      hash: b.hash,
      entryCount: b.entries.length,
      oldestTs: b.entries[0]?.ts,
      newestTs: b.entries[b.entries.length - 1]?.ts,
      ...cat,
      candidateCount: candidates.length,
      novelCandidateCount: novel.length,
      sampleCandidates: novel.slice(0, 3),
    };
  });

  return {
    batchSize,
    totalPending: entries.filter((e) => e.status === 'pending').length,
    eligibleForBatch: entries.filter((e) => e.status === 'pending' && !consumed.has(e.ts)).length,
    batchEntryCount: batch.length,
    uniqueBuckets: buckets.length,
    unreadableCount: unreadable.length,
    buckets: bucketPreviews,
  };
}

// ─── Real drain (--once) ──────────────────────────────────────────────────────

export function runOnce({ batchSize = DEFAULT_BATCH_SIZE, queueFile = QUEUE_FILE, processedFile = PROCESSED_FILE, globalFile = GLOBAL_FILE, eventsFile = EVENTS_FILE, now = new Date() } = {}) {
  const entries = loadQueue(queueFile);
  const { consumed } = loadProcessedLedger(processedFile);
  const batch = selectBatch(entries, consumed, batchSize);

  if (!batch.length) {
    emitEvent('drain-empty', { batchSize }, eventsFile);
    return { ok: true, drained: 0, rulesAppended: 0, reason: 'no eligible pending entries' };
  }

  const { buckets, unreadable } = dedupBatch(batch);
  const allCandidates = [];
  for (const b of buckets) allCandidates.push(...extractRuleCandidates(b.content));
  // Dedup within-batch too (two buckets could surface the same rule text).
  const uniqueCandidates = [...new Set(allCandidates.map((c) => c.trim()))];
  const novelRules = dedupAgainstGlobal(uniqueCandidates, globalFile);

  const dateStr = now.toISOString().slice(0, 10);
  const appendResult = appendToGlobal(novelRules, { globalFile, dateStr });

  const batchId = crypto.randomUUID();
  const consumedTs = batch.map((e) => e.ts);
  const ledgerRec = {
    batchId,
    at: now.toISOString(),
    consumedTs,
    entryCount: batch.length,
    uniqueBuckets: buckets.length,
    unreadableCount: unreadable.length,
    candidateCount: uniqueCandidates.length,
    rulesAppended: appendResult.count,
  };
  appendProcessedLedgerRecord(ledgerRec, processedFile);

  emitEvent('drain-batch', {
    batchId, entryCount: batch.length, uniqueBuckets: buckets.length,
    rulesAppended: appendResult.count, unreadableCount: unreadable.length,
  }, eventsFile);

  return {
    ok: true,
    batchId,
    drained: batch.length,
    uniqueBuckets: buckets.length,
    unreadableCount: unreadable.length,
    candidatesFound: uniqueCandidates.length,
    rulesAppended: appendResult.count,
    appendedRules: novelRules,
  };
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getStatus({ queueFile = QUEUE_FILE, processedFile = PROCESSED_FILE } = {}) {
  const entries = loadQueue(queueFile);
  const { consumed, records } = loadProcessedLedger(processedFile);
  const pending = entries.filter((e) => e.status === 'pending');
  const eligible = pending.filter((e) => !consumed.has(e.ts));
  const totalRulesAppended = records.reduce((sum, r) => sum + (r.rulesAppended || 0), 0);
  return {
    queueFile,
    processedFile,
    totalEntries: entries.length,
    pendingEntries: pending.length,
    consumedByPriorBatches: consumed.size,
    eligibleForNextBatch: eligible.length,
    batchesRun: records.length,
    totalRulesAppended,
    lastBatchAt: records.length ? records[records.length - 1].at : null,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) args[k] = true;
      else { args[k] = v; i++; }
    } else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batchSize = args['batch-size'] ? parseInt(args['batch-size'], 10) : DEFAULT_BATCH_SIZE;

  if (args.status) {
    const status = getStatus();
    if (args.json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log('dream-drain status:');
      for (const [k, v] of Object.entries(status)) console.log(`  ${k}: ${v}`);
    }
    return 0;
  }

  if (args.once) {
    const result = runOnce({ batchSize });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  // Default: --preview (DISARMED)
  const preview = previewBatch({ batchSize });
  console.log(JSON.stringify(preview, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exitCode = code).catch((e) => {
    console.error(`[dream-drain] fatal: ${e.message}`);
    process.exitCode = 1;
  });
}
