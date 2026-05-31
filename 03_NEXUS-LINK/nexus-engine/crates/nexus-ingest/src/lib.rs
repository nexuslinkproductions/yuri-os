//! # nexus-ingest
//!
//! Bug-bounty program ingestion for the Nexus Link acquisition engine. It pulls public
//! bounty data from four feeds, deduplicates it across feeds, **vetoes out-of-scope /
//! ineligible / ToS-restricted assets before they can ever become pursue-targets**, and
//! normalizes the survivors into tenant-scoped [`nexus_core`] records ready to score
//! and rank.
//!
//! ## Pipeline
//!
//! ```text
//!   feeds (parse, offline-testable)
//!     │   HackerOne · ProjectDiscovery chaos · disclose/diodb · Immunefi-IBB
//!     ▼
//!   dedup_programs            collapse (program, asset) across feeds
//!     ▼
//!   VETO-FIRST gate           every ineligible asset → Veto::gate_transition →
//!     │                       hard_veto drops it (it NEVER becomes an ev::Lead)
//!     ▼
//!   normalize_asset           admitted in-scope asset → LeadRecord + prior ScoreRecord
//!     ▼
//!   rank_by_evh (kernel)      the survivors become a ranked pursue-queue
//! ```
//!
//! The veto runs **before** ranking, on purpose: the kernel's non-offsettable
//! protected-path hard veto is the only thing that can refuse a *cheap-but-toxic* asset
//! that EV alone would happily rank. See [`veto`].
//!
//! ## Network honesty
//!
//! The only networked code is [`feed::Feed::fetch`] / [`Aggregator::ingest_live`],
//! which GET line-capped raw CDN endpoints. Every unit test runs against the committed
//! fixtures under `tests/fixtures/` — there is **no** network dependency in the test
//! suite.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
// Library paths stay strict (workspace denies unwrap/expect/panic); tests may use
// `.unwrap()` as the idiomatic assertion.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

mod dedup;
mod error;
mod feed;
mod model;
mod normalize;
mod veto;

pub use dedup::dedup_programs;
pub use error::{IngestError, IngestResult};
pub use feed::{
    program_key, ChaosFeed, DiodbFeed, Feed, HackerOneFeed, ImmunefiFeed, MAX_FEED_BYTES,
};
pub use model::{
    normalize_identifier, AssetType, BountyAsset, BountyProgram, Eligibility, SeverityTier,
};
pub use normalize::{asset_base_effort, normalize_asset};
pub use veto::{gate_asset, AssetGate};

use time::OffsetDateTime;

use nexus_core::{
    CoreResult, DefaultRankable, DefaultVeto, LeadRecord, Rankable, ScoreRecord, TenantId,
    UWeights, Veto,
};
use nexus_score::ev::ScoredLead;

/// One normalized, admitted lead: the [`LeadRecord`] and its prior [`ScoreRecord`].
#[derive(Debug, Clone, PartialEq)]
pub struct IngestedLead {
    /// The tenant-scoped lead record (ready for `Store::put_lead`).
    pub lead: LeadRecord,
    /// Its prior score (`is_prior: true`, ready for `Store::put_score`).
    pub score: ScoreRecord,
}

/// The aggregator: holds a set of feeds and drives the full ingest pipeline.
///
/// Generic over the [`Veto`] implementation so a caller can inject a policy override;
/// [`Aggregator::default`] uses the [`DefaultVeto`] real port.
pub struct Aggregator<V: Veto = DefaultVeto> {
    feeds: Vec<Box<dyn Feed>>,
    veto: V,
    weights: UWeights,
}

impl Default for Aggregator<DefaultVeto> {
    /// All four feeds, the real [`DefaultVeto`], default kernel weights.
    fn default() -> Self {
        Aggregator {
            feeds: vec![
                Box::new(HackerOneFeed),
                Box::new(ChaosFeed),
                Box::new(DiodbFeed),
                Box::new(ImmunefiFeed),
            ],
            veto: DefaultVeto,
            weights: UWeights::default(),
        }
    }
}

impl<V: Veto> Aggregator<V> {
    /// Builds an aggregator from explicit feeds + veto + weights (used by tests to wire
    /// fixture-backed feeds and to inject a specific veto policy).
    #[must_use]
    pub fn new(feeds: Vec<Box<dyn Feed>>, veto: V, weights: UWeights) -> Self {
        Aggregator {
            feeds,
            veto,
            weights,
        }
    }

    /// Runs the full offline pipeline from a set of **already-parsed** programs (the
    /// concatenation of every feed's `parse` output): dedup → VETO-FIRST → normalize.
    ///
    /// This is the testable core: it takes parsed programs (so a test feeds fixtures)
    /// and returns only the assets that survived the veto, normalized into leads.
    ///
    /// # Errors
    /// Propagates [`CoreError`](nexus_core::CoreError) from the veto port.
    pub fn pipeline(
        &self,
        tenant: TenantId,
        programs: Vec<BountyProgram>,
        captured_at: OffsetDateTime,
    ) -> CoreResult<Vec<IngestedLead>> {
        let deduped = dedup_programs(programs);
        let mut out = Vec::new();

        for program in &deduped {
            // First pass: gate every asset and collect the admitted ones. The gate is
            // the ONLY path to admission — a vetoed asset is dropped here and never
            // reaches normalize_asset, so it can never become an ev::Lead.
            let mut admitted: Vec<&BountyAsset> = Vec::new();
            for asset in &program.assets {
                let gate = gate_asset(&self.veto, tenant, program, asset, &self.weights)?;
                if gate.admitted {
                    admitted.push(asset);
                }
            }
            // Scope cardinality = number of admitted assets, used for effort scaling.
            let cardinality = admitted.len();
            for asset in admitted {
                let (lead, score) =
                    normalize_asset(tenant, program, asset, cardinality, captured_at);
                out.push(IngestedLead { lead, score });
            }
        }

        Ok(out)
    }

    /// Ranks the ingested leads by EVH through the kernel, returning the pursue-queue.
    ///
    /// This proves the in-scope path end to end: an admitted asset becomes a ranked
    /// [`ScoredLead`]. Uses [`DefaultRankable`] (pure kernel translation).
    ///
    /// # Errors
    /// - Propagates veto/normalize errors from [`Aggregator::pipeline`].
    /// - Propagates kernel ranking errors (bad probability / value / effort).
    pub fn rank_ingested(
        &self,
        tenant: TenantId,
        programs: Vec<BountyProgram>,
        captured_at: OffsetDateTime,
    ) -> CoreResult<Vec<ScoredLead<nexus_core::LeadId>>> {
        let ingested = self.pipeline(tenant, programs, captured_at)?;
        let ranker = DefaultRankable;
        let kernel_leads = ingested
            .iter()
            .map(|il| ranker.to_kernel_lead(&il.lead, &il.score))
            .collect::<CoreResult<Vec<_>>>()?;
        ranker.rank(&kernel_leads)
    }

    /// Live pull: fetch every feed over HTTP (line-capped), concatenate, run the
    /// pipeline. The only networked entry point; never exercised by the test suite.
    ///
    /// # Errors
    /// - [`IngestError`] (lifted to [`CoreError`](nexus_core::CoreError)) on any feed's
    ///   transport or parse failure.
    /// - Veto-port errors from the pipeline.
    pub fn ingest_live(
        &self,
        tenant: TenantId,
        client: &reqwest::blocking::Client,
        captured_at: OffsetDateTime,
    ) -> CoreResult<Vec<IngestedLead>> {
        let mut all = Vec::new();
        for feed in &self.feeds {
            let mut programs = feed.fetch(client)?;
            all.append(&mut programs);
        }
        self.pipeline(tenant, all, captured_at)
    }
}

/// Implements the core [`Ingestor`](nexus_core::Ingestor) port over a live pull.
///
/// The port returns bare [`LeadRecord`]s (its contract); the prior scores produced
/// alongside are available through [`Aggregator::pipeline`] / [`Aggregator::ingest_live`]
/// when the caller wants both. A fresh blocking client is built per call so the port
/// stays sync and self-contained.
impl<V: Veto> nexus_core::Ingestor for Aggregator<V> {
    fn ingest(&mut self, tenant: TenantId) -> CoreResult<Vec<LeadRecord>> {
        let client = reqwest::blocking::Client::builder()
            .build()
            .map_err(|e| nexus_core::CoreError::Store(format!("http client build: {e}")))?;
        let captured_at = OffsetDateTime::now_utc();
        let ingested = self.ingest_live(tenant, &client, captured_at)?;
        Ok(ingested.into_iter().map(|il| il.lead).collect())
    }
}
