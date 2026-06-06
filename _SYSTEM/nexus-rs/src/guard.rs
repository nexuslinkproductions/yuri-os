//! nexus::guard — fail-closed FFI input validators (Codex/DeepSeek DR security review, 2026-06-06).
//! Every public FFI fn that accepts untrusted sizes/lengths from JS gates through these BEFORE touching
//! the pure kernel — closing the Uncontrolled-Resource-Consumption / panic-across-FFI surface (the #1
//! class in our disclosed bug-bounty corpus). The pure modules stay UNCHANGED + bit-exact. Limits are a
//! frozen fail-closed allow-list. (Rate-limiting many small in-limit calls is the JS energy gate's job.)

// ── frozen limit constants (anything above = rejected) ──────────────────────────────────────────
pub const MAX_HASHES: u32 = 4096;          // make_hashes / tune_bands k (covers 128–4096 MinHash configs)
pub const MAX_TOKENS: u32 = 250_000;       // minhash_signature token count
pub const MAX_CORPUS_ITEMS: u32 = 50_000;  // corpus_match ids/texts item count
pub const MAX_PHI_SEQUENCE: u32 = 50_000;  // phi_sequence count
pub const MAX_LSH_SIG_LEN: u32 = 8192;     // lsh_bands signature length

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuardError(pub String);

impl std::fmt::Display for GuardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "{}", self.0) }
}

// FFI error conversions — gated so the pure crate (cargo test) + each binding compile independently.
#[cfg(feature = "napi-binding")]
impl From<GuardError> for napi::Error {
    fn from(e: GuardError) -> Self { napi::Error::from_reason(e.0) }
}
#[cfg(feature = "wasm-binding")]
impl From<GuardError> for wasm_bindgen::JsValue {
    fn from(e: GuardError) -> Self { wasm_bindgen::JsValue::from_str(&e.0) }
}

macro_rules! guard {
    ($cond:expr, $msg:expr) => { if !($cond) { return Err(GuardError($msg.into())); } };
}

pub fn check_make_hashes(k: u32) -> Result<(), GuardError> {
    guard!(k >= 1, format!("make_hashes: k must be >= 1, got {k}"));
    guard!(k <= MAX_HASHES, format!("make_hashes: k must be <= {MAX_HASHES}, got {k}"));
    Ok(())
}

pub fn check_minhash_tokens(n: u32) -> Result<(), GuardError> {
    guard!(n <= MAX_TOKENS, format!("minhash_signature: token count must be <= {MAX_TOKENS}, got {n}"));
    Ok(())
}

pub fn check_lsh_bands(sig_len: u32, b: u32, r: u32) -> Result<(), GuardError> {
    guard!(b >= 1, format!("lsh_bands: b must be >= 1, got {b}"));
    guard!(r >= 1, format!("lsh_bands: r must be >= 1, got {r}"));
    guard!(
        b as u64 * r as u64 <= sig_len as u64,
        format!("lsh_bands: b * r ({}) must be <= sig.len() ({sig_len})", b as u64 * r as u64)
    );
    guard!(sig_len <= MAX_LSH_SIG_LEN, format!("lsh_bands: sig length must be <= {MAX_LSH_SIG_LEN}, got {sig_len}"));
    Ok(())
}

pub fn check_tune_bands(k: u32) -> Result<(), GuardError> {
    guard!(k >= 1, format!("tune_bands: k must be >= 1, got {k}"));
    guard!(k <= MAX_HASHES, format!("tune_bands: k must be <= {MAX_HASHES}, got {k}"));
    Ok(())
}

pub fn check_phi_sequence(count: u32) -> Result<(), GuardError> {
    guard!(count <= MAX_PHI_SEQUENCE, format!("phi_sequence: count must be <= {MAX_PHI_SEQUENCE}, got {count}"));
    Ok(())
}

pub fn check_corpus(items: u32) -> Result<(), GuardError> {
    // Individual text length is already capped by MAX_TOKENIZE_CHARS in jaccard::tokenize; this caps item count.
    guard!(items <= MAX_CORPUS_ITEMS, format!("corpus_match: item count must be <= {MAX_CORPUS_ITEMS}, got {items}"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn make_hashes_limits() {
        assert!(check_make_hashes(0).is_err());          // k=0 (was a panic-across-FFI)
        assert!(check_make_hashes(1).is_ok());
        assert!(check_make_hashes(MAX_HASHES).is_ok());
        assert!(check_make_hashes(MAX_HASHES + 1).is_err());
        assert!(check_make_hashes(u32::MAX).is_err());   // the 16 GiB OOM vector
    }

    #[test]
    fn lsh_bands_limits() {
        assert!(check_lsh_bands(128, 16, 8).is_ok());    // b*r == sig_len (boundary)
        assert!(check_lsh_bands(128, 16, 9).is_err());   // b*r=144 > 128 → would index-panic / wasm trap
        assert!(check_lsh_bands(128, 0, 8).is_err());
        assert!(check_lsh_bands(MAX_LSH_SIG_LEN + 1, 1, 1).is_err());
    }

    #[test]
    fn other_limits() {
        assert!(check_minhash_tokens(MAX_TOKENS).is_ok());
        assert!(check_minhash_tokens(MAX_TOKENS + 1).is_err());
        assert!(check_tune_bands(u32::MAX).is_err());    // the 4-billion-iteration CPU DoS
        assert!(check_phi_sequence(MAX_PHI_SEQUENCE + 1).is_err());
        assert!(check_corpus(MAX_CORPUS_ITEMS + 1).is_err());
        assert!(check_corpus(7).is_ok());
    }
}
