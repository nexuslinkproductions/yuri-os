#!/usr/bin/env node
/**
 * transfer-distance.mjs — Mechanism-Bridged Transfer Surprise (MBTS).
 *
 * Quantifies a CROSS-DOMAIN TRANSFER as a TRIANGLE, not a dyad:
 *
 *        A  (source domain)          B  (target domain)
 *         \                         /
 *          \____  M (mechanism) ___/
 *
 * Marcel's ask: "the degree of how far something is pulled from a different domain and
 * applied." The high-value innovation is NOT the nearest transfer and NOT the most alien
 * one — it is the FARTHEST leap whose mechanism still HOLDS on both sides. This module
 * measures exactly that and is the degree-layer the cross-reference engine's previously-
 * BINARY bridge detector (`bucket.domains.length > 1`) was missing.
 *
 * ── THE FORGE (why this is new, not a re-skin of the three lane proposals) ─────────────
 * Three independent designs (DeepSeek/math, Kimi/wiring, Codex/adversarial) + this lane
 * converged on the triangle. The genuinely new commitments, each a deliberate rule-break:
 *
 *  1. DISTANCE IS NOT TAMED — IT IS GATED ON RECONSTRUCTION. The conventional move
 *     (Codex's inverted-U 4·d(1−d); DeepSeek's monotone-decreasing value) PENALISES far
 *     transfers because "absurdly far is usually broken." That fights the thesis: a far
 *     transfer that HOLDS is the whole point. We do not penalise distance. We require the
 *     mechanism M to RECONSTRUCT against BOTH sides (the bridge term); a far-but-broken
 *     transfer dies at the bridge/gate, never at the distance. So far+holding ranks TOP.
 *
 *  2. CO-OCCURRENCE (NPMI) IS DEMOTED FROM DISTANCE-CORE TO A NOVELTY DISCOUNT. DeepSeek's
 *     knife: NPMI over OUR corpus measures "what Marcel already wrote about connecting,"
 *     not structural domain-distance — and it is circular, because the engine's job is to
 *     surface NOT-yet-connected things. Using "not yet co-occurring" as distance is
 *     measuring the answer with the question. So the structural distance core is MDL
 *     (gzip compression), which is corpus-independent; NPMI, if used at all, only DISCOUNTS
 *     already-known links (optional layer, off by default, externalise the source side to
 *     break the self-dealing loop — not implemented here, documented as the upgrade path).
 *
 *  3. THE BRIDGE IS THE MIN OF TWO RECONSTRUCTIONS, NOT AN AVERAGE. M must compress
 *     against the WEAKER side. A mechanism that explains the source but not the target
 *     (or vice-versa) is vocabulary theater — the min kills it; an average would launder it.
 *
 * ── THE METRIC ─────────────────────────────────────────────────────────────────────────
 *   distance(A,B)   = 0.6·NCD(A,B) + 0.4·jaccardDistance(tok A, tok B)      ∈ [0,1]
 *   recon(M,X)      = 1 − NCD(M,X)                                          ∈ [0,1]
 *   bridge(A,M,B)   = min( recon(M,A), recon(M,B) )                         ∈ [0,1]
 *   valueRaw        = distance · bridge · structuralConf                    ∈ [0,1]
 *   value           = antiTheaterGate(valueRaw, signals)                    ∈ [0,1]
 *
 * value is monotone-increasing in BOTH distance and bridge: far AND holding ⇒ high.
 * near (low distance) ⇒ low. far-but-unbridged (theater) ⇒ killed by min-bridge + gate.
 *
 * NCD (Normalized Compression Distance, Cilibrasi-Vitányi 2005) is the computable,
 * embedding-free Kolmogorov-distance proxy — honours the no-RAG/FTS5-only house law.
 * Built on the same gzip primitive as the memory MDL axis ([[yuri-mdl]] / catalog card 14);
 * Jaccard is catalog card 30's set-overlap. The distance engine is itself assembled from
 * logbook transfers and is validated ON the logbook — recursive and self-consistent.
 *
 * Pure + injectable: node:zlib only, no I/O, no clock, no config read. Mirrors the house
 * style of yuri-mdl.mjs / yuri-fsrs.mjs so it is unit-testable in isolation. Deterministic
 * (gzip level pinned). Advisory only — a ranking/retrieval aid, never a sole promotion gate.
 */
import { gzipSync } from 'node:zlib';

const GZIP_LEVEL = 6; // pinned for cross-version determinism (matches yuri-mdl.mjs)

// Below this many trimmed chars an input is too small for gzip to assert structure — the
// header overhead dominates and NCD is spurious. Return a neutral sentinel so a tiny input
// can neither inflate distance nor false-bridge. (Same discipline as yuri-mdl DEFAULT_QUALITY_FLOOR.)
// @capability: transfer-distance
// @serves: cross-domain transfer distance | how far is mechanism A from domain B | mechanism-bridged transfer surprise | is this analogy real | source target mismatch score
// @does: NEXUS CORE Mechanism-Bridged Transfer Surprise (MBTS) — scores the distance/surprise of transferring a mechanism across domains (the numeric "mismatch" for an analogy); MDL+Jaccard blend, prereq-blocked gate
// @use: when mapping a mechanism across domains (the persona's source/target/mismatch/confidence discipline) quantify the mismatch instead of guessing; feeds izanagi cross-domain branch scoring
// @exports: detectPrereqBlocked, tokenize, DISTANCE_WEIGHTS, GATE, MIN_CHARS
export const MIN_CHARS = 60;

// Distance blend: MDL structural core dominant, Jaccard a stabilising corroborant for the
// short-text regime where gzip-NCD alone is noisy.
export const DISTANCE_WEIGHTS = Object.freeze({ ncd: 0.6, jaccard: 0.4 });

// Anti-theater gate thresholds (fail-CLOSED — distance alone NEVER promotes).
export const GATE = Object.freeze({
  BRIDGE_FLOOR: 0.35,        // below this, the mechanism doesn't reconstruct → theater
  CAP_THEATER: 0.30,         // value ceiling when bridge < BRIDGE_FLOOR
  CAP_NO_MISMATCH: 0.35,     // a transfer whose named mismatch can't be stated is unproven
  CAP_LOW_STRUCT: 0.45,      // structural confidence below MEDIUM caps reachable value
  STRUCT_FLOOR: 0.5,         // structuralConf < this == "LOW"
  FAR_WEAK_DIST: 0.75,       // far ...
  FAR_WEAK_BRIDGE: 0.55,     // ...but weakly bridged ...
  CAP_FAR_WEAK: 0.25,        // ...is capped (far novelty without strong reconstruction)
  CAP_PREREQ_BLOCKED: 0.11,  // a transfer whose mismatch names a HARD unbuilt prerequisite is not
                             // yet implementation-VIABLE → capped below USEFUL (BLOCKED tier).
  CAP_LOW_QUALITY: 0.11,     // sub-minimum/no-signal input cannot certify any tier (fail-closed);
                             // keep both 0.11 caps < TIER.USEFUL if either band moves.
});

// Value → tier banding (set from the logbook proof; see transfer-distance.proof.mjs).
export const TIER = Object.freeze({ INNOVATION: 0.30, USEFUL: 0.12 });

// IMPLEMENTATION-VIABILITY gate (red-team round 2; STRUCTURED-DETECTOR upgrade r3): the metric
// scores structural transfer-VALUE, but a transfer with a missing IMPLEMENTATION PREREQUISITE is
// not yet buildable (MPC needs an unbuilt transition fn; VCG needs a dependency DAG). The
// prerequisite is stated in the card's MISMATCH text — detect that hard-blocker language and route
// the transfer to a BLOCKED tier so a great-but-not-yet-buildable idea no longer ranks INNOVATION.
//
// r3 replaces the brittle literal whitelist (which a 6/6 paraphrase barrage EVADED — "has not been
// implemented yet", "absent today", "is missing", "we must construct", "no … in place", "is not
// implemented" — and which over-fired on 3/3 prose controls). The structured detector splits the
// text into CLAUSES, skips any clause stating the artifact is ALREADY present (satisfied), then
// blocks on: explicit "hard prerequisite"; a VCG-style "no (input)(data) until X" data dependency;
// or a CONCRETE SYSTEM ARTIFACT bound (by proximity, not mere co-occurrence) to an unbuilt-state
// ("X is not implemented / is missing / absent / does not exist / not in place") or a future-build
// ("X must be built", "must construct the X"). Proximity-binding is what lets "trust must be built
// first before teams accept the workflow" PASS (the artifact 'workflow' is not the thing being
// built) while "the schema must be created" BLOCKS. Validated by the prereq-barrage test
// (transfer-distance.prereq.test.mjs — run it for the current case count; 24/24 at 2026-06-10)
// incl. the 6 evasions, 3 over-fire controls, and the
// real cards 22/35 (→BLOCK) + 30/23 (→PASS). It catches STATED prerequisites; a silently-missing
// one is not detectable. Deterministic; runs over the structured MISMATCH/RISK field.
const PREREQ_ART = '(?:adapter|api|backend|cache|channel|checkpoint|client|config|connector|contract|corpus|dataset|dependency|dag|edge|engine|feature|field|file|function|graph|hook|index|input|interface|lane|layer|ledger|mapper|mapping|metric|model|module|parser|pipeline|registry|router|runtime|schema|script|service|signal|state|store|stream|system|table|transition function|validator|worker|workflow)';
const PREREQ_SATISFIED = /\b(?:already|currently|now)\b[^.;]*\b(?:holds?|exists?|implemented|built|in place|satisfied|available|works?)\b|\bnot\s+(?:a\s+)?blocker\b|\balready satisfied\b/i;
const PREREQ_HARD = /\bhard prerequisite\b/i;
const PREREQ_NO_INPUT = /\bno\s+(?:input\s+)?(?:data\s+)?until\b|\bno\s+input\b[^.;]*\buntil\b/i;
const PREREQ_WORD = /\bprerequisite\b/i;
const PREREQ_ART_UNBUILT = new RegExp(
  PREREQ_ART + '\\s+(?:\\w+\\s+){0,2}(?:is|are|was|were|has|have)\\s+(?:not\\s+(?:yet\\s+)?(?:been\\s+)?(?:implemented|built|created|constructed|wired|scaffolded|in place|available)|missing|absent)'
  + '|' + PREREQ_ART + '\\s+(?:\\w+\\s+){0,2}does\\s+not\\s+exist'
  + '|\\b(?:no|without)\\s+(?:\\w+\\s+){0,3}' + PREREQ_ART + '\\s+(?:in place|yet|available|exists?)\\b', 'i');
const PREREQ_ART_FUTURE = new RegExp(
  PREREQ_ART + '\\s+(?:\\w+\\s+){0,2}(?:must|needs?\\s+to|has\\s+to|have\\s+to|required\\s+to)\\s+(?:first\\s+)?be\\s+(?:implemented|built|created|constructed|wired|scaffolded|added)'
  + '|\\b(?:must|need\\s+to|needs?\\s+to|we\\s+must|we\\s+need\\s+to|required\\s+to)\\s+(?:first\\s+)?(?:implement|create|construct|wire|scaffold|build|add)\\s+(?:a|an|the)?\\s*(?:\\w+\\s+){0,2}' + PREREQ_ART, 'i');
/** Split MISMATCH/RISK text into clauses (sentence/dash/contrast boundaries) for per-clause analysis. */
function prereqClauses(text) {
  return String(text || '').toLowerCase()
    .split(/[.;\n]|\s[—–-]\s|\s+but\s+|\s+however\s+/i)
    .map((s) => s.trim()).filter(Boolean);
}
export function detectPrereqBlocked(mismatchText) {
  for (const s of prereqClauses(mismatchText)) {
    if (PREREQ_SATISFIED.test(s)) continue;                                    // artifact already present → not a blocker
    if (PREREQ_HARD.test(s)) return true;                                      // explicit "hard prerequisite"
    if (PREREQ_NO_INPUT.test(s)) return true;                                  // VCG-style data dependency
    if (PREREQ_WORD.test(s) && (PREREQ_ART_UNBUILT.test(s) || PREREQ_ART_FUTURE.test(s))) return true; // "prerequisite" + unbuilt/future
    if (PREREQ_ART_UNBUILT.test(s)) return true;                               // artifact stated unbuilt/missing
    if (PREREQ_ART_FUTURE.test(s)) return true;                                // artifact must-be-built
  }
  return false;
}

function gzipLen(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return gzipSync(Buffer.from(text, 'utf8'), { level: GZIP_LEVEL }).length;
}

export function tokenize(text) {
  // Unicode letters+digits (owner decision D12) — Greek/CJK prose (89 live
  // logbook lines) is no longer erased to ∅/identity-failure. INSULATION: the V2
  // path stays drift-free TODAY because STRUCT_STEMS prefix-matching and
  // FIELD_LEXICONS terms are ASCII (non-Latin tokens match nothing) and mechStem
  // re-strips [^a-z0-9] — a future non-ASCII lexicon changes that equation.
  // Accented-Latin membership changes ('café' now survives whole). yuri-jaccard's
  // tokenize is deliberately untouched (Rust conformance pin).
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/**
 * Jaccard DISTANCE over token sets: 1 − |A∩B|/|A∪B|. Empty ∪ → 1 (maximally distant).
 */
export function jaccardDistance(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : 1 - inter / union;
}

/**
 * Normalized Compression Distance via gzip. Symmetrized (min over both
 * concatenation orders — the tighter Kolmogorov upper bound), ∈ [0,1] after clamp.
 *   NCD(x,y) = (C(xy) − min(C(x),C(y))) / max(C(x),C(y))
 * 0 ≈ x,y share structure (y compresses into x); 1 ≈ no shared structure.
 * Returns { ncd, lowQuality } — lowQuality when either side is below MIN_CHARS (ncd = 0.5 sentinel).
 */
export function ncd(x, y, { minChars = MIN_CHARS } = {}) {
  const a = typeof x === 'string' ? x : '';
  const b = typeof y === 'string' ? y : '';
  if (a.trim().length < minChars || b.trim().length < minChars) {
    return { ncd: 0.5, lowQuality: true };
  }
  const cx = gzipLen(a);
  const cy = gzipLen(b);
  // min over both orders — canonical NCD symmetrization (newline so two bodies
  // don't fuse a boundary token); gzip concat length is order-dependent.
  const cxy = Math.min(gzipLen(a + '\n' + b), gzipLen(b + '\n' + a));
  const denom = Math.max(cx, cy);
  if (denom === 0) return { ncd: 0.5, lowQuality: true };
  const raw = (cxy - Math.min(cx, cy)) / denom;
  return { ncd: Math.max(0, Math.min(1, raw)), lowQuality: false };
}

/**
 * Reconstruction of mechanism M against context X: how much M compresses into X.
 * recon = 1 − NCD(M, X). High ⇒ M's structure is present in X ⇒ the mechanism lives there.
 */
export function recon(mechanism, context, opts = {}) {
  // recon (the BRIDGE axis) uses reconFn — distinct from the DISTANCE axis (distFn), since
  // distance = how far the FIELDS are, while bridge = does the MECHANISM reconstruct on each
  // side. V2 sets distFn=field-distance, reconFn=operator-skeleton. Falls back to distFn then V1.
  const m = (opts.reconFn || opts.distFn || v1BlendMetric)(mechanism, context, opts);
  return { recon: 1 - m.d, lowQuality: m.lowQuality };
}

/**
 * THE PLUGGABLE METRIC CONTRACT.  metric(x, y, opts) -> { d, lowQuality, ...signals }
 *   d ∈ [0,1]: 0 = identical STRUCTURE, 1 = maximally different. Deterministic, pure.
 *   V2 runs TWO DISTINCT axes: the DISTANCE axis (opts.distFn) measures how far the
 *   FIELDS are and MAY be unary — fieldDistance deliberately does not classify the
 *   target (cores.mjs "We deliberately do NOT classify y"), so d(x,x)=0 identity is
 *   NOT guaranteed for distFn. The BRIDGE axis (opts.reconFn) is binary — does the
 *   MECHANISM reconstruct on each side — and '0 = identical structure' holds there.
 *
 * V1 default (proved structurally blind — kept only as the fallback/baseline):
 *   0.6·NCD_gzip + 0.4·Jaccard.
 */
export function v1BlendMetric(x, y, opts = {}) {
  const { ncd: nd, lowQuality } = ncd(x, y, opts);
  const jd = jaccardDistance(x, y);
  const d = Math.max(0, Math.min(1, DISTANCE_WEIGHTS.ncd * nd + DISTANCE_WEIGHTS.jaccard * jd));
  return { d, lowQuality, ncd: nd, jaccard: jd };
}

/**
 * domain DISTANCE via the active metric (opts.distFn overrides the V1 blend). ∈ [0,1].
 */
export function distance(aText, bText, opts = {}) {
  const m = (opts.distFn || v1BlendMetric)(aText, bText, opts);
  return { distance: Math.max(0, Math.min(1, m.d)), ncd: m.ncd, jaccard: m.jaccard, lowQuality: m.lowQuality, signals: m };
}

/**
 * bridge: does M reconstruct from BOTH sides? min of the two reconstructions (weakest gates).
 * Uses the SAME active metric: recon(M,X) = 1 − metric(M,X).d.
 */
export function bridge(mechanismText, aText, bText, opts = {}) {
  const ra = recon(mechanismText, aText, opts);
  const rb = recon(mechanismText, bText, opts);
  return {
    bridge: Math.min(ra.recon, rb.recon),
    reconSource: ra.recon,
    reconTarget: rb.recon,
    lowQuality: ra.lowQuality || rb.lowQuality,
  };
}

/**
 * Fail-CLOSED anti-theater gate. Applies the strictest applicable cap. Distance never
 * promotes on its own. Returns { value, gated, reason }.
 */
export function antiTheaterGate(valueRaw, { bridgeVal, mismatchPresent, structuralConf, dist, hasMechanism, prereqBlocked, lowQuality }) {
  if (!hasMechanism) return { value: 0, gated: true, reason: 'no-mechanism' };
  // RED-TEAM fix: coerce non-finite inputs to 0 — `NaN ?? 0` is NaN (not nullish) and `NaN < x`
  // is false, which let a NaN structuralConf bypass the low-struct cap and propagate NaN to value.
  // RED-TEAM round-2 fix: coerce ALL non-finite inputs (bridgeVal/dist too, not just sc/valueRaw)
  // — NaN bridge/dist made `NaN < floor` false, bypassing the theater/far-weak caps.
  const sc = Number.isFinite(structuralConf) ? structuralConf : 0;
  const vr = Number.isFinite(valueRaw) ? Math.max(0, valueRaw) : 0;
  const bv = Number.isFinite(bridgeVal) ? bridgeVal : 0;
  const dv = Number.isFinite(dist) ? dist : 0;
  let cap = 1;
  let reason = 'ungated';
  const apply = (c, r) => { if (c < cap) { cap = c; reason = r; } };
  if (bv < GATE.BRIDGE_FLOOR) apply(GATE.CAP_THEATER, 'bridge<floor:theater');
  if (!mismatchPresent) apply(GATE.CAP_NO_MISMATCH, 'no-named-mismatch');
  if (sc < GATE.STRUCT_FLOOR) apply(GATE.CAP_LOW_STRUCT, 'structural<MEDIUM');
  if (dv > GATE.FAR_WEAK_DIST && bv < GATE.FAR_WEAK_BRIDGE) apply(GATE.CAP_FAR_WEAK, 'far-but-weakly-bridged');
  if (prereqBlocked) apply(GATE.CAP_PREREQ_BLOCKED, 'prerequisite-blocked'); // not yet implementation-viable
  if (lowQuality) apply(GATE.CAP_LOW_QUALITY, 'low-quality-input'); // sub-evidence input cannot certify
  const value = Math.min(vr, cap);
  return { value, gated: value < vr, reason: value < vr ? reason : 'ungated', cap };
}

export function tierOf(value) {
  if (value >= TIER.INNOVATION) return 'INNOVATION';
  if (value >= TIER.USEFUL) return 'USEFUL';
  return 'NEAR_OR_THEATER';
}

/**
 * Full Mechanism-Bridged Transfer Surprise score for one transfer triangle.
 *
 * @param {object} t
 * @param {string} t.sourceText      source-domain text (theory + borrowed mechanism)
 * @param {string} t.targetText      target-organ text (YURI subsystem + the transfer)
 * @param {string} t.mechanismText   the shared mechanism description (M)
 * @param {number} [t.structuralConf=1] structural-mapping confidence in [0,1]
 * @param {boolean} [t.mismatchPresent=false] is a specific named mismatch/risk stated?
 * @returns {{distance,bridge,valueRaw,value,tier,gate,signals}}
 */
export function transferScore(t, opts = {}) {
  const sourceText = String(t.sourceText || '');
  const targetText = String(t.targetText || '');
  const mechanismText = String(t.mechanismText || '');
  // RED-TEAM fix: clamp to the documented [0,1] — an unclamped negative conf produced value<0
  // (the gate only caps, never raises), and conf>1 produced valueRaw>1, both breaking the contract.
  const structuralConf = Number.isFinite(t.structuralConf) ? Math.max(0, Math.min(1, t.structuralConf)) : 1;
  const mismatchText = String(t.mismatchText || '');
  const mismatchPresent = !!t.mismatchPresent || mismatchText.trim().length > 20;
  // IMPLEMENTATION-VIABILITY: mismatch names a hard unbuilt prerequisite → not yet buildable.
  const prereqBlocked = detectPrereqBlocked(mismatchText);
  const hasMechanism = mechanismText.trim().length >= MIN_CHARS;

  const d = distance(sourceText, targetText, opts);
  const br = hasMechanism
    ? bridge(mechanismText, sourceText, targetText, opts)
    : { bridge: 0, reconSource: 0, reconTarget: 0, lowQuality: true };

  // RED-TEAM fix: finite-guard so a pluggable metric returning NaN can't propagate to value.
  const fin = (x) => (Number.isFinite(x) ? x : 0);
  d.distance = fin(d.distance); br.bridge = fin(br.bridge);
  br.reconSource = fin(br.reconSource); br.reconTarget = fin(br.reconTarget); // RED-TEAM r2: signals NaN-guard
  const valueRaw = fin(d.distance * br.bridge * structuralConf);
  const gate = antiTheaterGate(valueRaw, {
    bridgeVal: br.bridge,
    mismatchPresent,
    structuralConf,
    dist: d.distance,
    hasMechanism,
    prereqBlocked,
    lowQuality: !!(d.lowQuality || br.lowQuality),
  });

  return {
    distance: d.distance,
    bridge: br.bridge,
    valueRaw,
    value: gate.value,
    // Tier chain — precedence BLOCKED > LOW_QUALITY > condition-keyed demotion.
    // Demotion keys on the gating CONDITIONS (not on whether a cap happened to
    // bind): an INNOVATION-band value under a theater bridge, an unstated
    // mismatch, or sub-MEDIUM structure is by definition not proven innovation —
    // keying on gate.gated alone left the sub-cap band minting INNOVATION and
    // inverted ranks (higher raw evidence → lower tier). LOW_QUALITY includes the
    // !hasMechanism relabel (every empty/short-mechanism transfer) — named,
    // accepted widening.
    tier: prereqBlocked ? 'BLOCKED'
      : (d.lowQuality || br.lowQuality) ? 'LOW_QUALITY'
      : (br.bridge < GATE.BRIDGE_FLOOR && tierOf(gate.value) === 'INNOVATION') ? 'NEAR_OR_THEATER'
      : ((!mismatchPresent || structuralConf < GATE.STRUCT_FLOOR) && tierOf(gate.value) === 'INNOVATION') ? 'USEFUL'
      : tierOf(gate.value),
    gate,
    signals: {
      ncd: d.ncd,
      jaccard: d.jaccard,
      reconSource: br.reconSource,
      reconTarget: br.reconTarget,
      structuralConf,
      mismatchPresent,
      prereqBlocked,
      lowQuality: d.lowQuality || br.lowQuality,
    },
  };
}

// Tiny self-demo (not the proof — that's transfer-distance.proof.mjs over the 36-card logbook).
if (import.meta.url === `file://${process.argv[1]}`) {
  const near = transferScore({
    sourceText: 'A scalar adaptive recursive estimator that predicts then updates an innovation variance, folding each sample weighted by measurement noise to track a drifting mean signal over time.',
    targetText: 'Salience surprise band: replace the static median plus K times MAD outlier rule on the energy delta stream with an adaptive self-scaling innovation gate that re-sensitises after a spike.',
    mechanismText: 'A one-dimensional estimator with a self-propagated innovation variance that auto-widens then re-tightens, gating surprise on a normalised innovation above a tail threshold.',
    structuralConf: 1.0, mismatchPresent: true,
  });
  const far = transferScore({
    sourceText: 'Algebraic topology: persistent homology sweeps a threshold over edge weights via union-find and emits a beta-zero persistence barcode where long bars are stable clusters and short bars are coincidence.',
    targetText: 'Memory governance: cluster memories for consolidation by sweeping a filtration over recall-strength edges, feeding persistence-stable multi-memory components as consolidation candidates and early-dying ones to cold store.',
    mechanismText: 'Sweep a threshold over edge weights via union-find, emit a persistence diagram; long-lived components are stable structure, short-lived isolated components are junk.',
    structuralConf: 0.6, mismatchPresent: true,
  });
  console.log(JSON.stringify({ near, far }, null, 2));
}
