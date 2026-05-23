#!/usr/bin/env node

import { createRequire } from 'node:module';
import { resolveTokenLedgerPaths } from './token-ledger.mjs';

const require = createRequire(import.meta.url);
const Database = require('../backend/node_modules/better-sqlite3');

const GOLDENS = Object.freeze({
  summarization: ['summarize-local', 'ollama-local'],
  extraction: ['triage-local', 'ollama-local'],
  retrieval: ['ollama-local', 'triage-local'],
  triage: ['triage-local', 'ollama-local'],
  coding: ['code-local', 'deepseek', 'codex'],
  architecture_review: ['swarm', 'deepseek-v4-pro', 'codex'],
  audit_security: ['swarm', 'deepseek-v4-pro', 'codex'],
  research_latest: ['comet'],
});

function main() {
  const paths = resolveTokenLedgerPaths(parseArgs(process.argv.slice(2)));
  const db = new Database(paths.dbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT lane, provider, operation_type, status, latency_ms, cost_usd, effective_tokens, metadata_json, created_at
      FROM token_ledger
      WHERE created_at >= datetime('now', '-30 days')
      ORDER BY created_at DESC
      LIMIT 2000
    `).all();

    const routeClasses = summarize(rows);
    const recommendations = recommend(routeClasses);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      advisory_only: true,
      live_policy_mutation: false,
      promotion_gates: {
        comparable_traces_per_route_class: 50,
        evaluator_beats_baseline: true,
        no_security_regression: true,
        rollback_path_proven: true,
        sustained_clean_canary_window: true,
      },
      routeClasses,
      recommendations,
    }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

function summarize(rows) {
  const out = {};
  for (const row of rows) {
    const routeClass = classify(row);
    const lane = row.lane || row.provider || 'unknown';
    if (!out[routeClass]) out[routeClass] = { total: 0, lanes: {} };
    if (!out[routeClass].lanes[lane]) {
      out[routeClass].lanes[lane] = { events: 0, ok: 0, errors: 0, cost_usd: 0, effective_tokens: 0, latency_ms: 0 };
    }
    const bucket = out[routeClass].lanes[lane];
    out[routeClass].total += 1;
    bucket.events += 1;
    bucket.ok += row.status === 'ok' ? 1 : 0;
    bucket.errors += row.status === 'ok' ? 0 : 1;
    bucket.cost_usd += Number(row.cost_usd || 0);
    bucket.effective_tokens += Number(row.effective_tokens || 0);
    bucket.latency_ms += Number(row.latency_ms || 0);
  }

  for (const routeClass of Object.keys(out)) {
    for (const lane of Object.keys(out[routeClass].lanes)) {
      const bucket = out[routeClass].lanes[lane];
      bucket.avg_latency_ms = bucket.events ? Math.round(bucket.latency_ms / bucket.events) : 0;
      delete bucket.latency_ms;
    }
  }
  return out;
}

function recommend(routeClasses) {
  const recommendations = [];
  for (const [routeClass, summary] of Object.entries(routeClasses)) {
    const golden = GOLDENS[routeClass] || [];
    const comparable = summary.total >= 50;
    const lanes = Object.keys(summary.lanes);
    const ollamaSeen = lanes.some((lane) => lane.startsWith('ollama'));
    if (!comparable) {
      recommendations.push({ route_class: routeClass, action: 'collect_more_traces', current_traces: summary.total, required_traces: 50 });
      continue;
    }
    if (golden.includes('ollama-local') && !ollamaSeen) {
      recommendations.push({ route_class: routeClass, action: 'canary_ollama_local', reason: 'golden_allows_ollama_but_no_recent_ollama_traces' });
    } else {
      recommendations.push({ route_class: routeClass, action: 'no_live_policy_change', reason: 'advisory_only_canary' });
    }
  }
  return recommendations;
}

function classify(row) {
  const text = `${row.operation_type || ''} ${row.lane || ''} ${row.provider || ''} ${row.metadata_json || ''}`.toLowerCase();
  if (/rag|embedding|retrieval|vector/.test(text)) return 'retrieval';
  if (/summary|summarize|doc_generate/.test(text)) return 'summarization';
  if (/extract/.test(text)) return 'extraction';
  if (/triage/.test(text)) return 'triage';
  if (/code|coding|patch/.test(text)) return 'coding';
  if (/architecture/.test(text)) return 'architecture_review';
  if (/security|audit/.test(text)) return 'audit_security';
  if (/research|browser|comet/.test(text)) return 'research_latest';
  return 'unknown';
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--db' && args[i + 1]) out.dbPath = args[++i];
  }
  return out;
}

main();
