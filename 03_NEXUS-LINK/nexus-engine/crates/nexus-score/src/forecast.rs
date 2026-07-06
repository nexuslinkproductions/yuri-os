//! # Conversion forecasting — survivorship funnel + bands (spec §4)
//!
//! Forecast revenue by pushing volume through the funnel, and carry an **uncertainty
//! band** — never a point. At cold-start (`n = 1`), a single-number forecast is a lie;
//! the band *is* the message.
//!
//! ```text
//! Won_mean = n · p                       p = P(reply) · P(conv|reply)
//! SD       = √(n · p · (1 − p))          (binomial)
//! 95% band = n·p ± 1.96 · SD
//! ```
//!
//! Report **conservative / expected / aggressive** = lower-band / mean / upper-band.
//! The lower band is floored at 0 (you cannot win a negative number of deals).
//!
//! **THE DECISION IT DRIVES:** *how many sends to commit (raise n until the band is
//! tolerable), and whether to trust early rates.*

use crate::{ensure_non_negative, ensure_prob, Result};

/// The 95% z-multiplier for a two-sided normal-approximation interval.
pub const Z_95: f64 = 1.96;

/// Expected wins through the two-stage funnel: `Won = n · P(reply) · P(conv|reply)`.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if `sends < 0`.
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if either rate is outside `[0, 1]`.
pub fn expected_wins(sends: f64, p_reply: f64, p_conv_given_reply: f64) -> Result<f64> {
    let n = ensure_non_negative("sends", sends)?;
    let pr = ensure_prob("p_reply", p_reply)?;
    let pc = ensure_prob("p_conv_given_reply", p_conv_given_reply)?;
    Ok(n * pr * pc)
}

/// Binomial standard deviation of the win count: `SD = √(n · p · (1 − p))`.
///
/// `p` is the blended per-send conversion probability `P(reply)·P(conv|reply)`.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if `sends < 0`.
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `p` is outside `[0, 1]`.
pub fn binomial_sd(sends: f64, p: f64) -> Result<f64> {
    let n = ensure_non_negative("sends", sends)?;
    let p = ensure_prob("p", p)?;
    Ok((n * p * (1.0 - p)).sqrt())
}

/// A conservative / expected / aggressive forecast triple, all in win counts.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ForecastBand {
    /// Lower 95% bound (floored at 0). The "conservative" scenario.
    pub conservative: f64,
    /// Mean expected wins `n · p`. The "expected" scenario.
    pub expected: f64,
    /// Upper 95% bound. The "aggressive" scenario.
    pub aggressive: f64,
    /// Binomial standard deviation of the win count.
    pub sd: f64,
}

/// 95% forecast band for win count over `sends` at blended probability `p`.
///
/// Computes `n·p ± 1.96·SD`, floors the conservative bound at 0, and returns the
/// triple plus the SD. This is the load-bearing output; the bare mean is theater at
/// low `n`.
///
/// # Errors
/// Propagates [`expected_wins`] / [`binomial_sd`] errors on bad inputs.
pub fn forecast_band(sends: f64, p_reply: f64, p_conv_given_reply: f64) -> Result<ForecastBand> {
    let p =
        ensure_prob("p_reply", p_reply)? * ensure_prob("p_conv_given_reply", p_conv_given_reply)?;
    let mean = expected_wins(sends, p_reply, p_conv_given_reply)?;
    let sd = binomial_sd(sends, p)?;
    let half = Z_95 * sd;
    Ok(ForecastBand {
        conservative: (mean - half).max(0.0),
        expected: mean,
        aggressive: mean + half,
        sd,
    })
}

/// Converts a win-count [`ForecastBand`] to a revenue band by multiplying through
/// `V_net`.
///
/// # Errors
/// [`crate::ScoreError::Negative`] if `v_net < 0`.
pub fn revenue_band(band: &ForecastBand, v_net: f64) -> Result<ForecastBand> {
    let v = ensure_non_negative("v_net", v_net)?;
    Ok(ForecastBand {
        conservative: band.conservative * v,
        expected: band.expected * v,
        aggressive: band.aggressive * v,
        sd: band.sd * v,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    const EPS: f64 = 1e-2;

    #[test]
    fn worked_band_section_4_4() {
        // 80 sends, P(reply)=0.20, P(conv|reply)=0.40 → p=0.08.
        // Won_mean = 80·0.08 = 6.4.
        assert!(approx_eq(
            expected_wins(80.0, 0.20, 0.40).unwrap(),
            6.4,
            EPS
        ));
        // SD = √(80·0.08·0.92) = √5.888 = 2.4265.
        assert!(approx_eq(binomial_sd(80.0, 0.08).unwrap(), 2.43, EPS));

        let band = forecast_band(80.0, 0.20, 0.40).unwrap();
        assert!(approx_eq(band.expected, 6.4, EPS));
        assert!(approx_eq(band.sd, 2.43, EPS));
        // 95% band = 6.4 ± 1.96·2.43 = 6.4 ± 4.76 → [1.6, 11.2].
        assert!(approx_eq(band.conservative, 1.64, 5e-2));
        assert!(approx_eq(band.aggressive, 11.16, 5e-2));
    }

    #[test]
    fn revenue_band_section_4_4() {
        let band = forecast_band(80.0, 0.20, 0.40).unwrap();
        let rev = revenue_band(&band, 180.0).unwrap();
        // Revenue band ≈ [€290, €2020], expected ≈ €1150.
        assert!(approx_eq(rev.expected, 1152.0, 5.0));
        assert!(approx_eq(rev.conservative, 295.0, 15.0));
        assert!(approx_eq(rev.aggressive, 2008.0, 15.0));
    }

    #[test]
    fn conservative_bound_floored_at_zero() {
        // Tiny n: mean tiny, band would go negative → conservative must clamp to 0.
        let band = forecast_band(2.0, 0.20, 0.40).unwrap();
        assert!(band.conservative >= 0.0);
        assert!(band.expected > 0.0);
    }

    #[test]
    fn forecast_rejects_bad_inputs() {
        assert!(forecast_band(-1.0, 0.2, 0.4).is_err());
        assert!(forecast_band(80.0, 1.5, 0.4).is_err());
        assert!(binomial_sd(80.0, -0.1).is_err());
    }
}
