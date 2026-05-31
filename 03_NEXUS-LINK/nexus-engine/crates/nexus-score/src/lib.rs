//! # nexus-score
//!
//! Typed, tested port of the Nexus Link acquisition math spine.
//!
//! Every model in this crate exists because it **changes what an operator does** —
//! which lead to touch first, what to bid, when to follow up, when to STOP sending,
//! and when to block a state transition. Decoration was cut at the source.
//!
//! ## Honesty contract (inherited from the spec)
//!
//! - The scoring weights are **designed, not learned**, until outcome data exists.
//! - Calibration ([`scoring::brier_score`]) is the only thing that converts a number
//!   into a probability you can bet effort on. Until outcomes are logged, every `P`
//!   is a **prior**, not a measurement.
//! - The internal energy/`U` landscape ([`salience`]) is an **internal capability**
//!   for state-gating. It is never a product, never client-facing, never named to a
//!   buyer.
//!
//! ## Modules
//!
//! | Module | Decision it drives |
//! |---|---|
//! | [`scoring`]  | which lead gets the next hour, and at what intensity |
//! | [`ev`]       | the literal sort order of today's pursue-queue |
//! | [`queue`]    | send more, hold, or stop — and when to refuse a win |
//! | [`forecast`] | how many sends to commit, and whether to trust early rates |
//! | [`cadence`]  | follow-up count and spacing per lead, with a hard computed stop |
//! | [`salience`] | block or allow a state transition (a veto, not a ranking) |
//!
//! ## Engineering bar
//!
//! - `f64` math throughout, `std` only, no external crates.
//! - No `unwrap`/`expect`/`panic` in library paths — invalid inputs return
//!   [`Result`] with a typed [`ScoreError`], or [`Option`] where absence is the
//!   honest answer.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
// The workspace denies `unwrap`/`expect`/`panic` so **library paths** stay panic-free.
// In test code, `.unwrap()` on a `Result` is the idiomatic assertion — a panic there
// *is* the test failure. Scope the allow to test builds only; library paths stay strict.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

pub mod cadence;
pub mod ev;
pub mod forecast;
pub mod queue;
pub mod salience;
pub mod scoring;

use core::fmt;

/// Errors returned by the kernel when an input violates a model precondition.
///
/// Library code never panics on bad input; it returns one of these instead so
/// the caller decides how to recover.
#[derive(Debug, Clone, PartialEq)]
pub enum ScoreError {
    /// A probability argument fell outside the closed interval `[0, 1]`.
    ProbabilityOutOfRange {
        /// Human-readable name of the offending field.
        field: &'static str,
        /// The value that violated the bound.
        value: f64,
    },
    /// A value that must be strictly positive was zero or negative
    /// (e.g. effort hours, a half-life, a service rate).
    NonPositive {
        /// Human-readable name of the offending field.
        field: &'static str,
        /// The value that violated the bound.
        value: f64,
    },
    /// A value that must be non-negative was negative
    /// (e.g. a count, a deal value, an arrival rate).
    Negative {
        /// Human-readable name of the offending field.
        field: &'static str,
        /// The value that violated the bound.
        value: f64,
    },
    /// A required input was non-finite (`NaN` or infinite).
    NonFinite {
        /// Human-readable name of the offending field.
        field: &'static str,
    },
    /// A decay/growth factor was outside the open interval `(0, 1)`.
    FactorOutOfRange {
        /// Human-readable name of the offending field.
        field: &'static str,
        /// The value that violated the bound.
        value: f64,
    },
    /// An input collection that must be non-empty was empty.
    Empty {
        /// Human-readable name of the offending field.
        field: &'static str,
    },
}

impl fmt::Display for ScoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScoreError::ProbabilityOutOfRange { field, value } => {
                write!(f, "{field} must be in [0, 1], got {value}")
            }
            ScoreError::NonPositive { field, value } => {
                write!(f, "{field} must be > 0, got {value}")
            }
            ScoreError::Negative { field, value } => {
                write!(f, "{field} must be >= 0, got {value}")
            }
            ScoreError::NonFinite { field } => {
                write!(f, "{field} must be finite (not NaN or infinite)")
            }
            ScoreError::FactorOutOfRange { field, value } => {
                write!(f, "{field} must be in (0, 1), got {value}")
            }
            ScoreError::Empty { field } => write!(f, "{field} must not be empty"),
        }
    }
}

impl std::error::Error for ScoreError {}

/// Crate-wide result alias.
pub type Result<T> = core::result::Result<T, ScoreError>;

// --- internal validation helpers (shared by all modules) ---

/// Returns `Ok(p)` iff `p` is finite and in the closed interval `[0, 1]`.
pub(crate) fn ensure_prob(field: &'static str, p: f64) -> Result<f64> {
    if !p.is_finite() {
        return Err(ScoreError::NonFinite { field });
    }
    if !(0.0..=1.0).contains(&p) {
        return Err(ScoreError::ProbabilityOutOfRange { field, value: p });
    }
    Ok(p)
}

/// Returns `Ok(x)` iff `x` is finite and strictly greater than zero.
pub(crate) fn ensure_positive(field: &'static str, x: f64) -> Result<f64> {
    if !x.is_finite() {
        return Err(ScoreError::NonFinite { field });
    }
    if x <= 0.0 {
        return Err(ScoreError::NonPositive { field, value: x });
    }
    Ok(x)
}

/// Returns `Ok(x)` iff `x` is finite and greater than or equal to zero.
pub(crate) fn ensure_non_negative(field: &'static str, x: f64) -> Result<f64> {
    if !x.is_finite() {
        return Err(ScoreError::NonFinite { field });
    }
    if x < 0.0 {
        return Err(ScoreError::Negative { field, value: x });
    }
    Ok(x)
}

/// Returns `Ok(x)` iff `x` is finite.
pub(crate) fn ensure_finite(field: &'static str, x: f64) -> Result<f64> {
    if x.is_finite() {
        Ok(x)
    } else {
        Err(ScoreError::NonFinite { field })
    }
}

/// Returns `Ok(g)` iff `g` is finite and in the open interval `(0, 1)`.
pub(crate) fn ensure_factor(field: &'static str, g: f64) -> Result<f64> {
    if !g.is_finite() {
        return Err(ScoreError::NonFinite { field });
    }
    if g <= 0.0 || g >= 1.0 {
        return Err(ScoreError::FactorOutOfRange { field, value: g });
    }
    Ok(g)
}

/// Approximate float equality for tests and callers that need it.
///
/// Returns `true` when `|a - b| <= eps`. Both `NaN` inputs yield `false`.
#[must_use]
pub fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
    if a.is_nan() || b.is_nan() {
        return false;
    }
    (a - b).abs() <= eps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approx_eq_basic() {
        assert!(approx_eq(0.622, 0.6224593, 1e-3));
        assert!(!approx_eq(0.5, 0.6, 1e-3));
        assert!(!approx_eq(f64::NAN, 0.5, 1e-3));
    }

    #[test]
    fn ensure_prob_rejects_out_of_range() {
        assert!(ensure_prob("p", -0.1).is_err());
        assert!(ensure_prob("p", 1.1).is_err());
        assert!(ensure_prob("p", f64::NAN).is_err());
        assert_eq!(ensure_prob("p", 0.5), Ok(0.5));
    }

    #[test]
    fn ensure_positive_rejects_zero_and_negative() {
        assert!(ensure_positive("h", 0.0).is_err());
        assert!(ensure_positive("h", -1.0).is_err());
        assert_eq!(ensure_positive("h", 2.0), Ok(2.0));
    }

    #[test]
    fn ensure_factor_rejects_boundaries() {
        assert!(ensure_factor("g", 0.0).is_err());
        assert!(ensure_factor("g", 1.0).is_err());
        assert_eq!(ensure_factor("g", 0.5), Ok(0.5));
    }
}
