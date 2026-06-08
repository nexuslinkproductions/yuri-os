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
import { fileURLToPath } from 'node:url';

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
  ['PROBABILITY', ['probabilit', 'likelihood', 'mass function', 'normalized weight', 'distribution over', 'posterior', 'prior over']],
  ['INFORMATION', ['bit', 'nat', 'entropy', 'shannon', 'surprisal', 'information content', 'log base', 'logarithm base', 'log-base']],
  ['ENERGY', ['energy', 'potential', 'lyapunov', 'joule', 'hamiltonian']],
  ['TIME', ['half-life', 'halflife', 'duration', 'elapsed', 'age in', 'seconds', 'timestamp', 'time step']],
  ['RATE', ['per second', 'hertz', ' hz', 'frequency', 'velocity', 'speed', 'rate of']],
  ['DISTANCE', ['distance', 'cost', 'path length', 'metric distance', 'divergence', 'norm', 'displacement']],
  ['ANGLE', ['radian', 'degree', 'phase angle', 'angular']],
  ['VECTOR', ['vector', 'embedding', 'coordinate', 'tensor', 'matrix']],
  ['COUNT', ['count', 'number of', 'cardinality', 'tally', 'integer count']],
  ['SCORE', ['score', 'rank', 'rating', 'confidence', 'calibration', 'brier', 'loss', 'similarity']],
  ['BOOLEAN', ['boolean', 'binary', 'mask', 'flag', 'true/false', 'indicator']],
  ['DIMENSIONLESS', ['dimensionless', 'unitless', 'ratio', 'fraction', 'scalar', 'pure number', 'coefficient']],
];

// dimensions that behave as interchangeable bounded scalars (pure numbers) for composition purposes.
const SCALAR_FAMILY = new Set(['DIMENSIONLESS', 'PROBABILITY', 'SCORE', 'BOOLEAN']);

export function classifyDimension(unitText) {
  const s = String(unitText ?? '').toLowerCase();
  if (!s.trim()) return { dimension: 'UNKNOWN', witness: null };
  for (const [dimension, keywords] of DIMENSION_PRIORITY) {
    for (const kw of keywords) {
      if (s.includes(kw)) return { dimension, witness: kw };
    }
  }
  return { dimension: 'UNKNOWN', witness: null };
}

// Two dimensions may bridge iff: equal; OR either is UNKNOWN (cannot be disproven — allowed, low confidence);
// OR both are scalar-family pure numbers. A concrete mismatch (INFORMATION↔DISTANCE, PROBABILITY↔ENERGY, …) is
// REJECTED — that rejection is the silent-garbage closer.
export function dimensionsCompatible(a, b) {
  if (a === b) return { compatible: true, confidence: 'exact', reason: `both ${a}` };
  if (a === 'UNKNOWN' || b === 'UNKNOWN') return { compatible: true, confidence: 'low', reason: 'undetermined dimension (cannot disprove)' };
  if (SCALAR_FAMILY.has(a) && SCALAR_FAMILY.has(b)) return { compatible: true, confidence: 'scalar', reason: 'both scalar-family pure numbers' };
  return { compatible: false, confidence: 'exact', reason: `dimensional mismatch: ${a} ↛ ${b}` };
}

// ------------------------------------------------------------------------------------------------
// CATALOG — unified read-view over the existing typed bank cards (does NOT mint cards)
// ------------------------------------------------------------------------------------------------
function readBankFiles() {
  if (!fs.existsSync(BANK_DIR)) return [];
  return fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.json')).sort();
}

export function catalogFormulas() {
  const cards = [];
  for (const file of readBankFiles()) {
    let bank;
    try { bank = JSON.parse(fs.readFileSync(path.join(BANK_DIR, file), 'utf8')); } catch { continue; }
    const bankId = bank.id || file.replace(/\.json$/, '');
    for (const f of Array.isArray(bank.formulas) ? bank.formulas : []) {
      const inputs = (f.units && typeof f.units.inputs === 'object' && f.units.inputs) || {};
      const inputDims = {};
      for (const slot of Object.keys(inputs).sort()) inputDims[slot] = classifyDimension(inputs[slot]).dimension;
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
        inputDims,
        synthesisProvenance: Array.isArray(f.synthesisProvenance) ? f.synthesisProvenance : [],
      });
    }
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  return { cards, count: cards.length, banks: readBankFiles().length };
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
  if (cardA.id === cardB.id) return { legal: false, compatibleSlots: [], reasons: ['self-composition not allowed'], from: cardA.id, to: cardB.id };
  const outDim = cardA.outputDim || 'UNKNOWN';
  const slots = Object.keys(cardB.inputDims || {}).sort();
  const compatibleSlots = [];
  const reasons = [];
  for (const slot of slots) {
    const inDim = cardB.inputDims[slot];
    const c = dimensionsCompatible(outDim, inDim);
    if (c.compatible) compatibleSlots.push({ slot, fromDim: outDim, toDim: inDim, confidence: c.confidence });
    else reasons.push(`slot '${slot}': ${c.reason}`);
  }
  return {
    legal: compatibleSlots.length > 0,
    compatibleSlots,
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
// CLI
// ------------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
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
