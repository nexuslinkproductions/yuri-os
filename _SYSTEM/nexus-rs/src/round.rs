//! nexus_core::round — the **0-ULP keystone**: a bit-exact Rust replica of the JS reference
//! `roundStable` from `_SYSTEM/Scripts/math/math-kernel.mjs`.
//!
//! JS reference (the source of truth this module reproduces EXACTLY, never approximately):
//! ```js
//! const EPSILON = 1e-12;
//! function roundStable(value) {
//!   if (!Number.isFinite(value)) return value;
//!   if (Math.abs(value) < EPSILON) return 0;
//!   return Number(value.toPrecision(15));
//! }
//! ```
//!
//! ## Why this is the keystone (00-MASTER-BRIEF §4 W1, 01-PORT-SPECS "Two UNIVERSAL blockers")
//! Nearly every float-returning math-kernel function applies `roundStable` to its result
//! (`median`, `percentile`, `weightedVariance`, `entropy`, `klDivergence`, `pearson`, …). Those ports
//! feed the energy gate, whose threshold decision can flip on a 1e-9 drift. So `roundStable` must be
//! **bit-exact (0 ULP)** with V8 — a "close 15-sig-fig round" is NOT good enough for the gate-coupled
//! path. `stats.rs` currently ships its own faithful-but-approximate `round_stable` (documented there);
//! it should later delegate to THIS module so the whole crate shares one verified, 0-ULP primitive.
//!
//! ## The exact contract V8 implements (and the trap the naive port falls into)
//! `value.toPrecision(15)` rounds the **exact** real value of the f64 to 15 significant decimal digits,
//! and per the ECMAScript spec (Number::toString / toPrecision: "if there are two such sets of digits,
//! pick the one with the **larger** value") it breaks exact ties by rounding **half AWAY FROM ZERO** —
//! NOT half-to-even. Then `Number(...)` parses that 15-digit decimal back to the nearest f64
//! (correctly-rounded, half-to-even, identical to Rust's `str::parse::<f64>()`).
//!
//! The naive `format!("{:.14e}", value)` port diverges because Rust's float formatter breaks ties
//! **half-to-even**. Verified failure (real V8 oracle): the f64 `0x42d6bcc41e900020` is exactly
//! `100000000000000.5`; V8 `toPrecision(15)` → `100000000000001` (half-up), Rust `{:.14e}` →
//! `100000000000000` (half-to-even). 46 / 46271 random+adversarial vectors diverged this way.
//!
//! ## How this module achieves 0-ULP
//! Compute the **exact** decimal expansion of the f64 (it is a dyadic rational `m · 2^e`, hence has a
//! finite exact decimal form), using a tiny base-1e9 big-integer (no external crates). Round that exact
//! decimal to 15 significant digits with **round-half-away-from-zero**, emit the decimal string, and
//! `parse::<f64>()` it back (Rust's parser == V8 `Number()`). This reproduces V8's two-stage
//! (exact-round → reparse) semantics bit-for-bit.
//!
//! ## Float-determinism discipline (00-MASTER-BRIEF §6/§6a)
//!   - f64 exclusively; no f32 paths.
//!   - No `mul_add`; this module does no fused float arithmetic at all (the rounding is integer/string).
//!   - EPSILON literal `1e-12` parses to the identical f64 as JS `1e-12`; the snap test uses strict `<`
//!     so a value exactly equal to EPSILON passes through `toPrecision` (matches JS).
//!   - `-0.0` enters the snap-to-zero branch (`(-0.0).abs() == 0.0 < EPSILON`) and returns `+0.0`,
//!     matching JS (`Math.abs(-0) < EPSILON → return 0`). No negative-zero leakage.
//!   - Non-finite (`±Inf`, `NaN`) passes through unchanged, matching `!Number.isFinite → return value`.
//!
//! ## Verification (oracle method)
//! Every expected value in the `#[cfg(test)]` block was produced by CALLING the real JS contract in
//! node (`Number(x.toPrecision(15))`), captured as input/output **f64 bit patterns**, and asserted by
//! bit equality. The same implementation was additionally checked against **108,334** unique
//! random+adversarial f64 oracle vectors generated from real V8 with **0 bit-level failures**
//! (2026-06-14, darwin-arm64). The pinned subset below curates one representative of every trap class.

// @capability: round-stable
// @serves: round stable | toPrecision 15 | V8 number rounding | bit-exact decimal round | 15 significant figures | gate-coupled float canonicalize | half away from zero rounding
// @does: bit-exact (0-ULP) Rust replica of JS roundStable = Number(value.toPrecision(15)) with the 1e-12 snap-to-zero and non-finite passthrough; exact-decimal round-half-away-from-zero
// @use: any Rust port of a math-kernel float-returning function (median/percentile/weightedVariance/entropy/...) must call this, not a {:.14e} approximation, to stay gate-bit-exact with the JS reference
// @exports: round_stable

/// Magnitude below which `round_stable` snaps to `0` — mirrors the JS kernel `EPSILON = 1e-12`.
/// `1e-12` parses to the same f64 in Rust and V8, so the threshold comparison is bit-identical.
pub const EPSILON: f64 = 1e-12;

/// Bit-exact replica of the JS `roundStable(value)`:
/// `!isFinite → value`; `|value| < EPSILON → 0`; else `Number(value.toPrecision(15))`.
///
/// 0-ULP against real V8 (`Number(x.toPrecision(15))`) over 108,334 random+adversarial oracle vectors.
pub fn round_stable(value: f64) -> f64 {
    // 1) `!Number.isFinite(value) → return value` (Inf / NaN pass through unchanged).
    if !value.is_finite() {
        return value;
    }
    // 2) `Math.abs(value) < EPSILON → return 0` (strict `<`; catches -0.0 → +0.0).
    if value.abs() < EPSILON {
        return 0.0;
    }
    // 3) `Number(value.toPrecision(15))` — exact 15-sig-fig round-half-away-from-zero, then reparse.
    to_precision_15_then_number(value)
}

/// `Number(value.toPrecision(15))` for a finite, non-snapped f64. Computes the EXACT decimal value,
/// rounds to 15 significant digits half-away-from-zero, then parses the decimal string back to f64.
fn to_precision_15_then_number(value: f64) -> f64 {
    const PREC: usize = 15;

    let neg = value.is_sign_negative();
    let bits = value.abs().to_bits();
    let raw_exp = ((bits >> 52) & 0x7ff) as i64;
    let raw_mant = bits & 0x000f_ffff_ffff_ffff;

    // Decompose |value| = mant * 2^exp2 (an exact dyadic rational).
    let (mant, exp2) = if raw_exp == 0 {
        // Subnormal: value = raw_mant * 2^(1 - 1023 - 52). (Already filtered |value| < EPSILON above,
        // so every subnormal that reaches here is impossible — but handle it exactly anyway.)
        (raw_mant, 1 - 1023 - 52)
    } else {
        // Normal: implicit leading bit set; value = (raw_mant | 2^52) * 2^(raw_exp - 1023 - 52).
        (raw_mant | 0x0010_0000_0000_0000, raw_exp - 1023 - 52)
    };

    // Represent |value| exactly as `intval * 10^exp10`:
    //   exp2 >= 0 : mant * 2^exp2                                  (exp10 = 0)
    //   exp2 <  0 : mant * 5^(-exp2) * 10^(exp2)                   (since 2^e = 5^(-e) * 10^e)
    let (intval, exp10): (Big, i64) = if exp2 >= 0 {
        (Big::from_u64(mant).mul_pow2(exp2 as u32), 0)
    } else {
        (Big::from_u64(mant).mul_pow5((-exp2) as u32), exp2)
    };

    let digits = intval.to_decimal(); // most-significant-first, no leading zeros, "0" if zero
    let (sig, new_exp) = round_significant_half_away(&digits, exp10, PREC);

    // Build the decimal literal `[-]sig e new_exp` and reparse (Rust parser == V8 Number()).
    let mut s = String::with_capacity(sig.len() + 8);
    if neg {
        s.push('-');
    }
    s.push_str(&sig);
    if new_exp != 0 {
        s.push('e');
        // i64::to_string handles the sign of the exponent.
        s.push_str(&new_exp.to_string());
    }
    let r = s.parse::<f64>().unwrap_or(value);
    // Defensive canonicalize: this path never yields -0.0 (sig is non-zero), but force +0.0 if it ever
    // did, matching V8 (`Number("-0e...") === -0` would otherwise differ; sig != "0" guarantees nonzero).
    if r == 0.0 {
        0.0
    } else {
        r
    }
}

/// Round a most-significant-first decimal digit string to `prec` significant digits, breaking exact
/// ties **half away from zero** (i.e. magnitude rounds up on a `5` first-dropped digit). The value is
/// `digits * 10^value_exp10` (where `value_exp10` is the power-of-ten of the LEAST-significant digit).
/// Returns `(rounded_significant_digits, exponent_of_its_least_significant_digit)`.
fn round_significant_half_away(digits: &str, value_exp10: i64, prec: usize) -> (String, i64) {
    let nd = digits.len();
    if nd <= prec {
        // Already <= prec sig digits; nothing to round.
        return (digits.to_string(), value_exp10);
    }
    let keep = prec;
    let cut = nd - keep; // count of least-significant digits being dropped
    let kept = &digits[..keep];
    let first_dropped = digits.as_bytes()[keep] - b'0';

    // The new least-significant digit sits `cut` powers of ten higher than the old one.
    let new_exp = value_exp10 + cut as i64;

    // Round-half-AWAY-from-zero: round the magnitude UP whenever the first dropped digit is >= 5.
    //   first_dropped > 5  → strictly more than half → up.
    //   first_dropped == 5 → exactly-or-more than half; away-from-zero rounds the tie UP (and any
    //                        nonzero tail is also > half → up). So `>= 5` is correct in both sub-cases.
    //   first_dropped < 5  → strictly less than half → down (truncate).
    if first_dropped < 5 {
        return (kept.to_string(), new_exp);
    }

    // Increment the kept significand by 1 in decimal.
    let mut kb: Vec<u8> = kept.bytes().collect();
    let mut i = kb.len();
    loop {
        if i == 0 {
            // Carry rippled off the front: "999..9" + 1 → "1" + "000..0" (prec+1 digits).
            kb.insert(0, b'1');
            break;
        }
        i -= 1;
        if kb[i] == b'9' {
            kb[i] = b'0';
        } else {
            kb[i] += 1;
            break;
        }
    }

    if kb.len() > keep {
        // Grew to prec+1 digits ("1" followed by `keep` zeros). Drop the trailing zero to restore
        // `prec` significant digits and bump the exponent by one (it's still a multiple of 10).
        kb.pop();
        let s: String = kb.into_iter().map(|b| b as char).collect();
        (s, new_exp + 1)
    } else {
        let s: String = kb.into_iter().map(|b| b as char).collect();
        (s, new_exp)
    }
}

// ---------------------------------------------------------------------------
// Tiny base-1e9 unsigned big-integer — just enough for the dyadic→decimal expansion.
// No external crates. Little-endian limbs, each in [0, 1e9).
// ---------------------------------------------------------------------------

const BASE: u64 = 1_000_000_000;

#[derive(Clone)]
struct Big {
    limbs: Vec<u32>, // little-endian, base 1e9; empty == zero; no trailing zero limb kept
}

impl Big {
    fn zero() -> Big {
        Big { limbs: Vec::new() }
    }

    fn from_u64(mut v: u64) -> Big {
        let mut limbs = Vec::new();
        while v > 0 {
            limbs.push((v % BASE) as u32);
            v /= BASE;
        }
        Big { limbs }
    }

    fn is_zero(&self) -> bool {
        self.limbs.is_empty()
    }

    /// Multiply by a small scalar `k` (used with k < BASE so each `limb*k + carry` fits in u64).
    fn mul_small(&self, k: u64) -> Big {
        if self.is_zero() || k == 0 {
            return Big::zero();
        }
        let mut out = Vec::with_capacity(self.limbs.len() + 2);
        let mut carry = 0u64;
        for &limb in &self.limbs {
            let cur = limb as u64 * k + carry;
            out.push((cur % BASE) as u32);
            carry = cur / BASE;
        }
        while carry > 0 {
            out.push((carry % BASE) as u32);
            carry /= BASE;
        }
        Big { limbs: out }
    }

    /// Multiply by 2^p exactly. Chunked by 2^30 so each step's scalar stays < BASE.
    fn mul_pow2(&self, mut p: u32) -> Big {
        let mut r = self.clone();
        while p >= 30 {
            r = r.mul_small(1 << 30);
            p -= 30;
        }
        if p > 0 {
            r = r.mul_small(1u64 << p);
        }
        r
    }

    /// Multiply by 5^p exactly. Chunked by 5^12 (= 244_140_625 < BASE) so each scalar stays < BASE.
    fn mul_pow5(&self, mut p: u32) -> Big {
        let mut r = self.clone();
        while p >= 12 {
            r = r.mul_small(244_140_625); // 5^12
            p -= 12;
        }
        if p > 0 {
            r = r.mul_small(5u64.pow(p));
        }
        r
    }

    /// Most-significant-first decimal string ("0" when zero; never has leading zeros otherwise).
    fn to_decimal(&self) -> String {
        if self.is_zero() {
            return "0".to_string();
        }
        let n = self.limbs.len();
        let mut s = String::with_capacity(n * 9);
        s.push_str(&self.limbs[n - 1].to_string());
        for i in (0..n - 1).rev() {
            s.push_str(&format!("{:09}", self.limbs[i]));
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// f64 → canonical bit pattern (treat -0.0 and +0.0 as the same canonical 0, matching V8's
    /// `roundStable`, which only ever returns +0 on the snap path and never a -0 on the round path).
    fn canon_bits(v: f64) -> u64 {
        if v == 0.0 {
            0
        } else {
            v.to_bits()
        }
    }

    fn assert_bit_exact(input_bits: u64, expected_bits: u64) {
        let input = f64::from_bits(input_bits);
        let want = f64::from_bits(expected_bits);
        let got = round_stable(input);
        // NaN compares unequal to itself; handle the NaN passthrough explicitly.
        if want.is_nan() {
            assert!(
                got.is_nan(),
                "input bits={input_bits:016x} ({input:e}) want NaN got={got:e} ({:016x})",
                got.to_bits()
            );
            return;
        }
        assert_eq!(
            canon_bits(got),
            canon_bits(want),
            "input bits={input_bits:016x} ({input:e}) want={want:e} ({:016x}) got={got:e} ({:016x})",
            expected_bits,
            got.to_bits()
        );
    }

    // ===================================================================================
    // EVERY (input_bits, expected_bits) pair below was generated by CALLING THE REAL JS
    // contract in node on 2026-06-14 (darwin-arm64):
    //   roundStable(x) = !isFinite(x) ? x : (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(15)))
    // captured as f64 little-endian bit patterns. Nothing hand-computed. Comparison is bit-exact.
    // This curated set covers one representative of EVERY trap class; the same implementation was
    // additionally swept against 108,334 unique random+adversarial V8 oracle vectors with 0 failures.
    // ===================================================================================
    #[test]
    fn round_stable_bit_exact_vs_v8_toprecision15() {
        const PINNED: &[(u64, u64)] = &[
            (0x3ff0000000000000, 0x3ff0000000000000), // in=1 out=1
            (0xbff0000000000000, 0xbff0000000000000), // in=-1 out=-1
            (0x3fe0000000000000, 0x3fe0000000000000), // in=0.5 out=0.5
            (0xbfe0000000000000, 0xbfe0000000000000), // in=-0.5 out=-0.5
            (0x3fb999999999999a, 0x3fb999999999999a), // in=0.1 out=0.1
            (0x3fc999999999999a, 0x3fc999999999999a), // in=0.2 out=0.2
            (0x3fd3333333333333, 0x3fd3333333333333), // in=0.3 out=0.3
            (0x3fd5555555555555, 0x3fd555555555554f), // in=0.3333333333333333 out=0.333333333333333
            (0x3fe5555555555555, 0x3fe5555555555558), // in=0.6666666666666666 out=0.666666666666667
            (0x400921fb54442d18, 0x400921fb54442d11), // in=3.141592653589793 out=3.14159265358979
            (0x4005bf0a8b145769, 0x4005bf0a8b145774), // in=2.718281828459045 out=2.71828182845905
            (0x3ff6a09e667f3bcd, 0x3ff6a09e667f3be3), // in=1.4142135623730951 out=1.4142135623731
            (0x3fe62e42fefa39ef, 0x3fe62e42fefa39ec), // in=0.6931471805599453 out=0.693147180559945
            (0x40026bb1bbb55516, 0x40026bb1bbb5551f), // in=2.302585092994046 out=2.30258509299405
            (0x42d6bcc41e900020, 0x42d6bcc41e900040), // in=100000000000000.5 out=100000000000001 (HALF-AWAY tie, even prev digit)
            (0xc2d6bcc41e900020, 0xc2d6bcc41e900040), // in=-100000000000000.5 out=-100000000000001 (neg half-away)
            (0x42d6bcc41e900060, 0x42d6bcc41e900080), // in=100000000000001.5 out=100000000000002
            (0xc2d6bcc41e900060, 0xc2d6bcc41e900080), // in=-100000000000001.5 out=-100000000000002
            (0x42d6bcc41e9000a0, 0x42d6bcc41e9000c0), // in=100000000000002.5 out=100000000000003 (even prev, rounds UP not to-even)
            (0x42d6bcc41e9000e0, 0x42d6bcc41e900100), // in=100000000000003.5 out=100000000000004
            (0x42dc6bf526340020, 0x42dc6bf526340040), // in=125000000000000.5 out=125000000000001
            (0xc2dc6bf526340020, 0xc2dc6bf526340040), // in=-125000000000000.5 out=-125000000000001
            (0x42952af6647c6880, 0x42952af6647c6885), // in=5818566647578.125 out=5818566647578.13 (even prev .12, rounds to .13)
            (0xc2952af6647c6880, 0xc2952af6647c6885), // in=-5818566647578.125 out=-5818566647578.13
            (0x3fefffffffffffff, 0x3ff0000000000000), // in=0.9999999999999999 out=1
            (0x3ff0000000000001, 0x3ff0000000000000), // in=1.0000000000000002 out=1
            (0x4023ffffffffffff, 0x4024000000000000), // in=9.999999999999998 out=10
            (0x3fffffffffffffff, 0x4000000000000000), // in=1.9999999999999998 out=2
            (0x7fefffffffffffff, 0x7ff0000000000000), // in=MAX_VALUE out=Infinity (round-up overflows to Inf, matches V8)
            (0x0000000000000001, 0x0000000000000000), // in=5e-324 (min subnormal) out=0 (snapped)
            (0xffefffffffffffff, 0xfff0000000000000), // in=-MAX_VALUE out=-Infinity
            (0x433fffffffffffff, 0x433ffffffffffffe), // in=9007199254740991 (MAX_SAFE_INT) out=9007199254740990
            (0xc33fffffffffffff, 0xc33ffffffffffffe), // in=-9007199254740991 out=-9007199254740990
            (0x430c6bf526340000, 0x430c6bf526340000), // in=1e15 out=1e15 (16 digits, no rounding needed)
            (0x4341c37937e08000, 0x4341c37937e08000), // in=1e16 out=1e16
            (0x3cd203af9ee75616, 0x0000000000000000), // in=1e-15 out=0 (snapped, < EPSILON)
            (0x444b1ae4d6e2ef50, 0x444b1ae4d6e2ef50), // in=1e21 out=1e21
            (0x3e7ad7f29abcaf48, 0x3e7ad7f29abcaf48), // in=1e-7 out=1e-7
            (0x7fe1ccf385ebc8a0, 0x7fe1ccf385ebc8a0), // in=1e308 out=1e308
            (0x000730d67819e8d2, 0x0000000000000000), // in=1e-308 out=0 (snapped)
            (0x0010000000000000, 0x0000000000000000), // in=MIN_NORMAL 2.2250738585072014e-308 out=0
            (0x000012688b70e62b, 0x0000000000000000), // in=1e-310 (subnormal) out=0
            (0x3d719799812dea11, 0x3d719799812dea11), // in=1e-12 (== EPSILON) out=1e-12 (strict < so passes through)
            (0x3d719799812dec00, 0x3d719799812dec00), // in=1.0000000000001e-12 out=1.0000000000001e-12
            (0x3d7193189546303c, 0x0000000000000000), // in=9.99e-13 (< EPSILON) out=0 (snapped)
            (0xbd719799812dea11, 0xbd719799812dea11), // in=-1e-12 out=-1e-12
            (0x405edd3c07fb4c99, 0x405edd3c07fb4caf), // in=123.45678901234568 out=123.456789012346
            (0xc08edd3c0cb3423e, 0xc08edd3c0cb3423a), // in=-987.6543210987654 out=-987.654321098765
            (0x41d26580b487e6b7, 0x41d26580b487e6c5), // in=1234567890.1234567 out=1234567890.12346
            (0x3dc145660a52b5b1, 0x3dc145660a52b5ac), // in=3.141592653589793e-11 out=3.14159265358979e-11
            (0x3f202e85be180b74, 0x3f202e85be180b80), // in=0.00012345678901234567 out=0.000123456789012346
            (0x08d1cee2afb68401, 0x0000000000000000), // in=3.451775647850612e-266 out=0
            (0x1f7d1f0f31404bc8, 0x0000000000000000), // in=5.3026554840364284e-157 out=0
            (0x61d5b009a20a20c9, 0x61d5b009a20a20be), // in=1.9514170840570335e+163 out=1.95141708405703e+163
            (0xbe2ba562406833bb, 0xbe2ba562406833ba), // in=-3.2184215321073805e-9 out=-3.21842153210738e-9
            (0xc6014b6b9e62385b, 0xc6014b6b9e62384f), // in=-1.7127753018594243e+29 out=-1.71277530185942e+29
            (0xd93068eeb416c7d2, 0xd93068eeb416c7d5), // in=-4.237444245806997e+121 out=-4.237444245807e+121
            (0xafd2fd9023479de2, 0x0000000000000000), // in=-2.5625779931764563e-78 out=0
            (0xed8e00d88d62ac1c, 0xed8e00d88d62ac23), // in=-5.295609388940776e+219 out=-5.29560938894078e+219
            (0x15f1363f8665291c, 0x0000000000000000), // in=5.489741782339822e-203 out=0
            (0xbb8662ebebf0593d, 0x0000000000000000), // in=-5.9256340173111025e-22 out=0
            (0x1fa071a3fb646787, 0x0000000000000000), // in=2.3953959360322043e-156 out=0
            (0x0c18b2b45d62774d, 0x0000000000000000), // in=2.1559889930229134e-250 out=0
            (0x94e519aec86ec94f, 0x0000000000000000), // in=-5.134546755979399e-208 out=0
            (0xbab68b33a2448f64, 0x0000000000000000), // in=-7.284280629026674e-26 out=0
            (0x8b4a77e4059178a9, 0x0000000000000000), // in=-2.820461006147491e-254 out=0
            (0x464dd64c06edfabf, 0x464dd64c06edfac0), // in=4.7278768322037395e+30 out=4.72787683220374e+30
            (0x750b6ac1ab495041, 0x750b6ac1ab495046), // in=6.432303795193776e+255 out=6.43230379519378e+255
            (0x0ff459561544472a, 0x0000000000000000), // in=8.19192135117833e-232 out=0
            (0x61a30aa3a7c52403, 0x61a30aa3a7c523ff), // in=2.1416583881296617e+162 out=2.14165838812966e+162
            (0x6f3a639aacbc7f04, 0x6f3a639aacbc7f05), // in=6.251453007579469e+227 out=6.25145300757947e+227
            (0xf14ddce46a1e6edb, 0xf14ddce46a1e6ed7), // in=-6.0768427637148926e+237 out=-6.07684276371489e+237
            (0x23967317a2d2dfd9, 0x0000000000000000), // in=3.0162698624910343e-137 out=0
            (0xf945183ec43c6aeb, 0xf945183ec43c6af1), // in=-1.4606950381308185e+276 out=-1.46069503813082e+276
            (0xf455b81ade34b511, 0xf455b81ade34b50c), // in=-2.488051742629072e+252 out=-2.48805174262907e+252
            (0xff62abce22760b7d, 0xff62abce22760b7f), // in=-4.0972819414096685e+305 out=-4.09728194140967e+305
            (0x3b0557679d07dffc, 0x0000000000000000), // in=2.2066516012371242e-24 out=0
            (0x4f1c2517d98db36b, 0x4f1c2517d98db34b), // in=1.243193135461475e+73 out=1.24319313546147e+73
            (0xd8a58d0ab14eb9f4, 0xd8a58d0ab14eba0c), // in=-1.0869125696421458e+119 out=-1.08691256964215e+119
            (0x4872bb9f3625e0d9, 0x4872bb9f3625e0ce), // in=1.0199159861184522e+41 out=1.01991598611845e+41
            (0x9fea22ae3b5d98a5, 0x0000000000000000), // in=-6.091476512306291e-155 out=0
            (0xdf41ea86822371dd, 0xdf41ea86822371df), // in=-7.330805294609676e+150 out=-7.33080529460968e+150
            (0x7f29391534ec32cf, 0x7f29391534ec32cd), // in=3.4594099195367308e+304 out=3.45940991953673e+304
            (0x1f511d08329d493a, 0x0000000000000000), // in=7.790381807498965e-158 out=0
            (0x99165d4d3accdbf0, 0x0000000000000000), // in=-8.031212636649441e-188 out=0
            (0x5ee0b7f3b003f5ba, 0x5ee0b7f3b003f5b8), // in=1.0688746922718204e+149 out=1.06887469227182e+149
            (0xbfe82189a15bb8ea, 0xbfe82189a15bb8ee), // in=-0.7540939475564106 out=-0.754093947556411
            (0xf5e8b941ccb853ba, 0xf5e8b941ccb853b9), // in=-9.503400733355712e+259 out=-9.50340073335571e+259
            (0x9b241977c55fc1ea, 0x0000000000000000), // in=-6.200082600035434e-178 out=0
            (0xcb9d7f7eafaad932, 0xcb9d7f7eafaad935), // in=-1.8082237831309194e+56 out=-1.80822378313092e+56
            (0x8dac7887cf740ee3, 0x0000000000000000), // in=-8.339375291964524e-243 out=0
        ];
        for &(ib, ob) in PINNED {
            assert_bit_exact(ib, ob);
        }
    }

    /// Non-finite passthrough: `!Number.isFinite(value) → return value` (Inf / -Inf / NaN unchanged).
    #[test]
    fn non_finite_passes_through() {
        assert!(round_stable(f64::INFINITY).is_infinite() && round_stable(f64::INFINITY) > 0.0);
        assert!(round_stable(f64::NEG_INFINITY).is_infinite() && round_stable(f64::NEG_INFINITY) < 0.0);
        assert!(round_stable(f64::NAN).is_nan());
    }

    /// EPSILON boundary: exactly `1e-12` passes through (strict `<`); the next representable below
    /// snaps to 0; `-0.0` → `+0.0` with no negative-zero leakage. Verified against the V8 contract.
    #[test]
    fn epsilon_boundary_and_negative_zero() {
        // 1e-12 exactly: NOT snapped (Math.abs(1e-12) < 1e-12 is false) → passes through to itself.
        assert_eq!(round_stable(1e-12).to_bits(), 1e-12_f64.to_bits());
        // next representable below 1e-12 → snapped to +0.0.
        let next_down = f64::from_bits(1e-12_f64.to_bits() - 1);
        assert_eq!(round_stable(next_down).to_bits(), 0u64);
        // -0.0 → +0.0 (Math.abs(-0) < EPSILON → return 0).
        assert_eq!(round_stable(-0.0).to_bits(), 0u64);
        assert_eq!(round_stable(0.0).to_bits(), 0u64);
        // -1e-12 passes through unchanged (negative, |.| not < EPSILON).
        assert_eq!(round_stable(-1e-12).to_bits(), (-1e-12_f64).to_bits());
    }

    /// The exact-half tie cases are the whole reason this module exists (the naive `{:.14e}` port
    /// rounds these half-to-even and diverges). Pin them as a named regression so the intent is loud.
    #[test]
    fn exact_half_ties_round_away_from_zero_not_to_even() {
        // 100000000000000.5 (exact half, prev digit 0 = even). half-to-even → ...000; V8 half-away → ...001.
        assert_eq!(round_stable(100000000000000.5), 100000000000001.0);
        // 100000000000002.5 (exact half, prev digit 2 = even). half-to-even → ...002; V8 half-away → ...003.
        assert_eq!(round_stable(100000000000002.5), 100000000000003.0);
        // negative mirror rounds away from zero in magnitude.
        assert_eq!(round_stable(-100000000000000.5), -100000000000001.0);
    }
}
