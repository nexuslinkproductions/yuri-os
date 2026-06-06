//! NEXUS — Rust port of YURI's deterministic math substrate, bit-exact with the JS reference.
//! Pure modules (cargo-testable, no FFI) + optional napi (`napi-binding`) and wasm (`wasm-binding`) layers.
pub mod minhash;
pub mod jaccard;
pub mod phi;
pub mod corpus_match;

#[cfg(feature = "napi-binding")]
mod binding;

#[cfg(feature = "wasm-binding")]
mod wasm;
