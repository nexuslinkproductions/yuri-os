//! Cross-feed dedup by `(program, asset)`.
//!
//! The same program shows up in more than one feed (HackerOne lists `smtp2go` with
//! per-asset flags; ProjectDiscovery chaos lists the same `smtp2go.com` domain with
//! only a program-level flag). Naively concatenating feeds would double-count that
//! domain and let a richer feed's eligibility be shadowed by a poorer one.
//!
//! [`dedup_programs`] collapses on two keys:
//! 1. **program** — [`BountyProgram::key`] (already feed-normalized).
//! 2. **asset** — the program key plus [`BountyAsset::normalized_identifier`].
//!
//! When two copies of the same asset disagree on eligibility, the **more informative,
//! more restrictive** verdict wins via [`Eligibility`] precedence — so a HackerOne
//! `OutOfScope` flag is never overwritten by a chaos "program pays, therefore eligible"
//! guess. That ordering is what keeps the later VETO-FIRST gate sound: dedup can only
//! ever make an asset *more* likely to be vetoed, never less.

use std::collections::BTreeMap;

use crate::model::{BountyAsset, BountyProgram, Eligibility};

/// Merge precedence for two eligibility verdicts on the *same* asset seen in two feeds.
///
/// The rule is **authority-aware**, not blindly "most restrictive wins", because the
/// feeds differ in resolution:
///
/// - [`Eligibility::OutOfScope`] is an **explicit per-asset scope exclusion** (only
///   HackerOne expresses it). It is a real protected-path / ToS signal and is supreme —
///   it can never be overridden, and it overrides everything else. Lower rank = wins.
/// - [`Eligibility::InScopeBountyEligible`] is an **explicit per-asset inclusion**. It
///   outranks the two *coarse, program-level inferences* below, so a feed that only
///   knows "this program (maybe) doesn't pay" can never silently downgrade an asset a
///   richer feed explicitly marked eligible. (That stale-coarse-flag override is exactly
///   the bug that would otherwise drop a real lead.)
/// - [`Eligibility::SubmissionOnlyNoBounty`] and
///   [`Eligibility::ProgramDoesNotPayBounty`] are **coarse program-level inferences**;
///   they only stand when no explicit per-asset verdict contradicts them.
///
/// Soundness for the later veto: the only verdict that can *demote* an asset to vetoed
/// is `OutOfScope`, which is always an authoritative exclusion — so dedup never invents
/// a veto, it only honors a real one.
const fn precedence_rank(e: Eligibility) -> u8 {
    match e {
        // Authoritative exclusion — supreme.
        Eligibility::OutOfScope => 0,
        // Authoritative inclusion — beats coarse program-level "no bounty" guesses.
        Eligibility::InScopeBountyEligible => 1,
        // Coarse program-level inferences (no per-asset scope knowledge).
        Eligibility::SubmissionOnlyNoBounty => 2,
        Eligibility::ProgramDoesNotPayBounty => 3,
    }
}

/// Picks the surviving eligibility when the same asset appears twice: the higher-
/// authority (lower-rank) verdict. Ties keep the incumbent.
fn merge_eligibility(a: Eligibility, b: Eligibility) -> Eligibility {
    if precedence_rank(b) < precedence_rank(a) {
        b
    } else {
        a
    }
}

/// Collapses a flat list of programs (concatenated from every feed) into a
/// deduplicated list keyed by program, with assets deduplicated by normalized
/// identifier inside each program.
///
/// Determinism: programs come back sorted by key and assets sorted by normalized
/// identifier (both via `BTreeMap`), so the same inputs always yield the same output
/// order — a ranked pursue-queue must not jitter between runs.
#[must_use]
pub fn dedup_programs(programs: Vec<BountyProgram>) -> Vec<BountyProgram> {
    // program key -> (merged program shell, asset key -> merged asset)
    let mut merged: BTreeMap<String, MergedProgram> = BTreeMap::new();

    for prog in programs {
        let entry = merged
            .entry(prog.key.clone())
            .or_insert_with(|| MergedProgram::shell(&prog));
        // A program that pays in *any* feed is treated as paying (most-informative
        // wins; chaos may flag bounty=false for a program HackerOne knows pays).
        entry.offers_bounty |= prog.offers_bounty;
        // Prefer a non-empty url/name if the incumbent shell was sparse.
        if entry.url.is_empty() && !prog.url.is_empty() {
            entry.url = prog.url.clone();
        }
        for asset in prog.assets {
            let akey = asset.normalized_identifier();
            entry
                .assets
                .entry(akey)
                .and_modify(|existing| {
                    existing.eligibility =
                        merge_eligibility(existing.eligibility, asset.eligibility);
                })
                .or_insert(asset);
        }
    }

    merged
        .into_values()
        .map(MergedProgram::finish)
        .collect()
}

/// Internal accumulator for a program being merged across feeds.
struct MergedProgram {
    key: String,
    name: String,
    url: String,
    offers_bounty: bool,
    assets: BTreeMap<String, BountyAsset>,
}

impl MergedProgram {
    fn shell(p: &BountyProgram) -> Self {
        MergedProgram {
            key: p.key.clone(),
            name: p.name.clone(),
            url: p.url.clone(),
            offers_bounty: p.offers_bounty,
            assets: BTreeMap::new(),
        }
    }

    fn finish(self) -> BountyProgram {
        BountyProgram {
            key: self.key,
            name: self.name,
            url: self.url,
            offers_bounty: self.offers_bounty,
            assets: self.assets.into_values().collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AssetType, BountyAsset, SeverityTier};

    fn asset(id: &str, elig: Eligibility) -> BountyAsset {
        BountyAsset {
            identifier: id.to_string(),
            asset_type: AssetType::Url,
            max_severity: SeverityTier::High,
            eligibility: elig,
        }
    }

    fn prog(key: &str, pays: bool, assets: Vec<BountyAsset>) -> BountyProgram {
        BountyProgram {
            key: key.to_string(),
            name: key.to_string(),
            url: format!("https://example/{key}"),
            offers_bounty: pays,
            assets,
        }
    }

    #[test]
    fn out_of_scope_is_supreme_and_never_overridden() {
        // Same asset, one feed says OutOfScope, another says eligible. OutOfScope wins.
        assert_eq!(
            merge_eligibility(Eligibility::InScopeBountyEligible, Eligibility::OutOfScope),
            Eligibility::OutOfScope
        );
        assert_eq!(
            merge_eligibility(Eligibility::OutOfScope, Eligibility::InScopeBountyEligible),
            Eligibility::OutOfScope
        );
    }

    #[test]
    fn explicit_eligible_beats_coarse_no_bounty_inference() {
        // The smtp2go case: HackerOne (eligible) vs chaos (program-no-bounty).
        assert_eq!(
            merge_eligibility(
                Eligibility::InScopeBountyEligible,
                Eligibility::ProgramDoesNotPayBounty
            ),
            Eligibility::InScopeBountyEligible
        );
    }

    #[test]
    fn dedup_collapses_assets_and_ors_program_pays() {
        let feed_a = prog(
            "smtp2go",
            true,
            vec![asset("smtp2go.com", Eligibility::InScopeBountyEligible)],
        );
        let feed_b = prog(
            "smtp2go",
            false, // chaos says no bounty
            vec![asset("https://SMTP2GO.com/", Eligibility::ProgramDoesNotPayBounty)],
        );
        let out = dedup_programs(vec![feed_a, feed_b]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].assets.len(), 1, "duplicate domain collapsed");
        assert!(out[0].offers_bounty, "any feed that pays makes the program pay");
        assert_eq!(
            out[0].assets[0].eligibility,
            Eligibility::InScopeBountyEligible
        );
    }

    #[test]
    fn dedup_output_is_deterministically_sorted() {
        let p1 = prog("zeta", true, vec![asset("b.com", Eligibility::InScopeBountyEligible)]);
        let p2 = prog("alpha", true, vec![asset("a.com", Eligibility::InScopeBountyEligible)]);
        let out = dedup_programs(vec![p1, p2]);
        assert_eq!(out[0].key, "alpha");
        assert_eq!(out[1].key, "zeta");
    }
}
