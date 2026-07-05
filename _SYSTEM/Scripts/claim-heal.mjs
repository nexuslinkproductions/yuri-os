#!/usr/bin/env node
// @capability: claim-heal
// @serves: staleness conscience healer | auto-heal stale prose claims | doc-truth rewriter | claim-journal undo
// @does: S3 of the staleness conscience. Aggressive auto-heal of verified-stale prose claims, behind 6
//        owner-approved guards (2026-07-05), hardened by a 3-architect red-team:
//        (1) deterministic primary evidence only — consumes claim-verify verifyAll() output, never
//            re-infers or invokes a model; refuses if no verifier / empty evidence.
//        (2) HEAL_FLOOR=0.9 — the noisy verifiers (cap_present 0.8, file-level git 0.7, demoted sha 0.6)
//            surface but never heal.
//        (3) pinned exempt — isPinned check before any IO; pinned + hard mismatch → surface only.
//        (4) journaled + undoable — appendJsonl BEFORE the file write (crash-safe: a healed file always
//            has an audit entry). Undo appends a compensating reverted:true record, never mutates.
//        (5) ONE correct rewrite — the stale token is RESOLVED FROM THE STATEMENT (RX ∩ statement),
//            NOT claimedStatus (which is absent 87% of the time). Token-swap only. Refuses on:
//            ambiguity (>1 token, or token count ≠ 1 in statement), negation (preceded by NOT/NEVER/NO),
//            contextual contradiction (temporal/conditional modifier in statement), or statement drift.
//        (6) dry-run default (YURI_CLAIM_HEAL_ARMED=1 or flag _SYSTEM/state/claim-heal.enabled to apply).
//        Concurrency: optimistic CAS (re-read before rename; refuse on hash mismatch). No lock file —
//        crash-safe by construction, no stale-lock cleanup. Atomic O_EXCL tmp → rename per doc write.
// @use: import { healAll, healOne, undoLastJournalEntry, HEAL_FLOOR, JOURNAL_PATH }
//        CLI: node claim-heal.mjs [--arm] | node claim-heal.mjs undo-last
// @exports: healAll, healOne, undoLastJournalEntry, resolveStaleToken, isPrecededByNegation, hasContradictionModifier, countIn, HEAL_FLOOR, JOURNAL_PATH, ARM_ENV, ARM_FLAG

import fs from 'node:fs';
import path from 'node:path';
import { isArmed, REPO_ROOT } from '../lib/arming.mjs';
import { appendJsonl, readJsonl } from '../lib/jsonl.mjs';
import { loadRegistry, joinRegistry, saveRegistry, upsertVerification, isPinned, sha256, DEFAULTS } from './claim-registry.mjs';
import { verifyAll, RX } from './claim-verify.mjs';

export const HEAL_FLOOR = 0.9;
export const ARM_ENV = 'YURI_CLAIM_HEAL_ARMED';
export const ARM_FLAG = '_SYSTEM/state/claim-heal.enabled';
export const JOURNAL_PATH = path.join(REPO_ROOT, '_SYSTEM/state/claim-heal-journal.jsonl');

// red-team guard 5: temporal/conditional modifiers that make a token-swap self-contradicting
// ("UNCOMMITTED pending sign-off" → "SHIPPED+PUSHED pending sign-off" = a lie). Also a date regex.
const CONTRADICTION_RX = /\b(pending|awaiting|blocked\s+on|blocked\s+by|sign[- ]?off|not\s+yet|to[- ]?do|fixme|wip|stub|placeholder|coming\s+soon|planned|tbd|soon|before|after|once|when|if\s+marcel|awaited)\b|\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;
// semantics architect: a status token immediately preceded by one of these asserts the OPPOSITE — refuse.
const NEGATION_PRECEDING = /^(NOT|NEVER|NO|NONE|WITHOUT|NEITHER|NOR|ISN'?T|AREN'?T|WASN'?T|WEREN'?T|CAN'?T|CANNOT|WON'?T)$/i;

export function isHealArmed({ env = ARM_ENV, flag = ARM_FLAG } = {}) {
  return isArmed({ env, flag });
}

// ── guard 5 helpers ────────────────────────────────────────────────────────────────────────────
// Resolve the stale status token PRESENT IN THE STATEMENT (RX ∩ statement). claimedStatus is advisory
// only — the extractor's token is absent from the statement 87% of the time (semantics architect).
// Returns {token} | {ambiguous:[...]} | null.
export function resolveStaleToken(claim) {
  const claimType = claim?.claimType;
  const statement = String(claim?._source?.statement ?? claim?.source?.statement ?? '');
  if (!statement) return null;
  const rxs = (claimType && RX[claimType]) ? [RX[claimType]] : Object.values(RX);
  const found = new Set();
  for (const rx of rxs) {
    const g = new RegExp(rx.source, 'gi');
    let m;
    while ((m = g.exec(statement)) !== null) {
      // single-word tokens only — multi-word RX phrases (e.g. "PENDING SIGN-OFF") are classification
      // signals, not swappable status tokens. Keeping them would make "UNCOMMITTED pending sign-off"
      // resolve as 2 candidates (ambiguous) instead of hitting the contextual-contradiction guard.
      if (m[0] && !/\s/.test(m[0])) found.add(m[0]);
      if (m.index === g.lastIndex) g.lastIndex++;   // avoid zero-length loop
    }
  }
  if (found.size === 0) {
    // fallback: claimedStatus if it looks like a status token (≥3 chars, has an uppercase letter)
    const cs = String(claim?.claimedStatus ?? '');
    if (cs.length >= 3 && /[A-Z]/.test(cs)) return { token: cs, fallback: true };
    return null;
  }
  if (found.size > 1) return { ambiguous: [...found] };
  return { token: [...found][0] };
}

export function isPrecededByNegation(statement, token) {
  const idx = String(statement || '').toUpperCase().indexOf(String(token || '').toUpperCase());
  if (idx <= 0) return false;
  const before = statement.slice(0, idx).trim().split(/\s+/).pop() || '';
  const clean = before.replace(/[^A-Za-z']/g, '').toUpperCase();
  return NEGATION_PRECEDING.test(clean);
}

export function hasContradictionModifier(statement) {
  return CONTRADICTION_RX.test(String(statement || ''));
}

// Count non-overlapping occurrences. ci = case-insensitive.
export function countIn(haystack, needle, { ci = false } = {}) {
  const h = ci ? String(haystack || '').toLowerCase() : String(haystack || '');
  const n = ci ? String(needle || '').toLowerCase() : String(needle || '');
  if (!n) return 0;
  let count = 0, from = 0;
  while (true) {
    const i = h.indexOf(n, from);
    if (i < 0) break;
    count++;
    from = i + n.length;
  }
  return count;
}

function atomicWrite(targetFile, content) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const tmp = `${targetFile}.heal-tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'wx');   // O_EXCL — fail if another healer owns this tmp slot
  try {
    fs.writeSync(fd, content);
    fs.closeSync(fd);
    fs.renameSync(tmp, targetFile);    // atomic publish
  } catch (e) {
    try { fs.closeSync(fd); } catch { /* fd closed or never opened */ }
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw e;
  }
}

// ── healOne: apply one verification result to one claim's source file ──────────────────────────
// PURE decision except for the file write — all 6 guards evaluated FIRST; refusal returns a skip record.
// opts: { armed, journalPath, registry, now }
export function healOne(claim, result, opts = {}) {
  const armed = opts.armed ?? isHealArmed(opts);
  const journalPath = opts.journalPath ?? JOURNAL_PATH;
  const now = opts.now ?? Date.now();
  const claimId = claim?.id ?? '<no-id>';
  const skip = (reason) => ({ healed: false, skipped: true, reason, claimId });

  // guard (1) — deterministic primary evidence only (consume verifyAll output, never re-infer)
  if (!result?.verifier) return skip('no verifier (no deterministic evidence)');
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) return skip('no evidence lines');
  if (result.match !== false) return skip(`not a mismatch (match=${result.match})`);

  // guard (2) — confidence floor
  const conf = Number(result.confidence ?? 0);
  if (!Number.isFinite(conf) || conf < HEAL_FLOOR) return skip(`confidence ${conf} < floor ${HEAL_FLOOR}`);

  // guard (5) pre — proposedFix present, single-valued (no | ? OR alternatives)
  const fix = result.proposedFix;
  if (fix == null || String(fix).trim() === '') return skip('no proposedFix');
  if (/[|?]/.test(String(fix)) || /\bOR\b/i.test(String(fix))) return skip('ambiguous proposedFix (multi-valued)');

  // source locator
  const src = claim?._source ?? claim?.source ?? {};
  const filePath = src.filePath;
  const statement = src.statement;
  if (!filePath) return skip('no source.filePath');
  if (!statement) return skip('no source.statement');

  // guard (3) — pinned exempt
  const reg = opts.registry ?? loadRegistry({});
  if (isPinned(reg, claimId)) return skip('pinned (owner-locked — surface only)');

  // guard (5) — resolve the stale token FROM THE STATEMENT (not claimedStatus)
  const resolved = resolveStaleToken(claim);
  if (!resolved) return skip('no status token located in statement');
  if (resolved.ambiguous) return skip(`ambiguous status tokens in statement: ${resolved.ambiguous.join(' | ')}`);
  const staleToken = resolved.token;

  // negation refusal — token preceded by NOT/NEVER/NO asserts the opposite; a swap would invert meaning
  if (isPrecededByNegation(statement, staleToken)) return skip(`negated token ("${staleToken}" preceded by NOT/NEVER/NO)`);

  // contextual-contradiction refusal — temporal/conditional modifier → token swap would self-contradict
  if (hasContradictionModifier(statement)) return skip('contextual contradiction (temporal/conditional modifier in statement)');

  // token count in statement — exactly 1 or refuse
  const tokCount = countIn(statement, staleToken, { ci: true });
  if (tokCount === 0) return skip(`stale token "${staleToken}" not in statement (drift)`);
  if (tokCount > 1) return skip(`stale token "${staleToken}" appears ${tokCount}x in statement (ambiguous location)`);

  // read the source file
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return skip(`unreadable source file: ${e.code || e.message}`); }

  // file-level unique-statement check (idempotency + drift guard) — statement must occur exactly once
  const stmtCount = countIn(raw, statement, { ci: false });
  if (stmtCount === 0) return skip('statement not found in file (already healed or hand-edited)');
  if (stmtCount > 1) return skip(`statement appears ${stmtCount}x in file (ambiguous)`);

  // build the new statement: case-insensitive single token swap
  const tokenIdx = statement.toUpperCase().indexOf(staleToken.toUpperCase());
  const newStatement = statement.slice(0, tokenIdx) + String(fix) + statement.slice(tokenIdx + staleToken.length);
  const newRaw = raw.replace(statement, newStatement);   // statement is unique → single replace

  const oldSha = sha256(raw);
  const journalEntry = {
    ts: now, claimId, verifier: result.verifier, file: filePath,
    staleToken, proposedFix: String(fix),
    oldStatement: statement, newStatement,
    oldSha, newSha: sha256(newRaw),
    evidence: result.evidence, confidence: conf, reverted: false,
  };

  // guard (6) — dry-run default: emit the diff, touch nothing
  if (!armed) {
    return { healed: false, skipped: false, dryRun: true, claimId, reason: `disarmed (${ARM_ENV}=1 to apply)`, diff: [journalEntry] };
  }

  // guard (4) — journal BEFORE the file write (crash-safe: a healed file always has an audit entry;
  //            a crash between leaves a journal record pointing at an un-healed file → next run surfaces it)
  const wrote = appendJsonl(journalPath, journalEntry, { failOpen: false });
  if (!wrote) return skip('journal append failed — refusing to heal without audit trail');

  // optimistic CAS — re-read; if the file changed between our read and now, refuse (concurrent heal)
  let cur;
  try { cur = fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return skip(`re-read failed: ${e.code || e.message}`); }
  if (sha256(cur) !== oldSha) return skip('file changed under us (concurrent edit) — refusing');

  // atomic publish
  try { atomicWrite(filePath, newRaw); }
  catch (e) { return skip(`atomic write failed: ${e.code || e.message}`); }

  return { healed: true, skipped: false, dryRun: false, claimId, diff: [journalEntry], journal: journalEntry, appliedAt: now };
}

// ── healAll: verify everything, heal every mismatch that passes the guards ────────────────────
// opts: { ledger, registry, runners, armed, journalPath, verify } — verify is injectable for hermetic tests
export async function healAll(opts = {}) {
  const armed = opts.armed ?? isHealArmed(opts);
  const journalPath = opts.journalPath ?? JOURNAL_PATH;
  const ledger = opts.ledger ?? DEFAULTS.ledger;
  const registry = opts.registry ?? DEFAULTS.registry;
  const verify = opts.verify ?? verifyAll;
  const joined = joinRegistry({ ledger, registry });
  const vRes = verify({ ledger, registry, runners: opts.runners, joined });
  const results = vRes.results || [];
  const byId = new Map();
  for (const r of results) if (r.id) byId.set(r.id, r);
  let updatedReg = vRes.registry || loadRegistry({ registry });

  const healed = [], skipped = [], journal = [];
  for (const claim of joined) {
    const result = byId.get(claim.id);
    if (!result) { skipped.push({ claimId: claim.id, reason: 'no verification result' }); continue; }
    const one = healOne(claim, result, { armed, journalPath, registry: updatedReg });
    if (one.healed || one.dryRun) {
      healed.push(one);
      if (one.journal) journal.push(one.journal);
      updatedReg = upsertVerification(updatedReg, claim.id, { healAppliedMs: one.appliedAt ?? Date.now() });
    } else {
      skipped.push(one);
    }
  }
  saveRegistry(updatedReg, { registry, armed });
  return { healed, skipped, journal };
}

// ── undo: append a compensating record, never mutate the original ──────────────────────────────
// Reverts the latest non-reverted journal entry. Presence-based: the healed text (newStatement) must
// be in the file exactly once; absent/duplicate → surface conflict (no false-positive whole-file gate).
export function undoLastJournalEntry({ journalPath = JOURNAL_PATH } = {}) {
  const { records } = readJsonl(journalPath, { failOpen: false });
  const last = [...records].reverse().find(r => !r.reverted);
  if (!last) return { undone: false, reason: 'no non-reverted journal entries' };
  const { file, newStatement, oldStatement } = last;
  if (!file || !newStatement || !oldStatement) return { undone: false, reason: 'malformed journal entry' };

  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { return { undone: false, reason: `unreadable: ${e.code || e.message}` }; }

  const cnt = countIn(raw, newStatement, { ci: false });
  if (cnt === 0) return { undone: false, reason: 'healed text absent — already reverted or hand-edited' };
  if (cnt > 1) return { undone: false, reason: 'healed text appears multiple times — ambiguous, refusing' };

  const restored = raw.replace(newStatement, oldStatement);
  try { atomicWrite(file, restored); }
  catch (e) { return { undone: false, reason: `write failed: ${e.code || e.message}` }; }

  // append compensating record (the original stays — immutable audit trail)
  appendJsonl(journalPath, { ...last, reverted: true, revertedAt: Date.now() }, { failOpen: false });
  return { undone: true, file, restored: oldStatement };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (IS_MAIN) {
  const arg = process.argv[2];
  if (arg === 'undo-last') {
    const r = undoLastJournalEntry({});
    if (r.undone) console.log(`claim-heal: undone ${path.relative(REPO_ROOT, r.file)} -> restored original text`);
    else console.log(`claim-heal: nothing undone — ${r.reason}`);
    process.exit(r.undone ? 0 : 1);
  }
  const arm = process.argv.includes('--arm');
  if (arm && !isHealArmed()) {
    console.error(`claim-heal: --arm requested but neither ${ARM_ENV}=1 nor flag ${ARM_FLAG} is set.`);
    console.error(`  arming is owner-gated. To arm: export ${ARM_ENV}=1  OR  touch ${ARM_FLAG}`);
    process.exit(2);
  }
  healAll({ armed: arm || isHealArmed() }).then(({ healed, skipped }) => {
    const applied = healed.filter(h => h.healed);
    const dryRun = healed.filter(h => h.dryRun);
    console.log(`claim-heal: ${applied.length} healed, ${dryRun.length} would-heal (dry-run), ${skipped.length} skipped`);
    for (const h of dryRun) {
      const d = h.diff[0];
      console.log(`  ~ ${path.relative(REPO_ROOT, d.file)}:${d.staleToken} -> ${d.proposedFix}`);
      console.log(`    - ${d.oldStatement}`);
      console.log(`    + ${d.newStatement}`);
    }
    for (const s of skipped.slice(0, 30)) console.log(`  • skip ${s.claimId}  ${s.reason}`);
    if (!arm && !isHealArmed()) console.log(`(dry-run — ${ARM_ENV}=1 or ${ARM_FLAG} to apply)`);
  }).catch(e => { console.error(`claim-heal: fatal — ${e.stack || e.message}`); process.exit(1); });
}
