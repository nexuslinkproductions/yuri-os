#!/usr/bin/env node
/**
 * YURI Cyber Authorized Replay Scope v0.
 *
 * Defines the fail-closed contract required before any client or partner
 * replay. It is deliberately boring: no written scope, no execution.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_SCOPE_JSON_PATH = path.join(REPO_ROOT, '_SYSTEM/data/cyber-intel/authorized-replay-scope.json');
export const DEFAULT_SCOPE_REPORT_PATH = path.join(REPO_ROOT, '_SYSTEM/reports/YURI_AUTHORIZED_REPLAY_SCOPE_2026-05-24.md');

export function buildAuthorizedReplayScope(options = {}) {
  const scope = {
    schema: 'yuri.cyber-authorized-replay-scope.v0',
    generatedAt: new Date().toISOString(),
    status: 'blocked_until_signed_scope',
    client: options.client || 'Upgreat pilot candidate',
    authorization: {
      writtenAuthorization: options.authorization?.writtenAuthorization === true,
      authorizedBy: options.authorization?.authorizedBy || null,
      authorizationReference: options.authorization?.authorizationReference || null,
      timeWindow: options.authorization?.timeWindow || null,
      emergencyStopContact: options.authorization?.emergencyStopContact || null,
    },
    allowedSurfaces: options.allowedSurfaces || [
      'owned local synthetic fixture',
      'client-provided owned staging URL after written authorization',
      'client-provided AI-agent/tool manifest after written authorization',
      'client-provided repository snapshot after written authorization',
    ],
    allowedActions: options.allowedActions || [
      'read-only DOM/CDP inspection',
      'read-only manifest/schema review',
      'read-only repository/static analysis',
      'local fixture replay',
      'report-only finding documentation',
    ],
    forbiddenActions: options.forbiddenActions || [
      'unscoped external scanning',
      'credential capture or credential replay',
      'form submission against client systems',
      'malware execution',
      'DDoS or availability pressure outside local owned systems',
      'persistence, lateral movement, or data exfiltration',
    ],
    requiredArtifactsBeforeExecution: [
      '_SYSTEM/reports/YURI_CYBER_PROOF_CARDS_2026-05-23.md',
      '_SYSTEM/reports/YURI_CYBER_RETEST_PROOF_2026-05-24.md',
      '_SYSTEM/reports/YURI_BROWSER_REPLAY_PROOF_2026-05-24.md',
    ],
    dataHandling: [
      'no secrets copied into prompts or reports',
      'client evidence redacted before durable storage',
      'protected paths remain sealed unless a migration wrapper explicitly exports safe summaries',
      'findings split into executive summary and technical reproduction notes',
    ],
    stopConditions: [
      'scope ambiguity',
      'unexpected credential exposure',
      'client system instability',
      'request for out-of-scope offensive action',
      'missing owner contact during active replay',
    ],
  };
  scope.validation = validateAuthorizedReplayScope(scope);
  scope.releaseAllowed = scope.validation.ok && scope.validation.blockers.length === 0;
  return scope;
}

export function validateAuthorizedReplayScope(scope) {
  const errors = [];
  const blockers = [];
  const forbiddenText = [
    ...(scope.allowedActions || []),
    ...(scope.allowedSurfaces || []),
  ].join('\n');

  if (!scope.authorization?.writtenAuthorization) blockers.push('written authorization missing');
  if (!scope.authorization?.authorizedBy) blockers.push('authorizedBy missing');
  if (!scope.authorization?.authorizationReference) blockers.push('authorizationReference missing');
  if (!scope.authorization?.timeWindow) blockers.push('timeWindow missing');
  if (!scope.authorization?.emergencyStopContact) blockers.push('emergencyStopContact missing');
  if (!(scope.allowedSurfaces || []).length) errors.push('allowed surfaces missing');
  if (!(scope.allowedActions || []).length) errors.push('allowed actions missing');
  if (!(scope.forbiddenActions || []).some((action) => /external scanning/i.test(action))) {
    errors.push('external scanning prohibition missing');
  }
  if (/\b(?:ddos|credential capture|malware|exfiltration|lateral movement|persistence)\b/i.test(forbiddenText)) {
    errors.push('allowed scope contains forbidden offensive action');
  }
  return {
    ok: errors.length === 0,
    errors,
    blockers,
  };
}

export function writeAuthorizedReplayScope(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_SCOPE_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_SCOPE_REPORT_PATH);
  const scope = buildAuthorizedReplayScope(options);
  if (!scope.validation.ok) {
    throw new Error(`Authorized replay scope invalid: ${scope.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(scope, null, 2)}\n`);
  writeFileSync(reportPath, renderAuthorizedReplayScopeMarkdown(scope));
  return { ok: true, jsonPath, reportPath, scope };
}

export function renderAuthorizedReplayScopeMarkdown(scope = buildAuthorizedReplayScope()) {
  return [
    '# YURI Authorized Replay Scope',
    '',
    `Generated: ${scope.generatedAt}`,
    '',
    '## Decision',
    '',
    `- Client: ${scope.client}`,
    `- Release allowed: ${scope.releaseAllowed}`,
    `- Status: ${scope.releaseAllowed ? 'ready for scoped replay' : scope.status}`,
    '',
    'Blockers:',
    list(scope.validation.blockers),
    '',
    '## Allowed Surfaces',
    '',
    list(scope.allowedSurfaces),
    '',
    '## Allowed Actions',
    '',
    list(scope.allowedActions),
    '',
    '## Forbidden Actions',
    '',
    list(scope.forbiddenActions),
    '',
    '## Required Artifacts Before Execution',
    '',
    list(scope.requiredArtifactsBeforeExecution),
    '',
    '## Stop Conditions',
    '',
    list(scope.stopConditions),
    '',
  ].join('\n');
}

function list(items) {
  return (items || []).length ? items.map((item) => `- ${item}`).join('\n') : '- none';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--write')) {
    const result = writeAuthorizedReplayScope();
    process.stdout.write(`authorized_replay_scope_json=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`authorized_replay_scope_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildAuthorizedReplayScope(), null, 2)}\n`);
  }
}
