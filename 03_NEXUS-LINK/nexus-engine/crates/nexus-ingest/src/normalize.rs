//! Normalization: an admitted in-scope asset → [`LeadRecord`] + a prior [`ScoreRecord`].
//!
//! This runs **only on assets the VETO-FIRST gate admitted**. It maps the bounty
//! domain onto the acquisition domain the kernel already knows how to rank:
//!
//! | bounty concept | lead concept | how |
//! |---|---|---|
//! | expected payout (severity tier) | `v_deal` (Money) | severity → bounty-value anchor |
//! | platform take | `take` | bug-bounty payouts are net → `take = 0` |
//! | attack effort | `effort_hours` | `asset_type` base × scope-cardinality scale |
//! | responsiveness prior | `ScoreRecord.p_conv` | a documented reply/responsiveness prior |
//!
//! ## Honesty
//!
//! Every score produced here is `is_prior: true` with `evh: 0.0`. We have **no logged
//! outcomes** for these leads, so `p_conv` is a *designed prior*, not a measurement,
//! and EVH is computed later at rank time by the kernel — not pre-baked here. The prior
//! is deliberately conservative and documented inline so it is auditable, not magic.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use rust_decimal::Decimal;
use time::OffsetDateTime;
use uuid::Uuid;

use nexus_core::{LeadId, LeadRecord, Money, ScoreRecord, StageId, TenantId};

use crate::model::{AssetType, BountyAsset, BountyProgram, SeverityTier};

/// Bounty-value anchor (USD major units) per max-severity tier. These are **priors** —
/// rough order-of-magnitude payout anchors, not quotes. Critical-tier programs pay an
/// order of magnitude more than low-tier, which is the signal EV needs to rank a
/// high-value critical asset above a cheap low one.
const fn severity_value_usd(tier: SeverityTier) -> i64 {
    match tier {
        SeverityTier::Critical => 5_000,
        SeverityTier::High => 1_500,
        SeverityTier::Medium => 500,
        SeverityTier::Low => 150,
        // No tier expressed: a conservative non-zero floor so the asset still ranks.
        SeverityTier::None => 250,
    }
}

/// Documented responsiveness prior `P(reward | submission)` per max-severity tier.
///
/// This is the bettable conversion probability carried on the prior [`ScoreRecord`]. It
/// is intentionally low and conservative: most submissions do not pay out, and a
/// program advertising a higher max-severity tends to be a more mature, more responsive
/// program (slightly higher prior). It is `is_prior: true` — it must be replaced by a
/// calibrated probability once outcomes are logged.
const fn responsiveness_prior(tier: SeverityTier) -> f64 {
    match tier {
        SeverityTier::Critical => 0.12,
        SeverityTier::High => 0.10,
        SeverityTier::Medium => 0.08,
        SeverityTier::Low => 0.06,
        SeverityTier::None => 0.05,
    }
}

/// Effort hours to pursue an asset: `asset_type` base scaled by program scope
/// cardinality. A bigger in-scope surface means more recon per asset, so effort rises
/// (sub-linearly) with the number of eligible assets in the program.
fn effort_hours(asset: &BountyAsset, scope_cardinality: usize) -> f64 {
    let base = asset.asset_type.base_effort_hours();
    // Sub-linear scope scaling: 1 asset → ×1.0, grows with log of the surface so a
    // 100-asset program is more effort per asset but not 100×. Guarded to ≥ 1.0 so
    // effort_hours is always strictly positive (the kernel rejects c ≤ 0).
    let scale = 1.0 + (scope_cardinality.max(1) as f64).ln() / 4.0;
    (base * scale).max(1.0)
}

/// Two `f64` feature priors for the reply stage: `[bias, severity_signal]`. Documented
/// so the kernel's logistic has a stable, auditable input rather than an empty vector.
fn reply_features(tier: SeverityTier) -> Vec<f64> {
    // [intercept, normalized-severity-tier]. Higher tier → slightly stronger reply prior.
    vec![1.0, severity_signal(tier)]
}

/// One `f64` feature prior for the conversion stage: `[severity_signal]`.
fn conv_features(tier: SeverityTier) -> Vec<f64> {
    vec![severity_signal(tier)]
}

/// Severity normalized to `[0, 1]` as a feature signal (Critical = 1.0).
const fn severity_signal(tier: SeverityTier) -> f64 {
    match tier {
        SeverityTier::Critical => 1.0,
        SeverityTier::High => 0.75,
        SeverityTier::Medium => 0.5,
        SeverityTier::Low => 0.25,
        SeverityTier::None => 0.1,
    }
}

/// Derives a **deterministic** [`LeadId`] from `(program_key, normalized_identifier)`.
///
/// Stable across runs and across feeds so the same asset always maps to the same lead
/// id (and a re-ingest replaces rather than duplicates). Uses a 128-bit image of a
/// double hash of the two components — no v5 uuid feature required, and collisions are
/// astronomically unlikely for this key space.
#[must_use]
fn deterministic_lead_id(program_key: &str, normalized_identifier: &str) -> LeadId {
    let mut h1 = DefaultHasher::new();
    "nexus-ingest::lead".hash(&mut h1);
    program_key.hash(&mut h1);
    normalized_identifier.hash(&mut h1);
    let hi = h1.finish();

    let mut h2 = DefaultHasher::new();
    normalized_identifier.hash(&mut h2);
    program_key.hash(&mut h2);
    "nexus-ingest::lead::lo".hash(&mut h2);
    let lo = h2.finish();

    let bits = (u128::from(hi) << 64) | u128::from(lo);
    LeadId::new(Uuid::from_u128(bits))
}

/// Normalizes one admitted asset into a [`LeadRecord`] + its prior [`ScoreRecord`].
///
/// `scope_cardinality` is the count of admitted (eligible) assets in the owning
/// program, used to scale effort. `captured_at` is threaded in so a whole batch shares
/// one timestamp (deterministic in tests).
///
/// Returns the pair already tenant-stamped and ready for [`Store::put_lead`] /
/// [`Store::put_score`].
#[must_use]
pub fn normalize_asset(
    tenant: TenantId,
    program: &BountyProgram,
    asset: &BountyAsset,
    scope_cardinality: usize,
    captured_at: OffsetDateTime,
) -> (LeadRecord, ScoreRecord) {
    let tier = asset.max_severity;
    let lead_id = deterministic_lead_id(&program.key, &asset.normalized_identifier());

    let lead = LeadRecord {
        tenant_id: tenant,
        id: lead_id,
        reply_features: reply_features(tier),
        conv_features: conv_features(tier),
        // Bounty payouts are net to the researcher; the platform "take" is 0.
        v_deal: Money::new(Decimal::from(severity_value_usd(tier)), "USD"),
        take: Decimal::ZERO,
        effort_hours: effort_hours(asset, scope_cardinality),
        // A freshly ingested asset enters the pipeline at the scoring stage.
        stage: StageId::Score,
        captured_at,
    };

    let score = ScoreRecord {
        tenant_id: tenant,
        lead_id,
        // No outcomes logged yet: this is a designed prior, not a measurement.
        is_prior: true,
        p_conv: responsiveness_prior(tier),
        // EVH is computed by the kernel at rank time, not pre-baked into the prior.
        evh: 0.0,
        scored_at: captured_at,
    };

    (lead, score)
}

/// Helper to keep the [`AssetType`] effort table reachable from the crate root docs.
#[must_use]
pub const fn asset_base_effort(asset_type: AssetType) -> f64 {
    asset_type.base_effort_hours()
}
