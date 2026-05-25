#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildOperationalSimulationReport } from './math-operational-simulation.mjs';
import { runFormulaProofGate } from './math-proof-gate.mjs';

const FORMULA_BANK_DIR = '_SYSTEM/data/math/formula-banks';
const LAB_MANIFEST = JSON.parse(readFileSync('_SYSTEM/labs/math/lab-manifest.json', 'utf8'));
const PLAYBOOK = readFileSync('_SYSTEM/research-archive/yuri-math-engine-2026-05/13_math_application_playbook.md', 'utf8');

function promotedBanks() {
  return readdirSync(FORMULA_BANK_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(FORMULA_BANK_DIR, file), 'utf8')))
    .filter((bank) => bank.promotionStatus === 'verified-baseline' && bank.advisoryOnly === false);
}

test('promoted formula cards carry professional operating metadata', () => {
  for (const bank of promotedBanks()) {
    for (const formula of bank.formulas) {
      assert.equal(typeof formula.plainLanguageUseCase, 'string', `${formula.id} missing plainLanguageUseCase`);
      assert.ok(formula.plainLanguageUseCase.length > 20, `${formula.id} plainLanguageUseCase too thin`);
      assert.equal(typeof formula.units, 'object', `${formula.id} missing units`);
      assert.ok(Array.isArray(formula.inputConstraints) && formula.inputConstraints.length > 0, `${formula.id} missing inputConstraints`);
      assert.ok(Array.isArray(formula.counterexamples) && formula.counterexamples.length > 0, `${formula.id} missing counterexamples`);
      assert.equal(typeof formula.selectionGuidance, 'object', `${formula.id} missing selectionGuidance`);
      assert.ok(Array.isArray(formula.selectionGuidance.useWhen), `${formula.id} missing useWhen guidance`);
      assert.ok(Array.isArray(formula.selectionGuidance.avoidWhen), `${formula.id} missing avoidWhen guidance`);
      assert.ok(Array.isArray(formula.selectionGuidance.yuriApplications), `${formula.id} missing YURI applications`);
      assert.equal(formula.implementationBinding?.binding, formula.implementedBy, `${formula.id} implementation binding drift`);
      assert.equal(formula.implementationBinding?.proofGateFormulaId, formula.id, `${formula.id} proof-gate binding drift`);
      assert.ok(Array.isArray(formula.testVectors) && formula.testVectors.length >= 2, `${formula.id} missing test vectors`);
      assert.ok(Array.isArray(formula.sources) && formula.sources.length > 0, `${formula.id} missing sources`);
    }
  }
});

test('formula-card counterexamples fail deterministically through the proof gate', () => {
  for (const bank of promotedBanks()) {
    for (const formula of bank.formulas) {
      for (const counterexample of formula.counterexamples) {
        const trace = runFormulaProofGate({
          formulaId: formula.id,
          input: counterexample.input,
          mode: 'advisory',
          exampleName: counterexample.name,
        });
        assert.equal(trace.passed, false, `${formula.id}:${counterexample.name} unexpectedly passed`);
        assert.match(trace.error, new RegExp(counterexample.expectedError), `${formula.id}:${counterexample.name} wrong error`);
        assert.equal(trace.inputHash.length, 64, `${formula.id}:${counterexample.name} missing input hash`);
      }
    }
  }
});

test('math application playbook answers the operating-substrate questions', () => {
  for (const phrase of [
    'Domain Selection',
    'Variable Mapping',
    'Correct Use Checks',
    'Memory Ranking',
    'Context Routing',
    'RAG Conflict Detection',
    'Tool And Lane Routing',
    'Release Gate Scoring',
    'Creative Production Scheduling',
    'Visual Proof Rule',
    'External Adapter Rule',
    'When Not To Use Math',
  ]) {
    assert.match(PLAYBOOK, new RegExp(phrase));
  }
  assert.doesNotMatch(PLAYBOOK, /\b(trading|market|investing)\b/i);
});

test('external math adapters declare commands, boundaries, and promotion gates', () => {
  const externalAdapters = LAB_MANIFEST.adapters.filter((adapter) => adapter.id !== 'node-math-core');
  assert.ok(externalAdapters.some((adapter) => adapter.id === 'python-numpy'), 'python-numpy adapter missing');
  assert.ok(externalAdapters.some((adapter) => adapter.id === 'python-networkx'), 'python-networkx adapter missing');
  assert.ok(externalAdapters.some((adapter) => adapter.id === 'sympy-symbolic'), 'sympy-symbolic adapter missing');

  for (const adapter of externalAdapters) {
    assert.equal(adapter.writesRuntimeTruth, false, `${adapter.id} can write runtime truth`);
    assert.notEqual(adapter.runMode, 'runtime', `${adapter.id} declares runtime mode`);
    assert.equal(typeof adapter.authorityBoundary, 'string', `${adapter.id} missing authorityBoundary`);
    assert.ok(Array.isArray(adapter.commands) && adapter.commands.length > 0, `${adapter.id} missing commands`);
    assert.ok(Array.isArray(adapter.outputs) && adapter.outputs.length > 0, `${adapter.id} missing outputs`);
    assert.ok(Array.isArray(adapter.promotionGate) && adapter.promotionGate.length > 0, `${adapter.id} missing promotionGate`);
  }
});

test('visual proof artifact lab creates JSON, SVG, PNG, and HTML outputs', () => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'yuri-math-visual-'));
  const result = spawnSync('python3', [
    '_SYSTEM/labs/math/visual-proof-artifact-lab.py',
    '--out-dir',
    outDir,
    '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.writesRuntimeTruth, false);
  for (const file of [
    'pathfinding-proof.json',
    'pathfinding-proof.svg',
    'pathfinding-proof.png',
    'bayes-confidence-proof.json',
    'bayes-confidence-proof.svg',
    'bayes-confidence-proof.png',
    'index.html',
  ]) {
    const fullPath = path.join(outDir, file);
    assert.ok(statSync(fullPath).size > 100, `${file} was not generated with useful content`);
  }
});

test('operational simulation is deterministic and non-invasive', () => {
  const first = buildOperationalSimulationReport();
  const second = buildOperationalSimulationReport();

  assert.equal(first.schema, 'yuri.math-operational-simulation.v0');
  assert.equal(first.advisoryOnly, true);
  assert.equal(first.localTruthClaim, false);
  assert.equal(first.writesRuntimeTruth, false);
  assert.equal(first.reportHash, second.reportHash);
  assert.equal(first.sections.contextRouting.route.cost, 5);
  assert.equal(first.sections.ragConflictDetection.status, 'review_distribution_shift');
  assert.deepEqual(first.sections.creativeProductionScheduling.order, [
    'concept',
    'reference-board',
    'draft',
    'review',
    'render',
    'package',
  ]);
});
