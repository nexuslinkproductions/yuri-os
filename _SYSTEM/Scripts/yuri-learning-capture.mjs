#!/usr/bin/env node

import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKEND_SOURCE_ROOT = path.join(REPO_ROOT, 'backend');
const BACKEND_REQUIRE_ROOT = path.resolve(process.env.YURI_BACKEND_REQUIRE_ROOT || BACKEND_SOURCE_ROOT);
const BACKEND_NODE_MODULES = path.join(BACKEND_REQUIRE_ROOT, 'node_modules');
process.env.NODE_PATH = [BACKEND_NODE_MODULES, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const backendRequire = createRequire(path.join(BACKEND_REQUIRE_ROOT, 'package.json'));

backendRequire('ts-node').register({
  transpileOnly: true,
  dir: BACKEND_SOURCE_ROOT,
  compilerOptions: {
    module: 'CommonJS',
  },
});

const Database = backendRequire('better-sqlite3');
const originalConsoleLog = console.log;
let service;
try {
  console.log = () => {};
  service = backendRequire(path.join(BACKEND_SOURCE_ROOT, 'src/services/sessionImprovementService.ts'));
} finally {
  console.log = originalConsoleLog;
}
const {
  ensureSessionImprovementLog,
  startSessionImprovement,
  finalizeSessionImprovement,
  recordSessionReview,
  reviewLessonCandidate,
  promoteReviewedLessons,
  getSessionImprovementSummary,
} = service;

const DEFAULT_DB = path.join(REPO_ROOT, 'backend/data/yuri.db');

main();

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const dbPath = flags.db || process.env.YURI_DB_PATH || DEFAULT_DB;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSessionImprovementLog(db);

  try {
    if (command === 'summary') {
      printJson(getSessionImprovementSummary(db, numberFlag(flags.limit, 10)));
      return;
    }

    if (command === 'start') {
      const payload = readPayload(flags);
      startSessionImprovement(db, {
        sessionId: required(payload.sessionId, 'sessionId'),
        command: required(payload.command, 'command'),
        commandType: payload.commandType || 'manual',
        voiceMode: payload.voiceMode,
        topicTags: payload.topicTags || [],
        goal: payload.goal,
        metadata: payload.metadata,
      });
      printJson({ ok: true, sessionId: payload.sessionId });
      return;
    }

    if (command === 'finalize') {
      const payload = readPayload(flags);
      const session = finalizeSessionImprovement(db, {
        sessionId: required(payload.sessionId, 'sessionId'),
        outcome: payload.outcome,
        whatHappened: payload.whatHappened,
        corrections: payload.corrections,
        rework: payload.rework,
        autoScore: payload.autoScore,
        humanScore: payload.humanScore,
        whatGotBetter: payload.whatGotBetter,
        whatGotWorse: payload.whatGotWorse,
        notes: payload.notes,
        metadata: payload.metadata,
        reviewedAt: payload.reviewedAt,
      });
      printJson({ ok: Boolean(session), session });
      return;
    }

    if (command === 'review-session') {
      const payload = readPayload(flags);
      const session = recordSessionReview(
        db,
        required(payload.sessionId, 'sessionId'),
        Number(required(payload.humanScore, 'humanScore')),
        payload.notes
      );
      printJson({ ok: Boolean(session), session });
      return;
    }

    if (command === 'review-lesson') {
      const payload = readPayload(flags);
      const candidate = reviewLessonCandidate(
        db,
        Number(required(payload.candidateId, 'candidateId')),
        required(payload.action, 'action'),
        payload.revisedText,
        payload.notes
      );
      printJson({ ok: Boolean(candidate), candidate });
      return;
    }

    if (command === 'promote') {
      printJson({ ok: true, promoted: promoteReviewedLessons(db) });
      return;
    }

    usage(`unknown command: ${command || '(empty)'}`);
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0], flags };
}

function readPayload(flags) {
  if (!flags.json) return flags;
  try {
    return { ...flags, ...JSON.parse(String(flags.json)) };
  } catch (error) {
    usage(`invalid --json payload: ${error.message}`);
  }
}

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    usage(`${name} is required`);
  }
  return value;
}

function numberFlag(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function usage(message) {
  if (message) process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write([
    'Usage:',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs summary [--limit 10]',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs start --json {...}',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs finalize --json {...}',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs review-session --json {...}',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs review-lesson --json {...}',
    '  node _SYSTEM/Scripts/yuri-learning-capture.mjs promote',
  ].join('\n') + '\n');
  process.exit(1);
}
