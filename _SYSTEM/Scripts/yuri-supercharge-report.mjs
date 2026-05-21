#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DOCS_DIR = path.join(REPO_ROOT, '_SYSTEM', 'docs');
export const ADVISORY_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'shintai-advisory');
export const RELEASE_GATE_LATEST = path.join(REPO_ROOT, '_SYSTEM', 'state', 'release-gate', 'automation-health-latest.json');
export const DEFAULT_REPORT_PATH = path.join(DOCS_DIR, 'YURI_OS_SUPERCHARGE_FINAL_REPORT_2026-05-21.md');
export const MEMBER_NOTES_PATH = path.join(DOCS_DIR, 'YURI_OS_SHINTAI_MEMBER_NOTES_2026-05-21.md');

const DOC_PATHS = Object.freeze({
  goal: path.join(DOCS_DIR, 'YURI_OS_FORENSIC_SUPERCHARGE_GOAL_2026-05-20.md'),
  nemoMatrix: path.join(DOCS_DIR, 'YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md'),
  patchWaves: path.join(DOCS_DIR, 'YURI_OS_SUPERCHARGE_PATCH_WAVES_2026-05-20.md'),
  nemoSource: path.join(DOCS_DIR, 'YURI_OS_NEMO_GUARDRAILS_SOURCE_REPO_PROGRESS_2026-05-20.md'),
});

const WAVE_STATUS = Object.freeze({
  0: 'PASS',
  1: 'PASS',
  2: 'WARN - execution sub-rails enforced; retrieval/output wiring proof remains tracked',
  3: 'PASS',
  4: 'PASS',
  5: 'PASS',
  6: 'PASS',
  7: 'PASS',
});

export function collectSuperchargeEvidence(options = {}) {
  const now = options.now || new Date();
  const docs = Object.fromEntries(
    Object.entries(DOC_PATHS).map(([id, filePath]) => [id, summarizeDoc(filePath)]),
  );
  const patchText = readIfExists(DOC_PATHS.patchWaves);
  return {
    generatedAt: now.toISOString(),
    docs,
    waves: parseWaves(patchText),
    latestAdvisory: latestAdvisoryPath(),
    latestReleaseGate: latestReleaseGateEvidence(),
    memberNotes: summarizeDoc(MEMBER_NOTES_PATH),
    commits: recentCommits(),
    releaseGateCommand: 'node _SYSTEM/Scripts/yuri-supercharge-gate.mjs',
    protectedSurfaces: ['backend/data/', '.claude/state/', '.claude/history/', '.env', 'node_modules/', '.amp/'],
  };
}

export function renderSuperchargeReport(evidence = collectSuperchargeEvidence()) {
  const waveLines = evidence.waves.map((wave) => `- Wave ${wave.number}: ${wave.title} — ${wave.status}`).join('\n');
  const docLines = Object.entries(evidence.docs)
    .map(([id, doc]) => `- ${id}: ${doc.exists ? `${doc.path} (${doc.bytes} bytes)` : 'missing'}`)
    .join('\n');
  const commitLines = evidence.commits.map((line) => `- ${line}`).join('\n');
  return [
    '# YURI OS Supercharge Final Report',
    '',
    `Generated: ${evidence.generatedAt}`,
    '',
    '## Scope',
    '',
    'This report is the shipping ledger for the staged YURI OS / MUSUBI supercharge run. It records the ground-truth docs, implemented waves, Shintai advisory artifacts, release command, and residual risks.',
    '',
    '## Evidence',
    '',
    docLines,
    `- latestShintaiAdvisory: ${evidence.latestAdvisory || 'none'}`,
    `- latestReleaseGate: ${evidence.latestReleaseGate.exists ? `${evidence.latestReleaseGate.path} (${evidence.latestReleaseGate.gateStatus})` : 'missing'}`,
    `- memberNotes: ${evidence.memberNotes.exists ? evidence.memberNotes.path : 'missing'}`,
    '',
    '## Wave Status',
    '',
    waveLines,
    '',
    '## Recent Implementation Commits',
    '',
    commitLines || '- none',
    '',
    '## Release Gate',
    '',
    `Command: \`${evidence.releaseGateCommand}\``,
    '',
    'Required final evidence before calling the run complete:',
    '- release gate stdout contains `YURI_SUPERCHARGE_GATE_PASS`',
    '- release gate writes `_SYSTEM/state/release-gate/automation-health-latest.json`',
    '- Rick syntax check prints `ALL_PASS`',
    '- final Shintai no-timeout audit rechecks Waves 0, 1, and 2',
    '- git status contains no intentional implementation files left unstaged',
    '',
    '## Residual Risks',
    '',
    '- Runtime/protected Claude/Amp state may remain dirty and must not be staged as implementation code.',
    '- Slow NIM lanes are latency evidence, not failure, unless they emit provider errors or explicit nonzero exits.',
    '- Browser-harness research remains local Chrome/CDP first; screenshots are only visual evidence.',
    '- Output/PTY rail hardening remains a separate tracked phase, not part of this release-gate slice.',
    '',
    '## Protected Surfaces',
    '',
    evidence.protectedSurfaces.map((entry) => `- ${entry}`).join('\n'),
    '',
  ].join('\n');
}

export function writeSuperchargeReport(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_REPORT_PATH);
  const evidence = collectSuperchargeEvidence(options);
  const markdown = renderSuperchargeReport(evidence);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, markdown);
  return { ok: true, reportPath, evidence, markdown };
}

function summarizeDoc(filePath) {
  if (!existsSync(filePath)) return { exists: false, path: path.relative(REPO_ROOT, filePath), bytes: 0, title: '' };
  const text = readFileSync(filePath, 'utf8');
  return {
    exists: true,
    path: path.relative(REPO_ROOT, filePath),
    bytes: Buffer.byteLength(text),
    title: text.match(/^#\s+(.+)$/m)?.[1] || '',
  };
}

function parseWaves(text) {
  const waves = [];
  for (const match of String(text || '').matchAll(/^## Wave\s+(\d+)\s+-\s+(.+)$/gm)) {
    waves.push({
      number: Number(match[1]),
      title: match[2].trim(),
      status: WAVE_STATUS[Number(match[1])] || 'under-review',
    });
  }
  return waves;
}

function latestAdvisoryPath() {
  if (!existsSync(ADVISORY_DIR)) return '';
  const files = readdirSync(ADVISORY_DIR)
    .filter((name) => /^shintai-.*\.md$/.test(name))
    .map((name) => {
      const fullPath = path.join(ADVISORY_DIR, name);
      return { fullPath, mtimeMs: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] ? path.relative(REPO_ROOT, files[0].fullPath) : '';
}

function latestReleaseGateEvidence() {
  if (!existsSync(RELEASE_GATE_LATEST)) {
    return { exists: false, path: path.relative(REPO_ROOT, RELEASE_GATE_LATEST), gateStatus: '' };
  }
  try {
    const parsed = JSON.parse(readFileSync(RELEASE_GATE_LATEST, 'utf8'));
    return {
      exists: true,
      path: path.relative(REPO_ROOT, RELEASE_GATE_LATEST),
      gateStatus: parsed.gateStatus || '',
      generatedAt: parsed.generatedAt || '',
      preflightSha256: parsed.preflightSha256 || '',
    };
  } catch {
    return { exists: true, path: path.relative(REPO_ROOT, RELEASE_GATE_LATEST), gateStatus: 'unreadable' };
  }
}

function recentCommits() {
  try {
    return execFileSync('git', ['log', '--oneline', '-8'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  if (write) {
    const result = writeSuperchargeReport();
    process.stdout.write(`${result.reportPath}\n`);
  } else {
    process.stdout.write(renderSuperchargeReport());
  }
}
