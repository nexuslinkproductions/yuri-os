#!/usr/bin/env node

/**
 * yuri-closeout.mjs - deterministic YURI closeout checkpoint.
 *
 * Provider-neutral, read-only, and intentionally lighter than the old EOT
 * pipeline. It summarizes repo state, scoped validation, and recent Kagami
 * events without reading protected provider runtime.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readKagamiEvents } from './kagami-event-bus.mjs';
import { isProtectedPath } from './lane-kernel.mjs';
import { scanClaimIntegrity } from './claim-integrity-gate.mjs';
import { checkOutputConformance } from './contract-conformance.mjs';
import { SCOPE_AUDIT_CONTRACT, recordConformance, isEnforcing } from './contract-conformance-trace.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function collectPaths(argv = []) {
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--path' || index + 1 >= argv.length) continue;
    index += 1;
    const relPath = normalizeRepoPath(argv[index]);
    if (isProtectedPath(relPath)) {
      const error = new Error(`forbidden path: ${relPath}`);
      error.code = 'YURI_CLOSEOUT_PROTECTED_PATH';
      throw error;
    }
    paths.push(relPath);
  }
  return paths;
}

export function buildReport(scopedPaths = [], options = {}) {
  const status = gitExec(['status', '--short']);
  const recentEvents = collectRecentEvents(Number(options.recentEventLimit || 8));
  const scoped = scopedPaths.length
    ? scopedPaths.map((pathValue) => buildScopedStatus(pathValue))
    : [];
  // Claim-integrity runs only on explicitly scoped paths (deterministic, read-only). It never
  // scans the whole repo and never blocks; a failure escalates the closeout verdict so the
  // operator/Codex sees unsupported claims before final-pass approval.
  const claimIntegrity = scopedPaths.length ? runClaimIntegrity(scopedPaths, options) : null;
  const scopeConformance = scopedPaths.length ? runScopeConformance(scopedPaths) : null;

  return {
    schemaVersion: 'yuri.closeout.v1',
    mode: 'deterministic-readonly',
    current: {
      branch: gitExec(['branch', '--show-current']) || 'unknown',
      head: gitExec(['rev-parse', '--short', 'HEAD']) || 'unknown',
      repo: REPO_ROOT,
    },
    workingTree: summarizeStatus(status),
    scoped,
    validation: scoped.length ? scoped.flatMap((entry) => entry.validation) : ['no scoped validation requested'],
    claimIntegrity,
    scopeConformance,
    recentEvents,
    verdict: closeoutVerdict(status, scoped, recentEvents, claimIntegrity, scopeConformance),
    nonClaims: [
      'no mutation performed',
      'no protected provider runtime read',
      'no commit or staging performed',
      'model-backed synthesis not required for this deterministic checkpoint',
    ],
    nextRecommended: nextRecommended(status, scoped),
  };
}

export function formatReport(report) {
  const lines = [];
  lines.push('EOT Checkpoint');
  lines.push('');
  lines.push(`Current: branch=${report.current.branch} head=${report.current.head}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push('');
  lines.push('Working tree:');
  lines.push(`- changed files: ${report.workingTree.changedCount}`);
  for (const item of report.workingTree.sample) lines.push(`- ${item}`);
  if (!report.workingTree.sample.length) lines.push('- clean');
  lines.push('');
  lines.push('Validation:');
  for (const item of report.validation) lines.push(`- ${item}`);
  lines.push('');
  if (report.claimIntegrity) {
    const ci = report.claimIntegrity;
    lines.push('Claim integrity:');
    if (ci.error) {
      lines.push(`- scan error (non-blocking): ${ci.error}`);
    } else {
      lines.push(`- ok=${ci.ok} fail=${ci.summary?.fail ?? 0} warn=${ci.summary?.warn ?? 0} files=${ci.summary?.filesScanned ?? 0}`);
      for (const finding of (ci.findings || []).filter((f) => f.severity === 'fail').slice(0, 5)) {
        lines.push(`- FAIL ${finding.path}:${finding.line} "${finding.term}" (${finding.supportStatus})`);
      }
    }
    lines.push('');
  }
  if (report.scopeConformance) {
    const sc = report.scopeConformance;
    lines.push('Scope conformance (advisory):');
    if (sc.error) {
      lines.push(`- check error (non-blocking): ${sc.error}`);
    } else {
      lines.push(`- verdict=${sc.verdict} (scoped paths vs protected-surface floor)`);
      const v = (sc.checks || []).find((c) => c.name === 'scope-containment');
      if (v && !v.ok) lines.push(`- ${v.evidence}`);
    }
    lines.push('');
  }
  lines.push('Recent Kagami events:');
  for (const event of report.recentEvents) lines.push(`- ${event.ts} ${event.kind} ${event.lane || ''}`.trim());
  if (!report.recentEvents.length) lines.push('- none observed');
  lines.push('');
  lines.push('Non-claims:');
  for (const item of report.nonClaims) lines.push(`- ${item}`);
  lines.push('');
  lines.push('Next boot:');
  for (const item of report.nextRecommended) lines.push(`- ${item}`);
  return `${lines.join('\n')}\n`;
}

function normalizeRepoPath(inputPath) {
  const raw = String(inputPath || '').trim();
  const absolute = path.isAbsolute(raw) ? raw : path.join(REPO_ROOT, raw);
  return path.relative(REPO_ROOT, absolute).replaceAll(path.sep, '/');
}

function buildScopedStatus(pathValue) {
  const status = gitExec(['status', '--short', '--', pathValue]);
  return {
    path: pathValue,
    status: status || 'clean',
    validation: buildValidation(pathValue),
  };
}

function buildValidation(pathValue) {
  if (!/\.(?:js|mjs)$/i.test(pathValue)) return [`${pathValue}: no syntax check needed`];
  const absolute = path.resolve(REPO_ROOT, pathValue);
  if (!existsSync(absolute)) return [`${pathValue}: file not found`];
  try {
    execFileSync(process.execPath, ['--check', pathValue], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return [`${pathValue}: node --check pass`];
  } catch (err) {
    const stderr = String(err.stderr || err.message || '').trim().split('\n').at(0) || 'syntax check failed';
    return [`${pathValue}: node --check fail: ${stderr}`];
  }
}

function summarizeStatus(statusText) {
  const lines = String(statusText || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isProtectedPath(line.slice(3).trim()));
  return {
    changedCount: lines.length,
    sample: lines.slice(0, 12),
    truncated: lines.length > 12,
  };
}

function collectRecentEvents(limit) {
  try {
    return readKagamiEvents({ limit })
      .filter((event) => !hasProtectedEvidence(event))
      .map((event) => ({
        id: event.id,
        ts: event.ts,
        kind: event.kind,
        lane: event.lane || event.payload?.lane || '',
      }));
  } catch {
    return [];
  }
}

function hasProtectedEvidence(event) {
  return (event.evidenceRefs || []).some((ref) => isProtectedPath(ref));
}

function runClaimIntegrity(scopedPaths, options = {}) {
  try {
    return scanClaimIntegrity(scopedPaths, { repoRoot: REPO_ROOT, ...options });
  } catch (err) {
    return { ok: null, error: String(err.message || err), summary: {}, findings: [] };
  }
}

// Advisory, read-only scope conformance: do the scoped paths touch a protected surface?
// Uses the conformance gate's segment-aware scope check (SCOPE_AUDIT_CONTRACT = no label, scope only).
// DISARMED — reports a verdict, never blocks. Mirrors runClaimIntegrity. (wiring sim ruling 2026-06-13)
function runScopeConformance(scopedPaths) {
  try {
    const r = checkOutputConformance(SCOPE_AUDIT_CONTRACT, '', { invokedPaths: scopedPaths });
    const enforcing = isEnforcing();
    return {
      verdict: r.verdict,
      hardFails: r.hardFails,
      enforcing,
      enforceBlock: !!(enforcing && (r.hardFails || []).length > 0),
      checks: (r.checks || []).filter((c) => c.name === 'scope-containment'),
    };
  } catch (err) {
    return { verdict: 'FAIL', error: String(err.message || err), enforceBlock: false };
  }
}

function closeoutVerdict(statusText, scoped, recentEvents, claimIntegrity, scopeConformance) {
  if (scopeConformance && scopeConformance.enforceBlock) {
    return 'BLOCKED: scoped paths touch a protected surface (conformance enforce ARMED)';
  }
  if (claimIntegrity && claimIntegrity.ok === false) {
    return 'attention-needed: claim-integrity issues found';
  }
  if (scoped.some((entry) => entry.validation.some((line) => line.includes('fail')))) {
    return 'attention-needed: scoped validation failed';
  }
  if (String(statusText || '').trim()) return 'checkpoint-useful: working tree has changes';
  if (recentEvents.length) return 'checkpoint-useful: recent control-plane events exist';
  return 'optional: no material local signal';
}

function nextRecommended(statusText, scoped) {
  const recommendations = [];
  if (scoped.length) recommendations.push('review scoped validation before claiming completion');
  if (String(statusText || '').trim()) recommendations.push('keep staging scoped; ignore runtime noise unless explicitly promoted');
  recommendations.push('write a short next-session boot note only if work will resume later');
  recommendations.push('use /eot deep only for large, contradictory, or memory-worthy sessions');
  return recommendations;
}

function gitExec(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function runCli(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  try {
    const scopedPaths = collectPaths(argv);
    const report = buildReport(scopedPaths);
    if (scopedPaths.length) recordConformance('', { contract: SCOPE_AUDIT_CONTRACT, invokedPaths: scopedPaths, label: 'closeout' });
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    if (report.scopeConformance && report.scopeConformance.enforceBlock) process.exitCode = 2;
  } catch (err) {
    stdout.write(`YURI_CLOSEOUT_ERROR: ${err.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
