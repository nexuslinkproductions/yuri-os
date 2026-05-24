// lane-session.mjs — persistent conversation state per DeepSeek lane.
//
// Each lane gets a JSONL file under _SYSTEM/state/lane-sessions/. Sessions persist
// across dispatches so the provider sees full prior context, prompt-cache fires,
// and the lane's "personality" compounds across our work session.
//
// Used by offload-runner.mjs for DeepSeek + NIM lanes (one-shot lifecycle dropped
// 2026-05-19 — NIM nemotron/mistral/llama/etc. now get the same persistent treatment
// as DeepSeek per Marcel's cross-lane continuity directive).
// Codex uses its own native session storage via codex-offload-runner.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SESSION_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'lane-sessions');
const DEFAULT_LEGACY_SESSION_DIR = path.join(REPO_ROOT, '.claude', 'lane-sessions');

// Lanes eligible for persistence — covers ALL cloud lanes that benefit from
// cross-session continuity. Local-only lanes (ollama-local, triage-local,
// summarize-local, code-local, gpt-oss, gemma-local) are excluded since their
// KV cache is per-process and there's no upstream to amortise prefix-cache wins to.
//
// 'codex-' covers the synthetic id from codex-offload-runner.mjs (e.g. 'codex-gpt-5.5').
// Standalone gpt-5.5/5.4/5.4-mini/5.3-codex tokens route through openAiResponsesLane and
// are listed explicitly (no 'gpt-' prefix because that would also catch 'gpt-oss').
// 'nvidia-' covers all NIM lanes (nemotron-120b, mistral-large/medium, llama-70b, kimi, etc.).
// Coverage v3 (2026-05-19) — extended to kimi/moonshot/openrouter/ollama-cloud/gemma-cloud.
const PERSISTENT_LANE_PREFIXES = [
  'deepseek', 'code-deepseek', 'reason-cloud', 'codex-', 'nvidia-',
  'kimi', 'moonshot', 'openrouter-free', 'ollama-cloud',
  'gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex',
  'gemma-cloud',
];

// Soft budget — when total chars across history exceed this, the oldest half
// gets summarized into a single synthetic "lane memory" entry before the next
// dispatch. Keeps the lane bounded without losing accumulated context.
const TOKEN_BUDGET_CHARS = 120_000; // ~30K tokens at 4 chars/token

function isPersistentLane(modelId) {
  if (!modelId) return false;
  return PERSISTENT_LANE_PREFIXES.some((prefix) => String(modelId).startsWith(prefix));
}

function resolveSessionDir() {
  return path.resolve(process.env.YURI_LANE_SESSION_DIR || DEFAULT_SESSION_DIR);
}

function resolveLegacySessionDir() {
  if (process.env.YURI_LEGACY_LANE_SESSION_DIR) {
    return path.resolve(process.env.YURI_LEGACY_LANE_SESSION_DIR);
  }
  if (process.env.YURI_LANE_SESSION_DIR) return '';
  return path.resolve(process.env.YURI_LEGACY_LANE_SESSION_DIR || DEFAULT_LEGACY_SESSION_DIR);
}

function sessionPaths(modelId, sessionName = 'default', rootDir = resolveSessionDir()) {
  const safeName = String(sessionName).replace(/[^A-Za-z0-9._-]/g, '_');
  const safeModel = String(modelId).replace(/[^A-Za-z0-9._-]/g, '_');
  return {
    jsonl: path.join(rootDir, `${safeModel}__${safeName}.jsonl`),
    meta:  path.join(rootDir, `${safeModel}__${safeName}.meta.json`),
  };
}

function ensureDir(rootDir = resolveSessionDir()) {
  if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true });
}

function readHistory(jsonlPath) {
  if (!existsSync(jsonlPath)) return [];
  const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const turns = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row && row.role && typeof row.content === 'string') {
        turns.push({ role: row.role, content: row.content });
      }
    } catch {}
  }
  return turns;
}

function appendTurn(jsonlPath, role, content) {
  const row = { role, content, ts: new Date().toISOString() };
  appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
}

function readMeta(metaPath) {
  if (!existsSync(metaPath)) return { turns: 0, totalChars: 0, lastUsed: null, summaryCheckpoint: null };
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return { turns: 0, totalChars: 0, lastUsed: null, summaryCheckpoint: null };
  }
}

function writeMeta(metaPath, meta) {
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

function rotateForFresh(modelId, sessionName) {
  const paths = sessionPaths(modelId, sessionName);
  ensureDir(path.dirname(paths.jsonl));
  if (existsSync(paths.jsonl)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(paths.jsonl, `${paths.jsonl}.archive-${ts}`);
  }
  if (existsSync(paths.meta)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(paths.meta, `${paths.meta}.archive-${ts}`);
  }
}

function migrateLegacyIfNeeded(modelId, sessionName) {
  const paths = sessionPaths(modelId, sessionName);
  const legacyDir = resolveLegacySessionDir();
  if (!legacyDir) return { paths, sourceSessionPath: paths.jsonl };
  const legacyPaths = sessionPaths(modelId, sessionName, legacyDir);
  if (existsSync(paths.jsonl) || !existsSync(legacyPaths.jsonl)) {
    return { paths, sourceSessionPath: paths.jsonl };
  }

  ensureDir(path.dirname(paths.jsonl));
  const legacyJsonl = readFileSync(legacyPaths.jsonl, 'utf8');
  writeFileSync(paths.jsonl, legacyJsonl);
  if (existsSync(legacyPaths.meta)) {
    try {
      writeFileSync(paths.meta, readFileSync(legacyPaths.meta, 'utf8'));
    } catch {}
  }
  return { paths, sourceSessionPath: legacyPaths.jsonl };
}

// Trim history when over budget: keep the most recent 60% verbatim, replace the
// oldest 40% with a single synthesized summary entry (best-effort — if
// summarization fails, drops oldest turns instead).
function trimIfOverBudget(history) {
  const totalChars = history.reduce((sum, t) => sum + (t.content?.length || 0), 0);
  if (totalChars <= TOKEN_BUDGET_CHARS) return { history, trimmed: false };

  const splitIdx = Math.floor(history.length * 0.4);
  if (splitIdx < 2) return { history, trimmed: false };

  const oldest = history.slice(0, splitIdx);
  const recent = history.slice(splitIdx);
  const summaryText = oldest
    .map((t) => `[${t.role}] ${t.content.slice(0, 400)}`)
    .join('\n')
    .slice(0, 4000);

  const summaryTurn = {
    role: 'system',
    content: `[LANE-MEMORY] Earlier in this lane session (${oldest.length} turns, summarized):\n${summaryText}`,
  };

  return { history: [summaryTurn, ...recent], trimmed: true };
}

// Public — called by offload-runner before building the messages array.
// Returns the history to prepend, plus a closure to record the new round.
export function loadLaneSession({ modelId, sessionName = 'default', fresh = false }) {
  if (!isPersistentLane(modelId)) {
    return {
      enabled: false,
      history: [],
      record: () => {},
      sessionPath: null,
    };
  }

  if (fresh) rotateForFresh(modelId, sessionName);

  ensureDir();
  const { paths, sourceSessionPath } = fresh
    ? { paths: sessionPaths(modelId, sessionName), sourceSessionPath: sessionPaths(modelId, sessionName).jsonl }
    : migrateLegacyIfNeeded(modelId, sessionName);
  let history = readHistory(paths.jsonl);
  const { history: trimmedHistory, trimmed } = trimIfOverBudget(history);

  if (trimmed) {
    // Rewrite the jsonl with trimmed history so the budget stays bounded.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(paths.jsonl, `${paths.jsonl}.pretrim-${ts}`);
    for (const turn of trimmedHistory) appendTurn(paths.jsonl, turn.role, turn.content);
    history = trimmedHistory;
  }

  return {
    enabled: true,
    history,
    sessionPath: paths.jsonl,
    sourceSessionPath,
    record: (userContent, assistantContent) => {
      appendTurn(paths.jsonl, 'user', userContent);
      appendTurn(paths.jsonl, 'assistant', assistantContent);
      const meta = readMeta(paths.meta);
      meta.turns = (meta.turns || 0) + 2;
      meta.totalChars = (meta.totalChars || 0) + userContent.length + assistantContent.length;
      meta.lastUsed = new Date().toISOString();
      meta.modelId = modelId;
      meta.sessionName = sessionName;
      writeMeta(paths.meta, meta);
    },
  };
}

export const __test__ = {
  isPersistentLane,
  sessionPaths,
  trimIfOverBudget,
  PERSISTENT_LANE_PREFIXES,
};
