//! The eight tenant-scoped domain records.
//!
//! Every record carries a [`TenantId`] as its first field. Money is held as [`Money`]
//! (exact decimal + currency); the lossy `f64` projection happens only at the EV
//! boundary via [`dec_to_f64`](crate::dec_to_f64). Feature vectors for scoring are
//! plain `Vec<f64>` — the kernel's `logit_score` consumes `(weight, feature)` term
//! iterators, so the record holds the raw features and the scoring weights live with
//! the model, not the record.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::stage::StageId;
use crate::tenant::TenantId;
use crate::Money;

/// Strongly-typed lead identifier (transparent over [`Uuid`]). This is the `Id` that
/// flows through [`nexus_score::ev::Lead`] during ranking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LeadId(pub Uuid);

impl LeadId {
    /// Wraps a raw [`Uuid`].
    #[must_use]
    pub const fn new(id: Uuid) -> Self {
        LeadId(id)
    }
    /// Fresh random id.
    #[must_use]
    pub fn new_v4() -> Self {
        LeadId(Uuid::new_v4())
    }
}

impl core::fmt::Display for LeadId {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// A captured lead with the inputs the kernel needs to score and rank it.
///
/// `reply_features` and `conv_features` are the raw feature vectors fed to the
/// kernel's two-stage logistic model (`p_reply`, `p_conv_given_reply`). `v_deal`,
/// `take`, and `effort_hours` feed the EV/EVH ranking. `stage` is the lead's current
/// pipeline position, advanced through [`StageId::advance`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LeadRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// This lead's id.
    pub id: LeadId,
    /// Feature vector for the reply-probability stage.
    pub reply_features: Vec<f64>,
    /// Feature vector for the conversion-given-reply stage.
    pub conv_features: Vec<f64>,
    /// Gross deal value (before take-rate).
    pub v_deal: Money,
    /// Platform take-rate as a fraction in `[0, 1]` (validated at the EV boundary).
    pub take: Decimal,
    /// Estimated effort hours to pursue.
    pub effort_hours: f64,
    /// Current pipeline stage.
    pub stage: StageId,
    /// When the lead was captured.
    pub captured_at: OffsetDateTime,
}

/// A campaign / program a lead belongs to (its source channel and budget envelope).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProgramRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Program id.
    pub id: Uuid,
    /// Human-readable program name.
    pub name: String,
    /// Budget cap for the program.
    pub budget: Money,
    /// When the program was created.
    pub created_at: OffsetDateTime,
}

/// A reusable outreach asset (template, creative) attached to a program.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Asset id.
    pub id: Uuid,
    /// Program this asset belongs to.
    pub program_id: Uuid,
    /// Asset kind, e.g. `"email_template"`, `"ad_creative"`.
    pub kind: String,
    /// Asset body / payload.
    pub body: String,
}

/// A score computed for a lead. `is_prior` records the honesty flag from the kernel
/// contract: until outcomes are logged, every `evh` is a designed **prior**, not a
/// measured probability.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ScoreRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Lead this score is for.
    pub lead_id: LeadId,
    /// `true` while the score is a designed prior (no outcome data yet);
    /// `false` once calibrated against logged outcomes.
    pub is_prior: bool,
    /// The bettable conversion probability `P(conv|L)` in `[0, 1]` — the calibrated
    /// output of the kernel's two-stage logistic and the prediction graded by
    /// [`brier_score`](nexus_score::scoring::brier_score). It is a designed prior
    /// until `is_prior` flips false. Persisted in `scores.p_conv` and joined to
    /// outcomes for calibration; carrying it on the record (not a side-channel)
    /// keeps the prediction from silently defaulting and corrupting the Brier loop.
    pub p_conv: f64,
    /// Expected value per hour — the ranking key carried verbatim from the kernel.
    pub evh: f64,
    /// When this score was computed.
    pub scored_at: OffsetDateTime,
}

/// A send event — one outreach touch dispatched to a lead.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SendRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Send id.
    pub id: Uuid,
    /// Lead the send targeted.
    pub lead_id: LeadId,
    /// Asset used for the send.
    pub asset_id: Uuid,
    /// When the send went out.
    pub sent_at: OffsetDateTime,
}

/// An outcome observation for a lead — the ground truth that turns priors into
/// calibrated probabilities. `converted` is the binary outcome (`true` = won).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OutcomeRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Lead this outcome is for.
    pub lead_id: LeadId,
    /// The predicted conversion probability at decision time (for calibration pairing).
    pub predicted_p: f64,
    /// `true` iff the lead converted (won).
    pub converted: bool,
    /// When the outcome was observed.
    pub observed_at: OffsetDateTime,
}

/// A ledger posting — an append-only money movement (cost, revenue) tied to a lead.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PostingRecord {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Posting id.
    pub id: Uuid,
    /// Lead this posting is attributed to.
    pub lead_id: LeadId,
    /// Amount moved (sign encodes direction: positive = revenue, negative = cost).
    pub amount: Money,
    /// Free-text memo.
    pub memo: String,
    /// When the posting was recorded.
    pub posted_at: OffsetDateTime,
}

/// A snapshot of campaign state used to gate state transitions through the
/// [`Veto`](crate::Veto) port. The `protected_path_violations` counter is the
/// load-bearing field: an increase between two snapshots triggers the kernel's
/// non-offsettable hard veto.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CampaignSnapshot {
    /// Owning tenant.
    pub tenant_id: TenantId,
    /// Spread of leads across pipeline stages (high = scattered).
    pub entropy: f64,
    /// KL gap between claimed and verified lead quality (hype drift).
    pub kl_drift: f64,
    /// Scoring-model miscalibration proxy.
    pub miscalibration: f64,
    /// Information gained by this state (enrichment lowers badness).
    pub information_gain: f64,
    /// Staleness of the backing evidence.
    pub staleness: f64,
    /// Verified-evidence credit (bounded reward).
    pub verified_evidence: f64,
    /// Count of compliance / protected-path violations. Drives the hard veto.
    pub protected_path_violations: u32,
}
