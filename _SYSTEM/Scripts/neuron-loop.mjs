#!/usr/bin/env node
/**
 * neuron-loop.mjs — Musubi autonomous self-learning orchestrator
 *
 * Runs daily (03:00 via LaunchAgent). 12-phase sequence + feedback substep:
 *   0. memory-embed           — refresh semantic vectors for changed memory notes
 *   0.5a memory-consolidate   — merge near-duplicate memories and flag contradictions
 *   0.5b memory-synthesize    — synthesize cluster-level memory summaries
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

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const NISABA_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');
const STATE_DIR  = path.join(REPO_ROOT, '.claude', 'state');

const PATHS = {
  memoryEmbed:        path.join(__dirname, 'memory-embed.mjs'),
  memoryConsolidate:   path.join(__dirname, 'memory-consolidate.mjs'),
  memorySynthesize:    path.join(__dirname, 'memory-synthesize.mjs'),
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
  promoterDelta:      path.join(NISABA_DIR, 'promoter', 'delta.json'),
  izanagiDir:         path.join(NISABA_DIR, 'izanagi'),
  learningGlobal:     path.join(NISABA_DIR, 'learning', 'global.md'),
  priors:             path.join(NISABA_DIR, 'calibration', 'priors.json'),
  synthesis:          path.join(NISABA_DIR, 'learning', 'synthesis.json'),
  synthLog:           path.join(NISABA_DIR, 'learning', 'synthesis.jsonl'),
  fingerprint:        path.join(NISABA_DIR, 'self-model', 'fingerprint.json'),
  githubTrending:     path.join(NISABA_DIR, 'learning', 'github-trending.json'),
  hnDigest:           path.join(NISABA_DIR, 'learning', 'hn-digest.json'),
  hypotheses:         path.join(NISABA_DIR, 'learning', 'hypotheses.json'),
  metaSynthesis:      path.join(NISABA_DIR, 'learning', 'meta-synthesis.json'),
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

// 0. Memory embed refresh
log('phase 0: memory-embed');
const embedResult = await runScript(PATHS.memoryEmbed, [], { echo: true });
if (embedResult.code !== 0) log(`phase 0: memory-embed failed (non-fatal): ${embedResult.err.slice(0, 200)}`);

// 0.5a Memory consolidate
log('phase 0.5a: memory-consolidate');
const consolidateResult = await runScript(PATHS.memoryConsolidate, [], { echo: true });
if (consolidateResult.code !== 0) log(`phase 0.5a: memory-consolidate failed (non-fatal): ${consolidateResult.err.slice(0, 200)}`);

// 0.5b Memory synthesize
log('phase 0.5b: memory-synthesize');
const synthesizeResult = await runScript(PATHS.memorySynthesize, [], { echo: true });
if (synthesizeResult.code !== 0) log(`phase 0.5b: memory-synthesize failed (non-fatal): ${synthesizeResult.err.slice(0, 200)}`);

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

  improvement_score: (() => {
    // Expanded scalar: structural quality + knowledge gain + hypothesis accuracy
    let score = 50;
    if (audit) score -= (audit.stats?.criticals ?? 0) * 5;
    if (audit) score -= (audit.stats?.warns ?? 0) * 1;
    if (promoter) score += (promoter.promoted_count ?? 0) * 3;
    if (calibration) score -= (calibration.deprioritized?.length ?? 0) * 2;
    score += externalGain;                                   // +2 per relevant external signal
    if (hypoAccuracy != null) score += Math.round((hypoAccuracy - 50) / 10); // +/- based on accuracy
    return Math.max(0, Math.min(100, score));
  })(),

  brain_reloaded: !DRY_RUN,
};

mkdirSync(path.dirname(PATHS.synthesis), { recursive: true });
writeFileSync(PATHS.synthesis, JSON.stringify(synthesis, null, 2));
appendFileSync(PATHS.synthLog, JSON.stringify(synthesis) + '\n');

log(`synthesis score=${synthesis.improvement_score} flaws=${synthesis.audit.flaws_found} rules_added=${synthesis.promoter.rules_added.length} external_gain=${externalGain} hypo_accuracy=${hypoAccuracy ?? 'n/a'}`);

// 5. Emit brain:stale sentinel — next Claude session gets fresh brain with today's learnings
if (!DRY_RUN) {
  writeFileSync(PATHS.brainStale, JSON.stringify({
    ts: new Date().toISOString(),
    turnId: runId,
    reason: `neuron-loop: ${synthesis.promoter.promoted} rules promoted, score=${synthesis.improvement_score}, external_gain=${externalGain}`,
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
if (fingerprint?.watch_for?.length) fingerprint.watch_for.forEach(w => console.log(`  ⚠ Watch: ${w}`));
if (DRY_RUN) console.log('  (dry-run — no permanent writes)');
