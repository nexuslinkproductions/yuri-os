#!/usr/bin/env node
/**
 * Prose-Claim Extractor — prose-claim-extractor.mjs  (the "v2 prose-claim source", 3b)
 *
 * The missing organ the claim cortex was always blocked on. `claim-ledger.mjs` is a v1
 * PROXY (a mutating tool success ⇒ an implicit fixture_ready claim). The cortex's own
 * header (claim-cortex.mjs:36) says the richer layer is "reading the agent's ACTUAL prose
 * claims" — this is that layer. It reads written PROSE, extracts STRUCTURED claims, assigns
 * STABLE anchor-bound identity, maps the asserted status to a ladder rung, detects the
 * evidence actually present (and RESOLVES it against the real filesystem), and hands the
 * cortex a claim array shaped exactly as cortexSnapshot / gateClaimTransition consume.
 *
 * ── ADVISORY MODE (the whole point of this first build) ──────────────────────────────
 * This NEVER feeds energy-enforce and NEVER blocks a tool. It authors to a SHADOW ledger
 * (_SYSTEM/state/claim-extractor/) and emits METRICS that GROUND the catastrophe parameters
 * the Wave-3 sim could only estimate (P_emit, veto-storm/churn, partition aggregate).
 * Live-wiring into gateClaimTransition + arming energy-enforce is a LATER Wave-3 step, gated
 * on this advisory ledger soaking clean.
 *
 * IDENTITY (LOCKED design): anchor-bound = `${target}:${claimType}`, node-id substituted for
 * `target` when it maps to a graph node (node-canonical). Stable across paraphrase by
 * construction. normalizeTarget canonicalizes separators (foo-bar = foo_bar = "foo bar") so a
 * partition attacker cannot split one target across spelling variants (red-team cluster D/E).
 *
 * HARDENING (red-team 2026-06-13, 50 confirmed findings → 6 clusters, all closed here):
 *   A. MODALITY GUARD — questions, future, conditional, subjunctive, obligation, and reported
 *      speech are NOT present-tense assertions; they are neutralized (the biggest veto-storm
 *      source). "Is X wired?" / "X will be verified once…" / "the spec says X is verified" → no claim.
 *   B. TARGET HARDENING — a large HARD_STOP set + drop-on-junk (return null rather than anchor
 *      a function word / pronoun / post-verb object). No more `if:`, `says:`, `we:`, `call:` anchors.
 *   C. EVIDENCE RESOLUTION — file-reference evidence is RESOLVED against the real filesystem;
 *      a `.test.mjs` / report / file:line that does not exist is NOT evidence. Prose run-output
 *      ("12/12 pass", "exit 0", "PASS", "Marcel confirmed") with no resolvable file is capped at
 *      ADVISORY rank (unverifiable). Forgery now requires actually creating a passing test file.
 *   F. UNICODE HYGIENE — strip zero-width / directional formatting + NFKC before hashing & match,
 *      killing the contentHash-churn DoS. (Homoglyph-verb substitution remains a documented
 *      residual evasion — same class as synonym evasion below.)
 *   G. CLOCK — extractClaims REQUIRES a finite nowMs (fail-closed), so a missing clock can no
 *      longer poison evidence freshness (capturedAt=0 → false RETRACT).
 *
 * EVIDENCE BIAS (deliberate): UNDER-credits. Only resolvable file references earn fixture+;
 * unverifiable prose earns at most advisory. A measurement instrument must never HIDE an
 * over-claim by over-crediting weak/forged evidence; it errs toward flagging.
 *
 * DOCUMENTED RESIDUALS (not closed in v1 — measurement undercount, not enforcement bypass):
 *   - synonym/homoglyph evasion (a determined evader phrases an over-claim outside the vocab or
 *     with lookalike glyphs) → P_emit is a LOWER bound on evasive corpora.
 *   - highest-rung-wins masks a co-occurring lower honest claim in one statement.
 *   - cross-SENTENCE evidence is uncredited (evidence must be in the claim's own sentence).
 *   - measuring over docs/comments that DISCUSS the vocabulary self-flags (corpus-selection care).
 *
 * Purity: the pure core (extractClaims / measureClaims) takes nowMs explicitly. detectEvidence
 * touches the filesystem ONLY to resolve references (deterministic given the fs state); pass
 * {repoRoot:null} to disable resolution (then unverifiable prose is conservatively downgraded).
 *
 * Related: claim-cortex.mjs (cortexSnapshot/gateClaimTransition/LADDER), claim-integrity-gate.mjs
 * (PROMOTION_STATES), claim-ledger.mjs (the v1 proxy this supersedes), ops plan §3③/§11/§12/§13.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, appendFileSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cortexSnapshot, gateClaimTransition, LADDER } from './claim-cortex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const EXTRACTOR_SCHEMA = 'yuri.prose-claim-extractor.v1';

export const SHADOW_DIR = path.join(REPO_ROOT, '_SYSTEM/state/claim-extractor');
export const SHADOW_LEDGER_PATH = path.join(SHADOW_DIR, 'shadow-ledger.json');
export const METRICS_PATH = path.join(SHADOW_DIR, 'metrics.jsonl');

// ---------------------------------------------------------------------------
// Status vocabulary — prose verb/phrase → (claimType, asserted ladder rung).
// Ordered HIGH→LOW; the strongest matching rung in a statement wins. Expanded after the
// red-team to cover obvious synonyms (production-grade, battle-hardened, ironclad, robust,
// stable, solid). Exhaustive synonym coverage is unbounded — residual gaps are a documented
// P_emit undercount, not an enforcement hole.
// ---------------------------------------------------------------------------
export const STATUS_VERBS = Object.freeze([
  // trusted (5)
  { rung: 'trusted', type: 'production', re: /\b(production[-\s]?(?:ready|grade)|battle[-\s]?(?:tested|hardened)|rock[-\s]?solid|bullet[-\s]?proof|iron[-\s]?clad|ironclad|guaranteed|proven|hardened\s+and\s+proven|ready\s+for\s+production)\b/iu },
  { rung: 'trusted', type: 'shipped', re: /\b(shipped|ships|in\s+production|generally\s+available|GA\b|production\s+guarantee)\b/iu },
  // operator_validated (4)
  { rung: 'operator_validated', type: 'approved', re: /\b(operator[-\s]?validated|owner[-\s]?approved|signed[-\s]?off|owner[-\s]?confirmed|approved\s+by\s+(?:the\s+)?owner)\b/iu },
  // runtime_tested (3) — the canonical over-claim band
  { rung: 'runtime_tested', type: 'verified', re: /\b(verified|fully\s+validated|has\s+been\s+validated|confirmed\s+working|proven\s+to\s+work)\b/iu },
  { rung: 'runtime_tested', type: 'tested', re: /\b(unit[-\s]?tested|fully\s+tested|all\s+tests?\s+pass(?:ing|es)?|tests?\s+green|passing\s+tests?)\b/iu },
  { rung: 'runtime_tested', type: 'works', re: /\b(works\s+correctly|working\s+correctly|fully\s+functional|fully\s+operational|works\s+end[-\s]?to[-\s]?end|handles\s+.{0,30}\s+(?:flawlessly|reliably))\b/iu },
  { rung: 'runtime_tested', type: 'robust', re: /\b(is\s+robust|is\s+stable|rock\s+stable|is\s+solid|battle[-\s]?proven)\b/iu },
  { rung: 'runtime_tested', type: 'live', re: /\b(is\s+live|now\s+live|goes?\s+live|is\s+wired(?:\s+(?:in|up|live|into))?|now\s+wired|is\s+armed|now\s+armed|enforces|blocks\b|fires\s+on|hooked\s+up|in\s+the\s+(?:live|hot)\s+path|wired\s+into)\b/iu },
  // fixture_ready (2)
  { rung: 'fixture_ready', type: 'built', re: /\b(implemented|is\s+built|now\s+built|is\s+done|now\s+done|complete(?:d)?|finished|is\s+ready|in\s+place|fully\s+written)\b/iu },
  // research (1)
  { rung: 'research', type: 'designed', re: /\b(designed|spec(?:'?d|ified|ced)?|researched|explored|investigated|prototyped|scoped)\b/iu },
  // draft (0)
  { rung: 'draft', type: 'wip', re: /\b(work[-\s]?in[-\s]?progress|WIP\b|stub(?:bed)?|sketch(?:ed)?|TODO\b|rough\s+cut|hypothesis|just\s+an\s+idea|draft(?:ed)?)\b/iu },
]);

// Negators within a short window before the verb → honest non-claim.
export const NEGATORS = Object.freeze([
  /\b(not|no|never|without|isn'?t|aren'?t|wasn'?t|won'?t|doesn'?t|don'?t|cannot|can'?t|fails?\s+to|lacks?|missing|absent|dead|inert|stub(?:bed)?|unwired|un-?wired|not\s+yet|yet\s+to\s+be|pending|deferred|blocked\s+on|aspirational|design[-\s]?only|advisory[-\s]?only|fail[-\s]?open)\b/iu,
]);
// Statement-level disclaimer (anywhere) that neutralizes a claim.
export const DISCLAIMER = /\b(not\s+(?:yet\s+)?(?:wired|live|armed|tested|done|built|implemented|enforced|verified|complete)|design[-\s]?only|advisory[-\s]?only|aspirational|never\s+(?:fired|wired|called)|zero\s+(?:live\s+)?(?:callers?|importers?)|no\s+(?:runtime\s+)?caller|fail[-\s]?open|would[-\s]?be|TODO|FIXME|placeholder|stub|WIP\b)\b/iu;

// MODALITY GUARD (red-team cluster A + round-2 cluster B) — a statement that is NOT a
// present-tense assertion of fact. Split by SCOPE: questions are modal wherever they appear;
// future / conditional / subjunctive / obligation / attribution / definition only neutralize the
// CLAIM verb when they GOVERN it, i.e. appear in the pre-verb slice. A modal AFTER the verb
// ("X is production-ready, and will improve") must NOT drop the present-tense assertion.
export const MODALITY_GLOBAL = Object.freeze([
  /\?\s*$/u,                                                                   // a question
  /^\s*(?:is|are|was|were|does|do|did|can|could|should|will|would|has|have|had|may|might)\b[^.?!]*\?/iu, // interrogative lead
]);
export const MODALITY_PREVERB = Object.freeze([
  /\b(will|'ll|going\s+to|about\s+to|plan(?:s|ned)?\s+to|intend(?:s|ed)?\s+to|expect(?:s|ed)?\s+to|aim(?:s|ed)?\s+to|we\s+expect|once\s+(?:the|it|we|all)|after\s+(?:the|it|we|all)|before\s+(?:the|it|we|any)|until\s+)\b/iu, // future / temporal-subordinate
  // (leading subordinate clause handled by isLeadingSubordinateClause — a connective ALONE is not
  //  modal; "After much work, X is verified" is a prepositional phrase, not a temporal clause.)
  /\b(if\b[^.?!]*\bwere\b|would\s+(?:be\s+)?(?:block|verif|wire|enforc|work|ship)|were\s+(?:it\s+)?(?:verified|wired|tested|built))/iu, // subjunctive
  /\b(must|should|shall|need(?:s)?\s+to|have\s+to|has\s+to|ought\s+to|required\s+to|is\s+required|to\s+be\s+(?:wired|verified|tested|built|done|implemented|armed))\b/iu, // obligation / requirement
  /\b(?:according\s+to|defined\s+as|refers?\s+to|per\s+the\s+(?:spec|doc|report|plan|design))\b/iu, // attribution
  /\bmeans?\s+(?:that\b|the\b|all\b|["'`])/iu, // definition
]);
// A leading temporal/conditional connective (if/once/when/after/before/…) is modal ONLY when it
// heads a real SUBORDINATE CLAUSE — i.e. the segment up to the first comma contains a verb. A bare
// connective + noun phrase ("After much work,") is a prepositional adjunct, not a clause, and must
// NOT drop the main assertion (round-2 residual fix 2026-06-13).
const LEADING_SUBORD = /^\s*(?:if|once|when|after|before|unless|until|while|assuming|suppose|provided)\b\s+([^,]*)/iu;
// A clause carries a finite COPULA/AUXILIARY ("after the gate IS armed", "once the build HAS run").
// Only unambiguous aux/copula tokens — NOT lexical verbs like "work"/"run"/"pass" that are also
// common nouns ("after much WORK" must stay a prepositional phrase, not a clause).
const CLAUSE_AUX = /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|'s)\b/iu;
// A reduced clause = connective + a status PARTICIPLE ("once BUILT", "after WIRED, X is …").
const LEADING_PARTICIPLE = /^\s*(?:built|wired|verified|tested|done|implemented|shipped|deployed|armed|completed|finished|merged|enabled|live|ready|fixed|patched)\b/iu;
export function isLeadingSubordinateClause(s) {
  const m = LEADING_SUBORD.exec(String(s || ''));
  if (!m) return false;
  const clause = m[1] || '';
  if (CLAUSE_AUX.test(clause)) return true;
  if (LEADING_PARTICIPLE.test(clause)) return true;
  return STATUS_VERBS.some((v) => { v.re.lastIndex = 0; return v.re.test(clause); }); // explicit status-verb phrase
}

// reported speech (cluster B) — REQUIRE a subject (≥2-char word) BEFORE the reporting verb, so
// "Marcel notes that X is live" drops (attributed) but sentence-initial "Note that X is live" is
// KEPT, and the reporting verb cannot match a substring of a target noun ("claim-router").
export const REPORTED_SPEECH = /\b[\w-]{2,}\s+(?:says?|said|claims?|claimed|states?|stated|argues?|notes?|noted|reports?|reported)\s+(?:that\b|the\b|it\b|how\b|why\b|[\w-]+\s+(?:is|are|was|were|has|have|will|would))/iu;

// Evidence detectors — what, in the statement, backs the claim. kinds mirror claim-cortex
// EVIDENCE_CEILING. File-bearing kinds carry the matched path in `ref` for FS resolution.
export const EVIDENCE_DETECTORS = Object.freeze([
  { kind: 'runtime_trace', fileGroup: 0, re: /\b(\d+\s*\/\s*\d+\s*(?:tests?\s*)?(?:pass(?:ing|ed|es)?|green)|exit\s*(?:code\s*)?0\b|all\s+green|✓\s|\bPASS\b|SYNTAX_OK)\b/u },
  { kind: 'test', fileGroup: 1, re: /\b([\w@./-]+\.test\.(?:mjs|js))\b/u },                      // a .test file ref (resolved)
  { kind: 'fixture', fileGroup: 1, re: /\b([\w@./-]+\.(?:mjs|js|ts|cjs)):\d+\b/u },              // file:line citation
  { kind: 'fixture', fileGroup: 1, re: /\bnode\s+(_SYSTEM\/Scripts\/[\w./-]+)/u },               // executable invocation
  { kind: 'report', fileGroup: 1, re: /\b(_SYSTEM\/reports\/[\w./-]+\.md)\b/u },
  { kind: 'operator_note', fileGroup: 0, re: /\b(owner\s+approved|operator[-\s]?validated|Marcel\s+(?:approved|confirmed|greenlit|signed\s+off|locked))\b/iu },
]);

// ---------------------------------------------------------------------------
// HARD_STOP — tokens that can NEVER be a claim target and BREAK a leading noun phrase.
// Articles, pronouns, demonstratives/anaphors, conjunctions, prepositions, modals, linking
// verbs, temporal/conditional markers, reported-speech verbs, nominalizations, evidence
// tokens, status-verb roots, admin/coordination nouns, person names. (Compound HEAD nouns
// like gate/core/module are deliberately NOT here — they extend a phrase: "energy gate".)
// ---------------------------------------------------------------------------
const HARD_STOP = new Set([
  // articles / determiners / pronouns / demonstratives / anaphors
  'the', 'this', 'that', 'these', 'those', 'a', 'an', 'its', "it's", 'it', 'their', 'our', 'my', 'your', 'his', 'her',
  'we', 'i', 'you', 'they', 'he', 'she', 'above', 'below', 'following', 'here', 'there', 'former', 'latter',
  // linking / aux verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'now', 'fully', 'already', 'still', 'also',
  // modals
  'will', 'would', 'can', 'could', 'should', 'shall', 'must', 'may', 'might', 'ought',
  // conjunctions / prepositions / temporal-conditional
  'and', 'or', 'but', 'with', 'into', 'in', 'on', 'of', 'to', 'for', 'at', 'as', 'by', 'from', 'all', 'both', 'each',
  'every', 'any', 'no', 'whole', 'if', 'once', 'when', 'after', 'before', 'until', 'while', 'unless', 'although',
  // quantifiers (never a specific target; "after MUCH work" must not anchor "much")
  'much', 'many', 'more', 'most', 'some', 'few', 'fewer', 'several', 'lot', 'lots', 'little', 'less',
  'though', 'since', 'because', 'assuming', 'suppose', 'provided', 'then',
  // reported-speech / definition verbs
  'says', 'said', 'claims', 'claimed', 'notes', 'noted', 'note', 'states', 'stated', 'argues', 'reports', 'reported',
  'means', 'per', 'according',
  // nominalizations (the assertion's object, not its subject)
  'validation', 'verification', 'implementation', 'testing', 'completion', 'integration', 'deployment',
  // evidence tokens
  'tests', 'test', 'mjs', 'js', 'ts', 'cjs', 'json', 'pass', 'passes', 'passing', 'green', 'exit', 'code', 'output',
  // generic / discourse nouns that are never a specific target
  'logic', 'thing', 'tool', 'file', 'path', 'system', 'stuff', 'something', 'everything', 'nothing', 'work',
  'against', 'correctly', 'end', 'catastrophic', 'transitions', 'navigation', 'edge', 'cases', 'environment',
  // round-2 cluster C: negation/attribution heads + bare 'node' that produced `about:`/`nobody:`/`node-…:` junk
  'about', 'node', 'nobody', 'none', 'neither',
  // admin / coordination nouns + person names (red-team: "migration is done", "Marcel hooked up X")
  'migration', 'ticket', 'deploy', 'deployment', 'dashboard', 'feed', 'revision', 'revisions', 'chore', 'task',
  'marcel', 'codex', 'claude', 'owner', 'operator',
  // bare status-verb ROOTS (the multi-word verb PATTERNS miss a lone token)
  'works', 'working', 'verified', 'tested', 'wired', 'live', 'blocks', 'block', 'armed', 'fires', 'enforces',
  'enforce', 'done', 'built', 'implemented', 'complete', 'completed', 'finished', 'shipped', 'ships', 'proven',
  'functional', 'operational', 'ready', 'validated', 'designed', 'planned', 'robust', 'stable', 'solid', 'reliable',
  'flawlessly', 'reliably', 'hooked', 'up',
]);

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

/** Strip invisible / directional-formatting chars and NFKC-normalize (unicode hygiene, cluster F).
 *  Kills the contentHash-churn DoS (ZWJ / RTL override produce the same anchor but differed hash). */
export function sanitizeText(s) {
  // strip zero-width (U+200B–200D, U+FEFF), bidi/directional (U+202A–202E, U+2066–2069),
  // Arabic letter mark (U+061C), then NFKC-normalize. Order: strip BEFORE normalize so the
  // formatting chars cannot survive a normalization that re-expands them.
  return String(s == null ? '' : s)
    .replace(/[​-‍﻿‪-‮⁦-⁩؜]/g, '')
    .normalize('NFKC');
}

function requireClock(nowMs) {
  const n = Number(nowMs);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('prose-claim-extractor: a finite positive nowMs is required (fail-closed clock)');
  }
  return n;
}

/** Stable hash of a claim's SUBSTANCE (sanitized, normalized statement text). Collapses ALL
 *  separators (space/_/-) to a single space so a separator-only edit ("energy gate" → "energy_gate")
 *  is NOT counted as substance churn (round-2 cluster D — false-churn suppression). */
export function statementHash(text) {
  const norm = sanitizeText(text).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

/** Strip markdown noise (links → text, images, fences) that pollutes extraction. */
export function stripMarkdown(line) {
  return String(line || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^```.*$/g, ' ');
}

/** Split prose into candidate statements (SENTENCES only — .!? — not ';', which carries
 *  co-located evidence). Markdown + unicode sanitized first. */
export function segmentStatements(text) {
  const raw = sanitizeText(text);
  const out = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripMarkdown(rawLine);
    const trimmed = line.replace(/^[\s>#*\-|]+/, '').trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Za-z`*_(]|\d)/u);
    for (const p of parts) {
      const s = p.trim();
      if (s.length >= 8) out.push(s);
    }
  }
  return out;
}

function isVerbToken(tok) {
  for (const v of STATUS_VERBS) { v.re.lastIndex = 0; if (v.re.test(tok)) return true; }
  return false;
}
function isStopTarget(tok) {
  const t = String(tok || '').toLowerCase();
  if (!t) return true;
  return HARD_STOP.has(t) || isVerbToken(t);
}

/** Is this statement a non-assertion of the verb at `verbIndex`? Questions are global; future /
 *  conditional / subjunctive / obligation / attribution / definition / reported-speech only
 *  neutralize when they GOVERN the verb (appear in the pre-verb slice). verbIndex omitted →
 *  whole-statement scope (back-compat). */
export function isModal(statement, verbIndex) {
  for (const re of MODALITY_GLOBAL) { re.lastIndex = 0; if (re.test(statement)) return true; }
  const pre = typeof verbIndex === 'number' ? statement.slice(0, verbIndex) : statement;
  for (const re of MODALITY_PREVERB) { re.lastIndex = 0; if (re.test(pre)) return true; }
  if (isLeadingSubordinateClause(pre)) return true; // real leading clause only, not a prep phrase
  REPORTED_SPEECH.lastIndex = 0;
  if (REPORTED_SPEECH.test(pre)) return true;
  return false;
}

/** Does a negator govern this verb, or is the statement a disclaimer / leading negation? */
export function isNeutralized(statement, verbIndex) {
  // leading sentence negation ("Nothing is verified", "None is live", "Not wired") → honest non-claim.
  if (/^\s*(?:nothing|nobody|none|neither|no\s+one|not)\b/iu.test(statement)) return true;
  if (DISCLAIMER.test(statement)) return true;
  const window = statement.slice(Math.max(0, verbIndex - 40), verbIndex);
  return NEGATORS.some((re) => { re.lastIndex = 0; return re.test(window); });
}

/** Canonicalize a target: NFKC, lowercase, collapse ALL separators (-,_,space) to a single '-'
 *  so spelling variants UNIFY (foo-bar = foo_bar = "foo bar") — partition-resistance + identity
 *  stability (red-team cluster D/E). Path → basename without .test/extension. */
export function normalizeTarget(raw) {
  let t = sanitizeText(raw).replace(/`/g, '').trim();
  if (/[\\/]/.test(t) || /\.\w+$/.test(t)) {
    t = path.basename(t).replace(/\.(mjs|js|ts|cjs|json|sh|md)$/i, '').replace(/\.test$/i, '');
  }
  return t.toLowerCase().replace(/[\s_-]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
}

/**
 * Extract the claim's TARGET (subject). Subject-first; compound head nouns are kept
 * ("energy gate" → energy-gate). Function words / pronouns / post-verb objects can NEVER be a
 * target — if extraction lands on junk, return null (drop the claim) rather than anchor garbage.
 */
export function extractTarget(statement, verbIndex) {
  const beforeVerb = statement.slice(0, verbIndex);

  // 1. backtick code-span (first non-stop one).
  const span = /`([^`]+)`/.exec(statement);
  if (span) { const t = normalizeTarget(span[1]); if (t && !isStopTarget(t)) return t; }

  // 2. filename before the verb (not a .test file — that is evidence).
  const fileRe = /\b([\w@-]+(?:\.[\w@-]+)*\.(?:mjs|js|ts|cjs|json|sh))\b/g;
  let fm; let firstFile = null;
  while ((fm = fileRe.exec(beforeVerb)) !== null) {
    if (/\.test\.(?:mjs|js)$/i.test(fm[1])) continue;
    firstFile = fm[1]; break;
  }
  if (firstFile) { const t = normalizeTarget(firstFile); if (t && !isStopTarget(t)) return t; }

  // 3. leading noun phrase: skip leading HARD_STOP, then collect content + compound-head words
  //    (up to 4) until a HARD_STOP or verb. Captures "energy gate", "claim cortex", "retry handler".
  const lead = beforeVerb.replace(/^[^A-Za-z`]*/, '');
  const words = lead.split(/[\s,;:()]+/);
  const phrase = [];
  for (let i = 0; i < words.length && phrase.length < 4; i += 1) {
    const w = words[i].replace(/[^\w-]/g, '');
    if (!w) continue;
    if (isStopTarget(w)) { if (phrase.length) break; else continue; }
    phrase.push(w);
  }
  if (phrase.length) { const t = normalizeTarget(phrase.join('-')); if (t && !isStopTarget(t)) return t; }

  // 4. last resort: first non-stop kebab/snake identifier BEFORE the verb only (never a
  //    post-verb object — that produced `call:`/`hot:` garbage in the red-team).
  const idRe = /\b([a-zA-Z][a-zA-Z0-9]*(?:[-_][a-zA-Z0-9]+)+)\b/g;
  let im;
  while ((im = idRe.exec(beforeVerb)) !== null) {
    const t = normalizeTarget(im[1]);
    if (t && !isStopTarget(t)) return t;
  }
  return null; // no trackable subject — drop rather than anchor junk
}

/** Load circuitry graph node ids once (node-canonical identity). Fail-open to empty. */
let _graphNodeIndex = null;
/** Reset the cached graph index (round-2 cluster D — stale-singleton hazard in tests / re-runs). */
export function resetGraphIndex() { _graphNodeIndex = null; }
export function loadGraphNodeIndex(repoRoot = REPO_ROOT) {
  if (_graphNodeIndex) return _graphNodeIndex;
  const idx = new Map();
  // also index a separator-stripped key so a run-together paraphrase ("memorykernel") still maps
  // to the node ("memory-kernel"); the canonical key always takes precedence on collision.
  const add = (raw, id) => {
    const k = normalizeTarget(raw);
    if (!k) return;
    if (!idx.has(k)) idx.set(k, id);
    const stripped = k.replace(/-/g, '');
    if (stripped.length >= 4 && !idx.has(stripped)) idx.set(stripped, id);
  };
  try {
    const gp = path.join(repoRoot, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json');
    if (existsSync(gp)) {
      const g = JSON.parse(readFileSync(gp, 'utf-8'));
      for (const n of (Array.isArray(g.nodes) ? g.nodes : [])) {
        if (!n || typeof n.id !== 'string') continue;
        add(n.id, n.id);
        // strip a trailing parenthetical label ("Energy Gate (computeU)" → "Energy Gate") before mapping.
        if (typeof n.label === 'string') add(n.label.replace(/\s*\([^)]*\)/g, ' '), n.id);
      }
    }
  } catch { /* fail-open */ }
  _graphNodeIndex = idx;
  return idx;
}

/** Anchor-bound identity: `${target}:${claimType}`, node-id when the (canonicalized) target maps. */
export function anchorIdentity(target, claimType, opts = {}) {
  if (!target || !claimType) return null;
  const idx = opts.graphIndex || loadGraphNodeIndex(opts.repoRoot);
  const nodeId = idx.get(normalizeTarget(target));
  const anchor = nodeId ? `node:${nodeId}` : normalizeTarget(target);
  return `${anchor}:${claimType}`;
}

/** Resolve a referenced path against the repo — fail-closed on traversal / escape (round-2 R2-A1).
 *  A `../../package.json` style ref MUST NOT resolve: it escapes the repo and would let any prose
 *  cite a real file outside the work product as forged evidence. */
function fileExists(ref, repoRoot) {
  try {
    const clean = String(ref).replace(/^node\s+/, '').trim();
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(clean)) return false; // reject any parent-dir segment
    const root = path.resolve(repoRoot);
    const abs = path.resolve(path.isAbsolute(clean) ? clean : path.join(root, clean));
    if (abs !== root && !abs.startsWith(root + path.sep)) return false; // lexical containment
    if (!existsSync(abs) || !statSync(abs).isFile()) return false;
    // realpath containment (codex review 2026-06-13): a symlink INSIDE the repo pointing OUT passes
    // the lexical check but escapes on resolution — re-check the canonical path.
    const realRoot = realpathSync(root);
    const realAbs = realpathSync(abs);
    return realAbs !== realRoot && realAbs.startsWith(realRoot + path.sep);
  } catch { return false; }
}

// Generic tokens that are too common in this repo to prove a file RELATES to a specific target
// (codex review 2026-06-13: "claim" alone bridged claim-router → prose-claim-extractor.test.mjs).
const RELATION_STOP_TOKENS = new Set(['core', 'gate', 'test', 'node', 'module', 'service', 'script', 'file', 'system', 'claim', 'engine', 'kernel', 'handler']);
const relationTokens = (s) => normalizeTarget(s).split('-').filter((t) => t.length >= 3 && !RELATION_STOP_TOKENS.has(t));

/** Does a resolved file RELATE to the claim's target? A file only credits a claim if its basename
 *  shares a ≥3-char token with the target (round-2 R2-A2). Closes "energy-gate verified per
 *  memory-kernel.test.mjs" → ASSERT: an unrelated real test file can no longer launder a claim. */
function fileRelatesToTarget(ref, target) {
  if (!target) return false;
  const base = path.basename(String(ref).replace(/^node\s+/, '').trim())
    .replace(/\.test\.(?:mjs|js)$/i, '').replace(/\.(?:mjs|js|ts|cjs|json|sh|md)$/i, '');
  const baseNorm = normalizeTarget(base);
  const targetNorm = normalizeTarget(target);
  if (baseNorm && baseNorm === targetNorm) return true;                 // exact canonical match
  const fileToks = relationTokens(baseNorm);
  const tgtToks = relationTokens(targetNorm);
  if (!fileToks.length || !tgtToks.length) return false;               // only generic tokens → can't relate
  // a compound target (≥2 meaningful tokens) needs ≥2 shared non-generic tokens; a single-token
  // target needs its one token. Closes the one-generic-token collision (claim-router ⇏ prose-claim-…).
  const shared = fileToks.filter((ft) => tgtToks.includes(ft)).length;
  return shared >= (tgtToks.length >= 2 ? 2 : 1);
}

/**
 * Detect evidence in the statement, RESOLVING file references against the real filesystem
 * (cluster C). Unresolvable file refs are DROPPED. Prose run-output / operator-note signals
 * with no resolvable file in the statement are capped at ADVISORY (research ceiling) — they are
 * unverifiable assertions. When opts.repoRoot is null, resolution is skipped and ALL prose
 * signals are conservatively downgraded to advisory (used by unit tests with no real files).
 */
export function detectEvidence(statement, nowMs, opts = {}) {
  const repoRoot = opts.repoRoot === undefined ? REPO_ROOT : opts.repoRoot;
  const target = opts.target || null;
  const out = [];
  const seen = new Set();
  let hasRelatedTest = false; // a RESOLVED .test.mjs whose basename relates to the target

  // pass 1: file-bearing evidence — resolve AND require relevance to the target. A real file that
  // does not relate to the claim's subject is NOT this claim's evidence (round-2 R2-A2).
  for (const d of EVIDENCE_DETECTORS) {
    if (!d.fileGroup) continue;
    d.re.lastIndex = 0;
    const m = d.re.exec(statement);
    if (!m) continue;
    const ref = m[d.fileGroup] || m[0];
    if (repoRoot && !fileExists(ref, repoRoot)) continue;            // unresolvable → not evidence
    if (repoRoot && target && !fileRelatesToTarget(ref, target)) continue; // unrelated file → not this claim's
    const key = `${d.kind}::${ref}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({ kind: d.kind, capturedAt: nowMs, reference: ref.slice(0, 80) });
    if (d.kind === 'test') hasRelatedTest = true;
  }

  // pass 2: prose-only signals. NO cross-kind bridge (round-2 R2-A3):
  //  - operator_note from prose is unverifiable → ALWAYS advisory (a resolved file can never
  //    upgrade "Marcel confirmed" to operator_validated).
  //  - a runtime_trace signal ("12/12 pass", "exit 0", "PASS") upgrades to runtime_trace ONLY when
  //    a RELATED .test.mjs actually resolved; a passive report / file:line / script-invocation never
  //    bridges prose run-output up to a runtime rung. Otherwise it is advisory.
  for (const d of EVIDENCE_DETECTORS) {
    if (d.fileGroup) continue;
    d.re.lastIndex = 0;
    const m = d.re.exec(statement);
    if (!m) continue;
    const kind = (d.kind === 'runtime_trace' && hasRelatedTest) ? 'runtime_trace' : 'advisory';
    const ref = (m[0] || '').slice(0, 80);
    const key = `${kind}::${ref}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push({ kind, capturedAt: nowMs, reference: ref });
  }
  return out;
}

/** Map one statement to a structured claim, or null. opts: {filePath,nowMs,graphIndex,repoRoot,inferSubjectFromFile} */
export function mapStatementToClaim(statement, opts = {}) {
  const nowMs = requireClock(opts.nowMs);
  for (const v of STATUS_VERBS) {
    v.re.lastIndex = 0;
    const m = v.re.exec(statement);
    if (!m) continue;
    const verbIndex = m.index;
    // modality is scoped to THIS verb's position (round-2 cluster B): a future/conditional/
    // obligation/reported construction only neutralizes when it governs the verb (pre-verb slice).
    if (isModal(statement, verbIndex)) return null;
    if (isNeutralized(statement, verbIndex)) return null;
    let target = extractTarget(statement, verbIndex);
    let subjectInferred = false;
    if (!target) {
      if (opts.inferSubjectFromFile && opts.filePath) {
        target = normalizeTarget(path.basename(String(opts.filePath)));
        subjectInferred = true;
      }
      if (!target || isStopTarget(target)) return null;
    }
    const claimType = v.type;
    const id = anchorIdentity(target, claimType, opts);
    const evidence = detectEvidence(statement, nowMs, { ...opts, target });
    return {
      id,
      target,
      claimType,
      claimedStatus: v.rung,
      contentHash: statementHash(statement),
      evidence,
      _source: { filePath: opts.filePath || null, statement: statement.slice(0, 240), matchedVerb: m[0], subjectInferred },
    };
  }
  return null;
}

/** Extract all claims from prose. Requires a finite nowMs (fail-closed clock). */
export function extractClaims(text, opts = {}) {
  requireClock(opts.nowMs);
  const statements = segmentStatements(text);
  const graphIndex = opts.graphIndex || loadGraphNodeIndex(opts.repoRoot);
  const claims = [];
  for (const s of statements) {
    const c = mapStatementToClaim(s, { ...opts, graphIndex });
    if (c) claims.push(c);
  }
  // De-dup by anchor id: highest claimed rung per anchor wins; evidence merged.
  const byId = new Map();
  for (const c of claims) {
    const key = c.id || `${c.target}:${c.claimType}:${c.contentHash}`;
    const prev = byId.get(key);
    if (!prev) { byId.set(key, c); continue; }
    if (LADDER.indexOf(c.claimedStatus) > LADDER.indexOf(prev.claimedStatus)) {
      c.evidence = mergeEvidence(prev.evidence, c.evidence); byId.set(key, c);
    } else prev.evidence = mergeEvidence(prev.evidence, c.evidence);
  }
  return [...byId.values()];
}

function mergeEvidence(a, b) {
  const seen = new Set(); const out = [];
  for (const e of [...(a || []), ...(b || [])]) {
    const k = `${e.kind}::${e.reference}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Measurement (shadow mode) — pure: metrics from claims + a prior ledger.
// ---------------------------------------------------------------------------

export function measureClaims(claims, opts = {}) {
  const nowMs = requireClock(opts.nowMs);
  const priorClaims = Array.isArray(opts.priorClaims) ? opts.priorClaims : [];
  const snap = cortexSnapshot(claims, { nowMs });

  const byVerdict = {};
  let inversions = 0; let untrackedRetract = 0;
  const aggInversionByTarget = new Map(); // sub-RETRACT inversion depth per target (partition signal)
  const retractsByTarget = new Map();     // RETRACT COUNT per target (metric visibility — cluster D1)
  for (const a of snap.assessments) {
    byVerdict[a.verdict] = (byVerdict[a.verdict] || 0) + 1;
    if (a.inversions > 0) inversions += 1;
    const tgt = anchorTargetOf(a.id);
    if (a.verdict === 'RETRACT') {
      if (a.id == null) untrackedRetract += 1;
      retractsByTarget.set(tgt, (retractsByTarget.get(tgt) || 0) + 1);
    } else if (a.inversions > 0) {
      aggInversionByTarget.set(tgt, (aggInversionByTarget.get(tgt) || 0) + a.inversions);
    }
  }
  const retracts = byVerdict.RETRACT || 0;
  const total = snap.assessments.length;

  const priorHash = new Map();
  for (const c of priorClaims) if (c && c.id) priorHash.set(c.id, c.contentHash);
  let churned = 0; let restated = 0;
  for (const c of claims) {
    if (!c.id || !priorHash.has(c.id)) continue;
    restated += 1;
    if (priorHash.get(c.id) !== c.contentHash) churned += 1;
  }

  const maxAgg = aggInversionByTarget.size ? Math.max(...aggInversionByTarget.values()) : 0;
  const maxRetractsPerTarget = retractsByTarget.size ? Math.max(...retractsByTarget.values()) : 0;

  const metrics = {
    schema: EXTRACTOR_SCHEMA,
    nowMs,
    claimsExtracted: total,
    byVerdict,
    inversions,
    retracts,
    pEmitEstimate: total > 0 ? +(retracts / total).toFixed(4) : 0,
    untrackedRetract,
    maxLadderInversion: snap.maxLadderInversion,
    // Wave-3 partition-gate CALIBRATION signal (advisory, measure-only): the global
    // evidence-kind-weighted unsupported-inversion mass. The soak's per-write time-series of this
    // is what sets `unsupportedMassAddedCap` (honest p99) before the gate's veto is ever armed.
    unsupportedInversionMass: snap.unsupportedInversionMass || 0,
    maxAggregateInversionPerTarget: maxAgg,
    aggregateInversionByTarget: Object.fromEntries(aggInversionByTarget),
    maxRetractsPerTarget,
    retractsByTarget: Object.fromEntries(retractsByTarget),
    restatedAnchors: restated,
    churnedAnchors: churned,
    churnRate: restated > 0 ? +(churned / restated).toFixed(4) : 0,
  };
  return { metrics, claims, assessments: snap.assessments };
}

function anchorTargetOf(id) {
  if (typeof id !== 'string') return '(untracked)';
  const i = id.lastIndexOf(':');
  return i > 0 ? id.slice(0, i) : id;
}

// ---------------------------------------------------------------------------
// Persistence (advisory shadow ledger + metrics log). fs boundary only.
// ---------------------------------------------------------------------------

export function loadShadowLedger() {
  try {
    if (existsSync(SHADOW_LEDGER_PATH)) return JSON.parse(readFileSync(SHADOW_LEDGER_PATH, 'utf-8'));
  } catch { /* fresh */ }
  return { schema: EXTRACTOR_SCHEMA, claims: [] };
}

export function persistShadow(claims, metrics) {
  mkdirSync(SHADOW_DIR, { recursive: true });
  writeFileSync(SHADOW_LEDGER_PATH, JSON.stringify({ schema: EXTRACTOR_SCHEMA, updatedMs: metrics.nowMs, claims }, null, 2));
  appendFileSync(METRICS_PATH, JSON.stringify(metrics) + '\n');
}

/**
 * Merge a prior ledger with new claims by anchor id (highest rung wins, evidence merged).
 * opts (used by the LIVE hook, omitted by the CLI/tests → unchanged behavior):
 *   - nowMs: recency-stamp (`_seenMs`) every claim restated/added in `next` (it was "seen now").
 *   - maxClaims: keep only the most-recently-seen N claims — a BOUNDED ROLLING WINDOW so
 *     measureClaims stays O(N) on the PostToolUse hot path and the shadow ledger file cannot
 *     grow without bound (pre-arm audit blocker, 2026-06-13; also closes the no-eviction residual).
 */
export function mergeLedgers(prior, next, opts = {}) {
  const { nowMs, maxClaims } = opts;
  const freshKeys = new Set();
  for (const c of (next || [])) if (c) freshKeys.add(c.id || `${c.target}:${c.claimType}`);
  const byId = new Map();
  for (const c of [...(prior || []), ...(next || [])]) {
    if (!c) continue;
    const key = c.id || `${c.target}:${c.claimType}`;
    const ex = byId.get(key);
    if (!ex) { byId.set(key, c); continue; }
    const re = LADDER.indexOf(c.claimedStatus) > LADDER.indexOf(ex.claimedStatus) ? c : ex;
    re.evidence = mergeEvidence(ex.evidence, c.evidence);
    if (Number.isFinite(ex._seenMs)) re._seenMs = Math.max(re._seenMs || 0, ex._seenMs);
    byId.set(key, re);
  }
  // recency: a claim present in `next` was seen now; carried-over prior claims keep their stamp.
  if (Number.isFinite(nowMs)) {
    for (const [key, c] of byId) if (freshKeys.has(key)) c._seenMs = nowMs;
  }
  let out = [...byId.values()];
  if (Number.isFinite(maxClaims) && maxClaims > 0 && out.length > maxClaims) {
    // EVICTION HARDENING (red-team 2026-06-13): never recency-evict an INVERTING claim — otherwise a
    // flood of honest writes could age a partition piece out of the window and SUPPRESS the
    // aggregate over-claim signal the Wave-3 gate keys on. Protect inversions>0 claims (assessed
    // once, only on the rare overflow path); bound the protected set by maxClaims too so an
    // inverting-claim flood cannot grow the ledger without bound either.
    const byRecency = (a, b) => (b._seenMs || 0) - (a._seenMs || 0);
    let inverting = null;
    if (Number.isFinite(nowMs)) {
      try {
        const snap = cortexSnapshot(out, { nowMs });
        inverting = new Set();
        for (const a of snap.assessments) if (a && a.inversions > 0 && a.id != null) inverting.add(String(a.id));
      } catch { inverting = null; } // fail-open → pure recency cap
    }
    if (inverting && inverting.size) {
      const keyOf = (c) => String(c.id || `${c.target}:${c.claimType}`);
      const prot = out.filter((c) => inverting.has(keyOf(c))).sort(byRecency).slice(0, maxClaims);
      const rest = out.filter((c) => !inverting.has(keyOf(c))).sort(byRecency).slice(0, Math.max(0, maxClaims - prot.length));
      out = [...prot, ...rest];
    } else {
      out = out.sort(byRecency).slice(0, maxClaims);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI.  reset | extract <path> | measure <paths...> | gate-shadow <path>
// ---------------------------------------------------------------------------

function readFileSafe(p) {
  try {
    const abs = path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
    if (!existsSync(abs) || statSync(abs).isDirectory()) return null;
    return readFileSync(abs, 'utf-8');
  } catch { return null; }
}

function run() {
  const [cmd, ...args] = process.argv.slice(2);
  const nowMs = Date.now();

  if (cmd === 'reset') {
    mkdirSync(SHADOW_DIR, { recursive: true });
    writeFileSync(SHADOW_LEDGER_PATH, JSON.stringify({ schema: EXTRACTOR_SCHEMA, claims: [] }, null, 2));
    writeFileSync(METRICS_PATH, '');
    console.log(`shadow ledger + metrics reset (${path.relative(REPO_ROOT, SHADOW_DIR)})`);
    return;
  }

  if (cmd === 'extract') {
    const text = readFileSafe(args[0]);
    if (text == null) { console.error(`cannot read ${args[0]}`); process.exit(2); }
    console.log(JSON.stringify(extractClaims(text, { filePath: args[0], nowMs }), null, 2));
    return;
  }

  if (cmd === 'measure') {
    if (!args.length) { console.error('usage: prose-claim-extractor measure <paths...>'); process.exit(2); }
    const all = []; let filesRead = 0;
    for (const p of args) {
      const text = readFileSafe(p);
      if (text == null) continue;
      filesRead += 1;
      all.push(...extractClaims(text, { filePath: p, nowMs }));
    }
    const prior = loadShadowLedger();
    const { metrics, claims, assessments } = measureClaims(all, { nowMs, priorClaims: prior.claims });
    metrics.filesRead = filesRead;
    persistShadow(claims, metrics);
    console.log('=== PROSE-CLAIM EXTRACTOR — advisory measurement (NOT enforcing) ===');
    console.log(`files read: ${filesRead}   claims extracted: ${metrics.claimsExtracted}`);
    console.log('verdict breakdown:', JSON.stringify(metrics.byVerdict));
    console.log(`P_emit estimate (RETRACT / claims): ${metrics.pEmitEstimate}  (${metrics.retracts}/${metrics.claimsExtracted})`);
    console.log(`max ladder inversion: ${metrics.maxLadderInversion}   max sub-RETRACT aggregate/target: ${metrics.maxAggregateInversionPerTarget}   max RETRACTs/target: ${metrics.maxRetractsPerTarget}`);
    console.log(`untracked RETRACTs (must be ~0): ${metrics.untrackedRetract}`);
    console.log(`veto-storm: restated ${metrics.restatedAnchors}, churned ${metrics.churnedAnchors}, churn-rate ${metrics.churnRate}`);
    if (metrics.retracts > 0) {
      console.log('\n--- sample over-claims (RETRACT) ---');
      for (const a of assessments.filter((x) => x.verdict === 'RETRACT').slice(0, 8)) {
        const c = claims.find((x) => x.id === a.id) || {};
        console.log(`  [${a.id}] claimed=${a.claimedStatus} evidence=${a.evidenceStatus} Δ=${a.deltaRank}  "${(c._source?.statement || '').slice(0, 90)}"`);
      }
    }
    console.log(`\nshadow ledger: ${path.relative(REPO_ROOT, SHADOW_LEDGER_PATH)}   metrics: ${path.relative(REPO_ROOT, METRICS_PATH)}`);
    return;
  }

  if (cmd === 'gate-shadow') {
    const text = readFileSafe(args[0]);
    if (text == null) { console.error(`cannot read ${args[0]}`); process.exit(2); }
    const prior = loadShadowLedger();
    const next = extractClaims(text, { filePath: args[0], nowMs });
    const merged = mergeLedgers(prior.claims, next);
    const g = gateClaimTransition(prior.claims, merged, { nowMs, maxLadderInversionCap: 1 });
    console.log('=== gateClaimTransition SHADOW verdict (advisory; cap=1) ===');
    console.log(JSON.stringify({ accept: g.accept ?? g.result?.accept, reason: g.reason }, null, 2));
    return;
  }

  console.error('usage: prose-claim-extractor <reset|extract|measure|gate-shadow> <paths...>');
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
