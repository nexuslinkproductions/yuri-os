//! Core error type for the domain port layer.
//!
//! [`CoreError`] is the single error a port returns. It absorbs the kernel's
//! [`nexus_score::ScoreError`] via `#[from]` (so the [`Rankable`](crate::Rankable)
//! and [`Veto`](crate::Veto) ports can lift kernel failures without a manual `match`)
//! and adds the domain-level failures the kernel cannot express: tenant isolation
//! breaches, illegal stage transitions, money that cannot be represented as a finite
//! `f64` at the EV boundary, opaque store/IO failures, and missing records.

use thiserror::Error;

/// Errors returned by the `nexus-core` port layer.
///
/// Library paths never panic; every fallible operation returns this instead.
#[derive(Debug, Error)]
pub enum CoreError {
    /// A kernel precondition was violated. Lifted from the math spine so callers
    /// see one error type across the port boundary.
    #[error("kernel score error: {0}")]
    Score(#[from] nexus_score::ScoreError),

    /// A record's `tenant_id` did not match the tenant the operation was scoped to.
    /// This is an isolation breach, not a not-found — it means data from another
    /// tenant was reached.
    #[error("tenant mismatch: expected {expected}, found {found}")]
    TenantMismatch {
        /// The tenant the call was scoped to.
        expected: uuid::Uuid,
        /// The tenant actually carried by the record.
        found: uuid::Uuid,
    },

    /// A stage transition that the [`StageId`](crate::StageId) table forbids.
    #[error("illegal stage transition: {from:?} -> {to:?}")]
    IllegalTransition {
        /// The stage the record is currently in.
        from: crate::StageId,
        /// The stage the caller attempted to advance to.
        to: crate::StageId,
    },

    /// A [`Money`](crate::Money) amount could not be coerced to a finite `f64` at the
    /// EV boundary (overflow to infinity, or `NaN`). The decimal value is kept exact;
    /// only the lossy `f64` projection failed.
    #[error("money not representable as finite f64: field {field}")]
    MoneyNotRepresentable {
        /// The named boundary that failed the projection.
        field: &'static str,
    },

    /// An opaque failure from a [`Store`](crate::Store) backend (IO, serialization,
    /// SQL). The string carries the backend's own message.
    #[error("store error: {0}")]
    Store(String),

    /// A lookup found no record for the given id under the scoped tenant.
    #[error("not found: {0}")]
    NotFound(String),
}

/// Result alias for the port layer.
pub type CoreResult<T> = core::result::Result<T, CoreError>;
