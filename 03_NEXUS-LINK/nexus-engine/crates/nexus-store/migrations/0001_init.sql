-- nexus-store schema, migration 0001.
--
-- Invariants encoded in the DDL (not just in Rust):
--   * tenant_id TEXT NOT NULL on every row — isolation is structural.
--   * Money is integer minor units (cents) + an ISO-4217 currency TEXT column.
--     There is NEVER a REAL/float money column; a fractional cent cannot exist here.
--   * scores.p_conv is REAL — it is the bettable prediction (a probability), not money.
--   * outcomes and postings are APPEND-ONLY ledgers. A correction is a new contra-row
--     pointing back via `corrects`, never an UPDATE or DELETE. SQL triggers below make
--     the database itself refuse mutation, so the append-only contract holds even if a
--     caller bypasses the Rust layer.

-- Leads -----------------------------------------------------------------------
CREATE TABLE leads (
    tenant_id      TEXT    NOT NULL,
    id             TEXT    NOT NULL,
    reply_features TEXT    NOT NULL,           -- JSON array of f64
    conv_features  TEXT    NOT NULL,           -- JSON array of f64
    v_deal_cents   INTEGER NOT NULL,           -- money: integer cents, never REAL
    v_deal_currency TEXT   NOT NULL,           -- ISO-4217
    take_str       TEXT    NOT NULL,           -- exact Decimal, serialized as text
    effort_hours   REAL    NOT NULL,
    stage          TEXT    NOT NULL,
    captured_at    INTEGER NOT NULL,           -- unix nanoseconds (i128 fits via text? -> use seconds+nanos)
    captured_nanos INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

-- Programs --------------------------------------------------------------------
CREATE TABLE programs (
    tenant_id       TEXT    NOT NULL,
    id              TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    budget_cents    INTEGER NOT NULL,
    budget_currency TEXT    NOT NULL,
    created_at      INTEGER NOT NULL,
    created_nanos   INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

-- Assets ----------------------------------------------------------------------
CREATE TABLE assets (
    tenant_id  TEXT NOT NULL,
    id         TEXT NOT NULL,
    program_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    body       TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

-- Scores ----------------------------------------------------------------------
-- p_conv REAL is the bettable prediction captured alongside evh. It is the value
-- joined against outcomes.converted to compute the Brier calibration.
CREATE TABLE scores (
    tenant_id    TEXT    NOT NULL,
    lead_id      TEXT    NOT NULL,
    is_prior     INTEGER NOT NULL CHECK (is_prior IN (0, 1)),
    evh          REAL    NOT NULL,
    p_conv       REAL    NOT NULL,             -- the prediction, fed to brier_score
    scored_at    INTEGER NOT NULL,
    scored_nanos INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, lead_id)
);

-- Sends -----------------------------------------------------------------------
CREATE TABLE sends (
    tenant_id  TEXT    NOT NULL,
    id         TEXT    NOT NULL,
    lead_id    TEXT    NOT NULL,
    asset_id   TEXT    NOT NULL,
    sent_at    INTEGER NOT NULL,
    sent_nanos INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, id)
);

-- Outcomes (append-only ledger) ----------------------------------------------
-- converted is a hard {0,1} label. A mistaken outcome is corrected by appending a
-- new row with voided=1 referencing the original via `corrects` (a contra-row); the
-- original row is never UPDATEd or DELETEd. Triggers enforce that at the DB level.
CREATE TABLE outcomes (
    rowid_pk      INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT    NOT NULL,
    lead_id       TEXT    NOT NULL,
    predicted_p   REAL    NOT NULL,
    converted     INTEGER NOT NULL CHECK (converted IN (0, 1)),
    voided        INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
    corrects      INTEGER,                     -- nullable self-FK to rowid_pk of the corrected row
    observed_at   INTEGER NOT NULL,
    observed_nanos INTEGER NOT NULL,
    FOREIGN KEY (corrects) REFERENCES outcomes (rowid_pk)
);

CREATE TRIGGER outcomes_no_update
BEFORE UPDATE ON outcomes
BEGIN
    SELECT RAISE(ABORT, 'outcomes is append-only: correct via a contra-row, never UPDATE');
END;

CREATE TRIGGER outcomes_no_delete
BEFORE DELETE ON outcomes
BEGIN
    SELECT RAISE(ABORT, 'outcomes is append-only: correct via a contra-row, never DELETE');
END;

-- Postings (append-only double-entry ledger) ---------------------------------
-- amount_cents is signed (sign encodes direction). A correction is a contra-row whose
-- `corrects` points at the reversed posting and whose entry_group ties the reversal to
-- the original. The original row is immutable.
CREATE TABLE postings (
    rowid_pk     INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    TEXT    NOT NULL,
    id           TEXT    NOT NULL,
    lead_id      TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL,             -- signed integer cents, never REAL
    currency     TEXT    NOT NULL,
    entry_group  TEXT    NOT NULL,             -- double-entry grouping key
    corrects     INTEGER,                      -- nullable contra pointer to rowid_pk
    memo         TEXT    NOT NULL,
    posted_at    INTEGER NOT NULL,
    posted_nanos INTEGER NOT NULL,
    FOREIGN KEY (corrects) REFERENCES postings (rowid_pk)
);

CREATE TRIGGER postings_no_update
BEFORE UPDATE ON postings
BEGIN
    SELECT RAISE(ABORT, 'postings is append-only: reverse via a contra-row, never UPDATE');
END;

CREATE TRIGGER postings_no_delete
BEFORE DELETE ON postings
BEGIN
    SELECT RAISE(ABORT, 'postings is append-only: reverse via a contra-row, never DELETE');
END;

-- Gate decisions --------------------------------------------------------------
-- Persists the serde mirror of the kernel DominantTerm (the kernel enum has no
-- Serialize derive — it is internal). dominant_term stores the SerDominantTerm name.
CREATE TABLE gate_decisions (
    rowid_pk      INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT    NOT NULL,
    accept        INTEGER NOT NULL CHECK (accept IN (0, 1)),
    hard_veto     INTEGER NOT NULL CHECK (hard_veto IN (0, 1)),
    delta_u       REAL    NOT NULL,
    dominant_term TEXT    NOT NULL,            -- SerDominantTerm variant name
    reason        TEXT    NOT NULL,
    decided_at    INTEGER NOT NULL,
    decided_nanos INTEGER NOT NULL
);

CREATE INDEX idx_leads_tenant   ON leads (tenant_id);
CREATE INDEX idx_scores_tenant  ON scores (tenant_id);
CREATE INDEX idx_outcomes_tenant ON outcomes (tenant_id, lead_id);
CREATE INDEX idx_postings_tenant ON postings (tenant_id);
