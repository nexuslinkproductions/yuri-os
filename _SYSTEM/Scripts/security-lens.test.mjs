import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  SECURITY_LENS_MODULES,
  buildSecurityLens,
  renderSecurityLensMarkdown,
  writeSecurityLensReport,
} from './security-lens.mjs';

test('security lens builds four source-backed assessment modules', () => {
  const lens = buildSecurityLens();

  assert.equal(lens.schema, 'yuri.security-lens.v0');
  assert.equal(lens.source.rowCount, 90);
  assert.equal(lens.modules.length, 4);
  assert.deepEqual(lens.modules.map((module) => module.id), SECURITY_LENS_MODULES.map((module) => module.id));
  for (const module of lens.modules) {
    assert.ok(module.totalRows > 0, `${module.id} should map threat rows`);
    assert.ok(module.priority.length > 0, `${module.id} should have a priority queue`);
    assert.ok(module.reportSections.length > 0, `${module.id} should map report sections`);
  }
});

test('agent and memory modules preserve concrete scanner, guardrail, and lab proof paths', () => {
  const lens = buildSecurityLens();
  const agent = lens.modules.find((module) => module.id === 'agent-skill-mcp');
  const memory = lens.modules.find((module) => module.id === 'memory-rag');

  assert.ok(agent.scannerRules.includes('agent-tool-connector-manifest-rule'));
  assert.ok(agent.guardrails.includes('tool-input-output-rail'));
  assert.ok(agent.labScenarios.includes('local-mcp-tool-poisoning-lab'));

  assert.ok(memory.scannerRules.includes('memory-rag-provenance-rule'));
  assert.ok(memory.guardrails.includes('retrieval-memory-provenance-rail'));
  assert.ok(memory.labScenarios.includes('synthetic-memory-poisoning-lab'));
});

test('security lens report rejects overclaim wording and old aliases', () => {
  const markdown = renderSecurityLensMarkdown(buildSecurityLens());

  assert.match(markdown, /not a SOC, SIEM, XDR, MDR/);
  assert.match(markdown, /owned or explicitly authorized systems/);
  assert.match(markdown, /not .*autonomous pentest product/);
  assert.doesNotMatch(markdown, /\bENKI\b/i);
});

test('security lens report writes markdown artifact', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-security-lens-'));
  try {
    const reportPath = path.join(dir, 'security-lens.md');
    const result = writeSecurityLensReport({ reportPath });
    const text = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(reportPath), true);
    assert.match(text, /# YURI Security Lens v0/);
    assert.match(text, /Agent \/ Skill \/ MCP Scanner/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
