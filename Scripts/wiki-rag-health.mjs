#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.nudimmud.wiki-rag';
const NOTEBOOK_STABLE_KEY = 'yuri-os/wiki-control-plane';
const RAW_DB_PATH = process.env.NUDIMMUD_DB_PATH;
const UID = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid;
const PLIST_PATH = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const INDEX_PATH = path.join(REPO_ROOT, '_SYSTEM/yuri-wiki/index.md');
const INGEST_REPORT_PATH = path.join(REPO_ROOT, '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md');
const LAUNCHD_REPORT_PATH = path.join(REPO_ROOT, '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md');
const DB_PATH = RAW_DB_PATH && RAW_DB_PATH !== ':memory:'
  ? path.resolve(REPO_ROOT, RAW_DB_PATH)
  : path.join(REPO_ROOT, 'backend/data/nudimmud.db');
const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, 'backend/node_modules/better-sqlite3'));

function readText(absPath) {
  return fs.readFileSync(absPath, 'utf8');
}

function extractField(text, field) {
  const match = text.match(new RegExp(`^${field}: \`([^\`]*)\`$`, 'm'));
  return match ? match[1] : null;
}

function extractCount(text, label) {
  const match = text.match(new RegExp(`^(?:-\\s+)?${label}: \`(\\d+)\`$`, 'm'));
  return match ? Number(match[1]) : null;
}

function extractNumberField(text, field) {
  const match = text.match(new RegExp(`^${field}: \`(\\d+)\`$`, 'm'));
  return match ? Number(match[1]) : null;
}

function extractIndexCount(text, label) {
  const match = text.match(new RegExp(`^- ${label}: (\\d+)$`, 'm'));
  return match ? Number(match[1]) : null;
}

function launchctlPrint() {
  return spawnSync('launchctl', ['print', `gui/${UID}/${LABEL}`], {
    encoding: 'utf8',
  });
}

function main() {
  const issues = [];
  const index = readText(INDEX_PATH);
  const ingest = readText(INGEST_REPORT_PATH);
  const launchdReport = readText(LAUNCHD_REPORT_PATH);
  const launchd = launchctlPrint();
  const db = fs.existsSync(DB_PATH) ? new Database(DB_PATH, { readonly: true }) : null;

  const indexIndexed = extractIndexCount(index, 'RAG indexed count');
  const indexChunks = extractIndexCount(index, 'RAG embedded chunk count');
  const ingestSources = extractCount(ingest, 'source_count');
  const ingestChunks = extractCount(ingest, 'chunk_count');
  const ingestEmbedded = extractCount(ingest, 'embedded_chunk_count');
  const ingestNotebookId = extractNumberField(ingest, 'notebook_id');
  const ingestNotebookStableKey = extractField(ingest, 'notebook_stable_key');
  const ingestNotebookTitle = extractField(ingest, 'notebook_title');
  const launchdStatus = extractField(launchdReport, 'launchd_state');
  const launchdLabel = extractField(launchdReport, 'launchd_label');

  if (!fs.existsSync(PLIST_PATH)) {
    issues.push(`missing plist: ${PLIST_PATH}`);
  }

  if (launchd.status !== 0) {
    issues.push(`launchctl print failed with code ${launchd.status ?? 1}`);
  }

  const launchdOutput = `${launchd.stdout ?? ''}${launchd.stderr ?? ''}`;
  if (!/state = running/.test(launchdOutput)) {
    issues.push('launchd state is not running');
  }
  if (!(launchdOutput.includes('wiki-rag-launchd.mjs') && launchdOutput.includes('run'))) {
    issues.push('launchd arguments do not reference wiki-rag-launchd.mjs run');
  }
  if (!/node Scripts\/wiki-rag-watch\.mjs/.test(spawnSync('pgrep', ['-fl', 'wiki-rag-watch'], { encoding: 'utf8' }).stdout ?? '')) {
    issues.push('watcher process not found');
  }

  if (launchdStatus !== 'running') {
    issues.push(`launchd report status is ${launchdStatus ?? 'missing'}`);
  }
  if (launchdLabel !== LABEL) {
    issues.push(`launchd report label is ${launchdLabel ?? 'missing'}`);
  }
  if (ingestNotebookId == null) {
    issues.push('ingest report notebook_id is missing');
  }
  if (ingestNotebookStableKey !== NOTEBOOK_STABLE_KEY) {
    issues.push(`ingest report notebook_stable_key is ${ingestNotebookStableKey ?? 'missing'}`);
  }
  if (!ingestNotebookTitle) {
    issues.push('ingest report notebook_title is missing');
  }

  if (indexIndexed == null || indexChunks == null) {
    issues.push('unable to parse wiki index counts');
  }
  if (ingestSources == null || ingestChunks == null || ingestEmbedded == null) {
    issues.push('unable to parse ingest report counts');
  }

  if (db) {
    const notebookRow = db.prepare('SELECT id, title, stable_key FROM notebook_notebooks WHERE stable_key = ?').get(NOTEBOOK_STABLE_KEY);
    if (!notebookRow) {
      issues.push(`no notebook row found for stable key ${NOTEBOOK_STABLE_KEY}`);
    } else {
      if (ingestNotebookId != null && notebookRow.id !== ingestNotebookId) {
        issues.push(`ingest report notebook_id ${ingestNotebookId} does not match live notebook id ${notebookRow.id}`);
      }
      if (notebookRow.stable_key !== NOTEBOOK_STABLE_KEY) {
        issues.push(`live notebook stable_key is ${notebookRow.stable_key ?? 'missing'}`);
      }

      const liveSources = db.prepare('SELECT COUNT(*) AS count FROM notebook_sources WHERE notebook_id = ?').get(notebookRow.id);
      const liveChunks = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notebook_chunks nc
        JOIN notebook_sources ns ON ns.id = nc.source_id
        WHERE ns.notebook_id = ?
      `).get(notebookRow.id);
      const liveEmbedded = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notebook_chunks nc
        JOIN notebook_sources ns ON ns.id = nc.source_id
        WHERE ns.notebook_id = ? AND ns.status = 'ready' AND nc.embedding IS NOT NULL
      `).get(notebookRow.id);

      if (indexIndexed !== Number(liveSources.count)) {
        issues.push(`index source count ${indexIndexed ?? 'n/a'} does not match live source count ${liveSources.count}`);
      }
      if (indexChunks !== Number(liveEmbedded.count)) {
        issues.push(`index chunk count ${indexChunks ?? 'n/a'} does not match live embedded chunk count ${liveEmbedded.count}`);
      }
      if (ingestSources !== Number(liveSources.count)) {
        issues.push(`ingest source count ${ingestSources ?? 'n/a'} does not match live source count ${liveSources.count}`);
      }
      if (ingestChunks !== Number(liveChunks.count)) {
        issues.push(`ingest chunk count ${ingestChunks ?? 'n/a'} does not match live chunk count ${liveChunks.count}`);
      }
      if (ingestEmbedded !== Number(liveEmbedded.count)) {
        issues.push(`ingest embedded count ${ingestEmbedded ?? 'n/a'} does not match live embedded chunk count ${liveEmbedded.count}`);
      }
    }
  } else {
    issues.push(`unable to open live notebook database at ${DB_PATH}`);
  }

  const summary = {
    ok: issues.length === 0,
    launchd: {
      label: LABEL,
      status: launchd.status,
      pid: /pid = (\d+)/.exec(launchdOutput)?.[1] ?? null,
    },
    index: {
      sources: indexIndexed,
      chunks: indexChunks,
    },
    ingest: {
      sources: ingestSources,
      chunks: ingestChunks,
      embedded: ingestEmbedded,
      notebookId: ingestNotebookId,
      notebookTitle: ingestNotebookTitle,
      notebookStableKey: ingestNotebookStableKey,
    },
    issues,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (issues.length > 0) {
    if (db) {
      db.close();
    }
    process.exit(1);
  }

  if (db) {
    db.close();
  }
}

main();
