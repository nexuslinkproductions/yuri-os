#!/usr/bin/env node
// @capability: claim-verify
// @serves: staleness conscience verifier | claim truth check | doc-truth evidence | the missing link
// @does: THE missing link. Maps a prose claim (from prose-claim-extractor's ledger) to a deterministic
//        evidence check + runs it. Each verifier is INJECTABLE (git/fs/grep runners) for hermetic tests.
//        Returns {verifier, verifiedStatus, match, evidence[], confidence, proposedFix}; match=null
//        means no_evidence (unclassifiable or unverifiable — conservative, never a false heal).
//        This is what closes the loop the extractor left open (evidence:[] was empty in every claim).
//        DETERMINISTIC PRIMARY EVIDENCE ONLY — model text is never evidence (the auto-heal guard).
// @use: import { classifyClaim, verifyClaim, verifyAll } ; CLI: node claim-verify.mjs [--arm]
// @exports: classifyClaim, verifyGitStatus, verifyModelId, verifyArmState, verifyFileExists, verifyCapPresent, verifyTestCount, verifyClaim, verifyAll, VERIFIERS

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../lib/arming.mjs';
import { loadClaims, loadRegistry, upsertVerification, saveRegistry, joinRegistry, DEFAULTS } from './claim-registry.mjs';

export const VERIFIERS = ['git_status', 'model_id', 'arm_state', 'file_exists', 'cap_present', 'test_count'];

const RX = {
  git_status: /\b(UNCOMMITTED|SHIPPED|PUSHED|COMMITTED|UNTRACKED|PENDING\s+SIGN[- ]?OFF|NOT(?:\s+YET)?\s+PUSHED)\b/i,
  arm_state:  /\b(ARMED|DISARMED|LIVE|DISABLED|ENABLED)\b/i,
  file_exists:/\b(MISSING|ABSENT|DELETED|GONE|REMOVED)\b/i,
  cap_present:/\b(NOT[-_ ]?IMPLEMENTED|UNIMPLEMENTED|NOT\s+BUILT|BUILT)\b/i,
  model_id:   /\b(glm-\d(?:\.\d)?|deepseek-[\w.-]+)\b/i,
  test_count: /\b(\d+)\s*\/\s*(\d+)/i,
};

// Conservative classification: most-specific patterns first. null = no_evidence (skip).
export function classifyClaim(claim) {
  const c = claim || {};
  const text = `${c.claimType || ''} ${c.claimedStatus || ''} ${c._source?.matchedVerb || ''} ${c._source?.statement || ''}`;
  if (!text.trim()) return null;
  if (RX.test_count.test(text)) return 'test_count';
  if (RX.model_id.test(text) && /model|lane|glm|deepseek|opus|sonnet/i.test(text)) return 'model_id';
  if (RX.arm_state.test(text)) return 'arm_state';
  if (RX.file_exists.test(text)) return 'file_exists';
  if (RX.git_status.test(text)) return 'git_status';
  if (RX.cap_present.test(text)) return 'cap_present';
  return null;
}

function noEv(verifier, why) { return { verifier, verifiedStatus: null, match: null, evidence: [why], confidence: 0, proposedFix: null }; }

// ── default runners (overridable in tests) ────────────────────────────────────────────────────
// spawnSync captures stdout+stderr cleanly on success AND failure (execFileSync leaked git stderr
// for outside-repo / gitignored source files — a staleness tool must not spew).
function defaultGitRunner(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 8000 });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function defaultGrepRunner(pattern, file) {
  const r = spawnSync('grep', ['-cE', pattern, file], { encoding: 'utf8', timeout: 4000 });
  return { ok: r.status === 0, count: parseInt(r.stdout || '0', 10) || 0 };
}

// ── git_status: sha-bearing (the merge-memory case) + file-level fallback ──────────────────────
// sha-bearing: "SHIPPED cbdca5c0" -> git branch -r --contains <sha> -> on origin/main?
export function verifyGitStatus(claim, { gitRunner = defaultGitRunner, fsExists = fp => fs.existsSync(fp) } = {}) {
  const statement = claim?._source?.statement || '';
  const claimed = String(claim?.claimedStatus || '').toUpperCase();
  const shaMatch = statement.match(/\b([0-9a-f]{7,40})\b/i);
  if (shaMatch) {
    const sha = shaMatch[1];
    const branches = gitRunner(['branch', '-r', '--contains', sha]).stdout || '';
    const onOrigin = /origin\/(main|HEAD)/.test(branches);
    // ── red-team hardening (Architect 1): the sha-bearing path is the strongest verifier, so it is
    //    the one most dangerous when it MISFIRES high. Three sub-checks gate the 0.98 confidence;
    //    any failure demotes below the 0.9 heal floor so S3 surfaces but never auto-heals on a
    //    misfire. Without these a shallow clone / detached HEAD / wrong-origin reads false-stale.
    const depthProbe = (gitRunner(['rev-list', '--count', sha]).stdout || '').trim();
    const depthOk = /^\d+$/.test(depthProbe) && parseInt(depthProbe, 10) > 0;   // errors/empty on shallow or unreachable
    const headRef = (gitRunner(['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim();
    const detached = headRef === 'HEAD';                                          // worktree detached-HEAD
    const originUrl = (gitRunner(['remote', 'get-url', 'origin']).stdout || '').trim();
    const originOk = originUrl.length > 0;                                        // no origin = can't trust origin/main match
    const trustworthy = onOrigin && depthOk && !detached && originOk;
    const expectsShipped = /\b(SHIPPED|PUSHED|COMMITTED)\b/.test(claimed);
    const match = expectsShipped ? onOrigin : !onOrigin;
    const evidence = [
      `git branch -r --contains ${sha} -> ${onOrigin ? 'on origin/main' : 'NOT on origin/main'}`,
      `depth rev-list --count ${sha} -> ${depthOk ? depthProbe : 'unreachable/shallow'}`,
      `HEAD -> ${detached ? 'DETACHED (worktree)' : headRef || '(unknown)'}`,
      `origin -> ${originOk ? originUrl.slice(0, 60) : 'unset'}`,
    ];
    return {
      verifier: 'git_status',
      verifiedStatus: onOrigin ? 'SHIPPED+PUSHED' : 'NOT_ON_ORIGIN',
      match,
      evidence,
      confidence: trustworthy ? 0.98 : 0.6,   // demoted below the 0.9 heal floor on any sub-check failure
      proposedFix: match ? null : (onOrigin ? 'SHIPPED+PUSHED' : 'NOT_ON_ORIGIN'),
    };
  }
  // file-level fallback: the source file's own git state
  const file = claim?._source?.filePath;
  if (!file) return noEv('git_status', 'no sha in statement + no source file');
  if (!fsExists(file)) return noEv('git_status', `source file absent: ${file}`);
  const tracked = gitRunner(['ls-files', '--error-unmatch', '--', file]).ok;
  const dirty = gitRunner(['status', '--short', '--', file]).stdout.trim();
  let actual;
  if (!tracked) actual = 'UNTRACKED';
  else if (dirty) actual = 'UNCOMMITTED';
  else actual = 'COMMITTED';
  const expectsUncommitted = /\b(UNCOMMITTED|UNTRACKED|PENDING)\b/.test(claimed);
  const match = expectsUncommitted ? actual !== 'COMMITTED' : actual === 'COMMITTED';
  // file-level git_state is semantically weak (a gitignored memory file is UNTRACKED but its CLAIM
  // may still be true). Demoted BELOW the 0.9 heal floor -> surfaces, never auto-heals. The sha-bearing
  // path (0.98) is the strong one that heals.
  return { verifier: 'git_status', verifiedStatus: actual, match, evidence: [`git: ${file} -> ${actual}`], confidence: 0.7, proposedFix: match ? null : actual };
}

// ── model_id: "glm-4.7" -> grep the live routing code for the current model ───────────────────
export function verifyModelId(claim, { grepRunner = defaultGrepRunner, llmLanePath = path.join(REPO_ROOT, '_SYSTEM/Scripts/llm-lane.mjs') } = {}) {
  const statement = claim?._source?.statement || '';
  const claimed = String(claim?.claimedStatus || '');
  const modelInClaim = (statement.match(RX.model_id) || claimed.match(RX.model_id) || [])[0];
  if (!modelInClaim) return noEv('model_id', 'no model id in claim');
  if (!fs.existsSync(llmLanePath)) return noEv('model_id', `routing file absent: ${llmLanePath}`);
  // is the claimed model still the workhorse in the routing code?
  const r = grepRunner(`['"]${modelInClaim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, llmLanePath);
  const present = r.ok && r.count > 0;
  return {
    verifier: 'model_id',
    verifiedStatus: present ? `${modelInClaim} present in routing` : `${modelInClaim} NOT in routing`,
    match: present,
    evidence: [`grep ${modelInClaim} in ${path.basename(llmLanePath)} -> ${r.count} hit(s)`],
    confidence: 0.9,
    proposedFix: present ? null : 'model superseded (check routing for current)',
  };
}

// ── arm_state: "X ARMED" -> check the .enabled flag file (reuses lib/arming semantics) ─────────
export function verifyArmState(claim, { fsExists = fp => fs.existsSync(fp), stateDir = path.join(REPO_ROOT, '_SYSTEM/state') } = {}) {
  const claimed = String(claim?.claimedStatus || '').toUpperCase();
  const target = String(claim?.target || '');
  const expectsArmed = /\b(ARMED|ENABLED|LIVE)\b/.test(claimed);
  if (!target) return noEv('arm_state', 'no target to resolve flag');
  // resolve candidate flag file: _SYSTEM/state/<target>.enabled (kebab/snake tolerant)
  const slug = target.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const flag = path.join(stateDir, `${slug}.enabled`);
  const armed = fsExists(flag);
  return {
    verifier: 'arm_state',
    verifiedStatus: armed ? 'ARMED' : 'DISARMED',
    match: armed === expectsArmed,
    evidence: [`${flag} -> ${armed ? 'exists (ARMED)' : 'absent (DISARMED)'}`],
    confidence: 0.92,
    proposedFix: armed === expectsArmed ? null : (armed ? 'ARMED' : 'DISARMED'),
  };
}

// ── file_exists: "X MISSING/LIVE" -> fs.existsSync(resolved path) ──────────────────────────────
export function verifyFileExists(claim, { fsExists = fp => fs.existsSync(fp) } = {}) {
  const claimed = String(claim?.claimedStatus || '').toUpperCase();
  const target = String(claim?.target || '');
  const expectsMissing = /\b(MISSING|ABSENT|DELETED|GONE|REMOVED)\b/.test(claimed);
  // resolve target as a repo-relative path if it looks like one
  const candidate = target.includes('/') ? path.resolve(REPO_ROOT, target.replace(/^\//, '')) : null;
  if (!candidate) return noEv('file_exists', `target not path-like: ${target}`);
  const exists = fsExists(candidate);
  return {
    verifier: 'file_exists',
    verifiedStatus: exists ? 'EXISTS' : 'MISSING',
    match: expectsMissing ? !exists : exists,
    evidence: [`${candidate} -> ${exists ? 'exists' : 'missing'}`],
    confidence: 0.95,
    proposedFix: null,
  };
}

// ── cap_present: "X NOT_IMPLEMENTED/BUILT" -> capabilities.json has the cap? ───────────────────
export function verifyCapPresent(claim, { readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }, capPath = path.join(REPO_ROOT, '_SYSTEM/capabilities.json') } = {}) {
  const claimed = String(claim?.claimedStatus || '').toUpperCase();
  const target = String(claim?.target || '');
  const expectsPresent = /\b(BUILT|IMPLEMENTED|LIVE|SHIPPED)\b/.test(claimed);
  const caps = readJson(capPath);
  if (!caps) return noEv('cap_present', `capabilities.json unreadable: ${capPath}`);
  // match against cap IDs/names specifically (NOT JSON-substring — that matched "0"/"const"/"status"
  // anywhere). Require slug >=3 chars + exact id OR a full dot/dash/slash token of an id.
  const ids = Array.isArray(caps?.capabilities) ? caps.capabilities.map(c => String(c.id || c.name || '').toLowerCase()) : [];
  const slug = target.toLowerCase();
  const present = slug.length >= 3 && ids.some(id => id === slug || id.split(/[.\-/_]/).includes(slug));
  return {
    verifier: 'cap_present',
    verifiedStatus: present ? 'CAP_PRESENT' : 'CAP_ABSENT',
    match: expectsPresent ? present : !present,
    evidence: [`capabilities.json includes "${slug}" -> ${present}`],
    confidence: 0.8,
    proposedFix: null,
  };
}

// ── test_count: "N/N tests" -> last cached test-run count (no live run; no_evidence if absent) ──
export function verifyTestCount(claim, { readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }, lastRunPath = path.join(REPO_ROOT, '_SYSTEM/state/last-test-run.json') } = {}) {
  const text = `${claim?.claimedStatus || ''} ${claim?._source?.statement || ''}`;
  const m = text.match(RX.test_count);
  if (!m) return noEv('test_count', 'no N/M count in claim');
  const claimedPass = parseInt(m[1], 10), claimedTotal = parseInt(m[2], 10);
  const last = readJson(lastRunPath);
  if (!last) return noEv('test_count', `no cached test-run at ${lastRunPath} (would need a live run)`);
  const match = last.pass === claimedPass && last.total === claimedTotal;
  return {
    verifier: 'test_count',
    verifiedStatus: `${last.pass}/${last.total}`,
    match,
    evidence: [`last-test-run ${last.pass}/${last.total} vs claimed ${claimedPass}/${claimedTotal}`],
    confidence: 0.88,
    proposedFix: match ? null : `${last.pass}/${last.total}`,
  };
}

const DISPATCH = { git_status: verifyGitStatus, model_id: verifyModelId, arm_state: verifyArmState, file_exists: verifyFileExists, cap_present: verifyCapPresent, test_count: verifyTestCount };

// Verify one claim: classify -> run verifier (or no_evidence).
export function verifyClaim(claim, opts = {}) {
  const type = classifyClaim(claim);
  if (!type) return noEv(null, 'unclassifiable claim (no_evidence)');
  const fn = DISPATCH[type];
  const res = fn(claim, opts);
  return { ...res, verifier: type };
}

// Verify all ledger claims, returning the results + an updated registry (caller persists via saveRegistry).
export function verifyAll({ ledger = DEFAULTS.ledger, registry = DEFAULTS.registry, runners } = {}) {
  const claims = loadClaims({ ledger });
  const reg = loadRegistry({ registry });
  const results = [];
  let updated = reg;
  for (const c of claims) {
    const res = verifyClaim(c, runners || {});
    results.push({ id: c.id, ...res });
    if (res.verifier) {
      updated = upsertVerification(updated, c.id, {
        verifiedStatus: res.verifiedStatus,
        match: res.match,
        lastVerifiedMs: Date.now(),
        verifiedBy: res.verifier,
        evidence: res.evidence,
        confidence: res.confidence,
        proposedFix: res.proposedFix,
      });
    }
  }
  return { results, registry: updated };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (IS_MAIN) {
  const arm = process.argv.includes('--arm');
  const { results, registry: updated } = verifyAll({});
  const verified = results.filter(r => r.match !== null);
  const stale = results.filter(r => r.match === false);
  const noEv = results.filter(r => r.verifier === null);
  const save = saveRegistry(updated, { armed: arm });
  console.log(`claim-verify: ${results.length} claims | ${verified.length} verified (${stale.length} stale) | ${noEv.length} no_evidence`);
  for (const r of stale.slice(0, 30)) console.log(`  ✗ ${r.id}  by=${r.verifier}  ${r.evidence[0] || ''}`);
  console.log(`registry: ${save.wrote ? 'saved' : 'dry-run (YURI_CLAIM_REGISTRY_ARMED=1 / --arm to persist)'}`);
}
