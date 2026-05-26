#!/usr/bin/env node
/**
 * Dry-run-first governed autonomy runner.
 *
 * The runner builds a baseline-anchored manifest and can optionally emit Kagami
 * events. It does not mutate source or memory by default.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CONTEXT_ROUTER = path.join(SCRIPT_DIR, 'context-router.mjs');

export const AUTONOMY_RUN_SCHEMA = 'yuri.autonomy-run.v0';

export const AUTONOMY_LEVELS = Object.freeze([
  {
    level: 'L0_MANUAL',
    label: 'Manual',
    rank: 0,
    modes: ['manual', 'human'],
  },
  {
    level: 'L1_EVIDENCE_RUNNER',
    label: 'Evidence runner',
    rank: 1,
    modes: ['evidence-runner', 'evidence', 'dry-run', 'plan'],
  },
  {
    level: 'L2_RESEARCH_LOOP',
    label: 'Research loop',
    rank: 2,
    modes: ['research-loop', 'research', 'memory', 'truth', 'math', 'skill'],
  },
  {
    level: 'L3_CODE_AUTOPILOT',
    label: 'Code autopilot',
    rank: 3,
    modes: ['code-autopilot', 'code', 'edit', 'implementation', 'mutation'],
  },
  {
    level: 'L4_TIMED_RUN',
    label: 'Timed run',
    rank: 4,
    modes: ['timed-run', 'timed', 'timebox'],
  },
  {
    level: 'L5_SCHEDULED_AUTOMATION',
    label: 'Scheduled automation',
    rank: 5,
    modes: ['scheduled-automation', 'scheduled', 'launchd', 'cron', 'daemon'],
  },
]);

export const APPROVAL_BOUNDARIES = Object.freeze([
  'dry-run-only',
  'scoped-edits',
  'timed-run',
  'scheduled-run',
]);

const BASE_REQUIRED_GATES = Object.freeze([
  'context-router',
  'protected-path-check',
  'baseline-anchor',
  'lane-health-preflight',
  'kagami-event-spine',
  'scorecard',
  'evidence-manifest',
]);

const RESEARCH_GATES = Object.freeze([
  'source-freshness',
  'contradiction-detection',
  'memory-proposal-only',
  'truth-promotion-proof',
]);

const CODE_GATES = Object.freeze([
  'operator-approval',
  'rollback-contract',
  'gitnexus-impact-before-symbol-edits',
  'tests-before-handoff',
]);

const TIMED_GATES = Object.freeze([
  'timebox-contract',
  'intervention-log',
  'pause-resume-handoff',
]);

const SCHEDULED_GATES = Object.freeze([
  'scheduler-dry-run',
  'launchd-health',
  'operator-enable-switch',
]);

const PROTECTED_PATH_SIGNALS = Object.freeze([
  { needle: 'backend/data', label: 'backend-data', pattern: /backend\/data/i },
  { needle: '.claude/state', label: 'claude-state', pattern: /\.claude\/state/i },
  { needle: '.claude/history', label: 'claude-history', pattern: /\.claude\/history/i },
  { needle: '.claude/file-history', label: 'claude-file-history', pattern: /\.claude\/file-history/i },
  { needle: '.claude/projects', label: 'claude-projects', pattern: /\.claude\/projects/i },
  { needle: '.env', label: 'env-file', pattern: /(^|[^A-Za-z0-9_-])\.env($|[^A-Za-z0-9_-])/i },
  { needle: 'node_modules', label: 'node-modules', pattern: /node_modules/i },
  { needle: '.amp', label: 'amp-runtime', pattern: /\.amp(\/|$)/i },
]);

export function normalizeApprovalBoundary(value = 'dry-run-only') {
  const normalized = String(value || 'dry-run-only')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/\s+/g, '-');

  if (['dry-run', 'dryrun', 'plan-only', 'none', 'proposal-only'].includes(normalized)) {
    return 'dry-run-only';
  }
  if (['scoped-edit', 'scoped-edits', 'edit'].includes(normalized)) return 'scoped-edits';
  if (['timed', 'timed-run', 'timebox'].includes(normalized)) return 'timed-run';
  if (['scheduled', 'scheduled-run', 'scheduler'].includes(normalized)) return 'scheduled-run';
  if (APPROVAL_BOUNDARIES.includes(normalized)) return normalized;
  return 'dry-run-only';
}

export function approvalBoundaryWarning(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase().replaceAll('_', '-').replace(/\s+/g, '-');
  const knownAliases = new Set([
    'dry-run',
    'dryrun',
    'plan-only',
    'none',
    'proposal-only',
    'scoped-edit',
    'scoped-edits',
    'edit',
    'timed',
    'timed-run',
    'timebox',
    'scheduled',
    'scheduled-run',
    'scheduler',
    ...APPROVAL_BOUNDARIES,
  ]);
  return knownAliases.has(normalized)
    ? ''
    : `unknown approval boundary "${raw}" normalized to dry-run-only`;
}

export function classifyAutonomyLevel({ goal = '', requestedMode = '', mode = '' } = {}) {
  const requested = String(requestedMode || mode || '').trim().toLowerCase();
  const text = `${requested} ${goal}`.toLowerCase();

  const explicit = AUTONOMY_LEVELS.find((entry) => {
    return entry.modes.some((candidate) => requested === candidate || requested === entry.level.toLowerCase());
  });
  if (explicit) return { ...explicit, requestedMode: requested || explicit.modes[0] };

  if (includesAny(text, ['scheduled', 'launchd', 'cron', 'daemon'])) {
    return withRequested('L5_SCHEDULED_AUTOMATION', requested);
  }
  if (includesAny(text, ['timed', 'timebox', 'minutes', 'minimum of', 'for 15'])) {
    return withRequested('L4_TIMED_RUN', requested);
  }
  if (includesAny(text, ['research', 'memory', 'truth', 'math', 'skill', 'provenance', 'freshness'])) {
    return withRequested('L2_RESEARCH_LOOP', requested);
  }
  if (includesAny(text, ['code autopilot', 'edit', 'implement', 'wire', 'patch', 'mutation', 'commit'])) {
    return withRequested('L3_CODE_AUTOPILOT', requested);
  }
  return withRequested('L1_EVIDENCE_RUNNER', requested || 'evidence-runner');
}

export function buildAutonomyRunManifest(options = {}) {
  const goal = String(options.goal || '').trim();
  if (!goal) throw new Error('Autonomy run goal is required');
  const protectedPathMentions = detectProtectedPathMentions(goal);
  if (protectedPathMentions.length && !options.allowProtectedMentions) {
    throw new Error(`goal references protected paths: ${protectedPathMentions.map((entry) => entry.label).join(', ')}; acknowledge dry-run handling with allowProtectedMentions`);
  }

  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const createdAt = options.now || new Date().toISOString();
  const approvalBoundary = normalizeApprovalBoundary(options.approvalBoundary);
  const autonomy = classifyAutonomyLevel({
    goal,
    requestedMode: options.requestedMode || options.mode || '',
  });
  const runId = options.runId || buildRunId(goal, createdAt);
  const operatorApproved = Boolean(options.operatorApproved);
  const operatorSigned = Boolean(options.operatorSignature);
  const operatorApprovalRequired = autonomy.rank >= 3;
  const requestedMutationAllowed = autonomy.rank >= 3 && approvalBoundary !== 'dry-run-only';
  const mutationAllowed = requestedMutationAllowed && operatorApproved && operatorSigned;
  const contextRouter = runContextRouter(goal, repoRoot);
  const baselineAnchor = buildBaselineAnchor({
    goal,
    repoRoot,
    contextRouter,
    sourcePaths: options.sourcePaths,
  });
  const gates = buildGates({ autonomy, approvalBoundary, operatorApproved });

  return {
    schemaVersion: AUTONOMY_RUN_SCHEMA,
    runId,
    createdAt,
    goal,
    autonomy,
    approval: {
      boundary: approvalBoundary,
      operatorApproved,
      operatorApprovalRequired,
      requestedMutationAllowed,
      mutationAllowed,
      signature: {
        required: operatorApprovalRequired,
        status: operatorApprovalRequired
          ? (operatorSigned ? 'operator-signature-present' : 'operator-signature-required-before-mutation')
          : 'not-required',
        digest: operatorSigned ? hashText(options.operatorSignature) : null,
      },
      l2ToL3Gate: operatorApprovalRequired
        ? (operatorApproved && operatorSigned ? 'explicit-operator-approval-and-signature-present' : 'blocked-pending-explicit-operator-approval-or-signature')
        : 'not-required',
      source: options.approvalSource || 'operator-chat-or-cli',
      boundaryInputWarning: approvalBoundaryWarning(options.approvalBoundary),
    },
    baselineAnchor,
    gates,
    scorecard: buildScorecard({
      goal,
      autonomy,
      contextRouter,
      baselineAnchor,
      gates,
      protectedPathMentions,
    }),
    protectedPathPolicy: {
      protectedPathMentions,
      status: protectedPathMentions.length ? 'dry-run-acknowledged-no-protected-access' : 'clear',
    },
    scorecardCalibration: {
      status: 'heuristic-unvalidated',
      note: 'Scores are first-slice planning heuristics, not calibrated confidence or production approval.',
    },
    proposedEvents: buildProposedEvents(autonomy),
    decision: decideRun({
      autonomy,
      approvalBoundary,
      operatorApproved,
      operatorSigned,
      mutationAllowed,
      contextRouterOk: Boolean(contextRouter?.ok),
    }),
  };
}

export function validateAutonomyRunManifest(manifest = {}) {
  const errors = [];
  if (manifest.schemaVersion !== AUTONOMY_RUN_SCHEMA) errors.push('schemaVersion must be yuri.autonomy-run.v0');
  if (!manifest.runId) errors.push('runId is required');
  if (!manifest.goal) errors.push('goal is required');

  const autonomy = manifest.autonomy || {};
  if (!AUTONOMY_LEVELS.some((entry) => entry.level === autonomy.level)) {
    errors.push(`unknown autonomy level: ${autonomy.level || '<missing>'}`);
  }

  const approval = manifest.approval || {};
  if (!APPROVAL_BOUNDARIES.includes(approval.boundary)) {
    errors.push(`unknown approval boundary: ${approval.boundary || '<missing>'}`);
  }
  if (approval.boundary === 'dry-run-only' && approval.mutationAllowed) {
    errors.push('dry-run-only manifests cannot allow mutation');
  }
  if (Number(autonomy.rank || 0) >= 3 && approval.mutationAllowed && !approval.operatorApproved) {
    errors.push('L3+ mutation requires explicit operator approval');
  }
  if (Number(autonomy.rank || 0) >= 3 && approval.mutationAllowed && approval.signature?.status !== 'operator-signature-present') {
    errors.push('L3+ mutation requires explicit operator signature');
  }
  if (Number(autonomy.rank || 0) >= 3 && manifest.gates?.rollbackContract?.required !== true) {
    errors.push('L3+ manifests require rollback contract gate');
  }
  if (Number(autonomy.rank || 0) >= 3 && manifest.approval?.signature?.required !== true) {
    errors.push('L3+ manifests require an operator signature slot');
  }
  if (Number(autonomy.rank || 0) >= 3 && manifest.baselineAnchor?.contextRouter?.ok === false) {
    errors.push('L3+ manifests require successful context routing');
  }
  for (const entry of manifest.baselineAnchor?.sourceHashes || []) {
    if (isProtectedPath(entry.path)) errors.push(`source hash references protected path: ${entry.path}`);
  }

  return { ok: errors.length === 0, errors };
}

export function renderAutonomyRunMarkdown(manifest) {
  const validation = validateAutonomyRunManifest(manifest);
  return [
    `# YURI Autonomy Run ${manifest.runId}`,
    '',
    `Goal: ${manifest.goal}`,
    `Level: ${manifest.autonomy.level} (${manifest.autonomy.label})`,
    `Decision: ${manifest.decision}`,
    `Approval boundary: ${manifest.approval.boundary}`,
    `Mutation allowed: ${manifest.approval.mutationAllowed ? 'yes' : 'no'}`,
    `Validation: ${validation.ok ? 'pass' : 'fail'}`,
    '',
    '## Required Gates',
    ...manifest.gates.required.map((gate) => `- ${gate}`),
    '',
    '## Baseline Anchor',
    `- Git HEAD: ${manifest.baselineAnchor.git.head || 'unknown'}`,
    `- Dirty files: ${manifest.baselineAnchor.git.dirtyFileCount}`,
    `- Context packet: ${manifest.baselineAnchor.contextRouter.selectedPacket?.id || 'unknown'}`,
    '',
    '## Scorecard',
    ...Object.entries(manifest.scorecard).map(([key, value]) => {
      if (value && typeof value === 'object' && 'score' in value) {
        return `- ${key}: ${value.score} (${value.note})`;
      }
      return `- ${key}: ${value}`;
    }),
    validation.ok ? '' : '',
    ...validation.errors.map((error) => `- validation_error: ${error}`),
  ].join('\n');
}

export function emitAutonomyRunEvents(manifest, options = {}) {
  const validation = validateAutonomyRunManifest(manifest);
  if (!validation.ok) {
    throw new Error(`cannot emit Kagami events for invalid autonomy manifest: ${validation.errors.join('; ')}`);
  }

  const root = options.eventRoot;
  const common = {
    session: manifest.runId,
    goalId: manifest.runId,
    lane: 'codex-main',
    evidenceRefs: [
      '_SYSTEM/Scripts/yuri-autonomy-runner.mjs',
      '_SYSTEM/docs/YURI_GOVERNED_AUTONOMY_SPRINT_PLAN_2026-05-26.md',
    ],
  };

  const events = [];
  events.push(appendKagamiEvent('INTAKE_RECORDED', {
    ...common,
    goal: redactProtectedMentions(manifest.goal),
    autonomyLevel: manifest.autonomy.level,
  }, { root }));
  events.push(appendKagamiEvent('GOAL_BOUND', {
    ...common,
    approvalBoundary: manifest.approval.boundary,
    decision: manifest.decision,
  }, { root }));
  events.push(appendKagamiEvent('LANE_HEALTH_PREFLIGHT', {
    ...common,
    status: 'required-not-run',
    note: 'Manifest records lane health as a gate; live lane probes are not part of dry-run planning.',
  }, { root }));
  events.push(appendKagamiEvent('CONTEXT_PACKET_BUILT', {
    ...common,
    selectedPacket: manifest.baselineAnchor.contextRouter.selectedPacket?.id || null,
  }, { root }));
  events.push(appendKagamiEvent('ROUTE_DECISION_RECORDED', {
    ...common,
    routeClass: 'governed-autonomy',
    mode: manifest.autonomy.requestedMode,
    decision: manifest.decision,
    blocked: manifest.decision.includes('blocked'),
    reason: manifest.gates.required.join(','),
  }, { root }));
  if (manifest.approval.operatorApprovalRequired) {
    events.push(appendKagamiEvent('AUTHORIZATION_REQUIRED', {
      ...common,
      reason: manifest.approval.l2ToL3Gate,
      approvalBoundary: manifest.approval.boundary,
    }, { root }));
  }
  return events;
}

export function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.command !== 'plan') {
    stderr.write('Usage: yuri-autonomy-runner.mjs plan --goal <goal> [--mode <mode>] [--approval-boundary <boundary>] [--json|--markdown] [--emit-events] [--event-root <path>]\n');
    return 64;
  }

  try {
    const manifest = buildAutonomyRunManifest(parsed);
    if (manifest.approval.boundaryInputWarning) {
      stderr.write(`[approval-boundary] ${manifest.approval.boundaryInputWarning}\n`);
    }
    if (parsed.emitEvents) {
      manifest.emittedEvents = emitAutonomyRunEvents(manifest, { eventRoot: parsed.eventRoot })
        .map((event) => ({ id: event.id, kind: event.kind, ts: event.ts }));
    }
    const validation = validateAutonomyRunManifest(manifest);
    if (parsed.output === 'markdown') {
      stdout.write(`${renderAutonomyRunMarkdown(manifest)}\n`);
    } else {
      stdout.write(`${JSON.stringify({ manifest, validation }, null, 2)}\n`);
    }
    return validation.ok ? 0 : 2;
  } catch (err) {
    stderr.write(`[yuri-autonomy-runner] ${err.message || String(err)}\n`);
    return 2;
  }
}

function buildRunId(goal, createdAt) {
  const stamp = String(createdAt).replace(/[^0-9TZ]/g, '').slice(0, 16) || 'run';
  return `auto_${stamp}_${hashText(goal).slice(0, 10)}`;
}

function withRequested(level, requestedMode) {
  const entry = AUTONOMY_LEVELS.find((candidate) => candidate.level === level);
  return { ...entry, requestedMode: requestedMode || entry.modes[0] };
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function runContextRouter(goal, repoRoot) {
  const result = spawnSync(process.execPath, [CONTEXT_ROUTER, goal], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: result.error?.message || result.stderr || `context-router exited ${result.status}`,
    };
  }
  try {
    return { ok: true, ...JSON.parse(result.stdout) };
  } catch (err) {
    return { ok: false, error: `context-router JSON parse failed: ${err.message}` };
  }
}

function buildBaselineAnchor({ goal, repoRoot, contextRouter, sourcePaths }) {
  const selectedPaths = contextRouter?.selectedPacket?.paths
    ?.map((entry) => entry.path)
    .filter(Boolean) || [];
  const defaultSourcePaths = [
    '_SYSTEM/Scripts/yuri-autonomy-runner.mjs',
    '_SYSTEM/config/schemas/yuri.autonomy-run.v0.schema.json',
    '_SYSTEM/context/context-registry.json',
    '_SYSTEM/config/artifact-registry.json',
    ...selectedPaths,
  ];
  const uniqueSourcePaths = [...new Set(sourcePaths || defaultSourcePaths)];

  return {
    repoRoot,
    protectedPathsChecked: true,
    contextRouter,
    git: gitBaseline(repoRoot),
    sourceHashes: hashExistingRepoFiles(uniqueSourcePaths, repoRoot),
    goalHash: hashText(goal),
  };
}

function gitBaseline(repoRoot) {
  const head = runGit(['rev-parse', '--short', 'HEAD'], repoRoot);
  const status = runGit(['status', '--short'], repoRoot);
  const dirtyFiles = status
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3).trim(),
    }));
  return {
    head: head.trim(),
    dirtyFileCount: dirtyFiles.length,
    dirtyFiles,
  };
}

function runGit(args, repoRoot) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function hashExistingRepoFiles(paths, repoRoot) {
  const rows = [];
  for (const relPath of paths) {
    if (!relPath || isProtectedPath(relPath)) continue;
    const fullPath = path.resolve(repoRoot, relPath);
    if (!isInside(repoRoot, fullPath) || !existsSync(fullPath)) continue;
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    const content = readFileSync(fullPath);
    rows.push({
      path: relPath,
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: stats.size,
    });
  }
  return rows;
}

function buildGates({ autonomy, approvalBoundary, operatorApproved }) {
  const required = [...BASE_REQUIRED_GATES];
  if (autonomy.rank >= 2) required.push(...RESEARCH_GATES);
  if (autonomy.rank >= 3) required.push(...CODE_GATES);
  if (autonomy.rank >= 4) required.push(...TIMED_GATES);
  if (autonomy.rank >= 5) required.push(...SCHEDULED_GATES);

  return {
    required: [...new Set(required)],
    sourceFreshness: {
      required: autonomy.rank >= 2,
      status: autonomy.rank >= 2 ? 'required-before-promotion' : 'not-required-for-l1',
    },
    contradictionDetection: {
      required: autonomy.rank >= 2,
      status: autonomy.rank >= 2 ? 'required-before-promotion' : 'not-required-for-l1',
    },
    rollbackContract: {
      required: autonomy.rank >= 3,
      status: autonomy.rank >= 3 ? 'required-before-mutation' : 'not-required-for-non-mutating-run',
    },
    authorization: {
      required: autonomy.rank >= 3,
      status: autonomy.rank >= 3 && !operatorApproved
        ? 'blocked-pending-explicit-operator-approval'
        : 'satisfied-or-not-required',
      boundary: approvalBoundary,
    },
  };
}

function buildScorecard({ goal, autonomy, contextRouter, baselineAnchor, gates, protectedPathMentions = [] }) {
  const selectedPacket = contextRouter?.selectedPacket?.id || '';
  return {
    taskClarity: scored(goal.length >= 20 ? 0.82 : 0.45, goal.length >= 20 ? 'goal is specific enough for planning' : 'goal is short'),
    contextPrecision: scored(selectedPacket && selectedPacket !== 'baseline' ? 0.82 : 0.55, selectedPacket ? `selected ${selectedPacket}` : 'no selected packet'),
    laneHealth: scored(0.5, 'preflight required; live probes not run by dry-run builder'),
    proofCoverage: scored(autonomy.rank <= 1 ? 0.35 : 0.25, 'manifest proves routing and gates, not task outcome'),
    contradictionRisk: scored(gates.contradictionDetection.required ? 0.45 : 0.65, gates.contradictionDetection.status),
    protectedPathRisk: scored(protectedPathMentions.length ? 0.15 : 0.95, protectedPathMentions.length ? `goal names protected path labels: ${protectedPathMentions.map((entry) => entry.label).join(', ')}` : 'no protected path signals in goal'),
    rollbackReadiness: scored(gates.rollbackContract.required ? 0.35 : 0.9, gates.rollbackContract.status),
    elapsedAutonomousTimeMinutes: 0,
    interventionCount: 0,
    dirtyFileCount: baselineAnchor.git.dirtyFileCount,
  };
}

export function detectProtectedPathMentions(text = '') {
  const haystack = String(text || '').toLowerCase();
  return PROTECTED_PATH_SIGNALS.filter((entry) => entry.pattern.test(haystack));
}

export function redactProtectedMentions(text = '') {
  let redacted = String(text || '');
  for (const entry of PROTECTED_PATH_SIGNALS) {
    redacted = redacted.replace(globalizeRegex(entry.pattern), (match) => {
      if (entry.label === 'env-file') {
        return match.replace(/\.env/gi, `[protected:${entry.label}]`);
      }
      return `[protected:${entry.label}]`;
    });
  }
  return redacted;
}

function buildProposedEvents(autonomy) {
  const events = [
    'INTAKE_RECORDED',
    'GOAL_BOUND',
    'LANE_HEALTH_PREFLIGHT',
    'CONTEXT_PACKET_BUILT',
    'ROUTE_DECISION_RECORDED',
  ];
  if (autonomy.rank >= 3) events.push('AUTHORIZATION_REQUIRED');
  return events;
}

function decideRun({ autonomy, approvalBoundary, operatorApproved, operatorSigned, mutationAllowed, contextRouterOk = true }) {
  if (autonomy.rank >= 3 && !contextRouterOk) return 'blocked_context_router_failure';
  if (autonomy.rank >= 3 && !operatorApproved) return 'blocked_pending_operator_approval';
  if (autonomy.rank >= 3 && !operatorSigned) return 'blocked_pending_operator_signature';
  if (approvalBoundary === 'dry-run-only') return 'dry_run_manifest';
  if (mutationAllowed) return 'approved_scoped_run_manifest';
  return 'approval_scaffold_only';
}

function scored(score, note) {
  return { score: Number(score.toFixed(2)), note };
}

function hashText(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function globalizeRegex(pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    command: args.shift() || 'plan',
    output: 'json',
    approvalBoundary: 'dry-run-only',
    emitEvents: false,
    operatorApproved: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--goal') parsed.goal = args[++i] || '';
    else if (arg === '--mode' || arg === '--requested-mode') parsed.requestedMode = args[++i] || '';
    else if (arg === '--approval-boundary') parsed.approvalBoundary = args[++i] || '';
    else if (arg === '--event-root') parsed.eventRoot = args[++i] || '';
    else if (arg === '--run-id') parsed.runId = args[++i] || '';
    else if (arg === '--now') parsed.now = args[++i] || '';
    else if (arg === '--json') parsed.output = 'json';
    else if (arg === '--markdown') parsed.output = 'markdown';
    else if (arg === '--emit-events') parsed.emitEvents = true;
    else if (arg === '--operator-approved') parsed.operatorApproved = true;
    else if (arg === '--operator-signature') parsed.operatorSignature = args[++i] || '';
    else if (arg === '--allow-protected-mentions') parsed.allowProtectedMentions = true;
    else if (!parsed.goal) parsed.goal = arg;
  }

  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
