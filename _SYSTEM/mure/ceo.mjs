#!/usr/bin/env node
// @capability: mure-ceo-entry
// @serves: run mure | ceo | operator entry | one command mure | free text to fleet | ceo dispatch | simple mure command
// @does: the single CEO entry point for MURE. Turns free-text operator intent into a governed, role-cast fleet plan, then (when MURE is armed) dispatches it through runCompany. DISARMED-safe by default: --dry-run (or an unarmed repo) prints the plan with zero spend. Never arms anything itself; never writes a flag file. Capability inference feature-detects deriveNeeds from company.mjs (parallel lane) and falls back to an inline keyword->capability map. Live progress (--watch) polls .claude/jobs/<runId>/ and degrades gracefully when artifacts are absent.
// @use: node _SYSTEM/mure/ceo.mjs "<free-text task>" [--dry-run] [--watch] [--report] [--task-file <json>] [--json]
// @exports: buildTaskSpec, decomposeFreeText, inferNeeds, dispatchAsCeo, watchRun, renderReport, CEO_RESULT_LABEL
//
// Authority: ADVISORY orchestration, the same grade as company.mjs. The plan + governance rulings are produced
// by planCompany/runCompany (imported); this module only (a) turns free text into a task spec, (b) chooses
// dry-run vs live, (c) renders progress + a CEO summary. It NEVER arms, NEVER finalizes, NEVER touches
// protected paths. Arming stays with the owner (env YURI_MURE_ARMED or flag _SYSTEM/state/mure.enabled).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

// ---------------------------------------------------------------------------
// Capability inference — feature-detect deriveNeeds from company.mjs (a parallel
// lane is adding it). If absent, use the inline keyword->capability fallback map.
// The fallback is intentionally small: it covers the common build/research/verify
// verbs that recur in owner brain-dumps. role-registry.mjs matchRolesByCapability
// does the fuzzy capability->role match downstream, so we only need coarse needs.
// ---------------------------------------------------------------------------

/**
 * Inline fallback capability map. Keys are lowercase keywords/phrases; values are
 * capability tokens that resolve against fleet-roles.json via matchRolesByCapability.
 * Keep this coarse — the registry does the real role match.
 */
const FALLBACK_KEYWORD_MAP = Object.freeze({
  // research
  research: ['local-first-search', 'online-research'],
  investigate: ['local-first-search', 'online-research'],
  prior: ['local-first-search', 'online-research'],
  explore: ['divergent-scan', 'cross-domain-transfer'],
  brainstorm: ['divergent-scan', 'hypothesis-generation'],
  // design
  design: ['architecture-design', 'interface-contracts'],
  architecture: ['architecture-design', 'interface-contracts'],
  interface: ['architecture-design', 'interface-contracts'],
  plan: ['architecture-design', 'dispatch-planning'],
  // build
  build: ['code-generation', 'implementation'],
  implement: ['code-generation', 'implementation'],
  code: ['code-generation', 'implementation'],
  refactor: ['integration', 'code-generation'],
  wire: ['integration', 'implementation'],
  fix: ['code-generation', 'implementation'],
  // test / verify
  test: ['test-execution', 'scaffolding'],
  tests: ['test-execution', 'scaffolding'],
  verify: ['adversarial-verify', 'gap-detection'],
  adversarial: ['adversarial-verify', 'gap-detection'],
  redteam: ['adversarial-verify', 'gap-detection'],
  'red-team': ['adversarial-verify', 'gap-detection'],
  // security
  security: ['security-review', 'safety-audit'],
  audit: ['security-review', 'safety-audit'],
  // docs / knowledge
  doc: ['technical-writing', 'doc-generation'],
  document: ['technical-writing', 'doc-generation'],
  readme: ['technical-writing', 'doc-generation'],
  // ship / arm (always owner-gated by the governance floor)
  ship: ['improvement-proposal'],
  deploy: ['improvement-proposal'],
  arm: ['improvement-proposal'],
  release: ['improvement-proposal'],
});

/**
 * Infer capability needs from a text fragment using the inline fallback map.
 * @param {string} text
 * @returns {string[]} capability tokens (may be empty)
 */
export function inferNeedsFallback(text = '') {
  const lower = String(text || '').toLowerCase();
  const needs = new Set();
  for (const [kw, caps] of Object.entries(FALLBACK_KEYWORD_MAP)) {
    // word-boundary-ish match: kw as a whole token or substring separated by non-alnum
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(kw)}([^a-z0-9]|$)`, 'i');
    if (re.test(lower)) for (const c of caps) needs.add(c);
  }
  return [...needs];
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Try to use deriveNeeds from company.mjs (parallel-lane export). Feature-detected
 * via dynamic import so this module works whether or not that export exists yet.
 * Returns { needs, source } where source is 'deriveNeeds' | 'fallback' | 'none'.
 */
export async function inferNeeds(text = '', companyModule = null) {
  if (text && companyModule?.deriveNeeds) {
    try {
      const needs = await companyModule.deriveNeeds(text);
      if (Array.isArray(needs) && needs.length) return { needs, source: 'deriveNeeds' };
    } catch {
      // fall through to fallback
    }
  }
  const fb = inferNeedsFallback(text);
  return { needs: fb, source: fb.length ? 'fallback' : 'none' };
}

// ---------------------------------------------------------------------------
// Free-text decomposition — heuristic. Splits on sentence/clause boundaries and
// common list markers, then tags each segment with inferred needs. If the text is
// a single clause with no decomposition signal, emits a small default pipeline
// (research → build → verify → doc) so the plan is always non-trivial + castable.
// ---------------------------------------------------------------------------

// Split on sentence breaks, list markers, "…, and …", AND a comma directly followed by an
// action verb — "research X, implement Y, verify Z" is three intents, not one clause.
const ACTION_VERBS = 'research|investigate|explore|implement|build|code|create|fix|refactor|wire|integrate|design|architect|verify|test|validate|redteam|audit|review|document|summarize|write|deploy|optimize|benchmark|calibrate';
const DECOMP_SPLIT_RE = new RegExp(
  String.raw`(?:[.]\s+|\n+|;\s+|,\s+and\s+|,\s+(?=(?:then\s+)?(?:${ACTION_VERBS})\b)|^\s*[-*]\s+)`,
  'im',
);

/**
 * Heuristic decomposition of free-text operator intent into subtasks.
 *
 * Strategy:
 *   1. If the text contains list markers or sentence breaks, split into segments.
 *   2. Otherwise (single clause), synthesize a default 4-stage pipeline so the
 *      plan is always castable to distinct roles.
 *   3. Tag each segment with inferred capability needs (deriveNeeds or fallback).
 *   4. The first subtask carries the whole summary as its prompt (envoy decode).
 *
 * Returns { subtasks: [{id, need:[caps], prompt, blastRadius, ...}], inferenceSource }.
 */
export async function decomposeFreeText(text = '', companyModule = null) {
  const summary = String(text || '').trim();
  if (!summary) return { subtasks: [], inferenceSource: 'none' };

  const rawSegments = summary.split(DECOMP_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  let inferenceSource = 'none';
  const subtasks = [];

  if (rawSegments.length >= 2) {
    // Multi-segment: each clause becomes a subtask.
    for (let i = 0; i < rawSegments.length; i += 1) {
      const seg = rawSegments[i];
      const { needs, source } = await inferNeeds(seg, companyModule);
      if (i === 0) inferenceSource = source;
      subtasks.push({
        id: slugify(seg).slice(0, 32) || `step-${i + 1}`,
        need: needs.length ? needs : ['code-generation', 'implementation'],
        prompt: seg,
        summary: seg.slice(0, 100),
        blastRadius: inferBlast(seg),
      });
    }
  } else {
    // Single clause: synthesize a default pipeline. The owner said one thing; we
    // expand it into the canonical build arc so roles actually get cast.
    const pipeline = [
      { id: 'research', prompt: `Research prior art and local context for: ${summary}`, need: ['local-first-search', 'online-research'], blastRadius: 'LOW' },
      { id: 'build', prompt: `Implement the core of: ${summary}`, need: ['code-generation', 'implementation'], blastRadius: 'MEDIUM' },
      { id: 'verify', prompt: `Adversarially verify the implementation of: ${summary}`, need: ['adversarial-verify', 'gap-detection'], blastRadius: 'LOW' },
      { id: 'doc', prompt: `Document the result of: ${summary}`, need: ['technical-writing', 'doc-generation'], blastRadius: 'LOW' },
    ];
    for (const p of pipeline) {
      // Keep each stage's DECLARED needs: the stage prompts embed the full summary, so
      // re-inferring from them matches every verb in the summary and collapses all four
      // stages onto one role (the exact D-8 shape, reintroduced at the CEO layer).
      subtasks.push({ ...p, summary: p.prompt.slice(0, 100) });
    }
    inferenceSource = 'pipeline';
  }

  // Ensure the envoy (intake/decode) subtask is always present as the opener, so the
  // plan shows the brain-dump-decode step the architecture promises. Idempotent.
  if (!subtasks[0] || subtasks[0].id !== 'intake') {
    subtasks.unshift({
      id: 'intake',
      need: ['brain-dump-decode', 'requirement-decode'],
      prompt: `Decode operator intent into a goal tree: ${summary}`,
      summary: summary.slice(0, 100),
      blastRadius: 'LOW',
    });
  }

  return { subtasks, inferenceSource };
}

/** Infer a coarse blast radius from keywords. Defaults LOW. */
function inferBlast(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/\b(arm|deploy|ship|release|production|prod|publish|commit|push)\b/.test(lower)) return 'HIGH';
  if (/\b(build|implement|write|create|install|refactor)\b/.test(lower)) return 'MEDIUM';
  return 'LOW';
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Build a MURE task spec from free text.
 * @param {string} text free-text operator intent
 * @param {object} [companyModule] injected company.mjs namespace (for deriveNeeds)
 * @returns {Promise<{task: {summary, subtasks, tags}, inferenceSource}>}
 */
export async function buildTaskSpec(text = '', companyModule = null) {
  const summary = String(text || '').trim();
  const { subtasks, inferenceSource } = await decomposeFreeText(summary, companyModule);
  const tags = inferTags(summary);
  return { task: { summary, subtasks, tags }, inferenceSource };
}

function inferTags(text = '') {
  const lower = String(text || '').toLowerCase();
  const tags = new Set();
  const tagMap = {
    build: /\b(build|implement|code|refactor|fix|wire|scaffold)\b/,
    research: /\b(research|investigate|explore|prior|brainstorm)\b/,
    verify: /\b(verify|test|adversarial|red-?team|audit)\b/,
    doc: /\b(doc|document|readme|write up)\b/,
    security: /\b(security|audit|vuln|cve)\b/,
    design: /\b(design|architecture|interface|plan)\b/,
    ship: /\b(ship|deploy|arm|release|publish)\b/,
  };
  for (const [tag, re] of Object.entries(tagMap)) if (re.test(lower)) tags.add(tag);
  return [...tags];
}

// ---------------------------------------------------------------------------
// Dispatch — delegate to runCompany. CEO never arms; it only chooses dry-run vs
// live. dryRun=true forces armed:false (zero spend, always safe). dryRun=false
// passes armed:undefined so isMureArmed() is the sole arming authority.
// ---------------------------------------------------------------------------

/**
 * Dispatch a task as CEO.
 *
 * @param {object} task MURE task spec {summary, subtasks, tags}
 * @param {object} [opts] { dryRun?: boolean, companyModule?: object, ...forwarded }
 *   - dryRun: if true (or MURE disarmed), plan-only. If false and MURE armed, live dispatch.
 *   - companyModule: injected namespace (tests); defaults to a dynamic import of ./company.mjs
 * @returns {Promise<object>} the runCompany result ({name, armed, plan, swarm?, nativeSpecs, held, ...})
 */
export async function dispatchAsCeo(task = {}, opts = {}) {
  const companyModule = opts.companyModule
    || await import(pathToFileURL(path.join(HERE, 'company.mjs')).href);

  const { runCompany, isMureArmed } = companyModule;
  if (typeof runCompany !== 'function') throw new Error('ceo: company.mjs did not export runCompany');

  // CEO NEVER arms. dry-run forces armed:false; live passes undefined so isMureArmed() decides.
  const armed = opts.dryRun ? false : undefined;
  const result = await runCompany(task, { ...opts, armed });

  // Stamp CEO metadata onto the result for the report layer.
  result.ceo = {
    dryRun: opts.dryRun || !isMureArmed(),
    mureArmed: isMureArmed(),
    timestamp: new Date().toISOString(),
  };
  return result;
}

// ---------------------------------------------------------------------------
// Watch — live progress polling. Polls .claude/jobs/<runId>/ every `intervalMs`
// (default 3000). Reads results/*.json (the real per-leaf packet store) plus, when
// present, status.json and spawns.jsonl (parallel lanes are adding these). Degrades
// gracefully: missing files are skipped, never fatal.
// ---------------------------------------------------------------------------

const DEFAULT_WATCH_INTERVAL_MS = 3000;

/**
 * Resolve the run directory for a runId. The canonical path is
 * .claude/jobs/<runId>/ (results live in the results/ subdir).
 */
function runDirFor(runId) {
  return path.join(REPO_ROOT, '.claude', 'jobs', String(runId || ''));
}

/**
 * Read the current snapshot of run artifacts, tolerating absence.
 * @returns {{results: object[], status: object|null, spawns: object[], runDir: string}}
 */
export function snapshotRun(runId) {
  const dir = runDirFor(runId);
  const out = { results: [], status: null, spawns: [], runDir: dir, exists: false };
  try { out.exists = fs.existsSync(dir); } catch { out.exists = false; }
  if (!out.exists) return out;

  // results/*.json — the real per-leaf packet store (glm-fleet writes these).
  try {
    const resultsDir = path.join(dir, 'results');
    if (fs.existsSync(resultsDir)) {
      const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json'));
      for (const f of files) {
        try {
          const pkt = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8'));
          out.results.push({ file: f, ...pkt });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // status.json — parallel lane is adding this; tolerate absence.
  try {
    const statusPath = path.join(dir, 'status.json');
    if (fs.existsSync(statusPath)) out.status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch { /* best-effort */ }

  // spawns.jsonl — parallel lane is adding this; tolerate absence. One JSON object per line.
  try {
    const spawnsPath = path.join(dir, 'spawns.jsonl');
    if (fs.existsSync(spawnsPath)) {
      const lines = fs.readFileSync(spawnsPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try { out.spawns.push(JSON.parse(line)); } catch { /* skip bad line */ }
      }
    }
  } catch { /* best-effort */ }

  return out;
}

/**
 * Watch a run until it reaches a terminal state (status.json state ∈
 * finished|converged|failed|aborted) OR the result packet count stops growing
 * for `stallMs` OR `maxMs` elapses. Prints one-line progress updates to stdout.
 *
 * @param {string} runId
 * @param {object} [opts] { intervalMs?, maxMs?, stallMs?, out?: (s)=>void }
 * @returns {Promise<object>} final snapshot
 */
export async function watchRun(runId, opts = {}) {
  const intervalMs = Math.max(500, Number(opts.intervalMs || DEFAULT_WATCH_INTERVAL_MS));
  const maxMs = Math.max(intervalMs, Number(opts.maxMs || 2 * 60 * 60 * 1000)); // 2h ceiling
  const stallMs = Math.max(intervalMs, Number(opts.stallMs || 10 * 60 * 1000)); // 10min no-progress stall
  const out = typeof opts.out === 'function' ? opts.out : (s) => process.stdout.write(`${s}\n`);
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  const TERMINAL = new Set(['finished', 'converged', 'failed', 'aborted', 'complete', 'completed', 'done']);
  const start = Date.now();
  let lastResultCount = -1;
  let lastGrowth = Date.now();
  let snap;

  for (;;) {
    snap = snapshotRun(runId);
    const elapsed = Date.now() - start;

    if (!snap.exists) {
      out(`[watch] ${runId}: run dir not found yet (${Math.round(elapsed / 1000)}s) — waiting for dispatch to create .claude/jobs/${runId}/`);
    } else {
      const rcount = snap.results.length;
      const scount = snap.spawns.length;
      const state = snap.status?.state || snap.status?.status || '(no status.json yet)';
      const labels = snap.results
        .map((r) => r.resultLabel)
        .filter(Boolean)
        .slice(-3);
      out(`[watch] ${runId}: ${rcount} result(s), ${scount} spawn(s), state=${state} (${Math.round(elapsed / 1000)}s)${labels.length ? ` | recent: ${labels.join(', ')}` : ''}`);

      if (rcount > lastResultCount) { lastGrowth = Date.now(); lastResultCount = rcount; }
      if (snap.status && TERMINAL.has(String(snap.status.state || snap.status.status || '').toLowerCase())) {
        out(`[watch] ${runId}: terminal state (${state}) — stopping.`);
        break;
      }
      if (Date.now() - lastGrowth > stallMs) {
        out(`[watch] ${runId}: no new results for ${Math.round(stallMs / 1000)}s — stalled, stopping watch (run continues).`);
        break;
      }
    }

    if (elapsed > maxMs) {
      out(`[watch] ${runId}: maxMs ceiling (${Math.round(maxMs / 1000)}s) reached — stopping watch (run continues).`);
      break;
    }
    await sleep(intervalMs);
  }
  return snap;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

/**
 * Extract RESULT_LABELs from a runCompany result + watch snapshot.
 */
export function collectResultLabels(result = {}, snap = {}) {
  const labels = [];
  // From the swarm pool outputs (live run)
  const pool = result?.swarm?.poolOutputs || {};
  for (const v of Object.values(pool)) {
    if (v?.resultLabel) labels.push(v.resultLabel);
  }
  // From result packets on disk (watch snapshot)
  for (const r of snap?.results || []) {
    if (r?.resultLabel) labels.push(r.resultLabel);
  }
  return [...new Set(labels)];
}

/**
 * Render the CEO report: RESULT_LABELs, convergence verdict, artifact paths,
 * and a plain-language summary.
 */
export function renderReport(result = {}, snap = {}) {
  const lines = [];
  const plan = result?.plan || {};
  lines.push('=== CEO REPORT ===');
  lines.push('');

  // Cast
  if (Array.isArray(plan.casts) && plan.casts.length) {
    lines.push('ROLES CAST:');
    for (const c of plan.casts) {
      const t = c.target || {};
      lines.push(`  ${String(c.subtaskId).padEnd(16)} → ${String(c.role).padEnd(13)} ${t.substrate || '?'}/${t.lane || '?'}  [${c.ruling?.class || '?'}]`);
    }
    lines.push('');
  }

  // Substrates
  const s = plan.summary || {};
  lines.push(`SUBSTRATES: glm=${s.glm ?? 0}  native=${s.native ?? 0}  inline=${s.inline ?? 0}  held=${s.held ?? 0} (cleared: ${s.clearedHeld ?? 0})`);
  lines.push('');

  // Held rulings
  if (Array.isArray(result.held) && result.held.length) {
    lines.push('HELD (owner-gated — produce ruling + hold for one-token confirm):');
    for (const h of result.held) {
      lines.push(`  ${h.subtaskId} (${h.role}): ${String(h.reason || '').slice(0, 100)}`);
    }
    lines.push('');
  }

  // Convergence verdict
  if (result.swarm) {
    lines.push('CONVERGENCE:');
    lines.push(`  converged:    ${result.swarm.converged}`);
    lines.push(`  finalizeOk:   ${result.swarm.finalizeOk}`);
    lines.push(`  finalizeReason: ${result.swarm.finalizeReason || '(none)'}`);
    if (result.swarm.runId) lines.push(`  runId:        ${result.swarm.runId}`);
    lines.push('');
  }

  // RESULT_LABELs
  const labels = collectResultLabels(result, snap);
  if (labels.length) {
    lines.push('RESULT_LABELs:');
    for (const l of labels) lines.push(`  ${l}`);
    lines.push('');
  }

  // Artifact paths
  const runDir = result?.swarm?.runDir || (result?.swarm?.runId ? runDirFor(result.swarm.runId) : null);
  if (runDir) {
    lines.push('ARTIFACTS:');
    lines.push(`  run dir:        ${path.relative(REPO_ROOT, runDir) || runDir}`);
    lines.push(`  results:        ${path.relative(REPO_ROOT, path.join(runDir, 'results'))}/*.json`);
    if (snap?.status) lines.push(`  status.json:   ${path.relative(REPO_ROOT, path.join(runDir, 'status.json'))}`);
    if (snap?.spawns?.length) lines.push(`  spawns.jsonl:  ${path.relative(REPO_ROOT, path.join(runDir, 'spawns.jsonl'))}`);
    lines.push('');
  }

  // Plain-language CEO summary
  lines.push('CEO SUMMARY:');
  const spend = result.armed ? 'LIVE (armed)' : 'ZERO SPEND (dry-run)';
  lines.push(`  Posture: ${spend}.`);
  const total = (s.subtasks || 0);
  const cast = (s.cast || 0);
  lines.push(`  ${cast}/${total} subtasks cast to roles; ${s.held ?? 0} held for owner ruling.`);
  if (result.swarm) {
    lines.push(`  Swarm ${result.swarm.converged ? 'CONVERGED' : 'did NOT converge'}; finalize ${result.swarm.finalizeOk ? 'OK' : 'BLOCKED'} (${result.swarm.finalizeReason || '—'}).`);
  } else {
    lines.push('  No live swarm (plan-only). To execute: arm MURE then re-run without --dry-run.');
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export const CEO_RESULT_LABEL = '01CE_CEO_ENTRY_DISPATCH_';

function usage() {
  return [
    'MURE CEO — the single operator entry point.',
    '',
    'USAGE:',
    '  node _SYSTEM/mure/ceo.mjs "<free-text task>" [--dry-run] [--watch] [--report] [--json]',
    '  node _SYSTEM/mure/ceo.mjs --task-file <task.json>   [--dry-run] [--watch] [--report] [--json]',
    '',
    'FLAGS:',
    '  --dry-run      Plan only (zero spend). Also the automatic behavior when MURE is disarmed.',
    '  --watch        After dispatch, poll .claude/jobs/<runId>/ every 3s and print live progress.',
    '  --report       At end, print RESULT_LABELs, convergence verdict, artifact paths, CEO summary.',
    '  --json         Emit machine-readable JSON instead of human text.',
    '  --task-file F  Load a full task spec from JSON instead of building from free text.',
    '',
    'CEO never arms anything. Arming is owner-only (YURI_MURE_ARMED=1 or touch _SYSTEM/state/mure.enabled).',
  ].join('\n');
}

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const dryRun = flags.has('--dry-run');
  const watch = flags.has('--watch');
  const report = flags.has('--report');
  const json = flags.has('--json');
  const help = flags.has('--help') || flags.has('-h');

  if (help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  // Load task spec: either --task-file or free-text positional args.
  let taskSpec;
  let inferenceSource = 'none';
  const tfIdx = argv.indexOf('--task-file');
  if (tfIdx >= 0 && argv[tfIdx + 1]) {
    try {
      taskSpec = JSON.parse(fs.readFileSync(argv[tfIdx + 1], 'utf8'));
    } catch (e) {
      process.stderr.write(`ceo: bad --task-file: ${String(e?.message || e)}\n`);
      return 2;
    }
  } else {
    const positional = argv.filter((a) => !a.startsWith('--'));
    const freeText = positional.join(' ').trim();
    if (!freeText) {
      process.stderr.write(`${usage()}\n`);
      process.stderr.write('\nERROR: no task given. Pass free text or --task-file <json>.\n');
      return 2;
    }
    // Feature-detect deriveNeeds from company.mjs via dynamic import (parallel lane may have added it).
    let companyModule = null;
    try {
      companyModule = await import(pathToFileURL(path.join(HERE, 'company.mjs')).href);
    } catch {
      // company.mjs import failure is non-fatal for spec building; dispatch will fail later if truly broken.
    }
    const built = await buildTaskSpec(freeText, companyModule);
    taskSpec = built.task;
    inferenceSource = built.inferenceSource;
  }

  // Dispatch (or dry-run).
  let result;
  try {
    result = await dispatchAsCeo(taskSpec, { dryRun });
  } catch (e) {
    process.stderr.write(`ceo: dispatch failed: ${String(e?.message || e)}\n`);
    return 1;
  }

  // Determine the effective posture + runId for watch/report.
  const isDryRun = result.ceo?.dryRun || !result.armed;
  const runId = result?.swarm?.runId || null;

  // Watch (only meaningful for a live run; degrade gracefully if no runId).
  let snap = null;
  if (watch && runId && !isDryRun) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ event: 'watch-start', runId })}\n`);
    } else {
      process.stdout.write(`[watch] polling .claude/jobs/${runId}/ every 3s — Ctrl-C to stop.\n`);
    }
    snap = await watchRun(runId);
  } else if (watch) {
    if (!json) process.stdout.write('[watch] no live run to watch (dry-run or no swarm runId) — skipping.\n');
  }

  // Output.
  if (json) {
    process.stdout.write(`${JSON.stringify({
      resultLabel: CEO_RESULT_LABEL + (isDryRun ? 'P' : (result.swarm?.finalizeOk ? 'X' : 'P')) + '_PASS_COMMITTED',
      dryRun: isDryRun,
      mureArmed: result.ceo?.mureArmed,
      inferenceSource,
      plan: result.plan?.summary,
      casts: (result.plan?.casts || []).map((c) => ({
        subtask: c.subtaskId, role: c.role, substrate: c.target?.substrate, lane: c.target?.lane, class: c.ruling?.class,
      })),
      held: (result.held || []).map((h) => ({ subtask: h.subtaskId, role: h.role, reason: h.reason })),
      swarm: result.swarm ? {
        runId: result.swarm.runId, converged: result.swarm.converged, finalizeOk: result.swarm.finalizeOk,
      } : null,
      resultLabels: collectResultLabels(result, snap || {}),
    }, null, 2)}\n`);
  } else {
    renderHumanPlan(result, { inferenceSource, isDryRun, summary: taskSpec.summary });
  }

  if (report && !json) {
    process.stdout.write(`\n${renderReport(result, snap || {})}\n`);
  }

  return 0;
}

/** Render the human-readable plan (roles cast, substrates, held rulings). */
function renderHumanPlan(result, meta = {}) {
  const plan = result.plan || {};
  const s = plan.summary || {};
  const posture = meta.isDryRun ? 'DRY-RUN (zero spend)' : 'ARMED (live)';
  process.stdout.write(`\nMURE CEO — ${posture}\n`);
  if (meta.inferenceSource && meta.inferenceSource !== 'none') {
    process.stdout.write(`capability inference: ${meta.inferenceSource}\n`);
  }
  process.stdout.write(`\nspec: ${JSON.stringify(plan.name || result.name || 'MURE')} — ${s.subtasks || 0} subtask(s)\n`);
  process.stdout.write(`summary: ${String(meta.summary || taskSummary(result)).slice(0, 120)}\n\n`);

  process.stdout.write('CAST (subtask → role → substrate/lane → governance):\n');
  for (const c of (plan.casts || [])) {
    const t = c.target || {};
    process.stdout.write(`  ${String(c.subtaskId).padEnd(16)} → ${String(c.role).padEnd(13)} ${t.substrate || '?'}/${String(t.lane || '?').padEnd(9)} ${c.ruling?.class || '?'}\n`);
  }

  process.stdout.write(`\nSUBSTRATES: glm=${s.glm ?? 0}  native=${s.native ?? 0}  inline=${s.inline ?? 0}\n`);
  process.stdout.write(`HELD (owner-gated): ${(result.held || []).map((h) => `${h.subtaskId} (${h.role})`).join(', ') || '(none)'}\n`);

  if (result.swarm) {
    process.stdout.write(`\nSWARM: runId=${result.swarm.runId} converged=${result.swarm.converged} finalizeOk=${result.swarm.finalizeOk}\n`);
  } else {
    process.stdout.write('\nNo live swarm (plan-only). To execute: arm MURE (touch _SYSTEM/state/mure.enabled) then re-run without --dry-run.\n');
  }

  // Zero-spend guarantee line for dry-run.
  if (meta.isDryRun) {
    process.stdout.write('\nZERO SPEND — this was a plan only. No lanes were dispatched, no API calls made.\n');
  }
  process.stdout.write(`\n${CEO_RESULT_LABEL}${meta.isDryRun ? 'P' : (result.swarm?.finalizeOk ? 'X' : 'P')}_PASS_COMMITTED\n`);
}

function taskSummary(result) {
  // Best-effort: recover the operator intent from the intake subtask prompt, which embeds the summary.
  const intake = (result.plan?.casts || []).find((c) => c.subtaskId === 'intake');
  if (intake) {
    // The intake prompt is "Decode operator intent into a goal tree: <summary>" — strip the prefix.
    const p = String(intake.target?.prompt || intake.prompt || '');
    const idx = p.indexOf(': ');
    return idx >= 0 ? p.slice(idx + 2) : p;
  }
  // Fallback: first glm leaf prompt's TASK line.
  const leaf = (result.plan?.glmLeaves || [])[0];
  if (leaf?.prompt) {
    const m = String(leaf.prompt).match(/TASK:\s*(.+)/);
    if (m) return m[1];
  }
  return '';
}

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => { process.stderr.write(`ceo error: ${String(e?.message || e)}\n`); process.exit(1); });
}
