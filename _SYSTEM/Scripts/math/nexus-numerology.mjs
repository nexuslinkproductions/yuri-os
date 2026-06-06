#!/usr/bin/env node
/**
 * nexus-numerology.mjs — deterministic numerology-as-encoding channels for NEXUS.
 *
 * This is NOT mysticism and NOT a similarity metric. It supplies coarse, namespaced feature buckets
 * that can augment the matcher when explicitly enabled. The channels are intentionally bounded:
 *   - gematria(text): stable 32-bit symbol hash from normalized code points. Collisions are expected.
 *   - digitalRoot(n): mod-9 ring homomorphism bucket in 1..9 for non-zero magnitudes.
 *   - harmonicSignature(text): small adjacent-ratio buckets over token gematria values.
 *   - numerologyFeatures(text): Set<num:...|dr:...|harm:...> for feature-space merge.
 *
 * Collision behavior: gematria is a finite 32-bit integer hash, so collisions are inevitable by the
 * pigeonhole principle. That is acceptable here because the output is a recall-side bucket signal,
 * not identity, proof, ranking truth, or semantic interpretation.
 *
 * Pure + injectable: no I/O, no clock, no RNG. Embedding-free and CPU-only.
 */
import { tokenize } from './yuri-jaccard.mjs';

const UINT32 = 0x100000000;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const MAX_CHARS = 200000;

function normalizedChars(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const s = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  return [...s.normalize('NFKD').toLowerCase()].filter((ch) => !/\p{Mark}/u.test(ch));
}

function symbolValue(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 97 && cp <= 122) return cp - 96;       // a..z -> 1..26
  if (cp >= 48 && cp <= 57) return 27 + (cp - 48); // 0..9 -> 27..36
  if (/\s/u.test(ch)) return 0;                    // spacing should not dominate buckets
  return 37 + (cp % 997);                          // deterministic non-ASCII/symbol lane
}

/**
 * Deterministic 32-bit symbol→integer hash. It is order-sensitive and bounded; collisions are an
 * expected property of the finite bucket, not a bug.
 */
export function gematria(text) {
  let h = FNV_OFFSET;
  let saw = false;
  let pos = 1;
  for (const ch of normalizedChars(text)) {
    const v = symbolValue(ch);
    if (v === 0) continue;
    saw = true;
    h ^= (v + Math.imul(pos, 131)) >>> 0;
    h = Math.imul(h, FNV_PRIME) >>> 0;
    pos++;
  }
  return saw ? h : 0;
}

/** Digital root in 1..9 for any non-zero integer magnitude; 0 maps to 0 as the empty/no-signal case. */
export function digitalRoot(n) {
  if (typeof n === 'bigint') {
    const m = n < 0n ? -n : n;
    return m === 0n ? 0 : Number(((m - 1n) % 9n) + 1n);
  }
  const x = Math.trunc(Math.abs(Number(n)));
  if (!Number.isFinite(x) || x === 0) return 0;
  return ((x - 1) % 9) + 1;
}

function tokenValue(token) {
  let sum = 0;
  for (const ch of normalizedChars(token)) sum += symbolValue(ch);
  return sum;
}

const HARMONIC_RATIOS = [
  ['1_1', 1],
  ['9_8', 9 / 8],
  ['5_4', 5 / 4],
  ['4_3', 4 / 3],
  ['3_2', 3 / 2],
  ['5_3', 5 / 3],
  ['2_1', 2],
];

function nearestRatioBucket(ratio) {
  let best = HARMONIC_RATIOS[0], bd = Infinity;
  for (const entry of HARMONIC_RATIOS) {
    const d = Math.abs(Math.log(ratio / entry[1]));
    if (d < bd) { best = entry; bd = d; }
  }
  return best[0];
}

/**
 * Adjacent-token harmonic ratio buckets. The vector is deliberately small and finite; it captures
 * resonance-like ratio structure without assigning meaning to the numbers.
 */
export function harmonicSignature(text, { maxPairs = 8 } = {}) {
  const toks = [...tokenize(text)];
  const vals = toks.map(tokenValue).filter((v) => v > 0);
  const out = [];
  const limit = Math.min(Math.max(0, Math.trunc(maxPairs)), Math.max(0, vals.length - 1));
  for (let i = 0; i < limit; i++) {
    const a = vals[i], b = vals[i + 1];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo === 0) continue;
    const ratio = Math.min(2, hi / lo);
    out.push(nearestRatioBucket(ratio));
  }
  return out;
}

/**
 * Namespaced feature channel for matcher integration. Off by default in yuri-token-expand.makeFeatureFn.
 */
export function numerologyFeatures(text, opts = {}) {
  const g = gematria(text);
  const out = new Set();
  if (g === 0) return out;
  out.add('num:g' + String(g % 1024).padStart(4, '0'));
  out.add('dr:' + digitalRoot(g));
  for (const h of harmonicSignature(text, opts)) out.add('harm:' + h);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).join(' ') || 'login requires password auth token';
  console.log(JSON.stringify({
    text,
    gematria: gematria(text),
    digitalRoot: digitalRoot(gematria(text)),
    harmonicSignature: harmonicSignature(text),
    features: [...numerologyFeatures(text)].sort(),
  }, null, 2));
}
