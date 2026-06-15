#!/usr/bin/env node
/**
 * yuri-mdl.mjs — Minimum Description Length redundancy axis for the memory loop.
 *
 * SOURCE THEORY — MDL (Rissanen two-part / crude code): keep item m iff
 *   L(m) < L(m | rest-of-store). An item's worth is its IRREDUCIBLE description
 *   length GIVEN everything else. A redundant restatement compresses to ~nothing
 *   against the rest of the store; a unique insight does not.
 *
 * THE TRANSFER — a real, computable, embedding-free L(m|rest) proxy via gzip distance:
 *     marginalBits(m, rest) ≈ len(gzip(rest + m)) − len(gzip(rest))   normalized by len(gzip(m)).
 * NOT BM25 (that is relevance, not reconstruction). A near-duplicate of the rest adds
 * almost no compressed bytes → low marginalBits → REDUNDANT. A lexically novel body
 * does not compress against the rest → high marginalBits → IRREDUCIBLE.
 *
 * Used by memory-relocator.planRelocations as a SECOND, orthogonal demotion axis:
 * demote iff (R < rFloor AND marginalBits < redundancyFloor) — keep if EITHER
 * retrievable OR irreducible-given-the-rest. This protects the stale-but-UNIQUE
 * insight and demotes the fresh-but-REDUNDANT restatement.
 *
 * Pure + injectable: node:zlib only, no I/O, no clock, no config read. Mirrors the
 * house style of yuri-fsrs.mjs so it is unit-testable in isolation. Embedding-free
 * (pure compression arithmetic) — honors the no-RAG / FTS5-only constraint.
 *
 * GUARDS (per catalog card 14): (1) callers keep force_keep/feedback/user EXEMPT
 * (enforced upstream in the relocator, not here); (2) marginalBits may only
 * PROTECT-from-demote or FLAG-redundant, never sole-delete (the relocator ANDs it
 * with low-R); (3) a content-quality/length floor (qualityFloor here) means a
 * near-empty / garbled body cannot false-protect itself as "novel".
 */
import { gzipSync } from 'node:zlib';

// gzip level 6 (zlib default) — deterministic across Node versions for the same input,
// which the unit tests rely on. Pinned explicitly so a future default change can't drift
// the marginal-bits scores under us.
const GZIP_LEVEL = 6;
// A body shorter than this many trimmed chars is too small to assert novelty about — the
// gzip header overhead dominates and a one-token file looks spuriously "incompressible".
// Below the floor we return a sentinel quality verdict so the caller never PROTECTS it.
export const DEFAULT_QUALITY_FLOOR_CHARS = 80;

function gzipLen(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;
  return gzipSync(Buffer.from(text, 'utf8'), { level: GZIP_LEVEL }).length;
}

/**
 * Normalized marginal description length of `body` GIVEN `rest` (the concatenation of all
 * other kept bodies). In [0, ~1+]: ~0 = fully predicted by the rest (redundant),
 * ~1 = adds as many compressed bytes as compressing it alone (irreducible / novel).
 *
 *   raw    = len(gzip(rest + body)) − len(gzip(rest))      // extra bytes body costs given rest
 *   norm   = raw / len(gzip(body))                          // vs its standalone compressed size
 *
 * Edge cases (fail-safe, never throws, never NaN/Inf):
 *  - empty/blank body            → { bits: 0, lowQuality: true }   (nothing to protect)
 *  - sub-quality-floor body      → { lowQuality: true }            (caller must NOT protect)
 *  - empty rest (body is alone)  → bits = 1 (irreducible by definition — nothing predicts it)
 *  - raw < 0 (compression noise) → clamped to 0
 *  - len(gzip(body)) == 0        → bits = 0 (degenerate)
 *
 * @param {string} body              the candidate memory body
 * @param {string} rest             concatenation of all OTHER kept bodies
 * @param {object} [opts]
 * @param {number} [opts.qualityFloorChars]  min trimmed length to assert novelty (default 80)
 * @returns {{ bits:number, raw:number, soloBits:number, lowQuality:boolean }}
 */
export function marginalBits(body, rest, { qualityFloorChars = DEFAULT_QUALITY_FLOOR_CHARS } = {}) {
  const m = typeof body === 'string' ? body : '';
  const r = typeof rest === 'string' ? rest : '';
  const trimmedLen = m.trim().length;
  const lowQuality = trimmedLen < qualityFloorChars;
  if (trimmedLen === 0) return { bits: 0, raw: 0, soloBits: 0, lowQuality: true };

  const soloBits = gzipLen(m);
  if (soloBits === 0) return { bits: 0, raw: 0, soloBits: 0, lowQuality };

  // Empty rest: the body is the only thing in the store — irreducible by definition.
  if (r.length === 0) return { bits: 1, raw: soloBits, soloBits, lowQuality };

  // DEFLATE WINDOW (prominent — owner decision D4): gzip conditions on only the
  // LAST ~32KB of its input. For rest > 32KB, gzipLen(rest+body) measures
  // redundancy vs the most RECENT 32KB only (audit: identical 1.6KB body at the
  // END of a 104KB rest → bits 0.1543; at the START → 0.9630). MITIGATION:
  // condition on a SAMPLED context anchored at BOTH ends (oldest 14KB + newest
  // 14KB + body all fit in one window). Honest residual: middle-of-store content
  // still escapes the window — full fix needs chunked max-similarity, parked.
  const ANCHOR = 14 * 1024;
  const ctx = r.length <= 2 * ANCHOR ? r : `${r.slice(0, ANCHOR)}\n${r.slice(-ANCHOR)}`;
  const restBits = gzipLen(ctx);
  const jointBits = gzipLen(ctx + '\n' + m);   // newline separator so two bodies don't fuse a token
  const raw = Math.max(0, jointBits - restBits);   // clamp compression noise to 0
  const bits = raw / soloBits;
  return { bits, raw, soloBits, lowQuality };
}

/**
 * Redundancy verdict for the relocator's AND-condition. A body is REDUNDANT (safe to
 * demote on this axis) iff its normalized marginal bits fall below `redundancyFloor`.
 *
 * redundancyFloor=0.15 is NOT size-invariant: dictionary dilution raises marginal
 * bits for true duplicates as rest grows (audit: duplicate 0.1296 in a small rest
 * vs 0.1543 in a 104KB rest → NOT flagged at 0.15). The marginalBits anchor
 * sampling bounds the effective dictionary (~28KB), which re-stabilizes this
 * calibration; if the anchors are ever removed, raise the floor (~0.20) for
 * stores >32KB or calibrate per size.
 * AND it is not low-quality (a low-quality body is neither protected nor flagged-redundant
 * here — the relocator's own quality floor already pins it fully-decayed, so this axis
 * stays neutral on it and lets the R-axis decide).
 *
 * @returns {{ redundant:boolean, irreducible:boolean, bits:number, lowQuality:boolean, reason:string }}
 */
export function redundancyVerdict(body, rest, { redundancyFloor = 0.15, qualityFloorChars = DEFAULT_QUALITY_FLOOR_CHARS } = {}) {
  const { bits, lowQuality } = marginalBits(body, rest, { qualityFloorChars });
  // A low-quality body must NOT be PROTECTED as novel (guard 3). It is also not asserted
  // redundant here — neutral on this axis so it can't false-protect, and the relocator's
  // own MIN_QUALITY_BYTES floor (lastUsed→epoch) handles its decay.
  if (lowQuality) {
    return { redundant: false, irreducible: false, bits, lowQuality, reason: `marginalBits=${bits.toFixed(3)} (low-quality — neutral on redundancy axis)` };
  }
  const redundant = bits < redundancyFloor;
  return {
    redundant,
    irreducible: !redundant,
    bits,
    lowQuality,
    reason: redundant
      ? `marginalBits=${bits.toFixed(3)} < redundancyFloor ${redundancyFloor} (predicted by rest — redundant)`
      : `marginalBits=${bits.toFixed(3)} ≥ redundancyFloor ${redundancyFloor} (irreducible given rest — protected)`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const unique = 'Quantum tunneling in Josephson junctions enables flux qubits via macroscopic coherence over the barrier potential well boundary conditions here.';
  const rest = 'The cat sat on the warm windowsill while rain pattered against the glass and the kettle whistled softly in the next room over there.';
  const dupOfRest = rest + ' ' + rest.slice(0, 40);
  console.log(JSON.stringify({
    uniqueVsRest: redundancyVerdict(unique, rest),
    dupVsRest: redundancyVerdict(dupOfRest, rest),
    aloneInStore: redundancyVerdict(unique, ''),
    tiny: redundancyVerdict('hi', rest),
  }, null, 2));
}
