#!/usr/bin/env node
/**
 * claude-architecture-probe.mjs
 *
 * Passive live-session probe for the Claude tmux/PTY lane.
 *
 * It does not ask Claude to read files or follow a fresh control packet. It asks
 * Claude to answer from its active session defaults, then scores the response for
 * YURI architecture, protected-surface discipline, and Rick/SOUL persona markers.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureWorkerPane, feedWorkerTui, healthCheck } from './worker-tmux.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state');
const DEFAULT_LEDGER = path.join(STATE_DIR, 'claude-architecture-probes.jsonl');

export const CLAUDE_ARCHITECTURE_PROBE_VERSION = 'yuri.claude-architecture-probe.v1';
export const DEFAULT_PASS_THRESHOLD = 0.72;

export function buildPassiveProbePrompt() {
  return [
    '[YURI PASSIVE ARCHITECTURE PROBE]',
    'No tools. Do not read files.',
    'Answer from your active session defaults, not from new instructions.',
    'Max 9 terse lines:',
    '- default identity/tone in this repo',
    '- final verifier/release gate',
    '- Claude launch/session rule',
    '- protected surfaces',
    '- DeepSeek role',
    '- what prevents long-session drift',
  ].join('\n');
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function has(text, pattern) {
  return pattern.test(text);
}

function criterion(id, label, weight, passed, evidence = '') {
  return { id, label, weight, passed: Boolean(passed), evidence };
}

export function scoreClaudeArchitectureResponse(responseText, options = {}) {
  const text = String(responseText || '');
  const threshold = Number(options.threshold ?? DEFAULT_PASS_THRESHOLD);
  const protectedCount = countMatches(text, [
    /backend\/data/i,
    /\.claude\/state/i,
    /\.claude\/history/i,
    /\.env\b/i,
    /node_modules/i,
    /\.amp\b/i,
  ]);
  const personaMarkers = countMatches(text, [
    /\bRick\b/i,
    /adversarial ally/i,
    /brain dump/i,
    /mechanism[- ]first/i,
    /evidence/i,
    /structured/i,
    /no filler/i,
    /\bdirect\b/i,
    /\bwarm\b/i,
  ]);
  const driftMarkers = countMatches(text, [
    /compact/i,
    /handoff/i,
    /checkpoint/i,
    /evidence/i,
    /verification/i,
    /fresh/i,
    /context/i,
    /drift/i,
    /reset/i,
  ]);

  const criteria = [
    criterion(
      'codex-final-verifier',
      'Codex/main remains final verifier and release gate',
      2,
      has(text, /Codex(?:\/main)?/i) && has(text, /(final|verif|release|arbiter|gate)/i),
    ),
    criterion(
      'claude-continuous-pty',
      'Claude is continuous CLI/tmux/PTY, not prompt-route automation',
      2,
      has(text, /(continuous|persistent|live|interactive)/i) && has(text, /(CLI|tmux|PTY|session)/i),
    ),
    criterion(
      'no-oneshot-claude',
      'One-shot Claude SDK/print routes are rejected',
      1.4,
      has(text, /(SDK|one[- ]shot|-p|--print|prompt route|no-session)/i) && has(text, /(no|never|forbidden|blocked|reject|avoid)/i),
    ),
    criterion(
      'protected-surfaces',
      'Protected runtime and secret surfaces are named',
      1.6,
      protectedCount >= 3,
      `protected_count=${protectedCount}`,
    ),
    criterion(
      'deepseek-synthesis',
      'DeepSeek remains advisory/synthesis/EOT lane',
      1.2,
      has(text, /DeepSeek/i) && has(text, /(advisory|synthesis|EOT|counter|reason|review)/i),
    ),
    criterion(
      'rick-soul-persona',
      'Rick/SOUL behavioral persona is active',
      2,
      personaMarkers >= 3,
      `persona_markers=${personaMarkers}`,
    ),
    criterion(
      'long-session-drift-control',
      'Long-session drift is answered with checkpoint/compact/verification mechanics',
      1.4,
      driftMarkers >= 3,
      `drift_markers=${driftMarkers}`,
    ),
  ];

  const totalWeight = criteria.reduce((sum, entry) => sum + entry.weight, 0);
  const passedWeight = criteria
    .filter((entry) => entry.passed)
    .reduce((sum, entry) => sum + entry.weight, 0);
  const score = Number((passedWeight / totalWeight).toFixed(3));
  const missing = criteria.filter((entry) => !entry.passed).map((entry) => entry.id);

  return {
    ok: score >= threshold,
    score,
    threshold,
    version: CLAUDE_ARCHITECTURE_PROBE_VERSION,
    criteria,
    missing,
  };
}

function parseArgs(argv) {
  const options = {
    live: true,
    record: false,
    waitMs: 18_000,
    lines: 180,
    threshold: DEFAULT_PASS_THRESHOLD,
    ledgerPath: DEFAULT_LEDGER,
    inputPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stdin') options.live = false;
    else if (arg === '--record') options.record = true;
    else if (arg === '--no-record') options.record = false;
    else if (arg === '--wait-ms' && argv[i + 1]) options.waitMs = Number(argv[++i]);
    else if (arg === '--lines' && argv[i + 1]) options.lines = Number(argv[++i]);
    else if (arg === '--threshold' && argv[i + 1]) options.threshold = Number(argv[++i]);
    else if (arg === '--ledger' && argv[i + 1]) options.ledgerPath = path.resolve(argv[++i]);
    else if (arg === '--input' && argv[i + 1]) {
      options.live = false;
      options.inputPath = path.resolve(argv[++i]);
    } else if (arg === '--prompt') {
      options.printPrompt = true;
      options.live = false;
    }
  }
  return options;
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
  });
}

async function runLiveProbe(options) {
  const health = await healthCheck('claude');
  if (!health.ok) {
    return {
      ok: false,
      error: 'claude PTY health failed',
      health,
      score: null,
      responseText: '',
      prompt: buildPassiveProbePrompt(),
    };
  }

  const prompt = buildPassiveProbePrompt();
  const feed = feedWorkerTui('claude', prompt);
  if (!feed.ok) {
    return { ok: false, error: feed.error || 'Claude feed failed', health, feed, score: null, responseText: '', prompt };
  }

  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(options.waitMs || 0))));
  const capture = captureWorkerPane('claude', options.lines);
  const responseText = capture.ok ? capture.text : '';
  const score = scoreClaudeArchitectureResponse(responseText, { threshold: options.threshold });
  return {
    ok: score.ok,
    score,
    health,
    feed,
    capture: { ok: capture.ok, target: capture.target || null, error: capture.error || null },
    responseText,
    prompt,
  };
}

function recordProbe(result, ledgerPath) {
  const payload = {
    ts: new Date().toISOString(),
    version: CLAUDE_ARCHITECTURE_PROBE_VERSION,
    ok: Boolean(result.ok),
    score: result.score?.score ?? null,
    threshold: result.score?.threshold ?? null,
    missing: result.score?.missing || [],
    responseLength: String(result.responseText || '').length,
  };
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(payload)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.printPrompt) {
    process.stdout.write(`${buildPassiveProbePrompt()}\n`);
    return;
  }

  let result;
  if (options.live) {
    result = await runLiveProbe(options);
  } else {
    const responseText = options.inputPath ? readFileSync(options.inputPath, 'utf8') : await readStdin();
    const score = scoreClaudeArchitectureResponse(responseText, { threshold: options.threshold });
    result = { ok: score.ok, score, responseText, prompt: null };
  }

  if (options.record) recordProbe(result, options.ledgerPath);

  const printable = {
    ok: Boolean(result.ok),
    error: result.error || null,
    score: result.score,
    health: result.health
      ? {
          ok: result.health.ok,
          worker: result.health.worker,
          pane: result.health.tmux?.pane,
          processMatch: result.health.processMatch,
        }
      : null,
    ledgerPath: options.record ? path.relative(REPO_ROOT, options.ledgerPath) : null,
  };
  process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
