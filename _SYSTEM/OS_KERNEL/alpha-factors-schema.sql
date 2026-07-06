-- alpha-factors-schema.sql — Alpha Factor Library (AFL) organ storage DDL
-- Source design: 02_RESOURCES/RESEARCH/afl-organ-design-2026-06-13.md §2.3, §3.2
-- Target DB:    _SYSTEM/OS_KERNEL/alpha-factors.db
-- Binding:      better-sqlite3 (same as search-index.db). FTS5 external-content pattern,
--               porter unicode61 tokenizer (matches search-index.db `docs` table).
--
-- Idempotent: every object uses IF NOT EXISTS so re-running the DDL is safe.
-- Phase 0 scope: storage only. No trading, no signals, no venue data.

PRAGMA journal_mode = WAL;       -- persistent once set; concurrent read during write
PRAGMA foreign_keys = ON;        -- enforce lineage / perf-log referential integrity

-- ============================================================================
-- 1. alpha_factors — core fact table
-- ============================================================================
-- Implicit INTEGER rowid is retained (NOT "WITHOUT ROWID") because the FTS5
-- external-content table keys off alpha_factors.rowid. `id` is the stable slug PK.
CREATE TABLE IF NOT EXISTS alpha_factors (
  id                    TEXT PRIMARY KEY,            -- stable kebab slug, e.g. "rsi-14"
  name                  TEXT NOT NULL,               -- human name, e.g. "RSI (14)"
  -- category is a CLOSED SET the promotion ladder + xref leg trust; CHECK rejects garbage writes.
  category              TEXT NOT NULL CHECK (category IN
                          ('momentum','trend','volatility','volume','value','quality','sentiment','cross-sectional','crypto-native')),
  formula               TEXT,                        -- formula expression / source ref
  formula_desc          TEXT,                        -- plain-English description (FTS-indexed)
  data_inputs           TEXT,                        -- JSON array, e.g. ["close","returns"]
  complexity            TEXT,                        -- "O(1)" | "O(n)" | "O(n^2)"
  holding_period        TEXT,                        -- intraday|days|weeks|months (raw taxonomy string)
  sharpe_estimate       REAL,                        -- numeric backtest Sharpe; NULL until backtested
  sharpe_tier           TEXT CHECK (sharpe_tier IS NULL OR sharpe_tier IN ('low','medium','high')),
  correlation_cluster   TEXT,                        -- e.g. "MOM-RSI-STOCH"
  -- 0/1 flags: CHECK forbids out-of-domain ints (e.g. 7) that are truthy-but-not-1 and would
  -- silently vanish from the `= 1` filters the crypto/polymarket views rely on. (red-team fix)
  crypto_compatible     INTEGER NOT NULL DEFAULT 0 CHECK (crypto_compatible IN (0,1)),
  polymarket_compatible INTEGER NOT NULL DEFAULT 0 CHECK (polymarket_compatible IN (0,1)),
  backtest_results      TEXT,                        -- JSON blob or NULL
  provenance            TEXT,                        -- source citation, e.g. "Kakushadze 2016, WQ#001"
  -- status is the promotion-ladder state; CHECK keeps it a closed set so a bogus status can never
  -- escape the lifecycle filters (hypothesis->backtested->paper-traded->live->retired). (red-team fix)
  status                TEXT NOT NULL DEFAULT 'hypothesis' CHECK (status IN
                          ('hypothesis','backtested','paper-traded','live','retired')),
  tags                  TEXT,                        -- JSON array
  metadata_json         TEXT,                        -- JSON: wq_id, crypto_relevance, polymarket_relevance, etc.
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_factors_category   ON alpha_factors(category);
CREATE INDEX IF NOT EXISTS idx_factors_status     ON alpha_factors(status);
CREATE INDEX IF NOT EXISTS idx_factors_cluster    ON alpha_factors(correlation_cluster);
CREATE INDEX IF NOT EXISTS idx_factors_sharpe     ON alpha_factors(sharpe_estimate);
CREATE INDEX IF NOT EXISTS idx_factors_crypto     ON alpha_factors(crypto_compatible);
CREATE INDEX IF NOT EXISTS idx_factors_polymarket ON alpha_factors(polymarket_compatible);

-- ============================================================================
-- 2. alpha_factors_fts — FTS5 external-content search index
-- ============================================================================
-- Column order is load-bearing: bm25() weights are positional. The store applies
-- bm25(alpha_factors_fts, 2.0, 1.5, 1.0) → name:2.0, category:1.5, formula_desc:1.0.
CREATE VIRTUAL TABLE IF NOT EXISTS alpha_factors_fts USING fts5(
  name,
  category,
  formula_desc,
  content='alpha_factors',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- External-content sync triggers (canonical SQLite pattern). Recursive triggers are
-- OFF by default, so the updated_at touch trigger below does not re-fire these.
CREATE TRIGGER IF NOT EXISTS alpha_factors_ai AFTER INSERT ON alpha_factors BEGIN
  INSERT INTO alpha_factors_fts(rowid, name, category, formula_desc)
  VALUES (new.rowid, new.name, new.category, new.formula_desc);
END;

CREATE TRIGGER IF NOT EXISTS alpha_factors_ad AFTER DELETE ON alpha_factors BEGIN
  INSERT INTO alpha_factors_fts(alpha_factors_fts, rowid, name, category, formula_desc)
  VALUES ('delete', old.rowid, old.name, old.category, old.formula_desc);
END;

CREATE TRIGGER IF NOT EXISTS alpha_factors_au AFTER UPDATE ON alpha_factors BEGIN
  INSERT INTO alpha_factors_fts(alpha_factors_fts, rowid, name, category, formula_desc)
  VALUES ('delete', old.rowid, old.name, old.category, old.formula_desc);
  INSERT INTO alpha_factors_fts(rowid, name, category, formula_desc)
  VALUES (new.rowid, new.name, new.category, new.formula_desc);
END;

-- ============================================================================
-- 3. factor_lineage — directed derivation graph (parent -> child)
-- ============================================================================
CREATE TABLE IF NOT EXISTS factor_lineage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id   TEXT NOT NULL,
  child_id    TEXT NOT NULL,
  transform   TEXT,                  -- description of the derivation step
  confidence  REAL,                  -- 0..1 confidence in the derivation link
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (parent_id) REFERENCES alpha_factors(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id)  REFERENCES alpha_factors(id) ON DELETE CASCADE,
  UNIQUE (parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_lineage_parent ON factor_lineage(parent_id);
CREATE INDEX IF NOT EXISTS idx_lineage_child  ON factor_lineage(child_id);

-- ============================================================================
-- 4. factor_performance_log — append-only time series of factor metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS factor_performance_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  factor_id    TEXT NOT NULL,
  recorded_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metric       TEXT NOT NULL,        -- e.g. "sharpe", "brier", "pnl", "drawdown"
  value        REAL,
  universe     TEXT,                 -- e.g. "BTC-perp", "top50-crypto"
  timeframe    TEXT,                 -- e.g. "1d", "1h"
  regime       TEXT,                 -- e.g. "bull", "bear", "chop", "regime-shift"
  FOREIGN KEY (factor_id) REFERENCES alpha_factors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_perf_factor   ON factor_performance_log(factor_id);
CREATE INDEX IF NOT EXISTS idx_perf_metric   ON factor_performance_log(metric);
CREATE INDEX IF NOT EXISTS idx_perf_recorded ON factor_performance_log(recorded_at);

-- ============================================================================
-- 5. factor_embeddings — future-proof vector storage (no-op until provider lands)
-- ============================================================================
CREATE TABLE IF NOT EXISTS factor_embeddings (
  factor_id   TEXT NOT NULL,
  model       TEXT NOT NULL,         -- embedding model id
  dimension   INTEGER,
  vector      BLOB,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (factor_id, model),
  FOREIGN KEY (factor_id) REFERENCES alpha_factors(id) ON DELETE CASCADE
);

-- ============================================================================
-- 6. updated_at touch trigger — auto-bump on row mutation
-- ============================================================================
-- WHEN guard: only fire when the writer did not already set updated_at, preventing
-- a self-trigger loop even if PRAGMA recursive_triggers is ever enabled.
CREATE TRIGGER IF NOT EXISTS alpha_factors_touch
AFTER UPDATE ON alpha_factors
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE alpha_factors SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
