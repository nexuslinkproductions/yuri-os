//! # Cadence / follow-up spacing (spec §5)
//!
//! Each follow-up has a declining incremental reply probability. The marginal yield
//! of follow-up `k` decays geometrically:
//!
//! ```text
//! Δreply(k) = q · g^(k−1)            q = first-follow-up lift, g ∈ (0,1) decay
//! ```
//!
//! Stop following up when the marginal EV of the touch goes negative:
//!
//! ```text
//! STOP when Δreply(k) · V_net < c_followup
//! ```
//!
//! This makes follow-up count a **function of deal value** — a computed cadence, not
//! a vibe. The spec's worked constants (`q = 0.08`, `g = 0.5`, `c_followup ≈ €12`)
//! give **1 touch for a €180 lead, 3 for an €800 retainer.**
//!
//! **THE DECISION IT DRIVES:** *follow-up count and spacing per lead, with a hard
//! computed stop.*

use crate::{ensure_factor, ensure_non_negative, ensure_positive, Result};

/// Marginal reply yield of the `k`-th follow-up: `Δreply(k) = q · g^(k−1)`.
///
/// `k` is 1-based (the first follow-up is `k = 1`). `q` is the first-follow-up lift
/// and `g ∈ (0, 1)` is the per-touch decay.
///
/// # Errors
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `q` is outside `[0, 1]`.
/// - [`crate::ScoreError::FactorOutOfRange`] if `g` is not in `(0, 1)`.
/// - [`crate::ScoreError::NonPositive`] if `k == 0` (there is no zeroth follow-up).
pub fn marginal_reply(q: f64, g: f64, k: u32) -> Result<f64> {
    let q = crate::ensure_prob("q", q)?;
    let g = ensure_factor("g", g)?;
    if k == 0 {
        return Err(crate::ScoreError::NonPositive {
            field: "k",
            value: 0.0,
        });
    }
    Ok(q * g.powi((k - 1) as i32))
}

/// Recommended number of follow-up touches for a lead of net value `v_net`.
///
/// Counts follow-ups while their marginal EV clears the cost floor —
/// `Δreply(k) · v_net ≥ c_followup` — and stops at the first `k` that fails. Returns
/// the count of touches that are worth sending (`0` if even the first is not).
///
/// The decay guarantees termination: once a touch fails the threshold, every later
/// touch (smaller yield) also fails, so the loop is bounded without an arbitrary cap.
///
/// # Errors
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `q` is outside `[0, 1]`.
/// - [`crate::ScoreError::FactorOutOfRange`] if `g` is not in `(0, 1)`.
/// - [`crate::ScoreError::Negative`] if `v_net < 0`.
/// - [`crate::ScoreError::NonPositive`] if `c_followup <= 0` (a zero/negative cost
///   floor would never stop).
pub fn recommended_touches(q: f64, g: f64, v_net: f64, c_followup: f64) -> Result<u32> {
    let q = crate::ensure_prob("q", q)?;
    let g = ensure_factor("g", g)?;
    let v_net = ensure_non_negative("v_net", v_net)?;
    let c_followup = ensure_positive("c_followup", c_followup)?;

    let mut count = 0u32;
    let mut k = 1u32;
    loop {
        let marginal_ev = q * g.powi((k - 1) as i32) * v_net;
        if marginal_ev >= c_followup {
            count = k;
            k += 1;
        } else {
            break;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    const EPS: f64 = 1e-6;

    #[test]
    fn marginal_reply_geometric_decay() {
        // q=0.08, g=0.5.
        assert!(approx_eq(marginal_reply(0.08, 0.5, 1).unwrap(), 0.08, EPS));
        assert!(approx_eq(marginal_reply(0.08, 0.5, 2).unwrap(), 0.04, EPS));
        assert!(approx_eq(marginal_reply(0.08, 0.5, 3).unwrap(), 0.02, EPS));
        assert!(marginal_reply(0.08, 0.5, 0).is_err());
        assert!(marginal_reply(0.08, 1.0, 1).is_err()); // g must be in (0,1)
    }

    #[test]
    fn touches_180_lead_section_5_4() {
        // q=0.08, g=0.5, V_net=€180, c_followup=€12.
        // k=1: 0.08·180 = 14.4 ≥ 12 → SEND
        // k=2: 0.08·0.5·180 = 7.2 < 12 → STOP
        // ⇒ exactly 1 follow-up on a €180 lead.
        assert_eq!(recommended_touches(0.08, 0.5, 180.0, 12.0).unwrap(), 1);
    }

    #[test]
    fn touches_800_retainer_section_5_4() {
        // q=0.08, g=0.5, V_net=€800, c_followup=€12.
        // k=1: 0.08·800 = 64    ≥ 12 → SEND
        // k=2: 0.08·0.5·800 = 32 ≥ 12 → SEND
        // k=3: 0.08·0.25·800 = 16 ≥ 12 → SEND
        // k=4: 0.08·0.125·800 = 8 < 12 → STOP
        // ⇒ 3 follow-ups on an €800 retainer.
        assert_eq!(recommended_touches(0.08, 0.5, 800.0, 12.0).unwrap(), 3);
    }

    #[test]
    fn touches_scale_monotonically_with_value() {
        let small = recommended_touches(0.08, 0.5, 180.0, 12.0).unwrap();
        let big = recommended_touches(0.08, 0.5, 800.0, 12.0).unwrap();
        assert!(big > small);
    }

    #[test]
    fn touches_zero_when_first_touch_not_worth_it() {
        // q=0.06 first-touch lift (the spec's pre-correction value) on a €180 lead:
        // k=1: 0.06·180 = 10.8 < 12 → STOP immediately ⇒ 0 touches.
        assert_eq!(recommended_touches(0.06, 0.5, 180.0, 12.0).unwrap(), 0);
    }

    #[test]
    fn recommended_touches_rejects_bad_inputs() {
        assert!(recommended_touches(0.08, 0.5, -1.0, 12.0).is_err());
        assert!(recommended_touches(0.08, 0.5, 180.0, 0.0).is_err());
        assert!(recommended_touches(1.5, 0.5, 180.0, 12.0).is_err());
    }
}
