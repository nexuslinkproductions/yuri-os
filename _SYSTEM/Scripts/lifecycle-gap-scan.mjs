#!/usr/bin/env node
// lifecycle-gap-scan.mjs — READ-ONLY LRN lifecycle loop-closer (Wave-1 / SEAM-2).
//
// CONTRACT (three-seams §SEAM-2 "the lifecycle loop", master-plan WAVE-1):
//   The lifecycle loop is closed by walking the REAL formula-card population —
//   the card banks under _SYSTEM/data/math/formula-banks/*.v0.json — NOT the
//   architecture graph and NOT the math-kernel export surface. Each card carries
//   a `domain` field (the `organ` field is absent everywhere); the organ is
//   DERIVED from `domain` via a pinned map. A MATH-SECTOR ALLOWLIST restricts the
//   scan to math-bearing organs only, so the permanent non-math sectors
//   (unassigned, services, operator_io, control_plane, prompt_hooks,
//   command_registry) are NEVER reported as gaps (the prior tool flooded exactly
//   these — see lifecycle-gap-scan-2026-06-04.json orphan_organ list).
//
// Four deficit classes (SEAM-2 + the closed-set fail-loud hardening):
//   (a) GAP_ORGAN_NO_CARDS          — a math-bearing organ with 0 cards.
//   (b) GAP_PATTERN_UNDER_PROPAGATED — a mechanismPattern with exactly 1 instance
//                                      (under-propagated; rule-of-three not met).
//   (c) GAP_STALE_BASELINE          — a verified-baseline card whose SOURCE mtime
//                                      is > 30d old with no fresher canary signal.
//   (d) GAP_UNMAPPED_DOMAIN         — a card carrying a NON-EMPTY domain that is
//                                      neither MAPPED (→organ) nor EXPLICITLY
//                                      EXCLUDED. Closed-set fail-loud: there are
//                                      exactly TWO legal buckets for a present
//                                      domain; anything else is a LOUD ACTIONABLE
//                                      deficit (never the old silent `unmapped:<x>`
//                                      drop that let a brand-new organ land while
//                                      the tool reported "0 gaps"). See
//                                      02_RESOURCES/CODE-BIBLE/mechanisms/
//                                      closed-set-fail-closed-validator.md.
//
// DEDUP + UNACTIONABLE (so a blocked MINT does not become an infinite re-notifier):
//   - dedup targets against the open backlog (this tool's own prior report) AND
//     hypotheses.json (active + validated arrays).
//   - any target that REQUIRES an unbuilt kernel primitive (card.id has no entry
//     in math-proof-gate's FORMULA_IMPLEMENTATIONS binding registry) is marked
//     UNACTIONABLE and excluded from the actionable target list.
//
// READ-ONLY CONTRACT: reads card banks + proof-gate binding registry + graph
// sectors (allowlist sanity only) + dedup sources, and writes EXACTLY ONE
// artifact — its own report at
// _SYSTEM/SELF-IMPROVEMENT/lifecycle-gap-scan-<date>.json (override with --out).
// NEVER writes the graph, NEVER mutates a bank, exits 0 (advisory). Emits
// deterministic evidence-grammar lines (TERM_COUNT / FILE_COUNT / MATCH).
//
// Usage:
//   node _SYSTEM/Scripts/lifecycle-gap-scan.mjs \
//     [--banks <dir>] [--graph <path>] [--proof-gate <path>] \
//     [--hypotheses <path>] [--backlog <path>] [--out <path>] \
//     [--stale-days <N>] [--json] [--no-write]

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANKS_DIR = path.join(REPO_ROOT, '_SYSTEM', 'data', 'math', 'formula-banks');
const GRAPH_STATE = path.join(REPO_ROOT, '_SYSTEM', 'yuri-graph-state.json');
const PROOF_GATE = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'math', 'math-proof-gate.mjs');
const HYPOTHESES = path.join(REPO_ROOT, '_SYSTEM', '.claude', 'yuri-sentinel', 'learning', 'hypotheses.json');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT');
const STALE_DAYS_DEFAULT = 30;

// ---------------------------------------------------------------------------
// MATH-SECTOR ALLOWLIST. These are the math-bearing organs the loop walks. Any
// organ NOT in this set is structurally excluded from gap emission. The excluded
// set below is the live non-math sector population confirmed against
// yuri-graph-state.json; flagging any of them is the false-gap flood we replace.
// ---------------------------------------------------------------------------
const MATH_BEARING_ORGANS = new Set([
  'self_improvement', // the organ math formula-cards land in (graph sector)
  'pulse_cortex',     // epistemic-energy math (entropy / brier / log-loss)
  'classification',   // scoring + normalization math
]);

// Permanent NON-MATH sectors — never a gap (the prior tool flooded these).
const EXCLUDED_NON_MATH_SECTORS = new Set([
  'unassigned',
  'services',
  'operator_io',
  'control_plane',
  'prompt_hooks',
  'command_registry',
]);

// ---------------------------------------------------------------------------
// Domain → organ derivation. A card's `domain` is the math concern; the organ is
// the math-bearing subsystem (graph sector) that owns it. Domains here are the
// REAL values found in the live banks.
//
// CLOSED-SET FAIL-LOUD CONTRACT (closed-set-fail-closed-validator.md):
// a NON-EMPTY domain has exactly TWO legal destinations —
//   (1) MAPPED        → a key in DOMAIN_TO_ORGAN below, or
//   (2) EXCLUDED      → a member of EXCLUDED_NON_MATH_SECTORS (a card may legally
//                       carry a non-math sector label, e.g. fixtures).
// Anything else is NEITHER. It is NOT silently coerced to an `unmapped:<x>` token
// and dropped (the old blind-spot); it surfaces as GAP_UNMAPPED_DOMAIN. The legal
// vocabulary is the frozen union of these two sets; a value the author never
// enumerated cannot pass as "covered".
// ---------------------------------------------------------------------------
const DOMAIN_TO_ORGAN = {
  'information-theory': 'pulse_cortex',
  'probability-calibration': 'pulse_cortex',
  'probability': 'pulse_cortex',
  'probability-normalization': 'classification',
  'graph-search': 'self_improvement',
  'graph-ordering': 'self_improvement',
  'statistics': 'classification',
  'decision-theory': 'pulse_cortex',
  'normalization': 'classification',
  'scoring': 'classification',
  'linear-algebra': 'self_improvement',
  'vector-geometry': 'self_improvement',
};

// Domain classification result kinds — the closed set of legal outcomes.
//   'no_domain' : domain field is null/empty/whitespace (graceful; counted apart).
//   'mapped'    : domain is a DOMAIN_TO_ORGAN key  -> { organ }.
//   'excluded'  : domain is an EXCLUDED_NON_MATH_SECTORS member (legal non-math).
//   'unmapped'  : NON-EMPTY domain that is NEITHER -> LOUD GAP_UNMAPPED_DOMAIN.
export function classifyDomain(domain) {
  if (domain == null) return { kind: 'no_domain', key: null };
  // Fail-CLOSED on malformed input: a PRESENT-but-non-string domain is not a
  // genuinely-absent field, so it must NOT be coerced via String() into the
  // silent no_domain bucket. e.g. `[]`/`[null]` stringify to '' and would slip
  // past GAP_UNMAPPED_DOMAIN; `{}` stringifies to '[object Object]'. A non-string
  // present value is malformed -> surface it LOUD as an unmapped deficit, never
  // silent. (no_domain stays reserved for null/undefined/empty/whitespace STRING.)
  if (typeof domain !== 'string') {
    return { kind: 'unmapped', key: `<non-string-domain:${Object.prototype.toString.call(domain).slice(8, -1).toLowerCase()}>` };
  }
  const key = domain.trim().toLowerCase();
  if (!key) return { kind: 'no_domain', key: null };
  if (Object.prototype.hasOwnProperty.call(DOMAIN_TO_ORGAN, key)) {
    return { kind: 'mapped', key, organ: DOMAIN_TO_ORGAN[key] };
  }
  if (EXCLUDED_NON_MATH_SECTORS.has(key)) {
    return { kind: 'excluded', key };
  }
  return { kind: 'unmapped', key };
}

// deriveOrgan: the math-bearing organ a domain owns, or null for every other
// outcome (no-domain, excluded, OR unmapped). It NO LONGER fabricates an
// `unmapped:<x>` token — an unknown domain is now a LOUD deficit, not a silent
// pseudo-organ. Backward-compatible for the mapped/null cases the callers rely on.
export function deriveOrgan(domain) {
  const c = classifyDomain(domain);
  return c.kind === 'mapped' ? c.organ : null;
}

export function isMathBearingOrgan(organ) {
  if (organ == null) return false;
  return MATH_BEARING_ORGANS.has(String(organ));
}

export function isExcludedSector(sector) {
  if (sector == null) return false;
  return EXCLUDED_NON_MATH_SECTORS.has(String(sector).trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// CONFIG INVARIANT — closed-set discipline at the CONFIG level. The runtime scan
// cannot catch these on its own; both are SILENT-degrade siblings of the unmapped
// blind-spot, so this fails LOUD at startup (a config bug must never read as "0 gaps"):
//   (1) MAP-TARGET DRIFT — a DOMAIN_TO_ORGAN target that is NOT a math-bearing organ.
//       A card on that domain classifies 'mapped' (so it is NOT a loud
//       GAP_UNMAPPED_DOMAIN) yet its organ is skipped by the math-organ gap walk, so
//       it counts toward NEITHER an organ total NOR any gap — silent.
//   (2) ALLOWLIST LEAK — a math-bearing organ that is also an excluded sector.
// Args injectable so the test can drive a drifted config without touching the live consts.
export function validateConfig({
  domainMap = DOMAIN_TO_ORGAN,
  mathOrgans = MATH_BEARING_ORGANS,
  excluded = EXCLUDED_NON_MATH_SECTORS,
} = {}) {
  const mapTargetDrift = [...new Set(
    Object.entries(domainMap)
      .filter(([, organ]) => !mathOrgans.has(organ))
      .map(([domain, organ]) => `${domain} -> ${organ}`),
  )].sort();
  const allowlistLeak = [...mathOrgans].filter((o) => excluded.has(o)).sort();
  return { ok: mapTargetDrift.length === 0 && allowlistLeak.length === 0, mapTargetDrift, allowlistLeak };
}

// ---------------------------------------------------------------------------
// Card-bank loader. Reads every *.v0.json in the banks dir. Each bank is an
// object with a `formulas` array (the cards) — but we accept a bare array or a
// `cards`/`entries` key too (graceful). A malformed bank is skipped with a
// warning, never fatal. Each card is stamped with its source bank + bank mtime.
// ---------------------------------------------------------------------------
export function loadCardBanks(banksDir) {
  const banks = [];
  const cards = [];
  const warnings = [];
  if (!existsSync(banksDir)) {
    return { banks, cards, warnings: [`banks-dir-missing:${banksDir}`] };
  }
  let files;
  try {
    files = readdirSync(banksDir).filter((f) => f.endsWith('.v0.json')).sort();
  } catch (e) {
    return { banks, cards, warnings: [`banks-dir-unreadable:${e.message}`] };
  }
  for (const file of files) {
    const full = path.join(banksDir, file);
    let mtimeMs = 0;
    try { mtimeMs = statSync(full).mtimeMs; } catch { /* leave 0 */ }
    let doc;
    try {
      doc = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      warnings.push(`bank-not-json:${file}:${e.message}`);
      banks.push({ file, full, mtimeMs, cardCount: 0, malformed: true });
      continue;
    }
    const arr = Array.isArray(doc)
      ? doc
      : (Array.isArray(doc.formulas) ? doc.formulas
        : Array.isArray(doc.cards) ? doc.cards
          : Array.isArray(doc.entries) ? doc.entries : null);
    if (!arr) {
      warnings.push(`bank-no-card-array:${file}`);
      banks.push({ file, full, mtimeMs, cardCount: 0, malformed: true });
      continue;
    }
    const good = arr.filter((c) => c && typeof c === 'object');
    for (const c of good) cards.push({ ...c, _bankFile: file, _bankMtimeMs: mtimeMs });
    banks.push({ file, full, mtimeMs, cardCount: good.length, malformed: false });
  }
  return { banks, cards, warnings };
}

// ---------------------------------------------------------------------------
// Proof-gate binding registry — the canonical "which kernel primitive is BUILT"
// surface. A card whose `id` has no entry here requires an unbuilt primitive and
// is therefore UNACTIONABLE (the MINT is owner-gated code, not loop-self-fixable).
// Parsed statically (no import / no side effects).
// ---------------------------------------------------------------------------
export function readBuiltPrimitives(proofGatePath) {
  if (!existsSync(proofGatePath)) return { built: new Set(), source: null };
  let src = '';
  try { src = readFileSync(proofGatePath, 'utf8'); } catch { return { built: new Set(), source: null }; }
  const start = src.indexOf('const FORMULA_IMPLEMENTATIONS');
  if (start === -1) return { built: new Set(), source: proofGatePath };
  const end = src.indexOf('\n};', start);
  const block = end === -1 ? src.slice(start) : src.slice(start, end);
  const built = new Set();
  const re = /^\s{2}(['"]?)([A-Za-z0-9_-]+)\1\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) built.add(m[2]);
  return { built, source: proofGatePath };
}

// ---------------------------------------------------------------------------
// Graph sectors (READ-ONLY) — used ONLY to sanity-confirm the allowlist excludes
// the live non-math sectors. We never treat the graph as the lifecycle.
// ---------------------------------------------------------------------------
export function readGraphSectors(graphPath) {
  if (!existsSync(graphPath)) return { sectors: new Set(), source: null };
  let g;
  try { g = JSON.parse(readFileSync(graphPath, 'utf8')); } catch { return { sectors: new Set(), source: null }; }
  const raw = Array.isArray(g.nodes) ? g.nodes : Object.values(g.nodes || {});
  const sectors = new Set();
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const sec = n.sector || (n.metadata && n.metadata.sector);
    if (sec && String(sec).trim()) sectors.add(String(sec).trim());
  }
  return { sectors, source: graphPath };
}

// ---------------------------------------------------------------------------
// Dedup sources. The "open backlog" is this tool's own prior report (its gaps
// become next-cycle targets). hypotheses.json carries active + validated learning
// hypotheses. A target key already present in either is suppressed (not re-emitted).
// ---------------------------------------------------------------------------
export function loadDedupKeys({ backlogPath, hypothesesPath }) {
  const keys = new Set();
  // Prior report (open backlog): collect the `key` of every previously-emitted gap.
  if (backlogPath && existsSync(backlogPath)) {
    try {
      const prior = JSON.parse(readFileSync(backlogPath, 'utf8'));
      const buckets = prior && prior.gaps ? prior.gaps : {};
      for (const cls of Object.keys(buckets)) {
        const list = Array.isArray(buckets[cls]) ? buckets[cls] : [];
        for (const g of list) if (g && g.key) keys.add(String(g.key));
      }
    } catch { /* malformed prior report is non-fatal */ }
  }
  // hypotheses.json: active + validated. Key on hypothesis text + metric.
  if (hypothesesPath && existsSync(hypothesesPath)) {
    try {
      const h = JSON.parse(readFileSync(hypothesesPath, 'utf8'));
      const pools = [];
      if (Array.isArray(h)) pools.push(h);
      else { if (Array.isArray(h.active)) pools.push(h.active); if (Array.isArray(h.validated)) pools.push(h.validated); }
      for (const pool of pools) {
        for (const item of pool) {
          if (!item || typeof item !== 'object') continue;
          const txt = (item.hypothesis || item.target || item.id || '').toString().toLowerCase();
          if (txt) keys.add(`hyp:${txt}`);
          if (item.metric) keys.add(`hyp-metric:${String(item.metric).toLowerCase()}`);
        }
      }
    } catch { /* malformed hypotheses is non-fatal */ }
  }
  return keys;
}

// A gap is deduped if its key OR a hypothesis-text form of its target matches.
function isDeduped(key, target, dedupKeys) {
  if (dedupKeys.has(String(key))) return true;
  if (target && dedupKeys.has(`hyp:${String(target).toLowerCase()}`)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Core scan. Pure function over already-loaded inputs (so the test can drive it
// with fixtures without touching the filesystem twice).
// ---------------------------------------------------------------------------
export function scanLifecycle({ cards, built, dedupKeys = new Set(), nowMs = Date.now(), staleDays = STALE_DAYS_DEFAULT }) {
  const staleMs = staleDays * 24 * 60 * 60 * 1000;

  // Index cards by organ (math-bearing only) and by mechanismPattern.
  const organCardCount = new Map();   // organ -> count
  const patternInstances = new Map(); // mechanismPattern -> [cardId,...]
  const noDomainCards = [];           // graceful: cards with null/empty domain
  const unmappedDomains = new Map();  // domain(lower) -> [cardId,...] (LOUD gap)

  for (const organ of MATH_BEARING_ORGANS) organCardCount.set(organ, 0);

  for (const c of cards) {
    const cls = classifyDomain(c.domain);
    if (cls.kind === 'no_domain') { noDomainCards.push(c.id || '?'); continue; }
    if (cls.kind === 'unmapped') {
      // Closed-set fail-loud: a present domain that is NEITHER mapped NOR excluded
      // is NEVER silently dropped — it accumulates into a LOUD deficit class.
      if (!unmappedDomains.has(cls.key)) unmappedDomains.set(cls.key, []);
      unmappedDomains.get(cls.key).push(c.id || '?');
      continue;
    }
    // cls.kind is 'mapped' or 'excluded' from here. Excluded sectors are legal but
    // contribute no math-organ count and no gap (the prior false-flood is gone).
    if (cls.kind === 'mapped') {
      const organ = cls.organ;
      if (isMathBearingOrgan(organ)) organCardCount.set(organ, organCardCount.get(organ) + 1);
    }
    // mechanismPattern propagation is counted for any card that resolves to a
    // legal bucket (mapped or excluded) — an unknown-domain card is held out of
    // pattern counting until its domain is reconciled.
    const mp = c.mechanismPattern;
    if (mp != null && String(mp).trim() !== '') {
      const k = String(mp).trim();
      if (!patternInstances.has(k)) patternInstances.set(k, []);
      patternInstances.get(k).push(c.id || '?');
    }
  }

  const actionable = [];
  const unactionable = [];
  const deduped = [];

  const route = (gap) => {
    if (isDeduped(gap.key, gap.target, dedupKeys)) { deduped.push(gap); return; }
    if (gap.unactionable) { unactionable.push(gap); return; }
    actionable.push(gap);
  };

  // (a) GAP_ORGAN_NO_CARDS — a math-bearing organ in the allowlist with 0 cards.
  const gapOrganNoCards = [];
  for (const organ of [...MATH_BEARING_ORGANS].sort()) {
    if (organCardCount.get(organ) === 0) {
      const gap = {
        class: 'GAP_ORGAN_NO_CARDS',
        key: `organ-no-cards:${organ}`,
        target: organ,
        organ,
        unactionable: false, // an empty organ is card-authorable (CARD-AUTHOR path)
        detail: 'math-bearing organ has zero formula cards',
      };
      gapOrganNoCards.push(gap);
      route(gap);
    }
  }

  // (b) GAP_PATTERN_UNDER_PROPAGATED — a mechanismPattern with exactly 1 instance.
  const gapPatternUnder = [];
  for (const [pattern, ids] of [...patternInstances.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ids.length === 1) {
      const gap = {
        class: 'GAP_PATTERN_UNDER_PROPAGATED',
        key: `pattern-under:${pattern}`,
        target: pattern,
        pattern,
        instances: ids,
        unactionable: false,
        detail: 'mechanismPattern has only 1 instance (rule-of-three not met)',
      };
      gapPatternUnder.push(gap);
      route(gap);
    }
  }

  // (c) GAP_STALE_BASELINE — a verified-baseline card whose source mtime > staleDays.
  //     A card requiring an UNBUILT kernel primitive (id not in `built`) is marked
  //     UNACTIONABLE so the blocked MINT is not re-proposed every cycle.
  const gapStale = [];
  for (const c of cards) {
    const promo = c.promotionStatus;
    if (promo !== 'verified-baseline') continue;
    const mtime = Number(c._bankMtimeMs) || 0;
    // Fresher canary signal wins (card-level lastVerified, if ever added).
    const canaryMs = Date.parse(c.lastVerified || c.lastCanary || '') || 0;
    const freshestMs = Math.max(mtime, canaryMs);
    if (freshestMs === 0) continue; // unknown freshness — do not false-flag
    const ageMs = nowMs - freshestMs;
    if (ageMs <= staleMs) continue;
    const id = c.id || '?';
    const requiresUnbuilt = !built.has(String(id));
    const gap = {
      class: 'GAP_STALE_BASELINE',
      key: `stale-baseline:${id}`,
      target: id,
      cardId: id,
      bank: c._bankFile || null,
      ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
      unactionable: requiresUnbuilt,
      reason: requiresUnbuilt ? 'requires-unbuilt-kernel-primitive' : 'source-stale-needs-canary',
      detail: requiresUnbuilt
        ? 'verified-baseline card whose kernel primitive is not in the proof-gate binding registry (owner-gated MINT)'
        : 'verified-baseline card source is stale (>staleDays) with no fresher canary',
    };
    gapStale.push(gap);
    route(gap);
  }

  // (d) GAP_UNMAPPED_DOMAIN — closed-set fail-loud. Any card domain that is NEITHER
  //     MAPPED (→organ) NOR EXPLICITLY EXCLUDED is a LOUD, ACTIONABLE deficit. One
  //     gap per distinct unknown domain, naming the carrying card ids and the forced
  //     owner choice. It is NEVER silently dropped — this is the exact anti-pattern
  //     the rebuild had to kill ("silent truncation reads as covered-everything").
  const gapUnmapped = [];
  for (const [domain, ids] of [...unmappedDomains.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gap = {
      class: 'GAP_UNMAPPED_DOMAIN',
      key: `unmapped-domain:${domain}`,
      target: domain,
      domain,
      cards: ids,
      // Actionable by construction: an owner can resolve it with one decision. It
      // is the *opposite* of unactionable — leaving it unresolved silently corrupts
      // every "0 gaps" report, so it must always reach the actionable list.
      unactionable: false,
      owner_choice: `map domain "${domain}" to a math-bearing organ in DOMAIN_TO_ORGAN, OR add it to EXCLUDED_NON_MATH_SECTORS`,
      detail: `card domain "${domain}" is neither mapped to an organ nor in the explicit non-math excluded set; ${ids.length} card(s) carry it: ${ids.join(', ')}`,
    };
    gapUnmapped.push(gap);
    route(gap);
  }

  return {
    counts: {
      cards_scanned: cards.length,
      math_bearing_organs: MATH_BEARING_ORGANS.size,
      excluded_non_math_sectors: EXCLUDED_NON_MATH_SECTORS.size,
      no_domain_cards: noDomainCards.length,
      gap_organ_no_cards: gapOrganNoCards.length,
      gap_pattern_under_propagated: gapPatternUnder.length,
      gap_stale_baseline: gapStale.length,
      gap_unmapped_domain: gapUnmapped.length,
      actionable: actionable.length,
      unactionable: unactionable.length,
      deduped: deduped.length,
    },
    organ_card_counts: Object.fromEntries([...organCardCount.entries()].sort()),
    no_domain_cards: noDomainCards,
    unmapped_domains: Object.fromEntries(
      [...unmappedDomains.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, ids]) => [d, ids]),
    ),
    gaps: {
      organ_no_cards: gapOrganNoCards,
      pattern_under_propagated: gapPatternUnder,
      stale_baseline: gapStale,
      unmapped_domain: gapUnmapped,
    },
    actionable,
    unactionable,
    deduped,
  };
}

// ---------------------------------------------------------------------------
// Evidence-grammar emitter (deterministic, machine-parseable).
// ---------------------------------------------------------------------------
function emitEvidence(report, ctx) {
  const lines = [];
  const c = report.counts;
  lines.push(`TERM_COUNT term=cards_scanned count=${c.cards_scanned}`);
  lines.push(`TERM_COUNT term=math_bearing_organs count=${c.math_bearing_organs}`);
  lines.push(`TERM_COUNT term=excluded_non_math_sectors count=${c.excluded_non_math_sectors}`);
  lines.push(`TERM_COUNT term=GAP_ORGAN_NO_CARDS count=${c.gap_organ_no_cards}`);
  lines.push(`TERM_COUNT term=GAP_PATTERN_UNDER_PROPAGATED count=${c.gap_pattern_under_propagated}`);
  lines.push(`TERM_COUNT term=GAP_STALE_BASELINE count=${c.gap_stale_baseline}`);
  lines.push(`TERM_COUNT term=GAP_UNMAPPED_DOMAIN count=${c.gap_unmapped_domain}`);
  lines.push(`TERM_COUNT term=ACTIONABLE count=${c.actionable}`);
  lines.push(`TERM_COUNT term=UNACTIONABLE count=${c.unactionable}`);
  lines.push(`TERM_COUNT term=DEDUPED count=${c.deduped}`);
  if (ctx.banksDir) lines.push(`FILE_COUNT file=${ctx.banksDir} count=${c.cards_scanned}`);
  if (ctx.proofGateSource) lines.push(`FILE_COUNT file=${ctx.proofGateSource} count=${ctx.builtCount}`);
  for (const g of report.gaps.organ_no_cards) {
    lines.push(`MATCH file=${ctx.banksDir || 'banks'} term=GAP_ORGAN_NO_CARDS organ=${g.organ}`);
  }
  for (const g of report.gaps.pattern_under_propagated) {
    lines.push(`MATCH file=${ctx.banksDir || 'banks'} term=GAP_PATTERN_UNDER_PROPAGATED pattern=${g.pattern} instances=${g.instances.length}`);
  }
  for (const g of report.gaps.stale_baseline) {
    lines.push(`MATCH file=${g.bank || ctx.banksDir || 'banks'} term=GAP_STALE_BASELINE card=${g.cardId} age_days=${g.ageDays} reason=${g.reason} unactionable=${g.unactionable}`);
  }
  for (const g of report.gaps.unmapped_domain) {
    lines.push(`MATCH file=${ctx.banksDir || 'banks'} term=GAP_UNMAPPED_DOMAIN domain=${g.domain} cards=${g.cards.length} actionable=true`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    banks: BANKS_DIR, graph: GRAPH_STATE, proofGate: PROOF_GATE,
    hypotheses: HYPOTHESES, backlog: null, out: null,
    staleDays: STALE_DAYS_DEFAULT, json: false, noWrite: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--banks') args.banks = argv[++i];
    else if (a === '--graph') args.graph = argv[++i];
    else if (a === '--proof-gate') args.proofGate = argv[++i];
    else if (a === '--hypotheses') args.hypotheses = argv[++i];
    else if (a === '--backlog') args.backlog = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--stale-days') args.staleDays = Number(argv[++i]) || STALE_DAYS_DEFAULT;
    else if (a === '--json') args.json = true;
    else if (a === '--no-write') args.noWrite = true;
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

function defaultBacklogPath() {
  return path.join(DEFAULT_OUT_DIR, `lifecycle-gap-scan-${new Date().toISOString().slice(0, 10)}.json`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node _SYSTEM/Scripts/lifecycle-gap-scan.mjs [--banks <dir>] [--graph <path>] [--proof-gate <path>] [--hypotheses <path>] [--backlog <path>] [--out <path>] [--stale-days <N>] [--json] [--no-write]');
    process.exit(0);
    return;
  }

  const { banks, cards, warnings } = loadCardBanks(args.banks);
  const { built, source: proofGateSource } = readBuiltPrimitives(args.proofGate);
  const { sectors: graphSectors } = readGraphSectors(args.graph);

  // CONFIG INVARIANT — fail LOUD on map-target drift or allowlist leak (closed-set
  // discipline at config level; catches the two silent-degrade siblings of the
  // unmapped-domain blind-spot). A config bug must never read as "0 gaps".
  const configValidation = validateConfig();
  const { allowlistLeak } = configValidation;
  if (!configValidation.ok) {
    console.error('LIFECYCLE_CONFIG_DRIFT (fail-loud config invariant — exit 1):');
    for (const d of configValidation.mapTargetDrift) console.error(`  MAP_TARGET_DRIFT ${d} (target not in MATH_BEARING_ORGANS — card on this domain counts toward neither organ nor gap)`);
    for (const l of configValidation.allowlistLeak) console.error(`  ALLOWLIST_LEAK ${l} (math organ also in excluded set)`);
  }

  // Dedup: open backlog = prior report (default to today's report path if present)
  // + hypotheses.json.
  const backlogPath = args.backlog || (existsSync(defaultBacklogPath()) ? defaultBacklogPath() : null);
  const dedupKeys = loadDedupKeys({ backlogPath, hypothesesPath: args.hypotheses });

  const report = scanLifecycle({ cards, built, dedupKeys, nowMs: Date.now(), staleDays: args.staleDays });

  const ctx = {
    banksDir: args.banks,
    proofGateSource,
    builtCount: built.size,
  };
  const evidence = emitEvidence(report, ctx);

  const artifact = {
    schema_version: 3,
    tool: 'lifecycle-gap-scan',
    contract: 'three-seams-SEAM-2-lifecycle-loop',
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    inputs: {
      banks_dir: args.banks,
      bank_files: banks.map((b) => ({ file: b.file, cards: b.cardCount, malformed: b.malformed })),
      proof_gate: proofGateSource,
      built_primitive_count: built.size,
      hypotheses: args.hypotheses,
      backlog: backlogPath,
      graph_sectors_seen: [...graphSectors].sort(),
      math_bearing_organs: [...MATH_BEARING_ORGANS].sort(),
      excluded_non_math_sectors: [...EXCLUDED_NON_MATH_SECTORS].sort(),
      stale_days: args.staleDays,
      allowlist_leak: allowlistLeak, // must be [] — defense-in-depth
      config_validation: configValidation, // {ok, mapTargetDrift, allowlistLeak} — fail-loud config invariant
    },
    warnings,
    ...report,
    evidence,
  };

  if (args.json) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log('=== lifecycle-gap-scan (LRN loop-closer, read-only, advisory) ===');
    for (const line of evidence) console.log(line);
    if (warnings.length) for (const w of warnings) console.log(`WARN ${w}`);
    console.log('---');
    console.log(`GAPS: organ_no_cards=${report.counts.gap_organ_no_cards} pattern_under=${report.counts.gap_pattern_under_propagated} stale_baseline=${report.counts.gap_stale_baseline} unmapped_domain=${report.counts.gap_unmapped_domain}`);
    console.log(`ROUTING: actionable=${report.counts.actionable} unactionable=${report.counts.unactionable} deduped=${report.counts.deduped}`);
  }

  if (!args.noWrite) {
    const outPath = args.out || defaultBacklogPath();
    try {
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
      if (!args.json) console.log(`report: ${outPath}`);
    } catch (e) {
      console.error(`REPORT_WRITE_WARN ${e.message}`);
    }
  }

  // Advisory tool exits 0 for content gaps; a CONFIG invariant violation is a
  // developer error, not advisory — exit 1 so CI/owner catch it loud.
  process.exit(configValidation.ok ? 0 : 1);
}

const isDirect = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();
if (isDirect) main();
