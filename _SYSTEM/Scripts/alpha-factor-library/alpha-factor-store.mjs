// @capability: alpha-factor-library
// @serves: alpha factor | factor library | quant factor | sharpe | backtest | factor search | factor lineage | factor scoring | factor circuit | quantum sequencing
// @does: Persistent SQLite store for alpha factors with FTS5 search, lineage graph, performance tracking — the AFL organ storage layer
// @use: Reach for this before building any factor storage, quant research persistence, factor search, factor lineage, or trading signal mechanism
// @exports: openDb, getFactor, listFactors, searchFactors, upsertFactor, updateFactor, recordPerformance, getPerformance, addLineage, getLineage, getAncestors
/**
 * alpha-factor-store.mjs — AFL organ storage layer (Phase 0 CRUD).
 *
 * Thin, injection-safe CRUD over the existing better-sqlite3 DB at
 * _SYSTEM/OS_KERNEL/alpha-factors.db. The schema (alpha_factors + FTS5 external-content
 * mirror + lineage/performance/embeddings tables) is ALREADY APPLIED — this module opens
 * the DB, never re-creates it.
 *
 * Contracts honored against the live schema (verified, do not "simplify" away):
 *   - FTS5 (alpha_factors_fts) is external-content, kept in sync by AFTER INSERT/UPDATE/DELETE
 *     triggers. CRUD here NEVER writes the FTS table directly — doing so double-counts the index.
 *   - updated_at is owned by the alpha_factors_touch trigger (fires only when NEW.updated_at =
 *     OLD.updated_at). The UPDATE branch of upsert therefore EXCLUDES updated_at so the trigger
 *     can bump it; created_at keeps its INSERT default.
 *   - JSON columns (data_inputs, tags, metadata_json, backtest_results) are stringified on write,
 *     parsed on read.
 *   - Every value is a bound parameter — no user value is ever interpolated into SQL.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// alpha-factor-library/ -> Scripts/ -> _SYSTEM/ ... DB lives at _SYSTEM/OS_KERNEL/alpha-factors.db
const DB_PATH = path.resolve(__dirname, '..', '..', 'OS_KERNEL', 'alpha-factors.db');

// JSON-typed columns: stringified on write, parsed on read.
const JSON_COLS = ['data_inputs', 'tags', 'metadata_json', 'backtest_results'];

// Strict 0/1 coercion for the boolean integer flags. Only an explicit true/1/'1' is 1; everything
// else (incl. the truthy-string footguns '0'/'no'/'false') is 0 — so a filter or write can never
// silently flip a "not compatible" value to 1. (red-team fix: listFactors truthy-string coercion)
const toBit = (v) => (v === true || v === 1 || v === '1') ? 1 : 0;

// Lazy singleton for the read/write handle.
let _rwHandle = null;

/**
 * Open (or reuse) a better-sqlite3 handle. foreign_keys=ON + busy_timeout=5000 on every open.
 * The read/write handle is a lazy singleton; readonly handles are always fresh (not cached).
 */
export function openDb({ readonly = false } = {}) {
  if (!readonly && _rwHandle && _rwHandle.open) return _rwHandle;
  const db = new Database(DB_PATH, { readonly });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (!readonly) _rwHandle = db;
  return db;
}

// --- JSON (de)serialization helpers ------------------------------------------------------------

function parseRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const col of JSON_COLS) {
    const raw = out[col];
    if (raw === null || raw === undefined) {
      out[col] = null;
      continue;
    }
    try {
      out[col] = JSON.parse(raw);
    } catch {
      // Tolerate a non-JSON legacy value rather than throwing — surface it raw.
      out[col] = raw;
    }
  }
  return out;
}

function serializeJson(value) {
  if (value === null || value === undefined) return null;
  // Already a JSON string? Leave it. Otherwise stringify the JS value.
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// --- alpha_factors: read -----------------------------------------------------------------------

/** Fetch one factor by id with JSON fields parsed, or null. */
export function getFactor(id) {
  const db = openDb();
  const row = db.prepare('SELECT * FROM alpha_factors WHERE id = ?').get(id);
  return parseRow(row);
}

/**
 * List factors with optional filters, all bound as parameters (no value interpolation).
 * Filters: category, status, cluster, cryptoCompatible, polymarketCompatible, limit, offset.
 */
export function listFactors({
  category,
  status,
  cluster,
  cryptoCompatible,
  polymarketCompatible,
  limit,
  offset,
} = {}) {
  const db = openDb();
  const where = [];
  const params = [];

  if (category !== undefined && category !== null) {
    where.push('category = ?');
    params.push(category);
  }
  if (status !== undefined && status !== null) {
    where.push('status = ?');
    params.push(status);
  }
  if (cluster !== undefined && cluster !== null) {
    where.push('correlation_cluster = ?');
    params.push(cluster);
  }
  if (cryptoCompatible !== undefined && cryptoCompatible !== null) {
    where.push('crypto_compatible = ?');
    params.push(toBit(cryptoCompatible));
  }
  if (polymarketCompatible !== undefined && polymarketCompatible !== null) {
    where.push('polymarket_compatible = ?');
    params.push(toBit(polymarketCompatible));
  }

  let sql = 'SELECT * FROM alpha_factors';
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY created_at DESC, id';

  if (limit !== undefined && limit !== null) {
    sql += ' LIMIT ?';
    params.push(limit);
    if (offset !== undefined && offset !== null) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
  } else if (offset !== undefined && offset !== null) {
    // SQLite requires a LIMIT before OFFSET; -1 means "no limit".
    sql += ' LIMIT -1 OFFSET ?';
    params.push(offset);
  }

  return db.prepare(sql).all(...params).map(parseRow);
}

/**
 * FTS5 search ranked by bm25 (positional weights name:2.0, category:1.5, formula_desc:1.0).
 * Query is tokenized to [a-z0-9]+ lowercased and OR-joined for recall. No tokens -> [].
 * bm25 is more-negative-is-better, so ORDER BY rank ASC is correct.
 */
export function searchFactors(query, { limit = 20 } = {}) {
  // Unicode-aware tokenizer (\p{L}\p{N} + u flag): keeps accented/CJK letters so a non-ASCII
  // factor name is searchable, not silently dropped. (red-team fix: ASCII-only tokenizer)
  const tokens = String(query ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return [];
  const matchExpr = tokens.join(' OR ');

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT f.*, bm25(alpha_factors_fts, 2.0, 1.5, 1.0) AS rank,
              snippet(alpha_factors_fts, 2, '[', ']', '...', 12) AS snippet
       FROM alpha_factors_fts
       JOIN alpha_factors f ON f.rowid = alpha_factors_fts.rowid
       WHERE alpha_factors_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(matchExpr, limit);

  return rows.map((row) => {
    const { rank, snippet, ...factorCols } = row;
    const parsed = parseRow(factorCols);
    return { ...parsed, rank, snippet };
  });
}

// --- alpha_factors: write ----------------------------------------------------------------------

// Mutable columns updatable on conflict. id is the conflict key; created_at/updated_at are
// trigger/default-owned and intentionally excluded from the UPDATE SET.
const UPSERT_COLS = [
  'id',
  'name',
  'category',
  'formula',
  'formula_desc',
  'data_inputs',
  'complexity',
  'holding_period',
  'sharpe_estimate',
  'sharpe_tier',
  'correlation_cluster',
  'crypto_compatible',
  'polymarket_compatible',
  'backtest_results',
  'provenance',
  'status',
  'tags',
  'metadata_json',
];

let _upsertStmt = null;

function getUpsertStmt(db) {
  if (_upsertStmt) return _upsertStmt;
  const cols = UPSERT_COLS.join(', ');
  const placeholders = UPSERT_COLS.map((c) => '@' + c).join(', ');
  // UPDATE SET covers every mutable col except id; updated_at is bumped by the touch trigger.
  const updateSet = UPSERT_COLS.filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  _upsertStmt = db.prepare(
    `INSERT INTO alpha_factors (${cols}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updateSet}`
  );
  return _upsertStmt;
}

/**
 * Insert or update a factor by id. JSON fields are stringified; integer flags coerced to 0/1.
 * created_at default applies on INSERT; updated_at is left to the touch trigger on UPDATE.
 * Returns the factor id.
 */
export function upsertFactor(factor) {
  if (!factor || typeof factor !== 'object') {
    throw new TypeError('upsertFactor: factor object required');
  }
  if (!factor.id) throw new TypeError('upsertFactor: factor.id is required');
  if (!factor.name) throw new TypeError('upsertFactor: factor.name is required');
  if (!factor.category) throw new TypeError('upsertFactor: factor.category is required');

  const db = openDb();
  const stmt = getUpsertStmt(db);

  const bind = {
    id: factor.id,
    name: factor.name,
    category: factor.category,
    formula: factor.formula ?? null,
    formula_desc: factor.formula_desc ?? null,
    data_inputs: serializeJson(factor.data_inputs),
    complexity: factor.complexity ?? null,
    holding_period: factor.holding_period ?? null,
    sharpe_estimate:
      factor.sharpe_estimate === undefined || factor.sharpe_estimate === null
        ? null
        : factor.sharpe_estimate,
    sharpe_tier: factor.sharpe_tier ?? null,
    correlation_cluster: factor.correlation_cluster ?? null,
    crypto_compatible: toBit(factor.crypto_compatible),
    polymarket_compatible: toBit(factor.polymarket_compatible),
    backtest_results: serializeJson(factor.backtest_results),
    provenance: factor.provenance ?? null,
    status: factor.status ?? 'hypothesis',
    tags: serializeJson(factor.tags),
    metadata_json: serializeJson(factor.metadata_json),
  };

  stmt.run(bind);
  return factor.id;
}

// Mutable columns a partial update may touch (everything upsert can write, minus the id key).
const MUTABLE_COLS = UPSERT_COLS.filter((c) => c !== 'id');

/**
 * PARTIAL update by id — builds the SET clause ONLY from keys present in `patch`, so an omitted
 * column keeps its stored value (unlike upsertFactor, which is a full-row write that resets omitted
 * columns to null/default). Use this for Phase-1 lifecycle patches (status, sharpe_estimate,
 * backtest_results) without read-modify-writing the whole factor. (red-team fix: full-upsert data loss)
 *
 * Column names come ONLY from the MUTABLE_COLS whitelist (never from caller keys), values are bound —
 * injection-safe. JSON columns are stringified; the integer flags are 0/1-coerced. created_at and
 * updated_at are never written here (updated_at is bumped by the touch trigger). Returns rows changed.
 */
export function updateFactor(id, patch = {}) {
  if (!id) throw new TypeError('updateFactor: id is required');
  if (!patch || typeof patch !== 'object') throw new TypeError('updateFactor: patch object required');

  const sets = [];
  const params = [];
  for (const col of MUTABLE_COLS) {
    if (!(col in patch)) continue;
    let v = patch[col];
    if (JSON_COLS.includes(col)) v = serializeJson(v);
    else if (col === 'crypto_compatible' || col === 'polymarket_compatible') v = toBit(v);
    else if (v === undefined) v = null;
    sets.push(`${col} = ?`);
    params.push(v);
  }
  if (!sets.length) return 0; // nothing provided to update — no-op

  params.push(id);
  const db = openDb();
  const info = db.prepare(`UPDATE alpha_factors SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return info.changes;
}

// --- factor_performance_log --------------------------------------------------------------------

/** Append a performance log row. Returns the new row id (lastInsertRowid). */
export function recordPerformance({ factorId, metric, value, universe, timeframe, regime } = {}) {
  if (!factorId) throw new TypeError('recordPerformance: factorId is required');
  if (!metric) throw new TypeError('recordPerformance: metric is required');

  const db = openDb();
  const info = db
    .prepare(
      `INSERT INTO factor_performance_log (factor_id, metric, value, universe, timeframe, regime)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      factorId,
      metric,
      value === undefined ? null : value,
      universe ?? null,
      timeframe ?? null,
      regime ?? null
    );
  return info.lastInsertRowid;
}

/** Fetch performance rows for a factor, newest-first. Optional metric filter; default limit 100. */
export function getPerformance(factorId, { metric, limit = 100 } = {}) {
  const db = openDb();
  const params = [factorId];
  let sql = 'SELECT * FROM factor_performance_log WHERE factor_id = ?';
  if (metric !== undefined && metric !== null) {
    sql += ' AND metric = ?';
    params.push(metric);
  }
  sql += ' ORDER BY recorded_at DESC, id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

// --- factor_lineage ----------------------------------------------------------------------------

/** Add a lineage edge parent->child. INSERT OR IGNORE on UNIQUE(parent_id, child_id). Returns row id. */
export function addLineage({ parentId, childId, transform, confidence } = {}) {
  if (!parentId) throw new TypeError('addLineage: parentId is required');
  if (!childId) throw new TypeError('addLineage: childId is required');

  const db = openDb();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO factor_lineage (parent_id, child_id, transform, confidence)
       VALUES (?, ?, ?, ?)`
    )
    .run(parentId, childId, transform ?? null, confidence === undefined ? null : confidence);
  return info.lastInsertRowid;
}

/**
 * Descendants of a factor via recursive CTE. Each { id, depth } (shallowest depth per node).
 * Depth capped < 64 (cycle guard). Uses UNION (not UNION ALL) so each (id,depth) frontier row is
 * visited once — a diamond/DAG (a node reachable by many paths) collapses instead of re-expanding
 * its subtree per path, which UNION ALL would blow up combinatorially. (red-team fix: DAG fan-out)
 */
export function getLineage(factorId) {
  const db = openDb();
  return db
    .prepare(
      `WITH RECURSIVE d(id, depth) AS (
         SELECT child_id, 1 FROM factor_lineage WHERE parent_id = ?
         UNION
         SELECT fl.child_id, d.depth + 1
           FROM factor_lineage fl JOIN d ON fl.parent_id = d.id
          WHERE d.depth < 64
       )
       SELECT id, MIN(depth) AS depth FROM d GROUP BY id ORDER BY depth, id`
    )
    .all(factorId);
}

/**
 * Ancestors of a factor via recursive CTE (walking child->parent). Each { id, depth } (shallowest).
 * Same UNION + MIN(depth) dedupe + depth<64 cycle guard as getLineage.
 */
export function getAncestors(factorId) {
  const db = openDb();
  return db
    .prepare(
      `WITH RECURSIVE a(id, depth) AS (
         SELECT parent_id, 1 FROM factor_lineage WHERE child_id = ?
         UNION
         SELECT fl.parent_id, a.depth + 1
           FROM factor_lineage fl JOIN a ON fl.child_id = a.id
          WHERE a.depth < 64
       )
       SELECT id, MIN(depth) AS depth FROM a GROUP BY id ORDER BY depth, id`
    )
    .all(factorId);
}
