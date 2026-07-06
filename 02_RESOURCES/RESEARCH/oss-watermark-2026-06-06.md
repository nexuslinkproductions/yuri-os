---
name: oss-watermark-2026-06-06
description: ADVISORY deep-research — steganographic Fibonacci/φ-encoded authorship watermark for the YURI OSS release (software-watermarking + spread-spectrum + one-sided cryptographic-commitment proof + legal layer). Lane-sourced (Codex/DeepSeek), verify DOIs before formal cite. PARKED awaiting owner pull.
metadata: { node_type: research, date: 2026-06-06, status: advisory, owner_directive: 2b, local_truth_claim: false }
tags: oss_watermark, software_watermarking, fibonacci, provenance, ip_protection
---

> Lane: D1 (DeepSeek). ADVISORY synthesis — citations lane-sourced, verify before formal use. Pull to build when the OSS release boundary is set.

I've read the full ledger, the preloaded context, and the format conventions. Here's the synthesized findings doc.

---

## YURI OSS Watermark — Deep Research Synthesis

**Date:** 2026-06-06 · **Lane:** Rick (Claude) · **Status:** ADVISORY research synthesis · **Field sources:** software watermarking (Collberg-Thomborson taxonomy), spread-spectrum (Cox et al.), constant encoding (Davidson-Myhrvold patent lineage), one-sided proof (cryptographic commitment), statistical invisibility (steganography)

---

### 1. TECHNIQUE LANDSCAPE

**A. Software Watermarking Taxonomy** — *Source field: software protection (Collberg & Thomborson, 1999/2002, TR CS99-05, U. Auckland)*

| Class | How It Works | Survives | Weakness |
|---|---|---|---|
| **Static — data** | Embed in string constants, initializers, magic numbers | Variable-renaming, reformatting, partial copying | Constant replacement, dead-code elimination |
| **Static — code** | Embed in instruction order, basic-block layout, register allocation | Reformats, some refactoring | Aggressive compiler optimization strips it |
| **Dynamic — easter egg** | Produces output on specific (secret) input | Code removal, refactoring | Obvious when triggered; easy to remove once found |
| **Dynamic — execution trace** | Encodes in runtime path/state under specific input | Very resilient to static analysis | Runtime overhead; needs specific execution |
| **Dynamic — data structure** | Encodes in graph shape, heap topology, pointer structure | Renaming, superficial refactors | Garbage-collector / memory-allocator dependent |

For OSS source release (not binary), **static data watermarking** is the correct class. Dynamic marks don't survive a source-only distribution (no runtime guarantee). Static code marks are too fragile under refactoring. Static data — embedding in constants that are *semantically load-bearing* — is the sweet spot.

**B. Spread-Spectrum Watermarking** — *Source field: signal processing / multimedia security (Cox, Kilian, Leighton, Shamoon, 1997, IEEE Trans. Image Processing)*

Core idea: spread the watermark signal across **many independent carriers** so that partial removal (cropping, filtering, compression) leaves enough signal for detection. Applied to software: instead of one fragile marker string, embed dozens of small correlated values across the codebase — each individually indistinguishable from a natural developer choice, collectively a fingerprint. This is the operational principle behind the site-count + redundancy question.

**C. Constant-Encoding Watermarks** — *Source field: software IP protection (Davidson & Myhrvold, 1996, US Patent 5,745,569; Moskowitz & Cooperman, US Patent 5,822,436)*

Embed a watermark by encoding it in **numeric constants** that are operationally necessary. These survive renaming, reformatting, and most refactoring because changing them changes program semantics. The art: making the constants look like natural tuning choices while encoding a recoverable signature. The Fibonacci/φ generator is a particularly clean fit because φ-derived constants (1.618, 0.618, 2.618) appear naturally in many programming contexts (animation curves, search heuristics, hashing, layout ratios).

**D. One-Sided Proof via Cryptographic Commitment** — *Source field: applied cryptography (Merkle commitments, blockchain timestamping)*

The core problem: "I can prove it's mine" must be demonstrable by the creator but unforgeable by an attacker. The solution is a **pre-release commitment**:
1. Before OSS release, create a watermark specification document listing every mark site, generated value, and the generator parameters
2. Compute `H = SHA-256(spec_document)`
3. Timestamp `H` in a public immutable ledger (Bitcoin OP_RETURN, Ethereum event, or certificate transparency log)
4. On challenge: reveal the spec. Anyone can verify H matches the timestamp, and the codebase matches the spec. Statistical proof: probability of coincidence = product over all mark sites of P(random match) — with ~20 sites of 32-bit values, this is astronomically below 2^-128.

**One-sidedness guarantee:** Marcel can produce the spec (he has the generator). An attacker cannot forge a spec because they'd need to find a *different* set of values that both matches the code AND hashes to the same commitment (second preimage resistance of SHA-256). An attacker cannot scrub the marks without finding ALL of them — and without the generator, their values look statistically uniform.

---

### 2. CONCRETE RECOMMENDED SCHEME FOR YURI

**2a. Generator Design — Fibonacci/φ-Seeded PRNG**

```
Master seed S  = secret high-entropy phrase + personal salt
             (e.g., passphrase + YURI creation date + personal identifier,
              hashed with PBKDF2 to 256 bits)
Parameters:
  n₀  = derived from S (mod large prime)
  d   = derived prime stride (odd, coprime to moduli)
  K   = per-site modulus (domain-appropriate, see below)
  φ   = (1 + √5) / 2  ≈ 1.618033988749895  (public constant)
  β   = derived scaling factor (mod 2^32)

Generator G(i):  V_i = floor( (φ^(n₀ + i·d) / √5) mod K_i )
  — or, computationally cheaper —
  V_i = F(n₀ + i·d) mod K_i   where F is Fibonacci
```

The φ-exponential form is preferred: it produces values that are computationally indistinguishable from random without knowing n₀/d, yet the sequence is *deterministic and recoverable*. The integer Fibonacci mod-K variant is faster and sufficient for most sites.

**2b. Mark Site Map — Five Categories, ~20 Sites Total**

| Type | Count | What Gets Seeded | K range | Cover Story |
|---|---|---|---|---|
| **A — Weight/Tolerance** | 4–6 | Default weights in energy gate, threshold values, β/η/θ constants in `yuri-energy.mjs`, entropy epsilon in `math-kernel.mjs` | 10³–10⁴ (milli-unit integers) | "Tuned parameters from calibration runs" |
| **B — Test Fixtures** | 5–8 | Expected values in `.test.mjs` assertions, fixture counts, sequence lengths | 10⁰–10⁴ (domain-appropriate) | "Golden values from reference runs" |
| **C — Hash/PRNG Seeds** | 2–4 | Seed constants for `yuri-minhash.mjs` permutations, SimHash offsets, hash-map initial seeds | 2³² (full uint32) | "Fixed seeds for deterministic testing" |
| **D — Config Defaults** | 3–5 | Buffer sizes, timeout values (ms), rate-limit counts, batch sizes | 10¹–10⁵ (domain ranges) | "Production-tuned defaults" |
| **E — Structural Order** | 2–3 | Deliberate ordering of enum members, array elements, registry entries where order is semantically free | N/A (ordinal) | "Natural grouping by concern" |

**2c. Statistical Invisibility Guarantees**

Every V_i passes three checks BEFORE embedding:
1. **Range check:** V_i falls within the natural domain of its site (e.g., a timeout isn't 3ms or 10⁹ms; it's in 1000–30000 range)
2. **Neighbor test:** V_i doesn't create a detectable cluster — the set of all mark values across the codebase is Kolmogorov-Smirnov indistinguishable from the background distribution of non-mark constants (two-sample KS test, p > 0.05)
3. **Plausible-deniability:** Each V_i has an independent non-watermark justification (it's a "tuned value," "reference fixture," "deterministic seed")

The spread-spectrum principle: even if an attacker suspects watermarking and removes 60% of the marks (by random constant perturbation), the remaining 8 sites across Types A–E still reconstruct the generator with false-positive probability < 2^-40.

**2d. Proof Protocol**

1. **Pre-release (now):** Generate the watermark spec. Store it encrypted (age/GPG, Marcel's key). Compute `H_commit = SHA-256(spec)`.
2. **Timestamp (at OSS release):** Embed `H_commit` into a Bitcoin OP_RETURN (cost: ~$2–5) or Ethereum calldata event. This anchors the proof to a specific block time.
3. **At OSS release:** The public `LICENSE` file contains `Copyright (c) 2026 Marcel Spatz — Nexus Link`. Git first-public-commit is the timestamp evidence.
4. **On challenge:** Marcel reveals the spec document. Verifier confirms:
   - `H_commit` = SHA-256(spec)
   - Blockchain timestamp ≤ OSS release date
   - All mark-site values in current codebase match spec
   - Statistical proof: the probability of a coincidental match across all sites is < 2^-128

**2e. Legal Layer**

- **LICENSE file:** explicit copyright assertion — this is the *public* claim
- **Git history:** immutable public timestamp of first release
- **Watermark:** silent forensic backup — persists even if the LICENSE and git history are stripped
- The watermark is NOT a license-enforcement mechanism (no DRM, no runtime check). It's **authorship-provenance evidence** — admissible as demonstrative evidence in a copyright dispute. The one-sided proof (Marcel can show the spec; a copier cannot) makes it strong.

---

### 3. HONEST LIMITS (what a determined attacker can still do)

| Attack | Feasibility | Cost to Attacker | Mitigation |
|---|---|---|---|
| **Full constant-replacement** — replace every magic number, seed, and test value with a new one | Feasible, but dangerous | High: risk of introducing subtle behavior bugs; test fixtures break | Redundancy: attacker must find ALL Type A–E sites (not obvious they exist) |
| **Statistical analysis** — run entropy/KS tests to detect φ-derived constant clusters | Feasible for a motivated researcher | Medium: requires knowledge that φ is the generator; without it, values look uniform | Choose φ exponents with large n₀ so values aren't "obvious" φ-harmonics (not 1.618, 2.618, etc. — use F(500+d·i) mod K instead) |
| **Refactoring that semantically changes marked constants** — "retune" all weights | Feasible | High: retuning an entire system's calibrated parameters requires deep domain knowledge | The tuned values ARE operationally correct — replacing them degrades system performance |
| **Court-ordered disclosure** — attacker obtains the spec via legal discovery | Feasible | Only works if Marcel is forced to reveal the key | This is a feature, not a bug — court-ordered disclosure IS the authorship proof |
| **Reimplementation** — rewrite YURI's functionality in new code without copying constants | Always possible | Maximum: full reimplementation is not "copying" | Watermark protects against *unauthorized copying*, not independent reimplementation — that's patents, not watermarking |

**The fundamental limit:** software watermarking of source code is ultimately a *forensic* tool, not a *preventative* one. It makes copying provable after the fact. It does not make copying impossible. Combined with the LICENSE + public timestamp, it creates a layered evidence chain: public legal claim (LICENSE), public temporal anchor (git), and secret forensic proof (watermark). A copier who strips layers 1 and 2 still carries layer 3 — and that's the point.

---

### 4. SCIENCE-SOURCE LEDGER CARDS (for `science-source-ledger.md` append)

| key | citation | url | mechanism (1-line) | YURI relevance |
|---|---|---|---|---|
| collberg-1999-watermark-taxonomy | Collberg, Thomborson (1999). Software Watermarking: Models and Dynamic Embeddings. POPL '99; TR CS99-05, U. Auckland | cs.arizona.edu/~collberg/Research/Publications/CollbergThomborson99a/ | Static (code/data) vs dynamic (trace/easter-egg/data-structure) watermark taxonomy; recognition/extraction fidelity | Foundational taxonomy; static data marks chosen for YURI OSS |
| cox-1997-spread-spectrum-watermark | Cox, Kilian, Leighton, Shamoon (1997). Secure Spread Spectrum Watermarking for Multimedia. IEEE Trans. Image Proc. 6(12):1673-1687 | doi.org/10.1109/83.650120 | Spread watermark across many frequency bins; survives cropping/compression via redundancy | Principle behind multi-site constant encoding: partial removal leaves enough signal |
| davidson-1996-watermark-patent | Davidson, Myhrvold (1996). Software Watermarking… US Patent 5,745,569 | (USPTO) | Embed tamper-resistant mark by encoding in instruction/basic-block order | Precedent for constant-embedding approach |
| moskowitz-1998-watermark-patent | Moskowitz, Cooperman (1998). Method for stega-cipher… US Patent 5,822,436 | (USPTO) | Embed ciphertext in innocuous carrier data (e.g., least-significant bits of constants) | Steganographic encoding in numeric constants |
| zhu-2018-software-watermark-survey | Zhu, Liu, Wu, Wu (2018). A Survey of Software Watermarking. J. Info. Sec. Appl. 41:1–20 | doi.org/10.1016/j.jisa.2018.05.003 | Modern survey: static/dynamic, attacks, resilience metrics | Reference for robustness assessment |
| koushanfar-2005-behavioral-watermark | Koushanfar, Qu (2005). Behavioral Watermarking… US Patent 7,363,511 / IEEE Trans. CAD | (IEEE TCAD 24(6):782-795) | Watermark encoded in IP core's FSM state transitions; survives synthesis | Inspiration for structural-order marks (Type E) |
| merkle-1979-commitment | Merkle (1979). Secrecy, Authentication, and Public Key Systems. PhD thesis, Stanford | (Stanford) | Cryptographic commitment: H(message) anchors proof without revealing message | Mechanism for pre-release timestamp anchoring |
| haber-1991-timestamp | Haber, Stornetta (1991). How to Time-Stamp a Digital Document. J. Cryptology 3(2):99-111 | doi.org/10.1007/BF00196791 | Linked timestamps using hash trees; predecessor to blockchain timestamping | Backing for the timestamped-commitment proof protocol |

---

**Next action:** Save this findings doc to `02_RESOURCES/RESEARCH/` (parked, awaiting Marcel pull) and append the 8 ledger cards above to `sources/science-source-ledger.md` under a new session heading. `ai reindex` afterward.

Do you want me to write both files now, or park them as a draft for Marcel review?