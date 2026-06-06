//! nexus_core::minhash — deterministic MinHash + LSH, BIT-EXACT with yuri-minhash.mjs.
//! Ported by Codex R1 (2026-06-06), verified against the JS cold vectors + the conformance harness.
use std::collections::HashSet;

pub const MERSENNE: u32 = 2_147_483_647;
pub const FNV_OFFSET: u32 = 2_166_136_261;
pub const FNV_PRIME: u32 = 16_777_619;
pub const DEFAULT_SEED: u32 = 0x9e37_79b1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hashes {
    pub k: usize,
    pub a: Vec<u32>,
    pub b: Vec<u32>,
    pub seed: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BandTuning {
    pub b: usize,
    pub r: usize,
    pub crossover: f64,
    pub err: f64,
}

pub fn fnv1a(s: &str) -> u32 {
    let mut h = FNV_OFFSET;
    for code_unit in s.encode_utf16() {
        h ^= code_unit as u32;
        h = h.wrapping_mul(FNV_PRIME);
    }
    h
}

struct Lcg {
    s: u32,
}

impl Lcg {
    fn new(seed: u32) -> Self {
        Self { s: if seed == 0 { 1 } else { seed } }
    }

    fn next(&mut self) -> u32 {
        self.s = self.s.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.s
    }
}

pub fn make_hashes(k: usize, seed: u32) -> Hashes {
    assert!(k >= 1, "make_hashes: k must be a positive integer, got {k}");

    let mut rnd = Lcg::new(seed);
    let mut a = Vec::with_capacity(k);
    let mut b = Vec::with_capacity(k);

    for _ in 0..k {
        a.push((rnd.next() % (MERSENNE - 1)) + 1);
        b.push(rnd.next() % MERSENNE);
    }

    Hashes { k, a, b, seed }
}

pub fn make_hashes_default(k: usize) -> Hashes {
    make_hashes(k, DEFAULT_SEED)
}

pub fn mod_affine(a: u32, x: u32, b: u32) -> u32 {
    let p = MERSENNE as u128;
    (((a as u128 * (x as u128 % p)) + b as u128) % p) as u32
}

pub fn minhash_signature<I, S>(tokens: I, a: &[u32], b: &[u32]) -> Vec<u32>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let k = a.len().min(b.len());
    let mut sig = vec![u32::MAX; k];
    let mut seen = HashSet::new();

    for token in tokens {
        let x = fnv1a(token.as_ref());
        if !seen.insert(x) {
            continue;
        }

        for i in 0..k {
            let hv = mod_affine(a[i], x, b[i]);
            if hv < sig[i] {
                sig[i] = hv;
            }
        }
    }

    sig
}

pub fn estimate_jaccard(sig_a: &[u32], sig_b: &[u32]) -> f64 {
    let k = sig_a.len().min(sig_b.len());
    if k == 0 {
        return 0.0;
    }

    let matches = sig_a
        .iter()
        .zip(sig_b.iter())
        .take(k)
        .filter(|(a, b)| a == b)
        .count();

    matches as f64 / k as f64
}

pub fn lsh_bands(sig: &[u32], b: usize, r: usize) -> Vec<String> {
    let mut keys = Vec::with_capacity(b);

    for band in 0..b {
        let mut h = FNV_OFFSET;
        let start = band * r;

        for i in 0..r {
            let v = sig[start + i];

            h ^= v & 0xff;
            h = h.wrapping_mul(FNV_PRIME);
            h ^= (v >> 8) & 0xff;
            h = h.wrapping_mul(FNV_PRIME);
            h ^= (v >> 16) & 0xff;
            h = h.wrapping_mul(FNV_PRIME);
            h ^= (v >> 24) & 0xff;
            h = h.wrapping_mul(FNV_PRIME);
        }

        keys.push(format!("{band}:{}", h));
    }

    keys
}

pub fn tune_bands(k: usize, t: f64) -> BandTuning {
    let mut best = BandTuning {
        b: 1,
        r: k,
        crossover: f64::NAN,
        err: f64::INFINITY,
    };

    for r in 1..=k {
        let b = k / r;
        if b < 1 {
            break;
        }

        let crossover = (1.0 / b as f64).powf(1.0 / r as f64);
        let err = (crossover - t).abs();

        if err < best.err {
            best = BandTuning { b, r, crossover, err };
        }
    }

    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_matches_js_utf16_vectors() {
        assert_eq!(fnv1a(""), 2_166_136_261);
        assert_eq!(fnv1a("login"), 3_380_555_570);
    }

    #[test]
    fn make_hashes_matches_lcg_vectors() {
        let h = make_hashes(4, 42);
        assert_eq!(h.a, vec![1_083_814_274, 331_920_222, 1_613_448_262, 1_921_058_496]);
        assert_eq!(h.b, vec![378_494_188, 955_863_294, 110_225_632, 508_781_842]);
    }

    #[test]
    fn minhash_signature_matches_pinned_vector() {
        let h = make_hashes(4, 42);
        let sig = minhash_signature(["a", "b", "c"], &h.a, &h.b);
        assert_eq!(sig, vec![1_149_165_645, 131_699_668, 138_982_230, 328_598_279]);
    }

    #[test]
    fn empty_minhash_signature_is_all_max() {
        let h = make_hashes(4, 42);
        let sig = minhash_signature(std::iter::empty::<&str>(), &h.a, &h.b);
        assert_eq!(sig, vec![u32::MAX; 4]);
    }

    #[test]
    fn estimate_jaccard_matches_coordinate_fraction() {
        assert_eq!(estimate_jaccard(&[], &[]), 0.0);
        assert_eq!(estimate_jaccard(&[1, 2, 3, 4], &[1, 9, 3]), 2.0 / 3.0);
    }

    #[test]
    fn lsh_bands_matches_pinned_vector() {
        let h = make_hashes(8, 42);
        let sig = minhash_signature(
            ["authentication", "bypass", "token", "replay"],
            &h.a,
            &h.b,
        );
        assert_eq!(
            lsh_bands(&sig, 2, 4),
            vec!["0:1454477764".to_string(), "1:1956211075".to_string()]
        );
    }

    #[test]
    fn tune_bands_matches_expected_shape() {
        let tuned = tune_bands(128, 0.5);
        assert_eq!(tuned.b, 25);
        assert_eq!(tuned.r, 5);
        assert!((tuned.crossover - 0.5253055608807534).abs() < 1e-15);
        assert!((tuned.err - 0.0253055608807534).abs() < 1e-15);
    }
}
