#!/usr/bin/env node

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtectedPath, safeRuntimePath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIOLATION_LOG = path.join(__dirname, '..', 'state', 'guardrail-violations.jsonl');

export const RAIL_SEVERITY = Object.freeze({
  allow: 'allow',
  warn: 'warn',
  block: 'block',
});

const BLOCKED_COMMAND_PATTERNS = Object.freeze([
  { id: 'git-push', pattern: /\bgit\s+push\b/i },
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
  const slashCommand = text.startsWith('/') ? text.split(/\s+/, 1)[0] : null;
  const laneMentions = detectLaneMentions(text);
  const shellBlocks = detectShellBlocks(text);
  const reasons = [];

  if (!text) reasons.push({ severity: RAIL_SEVERITY.block, message: 'empty input' });
  if (slashCommand && !/^\/[a-z][a-z0-9_-]*$/i.test(slashCommand)) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: `invalid slash command: ${slashCommand}` });
  }
  if (shellBlocks.length && context.noexec === true) {
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

  return resultFor({
    rail: 'retrieval',
    reasons,
    evidence: {
      checkedPaths: candidates,
      protectedPaths,
      source: context.source || request.source || null,
    },
  });
}

export function evaluateExecutionRails(action = {}, context = {}) {
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
  if (action.autoCommit === true || action.autoPush === true) {
    reasons.push({ severity: RAIL_SEVERITY.block, message: 'automatic commit or push denied' });
  }

  return resultFor({
    rail: 'execution',
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
  const cap = Number(context.maxOutputChars || 120_000);
  const reasons = [];
  if (text.length > cap) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: `output exceeds cap: ${text.length} > ${cap}` });
  }
  if (context.requireEvidence === true && looksLikeRepoTruthClaim(text) && !context.evidence) {
    reasons.push({ severity: RAIL_SEVERITY.warn, message: 'repo truth claim requires local evidence' });
  }
  return resultFor({
    rail: 'output',
    reasons,
    evidence: {
      length: text.length,
      cap,
      truncated: text.length > cap,
      ansiSafe: !/\x1b\][^\x07]*(?:\x07|\x1b\\)/.test(text),
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

export function evaluateRails(kind, payload, context = {}) {
  switch (kind) {
    case 'input':
      return evaluateInputRails(payload, context);
    case 'retrieval':
      return evaluateRetrievalRails(payload, context);
    case 'execution':
      return evaluateExecutionRails(payload, context);
    case 'tool-input':
      return evaluateToolInputRails(payload, context);
    case 'output':
      return evaluateOutputRails(payload, context);
    case 'tool-output':
      return evaluateToolOutputRails(payload, context);
    case 'health':
      return evaluateHealthRails(payload, context);
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
  return (matches || []).map((entry) => entry.trim());
}

function looksLikeRepoTruthClaim(text) {
  return /\b(?:all tests pass|tests pass|fixed|implemented|verified|repo is clean|clean worktree|no drift)\b/i.test(text);
}
