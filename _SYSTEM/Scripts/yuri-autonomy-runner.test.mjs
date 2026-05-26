import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  buildAutonomyRunManifest,
  classifyAutonomyLevel,
  emitAutonomyRunEvents,
  detectProtectedPathMentions,
  validateAutonomyRunManifest,
} from './yuri-autonomy-runner.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const RUNNER = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-autonomy-runner.mjs');

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'yuri-autonomy-events-'));
}

test('default plan builds an L1 dry-run manifest with baseline anchor', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Build governed autonomy baseline anchor',
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.schemaVersion, 'yuri.autonomy-run.v0');
  assert.equal(manifest.autonomy.level, 'L1_EVIDENCE_RUNNER');
  assert.equal(manifest.approval.boundary, 'dry-run-only');
  assert.equal(manifest.approval.mutationAllowed, false);
  assert.equal(manifest.baselineAnchor.contextRouter.ok, true);
  assert.ok(manifest.baselineAnchor.sourceHashes.some((entry) => entry.path.endsWith('context-registry.json')));
  assert.equal(validateAutonomyRunManifest(manifest).ok, true);
});

test('research, truth, memory, and math goals classify as L2 without memory mutation', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Research truth promotion and math memory contradiction checks',
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.autonomy.level, 'L2_RESEARCH_LOOP');
  assert.equal(manifest.approval.mutationAllowed, false);
  assert.equal(manifest.gates.sourceFreshness.required, true);
  assert.equal(manifest.gates.contradictionDetection.required, true);
  assert.ok(manifest.gates.required.includes('memory-proposal-only'));
});

test('code autopilot is blocked without explicit operator approval and rollback gate remains required', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Implement scoped code edits for the autonomy runner',
    requestedMode: 'code',
    approvalBoundary: 'scoped-edits',
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.autonomy.level, 'L3_CODE_AUTOPILOT');
  assert.equal(manifest.approval.requestedMutationAllowed, true);
  assert.equal(manifest.approval.mutationAllowed, false);
  assert.equal(manifest.approval.signature.required, true);
  assert.equal(manifest.approval.signature.status, 'operator-signature-required-before-mutation');
  assert.equal(manifest.decision, 'blocked_pending_operator_approval');
  assert.equal(manifest.gates.rollbackContract.required, true);
  assert.equal(validateAutonomyRunManifest(manifest).ok, true);
});

test('operator approval without signature remains blocked for L3 mutation', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Implement scoped code edits for the autonomy runner',
    requestedMode: 'code',
    approvalBoundary: 'scoped-edits',
    operatorApproved: true,
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.decision, 'blocked_pending_operator_signature');
  assert.equal(manifest.approval.mutationAllowed, false);
  assert.equal(manifest.approval.signature.status, 'operator-signature-required-before-mutation');
});

test('operator approval plus signature can produce an approved L3 manifest', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Implement scoped code edits for the autonomy runner',
    requestedMode: 'code',
    approvalBoundary: 'scoped-edits',
    operatorApproved: true,
    operatorSignature: 'Marcel approves scoped autonomy-runner edits on 2026-05-26',
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.decision, 'approved_scoped_run_manifest');
  assert.equal(manifest.approval.mutationAllowed, true);
  assert.equal(manifest.approval.signature.status, 'operator-signature-present');
  assert.equal(validateAutonomyRunManifest(manifest).ok, true);
});

test('research about code patterns stays L2 unless code autopilot is explicit', () => {
  const classified = classifyAutonomyLevel({
    goal: 'Research code patterns for future memory promotion',
  });

  assert.equal(classified.level, 'L2_RESEARCH_LOOP');
});

test('timed run classifies as L4 and keeps approval and handoff gates', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Continue planning for a minimum of 15 minutes with checkpoints',
    approvalBoundary: 'timed-run',
    now: '2026-05-26T10:00:00.000Z',
  });

  assert.equal(manifest.autonomy.level, 'L4_TIMED_RUN');
  assert.equal(manifest.approval.operatorApprovalRequired, true);
  assert.equal(manifest.approval.mutationAllowed, false);
  assert.ok(manifest.gates.required.includes('timebox-contract'));
  assert.ok(manifest.gates.required.includes('pause-resume-handoff'));
});

test('validator rejects dry-run manifests that claim mutation', () => {
  const manifest = buildAutonomyRunManifest({
    goal: 'Build governed autonomy baseline anchor',
    now: '2026-05-26T10:00:00.000Z',
  });
  manifest.approval.mutationAllowed = true;

  const validation = validateAutonomyRunManifest(manifest);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('dry-run-only')));
});

test('CLI emits JSON and does not write events by default', () => {
  const root = tempRoot();
  const result = spawnSync(process.execPath, [
    RUNNER,
    'plan',
    '--goal',
    'governed autonomy evidence runner',
    '--event-root',
    root,
    '--json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.manifest.autonomy.level, 'L1_EVIDENCE_RUNNER');
  assert.equal(parsed.validation.ok, true);
  assert.equal(existsSync(path.join(root, 'events.jsonl')), false);
});

test('CLI warns when unknown approval boundary is downgraded to dry-run-only', () => {
  const result = spawnSync(process.execPath, [
    RUNNER,
    'plan',
    '--goal',
    'governed autonomy evidence runner',
    '--approval-boundary',
    'scopededits',
    '--json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /approval-boundary/);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.manifest.approval.boundary, 'dry-run-only');
});

test('explicit event emission writes Kagami events to safe runtime root', () => {
  const root = tempRoot();
  const manifest = buildAutonomyRunManifest({
    goal: 'Implement code autopilot scaffold',
    requestedMode: 'code',
    approvalBoundary: 'scoped-edits',
    now: '2026-05-26T10:00:00.000Z',
  });

  const events = emitAutonomyRunEvents(manifest, { eventRoot: root });
  assert.ok(events.some((event) => event.kind === 'AUTHORIZATION_REQUIRED'));
  const text = readFileSync(path.join(root, 'events.jsonl'), 'utf8');
  assert.match(text, /INTAKE_RECORDED/);
  assert.match(text, /AUTHORIZATION_REQUIRED/);
});

test('protected path mentions are rejected unless explicitly acknowledged', () => {
  assert.throws(
    () => buildAutonomyRunManifest({
      goal: 'Plan a dry run around .env without reading it',
      now: '2026-05-26T10:00:00.000Z',
    }),
    /protected paths/,
  );

  const manifest = buildAutonomyRunManifest({
    goal: 'Plan a dry run around .env without reading it',
    now: '2026-05-26T10:00:00.000Z',
    allowProtectedMentions: true,
  });
  assert.equal(manifest.protectedPathPolicy.status, 'dry-run-acknowledged-no-protected-access');
  assert.equal(manifest.protectedPathPolicy.protectedPathMentions[0].label, 'env-file');
});

test('environment wording does not falsely trigger env-file protection', () => {
  const mentions = detectProtectedPathMentions('Improve environment config docs without secret access');
  assert.deepEqual(mentions, []);
});

test('Kagami event payload redacts protected path mentions from goals', () => {
  const root = tempRoot();
  const manifest = buildAutonomyRunManifest({
    goal: 'Plan a dry run around .env without reading it',
    now: '2026-05-26T10:00:00.000Z',
    allowProtectedMentions: true,
  });

  emitAutonomyRunEvents(manifest, { eventRoot: root });
  const text = readFileSync(path.join(root, 'events.jsonl'), 'utf8');
  assert.doesNotMatch(text, /\.env/);
  assert.match(text, /\[protected:env-file\]/);
});

test('event emission rejects invalid manifests', () => {
  const root = tempRoot();
  const manifest = buildAutonomyRunManifest({
    goal: 'Implement code autopilot scaffold',
    requestedMode: 'code',
    approvalBoundary: 'scoped-edits',
    now: '2026-05-26T10:00:00.000Z',
  });
  manifest.approval.mutationAllowed = true;

  assert.throws(
    () => emitAutonomyRunEvents(manifest, { eventRoot: root }),
    /invalid autonomy manifest|operator signature/,
  );
});

test('manifest schema requires the L3 signature slot', () => {
  const schemaPath = path.join(REPO_ROOT, '_SYSTEM/config/schemas/yuri.autonomy-run.v0.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.ok(schema.properties.approval.required.includes('signature'));
});

test('CLI refuses protected event roots', () => {
  const result = spawnSync(process.execPath, [
    RUNNER,
    'plan',
    '--goal',
    'implement autonomy scaffold',
    '--emit-events',
    '--event-root',
    '.claude/state/autonomy',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /protected/);
});
