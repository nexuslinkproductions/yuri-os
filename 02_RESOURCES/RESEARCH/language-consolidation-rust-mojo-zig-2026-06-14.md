# Language Consolidation — Rust / Mojo / Zig evaluation (2026-06-14)

Decision driver: owner directive (2026-06-14) — a large-scale **Rust consolidation** of hot kernels + **Mojo adoption** for an incoming **ML lane**. Online research (June 2026) pressure-testing whether anything beats Rust for YURI's embedded-hot-kernel use case *before* committing the refactor.

## Verdict

- **Rust — chosen for the hot embedded kernels.** Decided by a triad only Rust hits: (1) mature **Node FFI** — napi-rs / wasm-bindgen; native NAPI *outperforms* WASM, and WASM itself reaches ~67–93% of native; Rust is markedly more mature than Zig for the Node story. (2) **Memory safety without GC** — compile-time guaranteed. (3) **Production stability** — post-1.0, proven. Already proven in-repo: `_SYSTEM/nexus-rs` (minhash/jaccard/phi ported bit-exact, napi + wasm bindings, conformance-tested).
- **Mojo — ADOPTED for the ML / numerical lane** (NOT the embedded-kernel tier). MLIR-based → CPU/GPU/TPU/ASIC; 12–35,000× over Python; Mojo 1.0-beta in 2026, maturing for AI infra. Its edge is AI/numerical + heterogeneous accelerators (beyond what Rust gives there). Caveats: young, AI-narrow, no paved Node-embedding path — so it's the *ML-lane* tier, not the hot-kernel tier.
- **Zig — rejected for this use case.** Leaner, elegant `comptime`, superb C interop, smaller wasm. But 0.16 beta (pre-1.0, churning) and it **drops compile-time memory safety** (checks off in ReleaseFast/ReleaseSmall). Wrong trade for a *safety + durability* consolidation; right only if minimalism outweighed safety.

## Tiered architecture (committed)

- **JS** — live substrate + source-of-truth reference + fast-iterating verification. The energy gate (computeU/gateProposal) and its property provers (B1–B5) stay here: a verifier must import the verified, and the live gate is JS-wired into the hooks.
- **Rust** — hot, *stable* numerical kernels, delivered via napi/wasm, **bit-exact-conformance-tested to the JS reference** (`_SYSTEM/nexus-rs` is the template). Rust-port a kernel only once it stops changing.
- **Mojo** — standalone ML / numerical / GPU work off the gate's hot path.

## Sources

- [Rust vs Mojo 2026 (Markaicode)](https://markaicode.com/rust-vs-mojo-ai-infrastructure-2026/)
- [First look: Mojo 1.0 (InfoWorld)](https://www.infoworld.com/article/4173158/first-look-mojo-1-0-mixes-python-and-rust.html)
- [Zig 1.0 lands 2026 (10x.pub)](https://tianpan.co/forum/t/zig-1-0-lands-in-2026-is-this-the-c-successor-that-rust-wasnt-meant-to-be/649)
- [Memory safety: C++/Rust/Zig compared (dasroot.net)](https://dasroot.net/posts/2026/05/memory-safety-modern-systems-c-rust-zig-compared/)
- [Wasm vs native Node module perf (nickb.dev)](https://nickb.dev/blog/wasm-and-native-node-module-performance-comparison/)
