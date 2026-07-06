//! # Pipeline / throughput dynamics (spec §3)
//!
//! A real controlled queue, not a metaphor. Work arrives (wins) at rate `λ` and is
//! served (delivered) at rate `μ`. Utilization is `ρ = λ/μ`, and the system is
//! **STABLE ⟺ ρ < 1**. If `ρ ≥ 1` persistently the backlog diverges → late delivery
//! → bad review → reputation collapses → arrival rate collapses. That is a genuine
//! feedback instability, the formal version of "don't win faster than you can deliver
//! at full quality."
//!
//! Reputation gates the fast revenue loop through a saturating win-rate curve
//! `w(R) = w∞ · R / (R + R½)`. At `R = 0`, `w ≈ 0` — a cold-start trap basin escaped
//! only by an external impulse (loss-leader orders that buy the first reviews).
//!
//! A Lyapunov function `V(x) = ½(B − B★)²` (plus an optional revenue term) gives a
//! pass/fail throttle test: a healthy throttle drives `ΔV ≤ 0` each week.
//!
//! **THE DECISION IT DRIVES:** *send more, hold, or stop — and when to refuse a win.*

use crate::{ensure_non_negative, ensure_positive, Result};

/// Queue utilization `ρ = λ/μ`.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if the arrival rate `lambda < 0`.
/// - [`crate::ScoreError::NonPositive`] if the service rate `mu <= 0`.
pub fn rho(lambda: f64, mu: f64) -> Result<f64> {
    let lambda = ensure_non_negative("lambda", lambda)?;
    let mu = ensure_positive("mu", mu)?;
    Ok(lambda / mu)
}

/// Hard stability gate: `true` iff `ρ < 1`.
///
/// # Errors
/// Propagates [`rho`] errors.
pub fn is_stable(lambda: f64, mu: f64) -> Result<bool> {
    Ok(rho(lambda, mu)? < 1.0)
}

/// Recommended throttle action given current utilization and a soft ceiling.
///
/// The spec throttles sends when `ρ > ~0.8` even though the hard instability is at
/// `ρ = 1`, leaving headroom before backlog tips over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThrottleAction {
    /// `ρ < soft_ceiling` — room to grow; send more.
    SendMore,
    /// `soft_ceiling ≤ ρ < 1` — at the edge; hold / stop sending the marginal win.
    Hold,
    /// `ρ ≥ 1` — unstable; refuse marginal wins, raise leverage, or decline work.
    Stop,
}

/// Maps utilization to a [`ThrottleAction`] using a soft ceiling (spec default ≈ 0.8).
///
/// # Errors
/// - Propagates [`rho`] errors.
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `soft_ceiling` is outside
///   `(0, 1]` (a ceiling must sit at or below the hard instability point).
pub fn throttle_action(lambda: f64, mu: f64, soft_ceiling: f64) -> Result<ThrottleAction> {
    if !(0.0..=1.0).contains(&soft_ceiling) || soft_ceiling <= 0.0 {
        return Err(crate::ScoreError::ProbabilityOutOfRange {
            field: "soft_ceiling",
            value: soft_ceiling,
        });
    }
    let r = rho(lambda, mu)?;
    Ok(if r >= 1.0 {
        ThrottleAction::Stop
    } else if r >= soft_ceiling {
        ThrottleAction::Hold
    } else {
        ThrottleAction::SendMore
    })
}

/// Saturating win-rate as a function of reputation: `w(R) = w∞ · R / (R + R½)`.
///
/// Monotone increasing and concave. The first few reviews move win-rate the most,
/// which is the math reason early reviews are the campaign's highest-ROI asset.
///
/// # Errors
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `w_inf` is outside `[0, 1]`.
/// - [`crate::ScoreError::Negative`] if reputation `r < 0`.
/// - [`crate::ScoreError::NonPositive`] if `r_half <= 0`.
pub fn win_rate(w_inf: f64, r: f64, r_half: f64) -> Result<f64> {
    let w_inf = crate::ensure_prob("w_inf", w_inf)?;
    let r = ensure_non_negative("r", r)?;
    let r_half = ensure_positive("r_half", r_half)?;
    Ok(w_inf * r / (r + r_half))
}

/// Lyapunov potential `V(x) = ½(B − B★)² + (κ/2)(r★ − r)²` (spec §3.4).
///
/// Non-negative, zero only at the target state `(B★, r★)`. Pass `kappa = 0.0` to use
/// the backlog-only form `V = ½(B − B★)²`.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if `kappa < 0`.
/// - [`crate::ScoreError::NonFinite`] if any input is non-finite.
pub fn lyapunov_v(
    backlog: f64,
    backlog_target: f64,
    kappa: f64,
    revenue: f64,
    revenue_target: f64,
) -> Result<f64> {
    let backlog = crate::ensure_finite("backlog", backlog)?;
    let backlog_target = crate::ensure_finite("backlog_target", backlog_target)?;
    let kappa = ensure_non_negative("kappa", kappa)?;
    let revenue = crate::ensure_finite("revenue", revenue)?;
    let revenue_target = crate::ensure_finite("revenue_target", revenue_target)?;
    let db = backlog - backlog_target;
    let dr = revenue_target - revenue;
    Ok(0.5 * db * db + 0.5 * kappa * dr * dr)
}

/// Result of a one-step Lyapunov throttle check between two consecutive weeks.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LyapunovStep {
    /// `V` at the earlier state.
    pub v_before: f64,
    /// `V` at the later state.
    pub v_after: f64,
    /// `ΔV = V_after − V_before`.
    pub delta_v: f64,
    /// `true` iff `ΔV ≤ 0` — the controller is descending (throttle worked).
    pub descending: bool,
}

/// Evaluates whether a throttle step satisfied the Lyapunov descent condition
/// `ΔV ≤ 0` (spec §3.4).
///
/// A negative `ΔV` means the throttle worked; a positive `ΔV` means you are still
/// over-winning and the throttle failed.
///
/// # Errors
/// Propagates [`lyapunov_v`] errors for either state.
pub fn lyapunov_step(
    backlog_before: f64,
    backlog_after: f64,
    backlog_target: f64,
    kappa: f64,
    revenue_before: f64,
    revenue_after: f64,
    revenue_target: f64,
) -> Result<LyapunovStep> {
    let v_before = lyapunov_v(
        backlog_before,
        backlog_target,
        kappa,
        revenue_before,
        revenue_target,
    )?;
    let v_after = lyapunov_v(
        backlog_after,
        backlog_target,
        kappa,
        revenue_after,
        revenue_target,
    )?;
    let delta_v = v_after - v_before;
    Ok(LyapunovStep {
        v_before,
        v_after,
        delta_v,
        descending: delta_v <= 0.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    const EPS: f64 = 1e-2;

    #[test]
    fn rho_at_the_edge_section_3_2() {
        // λ = 30h/wk, μ = 30h/wk → ρ = 1.0 → NOT stable (at the edge, reject marginal win).
        assert!(approx_eq(rho(30.0, 30.0).unwrap(), 1.0, 1e-12));
        assert!(!is_stable(30.0, 30.0).unwrap());
        // Slightly under → stable.
        assert!(is_stable(29.0, 30.0).unwrap());
        // Over → unstable.
        assert!(!is_stable(35.0, 30.0).unwrap());
        assert!(rho(30.0, 0.0).is_err());
        assert!(rho(-1.0, 30.0).is_err());
    }

    #[test]
    fn throttle_action_bands() {
        // ρ = 30/30 = 1.0 → Stop.
        assert_eq!(
            throttle_action(30.0, 30.0, 0.8).unwrap(),
            ThrottleAction::Stop
        );
        // ρ = 0.85 ≥ 0.8 → Hold.
        assert_eq!(
            throttle_action(25.5, 30.0, 0.8).unwrap(),
            ThrottleAction::Hold
        );
        // ρ = 0.5 < 0.8 → SendMore.
        assert_eq!(
            throttle_action(15.0, 30.0, 0.8).unwrap(),
            ThrottleAction::SendMore
        );
        assert!(throttle_action(15.0, 30.0, 1.5).is_err());
    }

    #[test]
    fn win_rate_concave_cold_start_section_3_3() {
        // w∞=0.05, R½=5.
        // R=0 → 0% (dead basin).
        assert!(approx_eq(win_rate(0.05, 0.0, 5.0).unwrap(), 0.0, 1e-12));
        // R=3 → 0.05·3/8 = 0.01875 ≈ 1.9%.
        assert!(approx_eq(win_rate(0.05, 3.0, 5.0).unwrap(), 0.01875, 1e-6));
        // R=10 → 0.05·10/15 = 0.0333 ≈ 3.3%.
        assert!(approx_eq(win_rate(0.05, 10.0, 5.0).unwrap(), 0.03333, 1e-4));
        // Concavity: the first 3 reviews add more win-rate than reviews 7→10.
        let g_0_3 = win_rate(0.05, 3.0, 5.0).unwrap() - win_rate(0.05, 0.0, 5.0).unwrap();
        let g_7_10 = win_rate(0.05, 10.0, 5.0).unwrap() - win_rate(0.05, 7.0, 5.0).unwrap();
        assert!(g_0_3 > g_7_10);
    }

    #[test]
    fn lyapunov_throttle_descends_section_3_4() {
        // B★=25, B=40, κ=0 (revenue term zero) → V = ½(40−25)² = 112.5.
        let v0 = lyapunov_v(40.0, 25.0, 0.0, 2000.0, 2000.0).unwrap();
        assert!(approx_eq(v0, 112.5, EPS));
        // Next week B=27 → V = ½(27−25)² = 2.0.
        let v1 = lyapunov_v(27.0, 25.0, 0.0, 2000.0, 2000.0).unwrap();
        assert!(approx_eq(v1, 2.0, EPS));

        // Step: ΔV = 2.0 − 112.5 = −110.5 ≤ 0 → descending → throttle worked.
        let step = lyapunov_step(40.0, 27.0, 25.0, 0.0, 2000.0, 2000.0, 2000.0).unwrap();
        assert!(approx_eq(step.delta_v, -110.5, EPS));
        assert!(step.descending);

        // A POSITIVE ΔV means the throttle failed (still over-winning).
        let bad = lyapunov_step(27.0, 40.0, 25.0, 0.0, 2000.0, 2000.0, 2000.0).unwrap();
        assert!(bad.delta_v > 0.0);
        assert!(!bad.descending);
    }

    #[test]
    fn lyapunov_v_is_zero_only_at_target() {
        assert!(approx_eq(
            lyapunov_v(25.0, 25.0, 0.5, 2000.0, 2000.0).unwrap(),
            0.0,
            1e-12
        ));
        assert!(lyapunov_v(25.0, 25.0, -1.0, 2000.0, 2000.0).is_err());
    }
}
