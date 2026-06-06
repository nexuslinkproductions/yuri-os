//! nexus_core::corpus_match — deterministic Jaccard matcher with a COMPLETE prefix-filter index.
//! Rust port of the corpus-match.mjs kernel (Jaccard path). SQLite/FTS adapters, cosine, token
//! expansion + the CLI stay in Node. Ported by Codex R3 (2026-06-06), reconciled to the
//! jaccard::OrderedTokenSet type + verified by the completeness-invariant test (prefix == exact).
use std::collections::{HashMap, HashSet};

use crate::jaccard::{jaccard, tokenize, OrderedTokenSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CorpusItem<'a> {
    pub id: &'a str,
    pub text: &'a str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Match {
    pub id: String,
    /// Jaccard score rounded to four decimals (JS Number(s.toFixed(4))).
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExactMatchResult {
    pub matches: Vec<Match>,
    pub total_above_threshold: usize,
    pub scanned: usize,
    pub mode: &'static str,
    pub threshold: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PrefixFilterMatchResult {
    pub matches: Vec<Match>,
    pub total_above_threshold: usize,
    pub candidates: usize,
    pub scanned: usize,
    pub mode: &'static str,
    pub threshold: f64,
    pub complete: bool,
}

#[derive(Debug, Clone)]
pub struct Index {
    ids: Vec<String>,
    sets: Vec<OrderedTokenSet>,
    prefix_filter: Option<PrefixFilterIndex>,
    lsh_enabled: bool,
}

#[derive(Debug, Clone)]
struct PrefixFilterIndex {
    rank: HashMap<String, usize>,
    inverted: HashMap<String, Vec<usize>>,
    build_threshold: f64,
}

impl Index {
    #[must_use] pub fn len(&self) -> usize { self.ids.len() }
    #[must_use] pub fn is_empty(&self) -> bool { self.ids.is_empty() }
    #[must_use] pub fn lsh_enabled(&self) -> bool { self.lsh_enabled }
}

#[must_use]
pub fn build_index(items: &[CorpusItem<'_>], threshold: f64, prefix_filter: bool, lsh: bool) -> Index {
    let build_threshold = valid_threshold_or_default(threshold);
    let ids: Vec<String> = items.iter().map(|item| item.id.to_owned()).collect();
    let sets: Vec<OrderedTokenSet> = items.iter().map(|item| tokenize(item.text)).collect();
    let prefix_filter = if prefix_filter { Some(build_prefix_filter(&sets, build_threshold)) } else { None };
    Index { ids, sets, prefix_filter, lsh_enabled: lsh }
}

/// Complete O(N) Jaccard match.
#[must_use]
pub fn match_exact(index: &Index, query: &str, threshold: f64, top: usize) -> ExactMatchResult {
    let qset = tokenize(query);
    let mut matches = Vec::new();
    for (idx, set) in index.sets.iter().enumerate() {
        let score = jaccard(&qset, set);
        if score >= threshold {
            matches.push(Match { id: index.ids[idx].clone(), score: round4(score) });
        }
    }
    sort_matches(&mut matches);
    let total_above_threshold = matches.len();
    truncate_top(&mut matches, top);
    ExactMatchResult { matches, total_above_threshold, scanned: index.len(), mode: "exact", threshold }
}

/// Complete prefix-filter match for thresholds covered by the build threshold.
/// Invariant: the id-set MUST equal match_exact whenever threshold >= build_threshold.
#[must_use]
pub fn match_prefix_filter(index: &Index, query: &str, threshold: f64, top: usize) -> PrefixFilterMatchResult {
    let Some(prefix_filter) = &index.prefix_filter else {
        return PrefixFilterMatchResult {
            matches: Vec::new(), total_above_threshold: 0, candidates: 0,
            scanned: index.len(), mode: "prefix-filter", threshold, complete: false,
        };
    };

    let t = threshold.max(prefix_filter.build_threshold);
    let qset = tokenize(query);
    let mut qsorted: Vec<String> = qset.tokens().to_vec();
    qsorted.sort_by(|a, b| rank_for(prefix_filter, a).cmp(&rank_for(prefix_filter, b)).then_with(|| a.cmp(b)));

    let qlen = qsorted.len();
    let qprefix_len = prefix_len_at(qlen, t);
    let lo_len = (t * qlen as f64).ceil() as usize;
    let hi_len = if t > 0.0 { (qlen as f64 / t).floor() as usize } else { usize::MAX };
    let mut candidates = HashSet::new();

    for token in qsorted.iter().take(qprefix_len.min(qlen)) {
        if let Some(indexes) = prefix_filter.inverted.get(token) {
            for idx in indexes {
                let len = index.sets[*idx].len();
                if len >= lo_len && len <= hi_len { candidates.insert(*idx); }
            }
        }
    }

    let mut matches = Vec::new();
    for idx in &candidates {
        let score = jaccard(&qset, &index.sets[*idx]);
        if score >= threshold {
            matches.push(Match { id: index.ids[*idx].clone(), score: round4(score) });
        }
    }
    sort_matches(&mut matches);
    let total_above_threshold = matches.len();
    truncate_top(&mut matches, top);

    PrefixFilterMatchResult {
        matches, total_above_threshold, candidates: candidates.len(), scanned: index.len(),
        mode: "prefix-filter", threshold,
        complete: threshold > 0.0 && threshold >= prefix_filter.build_threshold,
    }
}

fn build_prefix_filter(sets: &[OrderedTokenSet], threshold: f64) -> PrefixFilterIndex {
    let mut df: HashMap<String, usize> = HashMap::new();
    for set in sets {
        for token in set.tokens() { *df.entry(token.clone()).or_insert(0) += 1; }
    }
    let mut tokens: Vec<String> = df.keys().cloned().collect();
    tokens.sort_by(|a, b| df[a].cmp(&df[b]).then_with(|| a.cmp(b)));
    let mut rank = HashMap::new();
    for (idx, token) in tokens.into_iter().enumerate() { rank.insert(token, idx); }

    let mut inverted: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, set) in sets.iter().enumerate() {
        let mut item_tokens: Vec<String> = set.tokens().to_vec();
        item_tokens.sort_by(|a, b| rank[a].cmp(&rank[b]).then_with(|| a.cmp(b)));
        let prefix_len = prefix_len_at(item_tokens.len(), threshold);
        for token in item_tokens.iter().take(prefix_len.min(item_tokens.len())) {
            inverted.entry(token.clone()).or_default().push(idx);
        }
    }
    PrefixFilterIndex { rank, inverted, build_threshold: threshold }
}

fn prefix_len_at(len: usize, threshold: f64) -> usize {
    let needed = (threshold * len as f64).ceil() as usize;
    len.saturating_sub(needed).saturating_add(1).max(1)
}

fn rank_for(prefix_filter: &PrefixFilterIndex, token: &str) -> usize {
    prefix_filter.rank.get(token).copied().unwrap_or(usize::MAX)
}

fn sort_matches(matches: &mut [Match]) {
    matches.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
}

fn truncate_top(matches: &mut Vec<Match>, top: usize) {
    if top > 0 && matches.len() > top { matches.truncate(top); }
}

fn round4(value: f64) -> f64 { (value * 10_000.0).round() / 10_000.0 }

fn valid_threshold_or_default(threshold: f64) -> f64 {
    if threshold.is_finite() && threshold > 0.0 && threshold <= 1.0 { threshold } else { 0.3 }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn corpus() -> Vec<CorpusItem<'static>> {
        vec![
            CorpusItem { id: "a", text: "session resume cortex decoder circuitry build plan next steps wire engine" },
            CorpusItem { id: "b", text: "session resume cortex decoder circuitry build plan next steps wire engine extra" },
            CorpusItem { id: "c", text: "cold call opener objection rebuttal social selling outreach sequence buyer persona" },
            CorpusItem { id: "d", text: "reflected xss login form input field cross site scripting" },
            CorpusItem { id: "e", text: "login form input validation prevents reflected xss in field" },
            CorpusItem { id: "f", text: "subdomain takeover dangling dns cname record cloud asset" },
        ]
    }

    #[test]
    fn prefix_filter_matches_exact_id_set_across_thresholds() {
        let items = corpus();
        let index = build_index(&items, 0.2, true, false);
        let queries = [
            "session resume cortex decoder engine wire plan",
            "reflected xss login input form",
            "subdomain dangling cname",
            "social selling cold call objection",
            "tokens absent from the corpus",
        ];
        let thresholds = [0.2, 0.25, 0.3, 0.45, 0.6, 0.8, 1.0];
        for query in queries {
            for threshold in thresholds {
                let exact = match_exact(&index, query, threshold, 0);
                let prefix = match_prefix_filter(&index, query, threshold, 0);
                let exact_ids: Vec<&str> = exact.matches.iter().map(|m| m.id.as_str()).collect();
                let prefix_ids: Vec<&str> = prefix.matches.iter().map(|m| m.id.as_str()).collect();
                assert!(prefix.complete, "query={query} threshold={threshold}");
                assert_eq!(prefix_ids, exact_ids, "query={query} threshold={threshold}");
                assert_eq!(prefix.total_above_threshold, exact.total_above_threshold, "query={query} threshold={threshold}");
            }
        }
    }

    #[test]
    fn top_truncates_matches_but_not_total() {
        let items = corpus();
        let index = build_index(&items, 0.2, true, false);
        let exact = match_exact(&index, "session resume cortex decoder engine wire plan", 0.2, 1);
        let prefix = match_prefix_filter(&index, "session resume cortex decoder engine wire plan", 0.2, 1);
        assert_eq!(exact.matches.len(), 1);
        assert_eq!(prefix.matches.len(), 1);
        assert!(exact.total_above_threshold > exact.matches.len());
        assert_eq!(prefix.total_above_threshold, exact.total_above_threshold);
    }

    #[test]
    fn score_sort_tie_breaks_by_id_ascending() {
        let items = vec![
            CorpusItem { id: "b", text: "alpha beta gamma" },
            CorpusItem { id: "a", text: "alpha beta gamma" },
        ];
        let index = build_index(&items, 0.2, true, false);
        let exact = match_exact(&index, "alpha beta gamma", 0.2, 0);
        assert_eq!(exact.matches[0].id, "a");
        assert_eq!(exact.matches[1].id, "b");
    }
}
