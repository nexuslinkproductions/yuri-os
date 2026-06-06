//! wasm-bindgen binding — the portable (browser/Node-wasm) delivery of the NEXUS CORE kernel, for the
//! circuitry-die microscope viz + any client-side use. Parallel to binding.rs (napi); same pure
//! modules underneath → identical bit-exact results. Feature-gated (`wasm-binding`).
use wasm_bindgen::prelude::*;

use crate::{corpus_match, jaccard, minhash, phi};

#[wasm_bindgen]
pub fn fnv1a(s: &str) -> u32 { minhash::fnv1a(s) }

#[wasm_bindgen]
pub fn make_hashes_a(k: u32, seed: u32) -> Vec<u32> { minhash::make_hashes(k as usize, seed).a }

#[wasm_bindgen]
pub fn make_hashes_b(k: u32, seed: u32) -> Vec<u32> { minhash::make_hashes(k as usize, seed).b }

#[wasm_bindgen]
pub fn minhash_signature(tokens: Vec<String>, a: Vec<u32>, b: Vec<u32>) -> Vec<u32> {
    minhash::minhash_signature(tokens.iter().map(|s| s.as_str()), &a, &b)
}

#[wasm_bindgen]
pub fn estimate_jaccard(a: Vec<u32>, b: Vec<u32>) -> f64 { minhash::estimate_jaccard(&a, &b) }

#[wasm_bindgen]
pub fn lsh_bands(sig: Vec<u32>, b: u32, r: u32) -> Vec<String> {
    minhash::lsh_bands(&sig, b as usize, r as usize)
}

#[wasm_bindgen]
pub fn tune_bands_b(k: u32, t: f64) -> u32 { minhash::tune_bands(k as usize, t).b as u32 }

#[wasm_bindgen]
pub fn tune_bands_r(k: u32, t: f64) -> u32 { minhash::tune_bands(k as usize, t).r as u32 }

#[wasm_bindgen]
pub fn tokenize(text: &str) -> Vec<String> { jaccard::tokenize(text).tokens().to_vec() }

#[wasm_bindgen]
pub fn jaccard_text(a: &str, b: &str) -> f64 {
    jaccard::jaccard(&jaccard::tokenize(a), &jaccard::tokenize(b))
}

#[wasm_bindgen]
pub fn fib(n: u32) -> Result<f64, JsValue> {
    if n > 78 { return Err(JsValue::from_str("fib: n>78 loses Number precision")); }
    phi::fib(n as usize).map(|v| v as f64).map_err(|e| JsValue::from_str(&format!("{:?}", e)))
}

#[wasm_bindgen]
pub fn phi_sequence(count: u32, x0: f64) -> Vec<f64> { phi::phi_sequence(count as usize, x0) }

#[wasm_bindgen]
pub fn golden_angle_point(n: u32) -> f64 { phi::golden_angle_point(n as usize) }

#[wasm_bindgen]
pub fn golden_section_min_quadratic(target: f64, lo: f64, hi: f64) -> Result<f64, JsValue> {
    phi::golden_section_search_default(|x| (x - target).powi(2), lo, hi)
        .map(|r| r.x)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))
}

fn run_match(ids: Vec<String>, texts: Vec<String>, query: &str, threshold: f64, prefix: bool) -> Vec<String> {
    let items: Vec<corpus_match::CorpusItem> = ids
        .iter()
        .zip(texts.iter())
        .map(|(i, t)| corpus_match::CorpusItem { id: i.as_str(), text: t.as_str() })
        .collect();
    let index = corpus_match::build_index(&items, threshold, true, false);
    if prefix {
        corpus_match::match_prefix_filter(&index, query, threshold, 0).matches.into_iter().map(|m| m.id).collect()
    } else {
        corpus_match::match_exact(&index, query, threshold, 0).matches.into_iter().map(|m| m.id).collect()
    }
}

#[wasm_bindgen]
pub fn corpus_match_exact_ids(ids: Vec<String>, texts: Vec<String>, query: &str, threshold: f64) -> Vec<String> {
    run_match(ids, texts, query, threshold, false)
}

#[wasm_bindgen]
pub fn corpus_match_prefix_ids(ids: Vec<String>, texts: Vec<String>, query: &str, threshold: f64) -> Vec<String> {
    run_match(ids, texts, query, threshold, true)
}
