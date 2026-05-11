#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(PROJECT_ROOT, '.claude/trading-bot/data');
const LOG_DIR = resolve(PROJECT_ROOT, 'logs');
const AUDIT_DIR = resolve(PROJECT_ROOT, '.claude/trading-bot/audits');

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readJsonl(path) {
  return readText(path).trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}

function buildAudit() {
  return {
    exported_at: new Date().toISOString(),
    data: {
      market_snapshots: readJsonl(resolve(DATA_DIR, 'market_snapshot.jsonl')).length,
      evidence_packets: readJsonl(resolve(DATA_DIR, 'evidence_packet.jsonl')).length,
      predictions: readJsonl(resolve(DATA_DIR, 'prediction_result.jsonl')).length,
      risks: readJsonl(resolve(DATA_DIR, 'risk_decision.jsonl')).length,
      executions: readJsonl(resolve(DATA_DIR, 'execution_event.jsonl')).length,
      outcomes: readJsonl(resolve(DATA_DIR, 'trade_outcome.jsonl')).length,
    },
    logs: {
      kill_switch: readJsonl(resolve(LOG_DIR, 'kill_switch_audit.jsonl')),
      approvals: readJsonl(resolve(LOG_DIR, 'manual_approval_log.jsonl')),
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({ ok: true, command: 'audit-export', dry_run: true, output_dir: AUDIT_DIR }, null, 2));
    return;
  }
  if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const audit = buildAudit();
  const jsonPath = resolve(AUDIT_DIR, `audit-${stamp}.json`);
  const mdPath = resolve(AUDIT_DIR, `audit-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(audit, null, 2) + '\n', 'utf-8');
  writeFileSync(mdPath, `# Trading Bot Audit Export\n\nGenerated: ${audit.exported_at}\n\n\`\`\`json\n${JSON.stringify(audit.data, null, 2)}\n\`\`\`\n`, 'utf-8');
  console.log(JSON.stringify({ ok: true, json: jsonPath, markdown: mdPath }, null, 2));
}

main();
