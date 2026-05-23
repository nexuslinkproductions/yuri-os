import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  MEETING_RELEASE_TESTS,
  runCyberMeetingRelease,
  writeCyberMeetingRelease,
} from './cyber-meeting-release.mjs';

test('cyber meeting release refreshes all meeting artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-meeting-release-'));
  try {
    const release = runCyberMeetingRelease({
      skipTests: true,
      reportPath: path.join(dir, 'release.md'),
      proofCardsPath: path.join(dir, 'proof-cards.md'),
      meetingPackPath: path.join(dir, 'meeting.md'),
      demoTranscriptPath: path.join(dir, 'demo.md'),
    });

    assert.equal(release.schema, 'yuri.upgreat-meeting-release.v0');
    assert.equal(release.validation.ok, true);
    assert.equal(release.artifacts.length, 3);
    assert.equal(release.verification.skipped, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cyber meeting release declares the focused verification gate', () => {
  assert.deepEqual(MEETING_RELEASE_TESTS, [
    '_SYSTEM/Scripts/context-router.test.mjs',
    '_SYSTEM/Scripts/cyber-proof-cards.test.mjs',
    '_SYSTEM/Scripts/cyber-meeting-pack.test.mjs',
    '_SYSTEM/Scripts/cyber-demo-runner.test.mjs',
  ]);
});

test('cyber meeting release writes markdown report', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-meeting-release-report-'));
  try {
    const reportPath = path.join(dir, 'release.md');
    const result = writeCyberMeetingRelease({ reportPath, skipTests: true });
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(reportPath), true);
    assert.match(markdown, /YURI Upgreat Meeting Release/);
    assert.match(markdown, /skipped in test mode/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
