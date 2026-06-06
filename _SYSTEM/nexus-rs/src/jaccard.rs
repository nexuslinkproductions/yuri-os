//! nexus_core::jaccard — embedding-free tokenize / Jaccard / tf-cosine / saturation probe,
//! BIT-EXACT (ints) / 1e-9 (floats) with yuri-jaccard.mjs. Ported by Codex R2 (2026-06-06).
use std::collections::{HashMap, HashSet};

const MAX_TOKENIZE_CHARS: usize = 200_000;

// The JS STOP list has 41 words (R2 caught the off-by-one in the brief) — matched exactly.
const STOP: [&str; 41] = [
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
    "her", "was", "one", "our", "out", "has", "had", "his", "how", "its", "who", "get", "got",
    "this", "that", "with", "from", "into", "they", "them", "then", "than", "over", "when",
    "what", "were", "will", "your", "have", "been", "also",
];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OrderedTokenSet {
    tokens: Vec<String>,
    seen: HashSet<String>,
}

impl OrderedTokenSet {
    pub fn new() -> Self { Self::default() }
    pub fn insert(&mut self, token: String) {
        if self.seen.insert(token.clone()) { self.tokens.push(token); }
    }
    pub fn len(&self) -> usize { self.tokens.len() }
    pub fn is_empty(&self) -> bool { self.tokens.is_empty() }
    pub fn contains(&self, token: &str) -> bool { self.seen.contains(token) }
    pub fn tokens(&self) -> &[String] { &self.tokens }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Metric { Jaccard, Cosine }

#[derive(Debug, Clone)]
pub struct SaturationOptions {
    pub overlap_threshold: f64,
    pub load_threshold: f64,
    pub metric: Metric,
    pub top_k: usize,
}

impl Default for SaturationOptions {
    fn default() -> Self {
        Self { overlap_threshold: 0.6, load_threshold: 0.15, metric: Metric::Jaccard, top_k: 20 }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergePair { pub a: String, pub b: String, pub overlap: f64 }

#[derive(Debug, Clone, PartialEq)]
pub struct SaturationReport {
    pub n: usize,
    pub load: f64,
    pub over_capacity: bool,
    pub merge_pairs: Vec<MergePair>,
    pub overlap_threshold: f64,
    pub load_threshold: f64,
    pub metric: Metric,
}

fn capped_prefix(text: &str) -> &str {
    if text.chars().count() <= MAX_TOKENIZE_CHARS { return text; }
    match text.char_indices().nth(MAX_TOKENIZE_CHARS) {
        Some((idx, _)) => &text[..idx],
        None => text,
    }
}

fn is_stop(token: &str) -> bool { STOP.contains(&token) }

fn push_token(token: &mut String, out: &mut OrderedTokenSet) {
    if token.len() >= 3 && !is_stop(token) { out.insert(token.clone()); }
    token.clear();
}

pub fn tokenize(text: &str) -> OrderedTokenSet {
    let mut out = OrderedTokenSet::new();
    let mut token = String::new();
    for ch in capped_prefix(text).chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() { token.push(ch); }
        else if !token.is_empty() { push_token(&mut token, &mut out); }
    }
    if !token.is_empty() { push_token(&mut token, &mut out); }
    out
}

pub fn token_freq(text: &str) -> HashMap<String, u32> {
    let mut map = HashMap::new();
    let mut token = String::new();
    for ch in capped_prefix(text).chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() { token.push(ch); }
        else if !token.is_empty() {
            if token.len() >= 3 && !is_stop(&token) { *map.entry(token.clone()).or_insert(0) += 1; }
            token.clear();
        }
    }
    if !token.is_empty() && token.len() >= 3 && !is_stop(&token) { *map.entry(token).or_insert(0) += 1; }
    map
}

pub fn jaccard(a: &OrderedTokenSet, b: &OrderedTokenSet) -> f64 {
    if a.is_empty() && b.is_empty() { return 0.0; }
    let (small, large) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    let inter = small.tokens().iter().filter(|t| large.contains(t)).count();
    let union = a.len() + b.len() - inter;
    if union == 0 { 0.0 } else { inter as f64 / union as f64 }
}

pub fn tf_cosine(a: &HashMap<String, u32>, b: &HashMap<String, u32>) -> f64 {
    if a.is_empty() || b.is_empty() { return 0.0; }
    let (small, large) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    let dot: f64 = small.iter().filter_map(|(t, v)| large.get(t).map(|w| (*v as f64) * (*w as f64))).sum();
    let na: f64 = a.values().map(|v| (*v as f64) * (*v as f64)).sum();
    let nb: f64 = b.values().map(|v| (*v as f64) * (*v as f64)).sum();
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 { 0.0 } else { dot / denom }
}

fn round4(x: f64) -> f64 {
    // Mirrors JS Number(x.toFixed(4)) for these non-negative probe values.
    (x * 10_000.0).round() / 10_000.0
}

pub fn saturation_probe(entries: &[(&str, &str)]) -> SaturationReport {
    saturation_probe_with_options(entries, SaturationOptions::default())
}

pub fn saturation_probe_with_options(entries: &[(&str, &str)], opts: SaturationOptions) -> SaturationReport {
    // JS filters entries lacking a string `text`; in Rust every tuple has a &str text, so keep all.
    let list: Vec<(&str, &str)> = entries.to_vec();
    let n = list.len();
    if n < 2 {
        return SaturationReport {
            n, load: 0.0, over_capacity: false, merge_pairs: Vec::new(),
            overlap_threshold: opts.overlap_threshold, load_threshold: opts.load_threshold, metric: opts.metric,
        };
    }

    let mut pairs = Vec::new();
    let mut high_overlap_pairs = 0usize;

    match opts.metric {
        Metric::Jaccard => {
            let vecs: Vec<OrderedTokenSet> = list.iter().map(|(_, text)| tokenize(text)).collect();
            for i in 0..n {
                for j in (i + 1)..n {
                    let s = jaccard(&vecs[i], &vecs[j]);
                    if s >= opts.overlap_threshold {
                        high_overlap_pairs += 1;
                        pairs.push(MergePair { a: list[i].0.to_string(), b: list[j].0.to_string(), overlap: round4(s) });
                    }
                }
            }
        }
        Metric::Cosine => {
            let vecs: Vec<HashMap<String, u32>> = list.iter().map(|(_, text)| token_freq(text)).collect();
            for i in 0..n {
                for j in (i + 1)..n {
                    let s = tf_cosine(&vecs[i], &vecs[j]);
                    if s >= opts.overlap_threshold {
                        high_overlap_pairs += 1;
                        pairs.push(MergePair { a: list[i].0.to_string(), b: list[j].0.to_string(), overlap: round4(s) });
                    }
                }
            }
        }
    }

    pairs.sort_by(|x, y| y.overlap.partial_cmp(&x.overlap).unwrap_or(std::cmp::Ordering::Equal));
    pairs.truncate(opts.top_k);

    let load = round4(high_overlap_pairs as f64 / n as f64);

    SaturationReport {
        n, load, over_capacity: load >= opts.load_threshold, merge_pairs: pairs,
        overlap_threshold: opts.overlap_threshold, load_threshold: opts.load_threshold, metric: opts.metric,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenization_preserves_first_seen_order_and_stopwords() {
        let set = tokenize("The session SESSION resume, and build-plan build.");
        assert_eq!(set.tokens(), &["session".to_string(), "resume".to_string(), "build".to_string(), "plan".to_string()]);
    }

    #[test]
    fn tokenize_length_boundary_is_ge_3() {
        let set = tokenize("ai abc ab abcd");
        let mut got: Vec<String> = set.tokens().to_vec();
        got.sort();
        assert_eq!(got, vec!["abc".to_string(), "abcd".to_string()]);
    }

    #[test]
    fn jaccard_empty_empty_is_zero() {
        assert_eq!(jaccard(&OrderedTokenSet::new(), &OrderedTokenSet::new()), 0.0);
    }

    #[test]
    fn saturation_matches_js_cold_example_shape() {
        let entries = [
            ("a", "session resume cortex decoder circuitry build plan next steps wire engine"),
            ("b", "session resume cortex decoder circuitry build plan next steps wire engine extra"),
            ("c", "cold call opener objection rebuttal social selling outreach sequence buyer persona"),
        ];
        let report = saturation_probe(&entries);
        assert_eq!(report.n, 3);
        assert_eq!(report.load, 0.3333);
        assert!(report.over_capacity);
        assert_eq!(report.merge_pairs.len(), 1);
        assert_eq!(report.merge_pairs[0].a, "a");
        assert_eq!(report.merge_pairs[0].b, "b");
        assert_eq!(report.merge_pairs[0].overlap, 0.9167); // 11 shared / 12 union = 0.9167 (== JS reference, verified)
    }
}
