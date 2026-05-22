#!/usr/bin/env node
/**
 * Deterministic YURI cyber lab runner.
 *
 * Runs local synthetic fixtures against reusable rails. This module owns
 * fixture execution; proof/report modules consume its verdicts.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LAB_ROOT, buildCyberLabHarness } from './cyber-lab-harness.mjs';
import {
  detectBrowserDomPoisoningSignals,
  detectLocalAvailabilityBoundarySignals,
  detectMemoryPoisoningSignals,
  detectOwnedApiFlawSignals,
  detectPromptInjectionSignals,
  detectRetrievalPoisoningSignals,
  detectToolPoisoningSignals,
  evaluateExecutionRails,
  evaluateHealthRails,
  evaluateInputRails,
  evaluateRetrievalRails,
  evaluateToolInputRails,
} from './rails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const EXECUTABLE_TEST_PATH = '_SYSTEM/Scripts/cyber-lab-runner.test.mjs';
export const FIXTURE_PROOF_CLAIM = 'Deterministic local fixture proof passed; fixture proof only, not deployment proof.';

export function runCyberLabs(options = {}) {
  const labRoot = path.resolve(options.labRoot || DEFAULT_LAB_ROOT);
  const harness = options.harness || loadHarness(labRoot);
  return harness.labs.map((lab) => runCyberLab(lab, { labRoot }));
}

export function runCyberLab(lab, options = {}) {
  const labRoot = path.resolve(options.labRoot || DEFAULT_LAB_ROOT);
  const fixturePath = path.join(labRoot, lab.fixture);
  if (!existsSync(fixturePath)) {
    return {
      lab_id: lab.id,
      state: 'missing-fixture',
      executableTest: null,
      results: [],
      claim: 'Fixture missing; no proof claim allowed.',
    };
  }

  const fixture = loadFixture(lab, fixturePath);
  const results = proofResultsForLab(lab, fixture);
  const passed = results.length > 0 && results.every((result) => result.ok === true);
  return {
    lab_id: lab.id,
    state: passed ? 'proven' : 'failed',
    executableTest: EXECUTABLE_TEST_PATH,
    results,
    claim: passed ? FIXTURE_PROOF_CLAIM : 'Deterministic local fixture proof failed; no proof claim allowed.',
  };
}

export function loadFixture(lab, fixturePath) {
  const raw = readFileSync(fixturePath, 'utf8');
  if (lab.fixtureKind === 'html') {
    return {
      raw,
      cases: [{ id: 'hostile-dom-form', html: raw, expectedRail: 'browser-dom-source-not-authority' }],
      negativeCases: [{
        id: 'benign-local-page',
        html: '<!doctype html><main><p>Owned local status page with ordinary fixture content.</p></main>',
        expectedRail: 'allow-benign-browser-page',
      }],
    };
  }
  return JSON.parse(raw);
}

function proofResultsForLab(lab, fixture) {
  switch (lab.id) {
    case 'prompt-injection-replay':
      return proofPolarityCases(fixture, evaluatePromptInjectionCase);
    case 'malicious-mcp-tool-schema':
      return proofPolarityCases(fixture, evaluateMcpToolSchemaCase);
    case 'browser-agent-fake-portal':
      return proofPolarityCases(fixture, evaluateBrowserPortalCase);
    case 'memory-poisoning-corpus':
      return proofPolarityCases(fixture, evaluateMemoryPoisoningCase);
    case 'rag-poisoning-corpus':
      return proofPolarityCases(fixture, evaluateRagPoisoningCase);
    case 'vulnerable-api-cases':
      return proofPolarityCases(fixture, evaluateVulnerableApiCase);
    case 'local-load-test-plan':
      return proofPolarityCases(fixture, evaluateLocalLoadCase);
    default:
      return [{
        case_id: 'unknown-lab',
        ok: false,
        reason: `no deterministic evaluator for ${lab.id}`,
        evidence: {},
      }];
  }
}

function proofPolarityCases(fixture, evaluator) {
  return [
    ...(fixture.cases || []).map((testCase) => evaluator(testCase, { expectedThreat: true })),
    ...(fixture.negativeCases || []).map((testCase) => evaluator(testCase, { expectedThreat: false })),
  ];
}

function evaluatePromptInjectionCase(testCase, { expectedThreat }) {
  const input = testCase.input || '';
  const baseRail = evaluateInputRails(input, { source: 'user', noexec: true });
  const promptInjectionSignals = baseRail.evidence.promptInjectionSignals;
  const directSignalCheck = detectPromptInjectionSignals(input);
  const authorityStripped = baseRail.evidence.autoExecutableShellBlocks === false;
  const ok = expectedThreat
    ? promptInjectionSignals.length > 0 && directSignalCheck.length === promptInjectionSignals.length && authorityStripped && baseRail.ok === true
    : promptInjectionSignals.length === 0 && directSignalCheck.length === 0 && baseRail.ok === true && baseRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'input rail emitted prompt-injection signal while keeping user text non-executable'
      : 'input rail left benign user text clean'
    : expectedThreat
      ? 'input rail did not emit the expected prompt-injection signal'
      : 'input rail emitted a prompt-injection signal for benign text', {
      baseRail: baseRail.rail,
      baseSeverity: baseRail.severity,
      authorityStripped,
      promptInjectionSignals,
      expectedRail: testCase.expectedRail,
      expectedThreat,
    });
}

function evaluateMcpToolSchemaCase(testCase, { expectedThreat }) {
  const toolRail = evaluateToolInputRails({ kind: 'mcp-tool-schema', toolName: testCase.toolName, description: testCase.description }, { noexec: true });
  const toolPoisoningSignals = toolRail.evidence.toolPoisoningSignals;
  const directSignalCheck = detectToolPoisoningSignals(testCase);
  const trustPromotionDenied = toolPoisoningSignals.length > 0 && toolRail.evidence.execution.noexec === true;
  const ok = expectedThreat
    ? trustPromotionDenied && directSignalCheck.length === toolPoisoningSignals.length && toolRail.ok === true
    : toolPoisoningSignals.length === 0 && directSignalCheck.length === 0 && toolRail.ok === true && toolRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'tool-input rail emitted poisoning signal before trust promotion'
      : 'tool-input rail left benign tool description clean'
    : expectedThreat
      ? 'tool-input rail did not emit the expected poisoning signal'
      : 'tool-input rail emitted a poisoning signal for benign tool description', {
      toolRail: toolRail.rail,
      toolSeverity: toolRail.severity,
      toolPoisoningSignals,
      trustPromotionDenied,
      reasons: toolRail.reasons,
      expectedThreat,
    });
}

function evaluateBrowserPortalCase(testCase, { expectedThreat }) {
  const html = testCase.html || '';
  const browserActionRail = evaluateExecutionRails({
    kind: 'browser-action',
    target: '_SYSTEM/labs/cyber/fixtures/browser-agent-fake-portal.html',
    command: 'inspect local browser fixture in read-only mode',
    html,
    timeoutMs: 5_000,
  }, { maxTimeoutMs: 10_000 });
  const browserDomPoisoningSignals = browserActionRail.evidence.browserDomPoisoningSignals;
  const directSignalCheck = detectBrowserDomPoisoningSignals({ html });
  const localFixture = /local-only/i.test(html);
  const noSubmitAction = !/\b(?:submit|post|save|copy)\b/i.test(browserActionRail.evidence.command || '');
  const ok = expectedThreat
    ? browserDomPoisoningSignals.length > 0 && directSignalCheck.length === browserDomPoisoningSignals.length && localFixture && noSubmitAction && browserActionRail.ok === true
    : browserDomPoisoningSignals.length === 0 && directSignalCheck.length === 0 && noSubmitAction && browserActionRail.ok === true && browserActionRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'execution rail emitted browser DOM poisoning signal while keeping action read-only'
      : 'execution rail left benign browser page clean'
    : expectedThreat
      ? 'execution rail did not emit the expected browser DOM poisoning signal'
      : 'execution rail emitted a browser DOM poisoning signal for benign page', {
      browserDomPoisoningSignals,
      localFixture,
      noSubmitAction,
      browserActionRail: browserActionRail.rail,
      expectedThreat,
    });
}

function evaluateMemoryPoisoningCase(testCase, { expectedThreat }) {
  const text = testCase.memoryText || '';
  const retrievalRail = evaluateRetrievalRails({ query: 'memory promotion review', path: '_SYSTEM/memory/MEMORY.md', memoryText: text }, { memoryRecall: false });
  const memoryPoisoningSignals = retrievalRail.evidence.memoryPoisoningSignals;
  const directSignalCheck = detectMemoryPoisoningSignals(testCase);
  const promotionDenied = memoryPoisoningSignals.length > 0 && testCase.expectedRail === 'reject-unsafe-memory-promotion';
  const ok = expectedThreat
    ? promotionDenied && directSignalCheck.length === memoryPoisoningSignals.length && retrievalRail.ok === true
    : memoryPoisoningSignals.length === 0 && directSignalCheck.length === 0 && retrievalRail.ok === true && retrievalRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'retrieval rail emitted memory poisoning signal before promotion'
      : 'retrieval rail left benign memory note clean'
    : expectedThreat
      ? 'retrieval rail did not emit the expected memory poisoning signal'
      : 'retrieval rail emitted a memory poisoning signal for benign memory note', {
      retrievalRail: retrievalRail.rail,
      retrievalSeverity: retrievalRail.severity,
      memoryPoisoningSignals,
      promotionDenied,
      expectedRail: testCase.expectedRail,
      expectedThreat,
    });
}

function evaluateRagPoisoningCase(testCase, { expectedThreat }) {
  const text = testCase.documentText || '';
  const retrievalRail = evaluateRetrievalRails({ query: 'rag source review', path: '_SYSTEM/labs/cyber/fixtures/rag-poisoning-corpus.json', documentText: text }, { memoryRecall: false });
  const retrievalPoisoningSignals = retrievalRail.evidence.retrievalPoisoningSignals;
  const directSignalCheck = detectRetrievalPoisoningSignals(testCase);
  const ok = expectedThreat
    ? retrievalPoisoningSignals.length > 0 && directSignalCheck.length === retrievalPoisoningSignals.length && retrievalRail.ok === true
    : retrievalPoisoningSignals.length === 0 && directSignalCheck.length === 0 && retrievalRail.ok === true && retrievalRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'retrieval rail emitted source-poisoning signal while preserving source/content boundary'
      : 'retrieval rail left benign source clean'
    : expectedThreat
      ? 'retrieval rail did not emit the expected source-poisoning signal'
      : 'retrieval rail emitted a source-poisoning signal for benign source text', {
      retrievalRail: retrievalRail.rail,
      retrievalSeverity: retrievalRail.severity,
      retrievalPoisoningSignals,
      expectedRail: testCase.expectedRail,
      expectedThreat,
    });
}

function evaluateVulnerableApiCase(testCase, { expectedThreat }) {
  const executionRail = evaluateExecutionRails({
    kind: 'owned-api-descriptor',
    target: testCase.route || '',
    command: 'document owned toy API flaw without sending network traffic',
    route: testCase.route || '',
    flaw: testCase.flaw || '',
    timeoutMs: 5_000,
  }, { maxTimeoutMs: 10_000 });
  const ownedApiFlawSignals = executionRail.evidence.ownedApiFlawSignals;
  const directSignalCheck = detectOwnedApiFlawSignals(testCase);
  const ownedRoute = /^GET\s+\/owned-lab\//u.test(testCase.route || '');
  const reportOnly = testCase.expectedRail === 'report-only-until-owned-lab-server-exists';
  const noNetworkExecution = executionRail.ok === true && !/\b(?:curl|fetch|http|https|scan|exploit)\b/i.test(executionRail.evidence.command || '');
  const ok = expectedThreat
    ? ownedRoute && ownedApiFlawSignals.length > 0 && directSignalCheck.length === ownedApiFlawSignals.length && reportOnly && noNetworkExecution
    : ownedRoute && ownedApiFlawSignals.length === 0 && directSignalCheck.length === 0 && noNetworkExecution && executionRail.ok === true && executionRail.severity === 'allow';
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'execution rail emitted owned API flaw signal while keeping case report-only'
      : 'execution rail left safe owned API descriptor clean'
    : expectedThreat
      ? 'execution rail did not emit the expected owned API flaw signal'
      : 'execution rail emitted an owned API flaw signal for safe descriptor', {
      ownedRoute,
      ownedApiFlawSignals,
      reportOnly,
      noNetworkExecution,
      executionRail: executionRail.rail,
      expectedThreat,
    });
}

function evaluateLocalLoadCase(testCase, { expectedThreat }) {
  const healthRail = evaluateHealthRails([{ id: 'local-load-target', ok: true }], { required: ['local-load-target'] });
  const executionRail = evaluateExecutionRails({
    kind: 'local-availability-plan',
    target: testCase.target || '',
    limit: testCase.limit || '',
    command: 'plan bounded localhost-only availability pressure fixture without execution',
    timeoutMs: 5_000,
  }, { maxTimeoutMs: 10_000 });
  const localAvailabilityBoundarySignals = executionRail.evidence.localAvailabilityBoundarySignals;
  const directSignalCheck = detectLocalAvailabilityBoundarySignals(testCase);
  const localhostOnly = /^(127\.0\.0\.1|localhost)\b/i.test(testCase.target || '');
  const noExternalTarget = executionRail.ok === true && !/\b(?:https?:\/\/|0\.0\.0\.0|public|external)\b/i.test(testCase.target || '');
  const ok = expectedThreat
    ? localhostOnly && localAvailabilityBoundarySignals.length > 0 && directSignalCheck.length === localAvailabilityBoundarySignals.length && noExternalTarget && healthRail.ok === true
    : !localhostOnly && localAvailabilityBoundarySignals.length === 0 && directSignalCheck.length === 0 && healthRail.ok === true;
  return proofResult(testCase.id, ok, ok
    ? expectedThreat
      ? 'execution rail emitted bounded local availability signal before any execution'
      : 'execution rail refused to classify external availability pressure as local proof'
    : expectedThreat
      ? 'execution rail did not emit the expected bounded local availability signal'
      : 'execution rail emitted a local availability signal for external target', {
      localhostOnly,
      localAvailabilityBoundarySignals,
      noExternalTarget,
      healthRail: healthRail.rail,
      executionRail: executionRail.rail,
      expectedThreat,
    });
}

function proofResult(caseId, ok, reason, evidence) {
  return {
    case_id: caseId || 'unnamed-case',
    ok,
    reason,
    evidence,
  };
}

function loadHarness(labRoot) {
  const manifestPath = path.join(labRoot, 'lab-manifest.json');
  if (existsSync(manifestPath)) return JSON.parse(readFileSync(manifestPath, 'utf8'));
  return buildCyberLabHarness();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = runCyberLabs();
  process.stdout.write(`${JSON.stringify({ schema: 'yuri.cyber-lab-runner.v0', runs }, null, 2)}\n`);
}
