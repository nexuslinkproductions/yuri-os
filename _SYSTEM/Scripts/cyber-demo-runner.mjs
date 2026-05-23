#!/usr/bin/env node
/**
 * YURI Upgreat Demo Runner v0.
 *
 * Executes the local cyber fixture proofs in the meeting-packet order and
 * emits a compact transcript. This remains local, synthetic, and read-only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCyberMeetingPack } from './cyber-meeting-pack.mjs';
import { runCyberLabs } from './cyber-lab-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_DEMO_TRANSCRIPT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_UPGREAT_DEMO_TRANSCRIPT_2026-05-23.md',
);

export function buildCyberDemoTranscript(options = {}) {
  const meetingPack = options.meetingPack || buildCyberMeetingPack(options);
  const labResults = options.labResults || runCyberLabs(options);
  const resultByLab = new Map(labResults.map((result) => [result.lab_id, result]));
  const steps = meetingPack.liveDemoOrder.map((demoStep) => {
    const labId = demoStep.id.replace(/^proof-card-/u, '');
    const result = resultByLab.get(labId);
    return {
      order: demoStep.order,
      lab_id: labId,
      title: demoStep.title,
      claim: demoStep.claim,
      evidence: demoStep.evidence,
      executable_test: demoStep.executableTest,
      state: result?.state || 'missing-result',
      passed_cases: (result?.results || []).filter((entry) => entry.ok).length,
      total_cases: (result?.results || []).length,
      case_results: (result?.results || []).map((entry) => ({
        id: entry.case_id,
        ok: entry.ok,
        reason: entry.reason,
      })),
      boundary: result?.claim || 'No local proof claim allowed.',
    };
  });
  const transcript = {
    schema: 'yuri.upgreat-demo-transcript.v0',
    generatedAt: new Date().toISOString(),
    objective: 'Reproduce the local fixture proof sequence for an Upgreat-style pilot conversation.',
    steps,
    validation: validateCyberDemoTranscript({ steps }),
    hardBoundary: 'local synthetic fixture proof only; no external target activity.',
  };
  return transcript;
}

export function validateCyberDemoTranscript(transcript) {
  const errors = [];
  const steps = transcript.steps || [];
  if (steps.length < 5) errors.push(`expected at least 5 demo steps, found ${steps.length}`);
  for (const step of steps) {
    if (step.state !== 'proven') errors.push(`${step.lab_id} not proven: ${step.state}`);
    if (!step.executable_test) errors.push(`${step.lab_id} missing executable test`);
    if (!step.evidence) errors.push(`${step.lab_id} missing evidence fixture`);
    if (step.passed_cases !== step.total_cases || step.total_cases <= 0) {
      errors.push(`${step.lab_id} has failing or missing cases`);
    }
    if (!/fixture proof only/i.test(step.boundary || '')) {
      errors.push(`${step.lab_id} boundary must remain fixture-scoped`);
    }
  }
  if (containsForbiddenClaim(transcript)) errors.push('transcript contains forbidden platform maturity claim');
  return { ok: errors.length === 0, errors };
}

export function renderCyberDemoTranscriptMarkdown(transcript = buildCyberDemoTranscript()) {
  return [
    '# YURI Upgreat Demo Transcript',
    '',
    `Generated: ${transcript.generatedAt}`,
    '',
    '## Objective',
    '',
    transcript.objective,
    '',
    '## Boundary',
    '',
    transcript.hardBoundary,
    '',
    '## Demo Steps',
    '',
    transcript.steps.map(renderStep).join('\n\n'),
    '',
  ].join('\n');
}

export function writeCyberDemoTranscript(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_DEMO_TRANSCRIPT_PATH);
  const transcript = buildCyberDemoTranscript(options);
  if (!transcript.validation.ok) {
    throw new Error(`Cyber demo transcript validation failed: ${transcript.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderCyberDemoTranscriptMarkdown(transcript));
  return { ok: true, reportPath, transcript };
}

function renderStep(step) {
  const cases = step.case_results
    .map((entry) => `- ${entry.id}: ${entry.ok ? 'pass' : 'fail'} - ${entry.reason}`)
    .join('\n');
  return [
    `### ${step.order}. ${step.title}`,
    '',
    `State: ${step.state}`,
    `Claim: ${step.claim}`,
    `Evidence: ${step.evidence}`,
    `Executable test: ${step.executable_test}`,
    `Cases: ${step.passed_cases}/${step.total_cases}`,
    `Boundary: ${step.boundary}`,
    '',
    'Case results:',
    cases || '- none',
  ].join('\n');
}

function containsForbiddenClaim(transcript) {
  return /\b(?:is|are|becomes|provides|replaces)\s+(?:a\s+)?mature\s+(?:SOC|SIEM|XDR|MDR)\b|autonomous pentest capability|external target exploitation|malware operation/iu.test(JSON.stringify(transcript));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--write')) {
    const result = writeCyberDemoTranscript();
    process.stdout.write(`cyber_demo_transcript=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(buildCyberDemoTranscript(), null, 2)}\n`);
  } else {
    process.stdout.write(renderCyberDemoTranscriptMarkdown());
  }
}
