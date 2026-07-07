#!/usr/bin/env node
/**
 * Seed YURI canonical memory into the live Mnemopi project bank.
 * Writes working_memory (+ optional memory_embeddings) only; FTS sync via wm_ai trigger.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const VETTED_PATH = path.join(REPO_ROOT, '_SYSTEM/state/memory-canonical/read-view.json');
const BREADTH_DB_PATH = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/memory.db');
const EMBED_MODEL = 'BAAI/bge-base-en-v1.5';

function discoverMnemopiDbPath() {
  const home = os.homedir();
  const banksDir = path.join(home, '.omp', 'agent', 'memories', 'mnemopi', 'banks');
  const fallback = path.join(home, '.omp', 'agent', 'memories', 'mnemopi', 'mnemopi.db');
  try {
    const candidates = fs.readdirSync(banksDir)
      .filter((f) => /^YURI-OS-MUSUBI-/.test(f))
      .sort();
    if (candidates.length) {
      return path.join(banksDir, candidates[candidates.length - 1], 'mnemopi.db');
    }
  } catch {
    /* fall through */
  }
  try {
    return fs.existsSync(fallback) ? fallback : null;
  } catch {
    return null;
  }
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function formatObjectValue(object) {
  if (typeof object === 'object' && object !== null) {
    return object.content ?? JSON.stringify(object);
  }
  return String(object);
}

function composeClaim(claim) {
  return `${claim.subject} — ${claim.predicate}: ${formatObjectValue(claim.object)}`;
}

function claimRawContent(claim) {
  const { subject, predicate, object } = claim;
  if (typeof object === 'object' && object !== null) {
    return `${subject} — ${predicate}: ${JSON.stringify(object)}`;
  }
  return composeClaim(claim);
}

function parseArgs(argv) {
  const flags = new Set();
  let limit = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vetted' || a === '--breadth' || a === '--no-embed' || a === '--dry-run' || a === '--apply') {
      flags.add(a.slice(2));
    } else if (a === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) throw new Error('--limit requires a non-negative number');
      limit = Math.floor(n);
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  const breadth = flags.has('breadth');
  const mode = breadth ? 'breadth' : 'vetted';
  const dryRun = flags.has('dry-run') || !flags.has('apply');
  return {
    mode,
    source: mode,
    limit,
    noEmbed: flags.has('no-embed'),
    dryRun,
  };
}

function loadVettedItems() {
  const raw = fs.readFileSync(VETTED_PATH, 'utf8');
  const view = JSON.parse(raw);
  const claims = view.claims || {};
  const items = [];
  for (const claim of Object.values(claims)) {
    if (claim?.provenance?.lane === 'mnemopi') continue;
    items.push({
      content: claimRawContent(claim),
      embedText: composeClaim(claim),
      memoryType: 'fact',
      srcId: claim.eventId,
      seededFrom: 'canonical',
    });
  }
  return items;
}

function loadBreadthItems(limit) {
  const src = new Database(BREADTH_DB_PATH, { readonly: true });
  src.pragma('busy_timeout = 10000');
  try {
    let sql = `
      SELECT id, canonical_summary, content, memory_type, tags
      FROM memory_items
      WHERE sensitivity = 'internal' AND status = 'active'
    `;
    if (limit != null) sql += ` LIMIT ${limit}`;
    const rows = src.prepare(sql).all();
    return rows.map((row) => {
      const summary = row.canonical_summary || '';
      const body = row.content || '';
      return {
        content: summary + body,
        embedText: summary,
        memoryType: row.memory_type || 'semantic',
        srcId: `mi:${row.id}`,
        seededFrom: 'memory.db',
      };
    });
  } finally {
    src.close();
  }
}

async function createEmbedder() {
  const { pipeline } = await import('@xenova/transformers');
  return pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5');
}

async function computeEmbedding(extractor, text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

export async function runSeed(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const bankPath = discoverMnemopiDbPath();
  if (!bankPath) {
    throw new Error('Mnemopi bank not found');
  }

  const items = opts.mode === 'breadth' ? loadBreadthItems(opts.limit) : loadVettedItems();
  const scanned = items.length;

  const report = {
    mode: opts.mode,
    source: opts.source,
    scanned,
    inserted: 0,
    skippedExisting: 0,
    embedded: 0,
    embedSkipped: false,
    dryRun: opts.dryRun,
    bankPath,
  };

  if (opts.dryRun) {
    const probe = new Database(bankPath, { readonly: true });
    probe.pragma('busy_timeout = 10000');
    try {
      const exists = probe.prepare('SELECT 1 FROM working_memory WHERE id = ? LIMIT 1');
      for (const item of items) {
        if (exists.get(hashContent(item.content))) report.skippedExisting += 1;
        else report.inserted += 1;
      }
    } finally {
      probe.close();
    }
    report.embedSkipped = true;
    console.log(JSON.stringify(report));
    return report;
  }

  const db = new Database(bankPath);
  db.pragma('busy_timeout = 10000');

  const insertWm = db.prepare(`
    INSERT OR IGNORE INTO working_memory (
      id, content, embed_text, source, timestamp, session_id, importance,
      metadata_json, veracity, memory_type, scope, trust_tier
    ) VALUES (
      @id, @content, @embed_text, @source, @timestamp, @session_id, @importance,
      @metadata_json, @veracity, @memory_type, @scope, @trust_tier
    )
  `);

  const insertEmb = db.prepare(`
    INSERT OR IGNORE INTO memory_embeddings (memory_id, embedding_json, model)
    VALUES (@memory_id, @embedding_json, @model)
  `);

  const now = new Date().toISOString();
  const newRows = [];

  const seedTxn = db.transaction((rows) => {
    for (const item of rows) {
      const id = hashContent(item.content);
      const result = insertWm.run({
        id,
        content: item.content,
        embed_text: item.embedText,
        source: 'yuri-seed',
        timestamp: now,
        session_id: 'yuri-fusion-seed',
        importance: 0.7,
        metadata_json: JSON.stringify({
          originLane: 'yuri-canonical',
          seededFrom: item.seededFrom,
          srcId: item.srcId,
        }),
        veracity: 'tool',
        memory_type: item.memoryType,
        scope: 'bank',
        trust_tier: 'STATED',
      });
      if (result.changes > 0) {
        report.inserted += 1;
        newRows.push({ id, embedText: item.embedText });
      } else {
        report.skippedExisting += 1;
      }
    }
  });

  seedTxn(items);

  const wantEmbed = !opts.noEmbed && newRows.length > 0;
  if (wantEmbed) {
    try {
      const extractor = await createEmbedder();
      const embeddedRows = [];
      for (const row of newRows) {
        if (!row.embedText) continue;
        const vec = await computeEmbedding(extractor, row.embedText);
        embeddedRows.push({ id: row.id, vec });
      }
      const embedTxn = db.transaction((rows) => {
        for (const row of rows) {
          const embResult = insertEmb.run({
            memory_id: row.id,
            embedding_json: JSON.stringify(row.vec),
            model: EMBED_MODEL,
          });
          if (embResult.changes > 0) report.embedded += 1;
        }
      });
      embedTxn(embeddedRows);
    } catch (err) {
      report.embedSkipped = true;
      console.error(`embeddings: skipped (FTS-only) — ${err?.message || err}`);
    }
  } else if (opts.noEmbed) {
    report.embedSkipped = true;
  }

  db.close();
  console.log(JSON.stringify(report));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed().catch((err) => {
    console.error(err?.stack || String(err));
    process.exit(1);
  });
}
