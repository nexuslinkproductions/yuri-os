#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMathLabManifest } from './math-adapters.mjs';
import { astar, bayesUpdate, brierScore, dijkstra, dotProduct, logLoss, softmax, weightedMean } from './math-kernel.mjs';
import { inspectFormulaBankDirectory } from './math-proof-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM/research-archive/yuri-math-engine-2026-05');
const SOURCE_REGISTRY = path.join(ARCHIVE_DIR, '01_source_registry.md');
const LAB_MANIFEST = path.join(REPO_ROOT, '_SYSTEM/labs/math/lab-manifest.json');
const FORMULA_BANK_DIR = path.join(REPO_ROOT, '_SYSTEM/data/math/formula-banks');

export function runMathHealth() {
  const errors = [];
  const archive = inspectArchive(errors);
  const adapterManifest = inspectAdapterManifest(errors);
  const formulaBanks = inspectFormulaBanks(errors);
  const proofGate = inspectProofGate(errors);
  const coreProofs = inspectCoreProofs(errors);

  return {
    schema: 'yuri.math-health.v0',
    ok: errors.length === 0,
    errors,
    archive,
    adapterManifest,
    formulaBanks,
    proofGate,
    coreProofs,
  };
}

function inspectArchive(errors) {
  const required = [
    '00_manifest.md',
    '01_source_registry.md',
    '02_local_doc_digest.md',
    '03_algorithmic_spine.md',
    '04_mathematical_operating_substrate.md',
    '05_polyglot_math_stack.md',
    '06_eml_sandbox_assessment.md',
    '07_yuri_integration_plan.md',
    '08_jan_briefing.md',
    '09_general_math_operationalization.md',
    '10_formula_card_schema.md',
    '11_general_math_hardening_plan.md',
    '12_research_sprint_2026_05_25.md',
  ];
  const missing = required.filter((file) => !existsSync(path.join(ARCHIVE_DIR, file)));
  errors.push(...missing.map((file) => `missing archive file: ${file}`));
  const sourceRegistry = existsSync(SOURCE_REGISTRY) ? readFileSync(SOURCE_REGISTRY, 'utf8') : '';
  const sourceCount = (sourceRegistry.match(/^\| S\d{3} \|/gm) || []).length;
  const supplementalCount = (sourceRegistry.match(/^\| V\d{3} \|/gm) || []).length;
  if (sourceCount < 86) errors.push(`source registry has ${sourceCount} URLs, expected at least 86`);
  return {
    path: rel(ARCHIVE_DIR),
    missing,
    sourceCount,
    supplementalCount,
  };
}

function inspectAdapterManifest(errors) {
  if (!existsSync(LAB_MANIFEST)) {
    errors.push('missing math lab manifest');
    return { ok: false, errors: ['missing math lab manifest'], warnings: [] };
  }
  const manifest = JSON.parse(readFileSync(LAB_MANIFEST, 'utf8'));
  const result = validateMathLabManifest(manifest);
  errors.push(...result.errors.map((error) => `lab manifest: ${error}`));
  return result;
}

function inspectFormulaBanks(errors) {
  if (!existsSync(FORMULA_BANK_DIR)) {
    errors.push('missing formula bank directory');
    return [];
  }
  const files = readdirSync(FORMULA_BANK_DIR).filter((file) => file.endsWith('.json')).sort();
  const banks = [];
  for (const file of files) {
    const fullPath = path.join(FORMULA_BANK_DIR, file);
    const bank = JSON.parse(readFileSync(fullPath, 'utf8'));
    if (bank.schema !== 'yuri.math.formula-bank.v0') errors.push(`${file} has invalid schema`);
    if (!Array.isArray(bank.formulas) || bank.formulas.length === 0) errors.push(`${file} has no formulas`);
    if (bank.promotionStatus === 'verified-baseline') {
      for (const formula of bank.formulas || []) {
        if (!formula.implementedBy) errors.push(`${file}:${formula.id} missing implementedBy`);
        if (!formula.promotionStatus) errors.push(`${file}:${formula.id} missing promotionStatus`);
        if (typeof formula.advisoryOnly !== 'boolean') errors.push(`${file}:${formula.id} missing advisoryOnly`);
        if (!Array.isArray(formula.assumptions) || formula.assumptions.length === 0) errors.push(`${file}:${formula.id} missing assumptions`);
        if (!Array.isArray(formula.proofObligations) || formula.proofObligations.length === 0) errors.push(`${file}:${formula.id} missing proofObligations`);
        if (!Array.isArray(formula.variables) || formula.variables.length === 0) errors.push(`${file}:${formula.id} missing variables`);
        if (!Array.isArray(formula.workedExamples) || formula.workedExamples.length === 0) errors.push(`${file}:${formula.id} missing workedExamples`);
        if (!Array.isArray(formula.invalidInputs) || formula.invalidInputs.length === 0) errors.push(`${file}:${formula.id} missing invalidInputs`);
        if (!Array.isArray(formula.failureModes) || formula.failureModes.length === 0) errors.push(`${file}:${formula.id} missing failureModes`);
      }
    }
    banks.push({
      id: bank.id,
      path: rel(fullPath),
      promotionStatus: bank.promotionStatus,
      formulaCount: bank.formulas?.length || 0,
    });
  }
  if (banks.length < 3) errors.push(`expected at least 3 formula banks, found ${banks.length}`);
  return banks;
}

function inspectProofGate(errors) {
  const result = inspectFormulaBankDirectory(FORMULA_BANK_DIR);
  errors.push(...result.errors.map((error) => `proof gate: ${error}`));
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    executableTraceCount: result.traces.length,
    banks: result.banks,
  };
}

function inspectCoreProofs(errors) {
  const fixture = JSON.parse(readFileSync(path.join(REPO_ROOT, '_SYSTEM/labs/math/fixtures/pathfinding-demo.json'), 'utf8'));
  const dijkstraResult = dijkstra(fixture.graph, fixture.source, fixture.target);
  const astarResult = astar(fixture.graph, fixture.source, fixture.target, fixture.heuristic, { strict: true });
  const astarMatchesDijkstra = astarResult.cost === dijkstraResult.cost
    && JSON.stringify(astarResult.path) === JSON.stringify(dijkstraResult.path);
  if (!astarMatchesDijkstra) errors.push('A* fixture does not match Dijkstra baseline');
  const calibrationScore = brierScore([0.9, 0.2], [1, 0]);
  const calibrationLoss = logLoss([0.9, 0.2], [1, 0]);
  const posterior = bayesUpdate({ prior: 0.5, likelihoodIfTrue: 0.8, likelihoodIfFalse: 0.2 });
  const weighted = weightedMean([1, 2, 3], [1, 1, 2]);
  const dot = dotProduct([1, 2, 3], [4, 5, 6]);
  const distribution = softmax([0, 0]);
  if (calibrationScore !== 0.025) errors.push('Brier calibration smoke failed');
  if (Math.abs(calibrationLoss - 0.164252033486018) > 1e-12) errors.push('log-loss calibration smoke failed');
  if (posterior !== 0.8) errors.push('Bayes update smoke failed');
  if (weighted !== 2.25) errors.push('weighted mean smoke failed');
  if (dot !== 32) errors.push('dot product smoke failed');
  if (distribution[0] !== 0.5 || distribution[1] !== 0.5) errors.push('softmax smoke failed');
  return {
    dijkstraCost: dijkstraResult.cost,
    astarCost: astarResult.cost,
    astarMatchesDijkstra,
    dijkstraExpanded: dijkstraResult.expandedCount,
    astarExpanded: astarResult.expandedCount,
    calibrationScore,
    calibrationLoss,
    posterior,
    weighted,
    dot,
    distribution,
  };
}

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, '/');
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  const result = runMathHealth();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
