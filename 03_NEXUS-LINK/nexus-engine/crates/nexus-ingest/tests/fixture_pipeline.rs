// Integration tests are their own crate, outside the lib's `#![cfg_attr(test, ...)]`
// allow. `.unwrap()` / `.expect()` are the idiomatic assertion in test code (a panic
// there *is* the failure), so scope the workspace's deny away for this test crate only.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

//! Offline, fixture-backed end-to-end tests for the ingest pipeline.
//!
//! Every test here loads a SMALL committed fixture captured verbatim from the real
//! feeds (see `tests/fixtures/*.json`) and runs the pure pipeline. **No network.** The
//! fixtures contain, by construction:
//!
//! - `smtp2go` (HackerOne, `offers_bounties: true`): three in-scope **bounty-eligible**
//!   assets and one **out-of-scope** asset (`support.smtp2go.com`).
//! - `smtp2go` again (ProjectDiscovery chaos): the same `smtp2go.com` domain — the
//!   cross-feed duplicate the dedup pass must collapse.
//! - `mcgrawhill` (HackerOne, `offers_bounties: false`): a program-level VDP whose
//!   in-scope asset is *not* bounty-eligible.
//!
//! The load-bearing assertions: the in-scope asset becomes a ranked lead; the
//! out-of-scope asset is **hard-vetoed and absent** from the output; the cross-feed
//! duplicate collapses to one asset.

use time::OffsetDateTime;

use nexus_core::{DefaultVeto, Ingestor, TenantId, UWeights, Veto};
use nexus_ingest::{
    dedup_programs, normalize_identifier, Aggregator, BountyProgram, ChaosFeed, DiodbFeed,
    Eligibility, Feed, HackerOneFeed,
};
use uuid::Uuid;

const H1_FIXTURE: &[u8] = include_bytes!("fixtures/hackerone_sample.json");
const CHAOS_FIXTURE: &[u8] = include_bytes!("fixtures/chaos_sample.json");
const DIODB_FIXTURE: &[u8] = include_bytes!("fixtures/diodb_sample.json");

fn tenant() -> TenantId {
    TenantId::new(Uuid::from_u128(0xABCD_1234_5678_9ABC_DEF0_1122_3344_5566))
}

fn captured() -> OffsetDateTime {
    OffsetDateTime::UNIX_EPOCH
}

/// Parse all three fixtures into the normalized program model (offline).
fn parse_all() -> Vec<BountyProgram> {
    let mut all = Vec::new();
    all.extend(HackerOneFeed.parse(H1_FIXTURE).unwrap());
    all.extend(ChaosFeed.parse(CHAOS_FIXTURE).unwrap());
    all.extend(DiodbFeed.parse(DIODB_FIXTURE).unwrap());
    all
}

// --- Fixture parses & carries the expected eligibility flags ----------------------

#[test]
fn hackerone_fixture_parses_scope_flags() {
    let programs = HackerOneFeed.parse(H1_FIXTURE).unwrap();
    let smtp2go = programs.iter().find(|p| p.key == "smtp2go").unwrap();
    assert!(smtp2go.offers_bounty, "smtp2go pays bounties");

    // The out-of-scope asset is present in the parsed model, marked OutOfScope.
    let oos = smtp2go
        .assets
        .iter()
        .find(|a| a.identifier == "support.smtp2go.com")
        .expect("out-of-scope asset must be parsed (so it can be vetoed)");
    assert_eq!(oos.eligibility, Eligibility::OutOfScope);

    // The three in-scope assets are bounty-eligible.
    let eligible: Vec<_> = smtp2go
        .assets
        .iter()
        .filter(|a| a.eligibility == Eligibility::InScopeBountyEligible)
        .collect();
    assert_eq!(eligible.len(), 3, "three in-scope bounty-eligible assets");

    // mcgrawhill is a VDP: its in-scope asset is submission-only (program pays nothing).
    let mh = programs.iter().find(|p| p.key == "mcgrawhill").unwrap();
    assert!(!mh.offers_bounty);
    assert!(mh
        .assets
        .iter()
        .all(|a| a.eligibility != Eligibility::InScopeBountyEligible));
}

// --- 1. In-scope asset becomes a ranked Lead --------------------------------------

#[test]
fn in_scope_assets_become_ranked_leads() {
    let agg = Aggregator::default();
    let ranked = agg
        .rank_ingested(tenant(), parse_all(), captured())
        .unwrap();

    // Exactly the in-scope, bounty-eligible assets are ranked:
    //   smtp2go (HackerOne, pays): 3 eligible assets — its `smtp2go.com` collapses
    //                              with the chaos duplicate, so it is counted once.
    //   84codes (chaos, pays):     4 eligible domains.
    //   = 7 total.
    // Everything ineligible is vetoed out: smtp2go's `support.smtp2go.com`
    // (out-of-scope), 4chan (chaos, no-bounty, 2 domains), mcgrawhill (VDP,
    // submission-only), and the diodb program-only entries (no assets).
    assert_eq!(
        ranked.len(),
        7,
        "the three eligible smtp2go assets plus the four eligible 84codes domains"
    );

    // The queue is sorted by descending EVH and every EVH is finite & positive.
    for w in ranked.windows(2) {
        assert!(w[0].evh >= w[1].evh, "pursue-queue is descending EVH");
    }
    assert!(ranked.iter().all(|s| s.evh.is_finite() && s.evh > 0.0));
}

// --- 2. Out-of-scope asset is hard-vetoed and ABSENT ------------------------------

#[test]
fn out_of_scope_asset_is_hard_vetoed_and_absent() {
    let t = tenant();
    let agg = Aggregator::default();
    let deduped = dedup_programs(parse_all());
    let ingested = agg.pipeline(t, parse_all(), captured()).unwrap();

    // Independently gate EVERY asset across EVERY deduped program. The count of
    // admitted assets must equal the pipeline's output length exactly — i.e. the
    // pipeline emits a lead for each-and-only-each admitted asset, and every
    // ineligible asset (out-of-scope, submission-only, no-bounty) was dropped by a
    // hard veto before it could become an ev::Lead.
    let mut admitted = 0usize;
    let mut hard_vetoed = 0usize;
    let mut oos_seen = false;
    for program in &deduped {
        for asset in &program.assets {
            let gate =
                nexus_ingest::gate_asset(&DefaultVeto, t, program, asset, &UWeights::default())
                    .unwrap();
            if gate.admitted {
                admitted += 1;
                assert!(!gate.hard_veto);
            } else {
                hard_vetoed += 1;
                assert!(gate.hard_veto, "every dropped asset is dropped by a HARD veto");
            }
            if asset.identifier == "support.smtp2go.com" {
                oos_seen = true;
                assert!(
                    !gate.admitted && gate.hard_veto,
                    "the explicit out-of-scope asset is hard-vetoed"
                );
            }
        }
    }

    assert!(oos_seen, "fixture must contain the out-of-scope asset");
    assert_eq!(
        admitted,
        ingested.len(),
        "pipeline emits exactly the admitted assets, nothing vetoed leaks in"
    );
    assert!(hard_vetoed > 0, "some assets were genuinely vetoed");
}

// --- VETO-FIRST proof: the gate fires a hard_veto BEFORE any ranking ---------------

#[test]
fn veto_first_out_of_scope_asset_fires_hard_veto_before_ranking() {
    // Take the parsed-and-deduped smtp2go program and gate each asset directly through
    // the REAL nexus_core::Veto port, proving the out-of-scope asset is dropped by a
    // non-offsettable hard veto — not by an ad-hoc filter, and strictly before it could
    // be normalized into an ev::Lead.
    let deduped = dedup_programs(parse_all());
    let smtp2go = deduped.iter().find(|p| p.key == "smtp2go").unwrap();
    let oos = smtp2go
        .assets
        .iter()
        .find(|a| a.identifier == "support.smtp2go.com")
        .unwrap();
    assert_eq!(oos.eligibility, Eligibility::OutOfScope);

    let gate = nexus_ingest::gate_asset(
        &DefaultVeto,
        tenant(),
        smtp2go,
        oos,
        &UWeights::default(),
    )
    .unwrap();

    assert!(gate.hard_veto, "out-of-scope asset triggers a hard veto");
    assert!(!gate.admitted, "a hard-vetoed asset is never admitted");
    assert!(gate.reason.contains("HARD VETO"));

    // And an eligible asset from the same program passes the same gate.
    let eligible = smtp2go
        .assets
        .iter()
        .find(|a| a.eligibility == Eligibility::InScopeBountyEligible)
        .unwrap();
    let ok = nexus_ingest::gate_asset(
        &DefaultVeto,
        tenant(),
        smtp2go,
        eligible,
        &UWeights::default(),
    )
    .unwrap();
    assert!(ok.admitted && !ok.hard_veto, "eligible asset is admitted");
}

// --- 3. Dedup collapses the cross-feed duplicate ----------------------------------

#[test]
fn dedup_collapses_cross_feed_duplicate_asset() {
    // smtp2go.com appears in BOTH the HackerOne fixture (in-scope, eligible) and the
    // chaos fixture (domain list, program flagged no-bounty). After dedup there must be
    // exactly ONE smtp2go.com asset, and the authoritative eligible verdict must win
    // over chaos's coarse program-level "no bounty" inference.
    let raw = parse_all();

    // Before dedup: smtp2go.com exists in >= 2 feeds (count raw occurrences).
    let raw_smtp2go_dot_com = raw
        .iter()
        .filter(|p| p.key == "smtp2go")
        .flat_map(|p| p.assets.iter())
        .filter(|a| normalize_identifier(&a.identifier) == "smtp2go.com")
        .count();
    assert!(
        raw_smtp2go_dot_com >= 2,
        "the duplicate must exist pre-dedup (got {raw_smtp2go_dot_com})"
    );

    let deduped = dedup_programs(raw);
    let smtp2go = deduped.iter().find(|p| p.key == "smtp2go").unwrap();

    let collapsed = smtp2go
        .assets
        .iter()
        .filter(|a| normalize_identifier(&a.identifier) == "smtp2go.com")
        .collect::<Vec<_>>();
    assert_eq!(collapsed.len(), 1, "duplicate collapsed to a single asset");
    assert_eq!(
        collapsed[0].eligibility,
        Eligibility::InScopeBountyEligible,
        "authoritative per-asset eligibility wins over coarse chaos no-bounty flag"
    );

    // The collapsed program pays bounties (HackerOne authority ORed in).
    assert!(smtp2go.offers_bounty);
}

// --- 4. Determinism: same input → same ranked output ------------------------------

#[test]
fn pipeline_is_deterministic() {
    let agg = Aggregator::default();
    let a = agg
        .rank_ingested(tenant(), parse_all(), captured())
        .unwrap();
    let b = agg
        .rank_ingested(tenant(), parse_all(), captured())
        .unwrap();
    let ids_a: Vec<_> = a.iter().map(|s| s.id).collect();
    let ids_b: Vec<_> = b.iter().map(|s| s.id).collect();
    assert_eq!(ids_a, ids_b, "ranking order is stable across runs");
}

// --- 5. Tenant stamping: every ingested record carries the scoped tenant ----------

#[test]
fn every_ingested_record_is_tenant_stamped() {
    let t = tenant();
    let agg = Aggregator::default();
    let ingested = agg.pipeline(t, parse_all(), captured()).unwrap();
    assert!(!ingested.is_empty());
    for il in &ingested {
        assert_eq!(il.lead.tenant_id, t);
        assert_eq!(il.score.tenant_id, t);
        assert_eq!(il.lead.id, il.score.lead_id, "lead/score ids agree");
        assert!(il.score.is_prior, "ingested scores are priors");
        assert_eq!(il.score.evh, 0.0, "EVH is computed at rank time, not pre-baked");
        // Bounty payouts are net to the researcher: take is zero.
        assert_eq!(il.lead.take, rust_decimal::Decimal::ZERO);
        assert_eq!(il.lead.v_deal.currency, "USD");
    }
}

// --- Veto error propagation: cross-tenant snapshots are a typed error --------------

#[test]
fn gate_threads_veto_port_through_default_veto() {
    // Sanity that gate_asset uses the real port (DefaultVeto) and returns Ok for both
    // admit and veto paths — exercised above; here we just confirm the default
    // aggregator wires the same DefaultVeto Ingestor surface compiles & is callable.
    fn assert_ingestor<I: Ingestor>(_: &I) {}
    let agg = Aggregator::default();
    assert_ingestor(&agg);

    // And the DefaultVeto's tenant guard is real: gating across tenants is a typed
    // error, proving we didn't stub the port.
    let before = nexus_core::CampaignSnapshot {
        tenant_id: tenant(),
        entropy: 0.0,
        kl_drift: 0.0,
        miscalibration: 0.0,
        information_gain: 0.0,
        staleness: 0.0,
        verified_evidence: 0.0,
        protected_path_violations: 0,
    };
    let mut after = before;
    after.tenant_id = TenantId::new_v4();
    let err = DefaultVeto
        .gate_transition(&before, &after, &UWeights::default(), 0.0)
        .unwrap_err();
    assert!(matches!(err, nexus_core::CoreError::TenantMismatch { .. }));
}
