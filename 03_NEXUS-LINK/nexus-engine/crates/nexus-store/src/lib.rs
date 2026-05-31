//! # nexus-store
//!
//! A synchronous, [`rusqlite`]-backed implementation of the `nexus-core` persistence
//! ports ([`Store`], [`OutcomeLedger`]) plus the honesty-loop calibration query that
//! feeds the kernel's [`nexus_score::scoring::brier_score`].
//!
//! ## What the storage layer guarantees (beyond what core already types)
//!
//! - **Tenant isolation is structural.** Every row carries `tenant_id`, every query is
//!   scoped to it, and a cross-tenant read returns nothing rather than leaking. A read
//!   whose stored `tenant_id` somehow disagrees with the scope is a typed
//!   [`CoreError::TenantMismatch`], never a silent return.
//! - **Money is integer cents + currency TEXT — never `REAL`.** The `f64` projection
//!   lives only at the EV boundary in `nexus-core`; nothing here ever stores a float in
//!   a money column.
//! - **`scores.p_conv` is the bettable prediction.** It is persisted as `REAL`
//!   alongside `evh` so the calibration join can pair it with `outcomes.converted`.
//! - **Outcomes and postings are append-only.** Corrections are contra-rows, never
//!   `UPDATE`/`DELETE`. This is enforced *twice*: the Rust API has no mutate/delete
//!   path, and SQL triggers in `migrations/0001_init.sql` make the database itself
//!   abort any `UPDATE`/`DELETE` on those tables.
//! - **The honesty loop is explicit.** [`SqliteStore::calibration_state`] joins
//!   `scores.p_conv` and `outcomes.converted`, feeds the pairs verbatim to
//!   `brier_score`, and maps the kernel's `Empty` error to
//!   [`CalibrationState::NotYetCalibrated`] — the contract's *"until outcomes are
//!   logged, every P is still a prior."*
//!
//! ## Postgres
//!
//! A Postgres backend lives behind the off-by-default `postgres` feature. The default
//! build is pure SQLite and never pulls a Postgres dependency.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
// Library paths stay strict (the workspace denies unwrap/expect/panic). In tests,
// `.unwrap()` on a Result is the idiomatic assertion — a panic there *is* the failure.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

use std::path::Path;

use nexus_core::{
    AssetRecord, CoreError, CoreResult, LeadId, LeadRecord, Money, OutcomeLedger, OutcomeRecord,
    PostingRecord, ProgramRecord, ScoreRecord, SendRecord, StageId, Store, TenantId,
};
use nexus_core::{SerDominantTerm, SerGateDecision};
use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::Decimal;
use time::OffsetDateTime;
use uuid::Uuid;

/// The embedded schema, applied once when `PRAGMA user_version` is `0`.
const MIGRATION_0001: &str = include_str!("../migrations/0001_init.sql");

/// The schema version this binary expects after migrations run.
const SCHEMA_VERSION: i64 = 1;

/// Maps any [`rusqlite`] error into the opaque [`CoreError::Store`] string variant.
fn store_err(e: rusqlite::Error) -> CoreError {
    CoreError::Store(e.to_string())
}

/// The honesty-loop result of a calibration request.
///
/// Until outcomes are logged, there is nothing to calibrate against and *every `P` is
/// still a prior* — that is [`CalibrationState::NotYetCalibrated`], not a Brier of zero.
/// Once at least one paired outcome exists, [`CalibrationState::Calibrated`] carries the
/// Brier score (lower is better; `0.25` is the always-guess-0.5 reference).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CalibrationState {
    /// No paired (prediction, outcome) samples yet. Every score is a designed prior.
    NotYetCalibrated,
    /// Brier score over the available paired samples.
    Calibrated {
        /// Mean squared error of predicted probability vs realized outcome.
        brier: f64,
        /// Number of paired samples the score was computed over.
        n: usize,
    },
}

/// A synchronous SQLite-backed store. Implements [`Store`] and [`OutcomeLedger`].
#[derive(Debug)]
pub struct SqliteStore {
    conn: Connection,
}

// ---- timestamp split helpers ---------------------------------------------------
// SQLite INTEGER is i64; whole-nanosecond unix time overflows it far from the epoch,
// so persist (whole seconds, sub-second nanos) and recombine on read. This is exact.

/// Splits an [`OffsetDateTime`] into `(unix_seconds, sub_second_nanos)`.
fn split_ts(ts: OffsetDateTime) -> (i64, i64) {
    (ts.unix_timestamp(), i64::from(ts.nanosecond()))
}

/// Recombines `(unix_seconds, sub_second_nanos)` into an [`OffsetDateTime`] (UTC).
fn join_ts(secs: i64, nanos: i64) -> CoreResult<OffsetDateTime> {
    let base = OffsetDateTime::from_unix_timestamp(secs)
        .map_err(|e| CoreError::Store(format!("invalid stored timestamp: {e}")))?;
    let nanos = u32::try_from(nanos.clamp(0, 999_999_999))
        .map_err(|e| CoreError::Store(format!("invalid stored nanos: {e}")))?;
    Ok(base + time::Duration::nanoseconds(i64::from(nanos)))
}

/// Serializes a `Vec<f64>` to a compact JSON-ish array string without a serde dep.
fn features_to_text(v: &[f64]) -> String {
    let mut s = String::with_capacity(v.len() * 8 + 2);
    s.push('[');
    for (i, x) in v.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&x.to_string());
    }
    s.push(']');
    s
}

/// Parses the array string produced by [`features_to_text`] back into a `Vec<f64>`.
fn text_to_features(s: &str) -> CoreResult<Vec<f64>> {
    let trimmed = s.trim();
    let inner = trimmed
        .strip_prefix('[')
        .and_then(|t| t.strip_suffix(']'))
        .ok_or_else(|| CoreError::Store(format!("malformed feature vector: {s}")))?;
    if inner.trim().is_empty() {
        return Ok(Vec::new());
    }
    inner
        .split(',')
        .map(|part| {
            part.trim()
                .parse::<f64>()
                .map_err(|e| CoreError::Store(format!("bad feature value '{part}': {e}")))
        })
        .collect()
}

impl SqliteStore {
    /// Opens (or creates) an on-disk database at `path` and runs migrations.
    ///
    /// # Errors
    /// [`CoreError::Store`] if the file cannot be opened or migrations fail.
    pub fn open(path: impl AsRef<Path>) -> CoreResult<Self> {
        let conn = Connection::open(path).map_err(store_err)?;
        Self::from_conn(conn)
    }

    /// Opens an in-memory database (each call is an isolated database) and migrates it.
    ///
    /// # Errors
    /// [`CoreError::Store`] if the database cannot be created or migrations fail.
    pub fn open_in_memory() -> CoreResult<Self> {
        let conn = Connection::open_in_memory().map_err(store_err)?;
        Self::from_conn(conn)
    }

    /// Wraps an existing connection, enabling foreign keys and applying migrations.
    fn from_conn(conn: Connection) -> CoreResult<Self> {
        // Foreign keys are off by default in SQLite; the contra-row self-FKs need them.
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(store_err)?;
        let mut store = SqliteStore { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Applies pending migrations based on `PRAGMA user_version`.
    fn migrate(&mut self) -> CoreResult<()> {
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(store_err)?;
        if version < 1 {
            self.conn
                .execute_batch(MIGRATION_0001)
                .map_err(store_err)?;
            // PRAGMA user_version cannot be parameterized; the value is a trusted const.
            self.conn
                .execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))
                .map_err(store_err)?;
        }
        Ok(())
    }

    /// Tenant guard: returns [`CoreError::TenantMismatch`] if a record's stored tenant
    /// disagrees with the scoped tenant. Defense-in-depth on top of the WHERE clause.
    fn guard_tenant(scope: TenantId, found: &str) -> CoreResult<()> {
        let found_uuid = Uuid::parse_str(found)
            .map_err(|e| CoreError::Store(format!("corrupt tenant_id '{found}': {e}")))?;
        if found_uuid != scope.as_uuid() {
            return Err(CoreError::TenantMismatch {
                expected: scope.as_uuid(),
                found: found_uuid,
            });
        }
        Ok(())
    }

    /// Persists a gate decision (the serde mirror of the kernel verdict) for audit.
    ///
    /// The kernel `DominantTerm` has no `Serialize`; we store the [`SerDominantTerm`]
    /// variant name. Append-only by convention (no update/delete API for it).
    ///
    /// # Errors
    /// [`CoreError::Store`] on any SQL failure.
    pub fn put_gate_decision(
        &mut self,
        tenant: TenantId,
        decision: &SerGateDecision,
        decided_at: OffsetDateTime,
    ) -> CoreResult<()> {
        let (secs, nanos) = split_ts(decided_at);
        let term = ser_dominant_name(decision.dominant_term);
        self.conn
            .execute(
                "INSERT INTO gate_decisions
                   (tenant_id, accept, hard_veto, delta_u, dominant_term, reason, decided_at, decided_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    tenant.to_string(),
                    decision.accept as i64,
                    decision.hard_veto as i64,
                    decision.delta_u,
                    term,
                    decision.reason,
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    /// The honesty loop. Runs [`SqliteStore::calibration_samples`] and feeds the pairs
    /// verbatim to [`nexus_score::scoring::brier_score`].
    ///
    /// An empty sample set is not an error here: it is the contract's
    /// [`CalibrationState::NotYetCalibrated`] — until outcomes are logged, every `P` is
    /// still a prior. The kernel's `ScoreError::Empty` is mapped to that state; every
    /// other kernel error propagates.
    ///
    /// # Errors
    /// [`CoreError::Store`] on SQL failure, or [`CoreError::Score`] if the kernel
    /// rejects a non-empty sample (e.g. an out-of-range prediction).
    pub fn calibration_state(&self, tenant: TenantId) -> CoreResult<CalibrationState> {
        let samples = self.calibration_samples(tenant)?;
        match nexus_score::scoring::brier_score(&samples) {
            Ok(brier) => Ok(CalibrationState::Calibrated {
                brier,
                n: samples.len(),
            }),
            Err(nexus_score::ScoreError::Empty { .. }) => Ok(CalibrationState::NotYetCalibrated),
            Err(e) => Err(CoreError::Score(e)),
        }
    }

    /// The raw `(predicted_p, outcome01)` calibration pairs for `tenant`.
    ///
    /// Joins `scores.p_conv` (the bettable prediction captured at scoring time) against
    /// `outcomes.converted` (ground truth) on `(tenant_id, lead_id)`, mapping the
    /// converted flag to `1.0`/`0.0`. Voided (corrected) outcome rows are excluded so a
    /// contra-row reversal does not double-count. This is exactly the slice shape
    /// [`nexus_score::scoring::brier_score`] consumes.
    ///
    /// # Errors
    /// [`CoreError::Store`] on any SQL failure.
    pub fn calibration_samples(&self, tenant: TenantId) -> CoreResult<Vec<(f64, f64)>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT s.p_conv, o.converted
                   FROM scores s
                   JOIN outcomes o
                     ON o.tenant_id = s.tenant_id AND o.lead_id = s.lead_id
                  WHERE s.tenant_id = ?1 AND o.voided = 0
                  ORDER BY o.rowid_pk",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map(params![tenant.to_string()], |r| {
                let p: f64 = r.get(0)?;
                let converted: i64 = r.get(1)?;
                Ok((p, if converted == 1 { 1.0 } else { 0.0 }))
            })
            .map_err(store_err)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(store_err)?);
        }
        Ok(out)
    }
}

/// The stable persisted name of a [`SerDominantTerm`] variant.
fn ser_dominant_name(t: SerDominantTerm) -> &'static str {
    match t {
        SerDominantTerm::ProtectedPathViolation => "ProtectedPathViolation",
        SerDominantTerm::KlDrift => "KlDrift",
        SerDominantTerm::Entropy => "Entropy",
        SerDominantTerm::Miscalibration => "Miscalibration",
        SerDominantTerm::Staleness => "Staleness",
        SerDominantTerm::None => "None",
    }
}

// ---- stage <-> text -----------------------------------------------------------

fn stage_to_text(s: StageId) -> &'static str {
    match s {
        StageId::Capture => "Capture",
        StageId::Score => "Score",
        StageId::Queue => "Queue",
        StageId::Send => "Send",
        StageId::Throttle => "Throttle",
        StageId::Followup => "Followup",
        StageId::Close => "Close",
    }
}

fn text_to_stage(s: &str) -> CoreResult<StageId> {
    match s {
        "Capture" => Ok(StageId::Capture),
        "Score" => Ok(StageId::Score),
        "Queue" => Ok(StageId::Queue),
        "Send" => Ok(StageId::Send),
        "Throttle" => Ok(StageId::Throttle),
        "Followup" => Ok(StageId::Followup),
        "Close" => Ok(StageId::Close),
        other => Err(CoreError::Store(format!("unknown stage '{other}'"))),
    }
}

impl Store for SqliteStore {
    fn put_lead(&mut self, tenant: TenantId, lead: &LeadRecord) -> CoreResult<()> {
        // Records carry their own tenant; reject a record stamped for a different one.
        if lead.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: lead.tenant_id.as_uuid(),
            });
        }
        let (cents, currency) = lead.v_deal.to_cents()?;
        let (secs, nanos) = split_ts(lead.captured_at);
        self.conn
            .execute(
                "INSERT OR REPLACE INTO leads
                   (tenant_id, id, reply_features, conv_features, v_deal_cents, v_deal_currency,
                    take_str, effort_hours, stage, captured_at, captured_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    tenant.to_string(),
                    lead.id.0.to_string(),
                    features_to_text(&lead.reply_features),
                    features_to_text(&lead.conv_features),
                    cents,
                    currency,
                    lead.take.to_string(),
                    lead.effort_hours,
                    stage_to_text(lead.stage),
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn get_lead(&self, tenant: TenantId, id: LeadId) -> CoreResult<LeadRecord> {
        let row = self
            .conn
            .query_row(
                "SELECT tenant_id, id, reply_features, conv_features, v_deal_cents, v_deal_currency,
                        take_str, effort_hours, stage, captured_at, captured_nanos
                   FROM leads
                  WHERE tenant_id = ?1 AND id = ?2",
                params![tenant.to_string(), id.0.to_string()],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, String>(6)?,
                        r.get::<_, f64>(7)?,
                        r.get::<_, String>(8)?,
                        r.get::<_, i64>(9)?,
                        r.get::<_, i64>(10)?,
                    ))
                },
            )
            .optional()
            .map_err(store_err)?
            .ok_or_else(|| CoreError::NotFound(format!("lead {id}")))?;

        Self::guard_tenant(tenant, &row.0)?;
        let id_uuid = Uuid::parse_str(&row.1)
            .map_err(|e| CoreError::Store(format!("corrupt lead id '{}': {e}", row.1)))?;
        let take = Decimal::from_str_exact(&row.6)
            .map_err(|e| CoreError::Store(format!("corrupt take '{}': {e}", row.6)))?;
        Ok(LeadRecord {
            tenant_id: tenant,
            id: LeadId::new(id_uuid),
            reply_features: text_to_features(&row.2)?,
            conv_features: text_to_features(&row.3)?,
            v_deal: Money::from_cents(row.4, row.5),
            take,
            effort_hours: row.7,
            stage: text_to_stage(&row.8)?,
            captured_at: join_ts(row.9, row.10)?,
        })
    }

    fn list_leads(&self, tenant: TenantId) -> CoreResult<Vec<LeadRecord>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT tenant_id, id, reply_features, conv_features, v_deal_cents, v_deal_currency,
                        take_str, effort_hours, stage, captured_at, captured_nanos
                   FROM leads
                  WHERE tenant_id = ?1
                  ORDER BY id",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map(params![tenant.to_string()], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, f64>(7)?,
                    r.get::<_, String>(8)?,
                    r.get::<_, i64>(9)?,
                    r.get::<_, i64>(10)?,
                ))
            })
            .map_err(store_err)?;

        let mut out = Vec::new();
        for row in rows {
            let row = row.map_err(store_err)?;
            Self::guard_tenant(tenant, &row.0)?;
            let id_uuid = Uuid::parse_str(&row.1)
                .map_err(|e| CoreError::Store(format!("corrupt lead id '{}': {e}", row.1)))?;
            let take = Decimal::from_str_exact(&row.6)
                .map_err(|e| CoreError::Store(format!("corrupt take '{}': {e}", row.6)))?;
            out.push(LeadRecord {
                tenant_id: tenant,
                id: LeadId::new(id_uuid),
                reply_features: text_to_features(&row.2)?,
                conv_features: text_to_features(&row.3)?,
                v_deal: Money::from_cents(row.4, row.5),
                take,
                effort_hours: row.7,
                stage: text_to_stage(&row.8)?,
                captured_at: join_ts(row.9, row.10)?,
            });
        }
        Ok(out)
    }

    fn put_program(&mut self, tenant: TenantId, program: &ProgramRecord) -> CoreResult<()> {
        if program.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: program.tenant_id.as_uuid(),
            });
        }
        let (cents, currency) = program.budget.to_cents()?;
        let (secs, nanos) = split_ts(program.created_at);
        self.conn
            .execute(
                "INSERT OR REPLACE INTO programs
                   (tenant_id, id, name, budget_cents, budget_currency, created_at, created_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    tenant.to_string(),
                    program.id.to_string(),
                    program.name,
                    cents,
                    currency,
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn put_asset(&mut self, tenant: TenantId, asset: &AssetRecord) -> CoreResult<()> {
        if asset.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: asset.tenant_id.as_uuid(),
            });
        }
        self.conn
            .execute(
                "INSERT OR REPLACE INTO assets (tenant_id, id, program_id, kind, body)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    tenant.to_string(),
                    asset.id.to_string(),
                    asset.program_id.to_string(),
                    asset.kind,
                    asset.body,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn put_score(&mut self, tenant: TenantId, score: &ScoreRecord) -> CoreResult<()> {
        if score.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: score.tenant_id.as_uuid(),
            });
        }
        let (secs, nanos) = split_ts(score.scored_at);
        // `p_conv` is the bettable prediction in [0, 1]; `evh` is the ranking key. Both
        // are first-class on ScoreRecord, so the prediction is persisted directly — never
        // defaulted to a placeholder — keeping the Brier calibration join honest.
        self.conn
            .execute(
                "INSERT OR REPLACE INTO scores
                   (tenant_id, lead_id, is_prior, evh, p_conv, scored_at, scored_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    tenant.to_string(),
                    score.lead_id.0.to_string(),
                    score.is_prior as i64,
                    score.evh,
                    score.p_conv,
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn get_score(&self, tenant: TenantId, lead: LeadId) -> CoreResult<ScoreRecord> {
        let row = self
            .conn
            .query_row(
                "SELECT tenant_id, lead_id, is_prior, p_conv, evh, scored_at, scored_nanos
                   FROM scores
                  WHERE tenant_id = ?1 AND lead_id = ?2",
                params![tenant.to_string(), lead.0.to_string()],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, f64>(3)?,
                        r.get::<_, f64>(4)?,
                        r.get::<_, i64>(5)?,
                        r.get::<_, i64>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(store_err)?
            .ok_or_else(|| CoreError::NotFound(format!("score for lead {lead}")))?;

        Self::guard_tenant(tenant, &row.0)?;
        let lead_uuid = Uuid::parse_str(&row.1)
            .map_err(|e| CoreError::Store(format!("corrupt lead id '{}': {e}", row.1)))?;
        Ok(ScoreRecord {
            tenant_id: tenant,
            lead_id: LeadId::new(lead_uuid),
            is_prior: row.2 != 0,
            p_conv: row.3,
            evh: row.4,
            scored_at: join_ts(row.5, row.6)?,
        })
    }

    fn put_send(&mut self, tenant: TenantId, send: &SendRecord) -> CoreResult<()> {
        if send.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: send.tenant_id.as_uuid(),
            });
        }
        let (secs, nanos) = split_ts(send.sent_at);
        self.conn
            .execute(
                "INSERT OR REPLACE INTO sends (tenant_id, id, lead_id, asset_id, sent_at, sent_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    tenant.to_string(),
                    send.id.to_string(),
                    send.lead_id.0.to_string(),
                    send.asset_id.to_string(),
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn put_posting(&mut self, tenant: TenantId, posting: &PostingRecord) -> CoreResult<()> {
        if posting.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: posting.tenant_id.as_uuid(),
            });
        }
        let (cents, currency) = posting.amount.to_cents()?;
        let (secs, nanos) = split_ts(posting.posted_at);
        // Append-only: a plain INSERT (never REPLACE). The entry_group defaults to the
        // posting's own id for a fresh entry; corrections carry their own contra group.
        self.conn
            .execute(
                "INSERT INTO postings
                   (tenant_id, id, lead_id, amount_cents, currency, entry_group, corrects, memo,
                    posted_at, posted_nanos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9)",
                params![
                    tenant.to_string(),
                    posting.id.to_string(),
                    posting.lead_id.0.to_string(),
                    cents,
                    currency,
                    posting.id.to_string(),
                    posting.memo,
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }
}

impl OutcomeLedger for SqliteStore {
    fn append(&mut self, tenant: TenantId, outcome: &OutcomeRecord) -> CoreResult<()> {
        if outcome.tenant_id != tenant {
            return Err(CoreError::TenantMismatch {
                expected: tenant.as_uuid(),
                found: outcome.tenant_id.as_uuid(),
            });
        }
        let (secs, nanos) = split_ts(outcome.observed_at);
        // Append-only: a plain INSERT. There is no update/delete path in this API; a
        // correction is a new row with voided=1 and `corrects` set, which a caller does
        // through a dedicated correction method (not exposed as mutation).
        self.conn
            .execute(
                "INSERT INTO outcomes
                   (tenant_id, lead_id, predicted_p, converted, voided, corrects, observed_at, observed_nanos)
                 VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5, ?6)",
                params![
                    tenant.to_string(),
                    outcome.lead_id.0.to_string(),
                    outcome.predicted_p,
                    outcome.converted as i64,
                    secs,
                    nanos,
                ],
            )
            .map_err(store_err)?;
        Ok(())
    }

    fn calibration_pairs(&self, tenant: TenantId) -> CoreResult<Vec<(f64, f64)>> {
        self.calibration_samples(tenant)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::OffsetDateTime;
    use uuid::Uuid;

    fn store() -> SqliteStore {
        SqliteStore::open_in_memory().unwrap()
    }

    fn tenant_a() -> TenantId {
        TenantId::new(Uuid::from_u128(0xAAAA_0000_0000_0000_0000_0000_0000_0001))
    }
    fn tenant_b() -> TenantId {
        TenantId::new(Uuid::from_u128(0xBBBB_0000_0000_0000_0000_0000_0000_0002))
    }

    fn lead(t: TenantId, id: LeadId) -> LeadRecord {
        LeadRecord {
            tenant_id: t,
            id,
            reply_features: vec![1.0, 0.5, -0.25],
            conv_features: vec![0.8],
            v_deal: Money::new(Decimal::new(20_000, 2), "EUR"), // 200.00
            take: Decimal::new(10, 2),                          // 0.10
            effort_hours: 1.5,
            stage: StageId::Score,
            captured_at: OffsetDateTime::from_unix_timestamp(1_700_000_000).unwrap(),
        }
    }

    fn outcome(t: TenantId, id: LeadId, p: f64, converted: bool) -> OutcomeRecord {
        OutcomeRecord {
            tenant_id: t,
            lead_id: id,
            predicted_p: p,
            converted,
            observed_at: OffsetDateTime::from_unix_timestamp(1_700_000_500).unwrap(),
        }
    }

    fn score_rec(t: TenantId, id: LeadId, p_conv: f64) -> ScoreRecord {
        ScoreRecord {
            tenant_id: t,
            lead_id: id,
            is_prior: true,
            p_conv,
            evh: 42.0,
            scored_at: OffsetDateTime::from_unix_timestamp(1_700_000_400).unwrap(),
        }
    }

    /// Records both the bettable prediction (scores.p_conv) and the outcome
    /// (outcomes.converted) for a lead — the two halves the calibration join pairs.
    fn predict_and_observe(s: &mut SqliteStore, t: TenantId, id: LeadId, p: f64, converted: bool) {
        s.put_score(t, &score_rec(t, id, p)).unwrap();
        s.append(t, &outcome(t, id, p, converted)).unwrap();
    }

    #[test]
    fn lead_round_trip_preserves_money_and_features() {
        let mut s = store();
        let t = tenant_a();
        let id = LeadId::new(Uuid::from_u128(0x1234));
        let l = lead(t, id);
        s.put_lead(t, &l).unwrap();

        let got = s.get_lead(t, id).unwrap();
        assert_eq!(got, l);
        // Money survived as exact cents.
        let (cents, cur) = got.v_deal.to_cents().unwrap();
        assert_eq!((cents, cur.as_str()), (20_000, "EUR"));
        assert_eq!(got.reply_features, vec![1.0, 0.5, -0.25]);
    }

    #[test]
    fn tenant_isolation_cross_tenant_read_returns_nothing() {
        let mut s = store();
        let a = tenant_a();
        let b = tenant_b();
        let id = LeadId::new(Uuid::from_u128(0x42));
        s.put_lead(a, &lead(a, id)).unwrap();

        // B cannot see A's lead by id.
        assert!(matches!(s.get_lead(b, id), Err(CoreError::NotFound(_))));
        // B's listing is empty; A's has the one lead.
        assert!(s.list_leads(b).unwrap().is_empty());
        assert_eq!(s.list_leads(a).unwrap().len(), 1);
    }

    #[test]
    fn put_lead_rejects_mismatched_tenant_stamp() {
        let mut s = store();
        let a = tenant_a();
        let b = tenant_b();
        let id = LeadId::new(Uuid::from_u128(0x7));
        // Record stamped for B, stored under scope A => typed mismatch.
        let err = s.put_lead(a, &lead(b, id)).unwrap_err();
        assert!(matches!(err, CoreError::TenantMismatch { .. }));
    }

    #[test]
    fn outcomes_are_immutable_update_and_delete_refused() {
        let mut s = store();
        let t = tenant_a();
        let id = LeadId::new(Uuid::from_u128(0x99));
        predict_and_observe(&mut s, t, id, 0.7, true);

        // Raw UPDATE is aborted by the SQL trigger.
        let upd = s
            .conn
            .execute("UPDATE outcomes SET converted = 0", []);
        assert!(upd.is_err(), "UPDATE on outcomes must be refused");
        // Raw DELETE is aborted by the SQL trigger.
        let del = s.conn.execute("DELETE FROM outcomes", []);
        assert!(del.is_err(), "DELETE on outcomes must be refused");
        // The row is still there, unchanged: the score↔outcome join still yields (0.7,1).
        let pairs = s.calibration_samples(t).unwrap();
        assert_eq!(pairs, vec![(0.7, 1.0)]);
    }

    #[test]
    fn postings_are_immutable_update_and_delete_refused() {
        let mut s = store();
        let t = tenant_a();
        let id = LeadId::new(Uuid::from_u128(0xAB));
        let p = PostingRecord {
            tenant_id: t,
            id: Uuid::from_u128(0xCD),
            lead_id: id,
            amount: Money::from_cents(-5_000, "EUR"), // a cost
            memo: "ad spend".into(),
            posted_at: OffsetDateTime::from_unix_timestamp(1_700_000_900).unwrap(),
        };
        s.put_posting(t, &p).unwrap();

        let upd = s
            .conn
            .execute("UPDATE postings SET amount_cents = 0", []);
        assert!(upd.is_err(), "UPDATE on postings must be refused");
        let del = s.conn.execute("DELETE FROM postings", []);
        assert!(del.is_err(), "DELETE on postings must be refused");
    }

    #[test]
    fn not_yet_calibrated_until_outcomes_logged() {
        let s = store();
        let t = tenant_a();
        // No outcomes => every P is still a prior.
        assert_eq!(
            s.calibration_state(t).unwrap(),
            CalibrationState::NotYetCalibrated
        );
    }

    #[test]
    fn brier_roundtrip_matches_kernel_sample() {
        // The kernel's own worked sample: predictions [0.9,0.8,0.3,0.6,0.2] with
        // outcomes [1,1,0,0,0] => Brier 0.108. Persist them as outcome rows, read them
        // back through calibration_samples, and confirm brier_score reproduces 0.108.
        let mut s = store();
        let t = tenant_a();
        let samples = [
            (0.9, true),
            (0.8, true),
            (0.3, false),
            (0.6, false),
            (0.2, false),
        ];
        for (i, (p, conv)) in samples.iter().enumerate() {
            let id = LeadId::new(Uuid::from_u128(0x1000 + i as u128));
            predict_and_observe(&mut s, t, id, *p, *conv);
        }

        let pairs = s.calibration_samples(t).unwrap();
        assert_eq!(pairs.len(), 5);
        let brier = nexus_score::scoring::brier_score(&pairs).unwrap();
        assert!(
            (brier - 0.108).abs() < 1e-3,
            "brier={brier} expected 0.108"
        );

        // And the wrapped state agrees.
        match s.calibration_state(t).unwrap() {
            CalibrationState::Calibrated { brier, n } => {
                assert_eq!(n, 5);
                assert!((brier - 0.108).abs() < 1e-3);
            }
            CalibrationState::NotYetCalibrated => panic!("should be calibrated with 5 outcomes"),
        }
    }

    #[test]
    fn calibration_excludes_other_tenants() {
        let mut s = store();
        let a = tenant_a();
        let b = tenant_b();
        predict_and_observe(&mut s, a, LeadId::new(Uuid::from_u128(1)), 0.9, true);
        predict_and_observe(&mut s, b, LeadId::new(Uuid::from_u128(2)), 0.1, false);
        // A's calibration set is exactly its own one pair.
        assert_eq!(s.calibration_samples(a).unwrap(), vec![(0.9, 1.0)]);
        assert_eq!(s.calibration_samples(b).unwrap(), vec![(0.1, 0.0)]);
    }

    #[test]
    fn append_rejects_cross_tenant_outcome_stamp() {
        let mut s = store();
        let a = tenant_a();
        let b = tenant_b();
        let err = s
            .append(a, &outcome(b, LeadId::new(Uuid::from_u128(3)), 0.5, true))
            .unwrap_err();
        assert!(matches!(err, CoreError::TenantMismatch { .. }));
    }

    #[test]
    fn score_round_trip_and_gate_decision_persist() {
        let mut s = store();
        let t = tenant_a();
        let id = LeadId::new(Uuid::from_u128(0x55));
        let sc = ScoreRecord {
            tenant_id: t,
            lead_id: id,
            is_prior: true,
            p_conv: 0.62,
            evh: 84.0,
            scored_at: OffsetDateTime::from_unix_timestamp(1_700_000_700).unwrap(),
        };
        s.put_score(t, &sc).unwrap();
        assert_eq!(s.get_score(t, id).unwrap(), sc);

        // Persist a serde-mirror gate decision (the kernel DominantTerm has no Serialize).
        let dec = SerGateDecision {
            accept: false,
            hard_veto: true,
            delta_u: -12.5,
            dominant_term: SerDominantTerm::ProtectedPathViolation,
            reason: "HARD VETO: protected path".into(),
        };
        s.put_gate_decision(t, &dec, OffsetDateTime::from_unix_timestamp(1_700_001_000).unwrap())
            .unwrap();
        let n: i64 = s
            .conn
            .query_row(
                "SELECT COUNT(*) FROM gate_decisions WHERE dominant_term = 'ProtectedPathViolation'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }
}
