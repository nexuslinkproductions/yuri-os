#!/usr/bin/env node
/**
 * transfer-distance.prereq.test.mjs — barrage + over-fire control for the structured
 * implementation-viability detector detectPrereqBlocked() (transfer-distance.mjs r3).
 *
 * Imports the LIVE exported function (not a copy) so it pins the shipped behavior. Pins:
 *  - the 6 paraphrase EVASIONS that defeated the old literal regex → must BLOCK,
 *  - the 3 prose OVER-FIRE controls + the "trailing-artifact" trap → must PASS,
 *  - one positive + one negative per detector branch,
 *  - the REAL logbook ground truth: cards 22 (MPC) + 35 (VCG) → BLOCK; 30 (Hopfield park) +
 *    23 (missing channels) → PASS. Cards 22/35/30 are exactly what proof F is load-bearing on.
 *
 * Mutation note: flipping any branch in detectPrereqBlocked (drop SATISFIED skip, drop NO_INPUT,
 * loosen the artifact-proximity binding) turns a row here red.
 */
import { detectPrereqBlocked } from './transfer-distance.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };

// Real logbook mismatch text (must match what the proof feeds as card.mismatch).
const CARD_22 = "Frame as discrete receding-horizon tree-search over the DAG, NOT convex MPC. Do NOT route through `applyTransition` (wrong state model) or `offload-contract` (not energy-gated). HARD PREREQUISITE: a real graph-plan-state transition function must be built first — it does not exist today.";
const CARD_35 = "PREREQUISITE (the honest blocker): first add a claim-dependency edge to the cortex ledger — the fan-out term has NO input data until this DAG exists. Until then the only honest move is the depth-scaled reduced form, mostly ALREADY covered by the existing convex `inversionPenalty(depth²)` — so don't ship the reduced form as \"VCG.\"";
const CARD_30 = "Do NOT hard-code 0.138 (cite AGS only as the structural justification for super-linear degradation, then tune the knob against observed recall quality). PARK the Hopfield pattern-completion mechanism — blocked by the embedding-free constraint until revisited.";
const CARD_23 = "It's the rank-test INSIGHT, not Gramian math; name it \"evidence-channel reachability,\" not \"observability.\" Overlaps card 8's necessity test conceptually — keep distinct: this is about MISSING channels, card 8 about present-record load-bearing-ness.";

const cases = [
  // ── REAL logbook ground truth (proof F load-bearing) ──
  [CARD_22, true, 'card 22 MPC — hard prerequisite + transition function must be built'],
  [CARD_35, true, 'card 35 VCG — no input data until this DAG exists'],
  [CARD_30, false, 'card 30 Hopfield — "blocked by the embedding-free constraint" is a PARK, not a hard prereq'],
  [CARD_23, false, 'card 23 — "missing channels" (adjective) is NOT "channel is missing"'],
  // ── 6 paraphrase evasions that defeated the old literal regex (must BLOCK) ──
  ['The transition function has not been implemented yet.', true, 'evasion: has not been implemented yet'],
  ['The transition function is absent today.', true, 'evasion: absent today'],
  ['The dependency DAG is missing.', true, 'evasion: is missing'],
  ['We must construct the transition function before this transfer is buildable.', true, 'evasion: we must construct'],
  ['No transition function in place for the MPC transfer.', true, 'evasion: no X in place'],
  ['The adapter is not implemented.', true, 'evasion: is not implemented'],
  // ── over-fire controls (must PASS) ──
  ['This prerequisite intuition already holds in the current routing design.', false, 'overfire: prerequisite already holds'],
  // LEXICALLY FRAGILE control: this passes because 'mechanism' is not in PREREQ_ART
  // — if 'mechanism' ever joins the artifact list, this control flips and the
  // detector over-fires on idiomatic prose. Known seam, documented (audit P2).
  ['The mechanism does not exist in a vacuum; it depends on surrounding context.', false, 'overfire: does not exist in a vacuum'],
  ['Trust must be built first before teams accept the workflow.', false, 'overfire: build-trust idiom + trailing artifact (proximity trap)'],
  ['Trust must be built first.', false, 'overfire: bare build-trust idiom'],
  // ── branch negatives ──
  ['The transition function is already implemented and in place.', false, 'neg: already implemented (SATISFIED)'],
  ['The dataset currently exists, but quality is uneven.', false, 'neg: currently exists (SATISFIED)'],
  ['A prerequisite is documented, but already satisfied.', false, 'neg: prereq but already satisfied'],
  // ── branch positives ──
  ['The parser prerequisite is not yet implemented.', true, 'pos: prerequisite + not yet implemented'],
  ['The schema must be created before promotion.', true, 'pos: schema must be created (future-build, passive)'],
  ['The registry adapter is not in place.', true, 'pos: adapter is not in place'],
  ['No input until the event stream is wired.', true, 'pos: no input until'],
  // ── empty / junk inputs ──
  ['', false, 'empty string → not blocked'],
  [null, false, 'null → not blocked'],
  ['Just a normal mismatch about register naming and tone.', false, 'benign prose → not blocked'],
];

for (const [text, exp, name] of cases) ok(detectPrereqBlocked(text) === exp, `${name} (expect ${exp})`);

console.log(`\ntransfer-distance.prereq.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
