#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateLiveReadiness } from './live-rollout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(PROJECT_ROOT, '.claude/trading-bot/data');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function appendJsonl(name, record) {
  ensureDataDir();
  appendFileSync(resolve(DATA_DIR, name), JSON.stringify(record) + '\n', 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'e2e-local-pass', dry_run: true, output_dir: DATA_DIR }, null, 2));
    return;
  }

  const now = new Date().toISOString();
  const tradeId = `local-${randomUUID()}`;
  const market = 'BTC-USD';

  appendJsonl('evidence_packet.jsonl', {
    market_id: market,
    timestamp: now,
    source_count: 0,
    quality_score: 0.2,
    sentiment_score: 0,
    consensus_summary: 'No API keys present; local stub evidence.',
    local_e2e: true,
  });

  appendJsonl('prediction_result.jsonl', {
    market_id: market,
    skipped: true,
    skip_reason: 'local no-key ensemble fallback',
    p_model: 0.5,
    confidence: 0,
    dispersion: 0,
    model_probs: {},
    timestamp: now,
    local_e2e: true,
  });

  appendJsonl('risk_decision.jsonl', {
    trade_id: tradeId,
    market_id: market,
    decision: 'REJECT',
    gates_passed: ['DATA_FRESHNESS', 'KILL_SWITCH'],
    gates_failed: [{ gate: 'CONFIDENCE', reason: 'local fallback confidence is zero' }],
    timestamp: now,
    local_e2e: true,
  });

  appendJsonl('trade_outcome.jsonl', {
    outcome_id: randomUUID(),
    trade_id: tradeId,
    market_id: market,
    trade_status: 'BREAKEVEN',
    prediction: { p_model: 0.5, confidence: 0, dispersion: 0, direction: 'FLAT' },
    pnl: { gross_pnl_usd: 0, net_pnl_usd: 0, net_pnl_pct: 0, fees_paid_usd: 0, pnl_classification: 'ZERO' },
    resolution: { actual_outcome: 0.5, resolution_method: 'LOCAL_STUB', resolved_at: now },
    brier_score_contribution: 0,
    failure_classification: {},
    verified_at: now,
    verifier: 'LOCAL_E2E',
    local_e2e: true,
  });

  const readiness = await validateLiveReadiness();
  const audit = spawnSync(process.execPath, [resolve(__dirname, 'audit-export.mjs')], { encoding: 'utf-8' });
  if (audit.status !== 0) {
    throw new Error(`audit export failed: ${audit.stderr || audit.stdout}`);
  }

  console.log(JSON.stringify({
    ok: true,
    trade_id: tradeId,
    no_api_keys_required: true,
    readiness: { ready: readiness.ready, passed: readiness.passed, total: readiness.total },
    audit: JSON.parse(audit.stdout),
  }, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
