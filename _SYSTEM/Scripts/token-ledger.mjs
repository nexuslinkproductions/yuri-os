#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const DEFAULT_DB_PATH = path.join(repoRoot, '_SYSTEM', 'OS_KERNEL', 'memory.db');
const DEFAULT_STATE_ROOT = path.join(os.homedir(), '.yuri', 'token-ledger');
const DEFAULT_QUEUE_DIR = path.join(DEFAULT_STATE_ROOT, 'queue');
const DEFAULT_FAULT_DIR = path.join(DEFAULT_STATE_ROOT, 'faults');
const DEFAULT_VAULT_DIR = path.join(DEFAULT_STATE_ROOT, 'payload-vault');
const DEFAULT_FORMULA_VERSION = 'tokenops-v1';
const DEFAULT_ESTIMATOR_VERSION = 'chars_div_4_v1';
const LOCK_STALE_MS = 120000;

export const MEASUREMENT_TYPES = Object.freeze([
  'observed_provider',
  'observed_transcript',
  'observed_local_native',
  'estimated_tokenizer',
  'estimated_bytes',
  'reconciled_billing',
  'unobservable',
]);

export const RECONCILIATION_STATES = Object.freeze([
  'provisional',
  'matched',
  'discrepancy',
]);

const DEFAULT_RECONCILIATION_DELAY_HOURS = Object.freeze({
  'ollama-local': 0,
  'ollama-cloud': 24,
});

// @capability: token-cost-math
// @serves: token cost USD math | effective-token weighting | model pricing lookup | cost-to-completion estimation | currency parity for budget gates
// @does: the file-private TokenOps cost math (effective tokens, USD cost, model pricing find, pricing policy) exported additively so budget/admission gates reuse the SAME formula instead of duplicating it
// @use: import { calculateEffectiveTokens, calculateCostUsd, findModelPricing, getPricingPolicy, DEFAULT_POLICY } when you need to price a token usage shape — never re-derive the formula (currency parity)
// @exports: calculateEffectiveTokens, calculateCostUsd, findModelPricing, getPricingPolicy, DEFAULT_POLICY
export const DEFAULT_POLICY = Object.freeze({
  formula_version: DEFAULT_FORMULA_VERSION,
  description: 'Initial Yuri OS TokenOps effective-token policy.',
  effective_formula: 'model_multiplier * (fresh_input + 0.1 * cache_read + output_weight * output + reasoning_weight * reasoning)',
  weights: {
    model_multiplier: 1,
    output_weight: 1,
    reasoning_weight: 1,
    cache_read_weight: 0.1,
  },
  pricing_per_million: {
    default: { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 },
    'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75, reasoning: 15 },
    'claude-opus-4-7': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75, reasoning: 75 },
    'claude-haiku-4-5': { input: 0.8, output: 4, cache_read: 0.08, cache_write: 1, reasoning: 4 },
    'deepseek-v4-pro': { input: 0.27, output: 1.10, cache_read: 0.07, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'deepseek-v4-flash': { input: 0.07, output: 0.28, cache_read: 0.018, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'deepseek-r1:8b': { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 }, // local ollama - no cost
    'mimo-v2.5-pro[1m]': { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 }, // token-plan flat subscription — no per-token cost (2026-06-10)
    'mimo-v2-flash': { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 }, // token-plan flat subscription — no per-token cost (2026-06-10)
    'meta/llama-3.3-70b-instruct': { input: 0.15, output: 0.15, cache_read: 0, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'gpt-5.5': { input: 5, output: 20, cache_read: 0, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'gpt-5.4-mini': { input: 0.15, output: 0.60, cache_read: 0, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'gpt-5.3-codex-spark': { input: 0.10, output: 0.40, cache_read: 0, cache_write: 0, reasoning: 0 }, // date-verified: 2026-05-16
    'qwen2.5:7b': { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 }, // local ollama - no cost
    'qwen2.5-coder:7b': { input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0 }, // local ollama - no cost
  },
  model_multipliers: {},
});

export function resolveTokenLedgerPaths(overrides = {}) {
  const dbPath = overrides.dbPath || process.env.TOKEN_LEDGER_DB_PATH || process.env.YURI_DB_PATH || DEFAULT_DB_PATH;
  const queueDir = overrides.queueDir || process.env.TOKEN_LEDGER_QUEUE_DIR || DEFAULT_QUEUE_DIR;
  const faultDir = overrides.faultDir || process.env.TOKEN_LEDGER_FAULT_DIR || DEFAULT_FAULT_DIR;
  const vaultDir = overrides.vaultDir || process.env.TOKEN_LEDGER_VAULT_DIR || DEFAULT_VAULT_DIR;
  return {
    dbPath: path.resolve(dbPath),
    queueDir: path.resolve(queueDir),
    faultDir: path.resolve(faultDir),
    vaultDir: path.resolve(vaultDir),
    lockDir: path.resolve(`${queueDir}.lock`),
  };
}

export function estimateTokensFromText(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

export function hashPayload(value) {
  if (value === undefined || value === null || value === '') return '';
  return sha256(canonicalJson(value));
}

export function normalizeProviderUsage(provider, usage = {}, fallback = {}) {
  const u = usage || {};
  const providerName = String(provider || '').toLowerCase();

  if (providerName.includes('ollama')) {
    const native = normalizeOllamaUsage(u, fallback);
    if (providerName.includes('cloud') && native.measurement_type === 'observed_local_native') {
      return {
        ...native,
        measurement_type: 'observed_provider',
        accuracy_class: 'exact_provider',
      };
    }
    return native;
  }

  if (providerName.includes('anthropic') || providerName.includes('claude')) {
    return {
      input_tokens: numberOrZero(u.input_tokens),
      output_tokens: numberOrZero(u.output_tokens),
      cache_read_tokens: numberOrZero(u.cache_read_input_tokens),
      cache_write_tokens: numberOrZero(u.cache_creation_input_tokens),
      reasoning_tokens: 0,
      measurement_type: 'observed_provider',
      accuracy_class: 'exact_provider',
    };
  }

  const inputDetails = u.prompt_tokens_details || u.input_tokens_details || {};
  const outputDetails = u.completion_tokens_details || u.output_tokens_details || {};
  const inputTokens = numberOrZero(u.prompt_tokens ?? u.input_tokens);
  const outputTokens = numberOrZero(u.completion_tokens ?? u.output_tokens);
  return {
    input_tokens: inputTokens || numberOrZero(fallback.input_tokens),
    output_tokens: outputTokens || numberOrZero(fallback.output_tokens),
    cache_read_tokens: numberOrZero(inputDetails.cached_tokens),
    cache_write_tokens: numberOrZero(inputDetails.cache_creation_input_tokens),
    reasoning_tokens: numberOrZero(outputDetails.reasoning_tokens),
    measurement_type: inputTokens || outputTokens ? 'observed_provider' : 'estimated_tokenizer',
    accuracy_class: inputTokens || outputTokens ? 'exact_provider' : 'estimate_chars_div_4_pm25',
  };
}

export function normalizeOllamaUsage(data = {}, fallback = {}) {
  const input = numberOrZero(data.prompt_eval_count);
  const output = numberOrZero(data.eval_count);
  if (input || output) {
    return {
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 0,
      measurement_type: 'observed_local_native',
      accuracy_class: 'native_local_count',
      latency_ms: numberOrUndefined(data.total_duration ? Math.round(data.total_duration / 1e6) : undefined),
    };
  }
  return {
    input_tokens: numberOrZero(fallback.input_tokens),
    output_tokens: numberOrZero(fallback.output_tokens),
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    measurement_type: 'estimated_tokenizer',
    accuracy_class: 'estimate_chars_div_4_pm25',
  };
}

export async function recordTokenEvent(event, options = {}) {
  try {
    const paths = resolveTokenLedgerPaths(options);
    const queued = enqueueTokenEvent(event, paths);
    if (options.drain === false || process.env.TOKEN_LEDGER_AUTO_DRAIN === '0') {
      return { ok: true, queued: true, queue_file: queued.queueFile, drained: false };
    }
    const drained = drainTokenLedger(paths);
    if (drained.error || drained.failed > 0) {
      return { ok: false, queued: true, queue_file: queued.queueFile, drained: true, ...drained };
    }
    return { ok: true, queued: true, queue_file: queued.queueFile, drained: true, ...drained };
  } catch (error) {
    const paths = resolveTokenLedgerPaths(options);
    const fault = writeFault('record_failed', error, event, paths);
    return { ok: false, queued: false, drained: false, fault_file: fault };
  }
}

export function enqueueTokenEvent(event, paths = resolveTokenLedgerPaths()) {
  mkdirSync(paths.queueDir, { recursive: true });
  const normalized = normalizeTokenEvent(event);
  const fileName = `${Date.now()}-${process.pid}-${randomUUID()}.json`;
  const finalPath = path.join(paths.queueDir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(normalized)}\n`, { mode: 0o600 });
  renameSync(tmpPath, finalPath);
  return { queueFile: finalPath, event: normalized };
}

export function drainTokenLedger(paths = resolveTokenLedgerPaths()) {
  mkdirSync(paths.queueDir, { recursive: true });
  mkdirSync(paths.faultDir, { recursive: true });
  const lock = acquireLock(paths);
  if (!lock.acquired) return { lock_acquired: false, inserted: 0, skipped: 0, failed: 0 };

  let db;
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  try {
    db = openDatabase(paths.dbPath);
    initTokenLedger(db);
    const files = readdirSync(paths.queueDir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    for (const fileName of files) {
      const filePath = path.join(paths.queueDir, fileName);
      try {
        const event = JSON.parse(readFileSync(filePath, 'utf8'));
        const row = insertLedgerEvent(db, event);
        inserted += row.inserted ? 1 : 0;
        skipped += row.inserted ? 0 : 1;
        unlinkSync(filePath);
      } catch (error) {
        failed += 1;
        writeFault('drain_event_failed', error, { queue_file: fileName }, paths);
        try {
          renameSync(filePath, `${filePath}.bad`);
        } catch (_) {
          // Keep bad event visible; do not throw from drain.
        }
      }
    }
  } catch (error) {
    if (error.code === 'BETTER_SQLITE3_UNAVAILABLE') {
      // DB engine absent (e.g. backend removed): events stay safely queued on disk
      // for a later drain. Not a fault — degrade quietly so the Stop hook exits 0.
      return { lock_acquired: true, inserted, skipped, failed, db_deferred: true };
    }
    writeFault('drain_failed', error, {}, paths);
    return { lock_acquired: true, inserted, skipped, failed: failed + 1, error: error.message };
  } finally {
    try {
      db?.close();
    } catch (_) {}
    releaseLock(paths);
  }

  return { lock_acquired: true, inserted, skipped, failed };
}

export function initTokenLedger(dbOrPath = resolveTokenLedgerPaths().dbPath) {
  const db = typeof dbOrPath === 'string' ? openDatabase(dbOrPath) : dbOrPath;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');
  db.exec(`
CREATE TABLE IF NOT EXISTS token_schema_versions (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS token_policy_versions (
  formula_version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  effective_formula TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  pricing_json TEXT NOT NULL,
  model_multipliers_json TEXT NOT NULL,
  active_from TEXT NOT NULL DEFAULT (datetime('now')),
  active_until TEXT
);

CREATE TABLE IF NOT EXISTS token_ledger (
  sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  session_id TEXT,
  source_path TEXT NOT NULL,
  lane TEXT,
  provider TEXT,
  request_model TEXT,
  response_model TEXT,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  measurement_type TEXT NOT NULL CHECK (measurement_type IN (
    'observed_provider',
    'observed_transcript',
    'observed_local_native',
    'estimated_tokenizer',
    'estimated_bytes',
    'reconciled_billing',
    'unobservable'
  )),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  cost_usd REAL NOT NULL DEFAULT 0,
  effective_tokens REAL NOT NULL DEFAULT 0,
  formula_version TEXT NOT NULL REFERENCES token_policy_versions(formula_version),
  accuracy_class TEXT NOT NULL,
  estimator_version TEXT,
  payload_hash TEXT,
  redaction_class TEXT NOT NULL DEFAULT 'metadata_only',
  retention_label TEXT NOT NULL DEFAULT 'standard',
  vault_pointer TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  error_class TEXT,
  error_message_hash TEXT,
  prev_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_payload_vault (
  payload_hash TEXT PRIMARY KEY,
  vault_pointer TEXT NOT NULL,
  redaction_class TEXT NOT NULL,
  retention_label TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS token_ledger_faults (
  fault_id TEXT PRIMARY KEY,
  fault_type TEXT NOT NULL,
  error_class TEXT NOT NULL,
  error_message_hash TEXT NOT NULL,
  event_hash TEXT,
  queue_file TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS token_ledger_reconciliation (
  event_id TEXT PRIMARY KEY REFERENCES token_ledger(event_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('provisional', 'matched', 'discrepancy')),
  provider_export_id TEXT,
  provider_usage_json TEXT NOT NULL DEFAULT '{}',
  discrepancy_json TEXT NOT NULL DEFAULT '{}',
  delay_until TEXT,
  matched_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_created_at ON token_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_token_ledger_trace_id ON token_ledger(trace_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_session_id ON token_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_source_path ON token_ledger(source_path);
CREATE INDEX IF NOT EXISTS idx_token_ledger_lane ON token_ledger(lane);
CREATE INDEX IF NOT EXISTS idx_token_ledger_provider ON token_ledger(provider);
CREATE INDEX IF NOT EXISTS idx_token_ledger_request_model ON token_ledger(request_model);
CREATE INDEX IF NOT EXISTS idx_token_ledger_operation_type ON token_ledger(operation_type);
CREATE INDEX IF NOT EXISTS idx_token_ledger_measurement_type ON token_ledger(measurement_type);
CREATE INDEX IF NOT EXISTS idx_token_ledger_formula_version ON token_ledger(formula_version);
CREATE INDEX IF NOT EXISTS idx_token_ledger_reconciliation_provider ON token_ledger_reconciliation(provider, state, delay_until);

CREATE VIEW IF NOT EXISTS token_ledger_daily_rollup AS
SELECT
  substr(created_at, 1, 10) AS day,
  COALESCE(source_path, '') AS source_path,
  COALESCE(lane, '') AS lane,
  COALESCE(provider, '') AS provider,
  COALESCE(response_model, request_model, '') AS model,
  operation_type,
  measurement_type,
  COUNT(*) AS events,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cache_read_tokens) AS cache_read_tokens,
  SUM(cache_write_tokens) AS cache_write_tokens,
  SUM(reasoning_tokens) AS reasoning_tokens,
  SUM(cost_usd) AS cost_usd,
  SUM(effective_tokens) AS effective_tokens
FROM token_ledger
GROUP BY day, source_path, lane, provider, model, operation_type, measurement_type;
`);

  const schemaCount = db.prepare('SELECT COUNT(*) AS c FROM token_schema_versions WHERE version = 1').get().c;
  if (!schemaCount) {
    db.prepare('INSERT INTO token_schema_versions (version, description) VALUES (?, ?)').run(1, 'Yuri OS TokenOps ledger v1');
  }

  const policyCount = db.prepare('SELECT COUNT(*) AS c FROM token_policy_versions WHERE formula_version = ?').get(DEFAULT_FORMULA_VERSION).c;
  if (!policyCount) {
    db.prepare(`
      INSERT INTO token_policy_versions (
        formula_version,
        description,
        effective_formula,
        weights_json,
        pricing_json,
        model_multipliers_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      DEFAULT_POLICY.formula_version,
      DEFAULT_POLICY.description,
      DEFAULT_POLICY.effective_formula,
      JSON.stringify(DEFAULT_POLICY.weights),
      JSON.stringify(DEFAULT_POLICY.pricing_per_million),
      JSON.stringify(DEFAULT_POLICY.model_multipliers),
    );
  }
  return db;
}

export function insertLedgerEvent(db, event) {
  const normalized = normalizeTokenEvent(event);
  const existing = db.prepare('SELECT event_id FROM token_ledger WHERE event_id = ?').get(normalized.event_id);
  if (existing) return { inserted: false, event_id: normalized.event_id };

  const policy = getPolicy(db, normalized.formula_version);
  const prev = db.prepare('SELECT event_hash FROM token_ledger ORDER BY sequence_id DESC LIMIT 1').get();
  const row = {
    ...normalized,
    formula_version: policy.formula_version,
    cost_usd: normalized.cost_usd || calculateCostUsd(normalized, policy),
    effective_tokens: normalized.effective_tokens || calculateEffectiveTokens(normalized, policy),
    prev_hash: prev?.event_hash || 'GENESIS',
  };
  row.event_hash = sha256(canonicalJson(hashMaterial(row)));

  db.prepare(`
    INSERT INTO token_ledger (
      event_id, trace_id, span_id, parent_span_id, session_id, source_path, lane, provider,
      request_model, response_model, operation_type, status, measurement_type,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
      latency_ms, cost_usd, effective_tokens, formula_version, accuracy_class, estimator_version,
      payload_hash, redaction_class, retention_label, vault_pointer, metadata_json,
      error_class, error_message_hash, prev_hash, event_hash, created_at
    ) VALUES (
      @event_id, @trace_id, @span_id, @parent_span_id, @session_id, @source_path, @lane, @provider,
      @request_model, @response_model, @operation_type, @status, @measurement_type,
      @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens, @reasoning_tokens,
      @latency_ms, @cost_usd, @effective_tokens, @formula_version, @accuracy_class, @estimator_version,
      @payload_hash, @redaction_class, @retention_label, @vault_pointer, @metadata_json,
      @error_class, @error_message_hash, @prev_hash, @event_hash, @created_at
    )
  `).run(row);

  if (row.payload_hash && row.vault_pointer) {
    db.prepare(`
      INSERT OR IGNORE INTO token_payload_vault (
        payload_hash, vault_pointer, redaction_class, retention_label, byte_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      row.payload_hash,
      row.vault_pointer,
      row.redaction_class,
      row.retention_label,
      safeFileSize(row.vault_pointer),
      row.created_at,
    );
  }

  seedReconciliationState(db, row);

  return { inserted: true, event_id: row.event_id, event_hash: row.event_hash };
}

export function reconcileProviderExport(provider, exportRows = [], options = {}) {
  const paths = resolveTokenLedgerPaths(options);
  const db = openDatabase(paths.dbPath);
  initTokenLedger(db);
  const now = options.now || new Date().toISOString();
  try {
    const providerName = String(provider || '').trim();
    if (!providerName) throw new Error('Missing provider for reconciliation');

    let matched = 0;
    let discrepancies = 0;
    let unmatchedExports = 0;
    const rows = Array.isArray(exportRows) ? exportRows : [];

    for (const exportRow of rows) {
      const normalized = normalizeProviderExportRow(providerName, exportRow);
      const ledgerRow = findLedgerMatch(db, providerName, normalized);
      if (!ledgerRow) {
        unmatchedExports += 1;
        continue;
      }

      const discrepancy = compareUsage(ledgerRow, normalized);
      const state = Object.keys(discrepancy).length > 0 ? 'discrepancy' : 'matched';
      if (state === 'matched') matched += 1;
      else discrepancies += 1;

      upsertReconciliation(db, {
        event_id: ledgerRow.event_id,
        provider: providerName,
        state,
        provider_export_id: normalized.provider_export_id,
        provider_usage_json: canonicalJson(normalized.usage),
        discrepancy_json: canonicalJson(discrepancy),
        delay_until: null,
        matched_at: state === 'matched' ? now : null,
        updated_at: now,
      });
    }

    const aged = ageProvisionalRows(db, providerName, now);
    recordTokenEvent({
      source_path: '_SYSTEM/Scripts/token-ledger.mjs',
      provider: 'local',
      lane: 'tokenops',
      operation_type: 'observatory_reconcile',
      status: 'ok',
      measurement_type: 'unobservable',
      accuracy_class: 'self_accounting_control',
      metadata: {
        reconciled_provider: providerName,
        export_rows: rows.length,
        matched,
        discrepancies,
        unmatched_exports: unmatchedExports,
        aged_discrepancies: aged,
      },
    }, { ...paths, drain: false });

    return { ok: true, provider: providerName, export_rows: rows.length, matched, discrepancies, unmatched_exports: unmatchedExports, aged_discrepancies: aged };
  } finally {
    db.close();
  }
}

export function writePayloadVault(payload, options = {}) {
  const paths = resolveTokenLedgerPaths(options);
  mkdirSync(paths.vaultDir, { recursive: true, mode: 0o700 });
  const serialized = canonicalJson(payload);
  const payloadHash = sha256(serialized);
  const fileName = `${payloadHash}.json`;
  const vaultPointer = path.join(paths.vaultDir, fileName);
  if (!existsSync(vaultPointer)) {
    writeFileSync(vaultPointer, `${serialized}\n`, { mode: 0o600 });
  }
  return {
    payload_hash: payloadHash,
    vault_pointer: vaultPointer,
    byte_size: Buffer.byteLength(serialized),
  };
}

export function verifyHashChain(dbOrPath = resolveTokenLedgerPaths().dbPath) {
  const shouldClose = typeof dbOrPath === 'string';
  const db = shouldClose ? openDatabase(dbOrPath) : dbOrPath;
  try {
    initTokenLedger(db);
    const rows = db.prepare('SELECT * FROM token_ledger ORDER BY sequence_id ASC').all();
    let prevHash = 'GENESIS';
    for (const row of rows) {
      if (row.prev_hash !== prevHash) {
        return {
          ok: false,
          reason: 'prev_hash_mismatch',
          sequence_id: row.sequence_id,
          expected: prevHash,
          observed: row.prev_hash,
        };
      }
      const recomputed = sha256(canonicalJson(hashMaterial(row)));
      if (row.event_hash !== recomputed) {
        return {
          ok: false,
          reason: 'event_hash_mismatch',
          sequence_id: row.sequence_id,
          expected: recomputed,
          observed: row.event_hash,
        };
      }
      prevHash = row.event_hash;
    }
    return { ok: true, rows: rows.length, head_hash: prevHash };
  } finally {
    if (shouldClose) db.close();
  }
}

export function getRollups(options = {}) {
  const paths = resolveTokenLedgerPaths(options);
  const db = openDatabase(paths.dbPath);
  initTokenLedger(db);
  try {
    return db.prepare('SELECT * FROM token_ledger_daily_rollup ORDER BY day DESC, cost_usd DESC LIMIT ?').all(options.limit || 100);
  } finally {
    db.close();
  }
}

export function auditTokenLedger(options = {}) {
  const paths = resolveTokenLedgerPaths(options);
  const start = Date.now();
  recordTokenEvent({
    source_path: '_SYSTEM/Scripts/token-ledger.mjs',
    provider: 'local',
    operation_type: 'observatory_audit',
    status: 'ok',
    measurement_type: 'unobservable',
    accuracy_class: 'self_accounting_control',
    metadata: {
      budget_cost_usd: numberOrZero(process.env.TOKEN_LEDGER_AUDIT_BUDGET_USD || 0.25),
      budget_tokens: numberOrZero(process.env.TOKEN_LEDGER_AUDIT_BUDGET_TOKENS || 5000),
    },
  }, { ...paths, drain: false });
  const drain = drainTokenLedger(paths);
  const db = openDatabase(paths.dbPath);
  initTokenLedger(db);
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS events,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cost_usd), 0) AS cost_usd,
        COALESCE(SUM(effective_tokens), 0) AS effective_tokens
      FROM token_ledger
    `).get();
    const failures = db.prepare('SELECT COUNT(*) AS c FROM token_ledger_faults').get().c;
    const anomalies = db.prepare(`
      SELECT trace_id, lane, provider, response_model, operation_type, input_tokens, output_tokens, cost_usd, created_at
      FROM token_ledger
      WHERE status != 'ok'
         OR input_tokens > 50000
         OR cost_usd > 1
      ORDER BY created_at DESC
      LIMIT 25
    `).all();
    return {
      ok: true,
      duration_ms: Date.now() - start,
      drain,
      totals,
      faults: failures,
      anomalies,
    };
  } finally {
    db.close();
  }
}

export function normalizeTokenEvent(event = {}) {
  const measurementType = MEASUREMENT_TYPES.includes(event.measurement_type)
    ? event.measurement_type
    : 'unobservable';
  const metadata = sanitizeMetadata(event.metadata || event.metadata_json || {});
  const createdAt = event.created_at || new Date().toISOString();
  const payloadHash = event.payload_hash || event.payloadHash || '';
  const errorMessage = event.error_message || event.error?.message || '';
  return {
    event_id: String(event.event_id || randomUUID()),
    trace_id: String(event.trace_id || event.session_id || event.event_id || randomUUID()),
    span_id: String(event.span_id || randomUUID()),
    parent_span_id: optionalString(event.parent_span_id),
    session_id: optionalString(event.session_id || process.env.CLAUDE_SESSION_ID || process.env.CODEX_SESSION_ID || process.env.LLM_COMPAT_TASK_ID),
    source_path: String(event.source_path || 'unknown'),
    lane: optionalString(event.lane),
    provider: optionalString(event.provider),
    request_model: optionalString(event.request_model || event.model),
    response_model: optionalString(event.response_model),
    operation_type: String(event.operation_type || 'model_call'),
    status: String(event.status || 'ok'),
    measurement_type: measurementType,
    input_tokens: numberOrZero(event.input_tokens),
    output_tokens: numberOrZero(event.output_tokens),
    cache_read_tokens: numberOrZero(event.cache_read_tokens),
    cache_write_tokens: numberOrZero(event.cache_write_tokens),
    reasoning_tokens: numberOrZero(event.reasoning_tokens),
    latency_ms: numberOrUndefined(event.latency_ms),
    cost_usd: numberOrZero(event.cost_usd),
    effective_tokens: numberOrZero(event.effective_tokens),
    formula_version: String(event.formula_version || DEFAULT_FORMULA_VERSION),
    accuracy_class: String(event.accuracy_class || defaultAccuracyClass(measurementType)),
    estimator_version: optionalString(event.estimator_version || (measurementType.startsWith('estimated') ? DEFAULT_ESTIMATOR_VERSION : '')),
    payload_hash: payloadHash ? String(payloadHash) : '',
    redaction_class: String(event.redaction_class || 'metadata_only'),
    retention_label: String(event.retention_label || 'standard'),
    vault_pointer: optionalString(event.vault_pointer),
    metadata_json: canonicalJson(metadata),
    error_class: optionalString(event.error_class || event.error?.name),
    error_message_hash: errorMessage ? sha256(String(errorMessage)) : '',
    prev_hash: String(event.prev_hash || ''),
    event_hash: String(event.event_hash || ''),
    created_at: createdAt,
  };
}

let cachedBetterSqlite3;
// Resolve better-sqlite3 resiliently. The clean install lives at the repo-root
// node_modules; the legacy `_SYSTEM/backend/node_modules` copy is kept only as a
// last-resort fallback because that backend tree is being removed. Bare-resolving
// first means the Stop hooks no longer depend on the dying backend path — which was
// the source of the MODULE_NOT_FOUND spam on every stop while the backend was being
// deleted. If nothing resolves, throw ONE clean typed error so the drain/record
// catches degrade to the on-disk queue instead of dumping a native module stack.
function loadBetterSqlite3() {
  if (cachedBetterSqlite3) return cachedBetterSqlite3;
  const candidates = [
    'better-sqlite3',
    path.join(repoRoot, 'node_modules', 'better-sqlite3'),
    path.join(repoRoot, '_SYSTEM', 'backend', 'node_modules', 'better-sqlite3'),
  ];
  for (const spec of candidates) {
    try {
      cachedBetterSqlite3 = require(spec);
      return cachedBetterSqlite3;
    } catch (_) {
      // try the next candidate
    }
  }
  throw Object.assign(
    new Error('better-sqlite3 is not installed (tried repo-root and legacy backend node_modules); token-ledger DB writes are deferred to the on-disk queue'),
    { code: 'BETTER_SQLITE3_UNAVAILABLE' },
  );
}

function openDatabase(dbPath) {
  const betterSqlite3 = loadBetterSqlite3();
  const dbDir = path.dirname(dbPath);
  if (dbPath !== ':memory:' && !existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const db = new betterSqlite3(dbPath, { timeout: 10000 });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');
  return db;
}

function getPolicy(db, formulaVersion) {
  let row = db.prepare('SELECT * FROM token_policy_versions WHERE formula_version = ?').get(formulaVersion);
  if (!row) row = db.prepare('SELECT * FROM token_policy_versions WHERE formula_version = ?').get(DEFAULT_FORMULA_VERSION);
  return {
    formula_version: row.formula_version,
    weights: parseJson(row.weights_json, DEFAULT_POLICY.weights),
    pricing_per_million: parseJson(row.pricing_json, DEFAULT_POLICY.pricing_per_million),
    model_multipliers: parseJson(row.model_multipliers_json, DEFAULT_POLICY.model_multipliers),
  };
}

export function calculateEffectiveTokens(event, policy = getPricingPolicy()) {
  const weights = policy.weights || DEFAULT_POLICY.weights;
  const model = event.response_model || event.request_model || 'default';
  const modelMultiplier = policy.model_multipliers?.[model] || weights.model_multiplier || 1;
  const freshInput = Math.max(0, numberOrZero(event.input_tokens) - numberOrZero(event.cache_read_tokens));
  return modelMultiplier * (
    freshInput
    + (weights.cache_read_weight ?? 0.1) * numberOrZero(event.cache_read_tokens)
    + (weights.output_weight ?? 1) * numberOrZero(event.output_tokens)
    + (weights.reasoning_weight ?? 1) * numberOrZero(event.reasoning_tokens)
  );
}

export function calculateCostUsd(event, policy = getPricingPolicy()) {
  const pricing = policy.pricing_per_million || DEFAULT_POLICY.pricing_per_million;
  const model = event.response_model || event.request_model || 'default';
  const price = findModelPricing(pricing, model);
  return (
    (numberOrZero(event.input_tokens) / 1e6) * numberOrZero(price.input)
    + (numberOrZero(event.output_tokens) / 1e6) * numberOrZero(price.output)
    + (numberOrZero(event.cache_read_tokens) / 1e6) * numberOrZero(price.cache_read)
    + (numberOrZero(event.cache_write_tokens) / 1e6) * numberOrZero(price.cache_write)
    + (numberOrZero(event.reasoning_tokens) / 1e6) * numberOrZero(price.reasoning)
  );
}

export function findModelPricing(pricing, model) {
  const key = Object.keys(pricing).find((candidate) => candidate !== 'default' && String(model || '').includes(candidate));
  return pricing[key] || pricing.default || DEFAULT_POLICY.pricing_per_million.default;
}

// getPricingPolicy() — the DB-free accessor for the active pricing/weights policy. Budget and admission
// gates need to price a usage shape WITHOUT opening the ledger DB (which may be absent in a worktree or
// when better-sqlite3 is missing). It returns the frozen DEFAULT_POLICY shape that getPolicy() falls back
// to, normalized to the { formula_version, weights, pricing_per_million, model_multipliers } contract that
// calculateCostUsd/calculateEffectiveTokens consume. Callers that DO have a live DB can still pass a
// db-loaded policy object explicitly. This is the currency-parity seam: one formula, one pricing table.
export function getPricingPolicy() {
  return {
    formula_version: DEFAULT_POLICY.formula_version,
    weights: { ...DEFAULT_POLICY.weights },
    pricing_per_million: { ...DEFAULT_POLICY.pricing_per_million },
    model_multipliers: { ...DEFAULT_POLICY.model_multipliers },
  };
}

function safeFileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function seedReconciliationState(db, row) {
  const metadata = parseJson(row.metadata_json, {});
  const provider = String(row.provider || '').toLowerCase();
  const state = metadata.billing_state || (provider.includes('ollama-cloud') ? 'provisional' : '');
  if (state !== 'provisional') return;

  const delayHours = providerDelayHours(row.provider);
  const createdAtMs = Date.parse(row.created_at);
  const delayUntil = new Date((Number.isFinite(createdAtMs) ? createdAtMs : Date.now()) + delayHours * 60 * 60 * 1000).toISOString();
  upsertReconciliation(db, {
    event_id: row.event_id,
    provider: row.provider || 'unknown',
    state: 'provisional',
    provider_export_id: null,
    provider_usage_json: '{}',
    discrepancy_json: '{}',
    delay_until: delayUntil,
    matched_at: null,
    updated_at: new Date().toISOString(),
  }, 'ignore');
}

function upsertReconciliation(db, row, mode = 'update') {
  if (mode === 'ignore') {
    db.prepare(`
      INSERT OR IGNORE INTO token_ledger_reconciliation (
        event_id, provider, state, provider_export_id, provider_usage_json,
        discrepancy_json, delay_until, matched_at, updated_at
      ) VALUES (
        @event_id, @provider, @state, @provider_export_id, @provider_usage_json,
        @discrepancy_json, @delay_until, @matched_at, @updated_at
      )
    `).run(row);
    return;
  }

  db.prepare(`
    INSERT INTO token_ledger_reconciliation (
      event_id, provider, state, provider_export_id, provider_usage_json,
      discrepancy_json, delay_until, matched_at, updated_at
    ) VALUES (
      @event_id, @provider, @state, @provider_export_id, @provider_usage_json,
      @discrepancy_json, @delay_until, @matched_at, @updated_at
    )
    ON CONFLICT(event_id) DO UPDATE SET
      state = excluded.state,
      provider_export_id = excluded.provider_export_id,
      provider_usage_json = excluded.provider_usage_json,
      discrepancy_json = excluded.discrepancy_json,
      delay_until = excluded.delay_until,
      matched_at = excluded.matched_at,
      updated_at = excluded.updated_at
  `).run(row);
}

function normalizeProviderExportRow(provider, row = {}) {
  const usage = {
    input_tokens: numberOrZero(row.input_tokens ?? row.prompt_tokens),
    output_tokens: numberOrZero(row.output_tokens ?? row.completion_tokens),
    cache_read_tokens: numberOrZero(row.cache_read_tokens),
    cache_write_tokens: numberOrZero(row.cache_write_tokens),
    reasoning_tokens: numberOrZero(row.reasoning_tokens),
    cost_usd: numberOrZero(row.cost_usd ?? row.cost),
  };
  return {
    provider,
    event_id: optionalString(row.event_id),
    trace_id: optionalString(row.trace_id),
    provider_export_id: optionalString(row.provider_export_id || row.id),
    payload_hash: optionalString(row.payload_hash),
    request_model: optionalString(row.request_model || row.model),
    response_model: optionalString(row.response_model || row.model),
    day: optionalString(row.day || String(row.created_at || '').slice(0, 10)),
    usage,
  };
}

function findLedgerMatch(db, provider, exportRow) {
  if (exportRow.event_id) {
    const byEvent = db.prepare('SELECT * FROM token_ledger WHERE provider = ? AND event_id = ?').get(provider, exportRow.event_id);
    if (byEvent) return byEvent;
  }
  if (exportRow.trace_id) {
    const byTrace = db.prepare(`
      SELECT *
      FROM token_ledger
      WHERE provider = ?
        AND trace_id = ?
        AND COALESCE(response_model, request_model, '') = COALESCE(?, response_model, request_model, '')
      ORDER BY created_at ASC
      LIMIT 1
    `).get(provider, exportRow.trace_id, exportRow.response_model || exportRow.request_model);
    if (byTrace) return byTrace;
  }
  if (exportRow.payload_hash) {
    return db.prepare('SELECT * FROM token_ledger WHERE provider = ? AND payload_hash = ? ORDER BY created_at ASC LIMIT 1').get(provider, exportRow.payload_hash);
  }
  return null;
}

function compareUsage(ledgerRow, exportRow) {
  const discrepancy = {};
  for (const key of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens']) {
    const ledgerValue = numberOrZero(ledgerRow[key]);
    const exportValue = numberOrZero(exportRow.usage[key]);
    if (ledgerValue !== exportValue) discrepancy[key] = { ledger: ledgerValue, export: exportValue };
  }
  const ledgerCost = Number(ledgerRow.cost_usd || 0);
  const exportCost = Number(exportRow.usage.cost_usd || 0);
  if (exportCost > 0 && Math.abs(ledgerCost - exportCost) > 0.000001) {
    discrepancy.cost_usd = { ledger: ledgerCost, export: exportCost };
  }
  return discrepancy;
}

function ageProvisionalRows(db, provider, nowIso) {
  const nowMs = Date.parse(nowIso);
  const rows = db.prepare(`
    SELECT event_id, delay_until
    FROM token_ledger_reconciliation
    WHERE provider = ?
      AND state = 'provisional'
      AND delay_until IS NOT NULL
  `).all(provider);
  let aged = 0;
  for (const row of rows) {
    const delayMs = Date.parse(row.delay_until);
    if (Number.isFinite(delayMs) && delayMs <= nowMs) {
      db.prepare(`
        UPDATE token_ledger_reconciliation
        SET state = 'discrepancy',
            discrepancy_json = ?,
            updated_at = ?
        WHERE event_id = ?
      `).run(canonicalJson({ reason: 'provider_export_missing_after_delay_window' }), nowIso, row.event_id);
      aged += 1;
    }
  }
  return aged;
}

function providerDelayHours(provider) {
  const key = String(provider || '').toLowerCase();
  const envDelay = numberOrZero(process.env[`TOKEN_RECONCILE_DELAY_HOURS_${key.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`]);
  if (envDelay > 0) return envDelay;
  return DEFAULT_RECONCILIATION_DELAY_HOURS[key] ?? 24;
}

function hashMaterial(row) {
  return {
    event_id: row.event_id,
    trace_id: row.trace_id,
    span_id: row.span_id,
    parent_span_id: row.parent_span_id || '',
    session_id: row.session_id || '',
    source_path: row.source_path,
    lane: row.lane || '',
    provider: row.provider || '',
    request_model: row.request_model || '',
    response_model: row.response_model || '',
    operation_type: row.operation_type,
    status: row.status,
    measurement_type: row.measurement_type,
    input_tokens: numberOrZero(row.input_tokens),
    output_tokens: numberOrZero(row.output_tokens),
    cache_read_tokens: numberOrZero(row.cache_read_tokens),
    cache_write_tokens: numberOrZero(row.cache_write_tokens),
    reasoning_tokens: numberOrZero(row.reasoning_tokens),
    latency_ms: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    cost_usd: Number(row.cost_usd || 0),
    effective_tokens: Number(row.effective_tokens || 0),
    formula_version: row.formula_version,
    accuracy_class: row.accuracy_class,
    estimator_version: row.estimator_version || '',
    payload_hash: row.payload_hash || '',
    redaction_class: row.redaction_class,
    retention_label: row.retention_label,
    vault_pointer: row.vault_pointer || '',
    metadata_json: row.metadata_json || '{}',
    error_class: row.error_class || '',
    error_message_hash: row.error_message_hash || '',
    prev_hash: row.prev_hash,
    created_at: row.created_at,
  };
}

function acquireLock(paths) {
  mkdirSync(path.dirname(paths.lockDir), { recursive: true });
  try {
    mkdirSync(paths.lockDir);
    writeFileSync(path.join(paths.lockDir, 'lock.json'), JSON.stringify({
      pid: process.pid,
      acquired_at: new Date().toISOString(),
    }));
    return { acquired: true };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const stat = statSync(paths.lockDir);
      if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        rmSync(paths.lockDir, { recursive: true, force: true });
        return acquireLock(paths);
      }
    } catch (_) {}
    return { acquired: false };
  }
}

function releaseLock(paths) {
  rmSync(paths.lockDir, { recursive: true, force: true });
}

function writeFault(faultType, error, event, paths = resolveTokenLedgerPaths()) {
  try {
    mkdirSync(paths.faultDir, { recursive: true, mode: 0o700 });
    const fault = {
      fault_id: randomUUID(),
      fault_type: faultType,
      error_class: error?.name || 'Error',
      error_message_hash: sha256(error?.message || String(error)),
      event_hash: event ? hashPayload(sanitizeMetadata(event)) : '',
      queue_file: event?.queue_file || '',
      created_at: new Date().toISOString(),
    };
    const file = path.join(paths.faultDir, `${Date.now()}-${fault.fault_id}.json`);
    writeFileSync(file, `${JSON.stringify(fault, null, 2)}\n`, { mode: 0o600 });
    try {
      const db = openDatabase(paths.dbPath);
      initTokenLedger(db);
      db.prepare(`
        INSERT OR IGNORE INTO token_ledger_faults (
          fault_id, fault_type, error_class, error_message_hash, event_hash, queue_file, created_at
        ) VALUES (
          @fault_id, @fault_type, @error_class, @error_message_hash, @event_hash, @queue_file, @created_at
        )
      `).run(fault);
      db.close();
    } catch (_) {}
    return file;
  } catch (_) {
    return '';
  }
}

function sanitizeMetadata(value) {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (!value || typeof value !== 'object') return safeScalar(value);
  const out = {};
  const redacted = [];
  for (const [key, raw] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) {
      redacted.push(key);
      continue;
    }
    out[key] = sanitizeMetadata(raw);
  }
  if (redacted.length > 0) out._redacted_keys = redacted.sort();
  return out;
}

function isSensitiveMetadataKey(key) {
  return /^(prompt|input|output|content|message|messages|instructions|raw|response|completion)$/i.test(key)
    || /(_text|Text|_message|Message|_content|Content)$/.test(key);
}

function safeScalar(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  const str = String(value);
  return str.length > 512 ? `${str.slice(0, 512)}...` : str;
}

function defaultAccuracyClass(measurementType) {
  if (measurementType === 'observed_provider') return 'exact_provider';
  if (measurementType === 'observed_transcript') return 'exact_transcript';
  if (measurementType === 'observed_local_native') return 'native_local_count';
  if (measurementType === 'reconciled_billing') return 'billing_reconciled';
  if (measurementType === 'estimated_bytes') return 'estimate_bytes_pm50';
  if (measurementType === 'estimated_tokenizer') return 'estimate_chars_div_4_pm25';
  return 'not_measurable';
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numberOrUndefined(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function canonicalJson(value) {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = sortForJson(value[key]);
    return acc;
  }, {});
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const paths = parsePathArgs(args);
  if (command === 'init') {
    const db = initTokenLedger(paths.dbPath);
    db.close?.();
    console.log(JSON.stringify({ ok: true, db_path: paths.dbPath }));
    return;
  }
  if (command === 'write') {
    const event = JSON.parse(readFileSync(0, 'utf8'));
    const result = await recordTokenEvent(event, { ...paths, drain: !args.includes('--no-drain') });
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }
  if (command === 'drain') {
    console.log(JSON.stringify(drainTokenLedger(paths)));
    return;
  }
  if (command === 'verify') {
    const result = verifyHashChain(paths.dbPath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }
  if (command === 'rollup') {
    console.log(JSON.stringify(getRollups(paths), null, 2));
    return;
  }
  if (command === 'audit') {
    console.log(JSON.stringify(auditTokenLedger(paths), null, 2));
    return;
  }
  if (command === 'reconcile') {
    const provider = getArg(args, '--provider') || process.env.TOKEN_RECONCILE_PROVIDER || '';
    const exportPath = getArg(args, '--export');
    if (!provider || !exportPath) {
      console.error('Usage: token-ledger.mjs reconcile --provider <name> --export <json-file> [--db path]');
      process.exit(64);
    }
    const exportRows = JSON.parse(readFileSync(exportPath, 'utf8'));
    console.log(JSON.stringify(reconcileProviderExport(provider, exportRows, paths), null, 2));
    return;
  }
  usage();
}

function parsePathArgs(args) {
  const overrides = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--db' && args[i + 1]) overrides.dbPath = args[++i];
    if (token === '--queue-dir' && args[i + 1]) overrides.queueDir = args[++i];
    if (token === '--fault-dir' && args[i + 1]) overrides.faultDir = args[++i];
    if (token === '--vault-dir' && args[i + 1]) overrides.vaultDir = args[++i];
  }
  return resolveTokenLedgerPaths(overrides);
}

function usage() {
  console.error('Usage: token-ledger.mjs <init|write|drain|verify|rollup|audit|reconcile> [--db path] [--queue-dir path] [--fault-dir path] [--vault-dir path]');
  process.exit(64);
}

function getArg(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0) return '';
  return args[idx + 1] || '';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
