import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  exportThreatIntelJson,
  loadThreatIntelMatrix,
  parseSourceRegistry,
  parseThreatRows,
  validateThreatIntel,
} from './threat-intel-kernel.mjs';

test('threat intel kernel parses source registry and 80+ matrix rows', () => {
  const model = loadThreatIntelMatrix();

  assert.equal(model.ok, true, model.validation.errors.join('\n'));
  assert.equal(Object.keys(model.sources).length, 27);
  assert.equal(model.sources.S6.quality, 'A');
  assert.equal(model.sources.S23.quality, 'B');
  assert.ok(model.rows.length >= 80);
  assert.equal(model.rows[0].threat_id, 'CY-001');
});

test('threat rows keep source-backed evidence and normalized decisions', () => {
  const model = loadThreatIntelMatrix();

  for (const row of model.rows) {
    assert.ok(row.evidence.length, `${row.threat_id} missing evidence`);
    assert.ok(['build', 'watch', 'reject'].includes(row.decision), `${row.threat_id} invalid decision`);
    assert.ok(row.report_section, `${row.threat_id} missing report section`);
    for (const sourceId of row.evidence) {
      assert.ok(model.sources[sourceId], `${row.threat_id} unknown source ${sourceId}`);
    }
  }

  assert.equal(model.summary.totalRows, model.rows.length);
  assert.ok(model.summary.buildRows > model.summary.watchRows);
});

test('regional coverage treats Europe, West, and Asia as first-class', () => {
  const model = loadThreatIntelMatrix();

  assert.ok(model.summary.regionCounts.europe >= 10);
  assert.ok(model.summary.regionCounts.west >= 10);
  assert.ok(model.summary.regionCounts.asia >= 10);
  assert.ok(model.rows.some((row) => row.regions.includes('asia') && /TC260|China|Singapore|Japan|Korea/u.test(row.threat + row.customer_pain + row.action)));
});

test('build-scoped agent and memory risks receive proof mappings', () => {
  const model = loadThreatIntelMatrix();
  const mcp = model.rows.find((row) => /MCP server tool poisoning/u.test(row.threat));
  const browser = model.rows.find((row) => /Browser-agent form exfiltration/u.test(row.threat));
  const memory = model.rows.find((row) => /Memory poisoning gradual drift/u.test(row.threat));

  assert.equal(mcp.decision, 'build');
  assert.equal(mcp.lab_scenario, 'local-mcp-tool-poisoning-lab');
  assert.equal(mcp.scanner_rule, 'agent-tool-connector-manifest-rule');
  assert.equal(mcp.guardrail, 'tool-input-output-rail');
  assert.match(mcp.safety_boundary, /owned-local/);

  assert.equal(browser.lab_scenario, 'owned-browser-agent-compromise-lab');
  assert.equal(browser.guardrail, 'browser-action-boundary-rail');
  assert.equal(memory.lab_scenario, 'synthetic-memory-poisoning-lab');
  assert.equal(memory.guardrail, 'retrieval-memory-provenance-rail');
});

test('source quality scoring keeps authoritative sources higher than local market pages', () => {
  const model = loadThreatIntelMatrix();
  const nistRows = model.rows.filter((row) => row.evidence.includes('S11') || row.evidence.includes('S12'));
  const upgreatRows = model.rows.filter((row) => row.evidence.includes('S25'));

  assert.ok(nistRows.every((row) => row.source_quality.grades.includes('A')));
  assert.ok(nistRows.every((row) => row.source_quality.score >= 0.7));
  assert.ok(upgreatRows.some((row) => row.source_quality.grades.includes('D')));
});

test('validation fails closed on unknown evidence and premature platform claims', () => {
  const model = loadThreatIntelMatrix();
  const rows = structuredClone(model.rows);
  rows[0].evidence = ['S404'];
  rows[1].yuri_capability = 'YURI is a mature SOC and MDR replacement.';

  const validation = validateThreatIntel({ rows, sources: model.sources });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /S404/);
  assert.match(validation.errors.join('\n'), /premature mature-platform claim/);
});

test('parser functions remain stable against the sealed markdown matrix', () => {
  const markdown = readFileSync(new URL('../docs/YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md', import.meta.url), 'utf8');
  const sources = parseSourceRegistry(markdown);
  const rows = parseThreatRows(markdown);

  assert.equal(sources.S1.quality, 'B');
  assert.equal(sources.S18.quality, 'A');
  assert.equal(rows.length, 90);
  assert.equal(rows.at(-1).number, 90);
});

test('JSON export writes structured kernel artifact', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-threat-intel-'));
  try {
    const model = loadThreatIntelMatrix();
    const exportPath = path.join(dir, 'threat-intel.json');
    exportThreatIntelJson(model, exportPath);
    const exported = JSON.parse(readFileSync(exportPath, 'utf8'));

    assert.equal(existsSync(exportPath), true);
    assert.equal(exported.schema, 'yuri.threat-intel-matrix.v1');
    assert.equal(exported.threats.length, model.rows.length);
    assert.equal(exported.validation.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
