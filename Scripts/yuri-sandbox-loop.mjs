#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONTRACT_PATH = path.join(SCRIPT_DIR, 'offload-contract.mjs');
const RUNNER_PATH = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs');
const LEARNING_CLI = path.join(SCRIPT_DIR, 'yuri-learning-capture.mjs');
const DEFAULT_ARTIFACT_ROOT = path.join(os.homedir(), '.nudimmud', 'sandbox-runs');
const FALLBACK_ARTIFACT_ROOT = '/tmp/nudimmud-sandbox-runs';
const DEFAULT_PROMPT = 'first Yuri sandbox operational proving run';
const PROTECTED_MARKERS = [
  '.env',
  '.claude/state',
  '.claude/history',
  'backend/data',
  'node_modules',
  'token',
  'credential',
  'secret',
];

const cli = parseArgs(process.argv.slice(2));

if (cli.help) {
  printHelp();
  process.exit(0);
}

if (cli.selftest) {
  const ok = runSelftest();
  process.exit(ok ? 0 : 1);
}

const outcome = runLoop({
  mode: cli.dryRun ? 'dry-run' : 'live',
  prompt: cli.prompt || DEFAULT_PROMPT,
  artifactRoot: cli.artifactRoot,
  dbPath: cli.dbPath,
  mock: cli.mock || process.env.YURI_SANDBOX_MOCK_CODEX === '1',
  forceProbeFailure: cli.forceProbeFailure,
});

process.stdout.write(`${outcome.finalReportPath}\n`);
process.exit(outcome.ok ? 0 : 1);

function parseArgs(argv) {
  const out = {
    dryRun: false,
    live: false,
    selftest: false,
    help: false,
    prompt: '',
    artifactRoot: '',
    dbPath: '',
    mock: false,
    forceProbeFailure: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--live') out.live = true;
    else if (arg === '--selftest') out.selftest = true;
    else if (arg === '--mock') out.mock = true;
    else if (arg === '--force-probe-failure') out.forceProbeFailure = true;
    else if (arg === '--prompt') out.prompt = requireValue(argv, ++index, '--prompt');
    else if (arg === '--artifact-root') out.artifactRoot = requireValue(argv, ++index, '--artifact-root');
    else if (arg === '--db') out.dbPath = requireValue(argv, ++index, '--db');
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!out.dryRun && !out.live && !out.selftest) {
    out.live = true;
  }
  if (out.dryRun && out.live) {
    throw new Error('Choose one mode: --dry-run or --live');
  }
  return out;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  process.stdout.write([
    'Yuri Sandbox Loop',
    '',
    'Usage:',
    '  node Scripts/yuri-sandbox-loop.mjs --dry-run --prompt "<task>"',
    '  node Scripts/yuri-sandbox-loop.mjs --live --prompt "<task>"',
    '  node Scripts/yuri-sandbox-loop.mjs --selftest',
    '',
    'Test-only flags:',
    '  --mock',
    '  --force-probe-failure',
  ].join('\n') + '\n');
}

function runLoop({ mode, prompt, artifactRoot, dbPath, mock = false, forceProbeFailure = false }) {
  const startedAt = new Date().toISOString();
  const runId = `sandbox-${timestampId()}-${crypto.randomBytes(3).toString('hex')}`;
  const rootInfo = ensureArtifactRoot(artifactRoot);
  const runDir = path.join(rootInfo.path, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const artifacts = artifactPaths(runDir);
  const commandsRun = [];
  const failures = [];
  const statusBefore = gitStatus();

  writeJson(artifacts.run, {
    runId,
    mode,
    prompt,
    startedAt,
    repoRoot: REPO_ROOT,
    artifactRoot: rootInfo.path,
    artifactRootExplicit: rootInfo.explicit,
    mock,
  });

  const routePlan = runJsonCommand(process.execPath, [CONTRACT_PATH, 'route-plan', prompt], { commandsRun, label: 'route-plan' });
  writeJson(artifacts.routePlan, routePlan.ok ? routePlan.json : { error: routePlan.error });

  const preflight = buildPreflight({ statusBefore, commandsRun });
  writeJson(artifacts.preflight, preflight);
  if (preflight.protectedDirty.length > 0) {
    failures.push(`Protected paths dirty before run: ${preflight.protectedDirty.join(', ')}`);
  }

  const probe = runSelfProbe({ runDir, mode, mock, forceProbeFailure, statusBefore, commandsRun });
  writeJson(artifacts.sandboxProbe, probe);
  if (!probe.ok) failures.push(`Sandbox probe failed: ${probe.failures.join('; ')}`);

  let rawOutput = '';
  let runnerSummary = null;
  if (failures.length === 0) {
    const run = runSandboxTask({ mode, prompt, runDir, mock, commandsRun });
    rawOutput = run.rawOutput;
    runnerSummary = run.summary;
    writeText(artifacts.rawOutput, rawOutput);
    if (!run.ok) failures.push(run.failure);
  } else {
    rawOutput = 'Sandbox task skipped because preflight or probe failed.\n';
    writeText(artifacts.rawOutput, rawOutput);
  }

  const statusAfter = gitStatus();
  const verification = verifyRun({
    mode,
    routePlan: routePlan.json,
    probe,
    runnerSummary,
    rawOutput,
    statusBefore,
    statusAfter,
    artifacts,
    failures,
  });
  writeJson(artifacts.verification, verification);

  const learningSummary = buildLearningSummary({
    mode,
    prompt,
    routePlan: routePlan.json,
    probe,
    verification,
    rawOutput,
    runDir,
  });
  writeJson(artifacts.learningSummary, learningSummary);

  let learningCapture = { skipped: true, reason: 'dry-run mode or failed verification' };
  if (mode === 'live' && verification.ok) {
    learningCapture = captureLearning({ learningSummary, dbPath, commandsRun });
  }

  const promoteCheck = readLearningSummary({ dbPath, commandsRun });
  const finalReport = buildFinalReport({
    runId,
    mode,
    prompt,
    startedAt,
    finishedAt: new Date().toISOString(),
    routePlan: routePlan.json,
    preflight,
    probe,
    verification,
    learningSummary,
    learningCapture,
    promoteCheck,
    commandsRun,
    artifacts,
  });
  writeText(artifacts.liveActionReport, finalReport);
  writeText(artifacts.finalReport, finalReport);

  return {
    ok: verification.ok,
    runDir,
    finalReportPath: artifacts.finalReport,
  };
}

function buildPreflight({ statusBefore, commandsRun }) {
  const branch = runTextCommand('git', ['branch', '--show-current'], { commandsRun, label: 'git-branch' });
  const head = runTextCommand('git', ['rev-parse', '--short', 'HEAD'], { commandsRun, label: 'git-head' });
  return {
    cwd: REPO_ROOT,
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    statusBefore,
    protectedDirty: protectedStatusLines(statusBefore),
    codexAvailable: commandAvailable('codex'),
    nodeAvailable: commandAvailable('node'),
    runnerPath: RUNNER_PATH,
    contractPath: CONTRACT_PATH,
  };
}

function runSelfProbe({ runDir, mode, mock, forceProbeFailure, statusBefore, commandsRun }) {
  const probeDir = path.join(runDir, 'probe');
  fs.mkdirSync(probeDir, { recursive: true });
  const failures = [];
  const result = {
    ok: true,
    mode,
    mock,
    codexAvailable: commandAvailable('codex'),
    runnerDryRunExitCode: null,
    dryRunArtifactExists: false,
    repoStatusUnchanged: false,
    protectedDirtyAfterProbe: [],
    failures,
  };

  if (forceProbeFailure) failures.push('forced probe failure');
  if (mode === 'live' && !mock && !result.codexAvailable) {
    failures.push('codex command unavailable');
  }

  const dryRun = spawnSync(process.execPath, [
    RUNNER_PATH,
    '--dry-run',
    '--artifact-dir',
    probeDir,
    'Yuri sandbox self-probe. Do not inspect files.',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  commandsRun.push('codex-runner-dry-run-probe');
  result.runnerDryRunExitCode = dryRun.status;
  result.dryRunArtifactExists = fs.existsSync(path.join(probeDir, 'dry-run.json'));
  if (dryRun.status !== 0) failures.push(`runner dry-run exited ${dryRun.status}`);
  if (!result.dryRunArtifactExists) failures.push('runner dry-run artifact missing');

  const statusAfterProbe = gitStatus();
  result.repoStatusUnchanged = statusBefore === statusAfterProbe;
  result.protectedDirtyAfterProbe = protectedStatusLines(statusAfterProbe);
  if (!result.repoStatusUnchanged) failures.push('repo status changed during self-probe');
  if (result.protectedDirtyAfterProbe.length > 0) failures.push(`protected paths dirty after probe: ${result.protectedDirtyAfterProbe.join(', ')}`);

  result.ok = failures.length === 0;
  return result;
}

function runSandboxTask({ mode, prompt, runDir, mock, commandsRun }) {
  const runnerDir = path.join(runDir, 'runner');
  fs.mkdirSync(runnerDir, { recursive: true });
  const wrappedPrompt = [
    'Yuri sandbox operational trial.',
    'Constraints: read-only inspection, no writes, no network, no secrets, no protected paths.',
    'Return concise findings with exact local evidence markers when available.',
    `Task: ${prompt}`,
  ].join('\n');

  if (mode === 'dry-run') {
    const preview = spawnSync(process.execPath, [RUNNER_PATH, '--dry-run', '--artifact-dir', runnerDir, wrappedPrompt], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    commandsRun.push('codex-runner-dry-run');
    return {
      ok: preview.status === 0,
      rawOutput: fs.existsSync(path.join(runnerDir, 'dry-run.json'))
        ? fs.readFileSync(path.join(runnerDir, 'dry-run.json'), 'utf8')
        : preview.stderr || preview.stdout || '',
      summary: { status: preview.status === 0 ? 'DRY_RUN_OK' : 'DRY_RUN_FAILED', artifactDir: runnerDir },
      failure: `dry-run runner exited ${preview.status}`,
    };
  }

  if (mock) {
    commandsRun.push('mock-codex-sandbox-run');
    const rawOutput = [
      'MOCK_YURI_SANDBOX_OK',
      'result_label: PASS',
      'local_truth_summary: route and artifact controller exercised with mock runner',
      'model_claims_downgraded: raw mock output remains sandbox artifact only',
      'next_gate: run real Codex Spark when credentials and capacity are available',
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(runnerDir, 'run.json'), JSON.stringify({ status: 'MOCK_OK', artifactDir: runnerDir }, null, 2));
    return {
      ok: true,
      rawOutput,
      summary: { status: 'MOCK_OK', artifactDir: runnerDir },
      failure: '',
    };
  }

  const run = spawnSync(process.execPath, [RUNNER_PATH, '--artifact-dir', runnerDir, '--timeout-ms', '180000', wrappedPrompt], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  commandsRun.push('codex-runner-live');
  const runJson = readJsonIfExists(path.join(runnerDir, 'run.json'));
  const stderr = run.stderr || '';
  const stdout = run.stdout || '';
  const degraded = runJson?.status === 'SKIPPED_OR_RATE_LIMITED';
  return {
    ok: run.status === 0 && !degraded,
    rawOutput: stdout || readTextIfExists(path.join(runnerDir, 'last-message.txt')) || stderr,
    summary: runJson || { status: run.status === 0 ? 'OK' : 'FAILED', artifactDir: runnerDir, stderr: stderr.slice(0, 1000) },
    failure: degraded ? 'Codex runner degraded or unavailable' : `live runner exited ${run.status}`,
  };
}

function verifyRun({ mode, routePlan, probe, runnerSummary, rawOutput, statusBefore, statusAfter, artifacts, failures }) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  add('route-plan-present', Boolean(routePlan?.scenario), routePlan?.scenario || 'missing');
  add('sandbox-scenario', routePlan?.scenario === 'sandbox-improvement', routePlan?.scenario || 'missing');
  add('codex-spark-lane', routePlan?.lane === 'codex-spark', routePlan?.lane || 'missing');
  add('self-probe-pass', probe.ok, probe.failures.join('; '));
  add('raw-output-artifact', fs.existsSync(artifacts.rawOutput), artifacts.rawOutput);
  add('verification-artifact-path', Boolean(artifacts.verification), artifacts.verification);
  add('repo-status-unchanged', statusBefore === statusAfter, 'compares full git status before/after');
  add('protected-clean-after', protectedStatusLines(statusAfter).length === 0, protectedStatusLines(statusAfter).join(', '));
  add('runner-not-degraded', mode === 'dry-run' || runnerSummary?.status === 'OK' || runnerSummary?.status === 'MOCK_OK', runnerSummary?.status || 'missing');
  add('raw-output-present', String(rawOutput || '').trim().length > 0, `${String(rawOutput || '').length} chars`);

  const failedChecks = checks.filter((check) => !check.pass).map((check) => `${check.name}: ${check.detail}`);
  return {
    ok: failures.length === 0 && failedChecks.length === 0,
    checks,
    failures: [...failures, ...failedChecks],
    statusAfter,
  };
}

function buildLearningSummary({ mode, prompt, routePlan, probe, verification, rawOutput, runDir }) {
  const rawHash = crypto.createHash('sha256').update(rawOutput || '').digest('hex');
  return {
    advisory_only: true,
    local_truth_claim: false,
    mode,
    prompt,
    scenario: routePlan?.scenario || 'unknown',
    lane: routePlan?.lane || 'unknown',
    status: verification.ok ? 'stable' : 'mixed',
    raw_output_sha256: rawHash,
    raw_output_chars: String(rawOutput || '').length,
    raw_output_artifact: path.join(runDir, 'raw-output.md'),
    what_happened: verification.ok
      ? 'Yuri sandbox loop completed detect, isolate, self-probe, run, verify, sanitize, and report phases.'
      : `Yuri sandbox loop failed closed: ${verification.failures.join('; ')}`,
    what_got_better: verification.ok
      ? 'Sandbox output stayed artifact-only while verified summary entered the learning capture path.'
      : 'Sandbox loop produced failure evidence without promoting raw output.',
    what_got_worse: verification.ok ? null : verification.failures.slice(0, 3).join('; '),
    evidence: {
      self_probe_ok: probe.ok,
      verification_ok: verification.ok,
      failed_checks: verification.failures,
    },
  };
}

function captureLearning({ learningSummary, dbPath, commandsRun }) {
  const sessionId = `sandbox-${timestampId()}`;
  const startPayload = {
    sessionId,
    command: learningSummary.prompt,
    commandType: 'sandbox-improvement',
    topicTags: ['sandbox', 'yuri', 'improvement-loop'],
    goal: 'Capture verified sandbox loop outcome without storing raw model output.',
    metadata: {
      rawOutputSha256: learningSummary.raw_output_sha256,
      rawOutputChars: learningSummary.raw_output_chars,
      rawOutputArtifact: learningSummary.raw_output_artifact,
      advisoryOnly: true,
      localTruthClaim: false,
    },
  };
  const finalizePayload = {
    sessionId,
    outcome: learningSummary.status,
    autoScore: learningSummary.status === 'stable' ? 82 : 45,
    whatHappened: learningSummary.what_happened,
    whatGotBetter: learningSummary.what_got_better,
    whatGotWorse: learningSummary.what_got_worse || undefined,
    notes: `Verified sandbox summary only. Raw output hash ${learningSummary.raw_output_sha256}.`,
    metadata: startPayload.metadata,
  };

  const env = dbPath ? { ...process.env, NUDIMMUD_DB_PATH: dbPath } : process.env;
  const start = runJsonCommand(process.execPath, [LEARNING_CLI, 'start', '--json', JSON.stringify(startPayload)], {
    commandsRun,
    label: 'learning-start',
    env,
  });
  const finalize = runJsonCommand(process.execPath, [LEARNING_CLI, 'finalize', '--json', JSON.stringify(finalizePayload)], {
    commandsRun,
    label: 'learning-finalize',
    env,
  });

  return {
    skipped: false,
    sessionId,
    start: start.json || { ok: false, error: start.error },
    finalize: finalize.json || { ok: false, error: finalize.error },
  };
}

function readLearningSummary({ dbPath, commandsRun }) {
  const env = dbPath ? { ...process.env, NUDIMMUD_DB_PATH: dbPath } : process.env;
  const summary = runJsonCommand(process.execPath, [LEARNING_CLI, 'summary', '--limit', '5'], {
    commandsRun,
    label: 'learning-summary',
    env,
  });
  return summary.json || { ok: false, error: summary.error };
}

function buildFinalReport({ runId, mode, prompt, startedAt, finishedAt, routePlan, preflight, probe, verification, learningSummary, learningCapture, promoteCheck, commandsRun, artifacts }) {
  const result = verification.ok ? 'PASS' : 'FAIL_CLOSED';
  return [
    `# Yuri Sandbox Operational Trial`,
    '',
    `result_label: ${result}`,
    `run_id: ${runId}`,
    `mode: ${mode}`,
    `prompt: ${prompt}`,
    `started_at: ${startedAt}`,
    `finished_at: ${finishedAt}`,
    '',
    '## Research Basis',
    '- Codex read-only ephemeral sandbox for v1.',
    '- AgentBound-style least privilege: explicit filesystem/network/env boundaries.',
    '- SWE-agent ACI principle: compact feedback and guardrails.',
    '- Memory-poisoning defense: raw output is tainted and excluded from canonical memory.',
    '',
    '## Route',
    `scenario: ${routePlan?.scenario || 'unknown'}`,
    `lane: ${routePlan?.lane || 'unknown'}`,
    `lifecycle: ${(routePlan?.lifecycle || []).join(' -> ')}`,
    '',
    '## Preflight',
    `branch: ${preflight.branch}`,
    `head: ${preflight.head}`,
    `codex_available: ${preflight.codexAvailable}`,
    `protected_dirty_before: ${preflight.protectedDirty.length === 0 ? '[]' : preflight.protectedDirty.join(' | ')}`,
    '',
    '## Sandbox Probe',
    `probe_ok: ${probe.ok}`,
    `runner_dry_run_exit: ${probe.runnerDryRunExitCode}`,
    `dry_run_artifact_exists: ${probe.dryRunArtifactExists}`,
    `repo_status_unchanged: ${probe.repoStatusUnchanged}`,
    `probe_failures: ${probe.failures.length === 0 ? '[]' : probe.failures.join(' | ')}`,
    '',
    '## Verification',
    `verification_ok: ${verification.ok}`,
    ...verification.checks.map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`),
    '',
    '## Learning Capture',
    `learning_capture_skipped: ${Boolean(learningCapture.skipped)}`,
    `learning_session_id: ${learningCapture.sessionId || ''}`,
    `raw_output_sha256: ${learningSummary.raw_output_sha256}`,
    `raw_output_artifact_only: true`,
    `promote_check_pending_lessons: ${Array.isArray(promoteCheck.pendingLessonCandidates) ? promoteCheck.pendingLessonCandidates.length : 'unknown'}`,
    '',
    '## Commands Run',
    ...unique(commandsRun).map((command) => `- ${command}`),
    '',
    '## Artifacts',
    ...Object.entries(artifacts).map(([name, filePath]) => `- ${name}: ${filePath}`),
    '',
    '## Next Improvements',
    '- Add Docker or microVM copied-worktree mutation sandbox only after readonly loop proves stable.',
    '- Add network policy logging when a container sandbox is introduced.',
    '- Add report diff export for candidate patches without applying them.',
    '',
  ].join('\n');
}

function runSelftest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-sandbox-loop-test-'));
  const dbPath = path.join(tempRoot, 'learning.db');
  const markers = [];
  try {
    const dry = runLoop({
      mode: 'dry-run',
      prompt: 'sandbox selftest dry run',
      artifactRoot: tempRoot,
      dbPath,
      mock: true,
    });
    if (dry.ok && fs.existsSync(path.join(dry.runDir, 'final-report.md'))) markers.push('DRY_RUN_PASS');

    const live = runLoop({
      mode: 'live',
      prompt: 'sandbox selftest mock live run',
      artifactRoot: tempRoot,
      dbPath,
      mock: true,
    });
    if (live.ok && fs.existsSync(path.join(live.runDir, 'learning-summary.json'))) markers.push('MOCK_LIVE_PASS');

    const raw = fs.readFileSync(path.join(live.runDir, 'raw-output.md'), 'utf8');
    const report = fs.readFileSync(path.join(live.runDir, 'final-report.md'), 'utf8');
    if (raw.includes('MOCK_YURI_SANDBOX_OK') && report.includes('raw_output_artifact_only: true')) {
      markers.push('RAW_ARTIFACT_ONLY_PASS');
    }

    const failed = runLoop({
      mode: 'live',
      prompt: 'sandbox selftest forced probe failure',
      artifactRoot: tempRoot,
      dbPath,
      mock: true,
      forceProbeFailure: true,
    });
    if (!failed.ok) markers.push('PROBE_FAIL_CLOSED_PASS');

    const statusBefore = gitStatus();
    const statusAfter = gitStatus();
    if (statusBefore === statusAfter) markers.push('NO_REPO_MUTATION_PASS');

    if (markers.includes('DRY_RUN_PASS') &&
      markers.includes('MOCK_LIVE_PASS') &&
      markers.includes('RAW_ARTIFACT_ONLY_PASS') &&
      markers.includes('PROBE_FAIL_CLOSED_PASS') &&
      markers.includes('NO_REPO_MUTATION_PASS')) {
      markers.push('YURI_SANDBOX_LOOP_SELFTEST_PASS');
    }

    for (const marker of markers) process.stdout.write(`${marker}\n`);
    return markers.includes('YURI_SANDBOX_LOOP_SELFTEST_PASS');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function ensureArtifactRoot(explicitRoot) {
  const roots = explicitRoot
    ? [path.resolve(explicitRoot)]
    : [DEFAULT_ARTIFACT_ROOT, FALLBACK_ARTIFACT_ROOT];
  for (const root of roots) {
    try {
      fs.mkdirSync(root, { recursive: true });
      fs.accessSync(root, fs.constants.W_OK);
      return { path: root, explicit: Boolean(explicitRoot) };
    } catch {
      if (explicitRoot) throw new Error(`Artifact root unavailable: ${root}`);
    }
  }
  throw new Error('Artifact root unavailable');
}

function artifactPaths(runDir) {
  return {
    run: path.join(runDir, 'run.json'),
    routePlan: path.join(runDir, 'route-plan.json'),
    preflight: path.join(runDir, 'preflight.json'),
    sandboxProbe: path.join(runDir, 'sandbox-probe.json'),
    rawOutput: path.join(runDir, 'raw-output.md'),
    verification: path.join(runDir, 'verification.json'),
    learningSummary: path.join(runDir, 'learning-summary.json'),
    liveActionReport: path.join(runDir, 'live-action-report.md'),
    finalReport: path.join(runDir, 'final-report.md'),
  };
}

function gitStatus() {
  const result = spawnSync('git', ['status', '--short'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : `GIT_STATUS_FAILED:${result.stderr}`;
}

function protectedStatusLines(statusText) {
  return statusText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => PROTECTED_MARKERS.some((marker) => line.toLowerCase().includes(marker.toLowerCase())));
}

function commandAvailable(command) {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return result.status === 0;
}

function runTextCommand(command, args, { commandsRun, label, env = process.env }) {
  commandsRun.push(label || [command, ...args].join(' '));
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8', env });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function runJsonCommand(command, args, { commandsRun, label, env = process.env }) {
  const result = runTextCommand(command, args, { commandsRun, label, env });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || `exit ${result.status}` };
  try {
    return { ok: true, json: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: error.message, stdout: result.stdout };
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value);
}

function timestampId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function unique(values) {
  return [...new Set(values)];
}
