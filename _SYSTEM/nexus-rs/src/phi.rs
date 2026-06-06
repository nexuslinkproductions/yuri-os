//! nexus_core::phi — π/φ/Fibonacci primitives, BIT-EXACT/1e-12 with yuri-phi.mjs. Ported by Codex R2.
//! NOTE: f64::sqrt is not const-stable, so the φ constants derive from a SQRT5 literal; the
//! `phi_constants_are_bit_exact_with_runtime_sqrt` test PROVES the literal === runtime 5f64.sqrt().
use std::collections::HashMap;
use std::f64::consts::PI;

const SQRT5: f64 = 2.2360679774997896; // == 5f64.sqrt() (proven bit-exact in tests)
pub const PHI: f64 = (1.0 + SQRT5) / 2.0;
pub const INV_PHI: f64 = (SQRT5 - 1.0) / 2.0;
pub const INV_PHI_SQ: f64 = (3.0 - SQRT5) / 2.0;
pub const GOLDEN_ANGLE: f64 = PI * (3.0 - SQRT5);

#[derive(Debug, Clone, PartialEq)]
pub enum PhiError { InvalidInput(String) }
pub type PhiResult<T> = Result<T, PhiError>;

#[derive(Debug, Clone, PartialEq)]
pub struct GoldenSectionResult { pub x: f64, pub fx: f64, pub iters: usize, pub evals: usize, pub bracket: [f64; 2] }

#[derive(Debug, Clone, PartialEq)]
pub struct FibonacciSearchResult { pub index: usize, pub value: f64, pub evals: usize }

#[derive(Debug, Clone, PartialEq)]
pub struct GoldenAnglePoint { pub x: f64, pub y: f64, pub r: f64, pub theta: f64 }

pub fn fib(n: usize) -> PhiResult<u64> {
    if n > 93 {
        return Err(PhiError::InvalidInput(format!("fib: n>{} overflows u64", 93)));
    }
    let mut a = 0u64;
    let mut b = 1u64;
    for _ in 0..n { let t = a + b; a = b; b = t; }
    Ok(a)
}

pub fn fib_sequence(count: usize) -> PhiResult<Vec<u64>> {
    if count > 94 {
        return Err(PhiError::InvalidInput("fib_sequence: count>94 requires values beyond fib(93)".to_string()));
    }
    let mut out = Vec::with_capacity(count);
    let mut a = 0u64;
    let mut b = 1u64;
    for _ in 0..count { out.push(a); let t = a + b; a = b; b = t; }
    Ok(out)
}

pub fn golden_section_search<F>(f: F, a: f64, b: f64, tol: f64, max_iter: usize) -> PhiResult<GoldenSectionResult>
where F: Fn(f64) -> f64 {
    if !(b > a) {
        return Err(PhiError::InvalidInput(format!("golden_section_search: require b > a, got [{a}, {b}]")));
    }
    let mut lo = a;
    let mut hi = b;
    let mut evals = 0usize;
    let mut eval = |x: f64| { evals += 1; f(x) };

    let mut h = hi - lo;
    let mut c = lo + INV_PHI_SQ * h;
    let mut d = lo + INV_PHI * h;
    let mut fc = eval(c);
    let mut fd = eval(d);
    let mut iters = 0usize;

    while h > tol && iters < max_iter {
        if fc < fd {
            hi = d; d = c; fd = fc;
            h = hi - lo; c = lo + INV_PHI_SQ * h; fc = eval(c);
        } else {
            lo = c; c = d; fc = fd;
            h = hi - lo; d = lo + INV_PHI * h; fd = eval(d);
        }
        iters += 1;
    }

    let x = if fc < fd { (lo + d) / 2.0 } else { (c + hi) / 2.0 };
    Ok(GoldenSectionResult { x, fx: f(x), iters, evals, bracket: [lo, hi] })
}

pub fn golden_section_search_default<F>(f: F, a: f64, b: f64) -> PhiResult<GoldenSectionResult>
where F: Fn(f64) -> f64 { golden_section_search(f, a, b, 1e-10, 500) }

pub fn fibonacci_search_min<F>(f: F, n: usize) -> PhiResult<FibonacciSearchResult>
where F: Fn(usize) -> f64 {
    if n < 1 {
        return Err(PhiError::InvalidInput(format!("fibonacci_search_min: n must be a positive integer, got {n}")));
    }
    let mut memo: HashMap<usize, f64> = HashMap::new();
    let mut evals = 0usize;
    let mut eval = |i: usize| -> f64 {
        if let Some(v) = memo.get(&i) { return *v; }
        evals += 1;
        let v = f(i);
        memo.insert(i, v);
        v
    };

    let mut lo = 0usize;
    let mut hi = n - 1;

    while hi - lo > 2 {
        let span = hi - lo;
        let mut m1 = (hi as f64 - INV_PHI * span as f64).round() as usize;
        let mut m2 = (lo as f64 + INV_PHI * span as f64).round() as usize;
        if m1 <= lo { m1 = lo + 1; }
        if m2 >= hi { m2 = hi - 1; }
        if m1 >= m2 { m1 = lo + 1; m2 = hi - 1; }
        if eval(m1) < eval(m2) { hi = m2; } else { lo = m1; }
    }

    let mut best = lo;
    let mut bv = eval(lo);
    for i in (lo + 1)..=hi {
        let v = eval(i);
        if v < bv { bv = v; best = i; }
    }

    Ok(FibonacciSearchResult { index: best, value: bv, evals })
}

pub fn phi_point(n: usize, x0: f64) -> f64 {
    let v = (x0 + n as f64 * INV_PHI) % 1.0;
    if v < 0.0 { v + 1.0 } else { v }
}

pub fn phi_sequence(count: usize, x0: f64) -> Vec<f64> {
    (0..count).map(|i| phi_point(i, x0)).collect()
}

pub fn golden_angle_point(n: usize) -> f64 {
    let tau = 2.0 * PI;
    let v = (n as f64 * GOLDEN_ANGLE) % tau;
    if v < 0.0 { v + tau } else { v }
}

pub fn golden_angle_points(n: usize, radius: f64) -> Vec<GoldenAnglePoint> {
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let r = radius * ((i as f64 + 0.5) / n as f64).sqrt();
        let theta = i as f64 * GOLDEN_ANGLE;
        out.push(GoldenAnglePoint { x: r * theta.cos(), y: r * theta.sin(), r, theta });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64, eps: f64) {
        assert!((a - b).abs() <= eps, "left={a:?} right={b:?} diff={:?}", (a - b).abs());
    }

    #[test]
    fn phi_constants_are_bit_exact_with_runtime_sqrt() {
        // PROVES the SQRT5 literal === 5f64.sqrt() bit-for-bit, so the const-derived φ values match JS.
        assert_eq!(SQRT5, 5f64.sqrt());
        assert_eq!(PHI, (1.0 + 5f64.sqrt()) / 2.0);
        assert_eq!(INV_PHI, (5f64.sqrt() - 1.0) / 2.0);
        assert_eq!(INV_PHI_SQ, (3.0 - 5f64.sqrt()) / 2.0);
        assert_eq!(GOLDEN_ANGLE, PI * (3.0 - 5f64.sqrt()));
    }

    #[test]
    fn fib_pins() {
        assert_eq!(fib(10).unwrap(), 55);
        assert_eq!(fib(20).unwrap(), 6765);
        assert_eq!(fib_sequence(11).unwrap(), vec![0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55]);
    }

    #[test]
    fn golden_section_finds_quadratic_minimum() {
        let got = golden_section_search_default(|x| (x - 2.0).powi(2), 0.0, 5.0).unwrap();
        close(got.x, 2.0, 1e-8);
        close(got.fx, 0.0, 1e-14);
    }

    #[test]
    fn fibonacci_search_min_cold_example() {
        let arr = [9.0, 7.0, 5.0, 3.0, 1.0, 2.0, 4.0, 6.0, 8.0];
        let got = fibonacci_search_min(|i| arr[i], arr.len()).unwrap();
        assert_eq!(got.index, 4);
        assert_eq!(got.value, 1.0);
    }

    #[test]
    fn phi_cold_values() {
        close(PHI, 1.618033988749895, 1e-15);
        close(INV_PHI, 0.6180339887498949, 1e-15);
        close(GOLDEN_ANGLE * 180.0 / PI, 137.50776405003785, 1e-12);
        let seq = phi_sequence(4, 0.0);
        close(seq[0], 0.0, 1e-15);
        close(seq[1], 0.6180339887498949, 1e-15);
        close(seq[2], 0.2360679774997898, 1e-15);
        close(seq[3], 0.8541019662496847, 1e-15);
    }
}
