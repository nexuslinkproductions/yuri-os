//! # Expected-Value prioritization (spec §2)
//!
//! Probability alone under-ranks: a 51% lead worth €200 for 1h beats a 70% lead
//! worth €150 for 4h. You rank by **EV per unit effort**:
//!
//! ```text
//! V_net  = V_deal · (1 − take)
//! EV(L)  = P(conv|L) · V_net(L)
//! EVH(L) = EV(L) / c(L)              c(L) = effort hours
//! ```
//!
//! Pursue in **descending EVH** until you hit the day's effort budget. This routinely
//! overturns the intuitive "chase the highest probability" order — that inversion is
//! the entire reason EV exists.
//!
//! **THE DECISION IT DRIVES:** *the literal sort order of today's pursue-queue.*

use crate::{ensure_non_negative, ensure_positive, ensure_prob, Result};

/// Net deal value after platform take-rate: `V_net = V_deal · (1 − take)`.
///
/// # Errors
/// - [`crate::ScoreError::Negative`] if `v_deal < 0`.
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `take` is outside `[0, 1]`.
pub fn v_net(v_deal: f64, take: f64) -> Result<f64> {
    let v_deal = ensure_non_negative("v_deal", v_deal)?;
    let take = ensure_prob("take", take)?;
    Ok(v_deal * (1.0 - take))
}

/// Expected value of pursuing a lead: `EV = P(conv) · V_net`.
///
/// # Errors
/// - [`crate::ScoreError::ProbabilityOutOfRange`] if `p_conv` is outside `[0, 1]`.
/// - [`crate::ScoreError::Negative`] if `v_net < 0`.
pub fn ev(p_conv: f64, v_net: f64) -> Result<f64> {
    let p = ensure_prob("p_conv", p_conv)?;
    let v = ensure_non_negative("v_net", v_net)?;
    Ok(p * v)
}

/// EV per hour of effort: `EVH = EV / c`.
///
/// # Errors
/// - [`crate::ScoreError::NonPositive`] if `effort_hours <= 0` (you cannot rank by
///   per-hour value when zero hours are spent).
/// - Propagates [`ev`] errors.
pub fn evh(p_conv: f64, v_net: f64, effort_hours: f64) -> Result<f64> {
    let c = ensure_positive("effort_hours", effort_hours)?;
    Ok(ev(p_conv, v_net)? / c)
}

/// A lead's pursue inputs, carried alongside an opaque caller-supplied id.
///
/// The generic `id` lets callers attach any handle (a string key, an index, a struct)
/// without this crate dictating an identity type.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lead<Id> {
    /// Caller's identifier for this lead — preserved verbatim through ranking.
    pub id: Id,
    /// Unconditional conversion probability `P(conv|L)` from [`crate::scoring`].
    pub p_conv: f64,
    /// Net deal value after take-rate ([`v_net`]).
    pub v_net: f64,
    /// Estimated effort hours `c(L)` to pursue.
    pub effort_hours: f64,
}

/// A scored lead: its id paired with its computed EVH.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScoredLead<Id> {
    /// Caller's identifier, preserved from the input [`Lead`].
    pub id: Id,
    /// Expected value per hour — the ranking key.
    pub evh: f64,
}

/// Ranks leads by **descending EVH** — the literal sort order of the pursue-queue.
///
/// Returns one [`ScoredLead`] per input, highest EVH first. Ties are broken by the
/// original input order (the sort is stable), so deterministic queues stay
/// deterministic.
///
/// # Errors
/// Propagates [`evh`] errors (bad probability, negative value, or non-positive
/// effort) for the first offending lead, so a single malformed lead does not
/// silently corrupt the ranking.
pub fn rank_by_evh<Id: Copy>(leads: &[Lead<Id>]) -> Result<Vec<ScoredLead<Id>>> {
    let mut scored: Vec<ScoredLead<Id>> = Vec::with_capacity(leads.len());
    for lead in leads {
        let score = evh(lead.p_conv, lead.v_net, lead.effort_hours)?;
        scored.push(ScoredLead {
            id: lead.id,
            evh: score,
        });
    }
    // Descending EVH; stable so equal-EVH leads keep input order. EVH is finite here
    // (evh() rejects non-finite inputs), so partial_cmp never yields None in practice;
    // unwrap_or(Equal) is a defensive fallback that keeps the sort total regardless.
    scored.sort_by(|a, b| {
        b.evh
            .partial_cmp(&a.evh)
            .unwrap_or(core::cmp::Ordering::Equal)
    });
    Ok(scored)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::approx_eq;

    const EPS: f64 = 1e-2;

    #[test]
    fn v_net_take_rate() {
        // €200 deal, 10% take → €180.
        assert!(approx_eq(v_net(200.0, 0.10).unwrap(), 180.0, 1e-9));
        assert!(approx_eq(v_net(150.0, 0.20).unwrap(), 120.0, 1e-9));
        assert!(v_net(-1.0, 0.1).is_err());
        assert!(v_net(100.0, 1.5).is_err());
    }

    #[test]
    fn evh_section_2_3_per_lead() {
        // A: P=0.51, Vnet=180, c=1.5 → EV=91.8, EVH=61.2
        assert!(approx_eq(ev(0.51, 180.0).unwrap(), 91.8, EPS));
        assert!(approx_eq(evh(0.51, 180.0, 1.5).unwrap(), 61.2, EPS));
        // B: P=0.20, Vnet=2328, c=6 → EV=465.6, EVH=77.6
        assert!(approx_eq(ev(0.20, 2328.0).unwrap(), 465.6, EPS));
        assert!(approx_eq(evh(0.20, 2328.0, 6.0).unwrap(), 77.6, EPS));
        // C: P=0.70, Vnet=120, c=1.0 → EV=84, EVH=84
        assert!(approx_eq(ev(0.70, 120.0).unwrap(), 84.0, EPS));
        assert!(approx_eq(evh(0.70, 120.0, 1.0).unwrap(), 84.0, EPS));
    }

    #[test]
    fn ranking_inverts_naive_probability_order_section_2_3() {
        // Three leads from the spec. V_net is precomputed via v_net() for B's direct
        // retainer (€2400 × (1 − 0.03) = €2328).
        let leads = [
            Lead {
                id: "A_job",
                p_conv: 0.51,
                v_net: 180.0,
                effort_hours: 1.5,
            },
            Lead {
                id: "B_retainer",
                p_conv: 0.20,
                v_net: v_net(2400.0, 0.03).unwrap(),
                effort_hours: 6.0,
            },
            Lead {
                id: "C_fiverr",
                p_conv: 0.70,
                v_net: 120.0,
                effort_hours: 1.0,
            },
        ];
        let ranked = rank_by_evh(&leads).unwrap();

        // Rank by EVH: C (84) > B (~78) > A (61).
        assert_eq!(ranked[0].id, "C_fiverr");
        assert_eq!(ranked[1].id, "B_retainer");
        assert_eq!(ranked[2].id, "A_job");

        // The load-bearing inversion: the 20%-prob retainer (B) outranks the
        // 70%-prob small job by intuition... no — it outranks the HIGHEST-prob naive
        // pick A. Specifically the lowest-probability lead (B, 20%) lands SECOND,
        // ahead of the 51% lead A, because its V_net is an order of magnitude larger.
        assert!(ranked[1].evh > ranked[2].evh);
        assert_eq!(ranked[2].id, "A_job"); // naive "highest expected probability" loser

        // Numeric anchors.
        assert!(approx_eq(ranked[0].evh, 84.0, EPS));
        assert!(approx_eq(ranked[1].evh, 77.6, EPS));
        assert!(approx_eq(ranked[2].evh, 61.2, EPS));
    }

    #[test]
    fn ranking_is_stable_on_ties() {
        let leads = [
            Lead {
                id: 1u32,
                p_conv: 0.5,
                v_net: 100.0,
                effort_hours: 1.0,
            },
            Lead {
                id: 2u32,
                p_conv: 0.5,
                v_net: 100.0,
                effort_hours: 1.0,
            },
            Lead {
                id: 3u32,
                p_conv: 0.5,
                v_net: 100.0,
                effort_hours: 1.0,
            },
        ];
        let ranked = rank_by_evh(&leads).unwrap();
        assert_eq!([ranked[0].id, ranked[1].id, ranked[2].id], [1, 2, 3]);
    }

    #[test]
    fn ranking_rejects_bad_lead() {
        let leads = [Lead {
            id: 0u8,
            p_conv: 0.5,
            v_net: 100.0,
            effort_hours: 0.0,
        }];
        assert!(rank_by_evh(&leads).is_err());
    }
}
