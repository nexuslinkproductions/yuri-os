//! Outcome recording — the honesty loop's append-only intake.
//!
//! Every lead disposition (accepted, duplicate, not-applicable, paid) becomes an
//! [`OutcomeRecord`] appended to the [`OutcomeLedger`]. The load-bearing rule: the
//! `predicted_p` written into the outcome is **not** chosen here — it is read from the
//! lead's [`ScoreRecord::p_conv`], the first-class bettable prediction. That is what
//! lets [`brier_score`](nexus_score::scoring::brier_score) later grade the *original*
//! prediction against the *observed* result. If this path invented or defaulted
//! `predicted_p`, the calibration loop would grade nothing and the priors would never
//! become measurements.
//!
//! ## What counts as "converted"
//!
//! [`Disposition`] maps the operator's verdict onto the binary outcome the Brier loop
//! needs: a `Paid` lead converted (`true`); `Accepted` (a confirmed-valid but not-yet
//! -paid lead) also counts as converted because the bet — "this lead is real and
//! worth effort" — paid off. `Dupe` and `NotApplicable` did not convert (`false`).
//! This mapping is the one judgement call and is kept in one place so it is auditable.

use time::OffsetDateTime;

use nexus_core::{
    CoreError, LeadId, Money, OutcomeLedger, OutcomeRecord, Store, TenantId,
};

use crate::error::LedgerResult;

/// The operator's verdict on a lead, as it feeds the honesty loop.
#[derive(Debug, Clone, PartialEq)]
pub enum Disposition {
    /// Confirmed valid / in-scope — the bet that the lead was real paid off.
    Accepted,
    /// A duplicate of another lead. The bet did not pay off.
    Dupe,
    /// Out of scope / not applicable. The bet did not pay off.
    NotApplicable,
    /// Paid out, carrying the settled amount (already fiat-valued [`Money`]).
    Paid {
        /// The amount actually paid for this lead.
        amount: Money,
    },
}

impl Disposition {
    /// The binary conversion outcome this disposition implies — the `converted` field
    /// the Brier loop grades the prediction against.
    #[must_use]
    pub fn converted(&self) -> bool {
        matches!(self, Disposition::Accepted | Disposition::Paid { .. })
    }
}

/// Records an outcome for `lead` under `tenant`, reading the bettable prediction from
/// the lead's stored [`ScoreRecord`](nexus_core::ScoreRecord).
///
/// `store` is a single handle that is **both** the [`Store`] (source of the prediction)
/// and the [`OutcomeLedger`] (append target). They are deliberately the same object:
/// the calibration view joins `scores.p_conv` to `outcomes.converted` on
/// `(tenant, lead)`, so the score and the outcome must live in one backend for the
/// honesty loop to pair them. `nexus_store::SqliteStore` satisfies both bounds.
///
/// Pulls `score.p_conv` and writes it verbatim as the outcome's `predicted_p`, then
/// appends the [`OutcomeRecord`]. The append is append-only by the ledger's contract; a
/// wrong outcome is corrected by a later counter-observation, never an edit.
///
/// Returns the appended [`OutcomeRecord`] so a caller can chain it (e.g. into a
/// posting) without re-reading.
///
/// # Errors
/// - [`CoreError::NotFound`] (lifted) if no score exists for the lead under `tenant`.
/// - [`CoreError::TenantMismatch`] (lifted) on any tenant isolation breach.
/// - any [`CoreError::Store`] surfaced by the backend.
pub fn record_outcome<SL>(
    store: &mut SL,
    tenant: TenantId,
    lead: LeadId,
    disposition: &Disposition,
    observed_at: OffsetDateTime,
) -> LedgerResult<OutcomeRecord>
where
    SL: Store + OutcomeLedger,
{
    // The bettable prediction is first-class on the score record — never re-derived
    // here. Reading it (rather than accepting it as a parameter) is what keeps the
    // honesty loop honest: the outcome is graded against the prediction that was
    // actually stored at decision time.
    let score = store.get_score(tenant, lead)?;

    // Tenant guard mirrors the store's own contract; a score under the wrong tenant is
    // an isolation breach, not a silent pass-through.
    if score.tenant_id != tenant {
        return Err(CoreError::TenantMismatch {
            expected: tenant.as_uuid(),
            found: score.tenant_id.as_uuid(),
        }
        .into());
    }

    let outcome = OutcomeRecord {
        tenant_id: tenant,
        lead_id: lead,
        predicted_p: score.p_conv,
        converted: disposition.converted(),
        observed_at,
    };

    store.append(tenant, &outcome)?;
    Ok(outcome)
}
