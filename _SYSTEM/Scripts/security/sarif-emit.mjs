#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// security/sarif-emit.mjs — SARIF 2.1.0 output for the skill-security SAST gate.
//
// CLEAN-ROOM, node builtins ONLY. Converts the gate's findings into a valid SARIF 2.1.0 log so
// the scanner can plug into CI code-scanning surfaces (GitHub code-scanning, etc.).
//
// HARDENING item 1: ZERO REPO_ROOT computation. Pure function of (findings, taxonomy, meta).
// The orchestrator supplies the taxonomy (for rule metadata) and the relative artifact URIs.
//
// SARIF 2.1.0 shape reference (re-expressed from the published JSON schema, not copied from any
// repo): a `sarifLog` has $schema + version "2.1.0" + runs[]; each run has tool.driver (name,
// rules[]) + results[]; each result has ruleId, level, message.text, locations[] with a
// physicalLocation.artifactLocation.uri + region.startLine.

const SEVERITY_TO_SARIF_LEVEL = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
};

const SARIF_VERSION = '2.1.0';
const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

function sarifLevel(severity) {
  return SEVERITY_TO_SARIF_LEVEL[severity] || 'warning';
}

// Build the rules[] descriptor array from the taxonomy (only categories that actually fired,
// to keep the driver compact, but a full-taxonomy mode is available via includeAllRules).
function buildRules(taxonomy, firedIds, includeAllRules) {
  const taxa = Array.isArray(taxonomy) ? taxonomy : [];
  const wanted = includeAllRules ? taxa : taxa.filter((t) => firedIds.has(t.id));
  return wanted.map((t) => ({
    id: t.id,
    name: t.name,
    shortDescription: { text: t.name },
    fullDescription: { text: t.explanation || t.name },
    defaultConfiguration: { level: sarifLevel(t.severity) },
    properties: {
      severity: t.severity,
      remediation: t.remediation || '',
      tags: ['security', 'skill-gate'],
    },
  }));
}

function relativeUri(absOrRel) {
  // emit a clean forward-slash relative-ish URI; the orchestrator passes already-relative paths
  return String(absOrRel ?? '').split('\\').join('/').replace(/^\/+/, '');
}

/**
 * toSarif({ findings, taxonomy, toolName, toolVersion, includeAllRules }) -> SARIF 2.1.0 object.
 * findings: [{ id, severity, evidence|message, uri|filePath, line }]
 * NEVER throws (best-effort; malformed findings are coerced).
 */
export function toSarif({
  findings = [],
  taxonomy = [],
  toolName = 'yuri-skill-security-gate',
  toolVersion = '1.0.0',
  includeAllRules = false,
} = {}) {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const firedIds = new Set(safeFindings.map((f) => f && f.id).filter(Boolean));

  const results = safeFindings.map((f) => {
    const id = f?.id || 'UNKNOWN';
    const severity = f?.severity || 'MEDIUM';
    const uri = relativeUri(f?.uri || f?.filePath || 'SKILL.md');
    const line = Number.isInteger(f?.line) && f.line > 0 ? f.line : 1;
    const text = String(f?.message || f?.evidence || f?.label || id);
    return {
      ruleId: id,
      level: sarifLevel(severity),
      message: { text },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri },
            region: { startLine: line },
          },
        },
      ],
      properties: { severity },
    };
  });

  let rules;
  try {
    rules = buildRules(taxonomy, firedIds, includeAllRules);
  } catch {
    rules = [];
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: toolName,
            informationUri: 'https://github.com/anthropics/claude-code',
            version: toolVersion,
            rules,
          },
        },
        results,
      },
    ],
  };
}

export function toSarifString(opts) {
  return `${JSON.stringify(toSarif(opts), null, 2)}\n`;
}

// CLI self-check: emits a tiny demo SARIF so the shape can be eyeballed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = toSarif({
    findings: [{ id: 'SUPPLY_CHAIN', severity: 'CRITICAL', evidence: 'eval(userInput)', filePath: 'attack.mjs', line: 5 }],
    taxonomy: [{ id: 'SUPPLY_CHAIN', name: 'Supply chain', severity: 'CRITICAL', explanation: 'demo', remediation: 'demo' }],
  });
  process.stdout.write(`${JSON.stringify(demo, null, 2)}\n`);
}
