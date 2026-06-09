#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './yuri-decode.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const d = decode('compute the entropy of the probability distribution in bits');
// structure
ok(d.op === 'decode' && Array.isArray(d.tokens) && d.tokenCount > 0, 'decode returns tokens');
ok(typeof d.numerology.gematria === 'number' && typeof d.numerology.digitalRoot === 'number', 'numerology channels present (gematria hash + digital-root)');
ok(typeof d.dimension === 'string' && typeof d.dominantDimension === 'string', 'dimensional reading present');
ok(d.featureSurface && typeof d.featureSurface.lexicalDensity === 'number', 'compact feature surface present');
ok(d.advisory_only === true && d.local_truth_claim === false, 'decode output is advisory (the LLM reasons over it)');

// dimensional reading: an information-theoretic sentence reads as INFORMATION/PROBABILITY-flavored
ok(['INFORMATION', 'PROBABILITY'].includes(d.dominantDimension), `entropy/probability/bits text → INFORMATION or PROBABILITY dominant (got ${d.dominantDimension})`);
ok('bits' in d.tokenDimensions || 'entropy' in d.tokenDimensions || 'probability' in d.tokenDimensions, 'per-token dimensions captured for math terms');

// lexical density math
ok(d.featureSurface.lexicalDensity === Number((d.uniqueTokenCount / d.tokenCount).toFixed(4)), 'lexical density = unique/total');

// determinism — same text → byte-identical object
ok(JSON.stringify(decode('hello world')) === JSON.stringify(decode('hello world')), 'decode is byte-deterministic');
const src = fs.readFileSync(path.join(__dirname, 'yuri-decode.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic instrument)');

// empty + edge
ok(decode('').tokenCount === 0 && decode('').featureSurface.lexicalDensity === 0, 'empty text decodes to a zero surface, no crash');
ok(decode(null).op === 'decode', 'null is coerced, no crash');

// frequency map
const fd = decode('a a b');
ok(fd.frequency.a === 2 && fd.frequency.b === 1, 'frequency map counts token occurrences');
const constructorFreq = decode('constructor constructor').frequency;
ok(constructorFreq.constructor === 2 && typeof constructorFreq.constructor === 'number',
  'Y-1: frequency map uses a null prototype so constructor counts numerically');
const longDecode = decode('a'.repeat(200001));
ok(longDecode.numerology.truncated === true && longDecode.numerology.coveredChars === 200000 && longDecode.featureSurface.numerologyTruncated === true,
  'Y-2: decode surfaces numerology truncation for inputs over the 200k cap');
ok(decode('short').numerology.truncated === false, 'Y-2: normal-length decode reports numerology as untruncated');

console.log(`\nyuri-decode.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
