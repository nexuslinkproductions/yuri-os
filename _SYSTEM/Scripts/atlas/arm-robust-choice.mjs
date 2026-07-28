#!/usr/bin/env node
/**
 * arm-robust-choice.mjs — deterministic robust architecture choice over frozen Atlas arms.
 * locate/enter questions are exploratory only (3/6 locate questions leak their answers) and must
 * not drive an architecture decision; this analyzer reports both composite and find-only rankings
 * so the find-only result is what an architecture call should be made on.
 */
// @capability: arm-robust-choice
// @serves: robust architecture selection across measured Atlas resolver arms
// @does: bootstrap-resamples per-question scorer values, computes decision-sim robustScore/CVaR and minimax regret
// @use: choose an arm under sampling uncertainty; locate/enter are exploratory only and must not drive architecture choice
// @exports: analyze, main

import { readFileSync } from "node:fs";
import { robustScore, minimaxRegret, makeRng } from "../decision-sim.mjs";

const ARM_NAMES = (() => {
  const arg = process.argv.find((a) => a.startsWith('--arms='));
  // Default = the CLEAN promotion set (Hermes 2026-07-28: enriched-split withdrawn-contaminated,
  // fastlex-syns killed, rerank dead, atlas retrieval dead — never rank those for promotion).
  return arg ? arg.slice(7).split(',') : ['fastlex', 'fastlex-split', 'menu'];
})();
const DRAWS = 2000;
const SEED = 1785223626;
const TAIL_FRAC = 0.1;

function loadArms() {
  return Object.fromEntries(ARM_NAMES.map((arm) => [arm, JSON.parse(readFileSync(`/tmp/bakeoff/${arm}.json`, "utf8"))]));
}

function makeProblem(arms, questions) {
  const ids = questions.map((q) => q.id);
  const values = Object.fromEntries(ARM_NAMES.map((arm) => [arm, Object.fromEntries(arms[arm].per_question.map((q) => [q.id, q.value]))]));
  return {
    name: "atlas-arm-choice",
    discrete: { arm: ARM_NAMES },
    sampleParams(rng) {
      const draw = new Array(ids.length);
      for (let i = 0; i < ids.length; i += 1) draw[i] = ids[Math.floor(rng() * ids.length)];
      return { draw };
    },
    value(config, params) {
      const table = values[config.arm];
      return params.draw.reduce((sum, id) => sum + table[id], 0) / params.draw.length;
    },
  };
}

function cvar(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(sorted.length * TAIL_FRAC));
  return sorted.slice(0, k).reduce((a, b) => a + b, 0) / k;
}

export function analyze(arms, mode) {
  const all = arms[ARM_NAMES[0]].per_question;
  // locate/enter questions are exploratory only: 3/6 locate questions leak answers.
  const questions = mode === "find" ? all.filter((q) => q.type === "find") : all;
  const problem = makeProblem(arms, questions);
  const configs = ARM_NAMES.map((arm) => ({ arm }));
  const rng = makeRng(SEED);
  const samples = Array.from({ length: DRAWS }, () => problem.sampleParams(rng));
  const rows = configs.map((config) => {
    const boot = samples.map((params) => problem.value(config, params));
    const mean = boot.reduce((a, b) => a + b, 0) / boot.length;
    const tail = cvar(boot);
    const robust = 0.5 * mean + 0.5 * tail;
    const checked = robustScore(problem, config, { draws: DRAWS, tailFrac: TAIL_FRAC, rng: makeRng(SEED) });
    if (Math.abs(robust - checked) > 1e-12) throw new Error(`robustScore cross-check failed for ${config.arm}`);
    const point = questions.reduce((sum, q) => sum + arms[config.arm].per_question.find((x) => x.id === q.id).value, 0) / questions.length;
    return { arm: config.arm, robustScore: robust, cvar: tail, pointMean: point };
  });
  const regret = minimaxRegret(problem, configs, { draws: DRAWS, seed: SEED });
  return { mode, n: questions.length, rows, regret };
}

function format(result) {
  const rank = [...result.rows].sort((a, b) => b.robustScore - a.robustScore);
  const point = [...result.rows].sort((a, b) => b.pointMean - a.pointMean)[0];
  const regret = result.regret.winner;
  const lines = [`${result.mode}: n=${result.n} (find-only excludes exploratory locate/enter leakage)`];
  for (const r of rank) lines.push(`  ${r.arm} robustScore=${r.robustScore.toFixed(6)} CVaR=${r.cvar.toFixed(6)} pointMean=${r.pointMean.toFixed(6)}`);
  lines.push(`  minimaxRegret winner=${regret.config.arm} maxRegret=${regret.maxRegret.toFixed(5)}`);
  lines.push(`  robust winner=${rank[0].arm}; point winner=${point.arm}; differs=${rank[0].arm !== point.arm ? "YES" : "NO"}`);
  return lines.join("\n");
}

export function main() {
  const arms = loadArms();
  const first = [analyze(arms, "composite"), analyze(arms, "find")];
  const printed = first.map(format).join("\n");
  const second = [analyze(arms, "composite"), analyze(arms, "find")].map(format).join("\n");
  console.log(printed);
  console.log(`DETERMINISM SELF-CHECK: ${printed === second ? "PASS" : "FAIL"}`);
  if (printed !== second) process.exitCode = 1;
}
if (process.argv[1] && process.argv[1].endsWith("arm-robust-choice.mjs")) main();
