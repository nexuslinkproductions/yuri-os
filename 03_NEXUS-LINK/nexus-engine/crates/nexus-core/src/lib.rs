//! # nexus-core
//!
//! The tenant-scoped **domain + port layer** that sits above the `nexus-score`
//! math kernel. The kernel is `f64`-native and tenant-agnostic; `nexus-core` adds the
//! things a real system needs around it without touching the kernel:
//!
//! - **Money done right** — exact [`rust_decimal::Decimal`] in memory, integer cents +
//!   ISO-4217 currency on disk, and `f64` *only* ephemerally at the EV boundary
//!   through the single shared [`dec_to_f64`] helper (rejects non-finite, never
//!   panics).
//! - **Tenant isolation** — a [`TenantId`] on every record and as the first argument
//!   to every [`Store`] method; a record under the wrong tenant is a typed error, not
//!   a silent leak.
//! - **A legal stage machine** — [`StageId`] with a checked [`StageId::advance`].
//! - **Ports, not implementations** — object-safe, synchronous [`Store`],
//!   [`Ingestor`], [`OutcomeLedger`] traits (Postgres lives behind an off-by-default
//!   feature in a sibling crate).
//! - **Two translation ports** — [`Rankable`] lifts domain records into the kernel's
//!   EV ranking; [`Veto`] lifts campaign snapshots into the kernel's salience gate,
//!   preserving the non-offsettable protected-path hard veto.
//!
//! Library paths are panic-free: the workspace denies `unwrap`/`expect`/`panic`, and
//! every fallible operation returns [`CoreError`].

#![forbid(unsafe_code)]
#![warn(missing_docs)]
// Library paths stay strict; `.unwrap()` is the idiomatic test assertion (a panic
// there *is* the failure), so scope the allow to test builds only.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

mod error;
mod money;
mod ports;
mod rankable;
mod records;
mod stage;
mod tenant;
mod veto;

pub use error::{CoreError, CoreResult};
pub use money::{dec_to_f64, Money};
pub use ports::{Ingestor, OutcomeLedger, Store};
pub use rankable::{DefaultRankable, Rankable};
pub use records::{
    AssetRecord, CampaignSnapshot, LeadId, LeadRecord, OutcomeRecord, PostingRecord, ProgramRecord,
    ScoreRecord, SendRecord,
};
pub use stage::StageId;
pub use tenant::TenantId;
pub use veto::{DefaultVeto, SerDominantTerm, SerGateDecision, Veto};

// Re-export the kernel weights type used by the `Veto` port so a caller can configure
// a gate without depending on `nexus-score` directly.
pub use nexus_score::salience::UWeights;

#[cfg(test)]
mod tests {
    use super::*;
    use nexus_score::salience::DominantTerm;
    use rust_decimal::Decimal;
    use time::OffsetDateTime;
    use uuid::Uuid;

    fn tenant() -> TenantId {
        TenantId::new(Uuid::from_u128(0x1111_2222_3333_4444_5555_6666_7777_8888))
    }

    fn lead(
        t: TenantId,
        id: LeadId,
        v_deal_major: i64,
        take_pct: i64,
        effort_hours: f64,
    ) -> LeadRecord {
        LeadRecord {
            tenant_id: t,
            id,
            reply_features: vec![1.0, 0.5],
            conv_features: vec![0.8],
            // v_deal in whole major units (e.g. 200 -> 200.00 EUR).
            v_deal: Money::new(Decimal::from(v_deal_major), "EUR"),
            // take as a fraction: take_pct/100.
            take: Decimal::new(take_pct, 2),
            effort_hours,
            stage: StageId::Score,
            captured_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    fn score(t: TenantId, lead_id: LeadId, p_conv: f64) -> ScoreRecord {
        ScoreRecord {
            tenant_id: t,
            lead_id,
            is_prior: true,
            p_conv,
            evh: 0.0,
            scored_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    // --- dec_to_f64 round-trip property test ---------------------------------------

    #[test]
    fn dec_to_f64_round_trips_representable_money() {
        // Property: for a spread of exact decimal money amounts, dec_to_f64 yields a
        // finite f64 whose value matches the decimal to f64 precision. We sweep a wide
        // grid of cents values (the persisted unit) reconstructed via from_cents.
        let mut checked = 0u32;
        for cents in [
            0i64,
            1,
            99,
            100,
            18_000,        // 180.00
            232_800,       // 2328.00
            -1,
            -250_000,
            1_234_567,
            9_999_999_999, // ~100M major units
        ] {
            let m = Money::from_cents(cents, "EUR");
            let f = dec_to_f64("test.money", m.amount).unwrap();
            assert!(f.is_finite());
            // Round-trip: f64 image must be within half a cent of cents/100.
            let expected = cents as f64 / 100.0;
            assert!(
                (f - expected).abs() < 5e-3,
                "cents={cents} f={f} expected={expected}"
            );
            checked += 1;
        }
        assert_eq!(checked, 10);
    }

    #[test]
    fn dec_to_f64_rejects_no_panic_path() {
        // The helper never panics; representable values always return Ok. (Decimal
        // cannot itself hold NaN/inf, so the non-finite branch is exercised by the
        // contract, not by a constructible Decimal — we assert the Ok path here and
        // the type system guarantees the rest.)
        assert!(dec_to_f64("x", Decimal::MAX).is_ok());
        assert!(dec_to_f64("x", Decimal::MIN).is_ok());
        assert!(dec_to_f64("x", Decimal::ZERO).is_ok());
    }

    #[test]
    fn money_cents_round_trip() {
        let m = Money::new(Decimal::new(18_000, 2), "EUR"); // 180.00
        let (cents, cur) = m.to_cents().unwrap();
        assert_eq!(cents, 18_000);
        assert_eq!(cur, "EUR");
        let back = Money::from_cents(cents, cur);
        assert_eq!(back.amount, m.amount);
    }

    // --- Rankable end-to-end EVH inversion (C > B > A) -----------------------------

    #[test]
    fn rankable_reproduces_kernel_evh_inversion_c_b_a() {
        // Reproduce the kernel's load-bearing inversion from DOMAIN records:
        //   A: P=0.51, V_deal=200 @10% take -> Vnet=180, c=1.5h -> EVH=61.2
        //   B: P=0.20, V_deal=2400 @3% take -> Vnet=2328, c=6h  -> EVH=77.6
        //   C: P=0.70, V_deal=120 @0% take  -> Vnet=120,  c=1.0h -> EVH=84.0
        // Naive "highest probability" picks C(0.70) then A(0.51); EV ranking inverts
        // it to C > B > A, with the 20%-prob retainer B beating the 51%-prob job A.
        let t = tenant();
        let id_a = LeadId::new(Uuid::from_u128(0xA));
        let id_b = LeadId::new(Uuid::from_u128(0xB));
        let id_c = LeadId::new(Uuid::from_u128(0xC));

        let lead_a = lead(t, id_a, 200, 10, 1.5);
        let lead_b = lead(t, id_b, 2400, 3, 6.0);
        let lead_c = lead(t, id_c, 120, 0, 1.0);

        let r = DefaultRankable;
        let k_a = r.to_kernel_lead(&lead_a, &score(t, id_a, 0.51)).unwrap();
        let k_b = r.to_kernel_lead(&lead_b, &score(t, id_b, 0.20)).unwrap();
        let k_c = r.to_kernel_lead(&lead_c, &score(t, id_c, 0.70)).unwrap();

        // Net values translated correctly through dec_to_f64.
        assert!((k_a.v_net - 180.0).abs() < 1e-9);
        assert!((k_b.v_net - 2328.0).abs() < 1e-9);
        assert!((k_c.v_net - 120.0).abs() < 1e-9);

        let ranked = r.rank(&[k_a, k_b, k_c]).unwrap();
        assert_eq!(ranked[0].id, id_c, "C must rank first");
        assert_eq!(ranked[1].id, id_b, "B (20% prob) must beat A (51% prob)");
        assert_eq!(ranked[2].id, id_a, "A is the naive-probability loser");

        assert!((ranked[0].evh - 84.0).abs() < 1e-2);
        assert!((ranked[1].evh - 77.6).abs() < 1e-2);
        assert!((ranked[2].evh - 61.2).abs() < 1e-2);
        // The inversion proper: B outranks A despite lower probability.
        assert!(ranked[1].evh > ranked[2].evh);
    }

    #[test]
    fn rankable_rejects_cross_tenant_lead_and_score() {
        let t1 = tenant();
        let t2 = TenantId::new_v4();
        let id = LeadId::new_v4();
        let r = DefaultRankable;
        let err = r
            .to_kernel_lead(&lead(t1, id, 200, 10, 1.5), &score(t2, id, 0.5))
            .unwrap_err();
        assert!(matches!(err, CoreError::TenantMismatch { .. }));
    }

    // --- Veto: protected-path hard veto survives translation -----------------------

    fn snapshot(t: TenantId, violations: u32) -> CampaignSnapshot {
        CampaignSnapshot {
            tenant_id: t,
            entropy: 1.0,
            kl_drift: 0.5,
            miscalibration: 0.1,
            information_gain: 0.0,
            staleness: 0.2,
            verified_evidence: 2.0,
            protected_path_violations: violations,
        }
    }

    #[test]
    fn veto_protected_path_hard_veto_survives_translation() {
        // before: 0 violations; after: 1 violation, AND a mountain of "good" evidence
        // that drives ΔU strongly negative. The non-offsettable veto must still fire
        // across the domain->kernel translation boundary.
        let t = tenant();
        let before = snapshot(t, 0);
        let mut after = snapshot(t, 1);
        after.verified_evidence = 1_000.0; // capped, but lots of "good"
        after.information_gain = 1_000.0;
        after.kl_drift = 0.0;

        let v = DefaultVeto;
        let decision = v
            .gate_transition(&before, &after, &UWeights::default(), 0.0)
            .unwrap();

        assert!(decision.hard_veto, "protected-path veto must survive translation");
        assert!(!decision.accept, "a vetoed transition is never accepted");
        assert!(decision.delta_u < 0.0, "ΔU looks 'good' yet the veto still blocks");
        assert_eq!(decision.dominant_term, DominantTerm::ProtectedPathViolation);
        assert!(decision.reason.contains("HARD VETO"));

        // The serde mirror carries the same verdict across a serialization boundary.
        let ser: SerGateDecision = decision.into();
        assert_eq!(ser.dominant_term, SerDominantTerm::ProtectedPathViolation);
        let json = serde_json::to_string(&ser).unwrap();
        let back: SerGateDecision = serde_json::from_str(&json).unwrap();
        assert!(back.hard_veto && !back.accept);
    }

    #[test]
    fn veto_healthy_transition_accepts_and_rejects_cross_tenant() {
        let t = tenant();
        let before = snapshot(t, 0);
        let after = CampaignSnapshot {
            kl_drift: 0.1,
            information_gain: 1.5,
            verified_evidence: 4.0,
            ..snapshot(t, 0)
        };
        let v = DefaultVeto;
        let ok = v
            .gate_transition(&before, &after, &UWeights::default(), 0.0)
            .unwrap();
        assert!(ok.accept && !ok.hard_veto);

        // Cross-tenant snapshots are a typed isolation error.
        let other = snapshot(TenantId::new_v4(), 0);
        let err = v
            .gate_transition(&before, &other, &UWeights::default(), 0.0)
            .unwrap_err();
        assert!(matches!(err, CoreError::TenantMismatch { .. }));
    }

    // --- StageId transition table --------------------------------------------------

    #[test]
    fn stage_transition_table() {
        assert!(StageId::Capture.advance(StageId::Score).is_ok());
        assert!(StageId::Followup.advance(StageId::Send).is_ok()); // re-touch loop
        assert!(StageId::Followup.advance(StageId::Close).is_ok());
        // Illegal jumps.
        assert!(matches!(
            StageId::Capture.advance(StageId::Send),
            Err(CoreError::IllegalTransition { .. })
        ));
        assert!(StageId::Close.advance(StageId::Send).is_err());
        assert!(StageId::Score.advance(StageId::Score).is_err()); // no self-loop
    }
}
