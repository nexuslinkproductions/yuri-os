//! napi binding — HARDENED FFI boundary (DR + A1 stress-test). Untrusted sizes/lengths/floats gate
//! through guard:: (fail-closed) before touching the pure kernel; pure modules UNCHANGED + bit-exact.
//! Rust guards are SECOND-LINE — the true first boundary is JS-side validation before marshalling.
use napi_derive::napi;

use crate::{corpus_match, guard, jaccard, minhash, phi};

#[napi]
pub fn fnv1a(s: String) -> u32 { minhash::fnv1a(&s) }

#[napi(object)]
pub struct HashParams { pub a: Vec<u32>, pub b: Vec<u32> }

#[napi]
pub fn make_hashes(k: u32, seed: u32) -> napi::Result<HashParams> {
    guard::check_make_hashes(k)?;
    let h = minhash::make_hashes(k as usize, seed);
    Ok(HashParams { a: h.a, b: h.b })
}

#[napi]
pub fn minhash_signature(tokens: Vec<String>, a: Vec<u32>, b: Vec<u32>) -> napi::Result<Vec<u32>> {
    guard::check_minhash_tokens(tokens.len() as u32)?;
    guard::check_hash_params(a.len() as u32, b.len() as u32)?;
    Ok(minhash::minhash_signature(tokens.iter().map(|s| s.as_str()), &a, &b))
}

#[napi]
pub fn estimate_jaccard(a: Vec<u32>, b: Vec<u32>) -> napi::Result<f64> {
    guard::check_signature_pair(a.len() as u32, b.len() as u32)?;
    Ok(minhash::estimate_jaccard(&a, &b))
}

#[napi]
pub fn lsh_bands(sig: Vec<u32>, b: u32, r: u32) -> napi::Result<Vec<String>> {
    guard::check_lsh_bands(sig.len() as u32, b, r)?;
    Ok(minhash::lsh_bands(&sig, b as usize, r as usize))
}

#[napi(object)]
pub struct BandTuning { pub b: u32, pub r: u32, pub crossover: f64, pub err: f64 }

#[napi]
pub fn tune_bands(k: u32, t: f64) -> napi::Result<BandTuning> {
    guard::check_tune_bands(k)?;
    let bt = minhash::tune_bands(k as usize, t);
    Ok(BandTuning { b: bt.b as u32, r: bt.r as u32, crossover: bt.crossover, err: bt.err })
}

#[napi]
pub fn tokenize(text: String) -> Vec<String> { jaccard::tokenize(&text).tokens().to_vec() }

#[napi]
pub fn jaccard_text(a: String, b: String) -> f64 {
    jaccard::jaccard(&jaccard::tokenize(&a), &jaccard::tokenize(&b))
}

#[napi]
pub fn fib(n: u32) -> napi::Result<f64> {
    if n > 78 { return Err(napi::Error::from_reason("fib: n>78 loses Number precision (use a BigInt path)")); }
    phi::fib(n as usize).map(|v| v as f64).map_err(|e| napi::Error::from_reason(format!("{:?}", e)))
}

#[napi]
pub fn phi_sequence(count: u32, x0: f64) -> napi::Result<Vec<f64>> {
    guard::check_phi_sequence(count)?;
    guard::check_finite("phi_sequence x0", x0)?;
    Ok(phi::phi_sequence(count as usize, x0))
}

#[napi]
pub fn golden_angle_point(n: u32) -> f64 { phi::golden_angle_point(n as usize) }

#[napi]
pub fn golden_section_min_quadratic(target: f64, lo: f64, hi: f64) -> napi::Result<f64> {
    guard::check_finite("target", target)?;
    guard::check_finite("lo", lo)?;
    guard::check_finite("hi", hi)?;
    phi::golden_section_search_default(|x| (x - target).powi(2), lo, hi)
        .map(|r| r.x).map_err(|e| napi::Error::from_reason(format!("{:?}", e)))
}

#[napi(object)]
pub struct MatchResult { pub ids: Vec<String>, pub total: u32 }

fn run_match(ids: Vec<String>, texts: Vec<String>, query: String, threshold: f64, prefix: bool) -> napi::Result<MatchResult> {
    guard::check_corpus(ids.len() as u32)?;
    guard::check_corpus(texts.len() as u32)?;
    let n = ids.len().min(texts.len()); // mismatched lengths would otherwise index-panic
    let items: Vec<corpus_match::CorpusItem> = ids[..n].iter().zip(texts[..n].iter())
        .map(|(i, t)| corpus_match::CorpusItem { id: i.as_str(), text: t.as_str() }).collect();
    let index = corpus_match::build_index(&items, threshold, true, false);
    if prefix {
        let r = corpus_match::match_prefix_filter(&index, &query, threshold, 0);
        Ok(MatchResult { ids: r.matches.into_iter().map(|m| m.id).collect(), total: r.total_above_threshold as u32 })
    } else {
        let r = corpus_match::match_exact(&index, &query, threshold, 0);
        Ok(MatchResult { ids: r.matches.into_iter().map(|m| m.id).collect(), total: r.total_above_threshold as u32 })
    }
}

#[napi]
pub fn corpus_match_exact(ids: Vec<String>, texts: Vec<String>, query: String, threshold: f64) -> napi::Result<MatchResult> {
    run_match(ids, texts, query, threshold, false)
}

#[napi]
pub fn corpus_match_prefix(ids: Vec<String>, texts: Vec<String>, query: String, threshold: f64) -> napi::Result<MatchResult> {
    run_match(ids, texts, query, threshold, true)
}
