//! The `Veto` port — campaign snapshots → kernel salience gate.
//!
//! Translates two [`CampaignSnapshot`]s into kernel
//! [`CampaignState`](nexus_score::salience::CampaignState)s and runs
//! [`nexus_score::salience::gate_proposal`]. The whole reason this lives behind a port
//! is the **non-offsettable protected-path hard veto**: an increase in
//! `protected_path_violations` between `before` and `after` blocks the transition
//! before any ΔU math, and no evidence credit can buy it back. The translation must
//! preserve that — the [`tests`](crate::veto) verify it survives the boundary.
//!
//! The kernel's [`DominantTerm`](nexus_score::salience::DominantTerm) has **no**
//! `Serialize` derive (by design — it is internal). To carry a gate decision across a
//! serialization boundary (API, log, ledger) we mirror it into [`SerDominantTerm`] and
//! wrap the whole decision in [`SerGateDecision`].

use serde::{Deserialize, Serialize};

use nexus_score::salience::{
    gate_proposal, CampaignState, DominantTerm, GateDecision, UWeights,
};

use crate::error::{CoreError, CoreResult};
use crate::records::CampaignSnapshot;

/// Serde mirror of the kernel's [`DominantTerm`].
///
/// One variant per kernel variant, kept in lockstep by [`From`]. The kernel type
/// stays un-serializable (internal capability); this is the only serializable view.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SerDominantTerm {
    /// Mirror of [`DominantTerm::ProtectedPathViolation`].
    ProtectedPathViolation,
    /// Mirror of [`DominantTerm::KlDrift`].
    KlDrift,
    /// Mirror of [`DominantTerm::Entropy`].
    Entropy,
    /// Mirror of [`DominantTerm::Miscalibration`].
    Miscalibration,
    /// Mirror of [`DominantTerm::Staleness`].
    Staleness,
    /// Mirror of [`DominantTerm::None`].
    None,
}

impl From<DominantTerm> for SerDominantTerm {
    fn from(t: DominantTerm) -> Self {
        match t {
            DominantTerm::ProtectedPathViolation => SerDominantTerm::ProtectedPathViolation,
            DominantTerm::KlDrift => SerDominantTerm::KlDrift,
            DominantTerm::Entropy => SerDominantTerm::Entropy,
            DominantTerm::Miscalibration => SerDominantTerm::Miscalibration,
            DominantTerm::Staleness => SerDominantTerm::Staleness,
            DominantTerm::None => SerDominantTerm::None,
        }
    }
}

/// Serializable mirror of the kernel's [`GateDecision`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SerGateDecision {
    /// Whether the transition is allowed.
    pub accept: bool,
    /// Whether a non-offsettable protected-path veto fired.
    pub hard_veto: bool,
    /// `ΔU = U(after) − U(before)`.
    pub delta_u: f64,
    /// The dominant term driving the decision (serializable mirror).
    pub dominant_term: SerDominantTerm,
    /// Human-readable reason.
    pub reason: String,
}

impl From<GateDecision> for SerGateDecision {
    fn from(d: GateDecision) -> Self {
        SerGateDecision {
            accept: d.accept,
            hard_veto: d.hard_veto,
            delta_u: d.delta_u,
            dominant_term: d.dominant_term.into(),
            reason: d.reason,
        }
    }
}

/// Projects a [`CampaignSnapshot`] onto the kernel's [`CampaignState`].
///
/// Drops the tenant id (the kernel is tenant-agnostic) and copies every term verbatim,
/// including the load-bearing `protected_path_violations` counter.
#[must_use]
fn to_kernel_state(snap: &CampaignSnapshot) -> CampaignState {
    CampaignState {
        entropy: snap.entropy,
        kl_drift: snap.kl_drift,
        miscalibration: snap.miscalibration,
        information_gain: snap.information_gain,
        staleness: snap.staleness,
        verified_evidence: snap.verified_evidence,
        protected_path_violations: snap.protected_path_violations,
    }
}

/// Gates a proposed campaign-state transition through the kernel salience governor.
///
/// Adds a tenant guard the kernel cannot express: `before` and `after` must belong to
/// the same tenant, else [`CoreError::TenantMismatch`]. Otherwise it threads the
/// kernel's [`GateDecision`] result straight through (the hard-veto semantics are the
/// kernel's, preserved exactly).
pub trait Veto {
    /// Gates `before -> after` for the given weights and ΔU threshold.
    ///
    /// # Errors
    /// - [`CoreError::TenantMismatch`] if the two snapshots have different tenants.
    /// - [`CoreError::Score`] if the kernel rejects a state term (non-finite/negative).
    fn gate_transition(
        &self,
        before: &CampaignSnapshot,
        after: &CampaignSnapshot,
        weights: &UWeights,
        threshold: f64,
    ) -> CoreResult<GateDecision> {
        if before.tenant_id != after.tenant_id {
            return Err(CoreError::TenantMismatch {
                expected: before.tenant_id.as_uuid(),
                found: after.tenant_id.as_uuid(),
            });
        }
        let b = to_kernel_state(before);
        let a = to_kernel_state(after);
        Ok(gate_proposal(&b, &a, weights, threshold)?)
    }
}

/// Zero-state default [`Veto`] implementation — pure translation, no policy.
#[derive(Debug, Clone, Copy, Default)]
pub struct DefaultVeto;

impl Veto for DefaultVeto {}
