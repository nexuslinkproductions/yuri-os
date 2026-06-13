#!/usr/bin/env node
/**
 * mechanism-pattern-registry.mjs — closed-set validator for the v0 mechanism-pattern verb taxonomy.
 *
 * The 5 verbs are the propagation "fuel map" (roadmap §5). This module is the ONE source of truth
 * for the verb set: the node-field validator (MATH-02) and the future propagation-scan import
 * MECHANISM_PATTERN_VERBS from here so a verb can never be self-minted in two places.
 *
 * Fail-closed by contract: an unknown verb, a verb with <2 witnesses, or a witness that is not
 * path:line-shaped is rejected — exactly as the proof-gate refuses self-mint of formula cards.
 *
 * CLI: node _SYSTEM/Scripts/math/mechanism-pattern-registry.mjs  (validates the registry file;
 * process.exitCode=1 on failure). Modeled on math-proof-gate.mjs CLI tail + math-adapters.mjs
 * closed-set/require idiom.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..'); // Scripts/math/ → Scripts/ → _SYSTEM/ → repo root
const REGISTRY_PATH = path.join(REPO_ROOT, '_SYSTEM', 'data', 'math', 'mechanism-pattern-registry.json');

/**
 * The closed v0 enum, as a genuinely-immutable frozen array of primitives.
 * This is the single shared source of truth for verb identity. A frozen array of
 * strings cannot be mutated by an importer (push/splice throw in strict ESM, and the
 * elements are primitives), unlike a Set — `Object.freeze(new Set(...))` does NOT
 * block `.add()`/`.delete()`, so a Set is the wrong container for a closed enum.
 */
const MECHANISM_PATTERN_VERB_LIST = Object.freeze([
  'replace-hand-tuned-constant',
  'read-lower-bound-not-point',
  'gate-on-identity-not-aggregate',
  'shared-prerequisite-unlock',
  'compose-readonly-analyzer',
]);

/**
 * Read-only membership surface over the closed verb set. Exposes the Set-like
 * shape consumers expect (`has`, `size`, iteration) but is poison-proof: `add`/
 * `delete`/`clear` are absent, and membership is read from the frozen primitive
 * array, never from a mutable Set. The validator rebuilds its own private Set on
 * each call (below) so even tampering with this exported object cannot reach
 * validation.
 */
export const MECHANISM_PATTERN_VERBS = Object.freeze({
  has: (verb) => MECHANISM_PATTERN_VERB_LIST.includes(verb),
  get size() {
    return MECHANISM_PATTERN_VERB_LIST.length;
  },
  values: () => MECHANISM_PATTERN_VERB_LIST[Symbol.iterator](),
  [Symbol.iterator]: () => MECHANISM_PATTERN_VERB_LIST[Symbol.iterator](),
});

/** Minimum witnesses for a verb to be admissible (the new-verb threshold). */
export const MIN_WITNESSES = 2;

const ALLOWED_SCHEMAS = new Set(['yuri.mechanism-pattern-registry.v0']);
const ALLOWED_PROMOTION_STATES = new Set([
  'research',
  'verified-baseline',
  'stable',
  'quarantined',
  'fixture',
]);

// A witness is "<path>:<line>": a non-colon, non-whitespace-bordered path segment, a single colon,
// a 1+ digit line. Rejects bare paths, bare numbers, ranges (12-20), double-colon noise, and
// leading/trailing whitespace (a space-padded path reads "well-formed" but never resolves via grep).
// line number is 1-based, no zero-padding (':0' and ':007' fail closed).
const WITNESS_RE = /^(?!\s)[^:\s][^:]*?(?<!\s):[1-9][0-9]*$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validate a mechanism-pattern registry object.
 * Fail-closed: returns { ok:false, ... } on any structural or closed-set violation.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateMechanismPatternRegistry(registry) {
  const errors = [];
  const warnings = [];

  // Rebuild the membership set locally from the frozen primitive array on every call.
  // Never consult the exported MECHANISM_PATTERN_VERBS surface for validation, so an
  // importer cannot poison the closed-set check by mutating a shared mutable Set.
  const closedVerbSet = new Set(MECHANISM_PATTERN_VERB_LIST);

  if (!isPlainObject(registry)) {
    return { ok: false, errors: ['registry must be an object'], warnings };
  }

  if (!ALLOWED_SCHEMAS.has(registry.schema)) {
    errors.push(`unsupported schema: ${registry.schema || '(missing)'}`);
  }
  if (!isNonEmptyString(registry.id)) errors.push('id is required');
  if (!isNonEmptyString(registry.version)) {
    errors.push('version is required');
  } else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(registry.version)) {
    errors.push(`version must be semver-shaped: ${registry.version}`);
  }
  if (!ALLOWED_PROMOTION_STATES.has(registry.promotionStatus)) {
    errors.push(`promotionStatus must be one of: ${[...ALLOWED_PROMOTION_STATES].join(', ')}`);
  }
  if (typeof registry.advisoryOnly !== 'boolean') {
    errors.push('advisoryOnly must be a boolean');
  }

  if (!Array.isArray(registry.verbs) || registry.verbs.length === 0) {
    errors.push('verbs must be a non-empty array');
    return { ok: errors.length === 0, errors, warnings };
  }

  const seen = new Set();
  for (let i = 0; i < registry.verbs.length; i += 1) {
    const entry = registry.verbs[i];
    const tag = isPlainObject(entry) && isNonEmptyString(entry.verb) ? entry.verb : `index ${i}`;

    if (!isPlainObject(entry)) {
      errors.push(`verb ${tag}: each verb entry must be an object`);
      continue;
    }

    // Closed-set gate — unknown verb is rejected outright (no self-mint).
    if (!isNonEmptyString(entry.verb)) {
      errors.push(`verb ${tag}: verb name is required`);
    } else if (!closedVerbSet.has(entry.verb)) {
      errors.push(`verb ${entry.verb}: not in the closed v0 set (a new verb requires owner promotion)`);
    } else if (seen.has(entry.verb)) {
      errors.push(`verb ${entry.verb}: duplicate verb entry`);
    } else {
      seen.add(entry.verb);
    }

    if (!isNonEmptyString(entry.definition)) errors.push(`verb ${tag}: definition is required`);
    if (!isNonEmptyString(entry.rippleClass)) errors.push(`verb ${tag}: rippleClass is required`);
    if (!isNonEmptyString(entry.guardRequirement)) errors.push(`verb ${tag}: guardRequirement is required`);
    if (!isNonEmptyString(entry.cascadeFamily)) errors.push(`verb ${tag}: cascadeFamily is required`);

    // Witness gate — >=2, each path:line-shaped.
    if (!Array.isArray(entry.witnesses)) {
      errors.push(`verb ${tag}: witnesses must be an array`);
    } else {
      if (entry.witnesses.length < MIN_WITNESSES) {
        errors.push(`verb ${tag}: needs >=${MIN_WITNESSES} witnesses, found ${entry.witnesses.length}`);
      }
      for (const witness of entry.witnesses) {
        if (typeof witness !== 'string' || !WITNESS_RE.test(witness)) {
          errors.push(`verb ${tag}: malformed witness (expected path:line): ${JSON.stringify(witness)}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Load + validate the on-disk registry file. */
export function validateRegistryFile(registryPath = REGISTRY_PATH) {
  let raw;
  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (err) {
    return { ok: false, errors: [`cannot read registry: ${err.message}`], warnings: [], verbCount: 0 };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errors: [`registry is not valid JSON: ${err.message}`], warnings: [], verbCount: 0 };
  }
  const result = validateMechanismPatternRegistry(parsed);
  return {
    ...result,
    verbCount: Array.isArray(parsed?.verbs) ? parsed.verbs.length : 0,
  };
}

/**
 * Load the FULL validated verb records (not just the names) from the on-disk registry.
 * Fail-CLOSED on an invalid registry: returns `verbs:[]` so a consumer (the mechanism classifier)
 * degrades to "no mechanism claim" rather than scoring against a malformed/poisoned taxonomy.
 * This is the single source of truth for the verb RECORDS, exactly as MECHANISM_PATTERN_VERBS is
 * the single source for the verb NAMES — a consumer never re-reads the JSON itself.
 * @returns {{ ok: boolean, verbs: Array<object>, errors: string[] }}
 */
export function loadVerbRecords(registryPath = REGISTRY_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (err) {
    return { ok: false, verbs: [], errors: [`cannot read/parse registry: ${err.message}`] };
  }
  const result = validateMechanismPatternRegistry(parsed);
  if (!result.ok) return { ok: false, verbs: [], errors: result.errors };
  return { ok: true, verbs: parsed.verbs, errors: [] };
}

// ================================================================================================
// MECHANISM CLASSIFIER (cross-reference engine, axis 2 — "the biggest lever").
//
// THE PROBLEM: propagation-scan's original mechanism tagger matched a sibling to a verb by
// substring-matching the VERB'S OWN NAME TOKENS against the sibling's witness symbol names. That is
// "mechanism-fit theater": a symbol named `sharedFn` lexically hits the `shared` token of
// `shared-prerequisite-unlock` while having nothing to do with that mechanism, flooding the transfer
// backlog with vocabulary look-alikes and destroying trust.
//
// THE FIX (prior-art-shaped — OpenRewrite/Refaster/Semgrep): match on STRUCTURE, not words. Each
// verb carries REAL witnesses (path:line — the actual mechanism sites). A sibling is a mechanism
// sibling when it is structurally bound to a verb's witness sites:
//   HIGH structural-anchor : sibling file IS a witness file of EXACTLY ONE verb (unambiguous site).
//   MED  ambiguous-anchor  : sibling file is a witness file shared by >1 verb (real site, but which
//                            mechanism is undisambiguated — emit candidates, never lexical-tiebreak).
//   MED  import-hop        : sibling file imports a verb's witness file (dependency edge; cheap, no
//                            call graph). Replaces the old directory-cascade, which was pure noise
//                            (everything under Scripts/ co-locates).
//   LOW  lexical-only      : a verb-name token matches a witness name but NO structural/import bond
//                            exists -> antiWitness:true with a "why it might not transfer" note. This
//                            is the negative-fixture machine-check (Semgrep's "a pattern must ship a
//                            look-alike that is NOT it") made VISIBLE instead of silently laundered.
//   NONE unclassified      : no claim.
//
// Pure + fail-open-to-honest: no fs/network; an empty/garbage verb set returns `unclassified` rather
// than throwing — the navigation backbone must never crash on a bad registry.
// ================================================================================================

export const MECHANISM_CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MED: 'MED', LOW: 'LOW', NONE: 'NONE' });
export const MECHANISM_PROVENANCE = Object.freeze({
  SYMBOL_ANCHOR: 'symbol-anchor', // sibling shares a verb's DISCRIMINATING def symbol — the most precise
  STRUCTURAL_ANCHOR: 'structural-anchor',
  AMBIGUOUS_ANCHOR: 'ambiguous-anchor',
  IMPORT_HOP: 'import-hop',
  LEXICAL_ONLY: 'lexical-only',
  NONE: 'none',
});
export const UNCLASSIFIED_MECHANISM = 'unclassified-mechanism';

/** Strip a leading `./`, normalise separators to posix. Case preserved (repo paths are consistent). */
function normRel(p) {
  if (typeof p !== 'string') return '';
  let s = p.replace(/\\/g, '/').trim();
  while (s.startsWith('./')) s = s.slice(2);
  return s;
}
/** A registry witness is `path:line` — return just the path. Robust to a missing colon. */
function witnessFileOf(witness) {
  if (typeof witness !== 'string') return '';
  const i = witness.lastIndexOf(':');
  return normRel(i > 0 ? witness.slice(0, i) : witness);
}
/** Verb name tokens discriminating enough to lexically match on (>=4 chars). */
function verbTokensOf(verb) {
  return String(verb || '').split('-').filter((t) => t.length >= 4);
}

/**
 * Classify one sibling against the registry verbs. See the block comment above for the tier model.
 * @param {object}   input
 * @param {string}   input.siblingFile     repo-relative file of the sibling
 * @param {string[]} input.witnessNames    shared witness symbol names (lexical surface)
 * @param {string[]} input.siblingImports  repo-relative files the sibling imports (caller-resolved)
 * @param {Array<object>} input.verbs      registry verb records (from loadVerbRecords)
 * @returns {{ verb:string, confidence:string, provenance:string, antiWitness:boolean,
 *            whyMightNotTransfer:(string|null), anchorFile:(string|null), candidates:string[] }}
 */
export function classifyMechanism({ siblingFile, witnessNames = [], siblingImports = [], verbs = [], symbolIndex = null } = {}) {
  const none = {
    verb: UNCLASSIFIED_MECHANISM,
    confidence: MECHANISM_CONFIDENCE.NONE,
    provenance: MECHANISM_PROVENANCE.NONE,
    antiWitness: false,
    whyMightNotTransfer: null,
    anchorFile: null,
    candidates: [],
  };
  if (!Array.isArray(verbs) || verbs.length === 0) return none;

  const sib = normRel(siblingFile);
  const names = (Array.isArray(witnessNames) ? witnessNames : [])
    .filter((n) => typeof n === 'string').map((n) => n.toLowerCase());
  const imports = new Set((Array.isArray(siblingImports) ? siblingImports : [])
    .filter((s) => typeof s === 'string').map(normRel));

  // SYMBOL-ANCHOR (HIGH) — the most precise tier, checked FIRST so it outranks file-anchor. The
  // sibling shares a verb's DISCRIMINATING def symbol (exact identifier match). `symbolIndex`
  // (verb -> [symbols], from buildVerbSymbolIndex) is pre-filtered to drop generic-stoplist names and
  // cross-verb collisions, so a hit is the actual mechanism identifier, not a coincidental generic.
  // Sharing the mechanism's real symbol beats merely living in its file. Fail-open: no index -> skip.
  if (symbolIndex) {
    const sibSyms = (Array.isArray(witnessNames) ? witnessNames : []).filter((n) => typeof n === 'string');
    if (sibSyms.length) {
      for (const v of verbs) {
        if (!v || typeof v.verb !== 'string') continue;
        const syms = typeof symbolIndex.get === 'function' ? symbolIndex.get(v.verb) : symbolIndex[v.verb];
        if (Array.isArray(syms) && syms.some((s) => sibSyms.includes(s))) {
          return {
            verb: v.verb,
            confidence: MECHANISM_CONFIDENCE.HIGH,
            provenance: MECHANISM_PROVENANCE.SYMBOL_ANCHOR,
            antiWitness: false,
            whyMightNotTransfer: null,
            anchorFile: sib || null,
            candidates: [v.verb],
          };
        }
      }
    }
  }

  // Build file -> set of verbs (to detect AMBIGUOUS witness files shared by multiple mechanisms).
  const fileToVerbs = new Map();
  for (const v of verbs) {
    if (!v || typeof v.verb !== 'string') continue;
    const wfiles = Array.isArray(v.witnesses) ? v.witnesses.map(witnessFileOf).filter(Boolean) : [];
    for (const wf of new Set(wfiles)) {
      if (!fileToVerbs.has(wf)) fileToVerbs.set(wf, new Set());
      fileToVerbs.get(wf).add(v.verb);
    }
  }

  // .sort() -> deterministic, name-stable pick when a file witnesses multiple verbs (red-team #4).
  const exactVerbs = sib && fileToVerbs.has(sib) ? [...fileToVerbs.get(sib)].sort() : [];
  const unambiguousExact = exactVerbs.filter((vb) => fileToVerbs.get(sib).size === 1);

  // HIGH — sibling sits at the UNAMBIGUOUS site of exactly one mechanism.
  if (unambiguousExact.length) {
    return {
      verb: unambiguousExact[0],
      confidence: MECHANISM_CONFIDENCE.HIGH,
      provenance: MECHANISM_PROVENANCE.STRUCTURAL_ANCHOR,
      antiWitness: false,
      whyMightNotTransfer: null,
      anchorFile: sib,
      candidates: unambiguousExact,
    };
  }
  // MED — sibling sits at a site SHARED by multiple mechanisms; real co-location, undisambiguated.
  if (exactVerbs.length) {
    return {
      verb: exactVerbs[0],
      confidence: MECHANISM_CONFIDENCE.MED,
      provenance: MECHANISM_PROVENANCE.AMBIGUOUS_ANCHOR,
      antiWitness: false,
      whyMightNotTransfer:
        `'${sib}' is a witness site for ${exactVerbs.length} mechanisms (${exactVerbs.join(', ')}); ` +
        `co-location is real but which one this sibling instantiates is undisambiguated — human read needed.`,
      anchorFile: sib,
      candidates: exactVerbs,
    };
  }
  // MED — import-hop: sibling depends on a verb's witness file (cheap dependency edge).
  for (const v of verbs) {
    if (!v || typeof v.verb !== 'string') continue;
    const wfiles = Array.isArray(v.witnesses) ? v.witnesses.map(witnessFileOf).filter(Boolean) : [];
    const hit = wfiles.find((wf) => imports.has(wf));
    if (hit) {
      return {
        verb: v.verb,
        confidence: MECHANISM_CONFIDENCE.MED,
        provenance: MECHANISM_PROVENANCE.IMPORT_HOP,
        antiWitness: false,
        whyMightNotTransfer:
          `imports the '${hit}' witness file of '${v.verb}' — a dependency edge, not proof the ` +
          `sibling IS the mechanism; verify the shape before transferring.`,
        anchorFile: hit,
        candidates: [v.verb],
      };
    }
  }
  // LOW — lexical-only: vocabulary look-alike with NO structural bond. The anti-witness flag.
  for (const v of verbs) {
    if (!v || typeof v.verb !== 'string') continue;
    const tok = verbTokensOf(v.verb).find((t) => names.some((n) => n.includes(t)));
    if (tok) {
      return {
        verb: v.verb,
        confidence: MECHANISM_CONFIDENCE.LOW,
        provenance: MECHANISM_PROVENANCE.LEXICAL_ONLY,
        antiWitness: true,
        whyMightNotTransfer:
          `name token '${tok}' matched '${v.verb}', but the sibling shares no witness file, no ` +
          `import edge, and no site with it — likely a VOCABULARY look-alike, not a mechanism ` +
          `sibling. Do NOT transfer the cascade without a human read of the actual shape.`,
        anchorFile: null,
        candidates: [v.verb],
      };
    }
  }
  return none;
}

// ================================================================================================
// WITNESS-PROVENANCE MAP (derived, repo-only — NO registry schema change).
//
// The registry's path:line witnesses are hand-authored EVIDENCE anchors, not symbol-definition
// pointers: read live, some land on a clean `function NAME`/`export function NAME`, others on a
// comment, a JSDoc line, or a structural line (`});`, `return {`). A symbol-level matcher that
// assumes every witness is a definition would resolve garbage for the non-DEF ones and promote false
// confidence. This analyzer tags each witness so a future symbol-anchor tier can trust ONLY the DEF
// subset, and so witness drift is visible (a witness whose line moved past EOF -> MISSING).
//
// Repo-derived: reads the witness files at classify-time; injectable `readFile` keeps it testable.
// ================================================================================================

export const WITNESS_ANCHOR = Object.freeze({
  DEF: 'DEF', //         the line defines a symbol (function/class/const) -> symbol captured
  COMMENT: 'COMMENT', // a `//` line comment
  JSDOC: 'JSDOC', //     a `/** ... */` or ` * ...` doc line
  STRUCTURAL: 'STRUCTURAL', // code, but no definition on the line (`});`, `return {`, a call, …)
  MISSING: 'MISSING', // file unreadable OR the line number is past end-of-file (drift signal)
});

const DEF_PATTERNS = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
];

function anchorOfLine(lineText) {
  if (typeof lineText !== 'string') return { anchorType: WITNESS_ANCHOR.STRUCTURAL, symbol: null };
  for (const re of DEF_PATTERNS) {
    const m = re.exec(lineText);
    if (m) return { anchorType: WITNESS_ANCHOR.DEF, symbol: m[1] };
  }
  // Red-team F5/F6: real definition lines that carry NO single capturable symbol — an anonymous
  // default-export function, or a destructuring const/let/var export (`export const { a } = …`).
  // These are still DEF (a future symbol-anchor tier must treat them as definitions, not STRUCTURAL),
  // just with symbol=null. The DEF_PATTERNS above are start-anchored on a keyword, so a `//`/`*`
  // comment line can never reach here — comment classification below stays correct.
  if (/^\s*export\s+default\s+(?:async\s+)?function\b/.test(lineText)
      || /^\s*(?:export\s+)?(?:const|let|var)\s+[{[]/.test(lineText)) {
    return { anchorType: WITNESS_ANCHOR.DEF, symbol: null };
  }
  const t = lineText.trim();
  if (t.startsWith('/**') || t.startsWith('*/') || t.startsWith('*')) return { anchorType: WITNESS_ANCHOR.JSDOC, symbol: null };
  if (t.startsWith('//')) return { anchorType: WITNESS_ANCHOR.COMMENT, symbol: null };
  return { anchorType: WITNESS_ANCHOR.STRUCTURAL, symbol: null };
}

/**
 * Tag every verb witness with its anchor type (+ symbol for DEF lines). Repo-derived; fail-open.
 * @param {Array<object>} verbs    registry verb records
 * @param {object} [opts]
 * @param {(rel:string)=>string} [opts.readFile]  resolves a repo-relative file to its text (test seam)
 * @returns {Array<{verb:string, witness:string, file:string, line:number,
 *                  anchorType:string, symbol:(string|null)}>}
 */
export function classifyWitnessAnchors(verbs, opts = {}) {
  const readFile = typeof opts.readFile === 'function'
    ? opts.readFile
    : (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  const fileCache = new Map();
  const getLines = (rel) => {
    if (fileCache.has(rel)) return fileCache.get(rel);
    let lines = null;
    // Red-team C/#6: split on CRLF-or-LF and drop the phantom trailing-newline element, else a witness
    // pointing one line PAST the real EOF reads as STRUCTURAL (an empty string) instead of MISSING,
    // hiding drift; and a CRLF checkout would leave a stray \r on every line.
    try {
      const raw = readFile(rel);
      lines = raw.split(/\r?\n/);
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
    } catch { lines = null; }
    fileCache.set(rel, lines);
    return lines;
  };

  const out = [];
  if (!Array.isArray(verbs)) return out;
  for (const v of verbs) {
    if (!v || typeof v.verb !== 'string' || !Array.isArray(v.witnesses)) continue;
    for (const w of v.witnesses) {
      if (typeof w !== 'string') continue;
      const i = w.lastIndexOf(':');
      const file = i > 0 ? w.slice(0, i) : w;
      const line = i > 0 ? parseInt(w.slice(i + 1), 10) : NaN;
      const lines = getLines(file);
      if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) {
        out.push({ verb: v.verb, witness: w, file, line: Number.isInteger(line) ? line : null, anchorType: WITNESS_ANCHOR.MISSING, symbol: null });
        continue;
      }
      const { anchorType, symbol } = anchorOfLine(lines[line - 1]);
      out.push({ verb: v.verb, witness: w, file, line, anchorType, symbol });
    }
  }
  return out;
}

// Generic identifiers that appear in many unrelated files — a sibling sharing one of these is NOT
// evidence of a shared mechanism, so they are excluded from the symbol-anchor tier (mimo guard #1).
const GENERIC_SYMBOL_STOPLIST = new Set([
  'init', 'setup', 'run', 'main', 'index', 'default', 'get', 'set', 'data', 'result', 'config', 'state',
  'handle', 'process', 'update', 'create', 'destroy', 'mount', 'unmount', 'render', 'start', 'stop', 'load',
  'save', 'read', 'write', 'parse', 'format', 'validate', 'check', 'build', 'make', 'tojson', 'tostring',
  'constructor', 'value', 'name', 'type', 'id', 'key', 'call', 'apply', 'exec', 'dispatch', 'emit', 'on', 'off',
]);

/**
 * Build the per-verb DISCRIMINATING symbol index for the symbol-anchor tier of classifyMechanism.
 * Each verb's DEF-typed witness symbols (via classifyWitnessAnchors), MINUS generic-stoplist names
 * (guard #1) and MINUS any symbol claimed by >1 verb (guard #2: a cross-verb collision is not
 * discriminating and would mis-fire HIGH). Non-DEF witnesses (comment/jsdoc/structural) contribute no
 * symbol — look-down/comment-text recovery is intentionally deferred (heuristic), so such a verb just
 * falls back to file-anchor. Repo-derived; fail-open (bad input -> empty Map). @returns {Map<string,string[]>}
 */
export function buildVerbSymbolIndex(verbs, opts = {}) {
  const anchors = classifyWitnessAnchors(verbs, opts);
  const perVerb = new Map();
  for (const a of anchors) {
    if (a.anchorType !== WITNESS_ANCHOR.DEF || !a.symbol) continue;
    // Red-team #4: reject morphological variants of a generic name too (_init, init2, run_) by
    // stripping leading underscores + trailing digits/underscores before the stoplist lookup.
    const symLower = a.symbol.toLowerCase();
    if (GENERIC_SYMBOL_STOPLIST.has(symLower)
        || GENERIC_SYMBOL_STOPLIST.has(symLower.replace(/^_+/, '').replace(/[_\d]+$/, ''))) continue;
    if (!perVerb.has(a.verb)) perVerb.set(a.verb, new Set());
    perVerb.get(a.verb).add(a.symbol);
  }
  const claims = new Map();
  for (const set of perVerb.values()) for (const s of set) claims.set(s, (claims.get(s) || 0) + 1);
  const index = new Map();
  for (const [verb, set] of perVerb) {
    const kept = [...set].filter((s) => claims.get(s) === 1);
    if (kept.length) index.set(verb, kept);
  }
  return index;
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  if (process.argv.includes('--anchors')) {
    const { verbs } = loadVerbRecords();
    const map = classifyWitnessAnchors(verbs);
    const tally = map.reduce((acc, m) => ((acc[m.anchorType] = (acc[m.anchorType] || 0) + 1), acc), {});
    console.log(JSON.stringify({ tally, witnesses: map }, null, 2));
  } else {
    const result = validateRegistryFile();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
