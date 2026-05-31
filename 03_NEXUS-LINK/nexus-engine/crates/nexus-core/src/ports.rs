//! Persistence and ingestion ports.
//!
//! These traits are the seam between the domain and any backend. They are:
//!
//! - **object-safe** — every method has a concrete return type, no generic methods,
//!   no `Self`-by-value, so a `Box<dyn Store>` / `&dyn Store` works.
//! - **sync** — no `async`/tokio in core. A Postgres backend lives behind an
//!   off-by-default feature in a sibling crate and bridges to its own runtime there.
//! - **tenant-first** — every method takes a [`TenantId`] as its first argument so
//!   isolation is structural, not a convention a caller can forget.

use crate::error::CoreResult;
use crate::records::{
    AssetRecord, LeadId, LeadRecord, OutcomeRecord, PostingRecord, ProgramRecord, ScoreRecord,
    SendRecord,
};
use crate::tenant::TenantId;

/// The persistence port. Object-safe and synchronous; tenant id leads every call.
///
/// Implementations must enforce tenant isolation: a read for tenant `T` must never
/// return a record belonging to another tenant. A record found under the wrong
/// tenant is a [`CoreError::TenantMismatch`](crate::CoreError::TenantMismatch), and a
/// genuinely absent record is [`CoreError::NotFound`](crate::CoreError::NotFound).
pub trait Store {
    /// Inserts or replaces a lead under its tenant.
    fn put_lead(&mut self, tenant: TenantId, lead: &LeadRecord) -> CoreResult<()>;

    /// Fetches a lead by id, scoped to `tenant`.
    fn get_lead(&self, tenant: TenantId, id: LeadId) -> CoreResult<LeadRecord>;

    /// Lists all leads for a tenant (the ranking input set).
    fn list_leads(&self, tenant: TenantId) -> CoreResult<Vec<LeadRecord>>;

    /// Inserts or replaces a program under its tenant.
    fn put_program(&mut self, tenant: TenantId, program: &ProgramRecord) -> CoreResult<()>;

    /// Inserts or replaces an asset under its tenant.
    fn put_asset(&mut self, tenant: TenantId, asset: &AssetRecord) -> CoreResult<()>;

    /// Inserts or replaces a score under its tenant.
    fn put_score(&mut self, tenant: TenantId, score: &ScoreRecord) -> CoreResult<()>;

    /// Fetches the latest score for a lead, scoped to `tenant`.
    fn get_score(&self, tenant: TenantId, lead: LeadId) -> CoreResult<ScoreRecord>;

    /// Records a send event under its tenant.
    fn put_send(&mut self, tenant: TenantId, send: &SendRecord) -> CoreResult<()>;

    /// Records a ledger posting under its tenant.
    fn put_posting(&mut self, tenant: TenantId, posting: &PostingRecord) -> CoreResult<()>;
}

/// The ingestion port — pulls raw leads from a source into the domain.
///
/// Object-safe and sync. The returned records are already tenant-stamped so the
/// caller can hand them straight to [`Store::put_lead`].
pub trait Ingestor {
    /// Pulls a batch of leads for `tenant` from the backing source.
    fn ingest(&mut self, tenant: TenantId) -> CoreResult<Vec<LeadRecord>>;
}

/// The outcome ledger — append-only outcome observations and their calibration view.
///
/// Append-only is a contract, not just a hint: there is no update or delete method.
/// [`OutcomeLedger::calibration_pairs`] yields the `(predicted_p, outcome)` pairs the
/// kernel's [`nexus_score::scoring::brier_score`] consumes to turn priors into
/// measured calibration.
pub trait OutcomeLedger {
    /// Appends an outcome observation for `tenant`.
    fn append(&mut self, tenant: TenantId, outcome: &OutcomeRecord) -> CoreResult<()>;

    /// Returns the `(predicted_p, outcome01)` pairs for `tenant`, where `outcome01`
    /// is `1.0` for a conversion and `0.0` otherwise — exactly the slice shape
    /// [`nexus_score::scoring::brier_score`] expects.
    fn calibration_pairs(&self, tenant: TenantId) -> CoreResult<Vec<(f64, f64)>>;
}
