#!/usr/bin/env node
/**
 * neuron-loop.mjs — Musubi autonomous self-learning orchestrator
 *
 * Runs daily (03:00 via LaunchAgent). Phase sequence + feedback substep:
 *   (phases 0 / 0.5a / 0.5b — semantic-memory/palace retrieval retired 2026-05-29)
 *   1. self-audit.mjs         — structural flaw scan
 *   2. pattern-promoter       — promote repeated council findings to global.md
 *   3. calibration-tracker    — update advisor accuracy priors
 *   4. knowledge-scout        — GitHub trending + ArXiv AI papers ingestion
 *   5. ai-news-digest         — HN breakthrough signal extraction
 *   6. self-hypothesis        — generate next-cycle improvement hypotheses, validate prior
 *   7. cross-session-miner    — all-time pattern analysis + behavioral fingerprint update
 *   7b self-model-feedback    — pulse-vault + synthesis scalar drive nudges
 *   8. synthesize delta       — diff vs prior run, write synthesis.json
 *   9. emit brain:stale       — next session gets fresh brain with today's learnings
 *
 * Output: nisaba/learning/synthesis.json (one record per run)
 * CLI:
 *   node _SYSTEM/Scripts/neuron-loop.mjs          # full run
 *   node _SYSTEM/Scripts/neuron-loop.mjs --dry-run # no writes to global.md, priors, or fingerprint
 *   node _SYSTEM/Scripts/neuron-loop.mjs --status  # show last synthesis only
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cusum, scalarKalman } from './math/math-kernel.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const YURI_SENTINEL_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');
const STATE_DIR  = path.join(REPO_ROOT, '.claude', 'state');

const PATHS = {
  // semantic-memory/palace retrieval retired 2026-05-29 — memoryEmbed/memoryConsolidate/memorySynthesize paths removed
  selfAudit:          path.join(__dirname, 'self-audit.mjs'),
  promoter:           path.join(__dirname, 'pattern-promoter.mjs'),
  calibration:        path.join(__dirname, 'calibration-tracker.mjs'),
  knowledgeScout:     path.join(__dirname, 'knowledge-scout.mjs'),
  aiNewsDigest:       path.join(__dirname, 'ai-news-digest.mjs'),
  selfHypothesis:     path.join(__dirname, 'self-hypothesis.mjs'),
  crossMiner:         path.join(__dirname, 'cross-session-miner.mjs'),
  selfModel:          path.join(__dirname, 'self-model.mjs'),
  selfModelFeedback:  path.join(__dirname, 'self-model-feedback.mjs'),
  auditReport:        path.join(STATE_DIR, 'self-audit-report.json'),
  promoterDelta:      path.join(YURI_SENTINEL_DIR, 'promoter', 'delta.json'),
  izanagiDir:         path.join(YURI_SENTINEL_DIR, 'izanagi'),
  learningGlobal:     path.join(YURI_SENTINEL_DIR, 'learning', 'global.md'),
  priors:             path.join(YURI_SENTINEL_DIR, 'calibration', 'priors.json'),
  synthesis:          path.join(YURI_SENTINEL_DIR, 'learning', 'synthesis.json'),
  synthLog:           path.join(YURI_SENTINEL_DIR, 'learning', 'synthesis.jsonl'),
  fingerprint:        path.join(YURI_SENTINEL_DIR, 'self-model', 'fingerprint.json'),
  githubTrending:     path.join(YURI_SENTINEL_DIR, 'learning', 'github-trending.json'),
  hnDigest:           path.join(YURI_SENTINEL_DIR, 'learning', 'hn-digest.json'),
  hypotheses:         path.join(YURI_SENTINEL_DIR, 'learning', 'hypotheses.json'),
  metaSynthesis:      path.join(YURI_SENTINEL_DIR, 'learning', 'meta-synthesis.json'),
  brainStale:         path.join(STATE_DIR, 'brain-stale.sentinel'),
  neuronLog:          path.join(STATE_DIR, 'neuron-loop.log'),
};

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS  = args.includes('--status');

function log(msg) {
  const line = `${new Date().toISOString()} [neuron-loop] ${msg}`;
  console.log(line);
  try { appendFileSync(PATHS.neuronLog, line + '\n'); } catch (_) {}
}

function runScript(scriptPath, extraArgs = [], options = {}) {
  return new Promise((resolve) => {
    const allArgs = [scriptPath, ...extraArgs];
    if (DRY_RUN && !extraArgs.includes('--json')) allArgs.push('--dry-run');
    const child = spawn('node', allArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => {
      const text = d.toString();
      out += text;
      if (options.echo) process.stdout.write(text);
    });
    child.stderr.on('data', d => {
      const text = d.toString();
      err += text;
      if (options.echo) process.stderr.write(text);
    });
    child.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
    child.on('error', e => resolve({ code: -1, out: '', err: e.message }));
  });
}

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function loadPriorSynthesis() {
  return readJson(PATHS.synthesis);
}

// ── ADVISORY trend-health readout over the improvement_score time-series ─────────
// Catalog card #2 (CUSUM slow-drift) + card #1 (scalar-Kalman recovery) imported
// from the Tier-1 math-kernel. neuron-loop's existing flaws_delta/rules_delta are a
// SHOCK-only "vs immediately-prior" view; a slow multi-run decline (score drifting
// 70->50 over 8 runs, no single step an outlier) is invisible to a single diff.
// This reads the lower bound of the trend, not a point delta. ADVISORY ONLY — it
// adds fields to the synthesis object and a sentinel reason; it changes NO phase,
// NO script invocation, and NOT the improvement_score itself. Pure, never throws.

function medianOf(values) {
  const finite = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x));
  if (finite.length === 0) return 0;
  const sorted = finite.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function madOf(values) {
  const finite = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x));
  if (finite.length === 0) return 0;
  const med = medianOf(finite);
  return medianOf(finite.map((x) => Math.abs(x - med)));
}

/** Population std-dev — the non-degenerate scale fallback when step-MAD collapses. */
function stdOf(values) {
  const finite = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x));
  if (finite.length < 2) return 0;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return Math.sqrt(finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length);
}

/** Read the last N improvement_score values from synthesis.jsonl (oldest->newest). */
function readScoreStream(maxN = 20) {
  if (!existsSync(PATHS.synthLog)) return [];
  let lines = [];
  try {
    lines = readFileSync(PATHS.synthLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  const scores = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (typeof rec.improvement_score === 'number' && Number.isFinite(rec.improvement_score)) {
        scores.push(rec.improvement_score);
      }
    } catch { /* skip malformed row */ }
  }
  return scores.slice(-maxN);
}

/**
 * ADVISORY-ONLY decline alarm on the improvement_score stream. A DECLINE is a
 * NEGATIVE drift, so feed CUSUM the NEGATED signed step deltas (upper-arm CUSUM
 * alarms on persistent positive drift => persistent score DROPS). Scale-free:
 * k = 0.5·MAD(steps), h = 5·MAD(steps), μ0 = median step. Returns a flat
 * in-control readout on too-few samples or degenerate scale. Never throws.
 */
function computeScoreTrend(scores) {
  const flat = { available: false, alarm: false, changeIndex: -1, statistic: 0, samples: 0, k: 0, h: 0, kalman_estimate: 0 };
  try {
    const s = (Array.isArray(scores) ? scores : []).filter((x) => Number.isFinite(x));
    if (s.length < 5) return { ...flat, samples: s.length };
    // Run-over-run signed steps; NEGATE so a sustained DECLINE is positive drift.
    const declineSteps = [];
    for (let i = 1; i < s.length; i += 1) declineSteps.push(-(s[i] - s[i - 1]));
    // Scale-free dial: 0.5·scale slack / 5·scale threshold (catalog discipline).
    // A pristine linear decline has step-MAD=0 (the mode dominates), which would
    // blind the detector exactly when drift is cleanest — so floor the scale at
    // 0.6745·step-std (= MAD for a Gaussian, so the two agree when steps are noisy;
    // std is only 0 for a truly constant step series, which carries no drift signal).
    const scale = Math.max(madOf(declineSteps), 0.6745 * stdOf(declineSteps), 1e-6);
    const k = 0.5 * scale;
    const h = 5 * scale;
    const mu0 = 0; // in-control mean step is 0 (no run-over-run drift)
    const c = cusum(declineSteps, { k, h, mu0 });
    const ka = scalarKalman(s, { q: Math.max(0.3 * madOf(s), 1e-9), r: Math.max(madOf(s), 1e-9) });
    return {
      available: true,
      alarm: c.alarm === true,
      // changeIndex is into declineSteps (offset by 1 from the score series).
      changeIndex: c.changeIndex >= 0 ? c.changeIndex + 1 : -1,
      statistic: c.statistic,
      samples: s.length,
      k, h,
      kalman_estimate: ka.estimate,
    };
  } catch {
    return flat;
  }
}

function collectJsonFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(fullPath);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normaliseInlineText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractInlineValue(value, fallback = 'unknown') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normaliseInlineText(value);
  }
  if (typeof value === 'object') {
    return extractInlineValue(
      value.label ?? value.name ?? value.title ?? value.path ?? value.id ?? value.value,
      fallback
    );
  }
  return fallback;
}

function promoteIzanagiVerifiedDecisions({ dryRun = false } = {}) {
  if (!existsSync(PATHS.izanagiDir)) {
    return { promotedCount: 0, candidates: 0 };
  }

  const now = Date.now();
  const thresholdMs = 24 * 60 * 60 * 1000;
  const files = collectJsonFiles(PATHS.izanagiDir);
  let promotedCount = 0;

  for (const filePath of files) {
    const record = readJson(filePath);
    if (!record) continue;
    if (record.outcome !== 'success') continue;
    if (record.promoted === true) continue;

    const timestampValue = record.timestamp ?? record.ts;
    const timestampMs = new Date(timestampValue).getTime();
    if (!Number.isFinite(timestampMs) || (now - timestampMs) <= thresholdMs) continue;

    const scenario = extractInlineValue(record.scenario ?? record.task ?? record.title, 'unknown scenario');
    const chosenLabel = extractInlineValue(
      record.chosen_path ??
      record.chosen_branch ??
      record.chosenPath ??
      record.chosenBranch,
      'unknown path'
    );
    const line = `- **Izanagi verified:** ${scenario} → chose ${chosenLabel}. Outcome: confirmed success.`;

    if (!dryRun) {
      mkdirSync(path.dirname(PATHS.learningGlobal), { recursive: true });
      try {
        const existing = existsSync(PATHS.learningGlobal)
          ? readFileSync(PATHS.learningGlobal, 'utf8')
          : '';
        if (!existing.includes(line)) {
          appendFileSync(PATHS.learningGlobal, `${line}\n`);
        }
        const updatedRecord = {
          ...record,
          promoted: true,
          promoted_at: new Date().toISOString(),
        };
        writeFileSync(filePath, JSON.stringify(updatedRecord, null, 2));
      } catch (error) {
        log(`izanagi-promoter warning for ${path.basename(filePath)}: ${error.message}`);
        continue;
      }
    }

    promotedCount += 1;
  }

  return { promotedCount, candidates: files.length };
}

// ── Status mode ───────────────────────────────────────────────────────────────

if (STATUS) {
  const s = readJson(PATHS.synthesis);
  if (!s) { console.log('No synthesis record found. Run neuron-loop first.'); process.exit(0); }
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}

// ── Full run ──────────────────────────────────────────────────────────────────

const runId  = `NL-${new Date().toISOString().slice(0, 10)}`;
const prior  = loadPriorSynthesis();
log(`starting run=${runId} dry=${DRY_RUN}`);

// semantic-memory/palace retrieval retired 2026-05-29
// (phases 0 / 0.5a / 0.5b — memory-embed, memory-consolidate, memory-synthesize removed;
//  these produced the empty/stale semantic-memory.db and fed nothing downstream)

// 1. Self-audit
log('phase 1: self-audit');
const auditResult = await runScript(PATHS.selfAudit);
if (auditResult.code !== 0) log(`self-audit warning (exit=${auditResult.code}): ${auditResult.err.slice(0, 200)}`);
const audit = readJson(PATHS.auditReport);

// 2. Pattern promoter
log('phase 2: pattern-promoter');
const promoterResult = await runScript(PATHS.promoter);
if (promoterResult.code !== 0) log(`pattern-promoter warning: ${promoterResult.err.slice(0, 200)}`);
const promoter = readJson(PATHS.promoterDelta);
const izanagiPromoter = promoteIzanagiVerifiedDecisions({ dryRun: DRY_RUN });
log(`izanagi-promoter: ${izanagiPromoter.promotedCount} patterns promoted`);

// 3. Calibration tracker
log('phase 3: calibration-tracker');
const calibResult = await runScript(PATHS.calibration);
if (calibResult.code !== 0) log(`calibration-tracker warning: ${calibResult.err.slice(0, 200)}`);
const calibration = readJson(PATHS.priors);

// 4. Knowledge scout (GitHub trending + ArXiv)
log('phase 4: knowledge-scout');
const scoutResult = await runScript(PATHS.knowledgeScout);
if (scoutResult.code !== 0) log(`knowledge-scout warning: ${scoutResult.err.slice(0, 200)}`);
const githubTrending = readJson(PATHS.githubTrending);

// 5. AI news digest (HN signal)
log('phase 5: ai-news-digest');
const digestResult = await runScript(PATHS.aiNewsDigest);
if (digestResult.code !== 0) log(`ai-news-digest warning: ${digestResult.err.slice(0, 200)}`);
const hnDigest = readJson(PATHS.hnDigest);

// 6. Self-hypothesis (generate + validate)
log('phase 6: self-hypothesis');
const hypoResult = await runScript(PATHS.selfHypothesis);
if (hypoResult.code !== 0) log(`self-hypothesis warning: ${hypoResult.err.slice(0, 200)}`);
const hypotheses = readJson(PATHS.hypotheses);

// 7. Cross-session miner + fingerprint update
log('phase 7: cross-session-miner');
const minerResult = await runScript(PATHS.crossMiner);
if (minerResult.code !== 0) log(`cross-session-miner warning: ${minerResult.err.slice(0, 200)}`);

log('phase 7b: self-model-feedback');
const feedbackResult = await runScript(PATHS.selfModelFeedback);
if (feedbackResult.code !== 0) log(`self-model-feedback warning: ${feedbackResult.err.slice(0, 200)}`);
const fingerprint = readJson(PATHS.fingerprint);

// 7c. Fingerprint baseline drift compute
log('phase 7c: fingerprint-baseline');
const baselinePath = path.join(__dirname, 'fingerprint-baseline.mjs');
const baselineResult = await runScript(baselinePath);
if (baselineResult.code !== 0) log(`fingerprint-baseline warning: ${baselineResult.err.slice(0, 200)}`);

// 8. Synthesize delta
const externalRepos  = githubTrending?.repos?.length ?? 0;
const externalPapers = readJson(PATHS.githubTrending.replace('github-trending', 'arxiv-pulse'))?.papers?.length ?? 0;
const hnStories      = hnDigest?.stories?.length ?? 0;
const externalGain   = Math.min((externalRepos + externalPapers + hnStories) * 2, 20);

const hypoValidated   = (hypotheses?.validated || []).filter(h => h.outcome === 'confirmed').length;
const hypoTotal       = (hypotheses?.validated || []).length;
const hypoAccuracy    = hypoTotal > 0 ? Math.round((hypoValidated / hypoTotal) * 100) : null;

// improvement_score — hoisted so the ADVISORY trend readout can see THIS run's value
// appended onto the historical stream. Identical formula to the prior inline IIFE.
const improvementScore = (() => {
  let score = 50;
  if (audit) score -= (audit.stats?.criticals ?? 0) * 5;
  if (audit) score -= (audit.stats?.warns ?? 0) * 1;
  if (promoter) score += (promoter.promoted_count ?? 0) * 3;
  if (calibration) score -= (calibration.deprioritized?.length ?? 0) * 2;
  score += externalGain;
  if (hypoAccuracy != null) score += Math.round((hypoAccuracy - 50) / 10);
  return Math.max(0, Math.min(100, score));
})();

// ADVISORY trend: prior persisted scores + this run's score (newest last).
const scoreTrend = computeScoreTrend([...readScoreStream(20), improvementScore]);

const synthesis = {
  run_id: runId,
  ts: new Date().toISOString(),
  dry_run: DRY_RUN,

  audit: {
    flaws_found:       audit?.stats?.total ?? 0,
    auto_fixable:      audit?.stats?.auto_fixable ?? 0,
    criticals:         audit?.stats?.criticals ?? 0,
    warns:             audit?.stats?.warns ?? 0,
    flaws_delta:       prior ? (audit?.stats?.total ?? 0) - (prior.audit?.flaws_found ?? 0) : null,
  },

  promoter: {
    candidates:        promoter?.candidates ?? 0,
    promoted:          promoter?.promoted_count ?? 0,
    rules_added:       (promoter?.promoted || []).map(p => p.rule_id_if_promoted).filter(Boolean),
    rules_delta:       prior ? (promoter?.promoted_count ?? 0) - (prior.promoter?.promoted ?? 0) : null,
  },

  calibration: {
    advisors_deprioritized: calibration?.deprioritized ?? [],
    f1_dropped:             calibration?.f1_dropped_advisors ?? [],
    recalibration_needed:   calibration?.recalibration_threshold_exceeded ?? false,
    f1_per_advisor:         Object.fromEntries(
      Object.entries(calibration?.advisors || {})
        .filter(([, v]) => v.f1 !== null)
        .map(([k, v]) => [k, { f1: v.f1, delta: v.f1_delta }])
    ),
  },

  external_knowledge: {
    github_repos:      externalRepos,
    arxiv_papers:      externalPapers,
    hn_stories:        hnStories,
    signal_gain:       externalGain,
  },

  self_learning: {
    hypotheses_generated: (hypotheses?.active || []).length,
    hypotheses_validated: hypoTotal,
    hypothesis_accuracy:  hypoAccuracy,
    fingerprint_updated:  !!fingerprint,
    calibration_trend:    fingerprint?.calibration_trend ?? 'unknown',
    confidence_bias:      fingerprint?.confidence_bias ?? 'unknown',
    drives:               fingerprint?.drives ?? {},
  },

  improvement_score: improvementScore,

  // ADVISORY trend-health readout (CUSUM slow-decline alarm + Kalman recovery).
  // Computed/shadow metric — does NOT alter any phase, score, or control flow.
  trend: {
    alarm:           scoreTrend.alarm,
    change_index:    scoreTrend.changeIndex,
    statistic:       scoreTrend.statistic,
    samples:         scoreTrend.samples,
    available:       scoreTrend.available,
    kalman_estimate: scoreTrend.kalman_estimate,
  },

  brain_reloaded: !DRY_RUN,
};

mkdirSync(path.dirname(PATHS.synthesis), { recursive: true });
writeFileSync(PATHS.synthesis, JSON.stringify(synthesis, null, 2));
appendFileSync(PATHS.synthLog, JSON.stringify(synthesis) + '\n');

log(`synthesis score=${synthesis.improvement_score} flaws=${synthesis.audit.flaws_found} rules_added=${synthesis.promoter.rules_added.length} external_gain=${externalGain} hypo_accuracy=${hypoAccuracy ?? 'n/a'}`);

// 5. Emit brain:stale sentinel — next Claude session gets fresh brain with today's learnings
const trendNote = scoreTrend.alarm
  ? ` ⚠ TREND ALARM: sustained improvement_score decline (CUSUM change~run#${scoreTrend.changeIndex} of ${scoreTrend.samples})`
  : '';
if (!DRY_RUN) {
  writeFileSync(PATHS.brainStale, JSON.stringify({
    ts: new Date().toISOString(),
    turnId: runId,
    reason: `neuron-loop: ${synthesis.promoter.promoted} rules promoted, score=${synthesis.improvement_score}, external_gain=${externalGain}${trendNote}`,
    trend_alarm: scoreTrend.alarm,
    consensusSummaries: (promoter?.promoted || []).slice(0, 3).map(p => p.cluster_key),
    fingerprint_watch: fingerprint?.watch_for ?? [],
    drives: fingerprint?.drives ?? {},
  }));
  log('brain:stale sentinel emitted — next session will reload brain context');
}

log(`run complete: ${runId}`);

console.log(`\n⬡ Neuron Loop Complete — ${runId}`);
console.log(`  Improvement score: ${synthesis.improvement_score}/100`);
console.log(`  Flaws: ${synthesis.audit.flaws_found} (${synthesis.audit.flaws_delta !== null ? (synthesis.audit.flaws_delta >= 0 ? '+' : '') + synthesis.audit.flaws_delta + ' vs prior' : 'no prior'})`);
console.log(`  Rules promoted: ${synthesis.promoter.promoted}`);
console.log(`  Advisors deprioritized: [${synthesis.calibration.advisors_deprioritized.join(',') || 'none'}]`);
console.log(`  External knowledge gain: +${externalGain} (${externalRepos} repos, ${externalPapers} papers, ${hnStories} HN stories)`);
console.log(`  Hypothesis accuracy: ${hypoAccuracy != null ? hypoAccuracy + '%' : 'n/a (no prior hypotheses)'}`);
console.log(`  Calibration trend: ${fingerprint?.calibration_trend ?? 'unknown'}`);
console.log(`  Confidence bias: ${fingerprint?.confidence_bias ?? 'unknown'}`);
console.log(`  Score trend: ${scoreTrend.available ? (scoreTrend.alarm ? `⚠ DECLINE ALARM (CUSUM change~run#${scoreTrend.changeIndex}/${scoreTrend.samples})` : `in-control (${scoreTrend.samples} runs)`) : 'insufficient history'}`);
if (fingerprint?.watch_for?.length) fingerprint.watch_for.forEach(w => console.log(`  ⚠ Watch: ${w}`));
if (DRY_RUN) console.log('  (dry-run — no permanent writes)');
