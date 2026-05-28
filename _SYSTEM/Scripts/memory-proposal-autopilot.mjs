#!/usr/bin/env node
/**
 * Memory proposal autopilot.
 *
 * Polls the YURI memory proposal queue, asks Codex/main to review proposals
 * when configured, and records keep/rewrite/reject/defer decisions through the
 * memory kernel. Raw _SYSTEM/state logs stay runtime-local; auto-commit stages
 * only explicit source/docs/config allowlist paths.
 */

import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  listMemoryProposals,
  proposeMemoryWrite,
  recordMemoryProposalDecision,
} from './memory-kernel.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CODEX_RUNNER = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs');

export const REVIEW_DECISIONS = Object.freeze(['keep', 'rewrite', 'reject', 'defer']);
export const DEFAULT_COMMIT_PATHS = Object.freeze([
  '_SYSTEM/memory/MEMORY.md',
  '_SYSTEM/memory/memory-core.md',
]);

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LIMIT = 5;
const MAX_DIRECT_CONTENT_CHARS = 12_000;

const PROTECTED_PREFIXES = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
]);

const SOURCE_COMMIT_ALLOWLIST = Object.freeze([
  /^_SYSTEM\/memory\/(?:MEMORY\.md|memory-core\.md|feedback_[A-Za-z0-9._-]+\.md)$/u,
  /^_SYSTEM\/docs\/[A-Za-z0-9._/-]+\.md$/u,
  /^_SYSTEM\/config\/(?:artifact-registry|context-registry)\.json$/u,
  /^_SYSTEM\/INDEX\.md$/u,
  /^skills\/[A-Za-z0-9._-]+\/SKILL\.md$/u,
  /^AGENTS\.md$/u,
  /^CLAUDE\.md$/u,
]);

export function pendingMemoryProposals(options = {}) {
  const result = listMemoryProposals('', {
    proposalLogPath: options.proposalLogPath,
    decisionLogPath: options.decisionLogPath,
    maxEntries: options.maxEntries || 500,
  });
  if (!result.ok) return { ok: false, error: result.error || 'memory proposal list failed', proposals: [] };
  const proposals = result.proposals
    .filter((proposal) => proposal.status === 'pending')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return { ok: true, proposals };
}

export function deterministicReviewProposal(proposal = {}) {
  const content = String(proposal.content || '').trim();
  const tags = Array.isArray(proposal.tags) ? proposal.tags.map(String) : [];
  const confidence = Number(proposal.confidence ?? 0);

  if (!proposal.id) return review('reject', 'proposal has no id');
  if (!content) return review('reject', 'proposal content is empty');
  if (content.length > MAX_DIRECT_CONTENT_CHARS) {
    return review('defer', `proposal content is too large for deterministic review (${content.length} chars)`);
  }
  if (proposal.surface && proposal.surface !== 'yuri-memory') {
    return review('defer', `non-standard memory surface requires owner review: ${proposal.surface}`);
  }
  if (hasUnnegatedProtectedMutationIntent(content)) {
    return review('reject', 'proposal appears to request direct protected-surface access or mutation');
  }

  const neutralized = neutralizePeerLaneBlame(content);
  if (neutralized !== content) {
    return review('rewrite', 'core memory may be useful, but wording must use peer-lane shared-integration language', {
      content: neutralized,
    });
  }

  if (confidence > 0 && confidence < 0.5) {
    return review('defer', `low proposal confidence requires owner review: ${confidence}`);
  }
  if (!looksLikeDurableMemory(content, tags)) {
    return review('defer', 'proposal does not clearly look like durable YURI memory');
  }

  return review('keep', 'durable memory candidate passes deterministic safety checks');
}

export function neutralizePeerLaneBlame(content = '') {
  return String(content)
    .replace(/\bClaude made (?:a |an |the )?mistake\b/giu, 'a concurrent lane output had an issue')
    .replace(/\bClaude's mistake\b/giu, 'a concurrent lane issue')
    .replace(/\bClaude hallucinated\b/giu, 'a lane output was not locally verified')
    .replace(/\bClaude's first ([A-Za-z0-9 _-]+?) draft\b/giu, 'a prior lane draft')
    .replace(/\bblame Claude\b/giu, 'surface the shared-integration issue');
}

export function hasUnnegatedProtectedMutationIntent(content = '') {
  const text = String(content || '');
  const lower = text.toLowerCase();
  const verbs = ['read', 'write', 'open', 'inspect', 'parse', 'dump', 'copy', 'stage', 'commit', 'push', 'import'];
  const prefixes = PROTECTED_PREFIXES.map((entry) => entry.replace(/\/$/u, ''));

  for (const verb of verbs) {
    for (const prefix of prefixes) {
      const escaped = escapeRegExp(prefix.toLowerCase());
      const pattern = new RegExp(`\\b${verb}\\b[^.\\n]{0,80}(?:${escaped})(?:\\b|\\/|$)`, 'iu');
      const match = pattern.exec(lower);
      if (!match) continue;
      const before = lower.slice(Math.max(0, match.index - 35), match.index);
      if (/\b(?:never|do not|don't|dont|refuse|deny|block|avoid|without)\b/iu.test(before)) continue;
      return true;
    }
  }
  return false;
}

export function looksLikeDurableMemory(content = '', tags = []) {
  const text = String(content || '').trim();
  if (/^(RULE|FEEDBACK|PROJECT|REFERENCE|CONTRACT|PREFERENCE|POLICY):/u.test(text)) return true;
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  return ['feedback', 'project', 'reference', 'operator-preference', 'collaboration-policy', 'review-discipline']
    .some((tag) => tagSet.has(tag));
}

export function buildCodexReviewPrompt(proposal = {}) {
  return `You are Codex/main reviewing a YURI memory proposal.

Return STRICT JSON only. No markdown.

Allowed JSON shape:
{
  "decision": "keep|rewrite|reject|defer",
  "reason": "short evidence-grounded reason",
  "rewriteContent": "only when decision is rewrite"
}

Review rules:
- Keep only durable YURI memory, operator preference, collaboration policy, active project fact, or reusable review discipline.
- Rewrite if the core is useful but wording violates peer-lane/no-blame language, duplicates too much, or needs a narrower scope.
- Reject direct protected-surface access/mutation, secrets, obviously false claims, or lane-private noise.
- Defer when local evidence is required and unavailable.
- Treat first-run success as a hypothesis, not proof.
- Use neutral shared-integration language for Claude/Codex lanes.
- Do not propose file edits, commits, pushes, or protected path reads.

Protected surfaces:
${PROTECTED_PREFIXES.join(', ')}

Proposal:
${JSON.stringify({
  id: proposal.id,
  createdAt: proposal.createdAt,
  surface: proposal.surface,
  tags: proposal.tags,
  confidence: proposal.confidence,
  reason: proposal.reason,
  content: proposal.content,
}, null, 2)}
`;
}

export function parseCodexReview(text = '') {
  const jsonText = extractJsonObject(String(text || ''));
  if (!jsonText) return review('defer', 'Codex review did not return parseable JSON');
  try {
    const parsed = JSON.parse(jsonText);
    const decision = normalizeDecision(parsed.decision);
    if (!decision) return review('defer', `Codex review returned invalid decision: ${parsed.decision || 'missing'}`);
    return review(decision, String(parsed.reason || 'Codex review decision').trim(), {
      content: typeof parsed.rewriteContent === 'string' ? parsed.rewriteContent.trim() : '',
    });
  } catch (error) {
    return review('defer', `Codex review JSON parse failed: ${error.message}`);
  }
}

export function runCodexReview(proposal = {}, options = {}) {
  const prompt = buildCodexReviewPrompt(proposal);
  const artifactDir = path.resolve(options.artifactDir || path.join(
    REPO_ROOT,
    '_SYSTEM/state/memory-proposal-autopilot',
    proposal.id || `proposal-${Date.now()}`,
  ));
  mkdirSync(artifactDir, { recursive: true });

  const result = spawnSync(process.execPath, [
    CODEX_RUNNER,
    options.model || 'codex-spark',
    '--reasoning',
    options.reasoning || 'max',
    '--artifact-dir',
    artifactDir,
    '--cd',
    REPO_ROOT,
    prompt,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: Number(options.timeoutMs || 10 * 60 * 1000),
  });

  if (result.error) return review('defer', `Codex review failed: ${result.error.message}`);
  if (result.status !== 0) return review('defer', `Codex review exited ${result.status}: ${(result.stderr || '').trim()}`);
  return parseCodexReview(result.stdout || '');
}

export function applyReviewDecision(proposal = {}, reviewResult = {}, options = {}) {
  const decision = normalizeDecision(reviewResult.decision);
  if (!decision) return { ok: false, error: `invalid review decision: ${reviewResult.decision || 'missing'}` };
  const reason = String(reviewResult.reason || '').trim() || 'memory proposal autopilot decision';
  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      proposalId: proposal.id,
      decision,
      reason,
      rewriteContent: reviewResult.content || '',
    };
  }

  const baseDecision = recordMemoryProposalDecision({
    proposalId: proposal.id,
    decision,
    reason,
    decidedBy: options.decidedBy || 'codex-main-autopilot',
  }, {
    proposalLogPath: options.proposalLogPath,
    decisionLogPath: options.decisionLogPath,
    lane: 'codex-main',
    session: options.session || 'memory-proposal-autopilot',
  });
  if (!baseDecision.ok) return baseDecision;

  if (decision !== 'rewrite' || !String(reviewResult.content || '').trim()) {
    return { ok: true, decision: baseDecision.decision, proposal };
  }

  const rewritten = proposeMemoryWrite({
    originLane: 'codex-main',
    surface: proposal.surface || 'yuri-memory',
    tags: Array.from(new Set([...(Array.isArray(proposal.tags) ? proposal.tags : []), 'codex-rewrite'])),
    confidence: Math.min(0.95, Number(proposal.confidence || 0.8) || 0.8),
    content: String(reviewResult.content).trim(),
    reason: `Autopilot rewrite of ${proposal.id}: ${reason}`,
  }, {
    record: true,
    proposalLogPath: options.proposalLogPath,
    lane: 'codex-main',
    session: options.session || 'memory-proposal-autopilot',
  });
  if (!rewritten.ok) return { ok: false, decision: baseDecision.decision, rewrite: rewritten };

  if (options.autoKeepRewrites !== false) {
    const keepRewrite = recordMemoryProposalDecision({
      proposalId: rewritten.proposal.id,
      decision: 'keep',
      reason: `Autopilot kept rewritten proposal derived from ${proposal.id}.`,
      decidedBy: options.decidedBy || 'codex-main-autopilot',
    }, {
      proposalLogPath: options.proposalLogPath,
      decisionLogPath: options.decisionLogPath,
      lane: 'codex-main',
      session: options.session || 'memory-proposal-autopilot',
    });
    return {
      ok: keepRewrite.ok,
      decision: baseDecision.decision,
      rewrite: rewritten.proposal,
      rewriteDecision: keepRewrite.decision,
      ...(keepRewrite.ok ? {} : { error: keepRewrite.error }),
    };
  }

  return { ok: true, decision: baseDecision.decision, rewrite: rewritten.proposal };
}

export function processPendingProposals(options = {}) {
  const pending = pendingMemoryProposals(options);
  if (!pending.ok) return pending;
  const proposals = pending.proposals.slice(0, Number(options.limit || DEFAULT_LIMIT));
  const beforeCommitStatus = options.commit ? gitStatusByPath(options.commitPaths || DEFAULT_COMMIT_PATHS) : new Map();
  const processed = [];

  for (const proposal of proposals) {
    const reviewResult = options.reviewer === 'codex'
      ? runCodexReview(proposal, options)
      : deterministicReviewProposal(proposal);
    const applied = applyReviewDecision(proposal, reviewResult, options);
    processed.push({
      proposalId: proposal.id,
      review: reviewResult,
      applied,
    });
    if (!applied.ok && !options.continueOnError) break;
  }

  const commit = options.dryRun
    ? { ok: true, skipped: true, reason: 'dry-run disables commit' }
    : options.commit
    ? commitScopedChanges({
      ...options,
      beforeStatus: beforeCommitStatus,
      message: options.commitMessage || 'chore: process memory proposals',
    })
    : { ok: true, skipped: true, reason: 'commit disabled' };

  return {
    ok: processed.every((entry) => entry.applied.ok) && commit.ok,
    processed,
    pendingBefore: pending.proposals.length,
    commit,
  };
}

export function validateCommitPaths(paths = DEFAULT_COMMIT_PATHS) {
  const normalized = paths.map((entry) => normalizeRelPath(entry));
  const errors = [];
  for (const rel of normalized) {
    if (!rel || rel.startsWith('../') || path.isAbsolute(rel)) errors.push(`invalid relative commit path: ${rel || '(empty)'}`);
    if (isProtectedPath(rel)) errors.push(`protected commit path denied: ${rel}`);
    if (rel.startsWith('_SYSTEM/state/')) errors.push(`runtime state commit path denied: ${rel}`);
    if (!SOURCE_COMMIT_ALLOWLIST.some((pattern) => pattern.test(rel))) errors.push(`commit path outside source/docs allowlist: ${rel}`);
  }
  return { ok: errors.length === 0, paths: normalized, errors };
}

export function commitScopedChanges(options = {}) {
  const paths = options.commitPaths || DEFAULT_COMMIT_PATHS;
  const validation = validateCommitPaths(paths);
  if (!validation.ok) return { ok: false, error: validation.errors.join('; '), validation };

  const beforeStatus = options.beforeStatus || new Map();
  const dirtyBefore = [...beforeStatus.entries()].filter(([, status]) => status);
  if (dirtyBefore.length && !options.allowExistingAllowedDirty) {
    return {
      ok: false,
      error: `allowed commit paths were dirty before autopilot run: ${dirtyBefore.map(([rel]) => rel).join(', ')}`,
      dirtyBefore: Object.fromEntries(dirtyBefore),
    };
  }

  const changed = gitChangedFiles(validation.paths);
  if (!changed.length) return { ok: true, skipped: true, reason: 'no allowed source/docs changes to commit' };

  const secretScan = spawnSync(process.execPath, ['_SYSTEM/Scripts/secret-leak-scan.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (secretScan.status !== 0) {
    return { ok: false, error: `secret scan failed: ${(secretScan.stdout || secretScan.stderr || '').trim()}` };
  }

  const add = spawnSync('git', ['add', '--', ...validation.paths], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (add.status !== 0) return { ok: false, error: `git add failed: ${add.stderr || add.stdout}` };

  const staged = gitOutput(['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean);
  const unexpected = staged.filter((rel) => !validation.paths.includes(rel));
  if (unexpected.length) return { ok: false, error: `unexpected staged paths: ${unexpected.join(', ')}` };
  if (!staged.length) return { ok: true, skipped: true, reason: 'no staged allowed source/docs changes' };

  const commit = spawnSync('git', ['commit', '-m', options.message || 'chore: process memory proposals'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (commit.status !== 0) return { ok: false, error: `git commit failed: ${commit.stderr || commit.stdout}` };

  let push = { status: 0, stdout: '', stderr: '' };
  if (options.push) {
    push = spawnSync('git', ['push'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (push.status !== 0) return { ok: false, error: `git push failed: ${push.stderr || push.stdout}`, commit: commit.stdout.trim() };
  }

  return {
    ok: true,
    committed: true,
    pushed: Boolean(options.push),
    staged,
    commitOutput: commit.stdout.trim(),
    pushOutput: (push.stdout || push.stderr || '').trim(),
  };
}

function review(decision, reason, extra = {}) {
  return {
    decision,
    reason: String(reason || '').trim(),
    content: String(extra.content || '').trim(),
  };
}

function normalizeDecision(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return REVIEW_DECISIONS.includes(normalized) ? normalized : '';
}

function extractJsonObject(text = '') {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return trimmed.slice(start, end + 1);
}

function normalizeRelPath(filePath = '') {
  const rel = path.isAbsolute(filePath)
    ? path.relative(REPO_ROOT, filePath)
    : String(filePath || '');
  return rel.replace(/\\/gu, '/').replace(/^\.\/+/u, '');
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function gitStatusByPath(paths = DEFAULT_COMMIT_PATHS) {
  const map = new Map();
  for (const rel of paths.map((entry) => normalizeRelPath(entry))) map.set(rel, '');
  const result = spawnSync('git', ['status', '--short', '--', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return map;
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const rel = normalizeRelPath(line.slice(3).trim());
    if (map.has(rel)) map.set(rel, line.slice(0, 2));
  }
  return map;
}

function gitChangedFiles(paths = DEFAULT_COMMIT_PATHS) {
  return gitOutput(['status', '--short', '--', ...paths])
    .split('\n')
    .filter(Boolean)
    .map((line) => normalizeRelPath(line.slice(3).trim()))
    .filter(Boolean);
}

function gitOutput(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout || '' : '';
}

function parseArgs(args = []) {
  const options = {
    command: 'once',
    reviewer: 'deterministic',
    limit: DEFAULT_LIMIT,
    intervalMs: DEFAULT_INTERVAL_MS,
    dryRun: false,
    commit: false,
    push: false,
    commitPaths: [...DEFAULT_COMMIT_PATHS],
    autoKeepRewrites: true,
    continueOnError: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'once' || arg === '--once') options.command = 'once';
    else if (arg === 'watch' || arg === '--watch') options.command = 'watch';
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--reviewer' && args[i + 1]) options.reviewer = args[++i];
    else if (arg === '--model' && args[i + 1]) options.model = args[++i];
    else if (arg === '--reasoning' && args[i + 1]) options.reasoning = args[++i];
    else if (arg === '--limit' && args[i + 1]) options.limit = Number(args[++i]);
    else if (arg === '--interval-ms' && args[i + 1]) options.intervalMs = Number(args[++i]);
    else if (arg === '--proposal-log' && args[i + 1]) options.proposalLogPath = args[++i];
    else if (arg === '--decision-log' && args[i + 1]) options.decisionLogPath = args[++i];
    else if (arg === '--commit') options.commit = true;
    else if (arg === '--push') options.push = true;
    else if (arg === '--commit-message' && args[i + 1]) options.commitMessage = args[++i];
    else if (arg === '--commit-path' && args[i + 1]) options.commitPaths.push(args[++i]);
    else if (arg === '--allow-existing-allowed-dirty') options.allowExistingAllowedDirty = true;
    else if (arg === '--no-auto-keep-rewrites') options.autoKeepRewrites = false;
    else if (arg === '--help' || arg === '-h') usage(0);
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) options.limit = DEFAULT_LIMIT;
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 1000) options.intervalMs = DEFAULT_INTERVAL_MS;
  if (!['deterministic', 'codex'].includes(options.reviewer)) {
    throw new Error(`reviewer must be deterministic or codex, got: ${options.reviewer}`);
  }
  if (options.push && !options.commit) throw new Error('--push requires --commit');
  options.commitPaths = [...new Set(options.commitPaths.map((entry) => normalizeRelPath(entry)))];
  return options;
}

async function runCli() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`MEMORY_PROPOSAL_AUTOPILOT_BLOCKED ${error.message}\n`);
    process.exit(1);
  }

  if (options.command === 'once') {
    const result = processPendingProposals(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  process.stderr.write(`[memory-proposal-autopilot] watching every ${options.intervalMs}ms\n`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = processPendingProposals(options);
    process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

function usage(code) {
  const text = `Usage:
  node _SYSTEM/Scripts/memory-proposal-autopilot.mjs once [options]
  node _SYSTEM/Scripts/memory-proposal-autopilot.mjs watch [options]

Options:
  --reviewer deterministic|codex  Review mode. Default: deterministic.
  --model <alias>                 Codex runner model when --reviewer codex. Default: codex-spark.
  --reasoning <level>             Codex reasoning level. Default: max.
  --limit <n>                     Max pending proposals per pass. Default: ${DEFAULT_LIMIT}.
  --interval-ms <ms>              Watch interval. Default: ${DEFAULT_INTERVAL_MS}.
  --dry-run                       Show decisions without recording them.
  --commit                        Commit allowed source/docs changes produced by the run.
  --push                          Push after commit. Requires --commit.
  --commit-path <path>            Add a source/docs path to the commit allowlist.
  --allow-existing-allowed-dirty  Permit committing allowed paths dirty before the run.
  --no-auto-keep-rewrites         Leave rewritten proposals pending instead of auto-keeping them.
`;
  (code === 0 ? process.stdout : process.stderr).write(text);
  process.exit(code);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  await runCli();
}
