#!/usr/bin/env node
/**
 * formula-foundry.mjs — the Formula Foundry typing core (catalog · coverage · composition type-algebra).
 *
 * Built from the 9-lane design wave + blind control (02_RESOURCES/RESEARCH/yuri-formula-foundry-spec-2026-06-08.md).
 * The blind control (3 isolated first-principles agents) found the engine's load-bearing core is a COUPLED PAIR:
 *   (A) dimensional/semantic TYPING of formula symbols — the legal-move generator, and
 *   (B) a held-out executable VALIDATION ORACLE — already shipped as math-proof-gate.mjs.
 * Core B exists. This module is Core A made EXECUTABLE: it reads the existing typed formula-bank cards, classifies
 * each card's input/output UNITS into a deterministic closed-set dimension, and decides whether one formula's
 * output may legally feed another's input. That dimensional check (rule 3 below) is the line that rejects
 * "bits → length" / "probability into an energy slot" — the silent-garbage hole the whole engine exists to close.
 *
 * Deterministic + embedding-free by construction: no RNG, no clock, sorted iteration, closed-set classification.
 * Reads the existing banks (does not mint cards). Combine/synthesis + bakeoff are separate modules (next build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFormulaBank } from './math-proof-gate.mjs'; // Core B oracle door (preflight)

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // _SYSTEM/Scripts/math
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');     // repo root (math → Scripts → _SYSTEM → root)
const BANK_DIR = path.join(REPO_ROOT, '_SYSTEM/data/math/formula-banks');

// ------------------------------------------------------------------------------------------------
// DIMENSION CLASSIFIER — the closed-set, prose → dimension map (Core A, the legal-move grammar).
// Units in the bank cards are PROSE ("bits when base=2", "dimensionless probability weights"), so the
// dimensional type system is a deterministic closed-set classifier with keyword witnesses. Classes are
// tried in a FIXED specific→general priority so a multi-keyword string resolves deterministically
// (e.g. "dimensionless probability weights" → PROBABILITY, not DIMENSIONLESS).
// ------------------------------------------------------------------------------------------------
const DIMENSION_PRIORITY = [
  // INFORMATION above PROBABILITY: log-loss prose 'mean negative log likelihood
  // in nats' must route via 'nat', not be stolen by 'likelihood'. Bare
  // 'likelihood' stays in PROBABILITY (bayes likelihood slots depend on it).
  ['INFORMATION', ['bit', 'nat', 'entropy', 'shannon', 'surprisal', 'information content', 'log base', 'logarithm base', 'log-base', 'negative log likelihood', 'log likelihood', 'log-likelihood']],
  ['PROBABILITY', ['probabilit', 'likelihood', 'mass function', 'normalized weight', 'distribution over', 'posterior', 'prior over']],
  ['ENERGY', ['energy', 'potential', 'lyapunov', 'joule', 'hamiltonian']],
  ['TIME', ['half-life', 'halflife', 'duration', 'elapsed', 'age in', 'seconds', 'timestamp', 'time step', 'time constant']],
  ['RATE', ['per second', 'hertz', ' hz', 'frequency', 'velocity', 'speed', 'rate of']],
  // 'cost' alone was over-generic: 'outcome utility or cost units' stole
  // DISTANCE for expected-value. Only graph-flavored cost prose qualifies.
  ['DISTANCE', ['distance', 'path cost', 'edge cost', 'graph cost', 'path length', 'metric distance', 'divergence', 'norm', 'displacement']],
  ['ANGLE', ['radian', 'degree', 'phase angle', 'angular']],
  ['VECTOR', ['vector', 'embedding', 'coordinate', 'tensor', 'matrix']],
  ['COUNT', ['count', 'number of', 'cardinality', 'tally', 'integer count']],
  ['SCORE', ['score', 'rank', 'rating', 'confidence', 'calibration', 'brier', 'loss', 'similarity']],
  ['BOOLEAN', ['boolean', 'binary', 'mask', 'flag', 'true/false', 'indicator']],
  ['DIMENSIONLESS', ['dimensionless', 'unitless', 'ratio', 'fraction', 'scalar', 'pure number', 'coefficient']],
];

// dimensions that behave as interchangeable bounded scalars (pure numbers) for composition purposes.
const SCALAR_FAMILY = new Set(['DIMENSIONLESS', 'PROBABILITY', 'SCORE', 'BOOLEAN']);

// Whole-word / phrase match (with optional plural) instead of raw substring. A prior version used
// s.includes(kw), so short witnesses collided with ordinary English: 'bit'∈inhiBITory, 'nat'∈coordiNATe,
// 'norm'∈NORMalized — silently retyping the dimension and defeating the composition legality gate (Core A).
// Word boundaries are [^a-z0-9]; keywords are trimmed; a trailing 's' is tolerated (bit→bits, nat→nats).
const DIM_KEYWORD_RE = new Map();
function dimensionKeywordHit(s, kw) {
  let re = DIM_KEYWORD_RE.get(kw);
  if (!re) {
    const t = kw.trim();
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Short tokens (<=5) are the collision-prone ones (bit∈inhibitory, nat∈coordinate, bit∈bitcoin) → require a
    // full word boundary on BOTH sides, tolerating a trailing plural 's' (bit→bits, nat→nats). Longer keywords are
    // deliberate STEMS (probabilit→probability/probabilistic, likelihood→likelihoods) → left boundary only, so
    // prefix/stem matching still works while still rejecting mid-word substrings.
    re = t.length <= 5
      ? new RegExp('(?:^|[^a-z0-9])' + esc + 's?(?:[^a-z0-9]|$)')
      : new RegExp('(?:^|[^a-z0-9])' + esc);
    DIM_KEYWORD_RE.set(kw, re);
  }
  return re.test(s);
}

// @capability: formula-foundry
// @serves: generate and type-check candidate formulas | dimensional analysis | are these units composable | formula catalog coverage | auto-propose formula forms | composition type-algebra
// @does: Formula Foundry typing core — classifyDimension, dimensionsCompatible, catalogFormulas, composeCheck, composableTargets; a dimensional/type algebra over formulas (catalog · coverage · composition)
// @use: when proposing or validating a formula/value-model form (e.g. retiring a hand-encoded value() in a sim) type-check dimensional compatibility + enumerate composable targets; pair with math-proof-gate to promote
// @exports: classifyDimension, dimensionsCompatible, parseRange, catalogFormulas, composeCheck, composableTargets
export function classifyDimension(unitText) {
  if (unitText == null) return { dimension: 'UNKNOWN', witness: null };
  // Unit fields are prose strings; object/array coercion could manufacture a false confident witness.
  if (typeof unitText !== 'string') return { dimension: 'UNKNOWN', witness: null, malformed: true };
  const s = unitText.toLowerCase();
  if (!s.trim()) return { dimension: 'UNKNOWN', witness: null };
  for (const [dimension, keywords] of DIMENSION_PRIORITY) {
    for (const kw of keywords) {
      if (dimensionKeywordHit(s, kw)) return { dimension, witness: kw };
    }
  }
  return { dimension: 'UNKNOWN', witness: null };
}

// Two dimensions may bridge iff: equal; OR both are scalar-family pure numbers.
// UNKNOWN on either side is SPECULATIVE-ONLY (fail-closed): a card with
// unclassifiable units stops generating 'legal' moves and surfaces as a
// units-prose worklist item instead. A concrete mismatch (INFORMATION↔DISTANCE,
// PROBABILITY↔ENERGY, …) is REJECTED — that rejection is the silent-garbage closer.
export function dimensionsCompatible(a, b) {
  // UNKNOWN before equality: UNKNOWN === UNKNOWN must NOT mint an 'exact'
  // bridge — two unclassifiable cards prove nothing about each other.
  if (a === 'UNKNOWN' || b === 'UNKNOWN') return { compatible: false, confidence: 'speculative', reason: 'undetermined dimension — speculative only, not a legal move' };
  if (a === b) return { compatible: true, confidence: 'exact', reason: `both ${a}` };
  if (SCALAR_FAMILY.has(a) && SCALAR_FAMILY.has(b)) return { compatible: true, confidence: 'scalar', reason: 'both scalar-family pure numbers' };
  return { compatible: false, confidence: 'exact', reason: `dimensional mismatch: ${a} ↛ ${b}` };
}

// Parse a numeric range out of units prose: '[0,1]', 'from -1 to 1'. Closed
// regex set covering all shipped range prose; null when the card is range-silent.
export function parseRange(unitText) {
  const s = String(unitText || '');
  const m = s.match(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/)
    || s.match(/from\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/i);
  return m ? { lo: Number(m[1]), hi: Number(m[2]) } : null;
}

// Derive the information unit of an INFORMATION-typed prose string: 'bits' /
// 'nats' when unambiguous, 'conditional' when both appear ('bits when base=2,
// nats when base=e'), null when silent.
function deriveInfoUnit(unitText) {
  if (typeof unitText !== 'string') return null;
  const s = unitText.toLowerCase();
  const hasBit = dimensionKeywordHit(s, 'bit');
  const hasNat = dimensionKeywordHit(s, 'nat');
  if (hasBit && hasNat) return 'conditional';
  if (hasBit) return 'bits';
  if (hasNat) return 'nats';
  return null;
}

// ------------------------------------------------------------------------------------------------
// CATALOG — unified read-view over the existing typed bank cards (does NOT mint cards)
// ------------------------------------------------------------------------------------------------
function readBankFiles(bankDir = BANK_DIR) {
  if (!fs.existsSync(bankDir)) return [];
  return fs.readdirSync(bankDir).filter((f) => f.endsWith('.json')).sort();
}

export function catalogFormulas(opts = {}) {
  const bankDir = opts.bankDir ? path.resolve(String(opts.bankDir)) : BANK_DIR;
  const bankFiles = readBankFiles(bankDir);
  const cards = [];
  const skipped = [];
  for (const file of bankFiles) {
    let bank;
    try { bank = JSON.parse(fs.readFileSync(path.join(bankDir, file), 'utf8')); } catch (e) {
      // Corrupt bank files must be visible; silently shrinking the catalog hides coverage/composition loss.
      skipped.push({ file, error: String((e && e.message) || e) });
      continue;
    }
    const bankId = bank.id || file.replace(/\.json$/, '');
    for (const f of Array.isArray(bank.formulas) ? bank.formulas : []) {
      const inputs = (f.units && typeof f.units.inputs === 'object' && f.units.inputs) || {};
      const inputDims = {};
      const inputRanges = {};
      const inputInfoUnits = {};
      for (const slot of Object.keys(inputs).sort()) {
        inputDims[slot] = classifyDimension(inputs[slot]).dimension;
        inputRanges[slot] = parseRange(inputs[slot]);
        inputInfoUnits[slot] = deriveInfoUnit(inputs[slot]);
      }
      // Card-declared parameter slots (base/temperature/epsilon/halfLife/…) are
      // never composition targets; entries that don't exist in units.inputs are
      // skipped and surfaced via malformedParameterSlots.
      const declaredParams = Array.isArray(f.units && f.units.parameterSlots) ? f.units.parameterSlots : [];
      const parameterSlots = declaredParams.filter((s) => s in inputs).sort();
      const malformedParameterSlots = declaredParams.filter((s) => !(s in inputs)).sort();
      cards.push({
        id: String(f.id || ''),
        bank: bankId,
        domain: f.domain || bank.domain || null,
        sourceDomains: Array.isArray(f.sourceDomains) ? f.sourceDomains : (f.domain ? [f.domain] : []),
        promotionStatus: f.promotionStatus || bank.promotionStatus || 'research',
        advisoryOnly: f.advisoryOnly === true || bank.advisoryOnly === true,
        implementedBy: f.implementedBy || (f.implementationBinding && f.implementationBinding.binding) || null,
        variables: Array.isArray(f.variables) ? f.variables : [],
        outputDim: classifyDimension(f.units && f.units.output).dimension,
        outputRange: parseRange(f.units && f.units.output),
        outputInfoUnit: deriveInfoUnit(f.units && f.units.output),
        inputDims,
        inputRanges,
        inputInfoUnits,
        parameterSlots,
        ...(malformedParameterSlots.length ? { malformedParameterSlots } : {}),
        synthesisProvenance: Array.isArray(f.synthesisProvenance) ? f.synthesisProvenance : [],
      });
    }
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  return { cards, count: cards.length, banks: bankFiles.length, skipped };
}

// ------------------------------------------------------------------------------------------------
// COVERAGE — cross-ref kernel exports against bank-card implementedBy bindings (the author-next worklist)
// ------------------------------------------------------------------------------------------------
function kernelSymbol(implementedBy) {
  const m = String(implementedBy || '').split('#');
  return m.length === 2 ? m[1].trim() : null;
}

export async function coverageReport() {
  const { cards } = catalogFormulas();
  let kernelExports = [];
  try { kernelExports = Object.keys(await import('./math-kernel.mjs')).filter((k) => k !== 'default'); } catch { kernelExports = []; }
  const boundSymbols = new Set(cards.map((c) => kernelSymbol(c.implementedBy)).filter(Boolean));
  // a kernel fn that no card binds = an UNBOUND PRIMITIVE (a formula we could author a card for)
  const unboundPrimitives = kernelExports.filter((sym) => !boundSymbols.has(sym)).sort((a, b) => a.localeCompare(b));
  // a card whose implementedBy symbol is not a real kernel export = an ORPHAN CARD (broken binding)
  const orphanCards = cards
    .filter((c) => { const s = kernelSymbol(c.implementedBy); return s && !kernelExports.includes(s); })
    .map((c) => ({ id: c.id, implementedBy: c.implementedBy }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    boundCount: boundSymbols.size,
    kernelExportCount: kernelExports.length,
    unboundPrimitives,
    orphanCards,
    cardCount: cards.length,
  };
}

// ------------------------------------------------------------------------------------------------
// COMPOSITION TYPE-ALGEBRA — the legal-move rule A ▸ B (the spec's 4 rules; rule 3 is load-bearing)
// ------------------------------------------------------------------------------------------------
// A card's OUTPUT (one dimension) may feed a card's INPUT slot (one dimension per slot). composeCheck finds
// every slot of B that A's output can legally feed. Empty = illegal composition.
export function composeCheck(cardA, cardB) {
  if (!cardA || !cardB) throw new Error('composeCheck requires two catalog cards');
  if (cardA.id === cardB.id) return { legal: false, compatibleSlots: [], speculativeSlots: [], excludedSlots: [], reasons: ['self-composition not allowed'], from: cardA.id, to: cardB.id };
  const outDim = cardA.outputDim || 'UNKNOWN';
  const outRange = cardA.outputRange || null;
  const outInfoUnit = cardA.outputInfoUnit || null;
  const paramSet = new Set(cardB.parameterSlots || []);
  const slots = Object.keys(cardB.inputDims || {}).sort();
  const compatibleSlots = [];
  const speculativeSlots = []; // UNKNOWN-dimension candidates: visible, never legal
  const excludedSlots = [];    // dimension-compatible but range/unit-unsound: visible, never legal
  const reasons = [];
  // Slot-check ordering is load-bearing: parameter → dimension → range → bits/nats.
  for (const slot of slots) {
    const inDim = cardB.inputDims[slot];
    if (paramSet.has(slot)) {
      reasons.push(`slot '${slot}': parameter slot — composition may only feed data slots`);
      continue;
    }
    const c = dimensionsCompatible(outDim, inDim);
    if (!c.compatible) {
      if (c.confidence === 'speculative') speculativeSlots.push({ slot, fromDim: outDim, toDim: inDim });
      else reasons.push(`slot '${slot}': ${c.reason}`);
      continue;
    }
    // Range containment runs on ALL confidence tiers for scalar-family pairs
    // (the [-1,1]→[0,1] hole lives on the 'exact' same-dimension path too).
    // Range-silent cards keep the slot but carry rangeUnverified:true — a
    // stated-units bridge cannot be disproven, only flagged.
    const inRange = (cardB.inputRanges || {})[slot] || null;
    const scalarPair = SCALAR_FAMILY.has(outDim) && SCALAR_FAMILY.has(inDim);
    if (scalarPair && outRange && inRange && !(outRange.lo >= inRange.lo && outRange.hi <= inRange.hi)) {
      excludedSlots.push({ slot, fromDim: outDim, toDim: inDim, reason: `range mismatch [${outRange.lo},${outRange.hi}] ↛ [${inRange.lo},${inRange.hi}]: needs explicit clamp/affine node` });
      continue;
    }
    // bits ↛ nats without an explicit ln2 conversion node; 'conditional'/null
    // info units cannot be disproven and stay compatible.
    const inInfoUnit = (cardB.inputInfoUnits || {})[slot] || null;
    if (outDim === 'INFORMATION' && inDim === 'INFORMATION'
      && (outInfoUnit === 'bits' || outInfoUnit === 'nats')
      && (inInfoUnit === 'bits' || inInfoUnit === 'nats')
      && outInfoUnit !== inInfoUnit) {
      excludedSlots.push({ slot, fromDim: outDim, toDim: inDim, reason: `${outInfoUnit} ↛ ${inInfoUnit}: requires explicit ln2 conversion node` });
      continue;
    }
    const entry = { slot, fromDim: outDim, toDim: inDim, confidence: c.confidence };
    if (scalarPair && (!outRange || !inRange)) entry.rangeUnverified = true;
    compatibleSlots.push(entry);
  }
  return {
    legal: compatibleSlots.length > 0,
    compatibleSlots,
    speculativeSlots,
    excludedSlots,
    reasons: compatibleSlots.length > 0 ? [] : (reasons.length ? reasons : [`B has no input slots to receive ${outDim}`]),
    from: cardA.id,
    to: cardB.id,
    outputDim: outDim,
  };
}

// Enumerate every catalog card B that cardA can legally feed (deterministic, sorted).
export function composableTargets(cardA, catalog = null) {
  const cards = (catalog && catalog.cards) || catalogFormulas().cards;
  const out = [];
  for (const cardB of cards) {
    const r = composeCheck(cardA, cardB);
    if (r.legal) out.push({ to: cardB.id, slots: r.compatibleSlots.map((s) => s.slot), outputDim: r.outputDim });
  }
  out.sort((a, b) => a.to.localeCompare(b.to));
  return out;
}

// ------------------------------------------------------------------------------------------------
// SYNTHESIS VERB — bounded, deterministic, dimensionally-legal chain enumeration → INERT research cards.
// Generation is unbounded-creative at the hypothesis stage; only PROMOTION is gated. Every candidate is
// promotionStatus:'research', advisoryOnly:true, implementedBy:null — it CANNOT promote until someone binds
// a real math-kernel symbol AND it passes a green worked example through math-proof-gate (Core B).
// ------------------------------------------------------------------------------------------------
const SYNTH_DEFAULTS = Object.freeze({ maxChainLength: 4, maxBranchingPerNode: 24, maxCandidates: 256 });
// ALL candidate domains are FIRST-CLASS — information-theory, graph, probability, physics, AND music-theory,
// frequency/wave, magnetism, numerology, alchemy (fundamental resonance/harmony/field/ratio structures our
// pioneers built real engineering on). The promotion gate is DOMAIN-BLIND: every candidate, whatever its source
// domains, is inert until it binds a real math-kernel symbol AND passes a green worked example through
// math-proof-gate. No domain is privileged; none is denied — we operate WITH all of them. (opts.domains is a
// neutral allow-list filter, not a value judgment.)
// FNV-1a 32-bit — stable content-addressed id (no crypto, no clock; same chain → same id across runs).
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

// Enumerate every DIMENSIONALLY-LEGAL operator chain (each hop passes composeCheck) — bounded + deterministic.
export function composeOperatorSequences(catalog = null, opts = {}) {
  const cat = catalog && Array.isArray(catalog.cards) ? catalog : catalogFormulas();
  const cards = cat.cards.slice().sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const minLen = Math.max(2, Number.isFinite(opts.minChainLength) ? opts.minChainLength : 2);
  const maxLen = Math.max(minLen, Number.isFinite(opts.maxChainLength) ? opts.maxChainLength : SYNTH_DEFAULTS.maxChainLength);
  const maxBranch = Math.max(1, Number.isFinite(opts.maxBranchingPerNode) ? opts.maxBranchingPerNode : SYNTH_DEFAULTS.maxBranchingPerNode);
  const maxCandidates = Math.max(1, Number.isFinite(opts.maxCandidates) ? opts.maxCandidates : SYNTH_DEFAULTS.maxCandidates);
  // neutral domain allow-list (focus synthesis on certain source domains); absent ⇒ all domains, equally.
  const domainFilter = Array.isArray(opts.domains) && opts.domains.length
    ? new Set(opts.domains.map((d) => String(d).toLowerCase())) : null;
  const startSet = Array.isArray(opts.startIds) && opts.startIds.length
    ? opts.startIds.filter((id) => byId.has(id)).sort((a, b) => a.localeCompare(b)) : cards.map((c) => c.id);
  const endSet = Array.isArray(opts.endIds) && opts.endIds.length ? new Set(opts.endIds.filter((id) => byId.has(id))) : null;

  let truncated = false;
  const truncation = {
    branchDropped: 0,
    domainFiltered: 0,
    endFiltered: 0,
    startPruned: Array.isArray(opts.startIds) && opts.startIds.length ? Math.max(0, cards.length - startSet.length) : 0,
    filtersApplied: {
      domains: Boolean(domainFilter),
      startIds: Array.isArray(opts.startIds) && opts.startIds.length > 0,
      endIds: Boolean(endSet),
    },
  };

  const succ = (id) => {
    const cardA = byId.get(id); if (!cardA) return [];
    const out = [];
    for (const t of composableTargets(cardA, { cards })) { // sorted by .to
      if (t.to === id) continue;
      const cardB = byId.get(t.to); if (!cardB) continue;
      const slot = (t.slots || []).slice().sort((a, b) => a.localeCompare(b))[0]; if (!slot) continue;
      // A maxBranch cut drops legal successors; surface that incompleteness instead of claiming full enumeration.
      if (out.length >= maxBranch) { truncation.branchDropped++; truncated = true; continue; }
      out.push({ to: t.to, slot, fromDim: t.outputDim || 'UNKNOWN', toDim: (cardB.inputDims || {})[slot] || 'UNKNOWN' });
    }
    return out;
  };

  const sequences = [];
  const walk = (chain, hops) => {
    if (sequences.length >= maxCandidates) { truncated = true; return; }
    const last = chain[chain.length - 1];
    if (chain.length >= minLen && (!endSet || endSet.has(last))) {
      const domains = [...new Set(chain.flatMap((id) => byId.get(id).sourceDomains || []))].sort();
      if (!domainFilter || domains.some((d) => domainFilter.has(String(d).toLowerCase()))) {
        sequences.push({ chain: chain.slice(), hops: hops.slice(), outputDim: byId.get(last).outputDim || 'UNKNOWN', sourceDomains: domains, length: chain.length });
      } else truncation.domainFiltered++;
    } else if (chain.length >= minLen && endSet && !endSet.has(last)) {
      truncation.endFiltered++;
    }
    if (chain.length >= maxLen) return;
    for (const s of succ(last)) {
      if (chain.includes(s.to)) continue; // acyclic
      walk([...chain, s.to], [...hops, s]);
      if (sequences.length >= maxCandidates) { truncated = true; return; }
    }
  };
  for (const startId of startSet) { if (sequences.length >= maxCandidates) { truncated = true; break; } walk([startId], []); }
  sequences.sort((a, b) => a.chain.join('>').localeCompare(b.chain.join('>')));
  return { sequences, count: sequences.length, truncated, truncation, params: { minLen, maxLen, maxBranch, maxCandidates } };
}

// Turn legal chains into INERT research candidate descriptors (no promotion, no binding).
export function synthesizeFormulaCandidates(opts = {}) {
  const cat = opts.catalog || catalogFormulas();
  const { sequences, truncated } = composeOperatorSequences(cat, opts);
  const byId = new Map(cat.cards.map((c) => [c.id, c]));
  const candidates = sequences.map((seq) => ({
    id: `synth.${seq.chain[0]}__${seq.chain[seq.chain.length - 1]}.${fnv1a(seq.chain.join('>'))}`,
    promotionStatus: 'research',
    advisoryOnly: true,
    implementedBy: null, // INERT: no kernel binding → cannot promote
    synthesisProvenance: seq.chain.slice(),
    sourceDomains: seq.sourceDomains,
    outputDim: seq.outputDim,
    operators: seq.chain.map((cid) => byId.get(cid).implementedBy || cid),
    hops: seq.hops,
  }));
  return { candidates, count: candidates.length, truncated };
}

// Mint a research-status, bank-card-shaped object from a candidate (still inert — no implementedBy).
export function draftFormulaBankCard(candidate) {
  if (!candidate || !Array.isArray(candidate.synthesisProvenance)) throw new Error('draftFormulaBankCard requires a synthesized candidate');
  return {
    id: candidate.id,
    notation: `synthesized chain: ${candidate.synthesisProvenance.join(' > ')}`,
    purpose: `candidate combination of ${candidate.synthesisProvenance.join(', ')} (research-status; inert until kernel-bound + green worked example)`,
    domain: (candidate.sourceDomains || [])[0] || 'synthesis',
    sourceDomains: candidate.sourceDomains || [],
    promotionStatus: 'research',
    advisoryOnly: true,
    synthesisProvenance: candidate.synthesisProvenance.slice(),
    // Preserve a caller-supplied binding + counterexamples: without this,
    // stage0 wiped the binding and bakeoff stage1 (hasBinding && validationOk)
    // was unreachable for EVERY candidate — promotable was structurally dead.
    // Default synthesis candidates still carry implementedBy:null (inert).
    implementedBy: candidate.implementedBy || null,
    counterexamples: Array.isArray(candidate.counterexamples) ? candidate.counterexamples.slice() : [],
    variables: [],
    units: { inputs: {}, output: candidate.outputDim || 'UNKNOWN' },
    proofObligations: [
      'MUST bind a real math-kernel symbol via implementedBy',
      'MUST pass a green worked example through runFormulaProofGate',
    ],
  };
}

// wrap a single draft card as a minimal bank so validateFormulaBank (the public door that fires the private
// validateFormulaCard + assertImplementedBySymbolResolves) runs the full card contract on it.
function wrapAsProofBank(card) {
  return { schema: 'yuri.math.formula-bank.v0', id: `preflight.${card.id}`, version: '0.0.0', promotionStatus: 'research', advisoryOnly: true, formulas: [card] };
}

// Run a draft research card through the Core B oracle. A card with NO implementedBy is INERT by construction —
// the symbol resolution has nothing to bind, so it can never pass the gate and can never promote.
export function proofPreflightCandidate(card, opts = {}) {
  let validation = null;
  try { validation = validateFormulaBank(wrapAsProofBank(card), opts.validateOptions || {}); } catch (e) { validation = { ok: false, errors: [String((e && e.message) || e)] }; }
  const hasBinding = Boolean(card && card.implementedBy);
  const inert = !hasBinding || card.promotionStatus === 'research' || card.advisoryOnly === true;
  return {
    inert,
    hasBinding,
    reason: hasBinding
      ? 'declares a kernel binding — still inert at research/advisory; real promotion needs a green worked example via runFormulaProofGate'
      : 'no implementedBy binding → inert by construction (no kernel symbol to resolve, cannot pass the proof-gate)',
    promotionStatus: (card && card.promotionStatus) || 'research',
    advisoryOnly: !(card && card.advisoryOnly === false),
    validationOk: Boolean(validation && validation.ok),
    validationErrors: (validation && validation.errors) || [],
  };
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const op = process.argv[2] || 'catalog';
  const arg = process.argv[3];
  const json = process.argv.includes('--json');
  (async () => {
    if (op === 'catalog') {
      const c = catalogFormulas();
      process.stdout.write(json ? JSON.stringify(c, null, 2) + '\n'
        : `formula catalog: ${c.count} cards across ${c.banks} banks\n` + c.cards.map((x) => `  ${x.id.padEnd(28)} [${x.outputDim}] <- {${Object.entries(x.inputDims).map(([s, d]) => `${s}:${d}`).join(', ')}}`).join('\n') + '\n');
    } else if (op === 'coverage') {
      const r = await coverageReport();
      process.stdout.write(json ? JSON.stringify(r, null, 2) + '\n'
        : `coverage: ${r.boundCount}/${r.kernelExportCount} kernel fns bound by ${r.cardCount} cards\n  UNBOUND primitives (${r.unboundPrimitives.length}): ${r.unboundPrimitives.join(', ')}\n  ORPHAN cards (${r.orphanCards.length}): ${r.orphanCards.map((o) => o.id).join(', ')}\n`);
    } else if (op === 'compose' && arg) {
      const { cards } = catalogFormulas();
      const cardA = cards.find((c) => c.id === arg);
      if (!cardA) { process.stderr.write(`unknown card: ${arg}\n`); process.exitCode = 1; return; }
      const targets = composableTargets(cardA, { cards });
      process.stdout.write(json ? JSON.stringify({ from: arg, outputDim: cardA.outputDim, targets }, null, 2) + '\n'
        : `${arg} [${cardA.outputDim}] can legally feed ${targets.length} cards:\n` + targets.map((t) => `  ${t.to} (slots: ${t.slots.join(', ')})`).join('\n') + '\n');
    } else {
      process.stderr.write('usage: formula-foundry.mjs <catalog|coverage|compose <cardId>> [--json]\n');
      process.exitCode = 1;
    }
  })();
}
