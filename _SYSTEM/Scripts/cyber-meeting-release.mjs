#!/usr/bin/env node
/**
 * YURI Upgreat Meeting Release v0.
 *
 * One command to refresh the Upgreat-facing cyber artifacts and run the focused
 * meeting verification gate.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCyberProofCards } from './cyber-proof-cards.mjs';
import { writeCyberRetestProof } from './cyber-retest-proof.mjs';
import { writeCyberMeetingPack } from './cyber-meeting-pack.mjs';
import { writeCyberDemoTranscript } from './cyber-demo-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_RELEASE_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_UPGREAT_MEETING_RELEASE_2026-05-23.md',
);

export const MEETING_RELEASE_TESTS = Object.freeze([
  '_SYSTEM/Scripts/xref-navigation.test.mjs',
  '_SYSTEM/Scripts/cyber-retest-proof.test.mjs',
  '_SYSTEM/Scripts/cyber-proof-cards.test.mjs',
  '_SYSTEM/Scripts/cyber-meeting-pack.test.mjs',
  '_SYSTEM/Scripts/cyber-demo-runner.test.mjs',
]);

export function runCyberMeetingRelease(options = {}) {
  const proofCards = writeCyberProofCards({
    ...options,
    reportPath: options.proofCardsPath,
  });
  const retestProof = writeCyberRetestProof({
    ...options,
    reportPath: options.retestProofPath,
    jsonPath: options.retestProofJsonPath,
  });
  const meetingPack = writeCyberMeetingPack({
    ...options,
    reportPath: options.meetingPackPath,
  });
  const demoTranscript = writeCyberDemoTranscript({
    ...options,
    reportPath: options.demoTranscriptPath,
  });
  const verification = options.skipTests
    ? { ok: true, skipped: true, command: null, stdout: '' }
    : runVerification();

  const release = {
    schema: 'yuri.upgreat-meeting-release.v0',
    generatedAt: new Date().toISOString(),
    artifacts: [
      path.relative(REPO_ROOT, proofCards.reportPath),
      path.relative(REPO_ROOT, retestProof.reportPath),
      path.relative(REPO_ROOT, meetingPack.reportPath),
      path.relative(REPO_ROOT, demoTranscript.reportPath),
    ],
    verification,
    validation: {
      ok: proofCards.ok === true && retestProof.ok === true && meetingPack.ok === true && demoTranscript.ok === true && verification.ok === true,
      errors: [],
    },
  };
  if (!release.validation.ok) release.validation.errors.push('meeting release did not pass artifact or verification gate');
  return release;
}

export function writeCyberMeetingRelease(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_RELEASE_REPORT_PATH);
  const release = runCyberMeetingRelease(options);
  if (!release.validation.ok) {
    throw new Error(`Cyber meeting release failed: ${release.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderCyberMeetingReleaseMarkdown(release));
  return { ok: true, reportPath, release };
}

export function renderCyberMeetingReleaseMarkdown(release) {
  return [
    '# YURI Upgreat Meeting Release',
    '',
    `Generated: ${release.generatedAt}`,
    '',
    '## Artifacts',
    '',
    release.artifacts.map((artifact) => `- ${artifact}`).join('\n'),
    '',
    '## Verification',
    '',
    release.verification.skipped
      ? '- skipped in test mode'
      : `- Command: \`${release.verification.command}\`\n- Result: pass`,
    '',
  ].join('\n');
}

function runVerification() {
  const args = ['--test', ...MEETING_RELEASE_TESTS];
  const stdout = execFileSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: true,
    skipped: false,
    command: `node ${args.join(' ')}`,
    stdout,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const skipTests = args.includes('--skip-tests');
  const result = writeCyberMeetingRelease({ skipTests });
  process.stdout.write(`cyber_meeting_release=${path.relative(REPO_ROOT, result.reportPath)}\n`);
}
