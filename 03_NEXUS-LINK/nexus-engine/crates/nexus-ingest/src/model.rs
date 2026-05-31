//! The feed-agnostic typed model: [`BountyProgram`] and [`BountyAsset`].
//!
//! Every feed (HackerOne, ProjectDiscovery chaos, disclose/diodb, Immunefi-IBB) has
//! its own wire shape. The pullers in [`crate::feed`] deserialize that raw shape and
//! project it onto this one normalized model so the rest of the pipeline — dedup,
//! veto, normalization — never sees a feed-specific field again.
//!
//! ## The two load-bearing eligibility distinctions
//!
//! 1. **Program-level**: does the program *pay bounties at all* ([`BountyProgram::offers_bounty`])?
//!    A pure VDP (disclosure-only) program has no monetary deal value to rank.
//! 2. **Asset-level**: is *this asset* in scope, bounty-eligible, and submittable
//!    ([`BountyAsset::eligibility`])? An asset can be listed but explicitly
//!    out-of-scope or submission-only (no bounty). That asset must be **vetoed**, not
//!    ranked — turning a ToS-restricted asset into a pursue-target is exactly the
//!    protected-path violation the kernel's hard veto exists to refuse.

use serde::{Deserialize, Serialize};

/// The compliance / scope status of a single asset, derived from a feed's raw flags.
///
/// Only [`Eligibility::InScopeBountyEligible`] is safe to turn into a pursue-target.
/// Every other variant is a reason the asset must be dropped *before* ranking — the
/// VETO-FIRST contract in [`crate::veto`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Eligibility {
    /// In scope, bounty-eligible, and accepts submissions — the only rankable state.
    InScopeBountyEligible,
    /// Listed but explicitly out of scope (e.g. HackerOne `out_of_scope[]`).
    OutOfScope,
    /// In scope for *submission* but **not** bounty-eligible (VDP-style, no money).
    SubmissionOnlyNoBounty,
    /// The owning program does not pay bounties at all (program-level VDP).
    ProgramDoesNotPayBounty,
}

impl Eligibility {
    /// Whether an asset in this state may be normalized into a pursue-target.
    ///
    /// Exactly one variant is rankable; everything else is a veto reason. Centralizing
    /// the predicate here keeps the dedup / veto / normalize stages from each
    /// re-deriving "is this eligible?" with subtly different logic.
    #[must_use]
    pub const fn is_rankable(self) -> bool {
        matches!(self, Eligibility::InScopeBountyEligible)
    }

    /// A short, stable reason string for veto logs (timeless — no counts/dates).
    #[must_use]
    pub const fn veto_reason(self) -> &'static str {
        match self {
            Eligibility::InScopeBountyEligible => "in-scope, bounty-eligible",
            Eligibility::OutOfScope => "asset is explicitly out of scope",
            Eligibility::SubmissionOnlyNoBounty => "submission-only, not bounty-eligible",
            Eligibility::ProgramDoesNotPayBounty => "program does not offer bounties",
        }
    }
}

/// The kind of asset a program lists. Drives effort estimation in normalization: a
/// wildcard domain or whole mobile app is more effort to attack than a single URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetType {
    /// A concrete URL / web endpoint.
    Url,
    /// A wildcard or apex domain (`*.example.com`, `example.com`).
    Domain,
    /// A native mobile application (iOS / Android).
    MobileApp,
    /// Source-code repository / executable.
    SourceCode,
    /// A smart contract / on-chain address (Immunefi).
    SmartContract,
    /// Hardware / IoT / CIDR range / anything the feed did not label.
    Other,
}

impl AssetType {
    /// Maps a feed's free-text asset-type label onto the typed enum.
    ///
    /// Unrecognized labels fall back to [`AssetType::Other`] rather than failing the
    /// whole pull — a new HackerOne asset-type string must not break ingestion.
    #[must_use]
    pub fn from_feed_label(raw: &str) -> Self {
        match raw.trim().to_ascii_uppercase().as_str() {
            "URL" | "WEB" | "API" => AssetType::Url,
            "WILDCARD" | "DOMAIN" | "CIDR_DOMAIN" => AssetType::Domain,
            "GOOGLE_PLAY_APP_ID" | "APPLE_STORE_APP_ID" | "OTHER_APK" | "TESTFLIGHT"
            | "MOBILE" => AssetType::MobileApp,
            "SOURCE_CODE" | "EXECUTABLE" | "DOWNLOADABLE_EXECUTABLES" => AssetType::SourceCode,
            "SMART_CONTRACT" | "BLOCKCHAIN" => AssetType::SmartContract,
            _ => AssetType::Other,
        }
    }

    /// Base effort-hours weight for an asset of this type, before scope-cardinality
    /// scaling. A single URL is the cheap baseline; a wildcard domain or a whole app
    /// is materially more surface to cover.
    #[must_use]
    pub const fn base_effort_hours(self) -> f64 {
        match self {
            AssetType::Url => 2.0,
            AssetType::Domain => 4.0,
            AssetType::MobileApp => 6.0,
            AssetType::SourceCode => 5.0,
            AssetType::SmartContract => 8.0,
            AssetType::Other => 3.0,
        }
    }
}

/// The maximum severity a program will pay out on, used to size the deal value.
///
/// Feeds express this as a string (`"critical"`, `"high"`, ...). The tier maps to a
/// rough bounty-value anchor in [`crate::normalize`]; it is a *prior*, not a quote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeverityTier {
    /// Pays on critical findings.
    Critical,
    /// Pays up to high.
    High,
    /// Pays up to medium.
    Medium,
    /// Pays up to low.
    Low,
    /// No payout tier expressed.
    None,
}

impl SeverityTier {
    /// Maps a feed's severity string onto the typed tier (unknown -> [`SeverityTier::None`]).
    #[must_use]
    pub fn from_feed_label(raw: Option<&str>) -> Self {
        match raw.unwrap_or("").trim().to_ascii_lowercase().as_str() {
            "critical" => SeverityTier::Critical,
            "high" => SeverityTier::High,
            "medium" => SeverityTier::Medium,
            "low" => SeverityTier::Low,
            _ => SeverityTier::None,
        }
    }
}

/// One asset belonging to a [`BountyProgram`], normalized across feeds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BountyAsset {
    /// The asset identifier (domain, URL, app id, contract address) — lowercased for
    /// stable dedup.
    pub identifier: String,
    /// The kind of asset.
    pub asset_type: AssetType,
    /// Maximum severity payout tier the program lists for this asset.
    pub max_severity: SeverityTier,
    /// Compliance / scope status — the VETO-FIRST signal.
    pub eligibility: Eligibility,
}

impl BountyAsset {
    /// The cross-feed dedup key for an asset: `(program_key, normalized_identifier)`.
    ///
    /// Identifiers are compared case-insensitively with any URL scheme/trailing slash
    /// stripped so `https://smtp2go.com/` from one feed collapses with `smtp2go.com`
    /// from another.
    #[must_use]
    pub fn normalized_identifier(&self) -> String {
        normalize_identifier(&self.identifier)
    }
}

/// One bug-bounty program, normalized across feeds, with its assets attached.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BountyProgram {
    /// Stable program key (handle / slug) used for dedup — lowercased.
    pub key: String,
    /// Human-readable program name.
    pub name: String,
    /// Canonical program URL (policy / platform page).
    pub url: String,
    /// Whether the program pays bounties at all (program-level eligibility).
    pub offers_bounty: bool,
    /// The program's listed assets (both in- and out-of-scope; eligibility is per-asset).
    pub assets: Vec<BountyAsset>,
}

/// Normalizes an asset identifier for dedup: lowercase, strip scheme + trailing slash.
///
/// Pulled out as a free function so both [`BountyAsset`] and the dedup pass use the
/// exact same canonicalization (no drift between "what we store" and "what we compare").
#[must_use]
pub fn normalize_identifier(raw: &str) -> String {
    let s = raw.trim().to_ascii_lowercase();
    let s = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
        .unwrap_or(&s);
    s.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_identifier_strips_scheme_case_slash() {
        assert_eq!(normalize_identifier("HTTPS://SMTP2GO.com/"), "smtp2go.com");
        assert_eq!(normalize_identifier("http://api.smtp2go.com"), "api.smtp2go.com");
        assert_eq!(normalize_identifier("  smtp2go.com  "), "smtp2go.com");
    }

    #[test]
    fn only_in_scope_bounty_eligible_is_rankable() {
        assert!(Eligibility::InScopeBountyEligible.is_rankable());
        assert!(!Eligibility::OutOfScope.is_rankable());
        assert!(!Eligibility::SubmissionOnlyNoBounty.is_rankable());
        assert!(!Eligibility::ProgramDoesNotPayBounty.is_rankable());
    }

    #[test]
    fn asset_type_label_mapping_falls_back_to_other() {
        assert_eq!(AssetType::from_feed_label("URL"), AssetType::Url);
        assert_eq!(AssetType::from_feed_label("wildcard"), AssetType::Domain);
        assert_eq!(AssetType::from_feed_label("SMART_CONTRACT"), AssetType::SmartContract);
        assert_eq!(AssetType::from_feed_label("totally-new-kind"), AssetType::Other);
    }

    #[test]
    fn severity_label_mapping() {
        assert_eq!(SeverityTier::from_feed_label(Some("critical")), SeverityTier::Critical);
        assert_eq!(SeverityTier::from_feed_label(Some("HIGH")), SeverityTier::High);
        assert_eq!(SeverityTier::from_feed_label(None), SeverityTier::None);
        assert_eq!(SeverityTier::from_feed_label(Some("???")), SeverityTier::None);
    }
}
