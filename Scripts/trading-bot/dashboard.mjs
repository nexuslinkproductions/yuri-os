#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLiveReadiness, getKillSwitchState } from './live-rollout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const OUTPUT_DIR = resolve(PROJECT_ROOT, '.claude/trading-bot/data');
const DASHBOARD_PATH = resolve(PROJECT_ROOT, '.claude/trading-bot/TRADING_BOT_CONTROL_DASHBOARD.md');

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

async function buildDashboard() {
  const readiness = await validateLiveReadiness();
  const predictions = readJsonl(resolve(OUTPUT_DIR, 'prediction_result.jsonl'));
  const outcomes = readJsonl(resolve(OUTPUT_DIR, 'trade_outcome.jsonl'));
  const approvals = readJsonl(resolve(PROJECT_ROOT, 'logs/manual_approval_log.jsonl'));
  return {
    generated_at: new Date().toISOString(),
    kill_switch: getKillSwitchState(),
    readiness,
    counts: {
      predictions: predictions.length,
      outcomes: outcomes.length,
      approvals: approvals.length,
    },
  };
}

function renderMarkdown(dashboard) {
  return `# Trading Bot Control Dashboard

Generated: ${dashboard.generated_at}

## Control State
- Kill switch: ${dashboard.kill_switch}
- Mode: ${dashboard.readiness.mode}
- Stage: ${dashboard.readiness.current_stage}
- Capital: $${dashboard.readiness.capital}

## Readiness
- Ready: ${dashboard.readiness.ready ? 'YES' : 'NO'}
- Checks: ${dashboard.readiness.passed}/${dashboard.readiness.total}
- Report: ${dashboard.readiness.report}

## Runtime Logs
- Predictions: ${dashboard.counts.predictions}
- Trade outcomes: ${dashboard.counts.outcomes}
- Approval decisions: ${dashboard.counts.approvals}

## One Path
- Readiness: \`npm run trading-bot:control -- readiness\`
- Kill switch: \`npm run trading-bot:control -- kill-switch status\`
- Approval: \`npm run trading-bot:control -- approve\`
- Audit export: \`npm run trading-bot:control -- audit\`
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'dashboard', dry_run: true, output: DASHBOARD_PATH }, null, 2));
    return;
  }
  const dashboard = await buildDashboard();
  if (!existsSync(dirname(DASHBOARD_PATH))) mkdirSync(dirname(DASHBOARD_PATH), { recursive: true });
  writeFileSync(DASHBOARD_PATH, renderMarkdown(dashboard), 'utf-8');
  console.log(JSON.stringify({ ok: true, dashboard: DASHBOARD_PATH, ...dashboard }, null, 2));
}

main();
