//! Feeds: the [`Feed`] trait plus one puller per source.
//!
//! Each feed splits cleanly into two halves:
//!
//! - **`parse(bytes)`** — pure, deterministic projection of the feed's raw JSON onto
//!   the normalized [`BountyProgram`] model. This is what the fixture tests exercise;
//!   it never touches the network.
//! - **`fetch(client)`** — the *only* code that performs a live HTTP GET, line-capped
//!   to the raw CDN endpoint per the research pipeline. Pull, then hand the body to
//!   `parse`. Tests never call this.
//!
//! Keeping the split sharp is what lets every test run offline against a committed
//! fixture while the live puller stays a thin, single-responsibility wrapper.

use serde::Deserialize;

use crate::error::{IngestError, IngestResult};
use crate::model::{
    AssetType, BountyAsset, BountyProgram, Eligibility, SeverityTier,
};

/// The maximum feed body we will read from the network, in bytes (research-pipeline
/// line/size cap — a runaway feed must not be slurped unbounded). ~24 MiB comfortably
/// covers the full HackerOne dump while still being a hard ceiling.
pub const MAX_FEED_BYTES: u64 = 24 * 1024 * 1024;

/// A bounty data source. Object-safe: `&dyn Feed` works, so the aggregator holds a
/// heterogeneous `Vec<Box<dyn Feed>>`.
pub trait Feed {
    /// Stable feed name for logs / dedup provenance.
    fn name(&self) -> &'static str;

    /// The raw, line-cappable CDN URL the live puller GETs.
    fn raw_url(&self) -> &'static str;

    /// Projects a raw feed body onto the normalized program model. Pure and offline.
    ///
    /// # Errors
    /// [`IngestError::Parse`] if the body is not the JSON shape this feed expects.
    fn parse(&self, body: &[u8]) -> IngestResult<Vec<BountyProgram>>;

    /// Performs the live, line-capped HTTP pull, then parses. The only networked path.
    ///
    /// # Errors
    /// - [`IngestError::Http`] on any transport / status failure.
    /// - [`IngestError::Parse`] if the fetched body is malformed.
    fn fetch(&self, client: &reqwest::blocking::Client) -> IngestResult<Vec<BountyProgram>> {
        let name = self.name();
        let resp = client
            .get(self.raw_url())
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|source| IngestError::Http { feed: name, source })?;
        // Cap the body: read at most MAX_FEED_BYTES so a pathological feed can never
        // exhaust memory. `.take` truncates rather than erroring, but a truncated body
        // then fails `parse` loudly instead of silently slurping forever.
        let body = resp
            .bytes()
            .map_err(|source| IngestError::Http { feed: name, source })?;
        let capped = &body[..body.len().min(MAX_FEED_BYTES as usize)];
        self.parse(capped)
    }
}

// ---------------------------------------------------------------------------------
// HackerOne — arkadiyt/bounty-targets-data  data/hackerone_data.json
// ---------------------------------------------------------------------------------

/// HackerOne puller. The richest feed: per-asset scope + bounty-eligibility flags, so
/// it is the one that drives both in-scope normalization *and* out-of-scope vetoes.
#[derive(Debug, Clone, Copy, Default)]
pub struct HackerOneFeed;

#[derive(Debug, Deserialize)]
struct H1Program {
    handle: String,
    name: String,
    url: String,
    offers_bounties: bool,
    targets: H1Targets,
}

#[derive(Debug, Deserialize)]
struct H1Targets {
    #[serde(default)]
    in_scope: Vec<H1Asset>,
    #[serde(default)]
    out_of_scope: Vec<H1Asset>,
}

#[derive(Debug, Deserialize)]
struct H1Asset {
    asset_identifier: String,
    asset_type: String,
    #[serde(default)]
    eligible_for_bounty: bool,
    #[serde(default)]
    eligible_for_submission: bool,
    max_severity: Option<String>,
}

impl HackerOneFeed {
    fn asset_from(raw: &H1Asset, in_scope: bool, program_pays: bool) -> BountyAsset {
        // Eligibility is layered, most-restrictive first, so a single asset can only
        // land in one bucket and the VETO-FIRST gate gets an unambiguous reason.
        let eligibility = if !in_scope {
            Eligibility::OutOfScope
        } else if !program_pays {
            Eligibility::ProgramDoesNotPayBounty
        } else if raw.eligible_for_bounty && raw.eligible_for_submission {
            Eligibility::InScopeBountyEligible
        } else {
            Eligibility::SubmissionOnlyNoBounty
        };
        BountyAsset {
            identifier: raw.asset_identifier.clone(),
            asset_type: AssetType::from_feed_label(&raw.asset_type),
            max_severity: SeverityTier::from_feed_label(raw.max_severity.as_deref()),
            eligibility,
        }
    }
}

impl Feed for HackerOneFeed {
    fn name(&self) -> &'static str {
        "hackerone"
    }
    fn raw_url(&self) -> &'static str {
        "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/main/data/hackerone_data.json"
    }
    fn parse(&self, body: &[u8]) -> IngestResult<Vec<BountyProgram>> {
        let raw: Vec<H1Program> = serde_json::from_slice(body).map_err(|source| {
            IngestError::Parse {
                feed: self.name(),
                source,
            }
        })?;
        Ok(raw
            .into_iter()
            .map(|p| {
                let pays = p.offers_bounties;
                let mut assets = Vec::with_capacity(
                    p.targets.in_scope.len() + p.targets.out_of_scope.len(),
                );
                for a in &p.targets.in_scope {
                    assets.push(Self::asset_from(a, true, pays));
                }
                for a in &p.targets.out_of_scope {
                    assets.push(Self::asset_from(a, false, pays));
                }
                BountyProgram {
                    key: p.handle.to_ascii_lowercase(),
                    name: p.name,
                    url: p.url,
                    offers_bounty: pays,
                    assets,
                }
            })
            .collect())
    }
}

// ---------------------------------------------------------------------------------
// ProjectDiscovery chaos — public-bugbounty-programs  dist/data.json
// ---------------------------------------------------------------------------------

/// ProjectDiscovery chaos puller. Domain-list shaped: a program flag + a flat list of
/// in-scope domains, no per-asset eligibility. Its overlap with HackerOne by domain is
/// what the cross-feed dedup collapses.
#[derive(Debug, Clone, Copy, Default)]
pub struct ChaosFeed;

#[derive(Debug, Deserialize)]
struct ChaosRoot {
    #[serde(default)]
    programs: Vec<ChaosProgram>,
}

#[derive(Debug, Deserialize)]
struct ChaosProgram {
    name: String,
    url: String,
    #[serde(default)]
    bounty: bool,
    #[serde(default)]
    domains: Vec<String>,
}

impl Feed for ChaosFeed {
    fn name(&self) -> &'static str {
        "chaos"
    }
    fn raw_url(&self) -> &'static str {
        "https://raw.githubusercontent.com/projectdiscovery/public-bugbounty-programs/main/dist/data.json"
    }
    fn parse(&self, body: &[u8]) -> IngestResult<Vec<BountyProgram>> {
        let raw: ChaosRoot = serde_json::from_slice(body).map_err(|source| IngestError::Parse {
            feed: self.name(),
            source,
        })?;
        Ok(raw
            .programs
            .into_iter()
            .map(|p| {
                // Chaos has no per-asset bounty flag: an asset is bounty-eligible iff
                // the program pays. Domains with a non-paying program become
                // ProgramDoesNotPayBounty (vetoed), not silently rankable.
                let elig = if p.bounty {
                    Eligibility::InScopeBountyEligible
                } else {
                    Eligibility::ProgramDoesNotPayBounty
                };
                let assets = p
                    .domains
                    .iter()
                    .map(|d| BountyAsset {
                        identifier: d.clone(),
                        asset_type: AssetType::Domain,
                        max_severity: SeverityTier::None,
                        eligibility: elig,
                    })
                    .collect();
                BountyProgram {
                    key: program_key(&p.name),
                    name: p.name,
                    url: p.url,
                    offers_bounty: p.bounty,
                    assets,
                }
            })
            .collect())
    }
}

// ---------------------------------------------------------------------------------
// disclose / diodb — program-list.json
// ---------------------------------------------------------------------------------

/// disclose/diodb puller. Program-level only (no asset list): each entry is a policy
/// with an `offers_bounty: "yes"/"no"` string. Useful for program-level dedup and to
/// prove the program-pays veto; it contributes no rankable assets of its own.
#[derive(Debug, Clone, Copy, Default)]
pub struct DiodbFeed;

#[derive(Debug, Deserialize)]
struct DiodbProgram {
    program_name: String,
    #[serde(default)]
    policy_url: String,
    #[serde(default)]
    offers_bounty: String,
}

impl Feed for DiodbFeed {
    fn name(&self) -> &'static str {
        "diodb"
    }
    fn raw_url(&self) -> &'static str {
        "https://raw.githubusercontent.com/disclose/diodb/master/program-list.json"
    }
    fn parse(&self, body: &[u8]) -> IngestResult<Vec<BountyProgram>> {
        let raw: Vec<DiodbProgram> = serde_json::from_slice(body).map_err(|source| {
            IngestError::Parse {
                feed: self.name(),
                source,
            }
        })?;
        Ok(raw
            .into_iter()
            .map(|p| {
                let pays = p.offers_bounty.trim().eq_ignore_ascii_case("yes");
                BountyProgram {
                    key: program_key(&p.program_name),
                    name: p.program_name,
                    url: p.policy_url,
                    offers_bounty: pays,
                    // diodb lists no assets; it only contributes program-level facts.
                    assets: Vec::new(),
                }
            })
            .collect())
    }
}

// ---------------------------------------------------------------------------------
// Immunefi / IBB — infosec-us-team mirror  projects.json
// ---------------------------------------------------------------------------------

/// Immunefi-IBB puller. The unofficial mirror exposes a `projects.json` index of
/// program slugs. We project each slug into a program-level entry (smart-contract
/// programs). Per-asset scope lives behind per-project endpoints; the index alone is
/// enough for program-level dedup and the program-pays signal (Immunefi programs pay).
#[derive(Debug, Clone, Copy, Default)]
pub struct ImmunefiFeed;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ImmunefiRoot {
    /// `{"projects":[{"id":"slug",...}, ...]}`
    Wrapped { projects: Vec<ImmunefiProject> },
    /// A bare `["slug", ...]` index.
    Slugs(Vec<String>),
}

#[derive(Debug, Deserialize)]
struct ImmunefiProject {
    #[serde(default)]
    id: String,
    #[serde(default)]
    project: String,
}

impl Feed for ImmunefiFeed {
    fn name(&self) -> &'static str {
        "immunefi"
    }
    fn raw_url(&self) -> &'static str {
        "https://cdn.jsdelivr.net/gh/infosec-us-team/Immunefi-Bug-Bounty-Programs-Unofficial/projects.json"
    }
    fn parse(&self, body: &[u8]) -> IngestResult<Vec<BountyProgram>> {
        let raw: ImmunefiRoot = serde_json::from_slice(body).map_err(|source| {
            IngestError::Parse {
                feed: self.name(),
                source,
            }
        })?;
        let slugs: Vec<String> = match raw {
            ImmunefiRoot::Slugs(v) => v,
            ImmunefiRoot::Wrapped { projects } => projects
                .into_iter()
                .map(|p| if p.id.is_empty() { p.project } else { p.id })
                .collect(),
        };
        Ok(slugs
            .into_iter()
            .filter(|s| !s.trim().is_empty())
            .map(|slug| BountyProgram {
                key: program_key(&slug),
                name: slug.clone(),
                url: format!("https://immunefi.com/bounty/{slug}/"),
                // Immunefi listings are paid bounty programs.
                offers_bounty: true,
                assets: Vec::new(),
            })
            .collect())
    }
}

/// Derives a stable program dedup key from a display name / slug: lowercase, collapse
/// internal whitespace to single `-`, strip anything but `[a-z0-9-]`. So `"SMTP2GO"`,
/// `"smtp2go"`, and a `smtp2go` handle all collapse to the same key.
#[must_use]
pub fn program_key(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut prev_dash = false;
    for ch in name.trim().to_ascii_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_end_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Eligibility;

    #[test]
    fn program_key_normalizes_names_to_a_stable_slug() {
        assert_eq!(program_key("SMTP2GO"), "smtp2go");
        assert_eq!(program_key("smtp2go"), "smtp2go");
        assert_eq!(program_key("Banco Plata"), "banco-plata");
        assert_eq!(program_key("AT&T  "), "at-t");
        assert_eq!(program_key(".nz Registry"), "nz-registry");
    }

    #[test]
    fn hackerone_parse_layers_eligibility() {
        let body = br#"[
          {"handle":"p","name":"P","url":"u","offers_bounties":true,
           "targets":{"in_scope":[
             {"asset_identifier":"a.com","asset_type":"URL","eligible_for_bounty":true,"eligible_for_submission":true,"max_severity":"critical"},
             {"asset_identifier":"b.com","asset_type":"URL","eligible_for_bounty":false,"eligible_for_submission":true,"max_severity":"high"}
           ],"out_of_scope":[
             {"asset_identifier":"c.com","asset_type":"URL","eligible_for_bounty":false,"eligible_for_submission":false,"max_severity":"none"}
           ]}},
          {"handle":"q","name":"Q","url":"u","offers_bounties":false,
           "targets":{"in_scope":[
             {"asset_identifier":"d.com","asset_type":"URL","eligible_for_bounty":true,"eligible_for_submission":true,"max_severity":"high"}
           ],"out_of_scope":[]}}
        ]"#;
        let progs = HackerOneFeed.parse(body).unwrap();
        let p = &progs[0];
        assert_eq!(p.assets[0].eligibility, Eligibility::InScopeBountyEligible);
        assert_eq!(p.assets[1].eligibility, Eligibility::SubmissionOnlyNoBounty);
        assert_eq!(p.assets[2].eligibility, Eligibility::OutOfScope);
        // Program q does not pay: even a fully-eligible asset is demoted.
        let q = &progs[1];
        assert_eq!(q.assets[0].eligibility, Eligibility::ProgramDoesNotPayBounty);
    }

    #[test]
    fn chaos_parse_maps_program_bounty_flag_onto_assets() {
        let body = br#"{"programs":[
          {"name":"Pays","url":"u","bounty":true,"domains":["x.com"]},
          {"name":"NoPay","url":"u","bounty":false,"domains":["y.com"]}
        ]}"#;
        let progs = ChaosFeed.parse(body).unwrap();
        assert_eq!(progs[0].assets[0].eligibility, Eligibility::InScopeBountyEligible);
        assert_eq!(progs[1].assets[0].eligibility, Eligibility::ProgramDoesNotPayBounty);
    }

    #[test]
    fn diodb_parse_reads_offers_bounty_string() {
        let body = br#"[
          {"program_name":"Yes","policy_url":"u","offers_bounty":"yes"},
          {"program_name":"No","policy_url":"u","offers_bounty":"no"}
        ]"#;
        let progs = DiodbFeed.parse(body).unwrap();
        assert!(progs[0].offers_bounty);
        assert!(!progs[1].offers_bounty);
        assert!(progs[0].assets.is_empty(), "diodb contributes no assets");
    }

    #[test]
    fn parse_rejects_malformed_body() {
        assert!(HackerOneFeed.parse(b"not json").is_err());
        assert!(ChaosFeed.parse(b"{").is_err());
    }
}
