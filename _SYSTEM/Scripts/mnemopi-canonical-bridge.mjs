#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  proposeMemoryWrite,
  REPO_ROOT,
  MEMORY_PROPOSAL_LOG,
  MEMORY_LEDGER_LOG,
} from './memory-kernel.mjs';

// @capability: mnemopi-canonical-bridge
// @serves: mnemopi auto-retain to yuri-memory proposals | mnemopi export seam | governed memory convergence
// @does: exports Mnemopi working_memory auto-retentions INTO YURI's canonical pipeline GATED via proposeMemoryWrite
//        (propose→decide), never raw appendClaim. Loop-guard skips yuri-seed rows; content-sha256 dedup against
//        proposals, ledger, and canonical read-view. Default dry-run — live export requires explicit --apply.
// @use: node _SYSTEM/Scripts/mnemopi-canonical-bridge.mjs [--dry-run|plan|--apply]
// @exports: exportMnemopiToCanonical, resolveMnemopiBankPath, ELIGIBLE_SOURCES
// @depends: memory-kernel.mjs (proposeMemoryWrite), better-sqlite3

export const ELIGIBLE_SOURCES = new Set(['coding-agent-transcript', 'coding-agent-retain']);

const READ_VIEW_PATH = path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-canonical', 'read-view.json');

/**
 * Resolve the Mnemopi project bank dynamically: newest ~/.omp/.../banks/YURI-OS-MUSUBI-<hash>/mnemopi.db,
 * else the shared ~/.omp/agent/memories/mnemopi/mnemopi.db fallback.
 */
export function resolveMnemopiBankPath() {
  const banksDir = path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'banks');
  if (existsSync(banksDir)) {
    const matches = readdirSync(banksDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('YURI-OS-MUSUBI-'))
      .map((entry) => {
        const dbPath = path.join(banksDir, entry.name, 'mnemopi.db');
        if (!existsSync(dbPath)) return null;
        return { dbPath, mtimeMs: statSync(dbPath).mtimeMs };
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (matches.length > 0) return matches[0].dbPath;
  }
  return path.join(homedir(), '.omp', 'agent', 'memories', 'mnemopi', 'mnemopi.db');
}

function contentSha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function truncate(text, max = 80) {
  const value = String(text || '');
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Build a seen-set of proposal/canonical content hashes. proposeMemoryWrite has no dedup — this is the bridge's
 * first line of defense. Tolerates missing files and corrupt JSONL lines.
 */
export function buildContentSeenSet(opts = {}) {
  const seen = new Set();
  const proposalLog = opts.proposalLogPath || MEMORY_PROPOSAL_LOG;
  const ledgerLog = opts.ledgerLogPath || MEMORY_LEDGER_LOG;
  const readViewPath = opts.readViewPath || READ_VIEW_PATH;

  const addContent = (content) => {
    const text = String(content || '').trim();
    if (text) seen.add(contentSha256(text));
  };

  for (const logPath of [proposalLog, ledgerLog]) {
    if (!existsSync(logPath)) continue;
    for (const line of readFileSync(logPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        addContent(JSON.parse(trimmed).content);
      } catch {
        /* skip corrupt line */
      }
    }
  }

  if (existsSync(readViewPath)) {
    try {
      const view = JSON.parse(readFileSync(readViewPath, 'utf8'));
      for (const claim of Object.values(view?.claims || {})) {
        const object = claim?.object;
        if (object && typeof object === 'object' && object.content != null) {
          addContent(object.content);
        }
      }
    } catch {
      /* skip unreadable read-view */
    }
  }

  return seen;
}

/**
 * Scan Mnemopi working_memory and propose eligible auto-retentions into the governed memory pipeline.
 * Default dry-run — pass apply:true or CLI --apply to record proposals.
 */
export function exportMnemopiToCanonical(opts = {}) {
  const apply = opts.apply === true;
  const dryRun = !apply;
  const bankPath = opts.bankPath || resolveMnemopiBankPath();

  if (!existsSync(bankPath)) {
    return {
      ok: false,
      reason: 'no-bank',
      scanned: 0,
      eligible: 0,
      alreadySeen: 0,
      proposed: 0,
      dryRun,
      bankPath,
      examples: [],
    };
  }

  const seen = buildContentSeenSet(opts);
  let scanned = 0;
  let eligible = 0;
  let alreadySeen = 0;
  let proposed = 0;
  const examples = [];

  const db = new Database(bankPath, { readonly: true });
  db.pragma('busy_timeout = 10000');

  const rows = db.prepare(
    'SELECT id, content, embed_text, source, importance, memory_type, timestamp FROM working_memory',
  ).all();

  for (const row of rows) {
    scanned += 1;
    if (!ELIGIBLE_SOURCES.has(row.source)) continue;
    eligible += 1;

    const text = String(row.embed_text || row.content || '').trim();
    if (!text) continue;

    const hash = contentSha256(text);
    if (seen.has(hash)) {
      alreadySeen += 1;
      continue;
    }

    if (examples.length < 3) examples.push(truncate(text));

    if (dryRun) {
      proposed += 1;
      seen.add(hash);
      continue;
    }

    const result = proposeMemoryWrite(
      {
        content: text,
        surface: 'yuri-memory',
        tags: ['mnemopi-export'],
        confidence: 0.6,
        reason: 'mnemopi auto-retain export — operator decision required',
        originLane: 'mnemopi',
      },
      { record: apply, lane: 'mnemopi', session: 'mnemopi-export' },
    );

    if (result.ok) {
      proposed += 1;
      seen.add(hash);
    }
  }

  db.close();

  return {
    ok: true,
    scanned,
    eligible,
    alreadySeen,
    proposed,
    dryRun,
    bankPath,
    examples,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify(exportMnemopiToCanonical({ apply }), null, 2));
}
