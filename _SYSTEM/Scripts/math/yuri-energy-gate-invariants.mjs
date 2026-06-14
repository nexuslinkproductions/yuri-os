// @capability: energy-gate-property-verifier
// @serves: prove gateProposal accept decision | gate invariants | veto non-offsettability | gate property test | gate mutation test
// @does: ∀-input property harness for gateProposal — 7 invariants over a corner-enumerated corpus + 8 planted-mutant negative controls (RED-GREEN)
// @use: when changing gateProposal / its veto arms / threshold logic — run this to prove the accept decision still holds ∀ input, and that the suite has teeth
// @exports: runGateInvariants, runMutationCheck, genGateCorpus, referenceDecision, crossCheckSpec, GATE_INVARIANTS, GATE_MUTANTS, isMalformedCount, readCount
//
// substrate-frontier-grade B3 (2026-06-14). The DECISION-arm property verifier: the sibling
// yuri-energy-invariants.mjs proves computeU (the scalar arm); this proves gateProposal (the accept
// arm). It holds the gate to a spec encoded INDEPENDENTLY of the implementation, so a regression in
// the gate is caught against an external oracle, not against a copy of itself.
//
// Design notes (load-bearing):
//  - DETERMINISTIC corpus by CORNER ENUMERATION, never PRNG. The accept decision is affine/branching
//    in its veto fields + ΔU vs threshold; the failure modes live at the corners (equal / increase /
//    malformed / negative; ΔU on either side of threshold; cap armed/disabled; override on/off). Monte
//    Carlo the interior and you miss the vertex flips (FB:AFFINE-OBJECTIVE-ENUMERATE-CORNERS). Also
//    sidesteps the sandbox Math.random throw.
//  - ΔU is driven CLEANLY via verifiedEvidenceCount (the iota credit term: finite, monotone, and NOT a
//    veto field), so the threshold invariant is exercised on both sides without perturbing the veto arms.
//  - The spec predicates mirror readNonNegativeField + the A4 fail-closed semantics: a stateAfter veto
//    field that is PRESENT and (non-finite OR negative) is "cannot prove no increase" ⇒ veto.
//  - referenceDecision(args, disable) is a faithful spec MODEL of the gate. With disable={} it is
//    cross-checked to equal the real gate (crossCheckSpec). With one arm disabled it becomes a planted
//    MUTANT that MUST trip its target invariant — the negative control proving the suite is non-vacuous.
//
// Pure, dependency-free, observe-only. Reads gateProposal/computeDeltaU; mutates no gate behavior.

import { gateProposal, computeDeltaU } from './yuri-energy.mjs';

// ---------------------------------------------------------------------------
// Spec predicates — mirror readNonNegativeField + the A4 fail-closed guard.
// These encode the INTENDED veto semantics, independent of the implementation.
// ---------------------------------------------------------------------------

// A count field is MALFORMED iff it is PRESENT (not absent/null/'') and either non-finite or negative.
// Matches gateProposal's `rawAfter !== undefined && ... && (!Number.isFinite(Number(raw)) || Number(raw) < 0)`.
export function isMalformedCount(raw) {
  if (raw === undefined || raw === null || raw === '') return false;
  const n = Number(raw);
  return !Number.isFinite(n) || n < 0;
}

// The numeric value the gate reads for a count (readNonNegativeField): absent/null/''/malformed → 0.
export function readCount(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function capIsArmed(maxLadderInversionCap) {
  return maxLadderInversionCap !== undefined && maxLadderInversionCap !== Infinity;
}

// Per-arm spec veto conditions, keyed on the RAW inputs (not on the gate's output flags) — so a mutant
// that merely clears a flag cannot escape: the condition is derived from the state, not trusted from the gate.
function specProtectedVeto(args) {
  const a = args.stateAfter;
  const b = args.stateBefore;
  return isMalformedCount(a.protectedPathViolations)
    || readCount(a.protectedPathViolations) > readCount(b.protectedPathViolations);
}
function specStructuralVeto(args) {
  if (specProtectedVeto(args)) return false; // protected-path precedence (matches `!protectedPathVeto && ...`)
  const a = args.stateAfter;
  const b = args.stateBefore;
  return isMalformedCount(a.promotionLadderInversions)
    || readCount(a.promotionLadderInversions) > readCount(b.promotionLadderInversions);
}
function specMaxSeverityVeto(args) {
  if (!capIsArmed(args.maxLadderInversionCap)) return false; // disabled by default → never fires
  const a = args.stateAfter;
  const cap = Number(args.maxLadderInversionCap);
  return isMalformedCount(a.maxLadderInversion) || readCount(a.maxLadderInversion) > cap;
}

// Any spec veto condition holds (ignores ΔU and override entirely — that is the non-offsettability point).
export function anySpecVeto(args) {
  return specProtectedVeto(args) || specStructuralVeto(args) || specMaxSeverityVeto(args);
}

// ---------------------------------------------------------------------------
// referenceDecision — faithful spec model of gateProposal's accept decision.
// disable={} reproduces the real gate (cross-checked). disable.<arm>=true plants a fault.
// ΔU comes from the REAL computeDeltaU (physics is shared, never mutated) so the spec's ΔU is
// bit-identical to the gate's — only the DECISION logic is modeled here.
// ---------------------------------------------------------------------------

export function referenceDecision(args, disable = {}) {
  const { stateBefore: b, stateAfter: a, threshold = 0, allowOverride = false } = args;
  const capArmed = capIsArmed(args.maxLadderInversionCap);
  const cap = capArmed ? Number(args.maxLadderInversionCap) : Infinity;
  const t = Number(threshold);
  const deltaU = computeDeltaU(b, a).result.deltaU;
  const passesThreshold = deltaU <= t;
  const override = allowOverride === true;

  const protMal = !disable.failClosed && isMalformedCount(a.protectedPathViolations);
  const protInc = readCount(a.protectedPathViolations) > readCount(b.protectedPathViolations);
  const protectedPathVeto = !disable.protected && (protMal || protInc);

  const ladMal = !disable.failClosed && isMalformedCount(a.promotionLadderInversions);
  const ladInc = readCount(a.promotionLadderInversions) > readCount(b.promotionLadderInversions);
  const structuralFloorVeto = !disable.structural && !protectedPathVeto && (ladMal || ladInc);

  let maxSeverityVeto = false;
  if (capArmed && !disable.maxSeverity) {
    const mMal = !disable.failClosed && isMalformedCount(a.maxLadderInversion);
    const mInc = readCount(a.maxLadderInversion) > cap;
    maxSeverityVeto = mMal || mInc;
  }
  // capLeak fault: the L∞ floor wrongly fires even when the cap is DISABLED (backward-compat break).
  if (disable.capLeak && !capArmed) {
    maxSeverityVeto = maxSeverityVeto || readCount(a.maxLadderInversion) > 0;
  }

  const anyVeto = protectedPathVeto || structuralFloorVeto || maxSeverityVeto;
  let accept;
  if (disable.overrideBypass && override) {
    accept = true; // fault: override wrongly beats a veto
  } else if (anyVeto) {
    accept = false;
  } else if (disable.thresholdSign) {
    accept = (deltaU > t) || override; // fault: threshold comparison flipped
  } else if (disable.override) {
    accept = passesThreshold; // fault: override arm ignored
  } else {
    accept = passesThreshold || override;
  }
  return { accept, protectedPathVeto, structuralFloorVeto, maxSeverityVeto, deltaU, threshold: t };
}

// Wrap referenceDecision into the gateProposal output shape so the invariant checker reads it uniformly.
function mutantGate(disable) {
  return (args) => {
    const d = referenceDecision(args, disable);
    const lyap = d.deltaU <= 0 ? 'descending' : 'ascending';
    return {
      result: {
        accept: d.accept,
        deltaU: d.deltaU,
        threshold: d.threshold,
        protectedPathVeto: d.protectedPathVeto,
        structuralFloorVeto: d.structuralFloorVeto,
        maxSeverityVeto: d.maxSeverityVeto,
      },
      proof: { lyapunovProperty: disable.lyapunov ? (lyap === 'descending' ? 'ascending' : 'descending') : lyap },
    };
  };
}

// The real gate under test, normalized to the same accessor shape.
export function realGate(args) {
  return gateProposal(args);
}

// ---------------------------------------------------------------------------
// Corpus — deterministic corner enumeration.
// ---------------------------------------------------------------------------

const ABSENT = Symbol('absent');
const CLEAN_COUNTS = [ABSENT, 0, 1, 3];
const MALFORMED_COUNTS = [NaN, 'garbage', -1];
const ALL_AFTER = [...CLEAN_COUNTS, ...MALFORMED_COUNTS];
const THRESHOLDS = [-5, 0, 5];
const OVERRIDES = [false, true];
// ΔU drivers via verifiedEvidenceCount (iota credit): more verified evidence LOWERS U.
//  desc: 0→5 ⇒ ΔU<0 (descending)   flat: 0→0 ⇒ ΔU≈0   asc: 5→0 ⇒ ΔU>0 (ascending)
const DRIVERS = [
  { name: 'desc', before: 0, after: 5 },
  { name: 'flat', before: 0, after: 0 },
  { name: 'asc', before: 5, after: 0 },
];

function mkState(driverCount, fields) {
  const s = {};
  if (driverCount !== ABSENT) s.verifiedEvidenceCount = driverCount;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== ABSENT) s[k] = v;
  }
  return s;
}

function pushRow(rows, { pb, pa, lb, la, ma, cap, thr, ov, drv }) {
  rows.push({
    stateBefore: mkState(drv.before, {
      protectedPathViolations: pb,
      promotionLadderInversions: lb,
    }),
    stateAfter: mkState(drv.after, {
      protectedPathViolations: pa,
      promotionLadderInversions: la,
      maxLadderInversion: ma,
    }),
    threshold: thr,
    allowOverride: ov,
    maxLadderInversionCap: cap,
  });
}

export function genGateCorpus() {
  const rows = [];
  // Sweep 1 — protected-path arm (ladder clean, cap disabled).
  for (const pb of [0, 2]) {
    for (const pa of ALL_AFTER) {
      for (const thr of THRESHOLDS) {
        for (const ov of OVERRIDES) {
          for (const drv of DRIVERS) {
            pushRow(rows, { pb, pa, lb: 0, la: 0, ma: ABSENT, cap: Infinity, thr, ov, drv });
          }
        }
      }
    }
  }
  // Sweep 2 — structural (promotion-ladder) arm (protected clean, cap disabled).
  for (const lb of [0, 2]) {
    for (const la of ALL_AFTER) {
      for (const thr of THRESHOLDS) {
        for (const ov of OVERRIDES) {
          for (const drv of DRIVERS) {
            pushRow(rows, { pb: 0, pa: 0, lb, la, ma: ABSENT, cap: Infinity, thr, ov, drv });
          }
        }
      }
    }
  }
  // Sweep 3 — L∞ max-severity arm (cap ARMED at 0 and 3; protected/ladder clean).
  for (const cap of [0, 3]) {
    for (const ma of ALL_AFTER) {
      for (const thr of THRESHOLDS) {
        for (const ov of OVERRIDES) {
          for (const drv of DRIVERS) {
            pushRow(rows, { pb: 0, pa: 0, lb: 0, la: 0, ma, cap, thr, ov, drv });
          }
        }
      }
    }
  }
  // Sweep 4 — precedence combos (protected × ladder, plus a max field present under a disabled cap).
  for (const pa of [0, 3, NaN]) {
    for (const la of [0, 3, NaN]) {
      for (const ov of OVERRIDES) {
        pushRow(rows, { pb: 0, pa, lb: 0, la, ma: 2, cap: Infinity, thr: 0, ov, drv: DRIVERS[1] });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Invariants — each {name, applies(args), holds(out, args)}.
// `out` is the gate output shape: { result:{accept,deltaU,threshold,*Veto}, proof:{lyapunovProperty} }.
// ---------------------------------------------------------------------------

export const GATE_INVARIANTS = [
  {
    name: 'VETO-DOMINANCE',
    // Any spec veto condition ⇒ reject, regardless of ΔU AND override. The non-offsettability guarantee.
    applies: (args) => anySpecVeto(args),
    holds: (out) => out.result.accept === false,
  },
  {
    name: 'THRESHOLD',
    // No veto, no override ⇒ accept ⟺ ΔU ≤ threshold.
    applies: (args) => !anySpecVeto(args) && args.allowOverride !== true,
    holds: (out) => out.result.accept === (out.result.deltaU <= out.result.threshold),
  },
  {
    name: 'OVERRIDE',
    // No veto + override ⇒ accept (override is allowed to lift the soft threshold, only the soft threshold).
    applies: (args) => !anySpecVeto(args) && args.allowOverride === true,
    holds: (out) => out.result.accept === true,
  },
  {
    name: 'CAP-DISABLED',
    // Default cap (Infinity) ⇒ the L∞ floor never fires (backward-compat: existing callers unaffected).
    applies: (args) => !capIsArmed(args.maxLadderInversionCap),
    holds: (out) => out.result.maxSeverityVeto === false,
  },
  {
    name: 'FLAG-CONSISTENCY',
    // accept ⇒ no veto flag is set (an accepted transition never carried a veto).
    applies: () => true,
    holds: (out) => out.result.accept !== true
      || (!out.result.protectedPathVeto && !out.result.structuralFloorVeto && !out.result.maxSeverityVeto),
  },
  {
    name: 'LYAPUNOV',
    // The Lyapunov label is physics (sign of ΔU), decoupled from the accept policy.
    applies: () => true,
    holds: (out) => out.proof.lyapunovProperty === (out.result.deltaU <= 0 ? 'descending' : 'ascending'),
  },
];

const DETERMINISM = {
  name: 'DETERMINISM',
  // Same input ⇒ same output (gateProposal is pure). Checked by a second call + deep compare.
  check(gateFn, args) {
    const a = gateFn(args);
    const b = gateFn(args);
    return JSON.stringify({ r: a.result, p: a.proof }) === JSON.stringify({ r: b.result, p: b.proof });
  },
};

// ---------------------------------------------------------------------------
// runGateInvariants — run every invariant over the corpus; first counterexample per invariant.
// ---------------------------------------------------------------------------

export function runGateInvariants(gateFn, corpus = genGateCorpus()) {
  const results = {};
  for (const inv of GATE_INVARIANTS) {
    results[inv.name] = { ok: true, checked: 0, counterexample: null };
  }
  results[DETERMINISM.name] = { ok: true, checked: 0, counterexample: null };

  for (const args of corpus) {
    let out;
    try {
      out = gateFn(args);
    } catch (err) {
      // The corpus is built to never throw; a throw here is itself a counterexample.
      for (const inv of GATE_INVARIANTS) {
        if (results[inv.name].ok) {
          results[inv.name].ok = false;
          results[inv.name].counterexample = { args, error: String(err && err.message) };
        }
      }
      continue;
    }
    for (const inv of GATE_INVARIANTS) {
      if (!inv.applies(args)) continue;
      results[inv.name].checked += 1;
      if (results[inv.name].ok && !inv.holds(out, args)) {
        results[inv.name].ok = false;
        results[inv.name].counterexample = { args, out: { result: out.result, proof: out.proof } };
      }
    }
    // Determinism (own pass — needs a second call).
    results[DETERMINISM.name].checked += 1;
    if (results[DETERMINISM.name].ok && !DETERMINISM.check(gateFn, args)) {
      results[DETERMINISM.name].ok = false;
      results[DETERMINISM.name].counterexample = { args };
    }
  }

  const ok = Object.values(results).every((r) => r.ok);
  return { ok, results };
}

// ---------------------------------------------------------------------------
// crossCheckSpec — prove referenceDecision({}) faithfully models the real gate.
// If this fails, EITHER the spec is wrong OR the gate has a bug; investigate before trusting either.
// ---------------------------------------------------------------------------

export function crossCheckSpec(corpus = genGateCorpus()) {
  const mismatches = [];
  for (const args of corpus) {
    const real = gateProposal(args).result;
    const spec = referenceDecision(args, {});
    if (
      real.accept !== spec.accept
      || real.protectedPathVeto !== spec.protectedPathVeto
      || real.structuralFloorVeto !== spec.structuralFloorVeto
      || real.maxSeverityVeto !== spec.maxSeverityVeto
    ) {
      mismatches.push({
        args,
        real: {
          accept: real.accept,
          protectedPathVeto: real.protectedPathVeto,
          structuralFloorVeto: real.structuralFloorVeto,
          maxSeverityVeto: real.maxSeverityVeto,
        },
        spec: {
          accept: spec.accept,
          protectedPathVeto: spec.protectedPathVeto,
          structuralFloorVeto: spec.structuralFloorVeto,
          maxSeverityVeto: spec.maxSeverityVeto,
        },
      });
      if (mismatches.length >= 5) break;
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

// ---------------------------------------------------------------------------
// Mutants — each is referenceDecision with one arm disabled; MUST trip its target invariant.
// The negative control proving the suite has teeth (RED-GREEN: a fix without a test that would catch
// its reversal is incomplete).
// ---------------------------------------------------------------------------

export const GATE_MUTANTS = [
  { name: 'no-protected-veto', disable: { protected: true }, target: 'VETO-DOMINANCE' },
  { name: 'no-structural-veto', disable: { structural: true }, target: 'VETO-DOMINANCE' },
  { name: 'no-maxseverity-veto', disable: { maxSeverity: true }, target: 'VETO-DOMINANCE' },
  { name: 'fail-open-malformed', disable: { failClosed: true }, target: 'VETO-DOMINANCE' },
  { name: 'override-beats-veto', disable: { overrideBypass: true }, target: 'VETO-DOMINANCE' },
  { name: 'threshold-flipped', disable: { thresholdSign: true }, target: 'THRESHOLD' },
  { name: 'override-ignored', disable: { override: true }, target: 'OVERRIDE' },
  { name: 'cap-leak', disable: { capLeak: true }, target: 'CAP-DISABLED' },
  { name: 'lyapunov-mislabel', disable: { lyapunov: true }, target: 'LYAPUNOV' },
];

export function runMutationCheck(corpus = genGateCorpus()) {
  const perMutant = [];
  for (const m of GATE_MUTANTS) {
    const res = runGateInvariants(mutantGate(m.disable), corpus);
    const targetCaught = res.results[m.target] && res.results[m.target].ok === false;
    perMutant.push({ name: m.name, target: m.target, caught: targetCaught });
  }
  const ok = perMutant.every((m) => m.caught);
  return { ok, perMutant };
}

// ---------------------------------------------------------------------------
// CLI worked example.
// ---------------------------------------------------------------------------

function workedExample() {
  const corpus = genGateCorpus();
  const cross = crossCheckSpec(corpus);
  const green = runGateInvariants(realGate, corpus);
  const red = runMutationCheck(corpus);

  const lines = [];
  lines.push(`yuri-energy-gate-invariants — B3 gateProposal property verifier`);
  lines.push(`corpus rows: ${corpus.length}`);
  lines.push(`spec cross-check (referenceDecision ≡ gate): ${cross.ok ? 'OK' : 'MISMATCH ' + cross.mismatches.length}`);
  lines.push(`GREEN (real gate satisfies all invariants): ${green.ok ? 'PASS' : 'FAIL'}`);
  for (const [name, r] of Object.entries(green.results)) {
    lines.push(`  ${r.ok ? '✓' : '✗'} ${name} (checked ${r.checked})`);
  }
  lines.push(`RED (planted mutants caught by target invariant): ${red.ok ? 'PASS' : 'FAIL'}`);
  for (const m of red.perMutant) {
    lines.push(`  ${m.caught ? '✓' : '✗'} ${m.name} → ${m.target}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(workedExample());
}
