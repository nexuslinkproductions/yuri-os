//! NEXUS CORE — Rust port of YURI's deterministic math substrate, bit-exact with the JS reference.
//! Pure modules (cargo-testable, no FFI) + an optional napi binding (feature `napi-binding`).
pub mod minhash;
pub mod jaccard;
pub mod phi;
pub mod corpus_match;

#[cfg(feature = "napi-binding")]
mod binding;
