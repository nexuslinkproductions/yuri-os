#!/usr/bin/env node
/**
 * helmsman-run.mjs — Phase 3+ packet runner: dry-run all WS task files, optional GLM/Ollama parallel lanes.
 *
 * DISARMED by default for planCompany/runFleet. GLM/Ollama advisory lanes require explicit --glm or --ollama.
 *
 * Usage:
 *   node _SYSTEM/mure/helmsman-run.mjs --dry-run-all
 *   node _SYSTEM/mure/helmsman-run.mjs --task-file 02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json --ollama-sidecar
 *   node _SYSTEM/mure/helmsman-run.mjs --dry-run-all --out _SYSTEM/lane-output/phase3
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

const DEFAULT_WS_GLOB = [
  '02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-d-knowledge.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-f-router.json',
  '02_RESOURCES/TASKS/yuri-public-release-phase2-8.json',
];

function parseArgs(argv) {
  const out = { dryRunAll: false, ollamaSidecar: false, clineSidecar: false, outDir: join(REPO_ROOT, '_SYSTEM', 'lane-output', 'phase3'), taskFiles: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run-all') out.dryRunAll = true;
    else if (argv[i] === '--ollama-sidecar') out.ollamaSidecar = true;
    else if (argv[i] === '--cline-sidecar') out.clineSidecar = true;
    else if (argv[i] === '--out' && argv[i + 1]) { out.outDir = join(REPO_ROOT, argv[++i]); }
    else if (argv[i] === '--task-file' && argv[i + 1]) out.taskFiles.push(join(REPO_ROOT, argv[++i]));
  }
  if (out.dryRunAll && !out.taskFiles.length) out.taskFiles = DEFAULT_WS_GLOB.map((f) => join(REPO_ROOT, f));
  return out;
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', status: r.status ?? 1 };
}

/**
 * Visual-plan gate convention (Phase 5):
 * - Task JSON may carry visualPlanUrl (local slash path), visualPlanSlug (hosted recap id),
 *   visualPlanHostedUrl (full share URL), visualPlanApproved (owner sign-off), visualRecapUrl (local recap path).
 * - Required before multi-role UI dispatch when any trigger fires; satisfied by approval OR hosted slug/URL.
 */
const VISUAL_TAGS = new Set(['visual', 'dashboard', 'ui']);

export function checkVisualPlanGate(task = {}) {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const visualPlanUrl = task.visualPlanUrl || null;
  const visualPlanSlug = task.visualPlanSlug || null;
  const visualPlanHostedUrl = task.visualPlanHostedUrl || null;
  const visualRecapUrl = task.visualRecapUrl || null;

  const tagVisual = tags.some((t) => VISUAL_TAGS.has(String(t).toLowerCase()));
  const largeVisual = subtasks.length >= 4 && tagVisual;
  const required = task.requiresVisualPlan === true
    || Boolean(visualPlanUrl)
    || largeVisual;

  const satisfied = task.visualPlanApproved === true
    || Boolean(visualPlanSlug)
    || Boolean(visualPlanHostedUrl);

  let reason = 'not required';
  if (required && satisfied) reason = 'visual plan present';
  else if (required && !satisfied) {
    if (task.requiresVisualPlan === true) reason = 'requiresVisualPlan without approval or hosted slug';
    else if (visualPlanUrl) reason = 'visualPlanUrl set but no approval or hosted slug';
    else reason = 'large visual/dashboard/ui task without approval or hosted slug';
  }

  return { required, satisfied, reason, visualPlanUrl, visualPlanSlug, visualRecapUrl };
}

export async function helmsmanRun(opts = {}) {
  mkdirSync(opts.outDir, { recursive: true });
  const summary = { files: [], held: [], ollamaEligible: 0, visualPlanGates: [], errors: [] };

  for (const taskFile of opts.taskFiles) {
    const bn = basename(taskFile, '.json');
    const companyScript = join(REPO_ROOT, '_SYSTEM/mure/company.mjs');
    const fleetScript = join(REPO_ROOT, '_SYSTEM/Scripts/runFleet.mjs');
    const rel = taskFile.replace(`${REPO_ROOT}/`, '');

    const company = runNode(companyScript, ['--task-file', rel, '--dry-run']);
    const fleetArgs = ['--task-file', rel, '--dry-run'];
    if (opts.ollamaSidecar) fleetArgs.push('--ollama-sidecar');
    if (opts.clineSidecar) fleetArgs.push('--cline-sidecar');
    const fleet = runNode(fleetScript, fleetArgs);

    const companyPath = join(opts.outDir, `dryrun-${bn}.json`);
    const fleetPath = join(opts.outDir, `runfleet-${bn}.json`);
    writeFileSync(companyPath, company.stdout || company.stderr);
    writeFileSync(fleetPath, fleet.stdout || fleet.stderr);

    let parsed = {};
    try { parsed = JSON.parse(company.stdout); } catch { /* keep empty */ }

    let taskMeta = {};
    try { taskMeta = JSON.parse(readFileSync(taskFile, 'utf8')); } catch { /* keep empty */ }
    const gate = checkVisualPlanGate(taskMeta);
    if (gate.required) {
      summary.visualPlanGates.push({ file: rel, ...gate });
      if (!gate.satisfied) {
        summary.errors.push({ file: rel, step: 'visual-plan-gate', status: 'advisory' });
      }
    }

    summary.files.push({
      taskFile: rel,
      companyOut: companyPath.replace(`${REPO_ROOT}/`, ''),
      fleetOut: fleetPath.replace(`${REPO_ROOT}/`, ''),
      held: parsed.held?.length ?? 0,
      glm: parsed.summary?.glm ?? parsed.glmLeaves?.length ?? 0,
      native: parsed.summary?.native ?? parsed.nativeSpecs?.length ?? 0,
      visualPlanGate: gate,
    });
    for (const h of parsed.held ?? []) summary.held.push({ file: rel, ...h });
    if (!company.ok) summary.errors.push({ file: rel, step: 'company', status: company.status });
    if (!fleet.ok) summary.errors.push({ file: rel, step: 'runFleet', status: fleet.status });
  }

  writeFileSync(join(opts.outDir, 'helmsman-summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.taskFiles.length) {
    console.error('Usage: helmsman-run.mjs --dry-run-all [--ollama-sidecar] [--cline-sidecar] [--out dir]');
    console.error('       helmsman-run.mjs --task-file <json> [--ollama-sidecar] [--cline-sidecar]');
    process.exit(1);
  }
  helmsmanRun(opts).then((s) => {
    const hints = (s.visualPlanGates || []).map((g) => ({
      file: g.file,
      required: g.required,
      satisfied: g.satisfied,
      reason: g.reason,
      visualPlanSlug: g.visualPlanSlug,
      visualRecapUrl: g.visualRecapUrl,
    }));
    const out = hints.length ? { ...s, visualPlanGateHints: hints } : s;
    console.log(JSON.stringify(out, null, 2));
    const hardErrors = (s.errors || []).filter((e) => e.status !== 'advisory');
    process.exit(hardErrors.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
