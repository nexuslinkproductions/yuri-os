#!/usr/bin/env node
// adapter-mock.mjs — MOCK-only subject adapter.
//
// Atlas defects addressed (2026-07-29):
//   - system_prompt_sha256 / case_prompt_sha256 are two SEPARATE byte-exact
//     fields. trial.prompt_sha256 hashes the assembled SYSTEM bytes;
//     trial.case_sha256 hashes the case prompt bytes.
//   - observed-identity sha is computed from stable fields only:
//     (adapter_path, adapter_sha256, executable_path, requested, observed).
//     process_id is NOT included (stochastic PID must not masquerade as
//     identity drift).
//   - runMockControlPreflight scores ctrl.positive/negative DIRECTLY with
//     the frozen scoreCase; ZERO child spawns (subject process never
//     starts until preflight passes).
//   - Per-attempt records: process_id, started_at_utc, ended_at_utc,
//     latency_ms, exit_status, transport_error, response_sha256,
//     observed_identity_sha256, is_retry.
//   - Transport retry: max 2 attempts; non-transport error receives NO
//     retry and scores as failure.
//   - Errors retained in trial denominator (never dropped).
//
// This file contains NO real-provider constants. The real subject
// binding is held in the binding file; the real adapter is held until
// owner ratification.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));

function sha(s) {
  const buf = typeof s === 'string' ? Buffer.from(s, 'utf8')
    : Buffer.isBuffer(s) ? s
    : Buffer.from(String(s), 'utf8');
  return createHash('sha256').update(buf).digest('hex');
}
const sha256 = sha;

function computeAdapterSha256() {
  return sha(readFileSync(pathResolve(here, 'adapter-mock.mjs')));
}

// REQUESTED identity: the settings the runner REQUESTED, per the frozen
// runtime_identity_contract.requested_fields. Settings not sent/supported use
// null plus an explicit support flag (unsupported_rule) — never invented
// deterministic values. No real provider constant appears here.
export function getMockRequestedIdentity() {
  return {
    provider: 'mock-adapter',
    model: 'MOCK',
    argv: [],
    seed_requested: null,
    seed_supported: false,
    temperature: null,
    max_output_tokens: null,
    timeout_ms: 30000,
  };
}

// OBSERVED identity: what the MOCK runtime ACTUALLY was, per the frozen
// runtime_identity_contract.observed_fields (provider, model, model_version,
// runtime_version, os_version, usage). adapter_sha256 + executable_path are
// carried for the subject-identity fingerprint. Observed values identify the
// MOCK runtime (observed_identity_rule) — never a real provider/model.
export function getMockObservedIdentity(adapterSha256, executablePath) {
  return {
    provider: 'mock-adapter',
    model: 'MOCK',
    model_version: null,
    runtime_version: process.versions.node,
    os_version: process.platform + ' ' + ((process.release && process.release.name) || 'node'),
    usage: null,
    adapter_sha256: adapterSha256,
    executable_path: executablePath,
  };
}

// Subject identity fingerprint: stable adapter + executable + requested
// + observed identity fields only. PID is NOT included (must not
// masquerade as identity drift across retries).
export function computeSubjectIdentitySha256({ adapterPath, adapterSha256, executablePath, requested, observed }) {
  const norm = (o) => Object.keys(o).sort().reduce((acc, k) => { acc[k] = o[k]; return acc; }, {});
  return sha(JSON.stringify({
    adapter_path: adapterPath,
    adapter_sha256: adapterSha256,
    executable_path: executablePath,
    requested: norm(requested),
    observed: norm(observed),
  }));
}

// Static scoring for control preflight and any place where we want a
// deterministic pass/fail WITHOUT spawning a subject process.
// Strictly synchronous on the rubric's scoreCase; does not allocate a
// child process.
export function scoreMockResponse({ kase, response }) {
  // Local import to avoid a hard circular dep risk between adapter
  // and rubric: rubric is independent of adapter; adapter invokes
  // rubric for static scoring.
  const rubric = require('./rubric.mjs');
  return rubric.scoreCase(kase, response);
}

// runMockTrial: spawns a fresh child process per attempt. Each attempt
// record includes process_id, observed_identity_sha256, transport_error,
// response_sha256. Transport-failure-only retry, max 2 attempts.
//
// Inputs are byte-exact:
//   - systemPromptBytes : Buffer (assembled system prompt, the persona)
//   - casePromptBytes   : Buffer (case prompt — what would normally be
//                         the user message)
//   - expectedSubjectIdentitySha256 : stable identity hash that must
//     match the attempt's observed identity (excludes PID so a retry
//     against the same environment is stable; real drift means a
//     mismatch and aborts the trial).
//
// Per-attempt evidence shape:
//   { process_id, started_at_utc, ended_at_utc, latency_ms,
//     exit_status, transport_error, response_sha256,
//     observed_identity_sha256, is_retry }
//
// Trial aggregate:
//   - exit_status = 0 iff success exists; otherwise last attempt's status
//   - transport_error = non-null only on the LAST attempt (no retry
//     possible after that)
//   - used_attempts = attempts.length (1 or 2)
//   - success = !!success
//   - identity_drift = true if any attempt's observed_identity_sha256
//     did not match expectedSubjectIdentitySha256
export async function runMockTrial({
  systemPromptBytes,
  casePromptBytes,
  caseId,
  armId,
  trialIndex,
  runId,
  expectedSubjectIdentitySha256,
  kase,
  kaseSha256,
  executablePath,
  maxAttempts = 2,
  transportFailureInjectProb = 0,
  timeoutMs = 30000,
}) {
  if (!Buffer.isBuffer(systemPromptBytes)) throw new TypeError('systemPromptBytes must be a Buffer');
  if (!Buffer.isBuffer(casePromptBytes)) throw new TypeError('casePromptBytes must be a Buffer');
  if (systemPromptBytes.length === 0) throw new Error('systemPromptBytes must be non-empty (MOCK refusal of empty system prompt)');

  const adapterPath = pathResolve(here, 'adapter-mock.mjs');
  const adapterSha = computeAdapterSha256();
  const execPath = executablePath || process.execPath;

  const requested = getMockRequestedIdentity();
  const observed = getMockObservedIdentity(adapterSha, execPath);
  const subjectIdentitySha = computeSubjectIdentitySha256({
    adapterPath, adapterSha256: adapterSha, executablePath: execPath, requested, observed,
  });

  const attempts = [];
  let success = null;
  let lastError = null;
  let identityDrift = false;

  for (let i = 0; i < maxAttempts; i++) {
    const attempt = await runOneAttempt({
      attemptIdx: i, adapterPath, systemPromptBytes, casePromptBytes,
      caseId, armId, trialIndex, runId, kase, kaseSha256,
      observableSubjectIdentitySha: subjectIdentitySha,
      expectedSubjectIdentitySha256,
      requested, executablePath: execPath,
      transportFailureInjectProb, timeoutMs,
    });
    attempts.push(attempt);
    if (attempt.observed_identity_sha256 !== expectedSubjectIdentitySha256) {
      identityDrift = true;
      break; // non-transport failure -> no retry
    }
    if (attempt.exit_status === 0 && !attempt.transport_error) { success = attempt; break; }
    if (!attempt.transport_error) break; // non-transport error -> no retry
    lastError = attempt; // transport_failure -> retry possible
  }

  const finalExit = success ? 0 : (lastError ? lastError.exit_status : 1);
  const finalTransport = success ? null : (lastError ? lastError.transport_error : null);
  return {
    exit_status: finalExit,
    transport_error: finalTransport,
    used_attempts: attempts.length,
    attempts,
    success: !!success,
    identity_drift: identityDrift,
  };
}

async function runOneAttempt({
  attemptIdx, adapterPath, systemPromptBytes, casePromptBytes,
  caseId, armId, trialIndex, runId, kase, kaseSha256,
  observableSubjectIdentitySha, expectedSubjectIdentitySha256,
  requested, executablePath,
  transportFailureInjectProb, timeoutMs,
}) {
  const isRetry = attemptIdx > 0;
  // AXIS 6 (Atlas#6) — the child receives the ACTUAL assembled system bytes
  // and case bytes (base64, lossless), re-hashes them, and asserts receipt
  // against the DECLARED shas. It never trusts a bare sha value.
  const declaredSystemSha = sha(systemPromptBytes);
  const declaredCaseSha = sha(casePromptBytes);
  let sentSystemB64 = systemPromptBytes.toString('base64');
  // Test-only receipt-corruption injection: flip one SENT byte while leaving
  // the DECLARED sha unchanged — the child must catch the mismatch (proves it
  // validates bytes, not the sha alone).
  if (process.env.YURI_MOCK_CORRUPT_PAYLOAD && attemptIdx === 0) {
    const corrupt = Buffer.from(systemPromptBytes);
    if (corrupt.length > 0) corrupt[0] = corrupt[0] ^ 0xff;
    sentSystemB64 = corrupt.toString('base64');
  }
  const responseObj = {
    // AXIS 6 — actual bytes (lossless) plus the declared shas to assert on.
    systemB64: sentSystemB64,
    caseB64: casePromptBytes.toString('base64'),
    declaredSystemSha,
    declaredCaseSha,
    kaseSha256: kaseSha256 || null,
    // AXIS 5 — identity INPUTS (not a precomputed echo). The child reads the
    // adapter itself and captures its own runtime to compute identity.
    header: {
      caseId, armId, trialIndex, runId, attemptIdx,
      adapterPath, executablePath: executablePath || process.execPath, requested,
      expectedSubjectIdentitySha256, transportFailureInjectProb,
    },
  };
  const payload = Buffer.from(JSON.stringify(responseObj));
  const childScript = buildMockChildScript();

  const startedAt = new Date();
  const child = spawn(process.execPath, ['-e', childScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, YURI_MOCK_PAYLOAD: payload.toString('base64'), YURI_MOCK_KASE: JSON.stringify(kase || {}), NODE_NO_WARNINGS: '1' },
  });
  const childPid = child.pid || 0;
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  child.stdout.on('data', (d) => { stdout = Buffer.concat([stdout, d]); });
  child.stderr.on('data', (d) => { stderr = Buffer.concat([stderr, d]); });

  return await new Promise((resolve) => {
    const finish = (code, signal) => {
      const endedAt = new Date();
      const latency = endedAt.getTime() - startedAt.getTime();
      let exitStatus = (typeof code === 'number') ? code : 1;
      let transportError = null;
      let responseSha = null;
      let observedIdentitySha = observableSubjectIdentitySha;
      let childReport = null;
      const text = stdout.toString('utf8');
      const i = text.lastIndexOf('{');
      if (i >= 0) {
        try { childReport = JSON.parse(text.slice(i)); } catch {}
      }
      if (childReport) {
        if (typeof childReport.exit_status === 'number') exitStatus = childReport.exit_status;
        if (childReport.transport_error) transportError = childReport.transport_error;
        if (childReport.response_sha256) responseSha = childReport.response_sha256;
        if (childReport.observed_identity_sha256) observedIdentitySha = childReport.observed_identity_sha256;
      } else if (stderr.toString('utf8').includes('MOCK_INJECTED_TRANSPORT_FAILURE')) {
        transportError = 'MOCK_INJECTED_TRANSPORT_FAILURE';
        exitStatus = 2;
      }
      // If the request encoded a transport-failure injection AND this is
      // the first attempt, treat the run as a transport failure with no
      // error stderr.
      if (!transportError && attemptIdx === 0 && transportFailureInjectProb > 0 && Math.random() < transportFailureInjectProb) {
        transportError = 'MOCK_INJECTED_TRANSPORT_FAILURE';
        exitStatus = 2;
      }
      resolve({
        attempt_index: attemptIdx,
        process_id: childPid,
        started_at_utc: startedAt.toISOString(),
        ended_at_utc: endedAt.toISOString(),
        latency_ms: latency,
        exit_status: exitStatus,
        transport_error: transportError,
        response_sha256: responseSha,
        observed_identity_sha256: observedIdentitySha,
        is_retry: isRetry,
      });
    };
    child.on('close', finish);
    child.on('error', (err) => finish(null, String(err)));
    child.stdin.end();
  });
}

// MOCK child: stateless, deterministic. Reads payload via env, scores the
// case via rubric.scoreCase, returns a JSON report. transport_failure
// is injected ONLY when the JSON header sets transportFailureInjectProb
// > 0 AND attemptIdx == 0 (first attempt only). On real (non-mock)
// runs this code is unreachable; here we are inside MOCK only.
function buildMockChildScript() {
  return `
const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
function sha(s) {
  const buf = typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'utf8');
  return createHash('sha256').update(buf).digest('hex');
}
function scoreCase(k, r) {
  if (!k || !k.gt || !k.gt.checks) return { passed: false, reason: 'no_gt' };
  const text = (r || '').toLowerCase();
  for (const c of k.gt.checks) {
    if (!c || !c.type) continue;
    if (c.type === 'must_not') {
      for (const it of (c.items || [])) {
        if (text.includes(String(it).toLowerCase())) return { passed: false, reason: 'must_not_hit:' + it };
      }
    }
  }
  return { passed: true };
}
const { readFileSync } = require('node:fs');
const payloadB64 = process.env.YURI_MOCK_PAYLOAD || '';
const kaseJson = process.env.YURI_MOCK_KASE || '{}';
if (!payloadB64) { console.log(JSON.stringify({ exit_status: 1, transport_error: 'no_payload' })); process.exit(1); }
const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
const kase = JSON.parse(kaseJson);
const H = payload.header;
if (H.attemptIdx === 0 && H.transportFailureInjectProb > 0 && Math.random() < H.transportFailureInjectProb) {
  console.error('MOCK_INJECTED_TRANSPORT_FAILURE');
  process.exit(2);
}
// AXIS 6 — receive ACTUAL bytes, re-hash, assert receipt against declared shas.
const sysBytes = Buffer.from(payload.systemB64 || '', 'base64');
const caseBytes = Buffer.from(payload.caseB64 || '', 'base64');
const recvSystemSha = sha(sysBytes);
const recvCaseSha = sha(caseBytes);
if (recvSystemSha !== payload.declaredSystemSha || recvCaseSha !== payload.declaredCaseSha) {
  console.log(JSON.stringify({ exit_status: 1, transport_error: 'payload_receipt_mismatch', received_system_sha256: recvSystemSha, received_case_sha256: recvCaseSha }));
  process.exit(1);
}
// AXIS 5 — INDEPENDENT identity capture: the child reads the adapter itself
// and captures its own runtime; it does NOT echo a parent-supplied sha.
const norm = (o) => Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {});
let ownAdapterSha = null;
try { ownAdapterSha = sha(readFileSync(H.adapterPath)); } catch (e) {
  console.log(JSON.stringify({ exit_status: 1, transport_error: 'adapter_unreadable_in_child' }));
  process.exit(1);
}
const ownExec = process.execPath;
const observedObj = {
  provider: 'mock-adapter',
  model: process.env.YURI_MOCK_IDENTITY_DRIFT ? 'DRIFTED' : 'MOCK',
  model_version: null,
  runtime_version: process.versions.node,
  os_version: process.platform + ' ' + ((process.release && process.release.name) || 'node'),
  usage: null,
  adapter_sha256: ownAdapterSha,
  executable_path: ownExec,
};
const observed = sha(JSON.stringify({
  adapter_path: H.adapterPath,
  adapter_sha256: ownAdapterSha,
  executable_path: ownExec,
  requested: norm(H.requested || {}),
  observed: norm(observedObj),
}));
// Deterministic MOCK response: satisfies the must_not checks in scoreCase.
const responseText = 'A direct answer with no forbidden markers. The response is concise and avoids the listed tokens.';
const score = scoreCase(kase, responseText);
const report = {
  exit_status: score.passed ? 0 : 1,
  transport_error: null,
  response_sha256: sha(responseText),
  observed_identity_sha256: observed,
  received_system_sha256: recvSystemSha,
  received_case_sha256: recvCaseSha,
};
console.log(JSON.stringify(report));
`;
}

export { sha, sha256, computeAdapterSha256 };
