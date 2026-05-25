#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_FILE = path.resolve(REPO_ROOT, '_SYSTEM/backend/data/wiki-rag-auto-state.json');
const POLL_MS = Number(process.env.WIKI_RAG_POLL_MS ?? 30000);

const INPUT_PATHS = [
  '_SYSTEM/yuri-wiki/index.md',
  '_SYSTEM/yuri-wiki/log.md',
  '_SYSTEM/yuri-wiki/source-registry.md',
  '_SYSTEM/yuri-wiki/wiki/concepts/09c-llm-wiki-compiled-memory.md',
  '_SYSTEM/yuri-wiki/reports/lint/09c-fixture-lint-report.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-deferred.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-open.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-runner.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-watcher.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd-teardown.md',
  '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-health.md',
  '_SYSTEM/yuri-wiki/schema/page.schema.md',
  '_SYSTEM/yuri-wiki/schema/lint-contract.md',
  '_SYSTEM/Scripts/wiki-rag-launchd.mjs',
  '_SYSTEM/Scripts/wiki-rag-health.mjs',
  '_SYSTEM/backend/src/scripts/ingestWikiControlPlane.ts',
  '_SYSTEM/backend/src/services/notebookService.ts',
  '_SYSTEM/backend/src/models/notebookSchema.ts',
  '_SYSTEM/backend/package.json',
  'package.json'
];

const once = process.argv.includes('--once');

let activeRun = false;
let queuedRun = false;

function log(message) {
  console.log(`[wiki-rag-auto] ${message}`);
}

function readFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath));
}

function computeDigest() {
  const hash = crypto.createHash('sha256');
  for (const relPath of INPUT_PATHS) {
    const absPath = path.resolve(REPO_ROOT, relPath);
    hash.update(relPath);
    hash.update('\0');
    hash.update(fs.existsSync(absPath) ? readFile(relPath) : Buffer.from('MISSING'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function runIngest(reason, digest) {
  if (activeRun) {
    queuedRun = true;
    log(`run already active, queueing rerun (${reason})`);
    return;
  }

  activeRun = true;
  log(`starting ingest (${reason})`);

  const child = spawn('npm', ['run', 'wiki:rag'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    activeRun = false;
    if (signal) {
      log(`ingest stopped by signal ${signal}`);
      process.exitCode = 1;
    } else {
      log(`ingest exited with code ${code ?? 0}`);
      if ((code ?? 0) === 0) {
        writeState({
          digest,
          lastRunAt: new Date().toISOString(),
          sourceCount: INPUT_PATHS.length
        });
        runHealth(`${reason}-health`);
      } else {
        process.exitCode = code ?? 1;
      }
    }

    if (queuedRun) {
      queuedRun = false;
      maybeRun('queued-change');
    }
  });
}

function runHealth(reason) {
  const result = spawnSync(process.execPath, ['_SYSTEM/Scripts/wiki-rag-health.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status === 0) {
    log(`health passed (${reason})`);
  } else {
    log(`health failed (${reason}) with code ${result.status ?? 1}`);
  }
}

function maybeRun(reason) {
  const digest = computeDigest();
  const state = readState();
  if (state?.digest === digest) {
    log(`no change detected (${reason})`);
    runHealth(`${reason}-health`);
    return;
  }
  runIngest(reason, digest);
}

function main() {
  log(`tracking ${INPUT_PATHS.length} control-plane inputs`);
  if (once) {
    maybeRun('once');
    return;
  }

  if (!Number.isFinite(POLL_MS) || POLL_MS < 1000) {
    throw new Error(`Invalid WIKI_RAG_POLL_MS value: ${process.env.WIKI_RAG_POLL_MS ?? '<unset>'}`);
  }

  maybeRun('startup');
  const timer = setInterval(() => {
    maybeRun('poll');
  }, POLL_MS);

  process.on('SIGINT', () => {
    clearInterval(timer);
    log('stopping');
    process.exit(0);
  });
}

main();
