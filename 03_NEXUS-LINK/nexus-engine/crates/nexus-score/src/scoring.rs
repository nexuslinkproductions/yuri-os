//! # Lead scoring — calibrated probability (spec §1)
//!
//! A 0–100 "lead score" is uncomparable and uncalibrated. A **probability** is
//! bettable: `P(conv)=0.30` means *if you pursue 10 of these, ~3 convert.* That is
//! the only form a score can take that plugs into EV ([`crate::ev`]).
//!
//! The model is a **two-stage logistic**, because the failure modes differ — a lead
//! can be reply-likely but convert-unlikely, or vice versa:
//!
//! ```text
//! z_reply = b_r + Σ wᵢ·xᵢ            P(reply|L)      = σ(z_reply)
//! z_conv  = b_c + Σ vⱼ·xⱼ            P(conv|reply,L) = σ(z_conv)
//! P(conv|L) = P(reply|L) · P(conv|reply,L)
//! ```
//!
//! Evidence is additive in **logits** (log-odds) — probabilities multiply badly and
//! clip at 0/1, but log-odds add cleanly, which is exactly how a human reasons
//! ("verified budget → bump; no reply history → cut"). The squash to `[0,1]` happens
//! once at the end via the logistic `σ`.
//!
//! **THE DECISION IT DRIVES:** *which lead gets the next hour, and at what intensity.*

use crate::{ensure_finite, ensure_positive, ensure_prob, Result};

/// The logistic (sigmoid) function `σ(z) = 1 / (1 + e^-z)`.
///
/// Maps any real log-odds value to a probability in `(0, 1)`. Saturates cleanly at
/// the extremes (`σ(+∞) → 1`, `σ(-∞) → 0`) without overflow, so non-finite or large
/// magnitude inputs are handled gracefully rather than panicking.
///
/// # Examples
/// ```
/// use nexus_score::scoring::sigmoid;
/// use nexus_score::approx_eq;
/// // σ(0.5) ≈ 0.622 — the spec §1.5 reply probability.
/// assert!(approx_eq(sigmoid(0.5), 0.622, 1e-3));
/// ```
#[must_use]
pub fn sigmoid(z: f64) -> f64 {
    if z.is_nan() {
        return f64::NAN;
    }
    // Numerically stable two-branch form avoids overflow of e^|z| for large |z|.
    if z >= 0.0 {
        1.0 / (1.0 + (-z).exp())
    } else {
        let ez = z.exp();
        ez / (1.0 + ez)
    }
}

/// Computes the log-odds score `z = b + Σ wᵢ·xᵢ` from a bias and weighted features.
///
/// `terms` is an iterator of `(weight, feature)` pairs in logit units. A weight of
/// `+0.7` multiplies the odds by `e^0.7 ≈ 2×`. Features are typically binary `{0,1}`
/// or scaled to `[0,1]` (optionally confidence-decayed via [`confidence_decay`]).
///
/// # Errors
/// Returns [`crate::ScoreError::NonFinite`] if the bias, any weight, any feature, or
/// the accumulated score is non-finite.
pub fn logit_score<I>(bias: f64, terms: I) -> Result<f64>
where
    I: IntoIterator<Item = (f64, f64)>,
{
    let mut z = ensure_finite("bias", bias)?;
    for (w, x) in terms {
        let w = ensure_finite("weight", w)?;
        let x = ensure_finite("feature", x)?;
        z += w * x;
    }
    ensure_finite("z", z)
}

/// `P(reply|L) = σ(b_r + Σ wᵢ·xᵢ)`.
///
/// # Errors
/// Propagates [`logit_score`] errors on non-finite inputs.
pub fn p_reply<I>(bias_reply: f64, reply_terms: I) -> Result<f64>
where
    I: IntoIterator<Item = (f64, f64)>,
{
    Ok(sigmoid(logit_score(bias_reply, reply_terms)?))
}

/// `P(conv|reply,L) = σ(b_c + Σ vⱼ·xⱼ)`.
///
/// # Errors
/// Propagates [`logit_score`] errors on non-finite inputs.
pub fn p_conv_given_reply<I>(bias_conv: f64, conv_terms: I) -> Result<f64>
where
    I: IntoIterator<Item = (f64, f64)>,
{
    Ok(sigmoid(logit_score(bias_conv, conv_terms)?))
}

/// Unconditional conversion probability `P(conv|L) = P(reply|L) · P(conv|reply,L)`.
///
/// This composes the two stages. Each factor must already be a valid probability;
/// pass the outputs of [`p_reply`] and [`p_conv_given_reply`].
///
/// # Errors
/// Returns [`crate::ScoreError::ProbabilityOutOfRange`] / `NonFinite` if either
/// factor is not a finite probability in `[0, 1]`.
pub fn p_conv(p_reply: f64, p_conv_given_reply: f64) -> Result<f64> {
    let r = ensure_prob("p_reply", p_reply)?;
    let c = ensure_prob("p_conv_given_reply", p_conv_given_reply)?;
    Ok(r * c)
}

/// Bayesian first-touch update (spec §1.6).
///
/// The moment a lead *acts* (opens, replies fast, asks a scoping question), update
/// the prior with the likelihood ratio of that signal:
///
/// ```text
/// P_post = (P_prior · L_T) / (P_prior · L_T + (1 − P_prior) · L_F)
/// ```
///
/// where `l_true` is the likelihood of the signal **if** they'll convert and
/// `l_false` the likelihood **if** they won't.
///
/// # Errors
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `prior`, `l_true`, or `l_false`
///   is outside `[0, 1]`.
/// - [`crate::ScoreError::NonPositive`] if the normalizing denominator is zero
///   (both likelihoods zero ⇒ the signal is impossible under either hypothesis, so
///   no posterior is defined).
pub fn bayes_update(prior: f64, l_true: f64, l_false: f64) -> Result<f64> {
    let prior = ensure_prob("prior", prior)?;
    let l_true = ensure_prob("l_true", l_true)?;
    let l_false = ensure_prob("l_false", l_false)?;
    let num = prior * l_true;
    let denom = num + (1.0 - prior) * l_false;
    // ensure_positive rejects a zero (or non-finite) denominator without panicking.
    ensure_positive("bayes_denominator", denom)?;
    Ok(num / denom)
}

/// Confidence decay on stale evidence (spec §1.8).
///
/// Evidence ages. A "verified budget" scraped 30 days ago is weaker than one from
/// today: `x_eff = x_base · 0.5^(age / halfLife)`. Feed `x_eff` (not the raw base)
/// into the logit terms.
///
/// # Errors
/// - [`crate::ScoreError::NonPositive`] if `half_life <= 0`.
/// - [`crate::ScoreError::NonFinite`] if `x_base` or `age` is non-finite.
///
/// Negative `age` is permitted and amplifies the feature (future-dated evidence);
/// callers that want to forbid it should clamp `age` to `>= 0` beforehand.
pub fn confidence_decay(x_base: f64, age: f64, half_life: f64) -> Result<f64> {
    let x_base = ensure_finite("x_base", x_base)?;
    let age = ensure_finite("age", age)?;
    let half_life = ensure_positive("half_life", half_life)?;
    Ok(x_base * 0.5_f64.powf(age / half_life))
}

/// Brier score over a slice of (prediction, outcome) pairs (spec §1.7).
///
/// The honesty gate. After enough logged outcomes, compute the mean squared error
/// of predicted probability vs realized outcome `o ∈ {0, 1}`:
///
/// ```text
/// Brier = (1/N) Σ (Pᵢ − oᵢ)²
/// ```
///
/// - `Brier ≈ 0.0` → near-perfect.
/// - `Brier = 0.25` → no better than always guessing 0.5 → the weights are theater.
///
/// # Errors
/// - [`crate::ScoreError::Empty`] if `samples` is empty (a Brier over nothing is
///   undefined, not zero).
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if any prediction is outside
///   `[0, 1]` or any outcome is not exactly `0.0` or `1.0`.
pub fn brier_score(samples: &[(f64, f64)]) -> Result<f64> {
    if samples.is_empty() {
        return Err(crate::ScoreError::Empty { field: "samples" });
    }
    let mut acc = 0.0;
    for &(pred, outcome) in samples {
        let pred = ensure_prob("prediction", pred)?;
        // Outcome must be a hard {0,1} label, not an arbitrary probability.
        if outcome != 0.0 && outcome != 1.0 {
            return Err(crate::ScoreError::ProbabilityOutOfRange {
                field: "outcome",
                value: outcome,
            });
        }
        let d = pred - outcome;
        acc += d * d;
    }
    Ok(acc / samples.len() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    const EPS: f64 = 1e-3;

    #[test]
    fn sigmoid_midpoint_and_saturation() {
        assert!(approx_eq(sigmoid(0.0), 0.5, 1e-12));
        // Spec §1.5: σ(0.5) = 0.622.
        assert!(approx_eq(sigmoid(0.5), 0.622, EPS));
        // Spec §1.5: σ(1.5) = 0.818.
        assert!(approx_eq(sigmoid(1.5), 0.818, EPS));
        // Saturation must not overflow.
        assert!(approx_eq(sigmoid(1000.0), 1.0, 1e-12));
        assert!(approx_eq(sigmoid(-1000.0), 0.0, 1e-12));
        assert!(sigmoid(f64::NAN).is_nan());
    }

    #[test]
    fn worked_two_stage_example_section_1_5() {
        // z_reply = −1.4 + 0.9 + 0.4 + 0.6 + 0.5 − 0.5 = 0.5
        let z_reply = logit_score(
            -1.4,
            [
                (0.9, 1.0),  // fresh <24h
                (0.4, 1.0),  // explicit budget
                (0.6, 1.0),  // decision-maker reachable
                (0.5, 1.0),  // pain matches proof-piece
                (-0.5, 1.0), // crowded
            ],
        )
        .unwrap();
        assert!(approx_eq(z_reply, 0.5, 1e-12));
        let pr = sigmoid(z_reply);
        assert!(approx_eq(pr, 0.622, EPS));

        // z_conv = −0.4 + 0.8 + 0.5 + 0.9 − 0.3 = 1.5
        let z_conv = logit_score(
            -0.4,
            [
                (0.8, 1.0),  // budget
                (0.5, 1.0),  // DM
                (0.9, 1.0),  // match
                (-0.3, 1.0), // crowded
            ],
        )
        .unwrap();
        assert!(approx_eq(z_conv, 1.5, 1e-12));
        let pcr = sigmoid(z_conv);
        assert!(approx_eq(pcr, 0.818, EPS));

        // P(conv|L) = 0.622 × 0.818 = 0.509
        let pc = p_conv(pr, pcr).unwrap();
        assert!(approx_eq(pc, 0.509, 2e-3));
    }

    #[test]
    fn p_reply_and_conv_helpers_match_manual() {
        let pr = p_reply(
            -1.4,
            [(0.9, 1.0), (0.4, 1.0), (0.6, 1.0), (0.5, 1.0), (-0.5, 1.0)],
        )
        .unwrap();
        assert!(approx_eq(pr, 0.622, EPS));
        let pcr =
            p_conv_given_reply(-0.4, [(0.8, 1.0), (0.5, 1.0), (0.9, 1.0), (-0.3, 1.0)]).unwrap();
        assert!(approx_eq(pcr, 0.818, EPS));
    }

    #[test]
    fn bayes_update_worked_section_1_6() {
        // prior 0.509, signal "replied within 1h with scoping question", L_T=0.8, L_F=0.3
        // P_post = (0.509·0.8) / (0.509·0.8 + 0.491·0.3) = 0.407 / 0.554 = 0.735
        let post = bayes_update(0.509, 0.8, 0.3).unwrap();
        assert!(approx_eq(post, 0.735, 2e-3));
    }

    #[test]
    fn bayes_update_rejects_impossible_signal() {
        // Both likelihoods zero ⇒ no posterior defined ⇒ error, not NaN or panic.
        assert!(bayes_update(0.5, 0.0, 0.0).is_err());
        assert!(bayes_update(1.5, 0.8, 0.3).is_err());
    }

    #[test]
    fn confidence_decay_worked_section_1_8() {
        // x_base=1.0, age=20, halfLife=14 → 0.5^(20/14) = 0.5^1.43 ≈ 0.37
        let x_eff = confidence_decay(1.0, 20.0, 14.0).unwrap();
        assert!(approx_eq(x_eff, 0.37, 5e-3));
        // Age 0 ⇒ no decay.
        assert!(approx_eq(
            confidence_decay(1.0, 0.0, 14.0).unwrap(),
            1.0,
            1e-12
        ));
        // One half-life ⇒ exactly halved.
        assert!(approx_eq(
            confidence_decay(1.0, 14.0, 14.0).unwrap(),
            0.5,
            1e-12
        ));
        // Zero half-life is invalid.
        assert!(confidence_decay(1.0, 20.0, 0.0).is_err());
    }

    #[test]
    fn brier_worked_section_1_7() {
        // predicted [0.9,0.8,0.3,0.6,0.2], outcomes [1,1,0,0,0] → 0.108
        let samples = [(0.9, 1.0), (0.8, 1.0), (0.3, 0.0), (0.6, 0.0), (0.2, 0.0)];
        let b = brier_score(&samples).unwrap();
        assert!(approx_eq(b, 0.108, 1e-6));
        // The 0.25 reference: always-guess-0.5 on a balanced split.
        let coin = [(0.5, 1.0), (0.5, 0.0)];
        assert!(approx_eq(brier_score(&coin).unwrap(), 0.25, 1e-12));
    }

    #[test]
    fn brier_rejects_empty_and_bad_labels() {
        assert!(brier_score(&[]).is_err());
        assert!(brier_score(&[(0.5, 0.5)]).is_err()); // outcome must be 0 or 1
        assert!(brier_score(&[(1.5, 1.0)]).is_err()); // prediction out of range
    }

    #[test]
    fn logit_score_rejects_non_finite() {
        assert!(logit_score(f64::INFINITY, [(0.5, 1.0)]).is_err());
        assert!(logit_score(0.0, [(f64::NAN, 1.0)]).is_err());
    }
}
