#!/usr/bin/env node

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEMO_STYLE_RAILS, isProtectedPath, safeRuntimePath } from './lane-kernel.mjs';
import { recallEntries } from './memory-kernel.mjs';
import { YURI_RAILS_CONFIG } from '../kagami/yuri-rails-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIOLATION_LOG = path.join(__dirname, '..', 'state', 'guardrail-violations.jsonl');

export const RAIL_SEVERITY = Object.freeze({
  allow: 'allow',
  warn: 'warn',
  block: 'block',
});

const BLOCKED_COMMAND_PATTERNS = Object.freeze([
  { id: 'git-push', pattern: /\bgit\s+push\b/i },
  { id: 'git-add', pattern: /\bgit\s+add\b/i },
  { id: 'git-commit', pattern: /\bgit\s+commit\b/i },
  { id: 'git-reset-hard', pattern: /\bgit\s+reset\s+--hard\b/i },
  { id: 'git-clean', pattern: /\bgit\s+clean\b/i },
  { id: 'force-remove', pattern: /\brm\s+-[^\n]*r[^\n]*f|\brm\s+-[^\n]*f[^\n]*r/i },
  { id: 'sudo', pattern: /\bsudo\b/i },
  { id: 'launchctl-unload', pattern: /\blaunchctl\s+(?:unload|remove|bootout)\b/i },
]);

const SHELL_BLOCK_RE = /```(?:bash|sh|shell)\s*([\s\S]*?)```/gi;
const SHELL_LINE_RE = /(^|\n)\s*(?:[$>]\s+)([^\n]+)/g;
const LANE_MENTION_RE = /(^|\s)(@[a-z0-9_.:-]+)/gi;

function normalizeText(value) {
  return String(value ?? '');
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function severityForReasons(reasons) {
  if (reasons.some((reason) => reason.severity === RAIL_SEVERITY.block)) return RAIL_SEVERITY.block;
  if (reasons.some((reason) => reason.severity === RAIL_SEVERITY.warn)) return RAIL_SEVERITY.warn;
  return RAIL_SEVERITY.allow;
}

function resultFor({ rail, reasons = [], evidence = {} }) {
  const severity = severityForReasons(reasons);
  return {
    ok: severity !== RAIL_SEVERITY.block,
    rail,
    severity,
    reasons: reasons.map((reason) => reason.message || String(reason)),
    evidence,
  };
}

function pathCandidatesFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(pathCandidatesFrom);
  if (typeof value === 'object') {
    return [
      ...pathCandidatesFrom(value.path),
      ...pathCandidatesFrom(value.paths),
      ...pathCandidatesFrom(value.file),
      ...pathCandidatesFrom(value.files),
      ...pathCandidatesFrom(value.target),
      ...pathCandidatesFrom(value.targets),
      ...pathCandidatesFrom(value.cwd),
    ];
  }
  return [String(value)];
}

export function detectShellBlocks(input) {
  const text = normalizeText(input);
  const blocks = [];
  for (const match of text.matchAll(SHELL_BLOCK_RE)) {
    const command = match[1].trim();
    if (command) blocks.push(command);
  }
  for (const match of text.matchAll(SHELL_LINE_RE)) {
    const command = match[2].trim();
    if (command) blocks.push(command);
  }
  return uniq(blocks);
}

export function detectLaneMentions(input) {
  const text = normalizeText(input);
  const mentions = [];
  for (const match of text.matchAll(LANE_MENTION_RE)) {
    mentions.push(match[2]);
  }
  return uniq(mentions);
}

export function evaluateInputRails(input, context = {}) {
  const text = normalizeText(input).trim();
  const slashCommand = text.match(/^\/[a-z][a-z0-9_-]*(?=\s|$)/i)?.[0] || null;
  const laneMentions = detectLaneMentions(text);
  const shellBlocks = detectShellBlocks(text);
  const source = context.source || 'user';
  const reasons = [];

  if (!text) reasons.push({ severity: RAIL_SEVERITY.block, message: 'empty input' });
  if (slashCommand && !isKnownSlashCommand(slashCommand, context)) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: `unknown slash command: ${slashCommand}` });
  }
  for (const mention of laneMentions) {
    if (!isKnownLaneMention(mention, context)) {
      reasons.push({ severity: RAIL_SEVERITY.warn, message: `unknown lane mention: ${mention}` });
    }
  }
  if (shellBlocks.length && source === 'user') {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: 'user shell block treated as prompt text; not auto-executed' });
  } else if (shellBlocks.length && context.noexec === true) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: 'shell block detected while noexec is active' });
  }

  return resultFor({
    rail: 'input',
    reasons,
    evidence: {
      slashCommand,
      laneMentions,
      shellBlocks,
      noexec: Boolean(context.noexec),
      source,
      autoExecutableShellBlocks: shellBlocks.length > 0 && source !== 'user' && context.noexec !== true,
    },
  });
}

export function evaluateRetrievalRails(request = {}, context = {}) {
  const candidates = pathCandidatesFrom(request);
  const protectedPaths = candidates.filter((candidate) => isProtectedPath(candidate));
  const reasons = protectedPaths.map((candidate) => ({
    severity: RAIL_SEVERITY.block,
    message: `protected retrieval path denied: ${candidate}`,
  }));
  const query = request.query || request.memoryQuery || context.query || '';
  const memoryRecall = query && protectedPaths.length === 0 && context.memoryRecall !== false
    ? recallEntries(query, {
      scope: request.scope || context.scope,
      maxEntries: request.maxEntries || context.maxEntries || 5,
    })
    : null;

  return resultFor({
    rail: 'retrieval',
    reasons,
    evidence: {
      checkedPaths: candidates,
      protectedPaths,
      memoryRecall,
      source: context.source || request.source || null,
    },
  });
}

export function evaluateExecutionRails(action = {}, context = {}) {
  const subRailResults = NEMO_STYLE_RAILS.execution.map((rail) => evaluateExecutionSubRail(rail, action, context));
  const reasons = subRailResults.flatMap((result) =>
    result.reasons.map((message) => ({ severity: result.severity, message })),
  );
  const base = resultFor({
    rail: 'execution',
    reasons,
    evidence: {
      subRailResults,
    },
  });
  return {
    ...base,
    evidence: {
      ...base.evidence,
      ...subRailResults.find((result) => result.rail === 'tool-policy-enforcement')?.evidence,
    },
  };
}

function evaluateExecutionSubRail(rail, action = {}, context = {}) {
  switch (rail) {
    case 'health-preflight':
      return evaluateHealthPreflightSubRail(action, context);
    case 'timeout-caps':
      return evaluateTimeoutCapsSubRail(action, context);
    case 'tool-policy-enforcement':
      return evaluateToolPolicyEnforcementSubRail(action, context);
    case 'no-auto-commit-or-push':
      return evaluateNoAutoCommitOrPushSubRail(action);
    default:
      return resultFor({
        rail,
        reasons: [{ severity: RAIL_SEVERITY.warn, message: `unknown execution sub-rail: ${rail}` }],
      });
  }
}

function evaluateHealthPreflightSubRail(action = {}, context = {}) {
  const healthProbe = action.healthProbe || context.healthProbe || null;
  const reasons = [];
  if (context.requireHealthPreflight === true && !healthProbe) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'missing health preflight evidence' });
  }
  if (healthProbe && healthProbe.ok === false) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `health preflight failed: ${healthProbe.reason || healthProbe.error || healthProbe.status || 'unknown'}` });
  }
  return resultFor({
    rail: 'health-preflight',
    reasons,
    evidence: { healthProbe },
  });
}

function evaluateTimeoutCapsSubRail(action = {}, context = {}) {
  const timeoutMs = Number(action.timeoutMs || action.timeout || context.timeoutMs || 0);
  const maxTimeoutMs = Number(context.maxTimeoutMs || YURI_RAILS_CONFIG.execution.maxTimeoutMs || 60_000);
  const reasons = [];
  if (timeoutMs > maxTimeoutMs) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `execution timeout cap exceeded: ${timeoutMs} > ${maxTimeoutMs}` });
  }
  return resultFor({
    rail: 'timeout-caps',
    reasons,
    evidence: { timeoutMs, maxTimeoutMs },
  });
}

function evaluateToolPolicyEnforcementSubRail(action = {}, context = {}) {
  const command = normalizeText(action.command || action.cmd || action.shell || '');
  const kind = action.kind || (command ? 'shell' : 'action');
  const candidates = uniq([...pathCandidatesFrom(action), ...detectPathLikeTokens(command)]);
  const protectedPaths = candidates.filter((candidate) => isProtectedPath(candidate));
  const reasons = [];

  if (kind === 'shell' && context.noexec === true) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'shell execution denied by noexec' });
  }
  for (const entry of BLOCKED_COMMAND_PATTERNS) {
    if (entry.pattern.test(command)) {
      reasons.push({ severity: RAIL_SEVERITY.block, message: `dangerous command denied: ${entry.id}` });
    }
  }
  for (const candidate of protectedPaths) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `protected execution path denied: ${candidate}` });
  }
  return resultFor({
    rail: 'tool-policy-enforcement',
    reasons,
    evidence: {
      kind,
      command,
      checkedPaths: candidates,
      protectedPaths,
      noexec: Boolean(context.noexec),
    },
  });
}

function evaluateNoAutoCommitOrPushSubRail(action = {}) {
  const reasons = [];
  if (action.autoCommit === true) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'automatic commit denied' });
  }
  if (action.autoPush === true) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'automatic push denied' });
  }
  return resultFor({
    rail: 'no-auto-commit-or-push',
    reasons,
    evidence: {
      autoCommit: Boolean(action.autoCommit),
      autoPush: Boolean(action.autoPush),
    },
  });
}

export function evaluateToolInputRails(input = {}, context = {}) {
  const retrieval = evaluateRetrievalRails(input, { ...context, source: 'tool-input' });
  const execution = evaluateExecutionRails(input, context);
  const reasons = [
    ...retrieval.reasons.map((message) => ({ severity: retrieval.severity, message })),
    ...execution.reasons.map((message) => ({ severity: execution.severity, message })),
  ];
  return resultFor({
    rail: 'tool-input',
    reasons,
    evidence: {
      retrieval: retrieval.evidence,
      execution: execution.evidence,
    },
  });
}

export function evaluateOutputRails(output = '', context = {}) {
  const text = normalizeText(output);
  const cap = Number(context.maxOutputChars || YURI_RAILS_CONFIG.output.maxChars || 64 * 1024);
  const requiredEvidenceIds = Array.isArray(context.requiredEvidenceIds) ? context.requiredEvidenceIds : [];
  const evidenceSources = evidenceSourcesFromContext(context);
  const evidenceSourceIds = new Set(evidenceSources.map((entry) => String(entry.id || entry)));
  const missingEvidenceIds = requiredEvidenceIds.filter((id) => !evidenceSourceIds.has(id));
  const reasons = [];
  if (text.length > cap) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: `output exceeds cap: ${text.length} > ${cap}` });
  }
  if (context.requireEvidence === true && looksLikeRepoTruthClaim(text) && !context.evidence) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: 'repo truth claim requires local evidence' });
  }
  for (const id of missingEvidenceIds) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `required output evidence missing: ${id}` });
  }
  return resultFor({
    rail: 'output',
    reasons,
    evidence: {
      length: text.length,
      cap,
      truncated: text.length > cap,
      ansiSafe: !/\x1b\][^\x07]*(?:\x07|\x1b\\)/.test(text),
      evidenceMissing: context.requireEvidence === true && looksLikeRepoTruthClaim(text) && !context.evidence,
      evidenceSourceIds: [...evidenceSourceIds],
      missingEvidenceIds,
    },
  });
}

export function enforceOutputRails(output = '', context = {}) {
  const text = normalizeText(output);
  const result = evaluateOutputRails(text, context);
  const cap = result.evidence.cap;
  const pieces = [];
  if (result.evidence.evidenceMissing) pieces.push(YURI_RAILS_CONFIG.output.evidenceMarker);
  if (text.length > cap) {
    pieces.push(`${YURI_RAILS_CONFIG.output.truncationMarker} ${text.length} > ${cap}`);
    pieces.push(text.slice(0, cap));
  } else {
    pieces.push(text);
  }
  return {
    ...result,
    text: pieces.filter(Boolean).join('\n'),
  };
}

export function classifyRailTaskTier(task = '') {
  const text = String(task || '').toLowerCase();
  if (/(critical|supercharge|forensic|production|release|guardrail|control plane|shintai|harness|automation|memory|backend)/.test(text)) return 'critical';
  if (/(refactor|architecture|audit|multi-file|offload|lane|browser-harness|integration)/.test(text)) return 'complex';
  if (/(typo|one file|single file|quick|small)/.test(text)) return 'trivial';
  return 'standard';
}

export function evaluateDialogRails(dialog = {}, context = {}) {
  const task = dialog.task || context.task || '';
  const tier = dialog.tier || classifyRailTaskTier(task);
  const members = dialog.members || dialog.team || [];
  const cap = Number(context.maxMembers || YURI_RAILS_CONFIG.dialog.tierMemberCaps[tier] || 3);
  const memberIds = members.map((member) => String(member.id || member.lane || member || ''));
  const reasons = [];
  if (memberIds.some((id) => /(?:^|-)spark|codex-spark/i.test(id))) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'Spark member forbidden in Shintai assembly' });
  }
  if (memberIds.length > cap) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `team size exceeds ${tier} cap: ${memberIds.length} > ${cap}` });
  }
  return resultFor({
    rail: 'dialog',
    reasons,
    evidence: {
      task,
      tier,
      cap,
      memberIds,
    },
  });
}

export function evaluateToolOutputRails(output = '', context = {}) {
  const result = evaluateOutputRails(output, context);
  return {
    ...result,
    rail: 'tool-output',
  };
}

export function evaluateHealthRails(targets = [], context = {}) {
  const entries = Array.isArray(targets) ? targets : Object.values(targets || {});
  const required = new Set(context.required || []);
  const reasons = [];
  const failed = [];
  for (const target of entries) {
    const id = target.id || target.lane || target.worker || 'unknown';
    const isRequired = required.size === 0 || required.has(id) || required.has(target.lane);
    if (!target.ok && isRequired) {
      failed.push(id);
      reasons.push({ severity: RAIL_SEVERITY.block, message: `required health target failed: ${id}` });
    } else if (!target.ok) {
      failed.push(id);
      reasons.push({ severity: RAIL_SEVERITY.warn, message: `optional health target failed: ${id}` });
    }
  }
  return resultFor({
    rail: 'health',
    reasons,
    evidence: {
      checked: entries.length,
      failed,
      required: [...required],
    },
  });
}

export function evaluateNeurodivergenceRails(input = {}, context = {}) {
  const text = typeof input === 'string'
    ? input
    : [
        input.task,
        input.prompt,
        input.goal,
        input.context,
        context.task,
      ].filter(Boolean).join('\n');
  const lowered = normalizeText(text).toLowerCase();
  const activations = [];

  if (/(critical|supercharge|forensic|production|deep|architecture|audit)/.test(lowered)) {
    activations.push({
      id: 'monotropic-depth',
      behavior: 'hold one thread deeply, make the mechanism map explicit, then exit into verification',
    });
  }
  if (/(brain dump|messy|chaos|all over|scattered|clusterfuck|too much|everything)/.test(lowered)) {
    activations.push({
      id: 'pattern-first-decode',
      behavior: 'cluster the input before asking questions; expose intent map and priority order',
    });
  }
  if (/(parallel|many|all phases|shintai|council|fan[- ]?out|duos|squad)/.test(lowered)) {
    activations.push({
      id: 'adhd-burst-batching',
      behavior: 'batch independent work into visible lanes with checkpoints instead of serial trickle',
    });
  }
  if (/(memory|rag|recall|skill|preference|remember|forgot|repeat|correction|again)/.test(lowered)) {
    activations.push({
      id: 'durable-correction-capture',
      behavior: 'convert repeated correction into reviewable memory or rail update, not a one-off apology',
    });
  }
  if (/(design|visual|presentation|motion|layout|screen|macbook|monitor)/.test(lowered)) {
    activations.push({
      id: 'visual-salience',
      behavior: 'externalize visual checks with screenshots or browser inspection; avoid text-only claims',
    });
  }

  const active = activations.length > 0 || context.force === true;
  const fallback = active ? [] : [{
    id: 'baseline-cognitive-workflow',
    behavior: 'decode intent, separate evidence from inference, choose execute/verify/ask/block',
  }];

  return resultFor({
    rail: 'neurodivergence',
    reasons: [],
    evidence: {
      active,
      activations: active ? activations : fallback,
      sourceDocs: [
        'SOUL.md',
        '_SYSTEM/HANDOFF-musubi-intelligence-sprint-v2.md',
      ],
    },
  });
}

export function evaluateRails(kind, payload, context = {}) {
  switch (kind) {
    case 'input':
      return evaluateInputRails(payload, context);
    case 'retrieval':
      return evaluateRetrievalRails(payload, context);
    case 'execution':
      return evaluateExecutionRails(payload, context);
    case 'dialog':
      return evaluateDialogRails(payload, context);
    case 'tool-input':
      return evaluateToolInputRails(payload, context);
    case 'output':
      return evaluateOutputRails(payload, context);
    case 'tool-output':
      return evaluateToolOutputRails(payload, context);
    case 'health':
      return evaluateHealthRails(payload, context);
    case 'neurodivergence':
      return evaluateNeurodivergenceRails(payload, context);
    default:
      return resultFor({
        rail: String(kind || 'unknown'),
        reasons: [{ severity: RAIL_SEVERITY.block, message: `unknown rail: ${kind}` }],
      });
  }
}

export function writeRailViolation(result, options = {}) {
  if (!result || result.severity === RAIL_SEVERITY.allow) return { ok: true, skipped: true };
  const logPath = safeRuntimePath(
    'YURI_GUARDRAIL_VIOLATION_LOG',
    options.logPath || DEFAULT_VIOLATION_LOG,
  );
  if (!logPath) return { ok: false, error: 'violation log path is protected' };
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({
    ts: new Date().toISOString(),
    rail: result.rail,
    severity: result.severity,
    reasons: result.reasons,
    evidence: result.evidence,
  })}\n`);
  return { ok: true, path: logPath };
}

function detectPathLikeTokens(command) {
  const text = normalizeText(command);
  if (!text) return [];
  const matches = text.match(/(?:^|\s)([./~]?[A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.+-]+)+|[A-Za-z0-9_@.-]+\/[A-Za-z0-9_@.+-]+)/g);
  const simpleProtected = text.match(/(?:^|\s)(\.env|\.amp(?:\/[^\s;&|]+)?)(?=\s|$|[;&|])/g);
  return [
    ...(matches || []).map((entry) => entry.trim()),
    ...(simpleProtected || []).map((entry) => entry.trim()),
  ];
}

function looksLikeRepoTruthClaim(text) {
  return /\b(?:all tests pass|tests pass|fixed|implemented|verified|repo is clean|clean worktree|no drift)\b/i.test(text);
}

function evidenceSourcesFromContext(context = {}) {
  if (Array.isArray(context.evidenceSources)) return context.evidenceSources;
  if (Array.isArray(context.evidence?.sources)) return context.evidence.sources;
  if (Array.isArray(context.evidence?.evidenceSources)) return context.evidence.evidenceSources;
  if (Array.isArray(context.packetEvidence?.evidenceSources)) return context.packetEvidence.evidenceSources;
  return [];
}

function isKnownSlashCommand(command, context = {}) {
  const commands = context.slashCommands || YURI_RAILS_CONFIG.input.slashCommands || [];
  return commands.includes(String(command || '').replace(/^\//, ''));
}

function isKnownLaneMention(mention, context = {}) {
  const lanes = context.laneMentions || YURI_RAILS_CONFIG.input.laneMentions || [];
  return lanes.includes(String(mention || '').toLowerCase());
}
