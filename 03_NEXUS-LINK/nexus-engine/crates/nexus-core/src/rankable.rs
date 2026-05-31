//! The `Rankable` port — domain records → kernel EV ranking.
//!
//! This is the only place money crosses into `f64`. It builds a
//! [`nexus_score::ev::Lead<LeadId>`] from a [`LeadRecord`] plus its [`ScoreRecord`],
//! projecting the net deal value through the single [`dec_to_f64`] helper, then defers
//! the actual sort to the kernel's [`nexus_score::ev::rank_by_evh`]. Kernel failures
//! lift to [`CoreError`] via `#[from]` — the caller sees one error type.
//!
//! The net-of-take value is computed in exact [`Decimal`](rust_decimal::Decimal) and
//! only then projected, so the take-rate arithmetic never touches float rounding.

use nexus_score::ev::{rank_by_evh, Lead, ScoredLead};

use crate::error::{CoreError, CoreResult};
use crate::money::dec_to_f64;
use crate::records::{LeadId, LeadRecord, ScoreRecord};

/// Translates domain records into the kernel's EV ranking and back.
///
/// Default-implemented over the two translation primitives so a backend rarely needs
/// to override anything; it exists as a trait (rather than free functions) so a
/// caller can swap in a ranking policy if one is ever needed.
pub trait Rankable {
    /// Builds a kernel [`Lead`] from a lead record and its score.
    ///
    /// The conversion probability comes from the score's prior/measured `evh` context
    /// via `p_conv`; here we take it from the supplied `p_conv` because the kernel
    /// `Lead` is the post-scoring view (the two-stage logistic model already ran).
    /// `v_net` is `v_deal · (1 − take)` in exact decimal, then projected to `f64`.
    ///
    /// # Errors
    /// - [`CoreError::TenantMismatch`] if the lead and score belong to different tenants.
    /// - [`CoreError::MoneyNotRepresentable`] if the net value has no finite `f64` image.
    fn to_kernel_lead(
        &self,
        lead: &LeadRecord,
        score: &ScoreRecord,
    ) -> CoreResult<Lead<LeadId>> {
        if lead.tenant_id != score.tenant_id {
            return Err(CoreError::TenantMismatch {
                expected: lead.tenant_id.as_uuid(),
                found: score.tenant_id.as_uuid(),
            });
        }
        let v_net = lead.v_deal.net_of_take(lead.take);
        let v_net_f64 = dec_to_f64("lead.v_net", v_net.amount)?;
        Ok(Lead {
            id: lead.id,
            p_conv: score.p_conv,
            v_net: v_net_f64,
            effort_hours: lead.effort_hours,
        })
    }

    /// Ranks a slice of kernel leads by descending EVH.
    ///
    /// Thin wrapper over [`nexus_score::ev::rank_by_evh`]; any kernel
    /// [`ScoreError`](nexus_score::ScoreError) (bad probability, negative value,
    /// non-positive effort) lifts to [`CoreError::Score`] via `#[from]`.
    ///
    /// # Errors
    /// Propagates kernel ranking errors as [`CoreError::Score`].
    fn rank(&self, leads: &[Lead<LeadId>]) -> CoreResult<Vec<ScoredLead<LeadId>>> {
        Ok(rank_by_evh(leads)?)
    }
}

/// A zero-state default implementation of [`Rankable`] — pure translation, no policy.
#[derive(Debug, Clone, Copy, Default)]
pub struct DefaultRankable;

impl Rankable for DefaultRankable {}
