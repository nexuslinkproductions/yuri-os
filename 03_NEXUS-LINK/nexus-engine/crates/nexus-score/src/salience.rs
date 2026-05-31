//! # Salience / state-transition governor (spec §6) — INTERNAL
//!
//! > **Framing lock:** this is the **internal** energy-landscape capability used to
//! > gate *campaign state transitions* (e.g. "should we commit this batch of sends").
//! > It is NEVER a product, never client-facing, never named to a buyer.
//!
//! `compute_u(state)` collapses a campaign-state snapshot to a single scalar
//! "badness" potential `U`. `gate_proposal(before, after)` rejects a proposed
//! transition when `ΔU > threshold` (Lyapunov-style), with a **hard, non-offsettable
//! veto** when protected-path / compliance violations increase.
//!
//! For *ranking individual leads*, `U` is theater — [`crate::scoring`] +
//! [`crate::ev`] rank them better and more legibly. `U` earns its keep in exactly
//! one place: **gating batch/state transitions on compliance + evidence-drift**,
//! where its non-offsettable veto does what EV cannot — refuse a state that is
//! cheap-but-toxic.
//!
//! **THE DECISION IT DRIVES:** *block or allow a state transition — a veto, not a
//! ranking.*

use crate::{ensure_finite, ensure_non_negative, Result};

/// Weights on the (non-veto) `U` terms. Defaults follow the spec's weight *intent*:
/// a strong penalty on claimed-vs-verified drift, a mild penalty on unfocused spread
/// and staleness, a reward for information gain, and a bounded, saturating credit for
/// verified evidence that can never mask a violation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UWeights {
    /// Mild penalty on `entropy` — scattered pipeline with no focus.
    pub entropy: f64,
    /// **Strong** penalty on `kl_drift` — claimed lead quality vs verified evidence.
    pub kl_drift: f64,
    /// Penalty on scoring-model miscalibration (Brier / log-loss).
    pub miscalibration: f64,
    /// Reward (subtracted) for `information_gain` — a learning transition lowers `U`.
    pub information_gain: f64,
    /// Mild penalty on `staleness` — stale evidence dragging the state up.
    pub staleness: f64,
    /// Bounded reward (subtracted) for verified evidence, applied through a
    /// saturating cap so it can never offset a protected-path veto.
    pub verified_credit: f64,
    /// Saturation cap on the verified-evidence credit (in raw credit units before
    /// the weight is applied).
    pub verified_credit_cap: f64,
}

impl Default for UWeights {
    fn default() -> Self {
        UWeights {
            entropy: 0.25,
            kl_drift: 2.0,
            miscalibration: 1.0,
            information_gain: 1.0,
            staleness: 0.25,
            verified_credit: 0.5,
            verified_credit_cap: 5.0,
        }
    }
}

/// A campaign-state snapshot fed to [`compute_u`].
///
/// All non-violation terms are `f64`; `protected_path_violations` is an integer
/// counter because it triggers the discrete hard veto, not a smooth penalty.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CampaignState {
    /// Spread of leads across pipeline stages (high = scattered, unfocused).
    pub entropy: f64,
    /// KL gap between *claimed* lead quality and *verified* evidence (hype drift).
    pub kl_drift: f64,
    /// Scoring-model miscalibration proxy (e.g. Brier above the 0.25 floor).
    pub miscalibration: f64,
    /// Information gained by this state (enrichment lowers `U`).
    pub information_gain: f64,
    /// Staleness of the evidence backing the state.
    pub staleness: f64,
    /// Verified-evidence count/credit (bounded reward).
    pub verified_evidence: f64,
    /// Count of compliance / protected-path violations. Drives the hard veto.
    pub protected_path_violations: u32,
}

/// Computes the scalar potential `U(state)` from weighted terms (spec §6.2).
///
/// Penalties raise `U`; the information-gain and (capped) verified-evidence terms
/// lower it. The protected-path violation count is **not** folded into the smooth
/// scalar here — it is handled as a discrete veto in [`gate_proposal`], so no amount
/// of negative (good) `U` can buy back a violation.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if any non-negative term is negative.
/// - [`crate::ScoreError::NonFinite`] if any weight or term is non-finite.
pub fn compute_u(state: &CampaignState, w: &UWeights) -> Result<f64> {
    let entropy = ensure_non_negative("entropy", state.entropy)?;
    let kl_drift = ensure_non_negative("kl_drift", state.kl_drift)?;
    let miscalibration = ensure_non_negative("miscalibration", state.miscalibration)?;
    let information_gain = ensure_non_negative("information_gain", state.information_gain)?;
    let staleness = ensure_non_negative("staleness", state.staleness)?;
    let verified = ensure_non_negative("verified_evidence", state.verified_evidence)?;

    let w_entropy = ensure_finite("w.entropy", w.entropy)?;
    let w_kl = ensure_finite("w.kl_drift", w.kl_drift)?;
    let w_miscal = ensure_finite("w.miscalibration", w.miscalibration)?;
    let w_info = ensure_finite("w.information_gain", w.information_gain)?;
    let w_stale = ensure_finite("w.staleness", w.staleness)?;
    let w_credit = ensure_finite("w.verified_credit", w.verified_credit)?;
    let credit_cap = ensure_non_negative("w.verified_credit_cap", w.verified_credit_cap)?;

    // Verified-evidence credit saturates at the cap, then is weighted and subtracted.
    let capped_credit = verified.min(credit_cap);

    let u = w_entropy * entropy + w_kl * kl_drift + w_miscal * miscalibration + w_stale * staleness
        - w_info * information_gain
        - w_credit * capped_credit;
    ensure_finite("u", u)
}

/// The term that dominated a transition's `ΔU` (for explainability).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DominantTerm {
    /// A protected-path / compliance violation increased — hard veto.
    ProtectedPathViolation,
    /// Claimed-vs-verified evidence drift dominated.
    KlDrift,
    /// Pipeline scatter (entropy) dominated.
    Entropy,
    /// Scoring miscalibration dominated.
    Miscalibration,
    /// Evidence staleness dominated.
    Staleness,
    /// No single penalty term dominated the change.
    None,
}

/// The decision returned by [`gate_proposal`].
#[derive(Debug, Clone, PartialEq)]
pub struct GateDecision {
    /// `true` iff the transition is allowed.
    pub accept: bool,
    /// `ΔU = U(after) − U(before)` (meaningless when a hard veto fired, but reported).
    pub delta_u: f64,
    /// `true` iff a non-offsettable protected-path veto fired.
    pub hard_veto: bool,
    /// The dominant term driving the decision.
    pub dominant_term: DominantTerm,
    /// Human-readable reason.
    pub reason: String,
}

/// Gates a proposed campaign-state transition (spec §6.3).
///
/// Decision order:
/// 1. **Hard veto (non-offsettable):** if `protected_path_violations` increased,
///    reject regardless of `ΔU` or any evidence credit. This is the whole point of
///    the governor — a cheap-but-toxic state is refused even if its `U` improves.
/// 2. **Lyapunov gate:** otherwise accept iff `ΔU ≤ threshold` (default `0.0`).
///
/// # Errors
/// Propagates [`compute_u`] errors for either state.
pub fn gate_proposal(
    before: &CampaignState,
    after: &CampaignState,
    w: &UWeights,
    threshold: f64,
) -> Result<GateDecision> {
    // 1. Hard, non-offsettable protected-path veto — checked BEFORE any ΔU math so no
    //    evidence credit can mask it.
    if after.protected_path_violations > before.protected_path_violations {
        let u_before = compute_u(before, w)?;
        let u_after = compute_u(after, w)?;
        return Ok(GateDecision {
            accept: false,
            delta_u: u_after - u_before,
            hard_veto: true,
            dominant_term: DominantTerm::ProtectedPathViolation,
            reason: format!(
                "protected-path violation increase ({} -> {}) — HARD VETO, non-offsettable",
                before.protected_path_violations, after.protected_path_violations
            ),
        });
    }

    let threshold = ensure_finite("threshold", threshold)?;
    let u_before = compute_u(before, w)?;
    let u_after = compute_u(after, w)?;
    let delta_u = u_after - u_before;
    let accept = delta_u <= threshold;

    let dominant_term = dominant_penalty_delta(before, after, w);
    let reason = if accept {
        format!("state-improving transition (ΔU = {delta_u:.4} ≤ {threshold}) — proceed")
    } else {
        format!("ΔU = {delta_u:.4} > {threshold} — blocked; inspect {dominant_term:?}")
    };

    Ok(GateDecision {
        accept,
        delta_u,
        hard_veto: false,
        dominant_term,
        reason,
    })
}

/// Identifies which weighted penalty term changed the most between two states.
fn dominant_penalty_delta(
    before: &CampaignState,
    after: &CampaignState,
    w: &UWeights,
) -> DominantTerm {
    let candidates = [
        (
            DominantTerm::KlDrift,
            w.kl_drift * (after.kl_drift - before.kl_drift),
        ),
        (
            DominantTerm::Entropy,
            w.entropy * (after.entropy - before.entropy),
        ),
        (
            DominantTerm::Miscalibration,
            w.miscalibration * (after.miscalibration - before.miscalibration),
        ),
        (
            DominantTerm::Staleness,
            w.staleness * (after.staleness - before.staleness),
        ),
    ];
    let mut best = DominantTerm::None;
    let mut best_mag = 0.0_f64;
    for (term, delta) in candidates {
        if delta > best_mag {
            best_mag = delta;
            best = term;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    fn base_state() -> CampaignState {
        CampaignState {
            entropy: 1.0,
            kl_drift: 0.5,
            miscalibration: 0.1,
            information_gain: 0.0,
            staleness: 0.2,
            verified_evidence: 2.0,
            protected_path_violations: 0,
        }
    }

    #[test]
    fn hard_veto_on_protected_path_increase_section_6_4() {
        // before: protectedPathViolations=0; after: =1 → HARD VETO, non-offsettable.
        let before = base_state();
        let mut after = base_state();
        after.protected_path_violations = 1;
        let d = gate_proposal(&before, &after, &UWeights::default(), 0.0).unwrap();
        assert!(!d.accept);
        assert!(d.hard_veto);
        assert_eq!(d.dominant_term, DominantTerm::ProtectedPathViolation);
        assert!(d.reason.contains("HARD VETO"));
    }

    #[test]
    fn veto_is_non_offsettable_by_evidence_credit() {
        // The toxic transition ALSO piles on a mountain of verified evidence and
        // information gain (which would slam ΔU strongly negative / "good"). The veto
        // must still fire — no amount of "but these are great leads" buys it back.
        let before = base_state();
        let mut after = base_state();
        after.protected_path_violations = 1;
        after.verified_evidence = 1_000.0; // capped, but still: lots of "good"
        after.information_gain = 1_000.0;
        after.kl_drift = 0.0;

        let d = gate_proposal(&before, &after, &UWeights::default(), 0.0).unwrap();
        // ΔU is strongly negative (looks great) yet the batch is blocked anyway.
        assert!(d.delta_u < 0.0);
        assert!(!d.accept);
        assert!(d.hard_veto);
    }

    #[test]
    fn healthy_enrichment_transition_accepted_section_6_4() {
        // Enrich 5 leads: raise verified evidence + information gain, drop kl_drift.
        // ΔU < 0 → accept = true → state-improving move, proceed.
        let before = base_state();
        let after = CampaignState {
            kl_drift: 0.1,          // drift down (enrichment closed the gap)
            information_gain: 1.5,  // we learned
            verified_evidence: 4.0, // more verified evidence
            ..base_state()
        };
        let d = gate_proposal(&before, &after, &UWeights::default(), 0.0).unwrap();
        assert!(d.delta_u < 0.0);
        assert!(d.accept);
        assert!(!d.hard_veto);
    }

    #[test]
    fn rising_drift_without_violation_is_blocked_by_lyapunov() {
        // No protected-path change, but claimed-vs-verified drift spikes → ΔU > 0 →
        // soft block, dominant term = KlDrift (go enrich before sending).
        let before = base_state();
        let after = CampaignState {
            kl_drift: 3.0,
            ..base_state()
        };
        let d = gate_proposal(&before, &after, &UWeights::default(), 0.0).unwrap();
        assert!(!d.accept);
        assert!(!d.hard_veto);
        assert!(d.delta_u > 0.0);
        assert_eq!(d.dominant_term, DominantTerm::KlDrift);
    }

    #[test]
    fn verified_credit_saturates_at_cap() {
        // Evidence credit must saturate, so 5 vs 5000 verified items give the same U.
        let w = UWeights::default();
        let s_at_cap = CampaignState {
            verified_evidence: 5.0,
            ..base_state()
        };
        let s_over_cap = CampaignState {
            verified_evidence: 5_000.0,
            ..base_state()
        };
        let u_cap = compute_u(&s_at_cap, &w).unwrap();
        let u_over = compute_u(&s_over_cap, &w).unwrap();
        assert!(approx_eq(u_cap, u_over, 1e-12));
    }

    #[test]
    fn compute_u_rejects_negative_terms() {
        let mut s = base_state();
        s.kl_drift = -1.0;
        assert!(compute_u(&s, &UWeights::default()).is_err());
    }
}
