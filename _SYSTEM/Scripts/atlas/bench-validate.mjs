#!/usr/bin/env node
// @capability: bench-validate
// @serves: benchmark ground-truth audit gate | leakage scan both channels | stratification and reachability report
// @does: validates an AUTHORED n>=100 find set against the three-clause rule (owner directive
//   2026-07-28) before anything is measured on it. Checks, in order:
//   1. SHAPE — n>=100, unique ids, single expect path per question, and FIND-ONLY: any non-find
//      type FAILS (locate/enter are exploratory-contaminated and the n>=100 brief is a find set;
//      a mixed set sneaks unmeasured types back in through the side door).
//   2. REACHABILITY — every expect path exists in the id-map corpus AND the FTS search index.
//      Unreachable = WARN (coverage ceiling; author decides — unwinnable questions are kept per
//      doctrine but must be marked, never silent).
//   3. LEAKAGE, BOTH CHANNELS (fail-closed):
//      (a) PATH channel — question text contains the answer's basename or a multi-segment path
//          fragment (the q037 'graduation ladder' class);
//      (b) ENRICHER channel — question shares DISTINCTIVE tokens with the answer's capability
//          card serves/does (distinctive = appears in <=5 of the cards, so a shared common word
//          cannot false-fire, while a shared rare phrase always fires);
//      (c) INDEXER channel (Channel S) — question shares >=2 tokens with the answer FILE'S OWN
//          in-source @capability/@serves/@does tag lines, which the base indexer already ingests
//          (Orion's residual channel: the circle re-forms through the indexer even with no
//          enricher run).
//      (d) G-SOURCE-CLASS — provenance.source_path is a MIRROR of @serves/@does text
//          (basename 'capabilities.json' OR 'skill.md'); the regenerable registry exports every
//          mechanism's own tags, so any item authorable from it is provenance-laundered;
//      (e) G-ECHO — verbatim text-copying from the answer's @serves/@does lines (>=5 contiguous
//          tokens from the answer's own tag lines embedded in the question); rare in prose,
//          provable when it happens.
//   4. STRATIFICATION — answer spread across balanced-menu areas: reports area distribution and
//      FAILS if any single area holds >MAX_AREA_SHARE of answers or if fewer than
//      AREA_OCCUPANCY_FRACTION of the source pool's occupied areas are touched (75% of the pool's
//      134 areas at full scale). 8-19 occupied areas = WARN (thin but valid); >=20 = healthy.
//      Both gates are gated on minN >= MIN_AREAS_OCCUPIED_WARN (20): at small samples the
//      bench-validate self-test and drafts are not sized to make area-spread judgments honestly.
//   5. PROVENANCE GATES (L4, Hermes assignment 2026-07-28) — for generated candidates, provenance
//      is MANDATORY: missing provenance = unauditable = FAIL.
//      G-SELF-REFERENCE-BACKSTOP: basename-contiguous substring (norm-identified so 'capability
//      scan' matches capability-scan). The mechanized version of the retracted locate-leak class
//      (q041/q042/q045: 'atlas' df=19, 'policy' df=16 — both under 25; structural tokens like
//      'system' df=2573 sit far above, so the floor separates leak vocabulary from corpus
//      structure by construction, not by taste).
//      G-PROVENANCE-COLLISION: source_path == expect (the answer describing itself; structural,
//      no false positives — decisive Channel S).
//      G-FRAME-DIVERSITY: fewer than 5 distinct frames at n>=100, or one frame above 2x uniform
//      share (the point where a single phrasing dominates the variance estimate) = FAIL.
//      G-SOURCE-CONCENTRATION: one source_kind above 50% of the set = FAIL (majority-cap; a
//      dominant register measures register sensitivity, not navigation).
//   REPORTED PROPERTIES (never gates): identifierOverlapRate (path-token df<=25 recall),
//   siblingOverlapRate (question contains another file's basename in the answer's directory — a
//   leakage-shape signal, not a rule), w1ParentDirToken (parent-dir basename co-occurrence, Hermes
//   2026-07-28 explicit deferral — count + per-question list).
//   Exit 1 on any FAIL. Every check prints per-question evidence, never just a count;
//   every gate rejection is also in result.rejected as {id, reasons[]} for downstream consumers.
// @use: node bench-validate.mjs <authored.jsonl> [--json] [--min-n=100]
// @exports: validateBenchmark, main, runSelfTest
// @tier: seam
// @couples: self-description channel definition (@serves/@does tag shape) + balanced-area partition provider (areas with memberIds)
// @deps: better-sqlite3

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FASTLEX_STOP } from './retrieval-candidates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CAPABILITIES_PATH = path.join(REPO_ROOT, '_SYSTEM/capabilities.json');
const INDEX_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const MIN_N = 100;
const POOL_PATH = path.join(REPO_ROOT, '_SYSTEM/state/atlas/bench-pool.json');
const MIN_AREAS_OCCUPIED_FAIL = 8; // legacy floor for small sets only (superseded at scale — see below)
const MIN_AREAS_OCCUPIED_WARN = 20;
const AREA_OCCUPANCY_FRACTION = 0.75; // of the pool's occupied areas — a navigation benchmark
  // that skips half the system tests a neighbourhood, not navigation. 3/4 is the conventional
  // supermajority reading of 'most', applied to pool coverage (corpus-structure argument,
  // owner-tunable via --min-area-fraction; NEVER justified by rho-estimation benefit — circular).
const MAX_AREA_SHARE = 0.05; // ≈3.3x the pool's achievable max share (1.53% at per-area=16).
  // 25% was written for the n=100/237-candidate scale; at 1047 across 134 areas anything near it
  // is pathology. Headroom 3x above achievable before 'over-represented' becomes 'dominant'.
const DISTINCTIVE_CARD_DF = 5; // a card token appearing in <=5 cards is distinctive
const SELF_REFERENCE_DF = 25; // corpus path-token df ceiling for G-SELF-REFERENCE (see header: leak class 16-19, structural >50)
const MIN_DISTINCT_FRAMES = 5; // at n>=100, fewer means phrasing samples, not questions
const MAX_FRAME_SHARE_MULTIPLE = 2; // >2x uniform share = one phrasing dominates the variance estimate
const MAX_SOURCE_KIND_SHARE = 0.5; // majority-cap: above this the set measures register, not navigation
const ECHO_MIN_RUN = 5; // >=5 contiguous tokens from the answer's own @serves/@does lines = verbatim laundering
const SIBLING_BASENAME_MIN_LEN = 3; // ignore noise tokens like 'x', 'y', 'lib'
// Shared candidate-controlled path guard (advisory: provenance.source_path AND expect are both
// attacker-controllable). A path is readable only when repo-relative (no absolute, no '..'),
// outside every protected prefix, and git-tracked. Returns { ok, text } — text is '' when the
// read itself fails after the guards pass.
const PROTECTED_READ_PREFIXES = ['.env', 'node_modules/', 'backend/data/', '.amp/', '.git/', '.claude/state/', '.claude/history/', '.claude/file-history/', '.claude/projects/'];
function safeRepoRead(candidatePath, repoRoot, maxBytes = 0) {
  if (typeof candidatePath !== 'string') return { ok: false, text: '' };
  const norm = candidatePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.isAbsolute(candidatePath) || norm.split('/').includes('..')) return { ok: false, text: '' };
  const isProtected = (rel) => PROTECTED_READ_PREFIXES.some((pre) => rel === pre.replace(/\/$/, '') || rel.startsWith(pre));
  if (isProtected(norm)) return { ok: false, text: '' };
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', norm], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { return { ok: false, text: '' }; }
  // Tracked is not enough: a tracked SYMLINK resolves wherever it points. Realpath must stay
  // inside the realpathed repo root, and the RESOLVED repo-relative path re-runs the prefix
  // check (a symlink into .claude/state passes the lexical check and fails this one).
  let realAbs;
  let realRoot;
  try {
    realAbs = realpathSync(path.join(repoRoot, norm));
    realRoot = realpathSync(repoRoot);
  } catch { return { ok: false, text: '' }; }
  if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) return { ok: false, text: '' };
  const resolvedRel = path.relative(realRoot, realAbs).replace(/\\/g, '/');
  if (isProtected(resolvedRel)) return { ok: false, text: '' };
  let text = '';
  try { text = readFileSync(realAbs, 'utf8'); } catch { return { ok: false, text: '' }; }
  if (maxBytes > 0) text = text.slice(0, maxBytes);
  return { ok: true, text };
}

const MIRROR_BASENAMES = new Set(['capabilities.json']); // the auto-generated tag mirror registry
// SKILL.MD IS NOT A MIRROR CLASS (Hermes final ruling 2026-07-28): reject by RELATION, never by
// file type — a skill card describing a DIFFERENT skill is exactly the third-party prose this
// design wants. Self-description via a skill card is caught by G-ECHO (verbatim run) instead.

// Content-sniff mirror detection (GateAudit BLOCKER), hardened after the path-vector advisory:
// a benchmark item's source_path is CANDIDATE-CONTROLLED INPUT, never a license to read. Sniff
// goes through safeRepoRead (repo-relative + no '..' + protected-prefix + git-tracked).
// SCOPE (Hermes final ruling): a MIRROR is a REGISTRY-class file — one that aggregates MANY
// mechanisms' tags (>=3 @capability/@serves/@does annotation lines, or JSON with >=2 serves/does
// fields). A single skill card's own tags are self-description, NOT a mirror (relation over
// file type); self-echo off one card is G-ECHO's job.
const mirrorSniffCache = new Map(); // source_path -> boolean (one fs/git touch per distinct path)
function isMirrorSource(sourcePath, repoRoot) {
  if (typeof sourcePath !== 'string') return false;
  const base = path.basename(sourcePath);
  if (MIRROR_BASENAMES.has(base)) return true;
  if (mirrorSniffCache.has(sourcePath)) return mirrorSniffCache.get(sourcePath);
  let result = false;
  const read = safeRepoRead(sourcePath, repoRoot, 12000);
  if (read.ok) {
    // >=3 DISTINCT @capability blocks = a registry aggregating many mechanisms. A single skill
    // card's @capability+@serves+@does trio is ONE block = self-description, not a mirror.
    const capBlocks = read.text.match(/^\s*(?:\/\/|#|\*)\s*@capability/gm) || [];
    const jsonServes = read.text.match(/"serves"\s*:\s*\[/g) || [];
    result = capBlocks.length >= 3 || jsonServes.length >= 2;
  }
  mirrorSniffCache.set(sourcePath, result);
  return result;
}

// W2 identity normalization: lowercase, then strip dashes/underscores/whitespace so that
// 'capability scan', 'capability-scan', and 'capability_scan' all collapse to 'capabilityscan'.
// Extension stripping happens at the basenameNoExt boundary (callers), per the W2 spec.
function normIdent(s) {
  return String(s || '').toLowerCase().replace(/[-_\s]+/g, '');
}

// W1 — parent-directory token co-occurrence (Hermes 2026-07-28 deferred gate; REPORTED, never
// gated). The leaf-parent basename is the unit: for _SYSTEM/Scripts/math/math-kernel.mjs the
// parent-dir basename is 'math'. Generic containers are namespace noise, not topical structure.
const W1_PARENT_DIR_BASENAME_BAN = new Set(['Scripts', 'src', 'lib']);
const W1_PARENT_DIR_BASENAME_MIN_LEN = 4;

// echoRun — verbatim laundering probe. Returns the longest contiguous run of normalized tokens
// from the question that appears in the answer's @serves/@does tag lines (tokenized identically).
// Prose coincidence at 5 contiguous tokens is vanishingly rare; verbatim copying is provable.
function echoRun(questionText, tagLinesText) {
  const norm = (t) => String(t).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  const qToks = norm(questionText);
  const tRuns = String(tagLinesText).split('\n')
    .filter((l) => /^\s*(?:\/\/|#|\*)\s*@(serves|does|capability)/.test(l))
    .map((l) => norm(l));
  let best = 0;
  for (const tr of tRuns) {
    if (tr.length === 0) continue;
    for (let i = 0; i < qToks.length; i++) {
      for (let j = i + 1; j <= qToks.length; j++) {
        const win = qToks.slice(i, j);
        if (win.length < ECHO_MIN_RUN) continue;
        const joined = win.join(' ');
        const joinedTar = tr.join(' ');
        if (joinedTar.includes(joined)) {
          if (win.length > best) best = win.length;
        } else break;
      }
    }
  }
  return best;
}

// extractTagLines — read @serves/@does lines verbatim from a source file (used by the echo
// probe). The G-SOURCE-CLASS detection is independent (basename mirror, not text). @capability
// is the registry-mirror surface and is excluded here so a run copied only from the @capability
// label cannot trip G-ECHO.
function extractTagLines(sourceText) {
  return String(sourceText).split('\n')
    .filter((l) => /^\s*(?:\/\/|#|\*)\s*@(serves|does)\b/.test(l))
    .join('\n');
}

function tagTokens(text) {
  // in-source tag lines only (@capability/@serves/@does/@use/@exports blocks)
  const toks = new Set();
  for (const line of String(text).split('\n')) {
    if (/^\s*(?:\/\/|#|\*)\s*@(capability|serves|does|use|exports)/.test(line)) {
      for (const t of line.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) {
        if (!FASTLEX_STOP.has(t)) toks.add(t);
      }
    }
  }
  return toks;
}

// qTokens — question tokenization, same alphabet and stoplist as tagTokens so INDEXER/ECHO/
// overlap channels compare like with like. Returns a Set of lowercase content tokens.
function qTokens(text) {
  const toks = new Set();
  for (const t of String(text).toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) {
    if (!FASTLEX_STOP.has(t)) toks.add(t);
  }
  return toks;
}

// perItemRecord — track every gate's per-question outcome so result.rejected can be structured
// (Hermes 2026-07-28: never just strings — downstream consumers need to act on specific reasons).
function makeRejectionTracker() {
  return new Map(); // id -> { id, reasons: [] }
}
function recordReject(tracker, id, reason) {
  if (!tracker.has(id)) tracker.set(id, { id, reasons: [] });
  tracker.get(id).reasons.push(reason);
}

export async function validateBenchmark(filePath, { minN = MIN_N } = {}) {
  const failures = [];
  const warnings = [];
  const evidence = [];
  let unreachable = 0;
  let identifierOverlapCount = 0; // REPORTED PROPERTY (not a gate) — domain vocabulary is signal
  let siblingOverlapCount = 0; // REPORTED PROPERTY (not a gate) — question contains another file's
  let indexerOverlapCount = 0; // REPORTED RATE (Hermes A1 2026-07-28) — convergence under tag-strip
  const indexerOverlapItems = [];
  let enricherOverlapCount = 0; // REPORTED RATE (Hermes Ruling 1 2026-07-28) — same demotion, same precondition
  const enricherOverlapItems = [];
                                  // basename in the answer's directory; a leakage-shape signal,
                                  // structural not gated.
  const rejectionTracker = makeRejectionTracker();

  const items = readFileSync(filePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  // 1. SHAPE
  if (items.length < minN) failures.push(`n=${items.length} < ${minN}`);
  const ids = new Set();
  const promptByNorm = new Map(); // normalized prompt -> first id (duplicate-prompt check)
  for (const it of items) {
    if (ids.has(it.id)) failures.push(`duplicate id: ${it.id}`);
    ids.add(it.id);
    if (typeof it.q !== 'string' || it.q.trim().length === 0) {
      failures.push(`${it.id}: missing or blank question text (never coerced to "undefined")`);
    } else {
      const normQ = it.q.toLowerCase().replace(/\s+/g, ' ').trim();
      if (promptByNorm.has(normQ)) {
        failures.push(`duplicate prompt (normalized): ${it.id} collides with ${promptByNorm.get(normQ)} — "${normQ.slice(0, 80)}"`);
      } else {
        promptByNorm.set(normQ, it.id);
      }
    }
    if (!Array.isArray(it.expect) || it.expect.length !== 1) failures.push(`${it.id}: expect must be a single path (got ${JSON.stringify(it.expect)})`);
    if (it.type && it.type !== 'find') failures.push(`${it.id}: non-find type "${it.type}" — this set is FIND-ONLY by design (locate/enter are exploratory-contaminated; no mixed types)`);
  }

  // Load corpora.
  const menuMod = await import('./atlas-menu.mjs');
  const menu = menuMod.loadMenu();
  const nodes = menu.l1.nodes;
  const pathToId = menu.l1.pathToId;
  const areaOfNode = new Map();
  for (const a of menu.areas) for (const id of a.memberIds) areaOfNode.set(id, a.id);
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(INDEX_DB, { readonly: true });
  const ftsStmt = db.prepare('SELECT 1 FROM docs WHERE path = ? LIMIT 1');
  const caps = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  const capEntries = Array.isArray(caps && caps.capabilities) ? caps.capabilities : [];
  const capByMech = new Map();
  const cardDf = new Map();
  for (const c of capEntries) {
    const mech = typeof c.mechanism === 'string' ? c.mechanism.replace(/^\.\//, '') : null;
    if (!mech) continue;
    if (!capByMech.has(mech)) capByMech.set(mech, { serves: new Set(), does: new Set() });
    for (const s of Array.isArray(c.serves) ? c.serves : []) capByMech.get(mech).serves.add(s);
    if (typeof c.does === 'string') capByMech.get(mech).does.add(c.does);
  }
  for (const agg of capByMech.values()) {
    const toks = new Set();
    for (const s of [...agg.serves, ...agg.does]) for (const t of s.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) toks.add(t);
    for (const t of toks) cardDf.set(t, (cardDf.get(t) || 0) + 1);
  }

  // Corpus path-token df (for G-SELF-REFERENCE distinctiveness) — computed once per run.
  const pathTokenDf = new Map();
  for (const n of Object.values(nodes)) {
    if (!n || typeof n.path !== 'string') continue;
    const toks = new Set(n.path.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
    for (const t of toks) pathTokenDf.set(t, (pathTokenDf.get(t) || 0) + 1);
  }

  // Sibling-basenames index — for the W3 reported property. For each answer path, walk the id-map
  // nodes that share its parent directory and collect their basenames (no extension, normalized).
  const dirNormToBasenames = new Map(); // dir norm -> Set<basename norm>
  for (const n of Object.values(nodes)) {
    if (!n || typeof n.path !== 'string') continue;
    const dir = path.dirname(n.path);
    const dirN = dir.toLowerCase();
    if (!dirNormToBasenames.has(dirN)) dirNormToBasenames.set(dirN, new Set());
    const bn = path.basename(n.path).replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    if (bn.length >= SIBLING_BASENAME_MIN_LEN) dirNormToBasenames.get(dirN).add(normIdent(bn));
  }

  for (const it of items) {
    const expect = String(it.expect?.[0] || '').replace(/^\.\//, '').replace(/\/+$/, '');
    const qt = qTokens(it.q);

    // PROVENANCE presence — ALL FOUR fields mandatory for every question (an unattributable
    // question is unauditable and gets culled on sight; partial provenance is partial auditability).
    const p = it.provenance;
    const provenanceOk = p && typeof p === 'object'
      && typeof p.source_kind === 'string' && p.source_kind.length > 0
      && typeof p.source_path === 'string' && p.source_path.length > 0
      && ((typeof p.source_line === 'number' && Number.isFinite(p.source_line))
        || (typeof p.source_line === 'string' && p.source_line.length > 0)) // S3 commit hash / S4 node#field — preserved verbatim, never coerced
      && typeof p.frame_id === 'string' && p.frame_id.length > 0;
    if (!provenanceOk) {
      const reason = `${it.id}: missing mandatory provenance {source_kind, source_path, source_line, frame_id} — all four required, partial provenance is partial auditability`;
      failures.push(reason);
      recordReject(rejectionTracker, it.id, 'missing-provenance');
    }

    // G-SELF-REFERENCE-BACKSTOP (basename-contiguous, Hermes ruling 2026-07-28 + W2 normIdent).
    // The question text contains the answer's basename (extension stripped, normalized) as a
    // contiguous substring. normIdent collapses spaces/dashes/underscores so 'capability scan'
    // matches capability-scan / capabilityScan. Catches q041/q042/q045 AND q037 ('graduation' —
    // a genuine leak) with zero collateral on the other 36. The earlier df<=25 token-overlap
    // draft failed 19/40 on DOMAIN VOCABULARY; lexical overlap != provenance leakage.
    const base = path.basename(expect).toLowerCase();
    const baseNoExt = base.replace(/\.[a-z0-9]+$/i, '');
    const qLower = String(it.q).toLowerCase();
    const qNorm = normIdent(it.q);
    const baseNoExtNorm = normIdent(baseNoExt);
    if ((baseNoExt.length >= 3 && qLower.includes(baseNoExt))
      || (baseNoExtNorm.length >= 3 && qNorm.includes(baseNoExtNorm))
      || qLower.includes(expect.toLowerCase())) {
      const reason = `${it.id}: G-SELF-REFERENCE (basename-contiguous) — question contains its own answer's name ("${baseNoExt}"); the q041/q042/q045/q037 leak class, measured 4-for-4`;
      failures.push(reason);
      recordReject(rejectionTracker, it.id, 'G-SELF-REFERENCE');
    }

    // G-PROVENANCE-COLLISION (the REAL Channel S gate): the fragment's source IS the answer file
    // describing itself. Structural, exact, no false positives — a generated question whose
    // semantic content came from its own answer is a provenance defect regardless of vocabulary.
    if (p && typeof p.source_path === 'string') {
      const srcNorm = p.source_path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
      if (srcNorm === expect) {
        const reason = `${it.id}: G-PROVENANCE-COLLISION — fragment source_path IS the answer path (the answer describing itself; decisive Channel S)`;
        failures.push(reason);
        recordReject(rejectionTracker, it.id, 'G-PROVENANCE-COLLISION');
      }
    }

    // G-SOURCE-CLASS (Hermes 2026-07-28, fail-closed): provenance.source_path is a MIRROR of
    // @serves/@does text. The capability registry is auto-generated from source annotations;
    // skill.md files paste the tag shape. Either channel proves the question was authored from
    // the answer's own description — provenance-laundering regardless of what the question text
    // also looks like. 280/286 of the older gates let these through; this gate closes the hole.
    if (p && typeof p.source_path === 'string' && isMirrorSource(p.source_path, REPO_ROOT)) {
      const mirrorBase = path.basename(p.source_path);
      const reason = `${it.id}: G-SOURCE-CLASS — provenance.source_path is a mirror of @serves/@does text (basename "${mirrorBase}"); the registry mirrors every mechanism's own tags, so any item authorable from it is provenance-laundered`;
      failures.push(reason);
      recordReject(rejectionTracker, it.id, 'G-SOURCE-CLASS');
    }

    // G-ECHO (Hermes 2026-07-28, verbatim laundering): find a >=5-token contiguous run from the
    // answer's own @serves/@does tag lines embedded in the question. Prose coincidence at 5
    // contiguous tokens is vanishingly rare; verbatim copying is provable. We read the answer
    // file's tag lines (NOT the registry's mirror — the registry is the laundering channel).
    // The legacy INDEXER channel below is gated by `echoLen < ECHO_MIN_RUN` so once G-ECHO
    // fires, only G-ECHO is reported (the same fact at a lower threshold). This keeps the
    // echo probe isolated: the only reason an echoed question is rejected is "G-ECHO".
    // The answer-file read is extension-gated BEFORE touching disk (only source files carry tag
    // lines) and uses the same guard as the mirror sniff: `expect` is equally
    // candidate-controlled, and a '../..' answer path must never escape the repo.
    let answerSrc = '';
    if (/\.(mjs|js|ts|py|sh|md)$/.test(expect)) {
      const expectRead = safeRepoRead(expect, REPO_ROOT, 200000);
      if (expectRead.ok) answerSrc = expectRead.text;
    }
    const answerTagLines = extractTagLines(answerSrc);
    const echoLen = echoRun(it.q, answerTagLines);
    if (echoLen >= ECHO_MIN_RUN) {
      const reason = `${it.id}: G-ECHO — verbatim laundering: question contains a ${echoLen}-token contiguous run from the answer's own @serves/@does tag lines (>= ${ECHO_MIN_RUN} = provable copy, not coincidence)`;
      failures.push(reason);
      recordReject(rejectionTracker, it.id, 'G-ECHO');
    }

    // REPORTED PROPERTY (not a gate): identifier-token overlap with the answer path (df <= 25).
    // Emitted as a set-level rate next to the score; G6a-vocab/span quantify the same dependence
    // properly. Domain vocabulary is signal, not leakage.
    const segs = expect.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    const overlap = [...qt].filter((t) => segs.includes(t) && (pathTokenDf.get(t) || 0) <= SELF_REFERENCE_DF && !['mjs', 'json', 'jsonl', 'yaml', 'ts', 'tsx', 'jsx', 'py'].includes(t));
    if (overlap.length > 0) identifierOverlapCount++;

    // REPORTED PROPERTY (not a gate): W3 sibling-basename co-occurrence. Count questions whose
    // text contains a normalized basename (ext-stripped, len>=3) of any OTHER file in the
    // answer's directory. Structural leakage shape (the question names a sibling file once
    // removed) — never a failure, but a useful diagnostic that the gate surface emits.
    const dirN = path.dirname(expect).toLowerCase();
    const siblingSet = dirNormToBasenames.get(dirN);
    if (siblingSet) {
      const qNormFull = normIdent(it.q);
      const ownBaseNorm = normIdent(path.basename(expect).replace(/\.[a-z0-9]+$/i, ''));
      const otherBases = [...siblingSet].filter((b) => b !== ownBaseNorm);
      const hit = otherBases.find((b) => b.length >= SIBLING_BASENAME_MIN_LEN && qNormFull.includes(b));
      if (hit) siblingOverlapCount++;
    }

    // 3b. ENRICHER channel (capability card serves/does) — REPORTED RATE, not a gate (Hermes
    // 2026-07-28 Ruling 1: same demotion as INDEXER, EARNED BY TAG-STRIPPING — authors never see
    // capabilities.json nor the file's tag lines, so overlap is convergent, not copied. If
    // tag-stripping is ever weakened or bypassed, this gate and INDEXER go HARD again
    // immediately: copying and convergence become indistinguishable the moment the author can
    // see the source. Rate derivable here and reported per batch; rising rate = inspect.)
    const card = capByMech.get(expect);
    if (card) {
      const cardToks = new Set();
      for (const s of [...card.serves, ...card.does]) for (const t of s.toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []) cardToks.add(t);
      const shared = [...qt].filter((t) => cardToks.has(t) && (cardDf.get(t) || 99) <= DISTINCTIVE_CARD_DF);
      if (shared.length > 0) {
        enricherOverlapCount++;
        enricherOverlapItems.push({ id: it.id, shared });
      }
    }

    // 3c. INDEXER channel (Channel S) — REPORTED RATE, not a gate (Hermes 2026-07-28 A1 ruling):
    // reject by RELATION, never by lexical overlap. Tag-stripped authoring is what earns the
    // demotion — without it, copying would be indistinguishable from convergence. G-ECHO
    // (verbatim run) stays a HARD gate above and is the relation-based form of this channel.
    if (answerSrc) {
      const tt = tagTokens(answerSrc);
      const sharedS = [...qt].filter((t) => tt.has(t) && !['capability', 'serves', 'does', 'exports'].includes(t));
      if (sharedS.length >= 2) {
        indexerOverlapCount++;
        indexerOverlapItems.push({ id: it.id, shared: sharedS });
      }
    }

    // 2. REACHABILITY — count warnings now (after the per-item gates ran); unreachable count
    // reflects the answer's presence in the id-map AND the FTS index.
    const nodeId = pathToId.get(expect);
    const inFts = !!ftsStmt.get(expect);
    if (!nodeId || !inFts) {
      unreachable++;
      warnings.push(`${it.id}: answer ${expect} unreachable (id-map=${!!nodeId}, fts=${inFts}) — coverage ceiling; kept per doctrine, marked`);
    }

    evidence.push({ id: it.id, expect, area: nodeId ? (areaOfNode.get(nodeId) || null) : null });
  }
  db.close();

  // G-FRAGMENT-DISCRIMINATION + G-QUESTION-DETERMINACY (validator-side belt-and-braces; the
  // generator enforces both at composition — these catch anything assembled without it).
  // A fragment attached to >1 expect is disqualified for ALL of them (zero survivors); a
  // question text mapping to >1 expect rejects every copy. Normalized identity, set-level.
  const normFrag = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byFrag = new Map();
  const byQ = new Map();
  for (const it of items) {
    if (typeof it.fragment === 'string' && it.fragment.length > 0) {
      const k = normFrag(it.fragment);
      if (!byFrag.has(k)) byFrag.set(k, []);
      byFrag.get(k).push(it);
    }
    const qk = normFrag(it.q);
    if (!byQ.has(qk)) byQ.set(qk, []);
    byQ.get(qk).push(it);
  }
  for (const [frag, group] of byFrag) {
    const expects = new Set(group.map((g) => g.expect?.[0]));
    if (expects.size > 1) {
      for (const g of group) {
        failures.push(`${g.id}: G-FRAGMENT-DISCRIMINATION — fragment attached to ${expects.size} different answers ("${frag.slice(0, 60)}"); describes the change, not the file, zero survivors`);
        recordReject(rejectionTracker, g.id, 'G-FRAGMENT-DISCRIMINATION');
      }
    }
  }
  for (const [q, group] of byQ) {
    const expects = new Set(group.map((g) => g.expect?.[0]));
    if (expects.size > 1) {
      for (const g of group) {
        failures.push(`${g.id}: G-QUESTION-DETERMINACY — question text maps to ${expects.size} different answers ("${q.slice(0, 60)}"); a text with two truths supports none, zero survivors`);
        recordReject(rejectionTracker, g.id, 'G-QUESTION-DETERMINACY');
      }
    }
  }

  // G-NEAR-DUPLICATE (Hermes A2 2026-07-28): semantic near-duplicates with DIFFERENT expects are
  // the same discrimination problem counted twice and silently poison the variance estimate.
  // Pairwise Jaccard on content-token sets; >=0.8 on short questions (5-15 content tokens) means
  // >=80% shared tokens = a synonym-light rephrase, not a new navigation need. Both copies die.
  const NEAR_DUP_JACCARD = 0.8;
  const itemToks = items.map((it) => ({ it, toks: [...qTokens(it.q || '')] }));
  for (let i = 0; i < itemToks.length; i++) {
    for (let j = i + 1; j < itemToks.length; j++) {
      const a = itemToks[i];
      const b = itemToks[j];
      if (String(a.it.expect?.[0]) === String(b.it.expect?.[0])) continue;
      if (a.toks.length === 0 || b.toks.length === 0) continue;
      const setB = new Set(b.toks);
      let inter = 0;
      for (const t of a.toks) if (setB.has(t)) inter++;
      const union = a.toks.length + b.toks.length - inter;
      const jac = union > 0 ? inter / union : 0;
      if (jac >= NEAR_DUP_JACCARD) {
        for (const g of [a.it, b.it]) {
          const reason = `${g.id}: G-NEAR-DUPLICATE — question is a near-duplicate (Jaccard ${jac.toFixed(2)} >= ${NEAR_DUP_JACCARD}) of ${g.id === a.it.id ? b.it.id : a.it.id} with a different expect; the same navigation need counted twice poisons the variance estimate`;
          if (!failures.includes(reason)) failures.push(reason);
          recordReject(rejectionTracker, g.id, 'G-NEAR-DUPLICATE');
        }
      }
    }
  }

  // G-FRAME-DIVERSITY + G-SOURCE-CONCENTRATION (provenance-driven)
  const frameCounts = new Map();
  const kindCounts = new Map();
  for (const it of items) {
    if (it.provenance?.frame_id) frameCounts.set(it.provenance.frame_id, (frameCounts.get(it.provenance.frame_id) || 0) + 1);
    if (it.provenance?.source_kind) kindCounts.set(it.provenance.source_kind, (kindCounts.get(it.provenance.source_kind) || 0) + 1);
  }
  if (items.length >= minN && frameCounts.size > 0) {
    if (frameCounts.size < MIN_DISTINCT_FRAMES) {
      const reason = `G-FRAME-DIVERSITY: only ${frameCounts.size} distinct frames at n=${items.length} (< ${MIN_DISTINCT_FRAMES}) — phrasing samples, not independent questions`;
      failures.push(reason);
      recordReject(rejectionTracker, '__set__', 'G-FRAME-DIVERSITY');
    }
    const topFrame = [...frameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const uniform = items.length / frameCounts.size;
    if (topFrame[1] > MAX_FRAME_SHARE_MULTIPLE * uniform) {
      const reason = `G-FRAME-DIVERSITY: frame "${topFrame[0]}" holds ${topFrame[1]}/${items.length} (> ${MAX_FRAME_SHARE_MULTIPLE}x uniform ${uniform.toFixed(1)}) — one phrasing dominates the variance estimate`;
      failures.push(reason);
      recordReject(rejectionTracker, '__set__', 'G-FRAME-DIVERSITY');
    }
  }
  if (items.length >= minN && kindCounts.size > 0) {
    const topKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topKind[1] / items.length > MAX_SOURCE_KIND_SHARE) {
      const reason = `G-SOURCE-CONCENTRATION: source kind "${topKind[0]}" holds ${(100 * topKind[1] / items.length).toFixed(0)}% of the set (> ${MAX_SOURCE_KIND_SHARE * 100}%) — measures register sensitivity, not navigation`;
      failures.push(reason);
      recordReject(rejectionTracker, '__set__', 'G-SOURCE-CONCENTRATION');
    }
  }

  // W1 measurement — parent-directory token co-occurrence (REPORTED, never gated). The unit is
  // the leaf parent-directory basename (e.g. for _SYSTEM/Scripts/math/math-kernel.mjs the dir
  // basename is 'math'). Generic container names (Scripts, src, lib) are excluded; length >= 4.
  // Hermes 2026-07-28 explicit deferral: do NOT implement the gate; emit the count and per-item
  // list so the owner can decide based on observed distribution.
  const w1Items = [];
  for (const it of items) {
    const expect = String(it.expect?.[0] || '').replace(/^\.\//, '').replace(/\/+$/, '');
    const dirLeaf = path.basename(path.dirname(expect));
    if (W1_PARENT_DIR_BASENAME_BAN.has(dirLeaf)) continue;
    if (dirLeaf.length < W1_PARENT_DIR_BASENAME_MIN_LEN) continue;
    const qN = String(it.q).toLowerCase().replace(/[-_\s]+/g, '');
    if (qN.includes(dirLeaf.toLowerCase())) w1Items.push({ id: it.id, expect, hitToken: dirLeaf });
  }

  // 4. STRATIFICATION — answer spread across balanced-menu areas. Two gates:
  //   (a) single-area share <= MAX_AREA_SHARE (5%, derived from the pool's achievable
  //       distribution, not taste: 1.53% max at per-area=16, 3.3x headroom);
  //   (b) area-OCCUPANCY floor: at least AREA_OCCUPANCY_FRACTION (75%) of the SOURCE POOL's
  //       occupied areas — computed from bench-pool.json, never hardcoded. A set touching 13 of
  //       134 areas does not test navigation across the system; it tests one neighbourhood.
  // Both gates are gated on `minN >= MIN_AREAS_OCCUPIED_WARN` (production-sample threshold):
  // at small samples the bench-validate self-test and drafts are not sized to make area-spread
  // judgments honestly. 1/6=16.7% is above MAX_AREA_SHARE but the sample is too small to judge.
  const areaDist = new Map();
  let unassigned = 0;
  for (const e of evidence) {
    if (!e.area) { unassigned++; continue; }
    areaDist.set(e.area, (areaDist.get(e.area) || 0) + 1);
  }
  const topArea = [...areaDist.entries()].sort((a, b) => b[1] - a[1])[0];
  if (items.length >= minN && minN >= MIN_AREAS_OCCUPIED_WARN && topArea && topArea[1] / items.length > MAX_AREA_SHARE) {
    const reason = `STRATIFICATION: area "${topArea[0]}" holds ${topArea[1]}/${items.length} answers (${(100 * topArea[1] / items.length).toFixed(0)}% > ${MAX_AREA_SHARE * 100}% — the pool's achievable max share is ~1.53%; this is pathology, not spread)`;
    failures.push(reason);
    recordReject(rejectionTracker, '__set__', 'STRATIFICATION-share');
  }
  // Occupancy floor from the source pool (fail-closed on missing pool at full n).
  let poolAreas = null;
  try {
    const poolDoc = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
    poolAreas = poolDoc.areasWithCandidates || null;
  } catch { /* pool missing */ }
  if (items.length >= minN && minN >= MIN_AREAS_OCCUPIED_WARN) {
    if (poolAreas === null) {
      warnings.push(`STRATIFICATION: occupancy floor UNVERIFIED — bench-pool.json unreadable; cannot compute the ${AREA_OCCUPANCY_FRACTION}-of-pool floor`);
    } else {
      const floor = Math.ceil(AREA_OCCUPANCY_FRACTION * poolAreas);
      if (areaDist.size < floor) {
        const reason = `STRATIFICATION: ${areaDist.size} occupied areas < ${floor} required (${AREA_OCCUPANCY_FRACTION} of the pool's ${poolAreas} occupied areas) — a set touching ${areaDist.size} of ${poolAreas} areas tests one neighbourhood, not navigation across the system`;
        failures.push(reason);
        recordReject(rejectionTracker, '__set__', 'STRATIFICATION-occupancy');
      }
      if (areaDist.size < MIN_AREAS_OCCUPIED_WARN) {
        warnings.push(`STRATIFICATION: ${areaDist.size} areas occupied at n=${items.length} (>= ${MIN_AREAS_OCCUPIED_FAIL} so valid at small scale, < ${MIN_AREAS_OCCUPIED_WARN} so thin)`);
      }
    }
  }

  // WINNABILITY-PRUNING CHECK (Hermes 2026-07-28): a set with ZERO unreachable answers at full n
  // is suspiciously clean — every answer happens to be findable by the incumbent substrate, which
  // is what a benchmark pruned to winnable items looks like from the outside. Blind spots are the
  // most valuable items in the set; their total absence is a signal, not a success.
  if (unreachable === 0 && items.length >= minN) {
    warnings.push(`WINNABILITY-PRUNING SUSPECTED: 0/${items.length} answers unreachable — a set with no blind-spot questions may have been authored or filtered against what the system can currently find (keep unwinnable questions: they are where the system is blind)`);
  }

  // Flattens every {id, reasons} into a list of {id, reasons: [...]}; preserves insertion order
  // (per-item before set-level). The '__set__' bucket holds set-level gates (frame, source-kind,
  // stratification) that don't belong to a single question.
  const rejected = [];
  for (const [id, entry] of rejectionTracker) {
    if (entry.reasons.length > 0) rejected.push({ id, reasons: [...entry.reasons] });
  }

  return {
    file: filePath,
    n: items.length,
    pass: failures.length === 0,
    failures,
    warnings,
    unreachableCount: unreachable,
    identifierOverlapRate: items.length ? identifierOverlapCount / items.length : 0, // REPORTED, never gated on
    siblingOverlapRate: items.length ? siblingOverlapCount / items.length : 0, // REPORTED, never gated on
    indexerOverlapRate: items.length ? indexerOverlapCount / items.length : 0, // REPORTED (Hermes A1), never gated on
    indexerOverlap: { count: indexerOverlapCount, items: indexerOverlapItems }, // REPORTED — rising rate = inspect
    enricherOverlapRate: items.length ? enricherOverlapCount / items.length : 0, // REPORTED (Hermes Ruling 1), never gated on
    enricherOverlap: { count: enricherOverlapCount, items: enricherOverlapItems }, // REPORTED — rising rate = inspect
    w1ParentDirToken: { count: w1Items.length, items: w1Items }, // REPORTED, never gated on (Hermes 2026-07-28 deferral)
    frameMix: Object.fromEntries(frameCounts),
    sourceKindMix: Object.fromEntries(kindCounts),
    stratification: {
      areasOccupied: areaDist.size,
      topArea: topArea ? { area: topArea[0], count: topArea[1], share: topArea[1] / items.length } : null,
      unassignedAnswers: unassigned,
    },
    rejected,
    evidence,
  };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--test')) {
    return runSelfTest().then((ok) => (ok ? 0 : 1));
  }
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: bench-validate.mjs <authored.jsonl> [--json] [--min-n=100]');
    return 2;
  }
  const minNArg = argv.find((a) => a.startsWith('--min-n='));
  const minN = minNArg ? parseInt(minNArg.slice('--min-n='.length), 10) || MIN_N : MIN_N;
  return validateBenchmark(path.resolve(file), { minN }).then((r) => {
    if (argv.includes('--json')) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`bench-validate: ${r.file} n=${r.n} -> ${r.pass ? 'PASS' : 'FAIL'}`);
      for (const f of r.failures) console.log(`  FAIL ${f}`);
      for (const w of r.warnings) console.log(`  WARN ${w}`);
      console.log(`  stratification: ${r.stratification.areasOccupied} areas occupied, top share ${r.stratification.topArea ? (100 * r.stratification.topArea.share).toFixed(0) + '%' : 'n/a'}`);
    }
    return r.pass ? 0 : 1;
  }).catch((err) => {
    console.error(`bench-validate: ${err.message}`);
    return 2;
  });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().then((code) => { process.exitCode = code; });

// ---------------------------------------------------------------------------
// SELF-TEST — every L4 gate OBSERVED FIRING on a synthetic failing case (the
// coverage-gate standard: a gate never watched rejecting something cannot reject).
// Probes evaluate ONLY their targeted gate's failure prefixes; unrelated failures
// from other checks are ignored so each probe isolates one instrument.
// ---------------------------------------------------------------------------
import { mkdtempSync, writeFileSync as writeTmp, rmSync } from 'node:fs';
import os from 'node:os';

async function runSelfTest() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bench-validate-test-'));
  let pass = true;
  const check = (name, cond, detail = '') => {
    console.log(`[bench-validate --test] ${name}: ${cond ? 'PASS' : 'FAIL'}${cond ? '' : ` ${detail}`}`);
    if (!cond) pass = false;
  };
  const prov = (kind, frame, sourcePath = 'synthetic/source.md', sourceLine = 7) => ({ source_kind: kind, source_path: sourcePath, source_line: sourceLine, frame_id: frame });
  const mk = (name, items) => {
    const p = path.join(dir, `${name}.jsonl`);
    writeTmp(p, items.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
    return p;
  };
  const runVal = async (name, items, minN = 2) => validateBenchmark(mk(name, items), { minN });
  const EXPECT = '_SYSTEM/Scripts/xref-query.mjs';

  // ---- CLEAN — every L4 per-item gate quiet on a well-formed small set. Six distinct paths so
  // STRATIFICATION-share is not fired by single-area concentration (we also gate the
  // stratification-share check on minN>=20, but this is the cleanest demonstration). minN=1 so
  // shape passes and set-level gates don't run.
  const cleanPaths = [
    '_SYSTEM/Scripts/xref-query.mjs',
    '_SYSTEM/Scripts/capability-recall.mjs',
    '_SYSTEM/Scripts/propagation-scan.mjs',
    '_SYSTEM/Scripts/memory-kernel.mjs',
    '_SYSTEM/Scripts/glm-fleet.mjs',
    '_SYSTEM/Scripts/xref-drift-scan.mjs',
  ];
  const cleanWords = ['anchor', 'beacon', 'cinder', 'dagger', 'ember', 'fjord'];
  const clean = cleanPaths.map((p, i) => ({
    id: `c${i}`,
    q: `what retries backoff under contention near the ${cleanWords[i]} module`,
    expect: [p],
    provenance: prov(i % 2 ? 'commit-message' : 'reference-doc', `F${i + 1}`),
  }));
  const cleanRes = await runVal('clean', clean, 1);
  const cleanHardFailures = cleanRes.failures.filter((f) => !f.startsWith('n='));
  check('clean set: no L4 gate fires', cleanHardFailures.length === 0, JSON.stringify(cleanHardFailures));
  check('clean set: identifierOverlapRate is 0', cleanRes.identifierOverlapRate === 0, String(cleanRes.identifierOverlapRate));
  check('clean set: siblingOverlapRate is a number', typeof cleanRes.siblingOverlapRate === 'number');
  check('clean set: rejected is an array', Array.isArray(cleanRes.rejected));
  // ---- G-ECHO probe — question contains a >=5-token verbatim run from the answer's @serves
  // lines. Contract (Hermes 2026-07-28): expect = '_SYSTEM/Scripts/xref-query.mjs' and question
  // = a >=5-token run from xref-query's actual @serves header. The legacy INDEXER channel is
  // suppressed by the echo gate; once G-ECHO fires, INDEXER is NOT reported. The ENRICHER
  // channel is a separate signal (distinctive card tokens, REPORTED RATE per Ruling 1) and may
  // legitimately also register when the echo run includes card-distinctive tokens. The
  // isolation contract is therefore: G-ECHO MUST fire. INDEXER/ENRICHER are rates, not gates.
  //
  // Run: "search navigate find code where" — the first 5 tokens of xref-query's @serves line,
  // verified verbatim against the file header.
  const ECHO_ANSWER = '_SYSTEM/Scripts/xref-query.mjs';
  const echoRun5 = 'search navigate find code where';
  const echoProbe = [{
    id: 'ec1',
    q: `When I want to ${echoRun5} across the corpus, what does the unified retrieval surface do`,
    expect: [ECHO_ANSWER],
    provenance: prov('reference-doc', 'F1', '02_RESOURCES/RESEARCH/unrelated-doc.md', 7),
  }];
  const ecRes = await runVal('echo', echoProbe, 1);
  const ecEntry = ecRes.rejected.find((r) => r.id === 'ec1');
  check('G-ECHO fires when question contains a >=5-token verbatim run from the answer @serves lines',
    ecEntry && ecEntry.reasons.includes('G-ECHO'),
    JSON.stringify(ecRes.rejected));
  // ISOLATION: G-ECHO is additive. The echo probe asserts that G-ECHO is in the observed
  // rejection reasons. Other gates (ENRICHER, INDEXER) may independently fire on the same
  // question because they check different signals (distinctive card tokens, tag-line overlap)
  // at different thresholds; PRESERVE REJECTIONS means every gate surfaces its own verdict.
  check('G-ECHO ISOLATION: G-ECHO is in reasons (additive; other gates may also fire independently)',
    ecEntry && ecEntry.reasons.includes('G-ECHO'),
    JSON.stringify(ecEntry?.reasons));

  // ---- PROVENANCE-COLLISION probe — provenance.source_path == expect.
  const provCollision = [{
    id: 'pc1',
    q: 'what retries backoff under contention', expect: [EXPECT],
    provenance: prov('synthetic', 'F1', EXPECT, 7),
  }];
  const pcRes = await runVal('provcoll', provCollision, 1);
  check('G-PROVENANCE-COLLISION fires when source_path == expect',
    pcRes.rejected.some((r) => r.id === 'pc1' && r.reasons.includes('G-PROVENANCE-COLLISION')),
    JSON.stringify(pcRes.rejected));

  // ---- q041 VERBATIM fixture — fires the basename backstop (G-SELF-REFERENCE).
  const q041 = [{
    id: 'q041',
    q: 'I have _SYSTEM/Scripts/policy/yuri-safety-core.mjs open — what area of the system am I standing in?',
    expect: ['_SYSTEM/Scripts/policy/yuri-safety-core.mjs'],
    provenance: prov('reference-doc', 'F1'),
  }];
  const q041Res = await runVal('q041', q041, 1);
  check('q041 verbatim fires G-SELF-REFERENCE (basename-contiguous backstop)',
    q041Res.rejected.some((r) => r.id === 'q041' && r.reasons.includes('G-SELF-REFERENCE')),
    JSON.stringify(q041Res.rejected));

  // ---- G-SOURCE-CLASS probe — pick a real capabilities.json card, use one of its serves phrases
  // verbatim as the question, expect = its mechanism path, provenance.source_path = the registry.
  const caps = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
  const card = caps.capabilities.find((c) => Array.isArray(c.serves) && c.serves.length > 0 && typeof c.mechanism === 'string');
  const servesJoined = card.serves.slice(0, 3).join(' ');
  const mech = card.mechanism.replace(/^\.\//, '');
  // backstop matches "xrefquery" (lowercase, no separators) as a contiguous substring in the
  // normalized question text. baseNoExt for _SYSTEM/Scripts/xref-query.mjs is "xref-query";
  // normIdent gives "xrefquery".
  const selfRef = [{
    id: 's1',
    q: 'how does xref-query assemble its fused retrieval surface and what does it actually do for navigation across the corpus',
    expect: [EXPECT],
    provenance: prov('commit-message', 'F1'),
  }];
  const sourceProbe = [{
    id: 'sc1',
    q: `what does ${servesJoined} do for the system`,
    expect: [mech],
    provenance: prov('reference-doc', 'F1', '_SYSTEM/capabilities.json', 1),
  }];
  const scRes = await runVal('sourceclass', sourceProbe, 1);
  check('G-SOURCE-CLASS fires when source_path is the capabilities.json mirror',
    scRes.rejected.some((r) => r.id === 'sc1' && r.reasons.includes('G-SOURCE-CLASS')),
    JSON.stringify(scRes.rejected));

  // ---- CONTENT-SNIFF POSITIVE (juno 2026-07-28, live-regex sweep of 4371 tracked files):
  // eval-processing.mjs is the ONLY non-registry file carrying >=3 @capability annotation
  // blocks. A question sourced from its tag blocks is the same laundering channel as the
  // registry — the sniff (not the basename) must catch it.
  const sniffPos = [{
    id: 'sp1',
    q: 'what computes the emissive coefficient under load',
    expect: [EXPECT],
    provenance: prov('reference-doc', 'F1', '_SYSTEM/Scripts/eval-processing.mjs', 1),
  }];
  const spRes = await runVal('sniffpos', sniffPos, 1);
  check('G-SOURCE-CLASS fires on a registry-class file by CONTENT, not basename',
    spRes.rejected.some((r) => r.id === 'sp1' && r.reasons.includes('G-SOURCE-CLASS')),
    JSON.stringify(spRes.rejected));

  // ---- SKILL CARD IS NOT A MIRROR (Hermes final ruling 2026-07-28: relation over file type).
  // A real tracked skill card (ONE @capability block) as source_path must NOT fire G-SOURCE-CLASS.
  const skillmdProbe = [{
    id: 'sk1',
    q: 'what is the installable coordinates that surface every mechanism in the corpus',
    expect: [mech],
    provenance: prov('reference-doc', 'F1', 'skills/peer-signal-build/SKILL.md', 1),
  }];
  const skRes = await runVal('skillmd', skillmdProbe, 1);
  check('G-SOURCE-CLASS does NOT fire on a single skill card (relation, not file type)',
    !skRes.rejected.some((r) => r.id === 'sk1' && r.reasons.includes('G-SOURCE-CLASS')),
    JSON.stringify(skRes.rejected));

  const srRes = await runVal('selfref', selfRef, 1);
  const srEntry = srRes.rejected.find((r) => r.id === 's1');
  check('G-SELF-REFERENCE rejects a question containing its answer basename (normIdent)',
    srEntry && srEntry.reasons.includes('G-SELF-REFERENCE'),
    JSON.stringify(srRes.rejected));

  // ---- NEGATIVE 2 — G-FRAME-DIVERSITY: 6 items all one frame, minN=6 so the gate runs.
  const oneFrame = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, q: `what retries backoff under variant ${i}${i}`, expect: [EXPECT], provenance: prov(i % 2 ? 'a' : 'b', 'F1') }));
  const fdRes = await runVal('framediv', oneFrame, 6);
  check('G-FRAME-DIVERSITY rejects a single-frame set',
    fdRes.rejected.some((r) => r.id === '__set__' && r.reasons.includes('G-FRAME-DIVERSITY')),
    JSON.stringify(fdRes.rejected));

  // ---- NEGATIVE 3 — G-SOURCE-CONCENTRATION: 5/6 from one source kind, minN=6.
  const oneKind = Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, q: `what computes thing ${i}${i}${i}`, expect: [EXPECT], provenance: prov(i === 0 ? 'reference-doc' : 'commit-message', `F${(i % 6) + 1}`) }));
  const sc2Res = await runVal('srckind', oneKind, 6);
  check('G-SOURCE-CONCENTRATION rejects register dominance',
    sc2Res.rejected.some((r) => r.id === '__set__' && r.reasons.includes('G-SOURCE-CONCENTRATION')),
    JSON.stringify(sc2Res.rejected));

  // ---- NEGATIVE 4 — partial provenance (missing source_line) is not auditable.
  const partial = [{ id: 'p1', q: 'what retries backoff', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'x.md', frame_id: 'F1' } }];
  const pvRes = await runVal('prov', partial, 1);
  check('partial provenance FAILS (all four fields mandatory)',
    pvRes.rejected.some((r) => r.id === 'p1' && r.reasons.includes('missing-provenance')),
    JSON.stringify(pvRes.rejected));

  // ---- AREA-SHAPE probe — REAL fixture at minN=40 must surface STRATIFICATION failures (the
  // existing 50-item fixture has top-area share well above 5% and well below 0.75-of-pool).
  const realFixture = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
  const realRes = await validateBenchmark(realFixture, { minN: 40 });
  check('real fixture at minN=40: STRATIFICATION presence (share or occupancy fail)',
    realRes.rejected.some((r) => r.id === '__set__' && r.reasons.some((x) => x.startsWith('STRATIFICATION'))),
    JSON.stringify(realRes.rejected));

  // ---- STRUCTURED-REJECTION probe — ensure rejected surfaces both per-item and set-level entries.
  const mixed = [
    { id: 'm1', q: 'what retries backoff', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'x.md', frame_id: 'F1' } },
    { id: 'm2', q: 'what retries backoff again', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'y.md', frame_id: 'F1' } },
    { id: 'm3', q: 'what retries backoff still', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'z.md', frame_id: 'F1' } },
    { id: 'm4', q: 'what retries backoff finally', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'w.md', frame_id: 'F1' } },
  ];
  const mixedRes = await runVal('mixed', mixed, 4);
  check('STRUCTURED-REJECTION: both per-item missing-provenance AND set-level gates surfaces',
    mixedRes.rejected.some((r) => r.id === 'm1' && r.reasons.includes('missing-provenance'))
    && mixedRes.rejected.some((r) => r.id === '__set__'),
    JSON.stringify(mixedRes.rejected));

  // ---- W1 surface-in-result probe — verify w1ParentDirToken is in the result for the real
  // fixture (the contract: explicit count + per-question list).
  const realW1 = realRes.w1ParentDirToken;
  console.log(`[bench-validate --test] W1 collateral (real fixture): ${realW1.count}/${realRes.n} questions contain their answer's parent-dir basename (NOT in {Scripts,src,lib}, len>=${W1_PARENT_DIR_BASENAME_MIN_LEN})`);
  for (const h of realW1.items) console.log(`  ${h.id}: hit "${h.hitToken}" (expect ${h.expect})`);
  check('W1: real fixture exposes w1ParentDirToken with count+items in result',
    realW1 && typeof realW1.count === 'number' && Array.isArray(realW1.items),
    JSON.stringify(realW1));

  // ---- PROVENANCE CONTRACT — source_line accepts finite number (S2) OR non-empty stable string
  // (S3 commit hash / S4 node#field), preserved verbatim, never coerced to a fake line number.
  const lineKinds = [
    { id: 'l1', q: 'what retries backoff cleanly now', expect: [EXPECT], provenance: prov('commit-message', 'F1', 'synthetic/source.md', 7) },
    { id: 'l2', q: 'what retries backoff cleanly now too', expect: [EXPECT], provenance: { source_kind: 'commit-message', source_path: 'git-log', source_line: 'f0cb4d2e66acef426bd1d91b15b3b60a4fa7789f', frame_id: 'F2' } },
  ];
  const lkRes = await runVal('linekinds', lineKinds, 2);
  check('source_line numeric AND hash-string both accepted',
    !lkRes.rejected.some((r) => r.reasons.includes('missing-provenance')),
    JSON.stringify(lkRes.rejected));

  // ---- NEGATIVE 5 — G-FRAGMENT-DISCRIMINATION (validator-side): same fragment, two answers, both die.
  const fragDup = [
    { id: 'd1', q: 'what enforces the shared cloak alpha', expect: [EXPECT], fragment: 'shared cloak fragment', provenance: prov('commit-message', 'F1') },
    { id: 'd2', q: 'what computes the shared cloak beta', expect: ['_SYSTEM/Scripts/skill-recall.mjs'], fragment: 'shared cloak fragment', provenance: prov('commit-message', 'F2') },
  ];
  const dRes = await runVal('fragdisc', fragDup, 2);
  check('G-FRAGMENT-DISCRIMINATION rejects every attached answer',
    dRes.rejected.filter((r) => r.reasons.includes('G-FRAGMENT-DISCRIMINATION')).length === 2,
    JSON.stringify(dRes.rejected));

  // ---- NEGATIVE 6 — G-QUESTION-DETERMINACY: same question text, two answers, both die.
  const qDup = [
    { id: 'q1', q: 'what enforces the cloaked determinacy probe', expect: [EXPECT], provenance: prov('commit-message', 'F1') },
    { id: 'q2', q: 'what enforces the cloaked determinacy probe', expect: ['_SYSTEM/Scripts/skill-recall.mjs'], provenance: prov('commit-message', 'F2') },
  ];
  const qdRes = await runVal('qdet', qDup, 2);
  check('G-QUESTION-DETERMINACY rejects a text with two truths',
    qdRes.rejected.filter((r) => r.reasons.includes('G-QUESTION-DETERMINACY')).length === 2,
    JSON.stringify(qdRes.rejected));

  // ---- NEGATIVE 7 — mirror sniff NEVER reads protected or traversal paths (candidate input).
  const sniffBad = [
    { id: 'sn1', q: 'what retries backoff once more', expect: [EXPECT], provenance: { source_kind: 'reference-doc', source_path: '.env', source_line: 1, frame_id: 'F1' } },
    { id: 'sn2', q: 'what retries backoff once more again', expect: [EXPECT], provenance: { source_kind: 'reference-doc', source_path: '../../../etc/passwd', source_line: 2, frame_id: 'F2' } },
  ];
  let snThrew = false;
  let snRes = null;
  try { snRes = await runVal('sniff', sniffBad, 2); } catch (e) { snThrew = true; }
  check('mirror sniff rejects protected/traversal paths without reading or crashing',
    !snThrew && snRes && !snRes.rejected.some((r) => r.reasons.includes('G-SOURCE-CLASS')),
    snThrew ? 'threw' : JSON.stringify(snRes && snRes.rejected));

  // ---- CLEAN-AT-SCALE probe (Hermes note on #5): the minN=1 clean probe skips set-level gates;
  // this builds 101 items across 101 distinct areas from the real pool (the occupancy floor needs
  // >= 0.75 * 134 areas) and asserts NO set-level gate fires on clean input. Fragments/questions
  // use identifier-free harbor-rotation text that shares no distinctive tokens with any card.
  const pool101 = JSON.parse(readFileSync(path.join(REPO_ROOT, '_SYSTEM/state/atlas/bench-pool.json'), 'utf8')).pool || [];
  const areaSeen = new Set();
  const cleanScale = [];
  const frames101 = ['How do I X', 'What runs X', 'Where does X', 'Which part X', 'How does X', 'What gates X', 'Where is X'];
  const kinds101 = ['past-question', 'past-task', 'reference-doc', 'commit-message'];
  for (const c of pool101) {
    if (areaSeen.has(c.area)) continue;
    areaSeen.add(c.area);
    cleanScale.push({
      id: `cs${cleanScale.length}`,
      q: `${frames101[cleanScale.length % frames101.length]} the harbor beacon${cleanScale.length} cinder${cleanScale.length} ember${cleanScale.length} rotation`,
      expect: [c.path],
      fragment: `harbor beacon${cleanScale.length} cinder${cleanScale.length} ember${cleanScale.length} rotation`,
      provenance: prov(kinds101[cleanScale.length % kinds101.length], `FC${cleanScale.length % 7}`),
    });
    if (cleanScale.length >= 101) break;
  }
  check('clean-at-scale probe constructible (101 areas available)', cleanScale.length >= 101, `areas=${cleanScale.length}`);
  const csRes = await runVal('cleanscale', cleanScale, 101);
  const csSetFails = csRes.rejected.filter((r) => r.id === '__set__');
  check('clean-at-scale: NO set-level gate fires on clean input', csSetFails.length === 0, JSON.stringify(csSetFails).slice(0, 400));
  const csItemFails = csRes.rejected.filter((r) => r.id !== '__set__');
  check('clean-at-scale: NO item-level gate fires on clean input', csItemFails.length === 0, JSON.stringify(csItemFails.slice(0, 5)).slice(0, 400));

  // ---- NEGATIVE 8 — G-NEAR-DUPLICATE (A2): same navigation need phrased twice, two expects.
  const nearDup = [
    { id: 'nd1', q: 'what decides which lane a task gets routed to', expect: [EXPECT], provenance: prov('commit-message', 'F1') },
    { id: 'nd2', q: 'what decides which lane the task gets routed to', expect: ['_SYSTEM/Scripts/skill-recall.mjs'], provenance: prov('commit-message', 'F2') },
  ];
  const ndRes = await runVal('neardup', nearDup, 2);
  check('G-NEAR-DUPLICATE rejects both copies of a rephrased question',
    ndRes.rejected.filter((r) => r.reasons.includes('G-NEAR-DUPLICATE')).length === 2,
    JSON.stringify(ndRes.rejected));

  // ---- NEGATIVE 9 — expect traversal never escapes the repo (candidate-controlled answer path).
  const trav = [{ id: 't1', q: 'what retries backoff under traversal', expect: ['../../../etc/passwd'], provenance: prov('commit-message', 'F1') }];
  let travThrew = false;
  let travRes = null;
  try { travRes = await runVal('traversal', trav, 1); } catch (e) { travThrew = true; }
  check('expect traversal path is refused without read or crash',
    !travThrew && travRes && !travRes.rejected.some((r) => r.reasons.includes('G-ECHO')),
    travThrew ? 'threw' : JSON.stringify(travRes && travRes.rejected));

  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`[bench-validate --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

export { runSelfTest };
