#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  REPO_ROOT, proposeMemoryWrite, recordMemoryProposalDecision, MEMORY_PROPOSAL_LOG, MEMORY_LEDGER_LOG,
} from './memory-kernel.mjs';
import { appendClaim, mintEventId, loadCanonical, shardPath, drainOnce } from './memory-canonical-store.mjs';
import { pendingMemoryProposals, deterministicReviewProposal } from './memory-proposal-autopilot.mjs';
import { runOllamaCloudChat } from './ollama-adapter.mjs';

// @capability: mnemopi-canonical-bridge
// @serves: mnemopi auto-retain to canonical | mnemopi export seam | omp learnings gated into canonical | llm-adjudicated memory proposals | deepseek-flash memory review
// @does: the OMP→YURI memory seam in TWO gated phases (owner design 2026-07-07: "keep proposals, avoid flood,
//        auto-review pass/reject"). PHASE 1 exportMnemopiToProposals: eligible Mnemopi working_memory rows →
//        proposeMemoryWrite (the propose→decide gate), content-sha deduped, loop-guarded (skips yuri-seed), with
//        deliberate `coding-agent-retain` rows pre-tagged durable. PHASE 2 adjudicateMnemopiProposals: each pending
//        mnemopi-export proposal is auto-reviewed — deterministicReviewProposal is the SAFETY gate (protected-mutation
//        reject / peer-blame rewrite stand), then a deepseek-v4-flash LLM judge (default) decides keep/reject/defer
//        semantically; `keep` promotes to canonical (appendClaim + drain, provenance.lane='mnemopi' so the seed
//        loop-guard skips it), reject/defer is recorded and the proposal is RETAINED (never floods canonical).
//        LLM failure fails open to the deterministic decision. Anti-flood: chatter defers as a kept proposal.
// @use: node mnemopi-canonical-bridge.mjs [--dry-run|--apply] [--export-only|--adjudicate-only] [--deterministic];
//       or await runExportAndAdjudicate({ apply:true }).
// @exports: runExportAndAdjudicate, exportMnemopiToProposals, adjudicateMnemopiProposals, llmReviewProposal,
//           proposalToClaim, resolveMnemopiBankPath, ELIGIBLE_SOURCES, EXPORT_TAG, BRIDGE_LANE, REVIEW_MODEL
// @depends: memory-kernel.mjs, memory-canonical-store.mjs, memory-proposal-autopilot.mjs, ollama-adapter.mjs, better-sqlite3

export const ELIGIBLE_SOURCES = new Set(['coding-agent-transcript', 'coding-agent-retain']);
export const EXPORT_TAG = 'mnemopi-export';
export const BRIDGE_LANE = 'mnemopi';
export const REVIEW_MODEL = 'deepseek-v4-flash';
const MEM_SUBJECT_PREFIX = 'mem:';
const READ_VIEW_PATH = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-canonical', 'read-view.json');
const MAX_LLM_REVIEWS = 40; // bound cost per run
const REVIEW_SYSTEM = 'You are a strict long-term memory curator for an AI assistant. Decide if a candidate memory is a DURABLE, REUSABLE learning worth remembering across future sessions — a decision, preference, fact, rule, constraint, workflow, or correction. REJECT transient session chatter: greetings, test messages, trivial Q&A, ephemeral status, one-off task instructions with no lasting value. Respond with ONLY a JSON object: {"decision":"keep"|"reject"|"defer","reason":"<=12 words"}. keep=durable & clearly useful; reject=transient/noise; defer=genuinely unsure.';

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

function ollamaKey() {
  let k = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || '';
  if (!k) { try { k = execFileSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', 'YURI_OS_MUSUBI:OLLAMA_API_KEY', '-w'], { encoding: 'utf8' }).trim(); } catch { /* no keychain */ } }
  return k;
}

// Semantic keep/reject/defer via deepseek-v4-flash. Fail-open: null → caller falls back to the deterministic decision.
export async function llmReviewProposal(proposal = {}, opts = {}) {
  const content = String(proposal.content || '').trim();
  if (!content) return null;
  const apiKey = opts.apiKey || ollamaKey();
  if (!apiKey) return null;
  const endpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api/chat';
  try {
    const out = await runOllamaCloudChat(endpoint, apiKey, opts.model || REVIEW_MODEL, content, REVIEW_SYSTEM, { lane: 'mnemopi-review' });
    const m = String(out || '').match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const decision = String(parsed.decision || '').toLowerCase();
    if (!['keep', 'reject', 'defer'].includes(decision)) return null;
    return { decision, reason: String(parsed.reason || 'llm review').slice(0, 160) };
  } catch { return null; }
}

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

// PHASE 2 — auto-review pending mnemopi-export proposals (deterministic SAFETY gate + deepseek-flash LLM judge).
// keep → canonical; reject/defer → recorded, proposal RETAINED (no flood). Default reviewer 'llm'; 'deterministic' forces rules-only.
export async function adjudicateMnemopiProposals(opts = {}) {
  const apply = opts.apply === true;
  const dryRun = !apply;
  const reviewer = opts.reviewer || 'llm';
  const sessionId = opts.session || 'mnemopi-adjudicate';
  const pending = pendingMemoryProposals(opts);
  if (!pending.ok) return { ok: false, error: pending.error };
  const mine = pending.proposals.filter((p) => Array.isArray(p.tags) && p.tags.includes(EXPORT_TAG));

  const seenEvent = new Set();
  try { for (const c of loadCanonical({ ...opts, includeAdvisory: true })) if (c?.eventId) seenEvent.add(c.eventId); } catch { /* peer-open */ }
  try { const sp = shardPath(BRIDGE_LANE, sessionId, opts); if (existsSync(sp)) for (const ln of readFileSync(sp, 'utf8').split('\n')) { const t = ln.trim(); if (!t) continue; try { const ev = JSON.parse(t); if (ev.eventId) seenEvent.add(ev.eventId); } catch { /* skip */ } } } catch { /* none */ }

  let reviewed = 0, kept = 0, promoted = 0, deferred = 0, rejected = 0, rewritten = 0, llmUsed = 0;
  const decisions = [];
  for (const proposal of mine) {
    reviewed += 1;
    const safety = deterministicReviewProposal(proposal); // SAFETY gate — protected-mutation reject / peer-blame rewrite stand
    let decision = safety.decision;
    let reason = safety.reason;
    let content = safety.content;
    // Escalate to the LLM judge for the keep/reject/defer call UNLESS deterministic already made a safety decision.
    if (reviewer === 'llm' && (safety.decision === 'defer' || safety.decision === 'keep') && llmUsed < MAX_LLM_REVIEWS) {
      const llm = await llmReviewProposal(proposal, opts);
      if (llm) { llmUsed += 1; decision = llm.decision; reason = `llm(deepseek-flash): ${llm.reason}`; content = undefined; }
    }
    if (decision === 'keep') kept += 1; else if (decision === 'reject') rejected += 1; else if (decision === 'rewrite') rewritten += 1; else deferred += 1;
    if (decisions.length < 8) decisions.push({ id: proposal.id, decision, reason, preview: truncate(proposal.content) });
    if (dryRun) continue;
    recordMemoryProposalDecision({ proposalId: proposal.id, decision, reason, decidedBy: reviewer === 'llm' ? 'mnemopi-llm-autopilot' : 'mnemopi-autopilot' },
      { lane: BRIDGE_LANE, session: sessionId });
    if (decision === 'keep') {
      const claim = proposalToClaim(content ? { ...proposal, content } : proposal);
      if (!claim) continue;
      const eventId = mintEventId(claim);
      if (seenEvent.has(eventId)) continue;
      const r = appendClaim(BRIDGE_LANE, sessionId, claim, opts);
      if (r.ok) { promoted += 1; seenEvent.add(eventId); }
    }
  }
  let drained = false;
  if (!dryRun && promoted > 0) { try { drained = drainOnce(opts.drainerId || 'mnemopi-bridge', opts).ok === true; } catch { /* fail-open */ } }
  return { ok: true, reviewer, reviewed, kept, promoted, deferred, rejected, rewritten, llmUsed, drained, dryRun, decisions };
}

// Full flow: propose then adjudicate. The session_shutdown hook awaits this.
export async function runExportAndAdjudicate(opts = {}) {
  const exported = opts.adjudicateOnly ? null : exportMnemopiToProposals(opts);
  const adjudicated = opts.exportOnly ? null : await adjudicateMnemopiProposals(opts);
  return { ok: (exported?.ok ?? true) && (adjudicated?.ok ?? true), exported, adjudicated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const exportOnly = process.argv.includes('--export-only');
  const adjudicateOnly = process.argv.includes('--adjudicate-only');
  const reviewer = process.argv.includes('--deterministic') ? 'deterministic' : 'llm';
  console.log(JSON.stringify(await runExportAndAdjudicate({ apply, exportOnly, adjudicateOnly, reviewer }), null, 2));
}
