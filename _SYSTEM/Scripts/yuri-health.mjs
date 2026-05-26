#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GITNEXUS_LOCAL = path.join(REPO_ROOT, '_SYSTEM/tools/gitnexus/gitnexus/dist/cli/index.js');
const CHECKS = [
  {
    id: 'build',
    label: 'Root build',
    command: ['npm', ['run', 'build']],
    required: true,
  },
  {
    id: 'memory_governor',
    label: 'Live memory governor',
    command: ['python3', ['_SYSTEM/OS_KERNEL/memory_governor.py', 'health']],
    required: true,
  },
  {
    id: 'skill_registry',
    label: 'Skill registry drift',
    command: ['node', ['_SYSTEM/Scripts/yuri-skill-loader.mjs', '--validate', '--json']],
    required: true,
    evaluate: evaluateSkillRegistry,
  },
  {
    id: 'wiki_rag',
    label: 'Wiki RAG',
    command: ['node', ['_SYSTEM/Scripts/wiki-rag-health.mjs']],
    required: true,
  },
  {
    id: 'ollama',
    label: 'Ollama local-first runtime',
    command: ['node', ['_SYSTEM/Scripts/ollama-kv-config.mjs', 'status']],
    required: true,
  },
  {
    id: 'session_launchd',
    label: 'Yuri session launchd',
    command: ['node', ['_SYSTEM/Scripts/yuri-session-launchd.mjs', 'status']],
    required: true,
  },
  {
    id: 'gitnexus',
    label: 'GitNexus local CLI',
    command: gitnexusCommand(),
    required: true,
  },
];

const mode = process.argv[2] || 'json';

const startedAt = new Date().toISOString();
const results = CHECKS.map(runCheck);
const failedRequired = results.filter((result) => result.required && !result.ok);
const report = {
  schema_version: 1,
  generated_at: startedAt,
  advisory_only: false,
  local_truth_claim: true,
  status: failedRequired.length === 0 ? 'PASS' : 'FAIL',
  failed_required: failedRequired.map((result) => result.id),
  checks: results,
};

if (mode === 'markdown') {
  console.log(renderMarkdown(report));
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.status === 'PASS' ? 0 : 1);

function gitnexusCommand() {
  if (fs.existsSync(GITNEXUS_LOCAL)) {
    return ['node', [GITNEXUS_LOCAL, 'status']];
  }
  return ['npx', ['gitnexus', 'status']];
}

function runCheck(check) {
  const [bin, args] = check.command;
  const started = Date.now();
  const result = spawnSync(bin, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const evaluation = check.evaluate ? check.evaluate(stdout, stderr, result.status ?? 1) : null;
  const ok = evaluation ? evaluation.ok : result.status === 0;
  return {
    id: check.id,
    label: check.label,
    required: check.required,
    ok,
    exit_code: result.status ?? 1,
    duration_ms: Date.now() - started,
    command: [bin, ...args].join(' '),
    summary: evaluation?.summary || summarize(stdout, stderr),
  };
}

function evaluateSkillRegistry(stdout, stderr, status) {
  if (status !== 0) return { ok: false, summary: summarize(stdout, stderr) };
  try {
    const parsed = JSON.parse(stdout);
    const summary = parsed.summary || {};
    const drift = Number(summary.drift ?? 0);
    const missing = Number(summary.missing ?? 0);
    const unregistered = Number(summary.unregistered ?? 0);
    return {
      ok: drift === 0 && missing === 0 && unregistered === 0,
      summary: `ok=${summary.ok ?? 'unknown'} drift=${drift} missing=${missing} unregistered=${unregistered}`,
    };
  } catch {
    return { ok: false, summary: 'skill validation returned non-JSON output' };
  }
}

function summarize(stdout, stderr) {
  const text = `${stdout}\n${stderr}`.trim();
  if (!text) return 'no output';
  return text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5).join(' | ');
}

function renderMarkdown(input) {
  const lines = [
    `# Yuri Health: ${input.status}`,
    '',
    `Generated: ${input.generated_at}`,
    '',
    '| Check | Status | Summary |',
    '| --- | --- | --- |',
  ];
  for (const check of input.checks) {
    lines.push(`| ${check.id} | ${check.ok ? 'PASS' : 'FAIL'} | ${escapePipe(check.summary)} |`);
  }
  return lines.join('\n');
}

function escapePipe(value) {
  return String(value).replaceAll('|', '\\|');
}
