#!/usr/bin/env node
/**
 * YURI Cyber Browser Replay v0.
 *
 * Promotes the browser-agent fake portal from static fixture proof into an
 * optional browser-harness replay. The replay remains local, read-only, and
 * file:// only; it never submits forms or touches external targets.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCyberLabs } from './cyber-lab-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_FIXTURE_PATH = path.join(REPO_ROOT, '_SYSTEM/labs/cyber/fixtures/browser-agent-fake-portal.html');
export const DEFAULT_REPLAY_JSON_PATH = path.join(REPO_ROOT, '_SYSTEM/data/cyber-intel/browser-replay-proof.json');
export const DEFAULT_REPLAY_REPORT_PATH = path.join(REPO_ROOT, '_SYSTEM/reports/YURI_BROWSER_REPLAY_PROOF_2026-05-24.md');
export const BROWSER_REPLAY_CLAIM = 'Local browser-harness DOM replay proof only; not production browser-agent proof.';

export function buildCyberBrowserReplay(options = {}) {
  const fixturePath = path.resolve(options.fixturePath || DEFAULT_FIXTURE_PATH);
  const labRuns = options.labRuns || runCyberLabs(options);
  const browserLab = labRuns.find((run) => run.lab_id === 'browser-agent-fake-portal');
  const replay = options.replay || buildReplayPlan(fixturePath);
  const validation = validateCyberBrowserReplay({ fixturePath, replay, browserLab });

  return {
    schema: 'yuri.cyber-browser-replay.v0',
    generatedAt: new Date().toISOString(),
    fixture: path.relative(REPO_ROOT, fixturePath),
    fileUrl: pathToFileURL(fixturePath).href,
    browserLab: summarizeBrowserLab(browserLab),
    replay,
    validation,
    boundaries: [
      'repo-local-file-url-only',
      'dom-cdp-read-only',
      'no screenshots required',
      'no form submission',
      'no external target activity',
    ],
    claim: BROWSER_REPLAY_CLAIM,
  };
}

export function runBrowserHarnessReplay(options = {}) {
  const fixturePath = path.resolve(options.fixturePath || DEFAULT_FIXTURE_PATH);
  const runner = path.resolve(options.runnerPath || path.join(REPO_ROOT, '_SYSTEM/Scripts/browser-harness-runner.sh'));
  const script = buildBrowserHarnessScript(fixturePath);
  const result = spawnSync(runner, [], {
    cwd: REPO_ROOT,
    input: script,
    encoding: 'utf8',
    timeout: Number(options.timeoutMs || 60_000),
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`browser replay failed: ${detail}`);
  }
  return parseBrowserHarnessReplayOutput(result.stdout);
}

export function validateCyberBrowserReplay(model) {
  const errors = [];
  const fixturePath = path.resolve(model.fixturePath || DEFAULT_FIXTURE_PATH);
  const replay = model.replay || {};
  if (!fixturePath.startsWith(REPO_ROOT)) errors.push('fixture path is outside repo');
  if (!String(replay.url || '').startsWith('file://')) errors.push('replay URL is not file://');
  if (!String(replay.url || '').includes('/_SYSTEM/labs/cyber/fixtures/browser-agent-fake-portal.html')) {
    errors.push('replay URL is not the owned browser fixture');
  }
  if (replay.external_targets_allowed !== false) errors.push('external targets are not explicitly denied');
  if (replay.read_only !== true) errors.push('replay is not read-only');
  if ((replay.forms || []).some((form) => form.submitted === true)) errors.push('replay submitted a form');
  if (!/Hostile DOM instruction fixture/u.test(replay.text || '')) errors.push('hostile DOM fixture text missing');
  if (!/local-only/u.test(replay.text || '')) errors.push('local-only fixture marker missing');
  if (model.browserLab?.state !== 'proven') errors.push('browser lab fixture proof is not proven');
  if (!/replay proof only/i.test(model.claim || BROWSER_REPLAY_CLAIM)) errors.push('browser replay claim overstates proof');
  return {
    ok: errors.length === 0,
    errors,
  };
}

export function writeCyberBrowserReplay(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_REPLAY_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_REPLAY_REPORT_PATH);
  const replay = options.runHarness
    ? runBrowserHarnessReplay(options)
    : undefined;
  const proof = buildCyberBrowserReplay({ ...options, replay });
  if (!proof.validation.ok) {
    throw new Error(`Cyber browser replay validation failed: ${proof.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(proof, null, 2)}\n`);
  writeFileSync(reportPath, renderCyberBrowserReplayMarkdown(proof));
  return { ok: true, jsonPath, reportPath, proof };
}

export function renderCyberBrowserReplayMarkdown(proof = buildCyberBrowserReplay()) {
  const forms = (proof.replay.forms || [])
    .map((form) => `- action=${form.action || 'none'} method=${form.method || 'get'} inputs=${form.inputs.map((input) => input.name || input.type).join(', ')}`)
    .join('\n') || '- none';
  return [
    '# YURI Browser Replay Proof',
    '',
    `Generated: ${proof.generatedAt}`,
    '',
    '## Purpose',
    '',
    'This report records the local browser-harness replay surface for the owned browser-agent fake portal fixture. It is read-only DOM/CDP proof, not a production browser-agent claim.',
    '',
    '## Replay',
    '',
    `- URL: ${proof.replay.url}`,
    `- Title: ${proof.replay.title}`,
    `- Read only: ${proof.replay.read_only}`,
    `- External targets allowed: ${proof.replay.external_targets_allowed}`,
    `- Browser lab state: ${proof.browserLab.state}`,
    `- Claim: ${proof.claim}`,
    '',
    'Forms:',
    forms,
    '',
    '## Boundaries',
    '',
    proof.boundaries.map((boundary) => `- ${boundary}`).join('\n'),
    '',
  ].join('\n');
}

function buildReplayPlan(fixturePath) {
  return {
    mode: 'planned-or-recorded-local-dom-replay',
    url: pathToFileURL(fixturePath).href,
    title: 'YURI Owned Browser-Agent Fixture',
    text: 'Owned Synthetic SaaS Portal local-only Hostile DOM instruction fixture.',
    forms: [{
      action: '#',
      method: 'post',
      submitted: false,
      inputs: [{ name: 'api_token', type: 'input' }],
    }],
    read_only: true,
    external_targets_allowed: false,
    screenshot_required: false,
  };
}

function summarizeBrowserLab(browserLab) {
  return {
    lab_id: browserLab?.lab_id || 'browser-agent-fake-portal',
    state: browserLab?.state || 'missing-result',
    passedCases: (browserLab?.results || []).filter((result) => result.ok === true).length,
    totalCases: (browserLab?.results || []).length,
    executableTest: browserLab?.executableTest || null,
  };
}

function buildBrowserHarnessScript(fixturePath) {
  const fixtureLiteral = JSON.stringify(path.relative(REPO_ROOT, fixturePath));
  return [
    'from pathlib import Path',
    'import json',
    `url = Path(${fixtureLiteral}).resolve().as_uri()`,
    'new_tab(url)',
    'wait_for_load()',
    'payload = js("""',
    '(() => {',
    '  const forms = Array.from(document.forms).map((form) => ({',
    "    action: form.getAttribute('action'),",
    "    method: form.getAttribute('method'),",
    '    submitted: false,',
    "    inputs: Array.from(form.querySelectorAll('input,textarea,select')).map((el) => ({",
    "      name: el.getAttribute('name'),",
    "      type: el.getAttribute('type') || el.tagName.toLowerCase()",
    '    }))',
    '  }));',
    '  return JSON.stringify({',
    '    url: location.href,',
    '    title: document.title,',
    '    text: document.body.innerText.slice(0, 1000),',
    '    forms,',
    '    read_only: true,',
    '    external_targets_allowed: false,',
    '    screenshot_required: false',
    '  });',
    '})()',
    '""")',
    'print(payload)',
    '',
  ].join('\n');
}

function parseBrowserHarnessReplayOutput(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/u).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith('{'));
  if (!jsonLine) throw new Error('browser replay output did not include JSON payload');
  const payload = JSON.parse(jsonLine);
  payload.title = String(payload.title || '').replace(/[^\x20-\x7E]/gu, '').trim();
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const runHarness = args.includes('--run');
  if (args.includes('--write')) {
    const result = writeCyberBrowserReplay({ runHarness });
    process.stdout.write(`cyber_browser_replay_json=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`cyber_browser_replay_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    const replay = runHarness ? runBrowserHarnessReplay() : undefined;
    process.stdout.write(`${JSON.stringify(buildCyberBrowserReplay({ replay }), null, 2)}\n`);
  }
}
