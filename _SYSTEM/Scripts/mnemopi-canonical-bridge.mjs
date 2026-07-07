#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  REPO_ROOT, proposeMemoryWrite, recordMemoryProposalDecision, MEMORY_PROPOSAL_LOG, MEMORY_LEDGER_LOG,
} from './memory-kernel.mjs';
import { appendClaim, mintEventId, loadCanonical, shardPath, drainOnce } from './memory-canonical-store.mjs';
import { pendingMemoryProposals, deterministicReviewProposal } from './memory-proposal-autopilot.mjs';

// @capability: mnemopi-canonical-bridge
// @serves: mnemopi auto-retain to canonical | mnemopi export seam | omp learnings gated into canonical | auto-adjudicated memory proposals
// @does: the OMP→YURI memory seam in TWO gated phases (owner design 2026-07-07: "keep proposals, avoid flood,
//        auto-review pass/reject"). PHASE 1 exportMnemopiToProposals: eligible Mnemopi working_memory rows →
//        proposeMemoryWrite (the propose→decide gate), content-sha deduped, loop-guarded (skips yuri-seed), with
//        deliberate `coding-agent-retain` rows pre-tagged durable. PHASE 2 adjudicateMnemopiProposals: each pending
//        mnemopi-export proposal is auto-reviewed by the existing deterministicReviewProposal — `keep` promotes to
//        canonical (appendClaim + drain, provenance.lane='mnemopi' so the seed loop-guard skips it), `reject`/`defer`
//        is recorded and the proposal is RETAINED (never floods canonical). This is the anti-flood answer: chatter
//        defers as a kept proposal, only durable learnings reach canonical.
// @use: node mnemopi-canonical-bridge.mjs [--dry-run|--apply] [--export-only|--adjudicate-only]; or
//       runExportAndAdjudicate({ apply:true }).
// @exports: runExportAndAdjudicate, exportMnemopiToProposals, adjudicateMnemopiProposals, proposalToClaim,
//           resolveMnemopiBankPath, ELIGIBLE_SOURCES, EXPORT_TAG, BRIDGE_LANE
// @depends: memory-kernel.mjs, memory-canonical-store.mjs, memory-proposal-autopilot.mjs, better-sqlite3

export const ELIGIBLE_SOURCES = new Set(['coding-agent-transcript', 'coding-agent-retain']);
export const EXPORT_TAG = 'mnemopi-export';
export const BRIDGE_LANE = 'mnemopi';
const MEM_SUBJECT_PREFIX = 'mem:';
const READ_VIEW_PATH = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-canonical', 'read-view.json');

export function resolveMnemopiBankPath() {
  const banksDir = path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'banks');
  if (existsSync(banksDir)) {
    const matches = readdirSync(banksDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('YURI-OS-MUSUBI-'))
      .map((e) => {
        const dbPath = path.join(banksDir, e.name, 'mnemopi.db');
        return existsSync(dbPath) ? { dbPath, mtimeMs: statSync(dbPath).mtimeMs } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (matches.length) return matches[0].dbPath;
  }
  return path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'mnemopi.db');
}

const sha256 = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex');
const truncate = (t, max = 80) => { const v = String(t || ''); return v.length <= max ? v : `${v.slice(0, max)}…`; };

// Content already proposed / promoted, so export never re-proposes the same retention.
function proposedContentShas(opts = {}) {
  const seen = new Set();
  const add = (c) => { const t = String(c || '').trim(); if (t) seen.add(sha256(t)); };
  for (const p of [opts.proposalLogPath || MEMORY_PROPOSAL_LOG, opts.ledgerLogPath || MEMORY_LEDGER_LOG]) {
    if (!existsSync(p)) continue;
    for (const ln of readFileSync(p, 'utf8').split('\n')) { const t = ln.trim(); if (!t) continue; try { add(JSON.parse(t).content); } catch { /* skip */ } }
  }
  if (existsSync(READ_VIEW_PATH)) {
    try { const v = JSON.parse(readFileSync(READ_VIEW_PATH, 'utf8')); for (const c of Object.values(v?.claims || {})) if (c?.object?.content != null) add(c.object.content); } catch { /* skip */ }
  }
  return seen;
}

// PHASE 1 — propose eligible Mnemopi retentions into the propose→decide gate (no direct canonical write).
export function exportMnemopiToProposals(opts = {}) {
  const apply = opts.apply === true;
  const dryRun = !apply;
  const bankPath = opts.bankPath || resolveMnemopiBankPath();
  if (!existsSync(bankPath)) return { ok: false, reason: 'no-bank', scanned: 0, eligible: 0, alreadyProposed: 0, proposed: 0, dryRun, bankPath, examples: [] };

  const seen = proposedContentShas(opts);
  let scanned = 0, eligible = 0, alreadyProposed = 0, proposed = 0;
  const examples = [];
  const db = new Database(bankPath, { readonly: true });
  db.pragma('busy_timeout = 10000');
  const rows = db.prepare('SELECT id, content, embed_text, source, importance, memory_type, timestamp FROM working_memory').all();
  for (const row of rows) {
    scanned += 1;
    if (!ELIGIBLE_SOURCES.has(row.source)) continue; // LOOP GUARD: skip yuri-seed / foreign rows
    eligible += 1;
    const text = String(row.embed_text || row.content || '').trim();
    if (!text) continue;
    const hash = sha256(text);
    if (seen.has(hash)) { alreadyProposed += 1; continue; }
    if (examples.length < 3) examples.push(truncate(text));
    // Deliberate retains (retain-tool) are pre-tagged durable → the reviewer keeps them; raw transcript is untagged
    // → the reviewer defers it (kept as a proposal, never flooding canonical).
    const tags = row.source === 'coding-agent-retain' ? [EXPORT_TAG, 'reference'] : [EXPORT_TAG];
    if (!dryRun) {
      const r = proposeMemoryWrite(
        { content: text, surface: 'yuri-memory', tags, confidence: 0.6, reason: 'mnemopi auto-retain export — auto-adjudicated', originLane: BRIDGE_LANE },
        { record: true, lane: BRIDGE_LANE, session: opts.session || 'mnemopi-export' },
      );
      if (r.ok && (r.recorded ? r.recorded.ok : true)) { proposed += 1; seen.add(hash); }
    } else { proposed += 1; seen.add(hash); }
  }
  db.close();
  return { ok: true, scanned, eligible, alreadyProposed, proposed, dryRun, bankPath, examples };
}

// Map a KEPT proposal → canonical claim (subject = content-hash; provenance.lane='mnemopi' via appendClaim).
export function proposalToClaim(proposal = {}) {
  const text = String(proposal.content || '').trim();
  if (!text) return null;
  const sha = sha256(text);
  return {
    kind: 'assert', subject: MEM_SUBJECT_PREFIX + sha, predicate: 'learning',
    object: { content: text, originLane: BRIDGE_LANE, sha, proposalId: proposal.id || null },
    domain: 'memory', tier: null, lifecycle: 'promoted', memory_type: 'learning',
  };
}

// PHASE 2 — auto-review pending mnemopi-export proposals; keep→canonical, reject/defer→recorded (retained).
export function adjudicateMnemopiProposals(opts = {}) {
  const apply = opts.apply === true;
  const dryRun = !apply;
  const sessionId = opts.session || 'mnemopi-adjudicate';
  const pending = pendingMemoryProposals(opts);
  if (!pending.ok) return { ok: false, error: pending.error };
  const mine = pending.proposals.filter((p) => Array.isArray(p.tags) && p.tags.includes(EXPORT_TAG));

  // eventIds already canonical / pending in the shard → idempotent promotion.
  const seenEvent = new Set();
  try { for (const c of loadCanonical({ ...opts, includeAdvisory: true })) if (c?.eventId) seenEvent.add(c.eventId); } catch { /* peer-open */ }
  try { const sp = shardPath(BRIDGE_LANE, sessionId, opts); if (existsSync(sp)) for (const ln of readFileSync(sp, 'utf8').split('\n')) { const t = ln.trim(); if (!t) continue; try { const ev = JSON.parse(t); if (ev.eventId) seenEvent.add(ev.eventId); } catch { /* skip */ } } } catch { /* none */ }

  let reviewed = 0, kept = 0, promoted = 0, deferred = 0, rejected = 0, rewritten = 0;
  const decisions = [];
  for (const proposal of mine) {
    reviewed += 1;
    const review = deterministicReviewProposal(proposal);
    const decision = review.decision;
    if (decision === 'keep') kept += 1;
    else if (decision === 'reject') rejected += 1;
    else if (decision === 'rewrite') rewritten += 1;
    else deferred += 1;
    if (decisions.length < 5) decisions.push({ id: proposal.id, decision, reason: review.reason, preview: truncate(proposal.content) });
    if (dryRun) continue;
    // record the decision (keep/reject/defer/rewrite) so the proposal is not re-reviewed forever.
    recordMemoryProposalDecision({ proposalId: proposal.id, decision, reason: review.reason, decidedBy: 'mnemopi-autopilot' },
      { lane: BRIDGE_LANE, session: sessionId });
    // KEEP → promote to canonical (appendClaim + drain later). Everything else stays a retained proposal.
    if (decision === 'keep') {
      const claim = proposalToClaim(review.content ? { ...proposal, content: review.content } : proposal);
      if (!claim) continue;
      const eventId = mintEventId(claim);
      if (seenEvent.has(eventId)) continue;
      const r = appendClaim(BRIDGE_LANE, sessionId, claim, opts);
      if (r.ok) { promoted += 1; seenEvent.add(eventId); }
    }
  }
  let drained = false;
  if (!dryRun && promoted > 0) { try { drained = drainOnce(opts.drainerId || 'mnemopi-bridge', opts).ok === true; } catch { /* fail-open */ } }
  return { ok: true, reviewed, kept, promoted, deferred, rejected, rewritten, drained, dryRun, decisions };
}

// Full flow: propose then adjudicate. The session_shutdown hook calls this.
export function runExportAndAdjudicate(opts = {}) {
  const exported = opts.adjudicateOnly ? null : exportMnemopiToProposals(opts);
  const adjudicated = opts.exportOnly ? null : adjudicateMnemopiProposals(opts);
  return { ok: (exported?.ok ?? true) && (adjudicated?.ok ?? true), exported, adjudicated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const exportOnly = process.argv.includes('--export-only');
  const adjudicateOnly = process.argv.includes('--adjudicate-only');
  console.log(JSON.stringify(runExportAndAdjudicate({ apply, exportOnly, adjudicateOnly }), null, 2));
}
