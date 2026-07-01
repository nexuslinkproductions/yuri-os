#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { createRequire } from 'node:module';
import { resolveTokenLedgerPaths } from './token-ledger.mjs';

const require = createRequire(import.meta.url);
const Database = require('../backend/node_modules/better-sqlite3');

export const ROUTE_CLASS_GOLDENS = Object.freeze({
  summarization: ['summarize-local', 'ollama-local'],
  extraction: ['triage-local', 'ollama-local'],
  retrieval: ['ollama-local', 'triage-local'],
  triage: ['triage-local', 'ollama-local'],
  coding: ['code-local', 'deepseek', 'codex'],
  architecture_review: ['native', 'deepseek-v4-pro', 'codex'],
  audit_security: ['native', 'deepseek-v4-pro', 'codex'],
  research_latest: ['native'],
});

export const PROMOTION_GATE_DEFAULTS = Object.freeze({
  comparable_traces_per_route_class: 50,
  clean_canary_window_days: 7,
});

export function main(argv = process.argv.slice(2)) {
  const paths = resolveTokenLedgerPaths(parseArgs(argv));
  const db = new Database(paths.dbPath, { readonly: true });
  try {
    const rows = db.prepare(`
      SELECT lane, provider, operation_type, status, latency_ms, cost_usd, effective_tokens, metadata_json, created_at
      FROM token_ledger
      WHERE created_at >= datetime('now', '-30 days')
      ORDER BY created_at DESC
      LIMIT 5000
    `).all();
    const recentRows = db.prepare(`
      SELECT lane, provider, operation_type, status, latency_ms, cost_usd, effective_tokens, metadata_json, created_at
      FROM token_ledger
      WHERE created_at >= datetime('now', '-7 days')
      ORDER BY created_at DESC
      LIMIT 5000
    `).all();

    const routeClasses = summarizeRouteClasses(rows);
    const recentRouteClasses = summarizeRouteClasses(recentRows);
    const readiness = evaluatePromotionReadiness(routeClasses, recentRouteClasses);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      advisory_only: true,
      live_policy_mutation: false,
      gate_definition: PROMOTION_GATE_DEFAULTS,
      routeClasses: readiness,
    }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

export function summarizeRouteClasses(rows) {
  const out = {};
  for (const row of rows) {
    const routeClass = classify(row);
    const lane = row.lane || row.provider || 'unknown';
    const metadata = parseMetadata(row.metadata_json);
    const dateKey = String(row.created_at || '').slice(0, 10);
    if (!out[routeClass]) {
      out[routeClass] = {
        total: 0,
        laneBuckets: {},
        recent_days: new Set(),
        evidence: {
          security_regression: 0,
          rollback_path_proven: 0,
          evaluator_pairs: [],
        },
      };
    }

    const bucket = out[routeClass].laneBuckets[lane] || {
      events: 0,
      ok: 0,
      errors: 0,
      cost_usd: 0,
      effective_tokens: 0,
      latency_ms: 0,
    };

    bucket.events += 1;
    bucket.ok += row.status === 'ok' ? 1 : 0;
    bucket.errors += row.status === 'ok' ? 0 : 1;
    bucket.cost_usd += Number(row.cost_usd || 0);
    bucket.effective_tokens += Number(row.effective_tokens || 0);
    bucket.latency_ms += Number(row.latency_ms || 0);
    out[routeClass].laneBuckets[lane] = bucket;
    out[routeClass].total += 1;

    if (dateKey) out[routeClass].recent_days.add(dateKey);
    if (metadata.security_regression === true || /security[_-]?regression/.test(String(row.operation_type || ''))) {
      out[routeClass].evidence.security_regression += 1;
    }
    if (metadata.rollback_path_proven === true || metadata.rollback_exercised === true || /rollback/.test(String(row.operation_type || ''))) {
      out[routeClass].evidence.rollback_path_proven += 1;
    }
    if (typeof metadata.baseline_score === 'number' && typeof metadata.candidate_score === 'number') {
      out[routeClass].evidence.evaluator_pairs.push({
        lane,
        baseline_score: metadata.baseline_score,
        candidate_score: metadata.candidate_score,
      });
    }
  }

  for (const routeClass of Object.keys(out)) {
    for (const lane of Object.keys(out[routeClass].laneBuckets)) {
      const bucket = out[routeClass].laneBuckets[lane];
      bucket.avg_latency_ms = bucket.events ? Math.round(bucket.latency_ms / bucket.events) : 0;
      bucket.avg_cost_usd = bucket.events ? round6(bucket.cost_usd / bucket.events) : 0;
      bucket.avg_effective_tokens = bucket.events ? Math.round(bucket.effective_tokens / bucket.events) : 0;
      delete bucket.latency_ms;
    }
    out[routeClass].recent_days = out[routeClass].recent_days.size;
  }

  return out;
}

export function evaluatePromotionReadiness(routeClasses, recentRouteClasses = routeClasses) {
  const result = {};
  for (const [routeClass, summary] of Object.entries(routeClasses)) {
    const recent = recentRouteClasses[routeClass] || { total: 0, laneBuckets: {}, evidence: {}, recent_days: 0 };
    const gates = {
      comparable_traces_per_route_class: gateComparables(summary.total),
      evaluator_beats_baseline: gateEvaluator(summary, routeClass),
      no_security_regression: gateNoSecurityRegression(summary, recent),
      rollback_path_proven: gateRollbackPath(summary, recent),
      sustained_clean_canary_window: gateCleanCanary(summary, recent),
    };

    const gateValues = Object.values(gates);
    const promotionReady = gateValues.every((gate) => gate.satisfied === true);
    result[routeClass] = {
      total_traces: summary.total,
      recent_traces: recent.total || 0,
      lanes: summary.laneBuckets,
      gates,
      promotion_ready: promotionReady,
      recommendations: recommendRouteClass(routeClass, summary, recent, gates),
    };
  }
  return result;
}

function gateComparables(total) {
  return {
    satisfied: total >= PROMOTION_GATE_DEFAULTS.comparable_traces_per_route_class,
    required: PROMOTION_GATE_DEFAULTS.comparable_traces_per_route_class,
    observed: total,
  };
}

function gateEvaluator(summary, routeClass) {
  const goldenLanes = ROUTE_CLASS_GOLDENS[routeClass] || [];
  const candidateBuckets = Object.entries(summary.laneBuckets).filter(([lane]) => lane.startsWith('ollama'));
  const baselineBuckets = Object.entries(summary.laneBuckets).filter(([lane]) => goldenLanes.includes(lane) && !lane.startsWith('ollama'));

  if (candidateBuckets.length === 0 || baselineBuckets.length === 0) {
    return {
      satisfied: false,
      status: 'unknown',
      reason: 'needs paired candidate and baseline traces',
    };
  }

  const candidate = aggregateBuckets(candidateBuckets.map(([, bucket]) => bucket));
  const baseline = aggregateBuckets(baselineBuckets.map(([, bucket]) => bucket));
  const candidateBeatsBaseline =
    candidate.error_rate <= baseline.error_rate &&
    candidate.avg_latency_ms <= baseline.avg_latency_ms &&
    candidate.avg_cost_usd <= baseline.avg_cost_usd;

  return {
    satisfied: candidateBeatsBaseline,
    status: candidateBeatsBaseline ? 'met' : 'unmet',
    candidate,
    baseline,
  };
}

function gateNoSecurityRegression(summary, recent) {
  const evidence = Number(summary.evidence?.security_regression || 0) + Number(recent.evidence?.security_regression || 0);
  return {
    satisfied: evidence === 0,
    observed: evidence,
    reason: evidence === 0 ? 'no security regression evidence found' : 'security regression evidence present',
  };
}

function gateRollbackPath(summary, recent) {
  const evidence = Number(summary.evidence?.rollback_path_proven || 0) + Number(recent.evidence?.rollback_path_proven || 0);
  return {
    satisfied: evidence > 0,
    observed: evidence,
    reason: evidence > 0 ? 'rollback path has been exercised or explicitly tagged' : 'no rollback proof found',
  };
}

function gateCleanCanary(summary, recent) {
  const recentErrors = countErrors(recent.laneBuckets);
  return {
    satisfied: recentErrors === 0 && recent.total > 0,
    window_days: PROMOTION_GATE_DEFAULTS.clean_canary_window_days,
    observed_traces: recent.total || 0,
    observed_errors: recentErrors,
    reason: recentErrors === 0 && recent.total > 0 ? 'clean recent window' : 'recent window has errors or no traces',
  };
}

function recommendRouteClass(routeClass, summary, recent, gates) {
  if (!gates.comparable_traces_per_route_class.satisfied) {
    return [{ action: 'collect_more_traces', route_class: routeClass, current_traces: summary.total, required_traces: gates.comparable_traces_per_route_class.required }];
  }
  if (!gates.no_security_regression.satisfied) {
    return [{ action: 'block_promotion', route_class: routeClass, reason: 'security regression evidence present' }];
  }
  if (!gates.rollback_path_proven.satisfied) {
    return [{ action: 'prove_rollback_path', route_class: routeClass, reason: 'rollback path not yet proven' }];
  }
  if (!gates.evaluator_beats_baseline.satisfied) {
    return [{ action: 'improve_candidate_or_baseline', route_class: routeClass, reason: 'candidate does not beat baseline yet' }];
  }
  if (!gates.sustained_clean_canary_window.satisfied) {
    return [{ action: 'extend_clean_canary_window', route_class: routeClass, reason: 'recent window is not clean enough' }];
  }
  return [{ action: 'promotion_candidate', route_class: routeClass, reason: 'all promotion gates met in advisory-only report' }];
}

function aggregateBuckets(buckets = []) {
  const totals = buckets.reduce((acc, bucket) => {
    acc.events += Number(bucket.events || 0);
    acc.ok += Number(bucket.ok || 0);
    acc.errors += Number(bucket.errors || 0);
    acc.cost_usd += Number(bucket.cost_usd || 0);
    acc.effective_tokens += Number(bucket.effective_tokens || 0);
    acc.avg_latency_ms_total += Number(bucket.avg_latency_ms || 0) * Number(bucket.events || 0);
    return acc;
  }, {
    events: 0,
    ok: 0,
    errors: 0,
    cost_usd: 0,
    effective_tokens: 0,
    avg_latency_ms_total: 0,
  });

  const error_rate = totals.events ? totals.errors / totals.events : 1;
  const avg_latency_ms = totals.events ? Math.round(totals.avg_latency_ms_total / totals.events) : 0;
  const avg_cost_usd = totals.events ? round6(totals.cost_usd / totals.events) : 0;
  return {
    events: totals.events,
    ok: totals.ok,
    errors: totals.errors,
    error_rate,
    avg_latency_ms,
    avg_cost_usd,
    effective_tokens: totals.effective_tokens,
  };
}

function countErrors(laneBuckets = {}) {
  return Object.values(laneBuckets).reduce((acc, bucket) => acc + Number(bucket.errors || 0), 0);
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
  if (/research|browser/.test(text)) return 'research_latest';
  return 'unknown';
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--db' && args[i + 1]) out.dbPath = args[++i];
  }
  return out;
}

function round6(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
