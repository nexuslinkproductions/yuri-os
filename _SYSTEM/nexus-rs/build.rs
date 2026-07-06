fn main() {
    // Only run the napi build setup when the binding feature is on (so `cargo test` stays pure).
    if std::env::var("CARGO_FEATURE_NAPI_BINDING").is_ok() {
        napi_build::setup();
    }
}
