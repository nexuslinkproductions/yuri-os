//! VETO-FIRST compliance gate (load-bearing).
//!
//! This is the whole reason ingestion is not just "parse JSON into leads". An asset
//! that is out of scope, submission-only, or under a non-paying program is a
//! **protected-path / ToS hazard**: turning it into a pursue-target would tell the
//! operator to spend effort attacking something they are not authorized to. The
//! kernel's salience governor exists precisely to refuse a cheap-but-toxic state, and
//! it does so through a *non-offsettable hard veto* keyed on
//! `protected_path_violations`.
//!
//! So instead of filtering ineligible assets with an ad-hoc `if`, we route every
//! ineligible asset through the **real** [`nexus_core::Veto`] port:
//!
//! 1. Build a `before` snapshot (baseline, zero violations).
//! 2. Build an `after` snapshot with `protected_path_violations` **incremented** —
//!    that increment *is* the claim "promoting this asset would violate scope".
//! 3. Call [`Veto::gate_transition`]. A [`GateDecision::hard_veto`] drops the asset.
//!
//! The veto runs **before** the asset is ever handed to normalization, so a vetoed
//! asset can never become an [`ev::Lead`](nexus_score::ev::Lead) and can never enter
//! `rank_by_evh`. The eligible path also runs through the gate (with no violation
//! increment) and is *accepted*, so the gate is the single decision point — there is no
//! second, un-gated code path an asset could slip through.

use nexus_core::{CampaignSnapshot, CoreResult, TenantId, UWeights, Veto};

use crate::model::{BountyAsset, BountyProgram};

/// The outcome of gating one asset through the compliance veto.
#[derive(Debug, Clone, PartialEq)]
pub struct AssetGate {
    /// `true` iff the asset is cleared to become a pursue-target.
    pub admitted: bool,
    /// `true` iff a non-offsettable protected-path hard veto fired.
    pub hard_veto: bool,
    /// Human-readable reason (the kernel's veto reason, or the eligible-accept reason).
    pub reason: String,
}

/// A baseline campaign snapshot for a tenant with **zero** protected-path violations.
///
/// The non-violation terms are deliberately benign and identical between `before` and
/// `after` so that, for an eligible asset, ΔU is ~0 and the gate *accepts*; for an
/// ineligible asset the only thing that changes is the violation counter, which trips
/// the hard veto regardless of ΔU.
#[must_use]
fn baseline_snapshot(tenant: TenantId) -> CampaignSnapshot {
    CampaignSnapshot {
        tenant_id: tenant,
        entropy: 0.0,
        kl_drift: 0.0,
        miscalibration: 0.0,
        information_gain: 0.0,
        staleness: 0.0,
        verified_evidence: 0.0,
        protected_path_violations: 0,
    }
}

/// Gates a single asset for a program through the real [`Veto`] port.
///
/// For an ineligible asset, the `after` snapshot increments
/// `protected_path_violations`, so [`Veto::gate_transition`] returns `hard_veto = true`
/// and the asset is rejected. For an eligible asset, `after == before` (no violation),
/// ΔU is zero, and the gate accepts.
///
/// # Errors
/// Propagates [`CoreError`](nexus_core::CoreError) from the veto port (only on a
/// tenant mismatch or a non-finite kernel term — neither occurs for these snapshots,
/// but the error is threaded rather than swallowed).
pub fn gate_asset<V: Veto>(
    veto: &V,
    tenant: TenantId,
    program: &BountyProgram,
    asset: &BountyAsset,
    weights: &UWeights,
) -> CoreResult<AssetGate> {
    // Program-level gate folds into the asset's eligibility: an asset under a program
    // that does not pay can never be bounty-eligible regardless of its own flags. The
    // feed parsers already encode this, so `is_rankable()` is the single source of
    // truth; the assertion below just makes the dependency explicit for the reader.
    let rankable = asset.eligibility.is_rankable() && program.offers_bounty;

    let before = baseline_snapshot(tenant);
    let mut after = baseline_snapshot(tenant);
    if !rankable {
        // The increment is the load-bearing line: it is what the kernel's
        // non-offsettable hard veto keys on. No evidence credit can buy it back.
        after.protected_path_violations += 1;
    }

    let decision = veto.gate_transition(&before, &after, weights, 0.0)?;

    let reason = if rankable {
        format!("admitted: {}", asset.eligibility.veto_reason())
    } else {
        format!("VETOED ({}): {}", asset.eligibility.veto_reason(), decision.reason)
    };

    Ok(AssetGate {
        // An asset is admitted iff the gate accepted AND no hard veto fired. For the
        // ineligible path the kernel returns accept=false, hard_veto=true; for the
        // eligible path accept=true, hard_veto=false.
        admitted: decision.accept && !decision.hard_veto,
        hard_veto: decision.hard_veto,
        reason,
    })
}
