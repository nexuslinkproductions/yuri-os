// Integration tests are their own crate, outside the lib's `#![cfg_attr(test, ...)]`
// allow. `.unwrap()` / `.expect()` are the idiomatic assertion in test code (a panic
// there *is* the failure), so scope the workspace's deny away for this test crate only.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Offline, fixture-backed end-to-end tests for the ledger surface.
//!
//! Every test loads `tests/fixtures/bounty_payouts.json` — a SMALL set of real,
//! publicly disclosed bounty payout figures captured verbatim (synthetic lead ids, no
//! PII). **No network.** It drives the real flow per row:
//!
//! - read the prediction (`predicted_p`) the way `record_outcome` reads it off a
//!   `ScoreRecord` (seeded into a store), append the `OutcomeRecord`, and confirm the
//!   append-only calibration view sees the prediction verbatim;
//! - settle `paid` rows through `mark_paid` and assert the produced journal entry
//!   balances to exactly zero;
//! - confirm the **unvalued crypto** row is hard-vetoed and never produces an entry.

use rust_decimal::Decimal;
use serde::Deserialize;
use time::OffsetDateTime;
use uuid::Uuid;

use nexus_core::{
    CampaignSnapshot, DefaultVeto, LeadId, Money, OutcomeLedger, ScoreRecord, Store, TenantId,
    UWeights,
};
use nexus_ledger::{
    mark_paid, record_outcome, CryptoReceipt, Disposition, JournalEntry, LedgerError, Settlement,
};
use nexus_store::SqliteStore;

const FIXTURE: &str = include_str!("fixtures/bounty_payouts.json");

#[derive(Debug, Deserialize)]
struct Fixture {
    payouts: Vec<Payout>,
}

#[derive(Debug, Deserialize)]
struct Payout {
    lead: Uuid,
    #[allow(dead_code)]
    program: String,
    predicted_p: f64,
    disposition: String,
    #[serde(default)]
    amount_cents: i64,
    currency: String,
    kind: String,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    raw_amount: Option<Decimal>,
    #[serde(default)]
    rate_fiat_per_token: Option<Decimal>,
}

fn tenant() -> TenantId {
    TenantId::new(Uuid::from_u128(0x0BB1_0000_0000_0000_0000_0000_0000_0001))
}

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

fn load() -> Fixture {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

#[test]
fn outcomes_record_with_predictions_from_score_records() {
    let fx = load();
    let t = tenant();

    // One store is both Store (prediction source) and OutcomeLedger (append target):
    // calibration joins score↔outcome inside it, so they must share the backend.
    let mut store = SqliteStore::open_in_memory().unwrap();

    // Seed each row's prediction as a ScoreRecord.
    for p in &fx.payouts {
        let lead = LeadId::new(p.lead);
        store
            .put_score(
                t,
                &ScoreRecord {
                    tenant_id: t,
                    lead_id: lead,
                    is_prior: true,
                    p_conv: p.predicted_p,
                    evh: 0.0,
                    scored_at: OffsetDateTime::UNIX_EPOCH,
                },
            )
            .unwrap();
    }

    // Append every outcome through the recorder.
    for p in &fx.payouts {
        let lead = LeadId::new(p.lead);
        let disposition = match p.disposition.as_str() {
            "paid" => Disposition::Paid {
                amount: Money::from_cents(p.amount_cents.max(0), p.currency.clone()),
            },
            "accepted" => Disposition::Accepted,
            "dupe" => Disposition::Dupe,
            _ => Disposition::NotApplicable,
        };
        let rec = record_outcome(
            &mut store,
            t,
            lead,
            &disposition,
            OffsetDateTime::UNIX_EPOCH,
        )
        .unwrap();
        // The recorded prediction is the one the score carried, verbatim.
        assert!((rec.predicted_p - p.predicted_p).abs() < 1e-12, "lead {lead}");
    }

    // The append-only calibration view sees one pair per fixture row, each carrying the
    // fixture's prediction — proof the honesty loop graded the real predictions.
    let pairs = store.calibration_pairs(t).unwrap();
    assert_eq!(pairs.len(), fx.payouts.len());
    for p in &fx.payouts {
        assert!(
            pairs.iter().any(|(pred, _)| (pred - p.predicted_p).abs() < 1e-12),
            "missing calibration pair for predicted_p={}",
            p.predicted_p
        );
    }
}

#[test]
fn paid_rows_settle_into_balanced_entries_and_unvalued_crypto_is_vetoed() {
    let fx = load();
    let t = tenant();
    let before = snapshot(t, 0);
    let mut entry_seq: u128 = 0;
    let mut balanced_entries: Vec<JournalEntry> = Vec::new();
    let mut vetoed = 0usize;

    for p in &fx.payouts {
        if p.disposition != "paid" {
            continue;
        }
        entry_seq += 1;

        let settlement = match p.kind.as_str() {
            "fiat" => Settlement::Fiat {
                amount: Money::from_cents(p.amount_cents, p.currency.clone()),
            },
            "crypto_valued" => {
                let receipt = CryptoReceipt::new(
                    Uuid::from_u128(0x0CEA_0000 + entry_seq),
                    p.token.clone().unwrap_or_default(),
                    p.raw_amount.unwrap_or(Decimal::ZERO),
                    OffsetDateTime::UNIX_EPOCH,
                )
                .valued_at_receipt(
                    p.rate_fiat_per_token.unwrap_or(Decimal::ZERO),
                    p.currency.clone(),
                );
                Settlement::Crypto { receipt }
            }
            // crypto_unvalued: no rate attached → the blocked case.
            _ => {
                let receipt = CryptoReceipt::new(
                    Uuid::from_u128(0x0CEA_0000 + entry_seq),
                    p.token.clone().unwrap_or_default(),
                    p.raw_amount.unwrap_or(Decimal::ZERO),
                    OffsetDateTime::UNIX_EPOCH,
                );
                Settlement::Crypto { receipt }
            }
        };

        let result = mark_paid(
            &DefaultVeto,
            &before,
            &settlement,
            &UWeights::default(),
            0.0,
            Uuid::from_u128(0x0E00_0000 + entry_seq),
            Uuid::from_u128(0xA), // cash
            Uuid::from_u128(0xB), // revenue
            format!("payout {}", p.lead),
        );

        if p.kind == "crypto_unvalued" {
            // The hard veto must fire: no entry, typed error.
            match result {
                Err(LedgerError::UnvaluedCryptoReceipt { .. }) => vetoed += 1,
                other => panic!("expected hard veto for unvalued crypto, got {other:?}"),
            }
        } else {
            let res = result.unwrap();
            assert!(res.gate.accept && !res.gate.hard_veto);
            assert_eq!(
                res.entry.balance(),
                Decimal::ZERO,
                "settlement entry must balance to exactly zero"
            );
            balanced_entries.push(res.entry);
        }
    }

    // Fixture has exactly one unvalued-crypto row (vetoed) and two settleable paid rows.
    assert_eq!(vetoed, 1, "exactly one unvalued crypto receipt is hard-vetoed");
    assert_eq!(balanced_entries.len(), 2, "two paid rows settle into entries");
    for e in &balanced_entries {
        // SUM(postings) == 0, re-asserted on the committed-fixture-derived entries.
        let sum: Decimal = e.postings().iter().map(|p| p.amount.amount).sum();
        assert_eq!(sum, Decimal::ZERO);
    }
}
