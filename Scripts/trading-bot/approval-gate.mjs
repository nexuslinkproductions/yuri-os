#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manualApproveTrade } from './live-rollout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const RISK_LOG = resolve(OUTPUT_DIR, 'risk_decision.jsonl');

function loadLatestRiskDecision() {
  if (!existsSync(RISK_LOG)) return null;
  const lines = readFileSync(RISK_LOG, 'utf-8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

function main() {
  const args = process.argv.slice(2);
  const dryRunRisk = {
    trade_id: 'dry-run-trade',
    market_id: 'BTC-USD',
    decision: 'APPROVE',
    open_positions: 0,
    total_exposure_ratio: 0,
  };

  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({
      ok: true,
      command: 'approval-gate',
      dry_run: true,
      sample_trade_id: dryRunRisk.trade_id,
      risk_log: RISK_LOG,
    }, null, 2));
    return;
  }

  const riskDecision = loadLatestRiskDecision() || dryRunRisk;
  const decision = manualApproveTrade({
    tradeId: riskDecision.trade_id || riskDecision.id || 'manual-trade',
    marketId: riskDecision.market_id || 'UNKNOWN',
    riskDecision,
    operator: args[0] || process.env.USER || 'operator',
    brierScore: Number(process.env.TRADING_BOT_BRIER_SCORE || '0.2'),
    marketConditions: { snapshot_age_ms: 0 },
  });
  console.log(JSON.stringify(decision, null, 2));
}

main();
