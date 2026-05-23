import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberMeetingPack,
  validateCyberMeetingPack,
  writeCyberMeetingPack,
} from './cyber-meeting-pack.mjs';

test('cyber meeting pack builds executive and technical Upgreat framing', () => {
  const packet = buildCyberMeetingPack();

  assert.equal(packet.schema, 'yuri.upgreat-meeting-packet.v0');
  assert.equal(packet.validation.ok, true, packet.validation.errors.join('\n'));
  assert.ok(packet.executiveVersion.length >= 4);
  assert.ok(packet.technicalVersion.length >= 4);
  assert.equal(packet.liveDemoOrder.length, 7);
  assert.ok(packet.liveDemoOrder.every((step) => /fixture proof only/i.test(step.boundary)));
  assert.ok(packet.liveDemoOrder.every((step) => step.executableTest === '_SYSTEM/Scripts/cyber-lab-runner.test.mjs'));
});

test('cyber meeting pack preserves hard boundaries and pilot scope', () => {
  const packet = buildCyberMeetingPack();

  assert.match(packet.objective, /bounded Upgreat pilot/);
  assert.ok(packet.questionsForUpgreat.length >= 5);
  assert.ok(packet.hardBoundaries.some((boundary) => /No production penetration test claim/u.test(boundary)));
  assert.ok(packet.pilotScope.outOfScope.some((boundary) => /Unscoped external scanning/u.test(boundary)));
  assert.ok(packet.pilotScope.deliverables.some((deliverable) => /Executive risk summary/u.test(deliverable)));
});

test('cyber meeting pack validation rejects missing demos and overclaims', () => {
  const packet = buildCyberMeetingPack();
  const invalid = structuredClone(packet);
  invalid.liveDemoOrder = invalid.liveDemoOrder.slice(0, 3);
  invalid.executiveVersion[0] = 'YURI is a mature SOC replacement.';
  invalid.pilotScope.deliverables = [];

  const validation = validateCyberMeetingPack(invalid);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /at least 5 live demo steps/);
  assert.match(validation.errors.join('\n'), /missing pilot deliverables/);
  assert.match(validation.errors.join('\n'), /forbidden platform maturity claim/);
});

test('cyber meeting pack writes markdown artifact', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-meeting-pack-'));
  try {
    const reportPath = path.join(dir, 'meeting.md');
    const result = writeCyberMeetingPack({ reportPath });
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(reportPath), true);
    assert.match(markdown, /YURI Upgreat Meeting Packet/);
    assert.match(markdown, /Live Demo Order/);
    assert.match(markdown, /Questions For Upgreat/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
