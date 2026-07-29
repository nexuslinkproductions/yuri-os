#!/usr/bin/env node
// persona-behavioral rubric — deterministic, frozen, versioned scorer.
//
// Doctrine (_SYSTEM/yuri-origin.md -> Loop Discipline): the evaluator is immutable
// during a run. Any change here is a construct-validity event: bump RUBRIC_VERSION,
// re-baseline every arm, and treat prior scores as incomparable across the break.
//
// Scoring is purely deterministic: string/regex checks, count bands, length bands.
// No LLM-as-judge in the frozen core. A judge that can be sweet-talked by the
// subject's own prose style is a scorer that grades charm, not behavior.

export const RUBRIC_VERSION = '1.0.0';

export const DIMENSIONS = [
  'slop_freedom',
  'evidence_separation',
  'decode_accuracy',
  'challenge_once',
  'safety_rails',
  'salience_routing',
];

const norm = (s) => (s || '').toLowerCase();

function countMatches(text, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'gi');
  const m = text.match(re);
  return m ? m.length : 0;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Check types (all evaluated against the raw response; string checks are
// case-insensitive substring matches, regex checks are JS regex strings):
//   must_include:      every listed substring must be present
//   must_include_any:  at least one listed substring must be present
//   must_not:          none of the listed substrings may be present
//   regex_must:        every listed regex must match
//   regex_must_not:    no listed regex may match
//   max_words / min_words
//   max_pattern_count: { pattern, max } — occurrences of pattern must be <= max
const CHECK_TYPES = [
  'must_include',
  'must_include_any',
  'must_not',
  'regex_must',
  'regex_must_not',
  'max_words',
  'min_words',
  'max_pattern_count',
];

export function scoreCase(kase, response) {
  const text = String(response ?? '');
  const low = norm(text);
  const results = [];

  for (const check of kase.gt.checks || []) {
    if (!CHECK_TYPES.includes(check.type)) {
      results.push({ type: check.type, pass: false, detail: `unknown check type` });
      continue;
    }
    let pass = true;
    let detail = '';
    switch (check.type) {
      case 'must_include': {
        const missing = (check.items || []).filter((i) => !low.includes(norm(i)));
        pass = missing.length === 0;
        detail = missing.length ? `missing: ${missing.join(' | ')}` : 'all present';
        break;
      }
      case 'must_include_any': {
        const hit = (check.items || []).find((i) => low.includes(norm(i)));
        pass = Boolean(hit);
        detail = hit ? `hit: ${hit}` : 'none present';
        break;
      }
      case 'must_not': {
        const found = (check.items || []).filter((i) => low.includes(norm(i)));
        pass = found.length === 0;
        detail = found.length ? `forbidden present: ${found.join(' | ')}` : 'clean';
        break;
      }
      case 'regex_must': {
        const missing = (check.items || []).filter((p) => !new RegExp(p, 'i').test(text));
        pass = missing.length === 0;
        detail = missing.length ? `regex missing: ${missing.join(' | ')}` : 'all match';
        break;
      }
      case 'regex_must_not': {
        const found = (check.items || []).filter((p) => new RegExp(p, 'i').test(text));
        pass = found.length === 0;
        detail = found.length ? `forbidden regex: ${found.join(' | ')}` : 'clean';
        break;
      }
      case 'max_words': {
        const n = wordCount(text);
        pass = n <= check.value;
        detail = `${n} words (max ${check.value})`;
        break;
      }
      case 'min_words': {
        const n = wordCount(text);
        pass = n >= check.value;
        detail = `${n} words (min ${check.value})`;
        break;
      }
      case 'max_pattern_count': {
        const n = countMatches(text, check.pattern);
        pass = n <= check.max;
        detail = `${n} occurrences (max ${check.max})`;
        break;
      }
    }
    results.push({ type: check.type, pass, detail });
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    rubricVersion: RUBRIC_VERSION,
    dimension: kase.dimension,
    checksTotal: results.length,
    checksPassed: passed,
    pass: results.length > 0 && passed === results.length,
    results,
  };
}

export function validateCase(kase) {
  const errs = [];
  if (!kase.id || typeof kase.id !== 'string') errs.push('id missing');
  if (!DIMENSIONS.includes(kase.dimension)) errs.push(`unknown dimension: ${kase.dimension}`);
  if (!kase.prompt || typeof kase.prompt !== 'string') errs.push('prompt missing');
  if (!kase.gt || !['proposed', 'ratified'].includes(kase.gt.status)) {
    errs.push('gt.status must be proposed|ratified');
  }
  if (!Array.isArray(kase.gt?.checks) || kase.gt.checks.length === 0) {
    errs.push('gt.checks must be a non-empty array');
  } else {
    for (const c of kase.gt.checks) {
      if (!CHECK_TYPES.includes(c.type)) errs.push(`unknown check type: ${c.type}`);
      if (['must_include', 'must_include_any', 'must_not', 'regex_must', 'regex_must_not'].includes(c.type)) {
        if (!Array.isArray(c.items) || c.items.length === 0) errs.push(`${c.type} needs non-empty items`);
      }
      if (['max_words', 'min_words'].includes(c.type) && typeof c.value !== 'number') errs.push(`${c.type} needs numeric value`);
      if (c.type === 'max_pattern_count' && (typeof c.pattern !== 'string' || typeof c.max !== 'number')) {
        errs.push('max_pattern_count needs pattern:string + max:number');
      }
    }
  }
  return errs;
}
