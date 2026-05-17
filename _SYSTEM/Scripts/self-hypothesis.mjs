#!/usr/bin/env node
/**
 * self-hypothesis.mjs — Improvement hypothesis generator + validator
 *
 * Neuron-loop Phase 6.
 *   - Reads: prior synthesis.json, fingerprint.json, hn-digest.json
 *   - Generates 3 structured hypotheses for next cycle
 *   - Validates prior hypotheses against current synthesis (were they correct?)
 *
 * Output: nisaba/learning/hypotheses.json
 *
 * CLI:
 *   node _SYSTEM/Scripts/self-hypothesis.mjs           # full run
 *   node _SYSTEM/Scripts/self-hypothesis.mjs --dry-run
 *   node _SYSTEM/Scripts/self-hypothesis.mjs --status  # show current hypotheses
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClosedDecisions } from './izanagi-postmortem.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NISABA    = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');

const PATHS = {
  synthesis:    path.join(NISABA, 'learning', 'synthesis.json'),
  fingerprint:  path.join(NISABA, 'self-model', 'fingerprint.json'),
  hnDigest:     path.join(NISABA, 'learning', 'hn-digest.json'),
  githubTrend:  path.join(NISABA, 'learning', 'github-trending.json'),
  hypotheses:   path.join(NISABA, 'learning', 'hypotheses.json'),
};

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS  = args.includes('--status');

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

if (STATUS) {
  const h = readJson(PATHS.hypotheses);
  if (!h) { console.log('No hypotheses yet.'); process.exit(0); }
  console.log(`Hypotheses (${h.ts?.slice(0,10)}):`);
  (h.active || []).forEach((h, i) => console.log(`  ${i+1}. [${h.confidence}] ${h.hypothesis}`));
  console.log(`Validated: ${(h.validated || []).length} prior`);
  process.exit(0);
}

const synthesis   = readJson(PATHS.synthesis);
const fingerprint = readJson(PATHS.fingerprint);
const hnDigest    = readJson(PATHS.hnDigest);
const githubTrend = readJson(PATHS.githubTrend);
const prior       = readJson(PATHS.hypotheses);

// ── Validate prior hypotheses ─────────────────────────────────────────────────

function validatePrior(priorHyps, currentSynthesis) {
  if (!priorHyps || !currentSynthesis) return [];
  return (priorHyps.active || []).map(h => {
    let outcome = 'unverifiable';
    let evidence = '';

    // Simple heuristic validation based on hypothesis type
    if (h.metric === 'improvement_score' && currentSynthesis.improvement_score != null) {
      const actual = currentSynthesis.improvement_score;
      const predicted = h.predicted_value;
      const delta = Math.abs(actual - predicted);
      outcome = delta <= 10 ? 'confirmed' : delta <= 20 ? 'partial' : 'refuted';
      evidence = `predicted=${predicted}, actual=${actual}, delta=${delta}`;
    } else if (h.metric === 'flaws_count' && currentSynthesis.audit?.flaws_found != null) {
      const actual = currentSynthesis.audit.flaws_found;
      outcome = actual < (h.predicted_value || Infinity) ? 'confirmed' : 'refuted';
      evidence = `actual flaws=${actual}`;
    }

    return { ...h, outcome, evidence, validated_at: new Date().toISOString() };
  });
}

// ── Generate new hypotheses ───────────────────────────────────────────────────

function generateHypotheses(synthesis, fingerprint, hnDigest, githubTrend) {
  const hyps = [];

  // H1: Derived from current flaw count trend
  const flaws = synthesis?.audit?.flaws_found ?? 0;
  const score = synthesis?.improvement_score ?? 50;
  hyps.push({
    id:              `H-${Date.now()}-1`,
    hypothesis:      `If self-audit auto-fixable count increases by 3+, improvement_score will rise above ${Math.min(score + 8, 100)}`,
    confidence:      0.65,
    metric:          'improvement_score',
    predicted_value: Math.min(score + 8, 100),
    experiment:      'Track auto_fixable delta over next 2 neuron-loop cycles',
    source:          'synthesis_trend',
    generated_at:    new Date().toISOString(),
  });

  // H2: Derived from fingerprint tendencies
  const overcomplicate = fingerprint?.tendencies?.overcomplicate?.[0];
  if (overcomplicate) {
    hyps.push({
      id:              `H-${Date.now()}-2`,
      hypothesis:      `Reducing depth on "${overcomplicate}" tasks will free 15%+ context per turn — measure via token-tracker.md`,
      confidence:      0.55,
      metric:          'context_efficiency',
      predicted_value: 0.15,
      experiment:      `Route all "${overcomplicate}" tasks to deepseek-flash for 3 sessions`,
      source:          'fingerprint',
      generated_at:    new Date().toISOString(),
    });
  }

  // H3: Derived from external signal (HN/GitHub)
  const topHNStory = hnDigest?.stories?.[0];
  const topRepo    = githubTrend?.repos?.[0];
  const externalSignal = topHNStory?.title || topRepo?.name || 'external AI trend';
  hyps.push({
    id:              `H-${Date.now()}-3`,
    hypothesis:      `Integrating technique from "${externalSignal.slice(0, 60)}" into knowledge-scout relevance filter will improve external_signal_quality score`,
    confidence:      0.40,
    metric:          'external_signal_quality',
    predicted_value: null,
    experiment:      'Add signal to RELEVANCE_KEYWORDS and measure filter hit rate over 7 days',
    source:          'external_signal',
    generated_at:    new Date().toISOString(),
  });

  return hyps;
}

const validated = validatePrior(prior, synthesis);
const active    = generateHypotheses(synthesis, fingerprint, hnDigest, githubTrend);

// Izanagi post-mortem integration — closed decisions feed accuracy signal
let izanagiSummary = null;
try {
  const closed = getClosedDecisions();
  if (closed.length > 0) {
    const confirmed = closed.filter(d => d.outcome === 'confirmed').length;
    const accuracy  = Math.round(confirmed / closed.length * 100);
    izanagiSummary  = { decisions: closed.length, confirmed, accuracy_pct: accuracy };
    // Flag low accuracy as a hypothesis target
    if (accuracy < 60) {
      active.push({
        id:              `H-${Date.now()}-izanagi`,
        hypothesis:      `Izanagi accuracy ${accuracy}% — counterfactual EV estimates need recalibration`,
        confidence:      0.75,
        metric:          'izanagi_accuracy',
        predicted_value: 75,
        experiment:      'Review closed decision manifests; identify which branches were systematically over/undervalued',
        source:          'izanagi_postmortem',
        generated_at:    new Date().toISOString(),
      });
    }
  }
} catch (_) { /* izanagi dir may not exist yet */ }

const output = {
  ts:        new Date().toISOString(),
  active,
  validated,
  izanagi:   izanagiSummary,
  prior_count: (prior?.active || []).length,
};

console.log(`Hypotheses: ${active.length} generated, ${validated.length} prior validated`);
validated.forEach(v => console.log(`  [${v.outcome}] ${v.hypothesis.slice(0, 60)}`));

if (!DRY_RUN) {
  mkdirSync(path.dirname(PATHS.hypotheses), { recursive: true });
  writeFileSync(PATHS.hypotheses, JSON.stringify(output, null, 2));
  console.log('Wrote hypotheses.json');
}

export { active, validated };
