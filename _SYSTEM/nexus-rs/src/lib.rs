//! NEXUS — Rust port of YURI's deterministic math substrate, bit-exact with the JS reference.
//! Pure modules (cargo-testable, no FFI) + a fail-closed FFI guard + optional napi/wasm bindings.
pub mod minhash;
pub mod jaccard;
pub mod phi;
pub mod corpus_match;
pub mod round;
pub mod stats;
pub mod distrib;
pub mod ppmi;
pub mod guard;

#[cfg(feature = "napi-binding")]
mod binding;

#[cfg(feature = "wasm-binding")]
mod wasm;
