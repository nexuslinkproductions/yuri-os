// xref-provenance.mjs — SHARED confidence + provenance model for the YURI cross-ref engine.
//
// WHY THIS IS SHARED (single source of truth):
//   XREF-01's xref-query.mjs (query) and the future propagation-scan both import scoreHit/gateHit
//   so the two organs grade hits IDENTICALLY. If each invented its own confidence model they would
//   diverge and the queue would stop being trustworthy. Build it once, here.
//
// THE FAILURE MODE THIS GATES — "mechanism-fit theater":
//   Lexical overlap surfacing VOCABULARY-twins (same words) as MECHANISM-twins (same behaviour)
//   until the queue floods with junk and trust dies. The containing gate is a graded model where
//   PROVENANCE DETERMINES CONFIDENCE, and a low-confidence hit must NAME a human-readable mismatch
//   (why-it-is-a-twin) or it is auto-suppressed to a sub-log. This is the Semgrep negative-fixture
//   discipline (three-seams SEAM-1) applied at query time.
//
// CONFIDENCE RULES (grounded in the verified surface reality):
//   1. GITNEXUS structural call-graph hit  -> HIGH 0.8..1.0
//        BUT multiply by stalenessPenalty (0.6) if the gitnexus index is behind HEAD.
//        A structural claim on a stale graph is NOT high-confidence.
//   2. GRAPH 1-hop neighbor on a calls|reads edge -> MED 0.55..0.75.
//        `writes` edges are EXCLUDED (verified data-flow != shared mechanism). Returns null —
//        a writes neighbor is NEVER surfaced as a sibling. Census: calls:77 reads:31 writes:45.
//   3. FTS5 / lexical-only, no structural corroboration -> LOW <0.55, requireMismatch:true.
//        The caller MUST name the specific shared mechanism in provenance.mismatch or the hit is
//        routed to the low-confidence sub-log, never the main surface.
//
// FAIL-CLOSED: malformed / out-of-contract inputs do not silently produce a high-confidence hit.
//   scoreHit throws on unrecognized surface; gateHit suppresses anything it cannot prove safe.
//
// The 0.55 floor and 0.6 staleness penalty are TUNABLE NEURO-KNOBS (XREF_PROVENANCE_KNOBS below),
// not hardcoded magic — mirrors _SYSTEM/SELF/energy-weights.json. A future tuning cockpit persists here.

/**
 * Tunable knob surface for the provenance/confidence model.
 * Frozen so a caller cannot mutate the gate at runtime.
 *
 * ranges:
 *   confidenceFloor   finite, 0<x<1   — the LOW/MED boundary. Below it a hit needs a named mismatch.
 *   stalenessPenalty  finite, 0<x<=1  — multiplier applied to a structural hit when the index is stale.
 *   structuralBand    [lo,hi] in (floor,1] — gitnexus-structural confidence band before staleness.
 *   neighborBand      [lo,hi] with lo===floor — graph-neighbor (calls|reads) confidence band.
 *   lexicalCeiling    finite, <floor  — the highest a lexical-only hit may reach.
 */
export const XREF_PROVENANCE_KNOBS = Object.freeze({
  confidenceFloor: 0.55,
  stalenessPenalty: 0.6,
  structuralBand: Object.freeze([0.8, 1.0]),
  neighborBand: Object.freeze([0.55, 0.75]),
  lexicalCeiling: 0.5,
});

export const EVIDENCE_KIND = Object.freeze({
  STRUCTURAL: 'gitnexus-structural',
  NEIGHBOR: 'graph-neighbor',
  LEXICAL: 'lexical-only',
});

// wave-2 R.18: the single token floor shared by FTS5 buildMatch (yuri-search.mjs)
// and xref tokenize (xref-query.mjs). Before unification, 2-char tokens (ai, ml,
// db, id) hit FTS5 but were invisible to the graph/spectrum/gitnexus legs — the
// surfaces disagreed about what a query even contained. 2-char lookups remain
// possible via FTS5 phrase search ("ai").
export const TOKENIZE_MIN_LENGTH = 3;

// Edge kinds that count as a shared-mechanism sibling. `writes` is deliberately absent:
// a verified data-flow write is NOT evidence of a shared mechanism.
const SIBLING_EDGE_KINDS = new Set(['calls', 'reads']);

function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// Map a 0..1 lexical/quality signal into a [lo,hi] band. Non-finite -> band low (fail-low, never fail-high).
function projectIntoBand(signal, [lo, hi], knobs = XREF_PROVENANCE_KNOBS) {
  const s = clamp(Number.isFinite(signal) ? signal : 0, 0, 1);
  return lo + s * (hi - lo);
}

/**
 * scoreHit — assign evidenceKind + confidence + stale to a candidate hit from its provenance signals.
 *
 * @param {object} input
 * @param {string} input.surface         'gitnexus-structural' | 'graph-neighbor' | 'lexical-only'
 * @param {boolean} [input.structuralMatch]  for gitnexus-structural: was a structural match actually found
 * @param {string} [input.edgeKind]      for graph-neighbor: 'calls' | 'reads' | 'writes'
 * @param {number} [input.lexicalScore]  0..1 quality signal (BM25-normalized) used to place within the band
 * @param {boolean} [input.gitnexusStale] index behind HEAD -> staleness penalty for structural hits
 * @param {object}  [knobs]              tunable overrides (defaults to XREF_PROVENANCE_KNOBS)
 * @returns {{evidenceKind:string, confidence:number, stale:boolean, requireMismatch?:boolean} | null}
 *   null === do NOT surface as a sibling (writes-edge neighbor).
 */
export function scoreHit(input = {}, knobs = XREF_PROVENANCE_KNOBS) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('scoreHit: input must be an object');
  }
  const { surface, structuralMatch, edgeKind, lexicalScore, gitnexusStale } = input;
  const floor = knobs.confidenceFloor;

  switch (surface) {
    case EVIDENCE_KIND.STRUCTURAL: {
      // A structural surface MUST carry an EXPLICIT structuralMatch===true. Any other value
      // (false, undefined, null, 0, '', non-boolean) is a contract violation — fail CLOSED, do
      // NOT silently promote into the HIGH band. Returns null (not a sibling). The old
      // `=== false` form was fail-OPEN: every non-false value (incl. undefined) laundered to HIGH.
      if (structuralMatch !== true) return null;
      let confidence = projectIntoBand(lexicalScore, knobs.structuralBand, knobs);
      const stale = gitnexusStale === true;
      if (stale) confidence *= knobs.stalenessPenalty;
      // After a staleness penalty the value can dip below the floor; that is intentional — a stale
      // structural claim is no longer "high". Clamp to [0,1] for schema-safety.
      confidence = clamp(confidence, 0, 1);
      return { evidenceKind: EVIDENCE_KIND.STRUCTURAL, confidence, stale };
    }

    case EVIDENCE_KIND.NEIGHBOR: {
      // EXCLUDE writes edges — verified data-flow is not shared mechanism. Never a sibling.
      if (!SIBLING_EDGE_KINDS.has(edgeKind)) return null;
      const confidence = clamp(
        projectIntoBand(lexicalScore, knobs.neighborBand, knobs),
        knobs.neighborBand[0],
        knobs.neighborBand[1],
      );
      return { evidenceKind: EVIDENCE_KIND.NEIGHBOR, confidence, stale: false };
    }

    case EVIDENCE_KIND.LEXICAL: {
      // Lexical-only is structurally low and CANNOT cross the floor. Caller must name a mismatch.
      const ceiling = Math.min(knobs.lexicalCeiling, floor - Number.EPSILON);
      const confidence = clamp(
        projectIntoBand(lexicalScore, [0, ceiling], knobs),
        0,
        ceiling,
      );
      return {
        evidenceKind: EVIDENCE_KIND.LEXICAL,
        confidence,
        stale: false,
        requireMismatch: true,
      };
    }

    default:
      // Unknown surface -> fail closed. Do not invent a confidence.
      throw new RangeError(
        `scoreHit: unknown surface "${String(surface)}" (allowed: ${Object.values(EVIDENCE_KIND).join(', ')})`,
      );
  }
}

// ---------------------------------------------------------------------------------------------------
// STRUCTURAL-ELIGIBILITY FIREWALL (wave-2 R.3, extracted as the shared utility):
// only real source files can be structural siblings — prose/data/transcripts and
// archived paths must never surface at structural confidence. .py/.rs ARE real
// source here (gitnexus parses them); propagation-scan keeps its deliberately
// narrower JS-only local set (call-edge origination domain).
const XREF_STRUCTURAL_EXT = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rs']);
const XREF_PROTECTED_PREFIXES = ['backend/data/', '.claude/state/', '.claude/history/', '.env'];
const XREF_ARCHIVED_SEGMENTS = ['/archive/', '/legacy-purge'];
export function structuralEligible(p) {
  const rel = String(p || '').replace(/\\/g, '/');
  const dot = rel.lastIndexOf('.');
  const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : '';
  if (!XREF_STRUCTURAL_EXT.has(ext)) return false;
  if (XREF_PROTECTED_PREFIXES.some((pre) => rel === pre || rel.startsWith(pre))) return false;
  if (XREF_ARCHIVED_SEGMENTS.some((seg) => rel.includes(seg))) return false;
  return true;
}

/**
 * gateHit — the mechanism-fit-theater gate. A low-confidence hit with no named mismatch is suppressed.
 *
 * @param {object} hit  a full hit object: { ..., provenance:{ confidence, mismatch? } }
 * @param {object} [knobs]
 * @returns {{surfaced:boolean, sublog?:boolean, reason?:string}}
 */
export function gateHit(hit, knobs = XREF_PROVENANCE_KNOBS) {
  const provenance = hit && typeof hit === 'object' ? hit.provenance : undefined;
  // Fail closed on a malformed hit: no provenance / non-numeric confidence -> suppress.
  if (!provenance || typeof provenance !== 'object' || !Number.isFinite(provenance.confidence)) {
    return { surfaced: false, sublog: true, reason: 'malformed-or-missing-provenance' };
  }
  const hasMismatch = typeof provenance.mismatch === 'string' && provenance.mismatch.trim().length > 0;
  if (provenance.confidence < knobs.confidenceFloor && !hasMismatch) {
    return { surfaced: false, sublog: true, reason: 'low-confidence-no-mismatch' };
  }
  return { surfaced: true };
}

// ---------------------------------------------------------------------------------------------------
// Closed-schema validation (hand-rolled, fail-closed) — mirrors validateAutonomyRunManifest's idiom.
// Enforces additionalProperties:false semantics WITHOUT pulling an ajv dependency the scripts dir
// avoids. Returns { ok, errors } so callers and the future propagation-scan grade identically.
// ---------------------------------------------------------------------------------------------------

const HIT_ALLOWED_KEYS = new Set(['path', 'surface', 'snippet', 'score', 'provenance']);
const HIT_REQUIRED_KEYS = ['path', 'surface', 'snippet', 'score', 'provenance'];
const PROVENANCE_ALLOWED_KEYS = new Set([
  'evidenceKind',
  'confidence',
  'stale',
  'mismatch',
  'structuralUnavailable',
  // wave-2 R.2: honest structural labeling — true when a structural hit's rank
  // comes from process/PageRank, NOT per-query relevance (uncorroborated by the
  // lexical leg). Deliberate schema extension; boolean-validated below.
  'queryInvariant',
  // staleness-extension (2026-06-13): a provenance marker for a SYNTHESIZED / HEURISTIC graph hop —
  // an edge a consumer (energy-gate, propagation backlog) should DISCOUNT because it was guessed,
  // not verified. Deliberate, boolean-validated schema extension; closed-schema-safe (additive key).
  //
  // DISTINCT FROM `queryInvariant` (the flag main's xref-query carries on a gitnexus-structural hit
  // ranked by PageRank rather than per-query relevance): that flag is about QUERY-RELEVANCE provenance
  // of a REAL structural edge; `heuristicEdge` is about EDGE-ORIGIN TRUST (verified vs synthesized hop).
  // The brief mandated reusing queryInvariant if it already encoded this — it does not (different axis),
  // so this is a genuine new field, not a near-synonym duplicate.
  //
  // *** FORWARD-WIRING — NO LIVE CONSUMER YET. *** No runtime path sets or reads heuristicEdge today
  // (verified: grep of _SYSTEM/Scripts + .claude/hooks shows the energy-gate does not consume xref/
  // propagation provenance at all). This is the schema seam so a future energy-gate hop-discount can
  // attach without re-opening the CLOSED schema later. Do NOT claim it as a live staleness fix.
  'heuristicEdge',
]);
const PROVENANCE_REQUIRED_KEYS = ['evidenceKind', 'confidence'];
const EVIDENCE_KIND_VALUES = new Set(Object.values(EVIDENCE_KIND));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * validateHit — enforce the closed xref-hit schema. Unknown fields are REJECTED (closed schema).
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateHit(hit = {}) {
  const errors = [];
  if (!isPlainObject(hit)) {
    return { ok: false, errors: ['hit must be a plain object'] };
  }
  for (const key of Object.keys(hit)) {
    if (!HIT_ALLOWED_KEYS.has(key)) errors.push(`unknown field: ${key} (closed schema)`);
  }
  for (const key of HIT_REQUIRED_KEYS) {
    if (!(key in hit)) errors.push(`missing required field: ${key}`);
  }
  if ('path' in hit && (typeof hit.path !== 'string' || hit.path.length < 1)) {
    errors.push('path must be a non-empty string');
  }
  if ('surface' in hit && (typeof hit.surface !== 'string' || hit.surface.length < 1)) {
    errors.push('surface must be a non-empty string');
  }
  if ('snippet' in hit && typeof hit.snippet !== 'string') {
    errors.push('snippet must be a string');
  }
  if ('score' in hit && !Number.isFinite(hit.score)) {
    errors.push('score must be a finite number');
  }

  const provenance = hit.provenance;
  if ('provenance' in hit) {
    if (!isPlainObject(provenance)) {
      errors.push('provenance must be a plain object');
    } else {
      for (const key of Object.keys(provenance)) {
        if (!PROVENANCE_ALLOWED_KEYS.has(key)) {
          errors.push(`unknown provenance field: ${key} (closed schema)`);
        }
      }
      for (const key of PROVENANCE_REQUIRED_KEYS) {
        if (!(key in provenance)) errors.push(`missing required provenance field: ${key}`);
      }
      if ('evidenceKind' in provenance && !EVIDENCE_KIND_VALUES.has(provenance.evidenceKind)) {
        errors.push(`provenance.evidenceKind must be one of ${[...EVIDENCE_KIND_VALUES].join(', ')}`);
      }
      if ('confidence' in provenance) {
        const c = provenance.confidence;
        if (!Number.isFinite(c) || c < 0 || c > 1) {
          errors.push('provenance.confidence must be a number in [0,1]');
        }
      }
      if ('stale' in provenance && typeof provenance.stale !== 'boolean') {
        errors.push('provenance.stale must be a boolean');
      }
      if ('queryInvariant' in provenance && typeof provenance.queryInvariant !== 'boolean') {
        errors.push('provenance.queryInvariant must be a boolean when present');
      }
      if ('structuralUnavailable' in provenance && typeof provenance.structuralUnavailable !== 'boolean') {
        errors.push('provenance.structuralUnavailable must be a boolean');
      }
      // staleness-extension: heuristicEdge is boolean when present (forward-wiring, no live consumer).
      if ('heuristicEdge' in provenance && typeof provenance.heuristicEdge !== 'boolean') {
        errors.push('provenance.heuristicEdge must be a boolean when present');
      }
      if ('mismatch' in provenance && (typeof provenance.mismatch !== 'string' || provenance.mismatch.length < 1)) {
        errors.push('provenance.mismatch must be a non-empty string');
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * serializeRevalidate — final canary mirroring the energy-trace privacy-gate canary
 * (yuri-energy-trace.mjs appendTrace). The SERIALIZED form is the source of truth because that is
 * what actually ships downstream; a live object can hide forbidden content behind a toJSON / getter
 * that only manifests after JSON.stringify. We therefore:
 *   (1) light pre-check the live input is a plain object (cheap fail-fast, no false "it parsed" trust),
 *   (2) JSON.stringify -> JSON.parse to get the exact wire form,
 *   (3) run the FULL closed-schema validation on the SERIALIZED form (the canary — this is what
 *       catches a toJSON/getter that injected a rogue field or an out-of-range value post-stringify).
 * Throws on any failure (fail-closed). Returns the round-tripped, validated hit on success.
 */
export function serializeRevalidate(hit) {
  if (!isPlainObject(hit)) {
    throw new Error('serializeRevalidate: hit must be a plain object');
  }
  let roundTripped;
  try {
    roundTripped = JSON.parse(JSON.stringify(hit));
  } catch (err) {
    // JSON.stringify can throw (BigInt, circular). Fail closed — never ship an unserializable hit.
    throw new Error(`serializeRevalidate: hit is not serializable: ${err.message}`);
  }
  const post = validateHit(roundTripped);
  if (!post.ok) {
    // The serialized form does not satisfy the closed schema — the canary caught it.
    throw new Error(`serializeRevalidate canary: serialized hit failed re-validation: ${post.errors.join('; ')}`);
  }
  return roundTripped;
}
