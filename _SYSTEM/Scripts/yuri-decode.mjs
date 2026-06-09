#!/usr/bin/env node
/**
 * yuri-decode.mjs — the LLM-WIELDED decoder instrument: translate text → a deterministic math object.
 *
 * Marcel's framing (corrected): this is NOT an ingress pre-processor that mutates input before it reaches the LLM.
 * It is an INSTRUMENT the LLM calls directly — decode("<text>") returns a structured math representation (tokens,
 * numerology channels, dimensional reading, feature surface) that the LLM then reasons over. The decode engine is
 * the same; the control inverts — the model wields it.
 *
 * Deterministic + embedding-free: same text → same object. Reuses the shipped channels — yuri-jaccard tokenize,
 * nexus-numerology (gematria hash / digital-root mod-9 / harmonic signature), and the Foundry dimension classifier.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digitalRoot, gematria, harmonicSignature, numerologyFeatures } from './math/nexus-numerology.mjs';
import { classifyDimension } from './math/formula-foundry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NUMEROLOGY_MAX_CHARS = 200000;

// raw tokenization (keeps duplicates + single chars, deterministic) — distinct from yuri-jaccard's deduped Set.
function rawTokenize(t) { return String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

export function decode(text, opts = {}) {
  const t = String(text ?? '');
  const tokens = rawTokenize(t);
  const uniq = [...new Set(tokens)].sort();
  // Null prototype prevents inherited keys like constructor/valueOf from corrupting frequency counts.
  const freq = Object.create(null);
  for (const tok of tokens) freq[tok] = (freq[tok] || 0) + 1;

  // numerology channels (mechanisms, not mysticism): a hash, a mod-9 homomorphism, a harmonic ratio signature.
  const numerology = {
    gematria: gematria(t),
    digitalRoot: digitalRoot(t),
    harmonicSignature: harmonicSignature(t),
    features: numerologyFeatures(t),
    // nexus-numerology bounds work to 200k chars; expose that so callers do not treat it as full-text coverage.
    truncated: t.length > NUMEROLOGY_MAX_CHARS,
    coveredChars: Math.min(t.length, NUMEROLOGY_MAX_CHARS),
    maxChars: NUMEROLOGY_MAX_CHARS,
  };

  // dimensional reading: the whole text + each significant token's dimension (the typing channel).
  const dimension = classifyDimension(t).dimension;
  const tokenDimensions = {};
  for (const tok of uniq) { const d = classifyDimension(tok).dimension; if (d !== 'UNKNOWN') tokenDimensions[tok] = d; }
  // the dominant non-UNKNOWN dimension across tokens (deterministic: most frequent, ties by name).
  const dimCounts = {};
  for (const tok of Object.keys(tokenDimensions)) dimCounts[tokenDimensions[tok]] = (dimCounts[tokenDimensions[tok]] || 0) + 1;
  const dominantDimension = Object.keys(dimCounts).sort((a, b) => dimCounts[b] - dimCounts[a] || a.localeCompare(b))[0] || dimension;

  return {
    op: 'decode',
    text: t,
    length: t.length,
    tokens,
    tokenCount: tokens.length,
    uniqueTokenCount: uniq.length,
    frequency: freq,
    numerology,
    dimension,
    dominantDimension,
    tokenDimensions,
    // a compact feature surface the LLM can reason over directly.
    featureSurface: {
      length: t.length,
      tokens: tokens.length,
      unique: uniq.length,
      lexicalDensity: tokens.length ? Number((uniq.length / tokens.length).toFixed(4)) : 0,
      digitalRoot: numerology.digitalRoot,
      dominantDimension,
      numerologyTruncated: numerology.truncated,
    },
    advisory_only: true,
    local_truth_claim: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
  const json = process.argv.includes('--json');
  if (!text) { process.stdout.write('usage: yuri-decode.mjs "<text>" [--json]\n'); process.exitCode = 1; }
  else {
    const d = decode(text);
    process.stdout.write(json ? JSON.stringify(d, null, 2) + '\n'
      : `decode "${text.slice(0, 40)}…"\n  tokens=${d.tokenCount} unique=${d.uniqueTokenCount} lexDensity=${d.featureSurface.lexicalDensity}\n  numerology: gematria=${d.numerology.gematria} digitalRoot=${d.numerology.digitalRoot}\n  dimension=${d.dimension} dominant=${d.dominantDimension}\n`);
  }
}
