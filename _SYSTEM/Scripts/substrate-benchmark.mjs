#!/usr/bin/env node
/**
 * substrate-benchmark.mjs — measure P50/P95/pass-rate per substrate across canonical leaf types.
 *
 * Design (MURE_ENFORCEMENT_MINIMUM Part D):
 *   5 canonical leaves × 4 substrates = 20 measurements
 *   Record: durationMs, ok, resultLabel, textLen, costTier
 *   Output: _SYSTEM/reports/SUBSTRATE_BENCHMARK_YYYY-MM-DD.json + markdown table
 *   Decision rule: migrate workload class only when ≥2× pass rate or ≥50% latency reduction
 *
 * DISARMED by default (--dry-run shows plan). Armed with YURI_BENCHMARK_ARMED=1.
 *
 * Usage:
 *   node substrate-benchmark.mjs --dry-run
 *   node substrate-benchmark.mjs --substrate glm-max-headless --leaf census
 *   YURI_BENCHMARK_ARMED=1 node substrate-benchmark.mjs --substrate glm-max-headless
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const REPORTS_DIR = join(REPO_ROOT, '_SYSTEM', 'reports');

const CANONICAL_LEAVES = [
  {
    id: 'census',
    prompt: 'List all .mjs files in _SYSTEM/Scripts/ that contain the word "fleet" in their filename. Return the count. End with RESULT_LABEL: BENCH_CENSUS_X_PASS_COMMITTED',
    costTier: 'cheap',
    expectsTools: false,
  },
  {
    id: 'code-edit',
    prompt: 'Write a one-line comment to /tmp/bench-code-edit-test.js: "// benchmark test". Confirm written. End with RESULT_LABEL: BENCH_CODE_EDIT_X_PASS_COMMITTED',
    costTier: 'mid',
    expectsTools: true,
  },
  {
    id: 'adversarial',
    prompt: 'Review this claim adversarially: "Node.js is always faster than Python." List 3 counterexamples. End with RESULT_LABEL: BENCH_ADVERSARIAL_X_PASS_COMMITTED',
    costTier: 'mid',
    expectsTools: false,
  },
  {
    id: 'multi-tool',
    prompt: 'Search for the export keyword in _SYSTEM/Scripts/fleet-router-mlp.mjs and report how many functions are exported. End with RESULT_LABEL: BENCH_MULTI_TOOL_X_PASS_COMMITTED',
    costTier: 'premium',
    expectsTools: true,
  },
  {
    id: 'label-only',
    prompt: 'Reply with exactly one line: RESULT_LABEL: BENCH_LABEL_ONLY_X_PASS_COMMITTED',
    costTier: 'cheap',
    expectsTools: false,
  },
];

const SUBSTRATES = [
  {
    id: 'glm-max-headless',
    script: 'lane-dispatch.mjs',
    args: (leaf) => ['glm-max', leaf.prompt, '--out', '/tmp/bench-glm-max-headless.out', '--reasoning', 'high'],
    env: { YURI_GLM_FLEET: '1' },
    armedEnv: 'YURI_GLM_FLEET',
  },
  {
    id: 'zai-tmux-hybrid',
    script: 'zai-tmux-fleet.mjs',
    args: (leaf) => ['--tasks', JSON.stringify([{ label: leaf.id, model: 'glm-5.2', prompt: leaf.prompt, tmuxClaudeZai: true }])],
    env: { YURI_ZAI_TMUX_FLEET: '1' },
    armedEnv: 'YURI_ZAI_TMUX_FLEET',
  },
  {
    id: 'ollama-flash',
    script: 'ollama-fleet.mjs',
    args: (leaf) => ['--tasks', JSON.stringify([{ label: leaf.id, tier: 'flash', prompt: leaf.prompt }])],
    env: { YURI_OLLAMA_FLEET: '1' },
    armedEnv: 'YURI_OLLAMA_FLEET',
  },
  {
    id: 'cline',
    script: 'cline-fleet.mjs',
    args: (leaf) => ['--tasks', JSON.stringify([{ label: leaf.id, tier: 'glm', prompt: leaf.prompt }])],
    env: { YURI_CLINE_FLEET: '1' },
    armedEnv: 'YURI_CLINE_FLEET',
  },
];

function parseArgs(argv) {
  const substrateIdx = argv.indexOf('--substrate');
  const leafIdx = argv.indexOf('--leaf');
  return {
    dryRun: argv.includes('--dry-run') || process.env.YURI_BENCHMARK_ARMED !== '1',
    substrate: substrateIdx >= 0 ? argv[substrateIdx + 1] : null,
    leaf: leafIdx >= 0 ? argv[leafIdx + 1] : null,
  };
}

function extractResultLabel(text) {
  const m = String(text || '').match(/RESULT_LABEL[:\s]+([A-Z0-9_]+)/i);
  return m ? m[1] : '';
}

async function runOne(substrate, leaf) {
  const scriptPath = join(HERE, substrate.script);
  if (!existsSync(scriptPath)) {
    return { substrate: substrate.id, leaf: leaf.id, ok: false, error: `script not found: ${substrate.script}`, durationMs: 0, resultLabel: '', textLen: 0, costTier: leaf.costTier };
  }
  const args = substrate.args(leaf);
  const env = { ...process.env, ...substrate.env };
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const timeoutMs = 300000;
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const resultLabel = extractResultLabel(stdout);
      const ok = code === 0 && resultLabel.length > 0;
      resolve({
        substrate: substrate.id,
        leaf: leaf.id,
        ok,
        exitCode: code,
        durationMs,
        resultLabel,
        textLen: stdout.length,
        costTier: leaf.costTier,
        stderr: stderr.length > 200 ? stderr.slice(0, 200) : stderr,
      });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ substrate: substrate.id, leaf: leaf.id, ok: false, error: String(e?.message || e), durationMs: Date.now() - start, resultLabel: '', textLen: 0, costTier: leaf.costTier });
    });
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarize(results) {
  const bySubstrate = {};
  for (const r of results) {
    if (!bySubstrate[r.substrate]) bySubstrate[r.substrate] = [];
    bySubstrate[r.substrate].push(r);
  }
  const summary = {};
  for (const [sub, rs] of Object.entries(bySubstrate)) {
    const durations = rs.map((r) => r.durationMs).sort((a, b) => a - b);
    const passCount = rs.filter((r) => r.ok).length;
    summary[sub] = {
      total: rs.length,
      pass: passCount,
      passRate: passCount / rs.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      meanDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    };
  }
  return summary;
}

function markdownTable(summary) {
  const rows = ['| Substrate | Total | Pass | Pass Rate | P50 (ms) | P95 (ms) | Mean (ms) |', '|-----------|-------|------|-----------|----------|----------|-----------|'];
  for (const [sub, s] of Object.entries(summary)) {
    rows.push(`| ${sub} | ${s.total} | ${s.pass} | ${(s.passRate * 100).toFixed(0)}% | ${s.p50 ?? '-'} | ${s.p95 ?? '-'} | ${Math.round(s.meanDurationMs)} |`);
  }
  return rows.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const substrates = opts.substrate ? SUBSTRATES.filter((s) => s.id === opts.substrate) : SUBSTRATES;
  const leaves = opts.leaf ? CANONICAL_LEAVES.filter((l) => l.id === opts.leaf) : CANONICAL_LEAVES;

  if (opts.dryRun) {
    const plan = substrates.flatMap((s) => leaves.map((l) => ({ substrate: s.id, leaf: l.id, costTier: l.costTier, expectsTools: l.expectsTools, armedEnv: s.armedEnv })));
    console.log(JSON.stringify({ dryRun: true, armed: false, plan, totalRuns: plan.length, armedInstruction: 'Set YURI_BENCHMARK_ARMED=1 + substrate arm env to run live' }, null, 2));
    return;
  }

  const results = [];
  for (const substrate of substrates) {
    for (const leaf of leaves) {
      process.stderr.write(`benchmark: ${substrate.id} / ${leaf.id} ...\n`);
      const result = await runOne(substrate, leaf);
      results.push(result);
      process.stderr.write(`  → ok=${result.ok} ${result.durationMs}ms label=${result.resultLabel || '(none)'}\n`);
    }
  }

  const summary = summarize(results);
  const date = new Date().toISOString().slice(0, 10);
  const report = {
    date,
    totalRuns: results.length,
    results,
    summary,
    markdownTable: markdownTable(summary),
    decisionRule: 'Migrate workload class only when ≥2× pass rate or ≥50% latency reduction vs current default',
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = join(REPORTS_DIR, `SUBSTRATE_BENCHMARK_${date}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.stderr.write(`\nReport written: ${reportPath}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
