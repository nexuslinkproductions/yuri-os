//! Ledger error type.
//!
//! [`LedgerError`] is the single error the ledger surface returns. It absorbs the
//! domain-layer [`nexus_core::CoreError`] via `#[from]` (so a store/veto/tenant failure
//! threads through without a manual `match`) and adds the ledger-specific failures the
//! domain layer cannot express: an unbalanced journal entry, a mixed-currency entry, an
//! empty entry, and a crypto receipt that reached settlement without a valuation.
//!
//! Library paths never panic — every fallible operation returns this instead.

use rust_decimal::Decimal;
use thiserror::Error;

/// Errors returned by the `nexus-ledger` surface.
#[derive(Debug, Error)]
pub enum LedgerError {
    /// A domain-layer failure (store IO, tenant isolation breach, veto translation,
    /// money projection) lifted from [`nexus_core`].
    #[error("core error: {0}")]
    Core(#[from] nexus_core::CoreError),

    /// A [`JournalEntry`](crate::JournalEntry) whose signed postings did not sum to
    /// exactly [`Decimal::ZERO`]. Double-entry's one invariant: debits and credits
    /// balance. The residual is reported exact (not rounded) so a caller sees the gap.
    #[error("journal entry does not balance: postings sum to {residual}, expected 0")]
    Unbalanced {
        /// The exact non-zero residual `Σ amount` that broke the invariant.
        residual: Decimal,
    },

    /// A [`JournalEntry`](crate::JournalEntry) mixing more than one currency. Balancing
    /// is only defined within a single unit; cross-currency netting would silently
    /// treat 1 EUR as 1 USD. Mixed-currency settlement is an explicit FX entry, M6.
    #[error("journal entry mixes currencies: found {found:?}, entry is anchored to {expected:?}")]
    MixedCurrency {
        /// The currency the entry was anchored to (its first posting).
        expected: String,
        /// The offending currency that did not match.
        found: String,
    },

    /// A [`JournalEntry`](crate::JournalEntry) with no postings. An empty entry is
    /// vacuously balanced but records nothing; it is rejected so a no-op cannot
    /// masquerade as a posted transaction.
    #[error("journal entry has no postings")]
    EmptyEntry,

    /// A crypto receipt reached the settlement path without a valuation. By contract
    /// this is a protected-path violation that the [`Veto`](nexus_core::Veto) hard-veto
    /// blocks; this typed error is the ledger-side surface of that block, so callers
    /// get a precise reason rather than a bare gate decision.
    #[error("crypto receipt {receipt_id} is unvalued: cannot mark paid without a receipt-timestamp valuation (hard veto)")]
    UnvaluedCryptoReceipt {
        /// The receipt that was missing its valuation.
        receipt_id: uuid::Uuid,
    },

    /// `mark_paid` was hard-vetoed by the salience gate. Carries the gate's
    /// human-readable reason so the block is auditable.
    #[error("mark_paid hard-vetoed: {reason}")]
    HardVeto {
        /// The gate's reason string.
        reason: String,
    },
}

/// Result alias for the ledger surface.
pub type LedgerResult<T> = core::result::Result<T, LedgerError>;
