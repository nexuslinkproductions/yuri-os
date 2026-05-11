#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const SNAPSHOT_LOG = resolve(OUTPUT_DIR, 'market_snapshot.jsonl');
const DEFAULT_MARKETS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
}

function parseMarkets(args) {
  const idx = args.indexOf('--markets');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].split(',').map(s => s.trim()).filter(Boolean);
  const marketIdx = args.indexOf('--market');
  if (marketIdx !== -1 && args[marketIdx + 1]) return [args[marketIdx + 1]];
  return DEFAULT_MARKETS;
}

function buildSnapshot(marketId) {
  const base = marketId.startsWith('BTC') ? 42500 : marketId.startsWith('ETH') ? 2750 : 145;
  const spreadBps = 5 + Math.random() * 10;
  return {
    market_id: marketId,
    price: Number((base * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)),
    spread_bps: Number(spreadBps.toFixed(1)),
    volume_24h_usd: Math.round(750000 + Math.random() * 2500000),
    market_type: 'financial',
    scanner: 'phase-2',
    timestamp: new Date().toISOString(),
  };
}

function writeSnapshots(markets) {
  ensureOutputDir();
  const snapshots = markets.map(buildSnapshot);
  for (const snapshot of snapshots) {
    appendFileSync(SNAPSHOT_LOG, JSON.stringify(snapshot) + '\n', 'utf-8');
  }
  return snapshots;
}

function printUsage() {
  console.log(`
Phase 2 Market Scanner

Usage:
  node market-scanner.mjs --dry-run
  node market-scanner.mjs [--market BTC-USD]
  node market-scanner.mjs [--markets BTC-USD,ETH-USD]

Output:
  .claude/trading-bot/data/market_snapshot.jsonl
`);
}

function main() {
  const args = process.argv.slice(2);
  const markets = parseMarkets(args);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({
      ok: true,
      command: 'market-scanner',
      dry_run: true,
      markets,
      output: SNAPSHOT_LOG,
    }, null, 2));
    return;
  }

  const snapshots = writeSnapshots(markets);
  console.log(JSON.stringify({ ok: true, written: snapshots.length, output: SNAPSHOT_LOG, snapshots }, null, 2));
}

main();
