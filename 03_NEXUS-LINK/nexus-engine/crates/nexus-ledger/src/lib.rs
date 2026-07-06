//! # nexus-ledger
//!
//! A thin (v1) **immutable double-entry ledger** for the Nexus Link acquisition
//! engine. It sits beside the [`nexus_core`] domain layer and the [`nexus_store`]
//! backend, and does three things:
//!
//! 1. **Double-entry that cannot be unbalanced** — [`Account`], [`Posting`] (signed:
//!    debit `> 0`, credit `< 0`), and [`JournalEntry`] whose postings sum to exactly
//!    [`Decimal::ZERO`](rust_decimal::Decimal) *at construction*. An unbalanced or
//!    mixed-currency set is a typed [`LedgerError`], never a value. Corrections are
//!    [`JournalEntry::contra_entry`] reversals — **never edits**.
//! 2. **Outcome recording that feeds the honesty loop** — [`record_outcome`] turns an
//!    operator [`Disposition`] (accepted / dupe / n-a / paid) into an append-only
//!    [`OutcomeRecord`](nexus_core::OutcomeRecord), with the bettable `predicted_p`
//!    read from the lead's [`ScoreRecord::p_conv`](nexus_core::ScoreRecord) — never
//!    re-invented here, so [`brier_score`](nexus_score::scoring::brier_score) grades the
//!    real prediction.
//! 3. **Settlement gated by the hard veto** — [`mark_paid`] routes through
//!    [`Veto::gate_transition`](nexus_core::Veto). An **unvalued crypto receipt** is a
//!    protected-path violation → non-offsettable hard veto: you cannot mark paid
//!    without a receipt-timestamp valuation. Crypto is valued at the receipt timestamp,
//!    keeping raw amount + valued cents + rate.
//!
//! ## Money & boundaries (LOCKED, inherited from the workspace)
//!
//! Amounts are exact [`Money`](nexus_core::Money) (decimal + currency) in memory and
//! integer cents on disk; this crate never reaches for `f64`. Everything is synchronous
//! — no tokio. Settlement is **CSV / manual import only**: there is no live banking and
//! no chain query in this crate. Full ingest/persistence adapters are M6.
//!
//! Library paths are panic-free: the workspace denies `unwrap`/`expect`/`panic` and
//! every fallible operation returns [`LedgerError`].

#![forbid(unsafe_code)]
#![warn(missing_docs)]
// Library paths stay strict (workspace denies unwrap/expect/panic). In test code,
// `.unwrap()` is the idiomatic assertion — a panic there *is* the failure — so scope
// the allow to test builds only.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used, clippy::panic))]

mod entry;
mod error;
mod outcome;
mod receipt;
mod settle;

pub use entry::{Account, JournalEntry, Posting};
pub use error::{LedgerError, LedgerResult};
pub use outcome::{record_outcome, Disposition};
pub use receipt::{CryptoReceipt, CryptoValuation};
pub use settle::{mark_paid, PaidResult, Settlement};

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use time::OffsetDateTime;
    use uuid::Uuid;

    use nexus_core::{
        CampaignSnapshot, DefaultVeto, LeadId, Money, OutcomeLedger, ScoreRecord, Store,
        TenantId, UWeights,
    };
    use nexus_store::SqliteStore;

    fn tenant() -> TenantId {
        TenantId::new(Uuid::from_u128(0xFEED_0000_0000_0000_0000_0000_0000_0001))
    }

    fn acct(tag: u128) -> Uuid {
        Uuid::from_u128(tag)
    }

    // --- JournalEntry: balancing invariant -------------------------------------------

    #[test]
    fn journal_entry_balanced_sums_to_zero() {
        // Debit 250.00 cash, credit 250.00 revenue → Σ == 0 exactly.
        let cash = acct(0x0A);
        let rev = acct(0x0B);
        let entry = JournalEntry::try_new(
            Uuid::from_u128(1),
            "bounty payout",
            vec![
                Posting::debit(cash, Decimal::new(25_000, 2), "EUR"),
                Posting::credit(rev, Decimal::new(25_000, 2), "EUR"),
            ],
        )
        .unwrap();

        // The invariant, re-asserted from the public surface.
        assert_eq!(entry.balance(), Decimal::ZERO);
        let sum: Decimal = entry
            .postings()
            .iter()
            .map(|p| p.amount.amount)
            .sum();
        assert_eq!(sum, Decimal::ZERO);
        assert_eq!(entry.currency(), "EUR");
        assert!(entry.corrects().is_none());
    }

    #[test]
    fn journal_entry_rejects_non_zero_sum() {
        // 250.00 debit vs only 200.00 credit → residual 50.00, rejected at construction.
        let err = JournalEntry::try_new(
            Uuid::from_u128(2),
            "lopsided",
            vec![
                Posting::debit(acct(0x1), Decimal::new(25_000, 2), "EUR"),
                Posting::credit(acct(0x2), Decimal::new(20_000, 2), "EUR"),
            ],
        )
        .unwrap_err();

        match err {
            LedgerError::Unbalanced { residual } => {
                // 250.00 - 200.00 = 50.00, exact.
                assert_eq!(residual, Decimal::new(5_000, 2));
            }
            other => panic!("expected Unbalanced, got {other:?}"),
        }
    }

    #[test]
    fn journal_entry_rejects_mixed_currency() {
        let err = JournalEntry::try_new(
            Uuid::from_u128(3),
            "fx smuggling",
            vec![
                Posting::debit(acct(0x1), Decimal::new(10_000, 2), "EUR"),
                Posting::credit(acct(0x2), Decimal::new(10_000, 2), "USD"),
            ],
        )
        .unwrap_err();
        assert!(matches!(err, LedgerError::MixedCurrency { .. }));
    }

    #[test]
    fn journal_entry_rejects_empty() {
        let err = JournalEntry::try_new(Uuid::from_u128(4), "nothing", vec![]).unwrap_err();
        assert!(matches!(err, LedgerError::EmptyEntry));
    }

    #[test]
    fn contra_entry_reverses_and_stays_balanced() {
        let cash = acct(0x0A);
        let rev = acct(0x0B);
        let original = JournalEntry::try_new(
            Uuid::from_u128(10),
            "payout",
            vec![
                Posting::debit(cash, Decimal::new(25_000, 2), "EUR"),
                Posting::credit(rev, Decimal::new(25_000, 2), "EUR"),
            ],
        )
        .unwrap();

        let contra = original
            .contra_entry(Uuid::from_u128(11), "reverse payout")
            .unwrap();

        // A correction is a new balanced entry linked to the original — never an edit.
        assert_eq!(contra.balance(), Decimal::ZERO);
        assert_eq!(contra.corrects(), Some(original.id()));
        // Each posting's sign is flipped vs the original.
        for (o, c) in original.postings().iter().zip(contra.postings().iter()) {
            assert_eq!(c.amount.amount, -o.amount.amount);
            assert_eq!(c.account_id, o.account_id);
        }
        // The original is untouched (immutability): still its own balanced entry.
        assert_eq!(original.balance(), Decimal::ZERO);
    }

    // --- Outcome recording: predicted_p comes from ScoreRecord.p_conv ----------------
    //
    // `record_outcome` reads the score and appends the outcome through one store handle
    // (`Store + OutcomeLedger`), because calibration joins score↔outcome inside the same
    // backend. `SqliteStore` is both. The load-bearing assertion: the recorded
    // `predicted_p` is the stored `p_conv`, verbatim — the recorder never invents it.

    #[test]
    fn record_outcome_reads_predicted_p_from_score() {
        let t = tenant();
        let lead = LeadId::new(Uuid::from_u128(0x100));

        let mut store = SqliteStore::open_in_memory().unwrap();
        store
            .put_score(
                t,
                &ScoreRecord {
                    tenant_id: t,
                    lead_id: lead,
                    is_prior: true,
                    p_conv: 0.73,
                    evh: 42.0,
                    scored_at: OffsetDateTime::UNIX_EPOCH,
                },
            )
            .unwrap();

        // Accepted → converted == true; predicted_p must equal the stored p_conv (0.73),
        // not anything chosen by the recorder.
        let out = record_outcome(
            &mut store,
            t,
            lead,
            &Disposition::Accepted,
            OffsetDateTime::UNIX_EPOCH,
        )
        .unwrap();

        assert!((out.predicted_p - 0.73).abs() < 1e-12);
        assert!(out.converted);

        // It actually landed in the append-only ledger: calibration joins the seeded
        // score (0.73) to the observed conversion (1.0) into exactly one pair.
        let pairs = ledger_pairs(&store, t);
        assert_eq!(pairs.len(), 1);
        assert!((pairs[0].0 - 0.73).abs() < 1e-12);
        assert!((pairs[0].1 - 1.0).abs() < 1e-12);
    }

    fn ledger_pairs(store: &SqliteStore, t: TenantId) -> Vec<(f64, f64)> {
        store.calibration_pairs(t).unwrap()
    }

    #[test]
    fn disposition_conversion_mapping() {
        assert!(Disposition::Accepted.converted());
        assert!(Disposition::Paid {
            amount: Money::from_cents(10_000, "EUR")
        }
        .converted());
        assert!(!Disposition::Dupe.converted());
        assert!(!Disposition::NotApplicable.converted());
    }

    // --- mark_paid: unvalued crypto receipt -> hard veto -----------------------------

    fn snapshot(t: TenantId, violations: u32) -> CampaignSnapshot {
        CampaignSnapshot {
            tenant_id: t,
            entropy: 1.0,
            kl_drift: 0.2,
            miscalibration: 0.1,
            information_gain: 1.0,
            staleness: 0.1,
            verified_evidence: 3.0,
            protected_path_violations: violations,
        }
    }

    #[test]
    fn mark_paid_unvalued_crypto_is_hard_vetoed() {
        let t = tenant();
        let before = snapshot(t, 0);
        let receipt = CryptoReceipt::new(
            Uuid::from_u128(0xC0FFEE),
            "ETH",
            Decimal::new(5, 1), // 0.5 ETH raw, no valuation
            OffsetDateTime::UNIX_EPOCH,
        );
        assert!(!receipt.is_valued());

        let err = mark_paid(
            &DefaultVeto,
            &before,
            &Settlement::Crypto { receipt },
            &UWeights::default(),
            0.0,
            Uuid::from_u128(0xE1),
            acct(0xA),
            acct(0xB),
            "crypto bounty (unvalued)",
        )
        .unwrap_err();

        match err {
            LedgerError::UnvaluedCryptoReceipt { receipt_id } => {
                assert_eq!(receipt_id, Uuid::from_u128(0xC0FFEE));
            }
            other => panic!("expected UnvaluedCryptoReceipt hard veto, got {other:?}"),
        }
    }

    #[test]
    fn mark_paid_valued_crypto_accepts_and_balances() {
        let t = tenant();
        let before = snapshot(t, 0);
        // 0.5 ETH valued at 2000 EUR/ETH at receipt time → 1000.00 EUR posted.
        let receipt = CryptoReceipt::new(
            Uuid::from_u128(0xC0FFEE),
            "ETH",
            Decimal::new(5, 1),
            OffsetDateTime::UNIX_EPOCH,
        )
        .valued_at_receipt(Decimal::from(2000), "EUR");

        // Valuation retained raw amount + rate + valued money, priced at receipt time.
        let val = receipt.valuation.as_ref().unwrap();
        assert_eq!(val.value.amount, Decimal::from(1000));
        assert_eq!(val.rate, Decimal::from(2000));
        assert_eq!(val.valued_at, OffsetDateTime::UNIX_EPOCH);

        let res = mark_paid(
            &DefaultVeto,
            &before,
            &Settlement::Crypto { receipt },
            &UWeights::default(),
            0.0,
            Uuid::from_u128(0xE2),
            acct(0xA),
            acct(0xB),
            "crypto bounty (valued @ receipt)",
        )
        .unwrap();

        assert!(res.gate.accept && !res.gate.hard_veto);
        // The produced entry is balanced and in the valued currency.
        assert_eq!(res.entry.balance(), Decimal::ZERO);
        assert_eq!(res.entry.currency(), "EUR");
        // Debit cash 1000, credit revenue 1000.
        let debit = res
            .entry
            .postings()
            .iter()
            .find(|p| p.amount.amount > Decimal::ZERO)
            .unwrap();
        assert_eq!(debit.amount.amount, Decimal::from(1000));
        assert_eq!(debit.account_id, acct(0xA));
    }

    #[test]
    fn unvalued_crypto_veto_is_non_offsettable_by_good_evidence() {
        // Adversarial: pile on "good" evidence (huge information gain, max verified
        // evidence, zero drift) so ΔU looks great — the unvalued-crypto violation must
        // STILL hard-veto. The block keys on the protected-path delta, not ΔU.
        let t = tenant();
        let mut before = snapshot(t, 0);
        before.information_gain = 0.0;
        before.verified_evidence = 0.0;
        let receipt = CryptoReceipt::new(
            Uuid::from_u128(0xBAD),
            "ETH",
            Decimal::from(10),
            OffsetDateTime::UNIX_EPOCH,
        );
        let err = mark_paid(
            &DefaultVeto,
            &before,
            &Settlement::Crypto { receipt },
            &UWeights::default(),
            // A wildly permissive threshold cannot buy back a protected-path veto.
            -1_000.0,
            Uuid::from_u128(0xE9),
            acct(0xA),
            acct(0xB),
            "unvalued crypto, drowning in good evidence",
        )
        .unwrap_err();
        assert!(matches!(err, LedgerError::UnvaluedCryptoReceipt { .. }));
    }

    #[test]
    fn valued_crypto_passes_even_with_a_nonzero_violation_baseline() {
        // The gate keys on the *delta*: a valued receipt adds NO new violation, so even
        // a campaign that already carries violations settles fine. Proves we are not
        // gating on the absolute count.
        let t = tenant();
        let before = snapshot(t, 3); // already has 3 prior violations
        let receipt = CryptoReceipt::new(
            Uuid::from_u128(0xC0DE),
            "ETH",
            Decimal::new(5, 1),
            OffsetDateTime::UNIX_EPOCH,
        )
        .valued_at_receipt(Decimal::from(2000), "EUR");
        let res = mark_paid(
            &DefaultVeto,
            &before,
            &Settlement::Crypto { receipt },
            &UWeights::default(),
            0.0,
            Uuid::from_u128(0xEA),
            acct(0xA),
            acct(0xB),
            "valued crypto over a dirty baseline",
        )
        .unwrap();
        assert!(res.gate.accept && !res.gate.hard_veto);
        assert_eq!(res.entry.balance(), Decimal::ZERO);
    }

    #[test]
    fn mark_paid_plain_fiat_accepts() {
        let t = tenant();
        let before = snapshot(t, 0);
        let res = mark_paid(
            &DefaultVeto,
            &before,
            &Settlement::Fiat {
                amount: Money::from_cents(50_000, "EUR"), // 500.00
            },
            &UWeights::default(),
            0.0,
            Uuid::from_u128(0xE3),
            acct(0xA),
            acct(0xB),
            "fiat bounty",
        )
        .unwrap();
        assert!(res.gate.accept && !res.gate.hard_veto);
        assert_eq!(res.entry.balance(), Decimal::ZERO);
    }
}
