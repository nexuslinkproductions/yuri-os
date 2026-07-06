#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compactHistory, TOKEN_BUDGET_CHARS } from './lane-session.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_SESSION_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'lane-sessions');
const DEFAULT_MAX_SESSION_BYTES = 2 * 1024 * 1024;

const SECRET_LIKE_PATTERNS = [
  /\bnvapi-[A-Za-z0-9_-]{40,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
  /\bbu_[A-Za-z0-9_-]{32,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
];

export function collectLaneSessionHealth(options = {}) {
  const sessionDir = resolveSessionDir(options.sessionDir);
  const maxSessionBytes = Number(options.maxSessionBytes || DEFAULT_MAX_SESSION_BYTES);
  const budgetChars = Number(options.budgetChars || TOKEN_BUDGET_CHARS);
  const apply = options.apply === true;

  assertYuriSessionDir(sessionDir);
  if (!existsSync(sessionDir)) {
    return {
      ok: true,
      sessionDir,
      apply,
      sessions: [],
      totals: { files: 0, bytes: 0, compactable: 0, secretLike: 0 },
    };
  }

  const sessions = readdirSync(sessionDir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .map((name) => inspectSessionFile(path.join(sessionDir, name), { maxSessionBytes, budgetChars, apply }));

  const totals = sessions.reduce((acc, session) => {
    acc.files += 1;
    acc.bytes += session.bytes;
    if (session.compactable) acc.compactable += 1;
    if (session.secretLike) acc.secretLike += 1;
    if (session.applied) acc.applied += 1;
    return acc;
  }, { files: 0, bytes: 0, compactable: 0, secretLike: 0, applied: 0 });

  return {
    ok: totals.secretLike === 0,
    sessionDir,
    apply,
    sessions,
    totals,
  };
}

export function inspectSessionFile(filePath, options = {}) {
  const maxSessionBytes = Number(options.maxSessionBytes || DEFAULT_MAX_SESSION_BYTES);
  const budgetChars = Number(options.budgetChars || TOKEN_BUDGET_CHARS);
  const apply = options.apply === true;
  const stat = statSync(filePath);
  const text = readFileSync(filePath, 'utf8');
  const turns = parseJsonlTurns(text);
  const secretLike = SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text));
  const compaction = compactHistory(turns, { budgetChars });
  const compactable = !secretLike && (stat.size > maxSessionBytes || compaction.trimmed);
  const report = {
    file: path.relative(REPO_ROOT, filePath),
    bytes: stat.size,
    turns: turns.length,
    totalChars: compaction.totalChars,
    compactedChars: compaction.compactedChars,
    compactable,
    secretLike,
    omittedLaneMemoryTurns: compaction.omittedLaneMemoryTurns,
    applied: false,
    archive: null,
  };

  if (apply && compactable) {
    const archivePath = archiveAndRewrite(filePath, compaction.history);
    const metaPath = filePath.replace(/\.jsonl$/, '.meta.json');
    const totalChars = compaction.history.reduce((sum, turn) => sum + turn.content.length, 0);
    writeFileSync(metaPath, JSON.stringify({
      compactedAt: new Date().toISOString(),
      turns: compaction.history.length,
      totalChars,
      sourceBytes: stat.size,
      archive: path.relative(REPO_ROOT, archivePath),
      omittedLaneMemoryTurns: compaction.omittedLaneMemoryTurns,
    }, null, 2));
    report.applied = true;
    report.archive = path.relative(REPO_ROOT, archivePath);
  }

  return report;
}

function parseJsonlTurns(text) {
  const turns = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && row.role && typeof row.content === 'string') {
        turns.push({ role: row.role, content: row.content });
      }
    } catch {
      turns.push({ role: 'system', content: '[LANE-MEMORY] malformed session row omitted during cache hygiene.' });
    }
  }
  return turns;
}

function archiveAndRewrite(filePath, history) {
  const archiveDir = path.join(path.dirname(filePath), 'archive');
  mkdirSync(archiveDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(archiveDir, `${path.basename(filePath)}.precompact-${ts}`);
  renameSync(filePath, archivePath);
  const lines = history.map((turn) => JSON.stringify({
    role: turn.role,
    content: turn.content,
    ts: new Date().toISOString(),
  }));
  writeFileSync(filePath, `${lines.join('\n')}\n`);
  return archivePath;
}

function resolveSessionDir(sessionDir) {
  return path.resolve(sessionDir || process.env.YURI_LANE_SESSION_DIR || DEFAULT_SESSION_DIR);
}

function assertYuriSessionDir(sessionDir) {
  const rel = path.relative(REPO_ROOT, sessionDir);
  if (rel.startsWith('..') || path.isAbsolute(rel) || isProtectedPath(rel)) {
    throw new Error(`lane cache rotator denied non-YURI or protected session dir: ${sessionDir}`);
  }
  if (!rel.startsWith('_SYSTEM/state/lane-sessions')) {
    throw new Error(`lane cache rotator only manages _SYSTEM/state/lane-sessions: ${sessionDir}`);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--session-dir') options.sessionDir = argv[++i];
    else if (arg === '--max-session-bytes') options.maxSessionBytes = Number(argv[++i]);
    else if (arg === '--budget-chars') options.budgetChars = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    'Usage: node _SYSTEM/Scripts/lane-cache-rotator.mjs [--dry-run|--apply]',
    '',
    'YURI-owned lane-session cache hygiene. Default is dry-run.',
    'Compacts oversized _SYSTEM/state/lane-sessions/*.jsonl files, archives originals,',
    'and refuses protected/non-YURI session directories.',
  ].join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs();
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = collectLaneSessionHealth(options);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}
