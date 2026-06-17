# PEER BRIEF — funding-carry-to-vol signal (`carry-vol-signal.mjs`)

You are a YURI nano-swarm peer (NOT Claude — a full peer operator). Ground every claim in the
files cited below; this brief is shared ground truth. Output bounded, structured. No raw dumps.

## MISSION

Build a NEW advisory AFL signal for the live crypto observatory: **funding-carry-to-vol**.
Concept lifted from LSEG's fx-carry-trade skill: a carry trade is only attractive RELATIVE to the
risk you take to earn it. The metric:

    carryToVol = annualizedFundingApr / annualizedRealizedVol

In crypto perps the "carry" you earn is the funding rate (you receive funding by being on the
non-crowded side); the "risk" is the asset's realized price volatility. A flat funding-APR
threshold is **vol-blind** — 10% APR funding is a strong signal at 30% vol and noise at 120% vol.
Vol-normalizing fixes that.

## CAPABILITY-FIRST — REUSE, do not rebuild

- `_SYSTEM/Scripts/alpha-factor-library/perp-signals.mjs` ALREADY fetches funding and annualizes it
  (`PerpAdapter.getFunding` + `PerpAdapter.annualizeFunding`, default 1095 periods = 8h funding).
  Its `fundingToSignal` gates on a FLAT APR threshold (`DEFAULT_FUNDING_APR_THRESHOLD = 0.10`) — the
  exact vol-blind gap we are fixing. Side convention to MATCH: positive funding (crowded long) -> SHORT;
  negative funding (crowded short) -> LONG. We keep that convention; we change the GATE + CONFIDENCE
  to be vol-normalized.
- `_SYSTEM/Scripts/alpha-factor-library/cross-asset-signal.mjs` is the EXACT module idiom to mirror:
  pure functions over an INJECTED price series, fail-open `compute*` wrapper, `--test` self-test block,
  `@capability` tag header, signal shape `{factorId, value, side, confidence, ts, source}`.
- Realized vol input: the orchestrator caches recent closes (`_recentCloses`) — a per-market array of
  `[ts, price]`. Use that series; DO NOT fetch price data in this module.

## REQUIRED EXPORT SHAPE (match cross-asset-signal.mjs idiom)

```
export function realizedVol(series, opts) -> annualized vol (number) | NaN
    // series = [[ts, price], ...] ascending; close-to-close log-return std * sqrt(periodsPerYear).
    // periodsPerYear must match the bar spacing (1-min bars -> 525600). Return NaN on <2 valid points.
export function carryToVol(annualizedFundingApr, annualizedVol) -> ratio | NaN
export function carryVolToSignal(annualizedFundingApr, ratio, market, ts, opts) -> signal | null
export async function computeCarryVolSignals(market, series, opts) -> signal[]   // fail-open, [] on error
```

factorId = `carry-vol-${market}`, source = `carryvol`.

## THE MATH / RULES YOU MUST GET RIGHT

1. **Unit consistency** — funding APR is already annualized; realized vol MUST be annualized with the
   SAME calendar (sqrt(periodsPerYear)). Then the ratio is dimensionless. State periodsPerYear explicitly.
2. **Divide-by-small-vol guard** — vol near zero makes the ratio explode. Floor vol (e.g. `minVol`),
   or return null when vol < minVol. Pick + justify a floor.
3. **Min funding floor** — do not fire on microscopic funding even if vol is tiny (ratio noise). Require
   `|fundingApr| >= minFundingApr` before computing the ratio.
4. **Gate** — `|ratio| < ratioThreshold` -> null. Propose + justify ratioThreshold (what carry-per-unit-vol
   is worth acting on?).
5. **Side** — fundingApr > 0 -> 'short'; < 0 -> 'long' (carry-receiver side; same as perp-signals).
6. **Confidence** — advisory, capped LOW (<= 0.65), scaling with |ratio| above threshold. Never dominates
   price signals.
7. **Horizon home** — this is a CARRY signal: funding accrues over 8h periods, the edge is multi-hour/daily.
   It belongs on the LONG ladder rungs (3h/12h/weekly), NOT the 1-min scalp. Note this in the signal/docs.

## CONSTRAINTS (binding)

- Paper-only / view-only (INV-1: no order path). No key reads (INV-2). Fail-open (never throw from compute*).
- Pure + deterministic + offline-testable; the ONE network touch (funding fetch) goes through perp-adapter,
  like perp-signals. No new npm dependency.
- Node ESM, matches the existing file style.

## YOUR DELIVERABLE

A complete `carry-vol-signal.mjs` proposal (or your assigned slice of it), PLUS:
- the realized-vol estimator with explicit annualization and the divide-by-small-vol handling,
- chosen thresholds (ratioThreshold, minVol, minFundingApr) WITH a one-line justification each,
- the falsification you'd run to know if this signal is real vs noise on the live ledger.

Verification note: Claude integrates + RE-VERIFIES every number locally before anything ships. Over-claiming
("done", "19/19") without local proof is the documented failure mode — give real reasoning, not confidence.
