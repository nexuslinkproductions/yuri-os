# Quantum Rick Packet — Conservative State Flows, Section 4 (Reference Implementation)

**Status:** draft, awaiting dispatch
**Drafted by:** Claude (main thread)
**Predecessors:**
- Section 1 (Premise) — 8/8 ✓
- Section 2 (The Gap) — 9/9 ✓
- Section 3 (The Proposal) — 11/11 ✓

**Carry-forwards from Section 3:**
- **Notation canonicalization:** Section 3 code block uses underscore form (`KL_divergence`, `log_loss`, `information_gain`, `confidence_decay`); Section 4 must use the actual function names as exported by the implementation. Cross-check exports of [`_SYSTEM/Scripts/math/math-kernel.mjs`](../../../Scripts/math/math-kernel.mjs) and [`_SYSTEM/Scripts/math/yuri-energy.mjs`](../../../Scripts/math/yuri-energy.mjs) before writing — if they use camelCase (`klDivergence`, `logLoss`, `informationGain`, `confidenceDecay`), the Section 4 prose adopts camelCase and explicitly notes the convention shift from Section 3's pseudocode.
- **Test design — grep -c lines vs occurrences:** the Section 3 test caught primitives by counting matching lines. Section 4 acceptance criteria below use `grep -oE | wc -l` for true occurrence counts where appropriate, so prose doesn't have to be artificially paragraph-split.
- **Lane context pressure:** Quantum's lane was at ~76% CTX at end of Section 3. If Quantum needs to compact before Section 4, do so — Section 4 is significant work and a fresh context will help precision.

---

## CLAUDE CONTROL PACKET

### Goal

Produce Section 4 (Reference Implementation: YURI) of *Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment Methodology*. Section 4 grounds Section 3's abstract mechanism in a working implementation built independently by the paper's author. This is the section that converts the proposal from "could be built" to "is built, runs, and behaves as specified."

### Section context (do not re-read in full)

- **Section 3 closes:** "How this composition operates in a working implementation … is the subject of Section 4."
- **Section 4's job:** name the implementation (YURI), show its surface (function names + file paths), demonstrate it with concrete numeric output from the worked example, be explicit about what runs versus what is prototype.

### Target files

- **Write:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-4-reference-implementation.md`
- **Read for context:**
  - `_SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md` (the abstract mechanism being grounded)
  - `_SYSTEM/Scripts/math/yuri-energy.mjs` (actual function signatures, weights, behavior)
  - `_SYSTEM/Scripts/math/yuri-energy.test.mjs` (test count, what's covered)
  - Run `node _SYSTEM/Scripts/math/yuri-energy.mjs --worked-example` to capture the actual numeric output for Scenario A (descent) and Scenario B (ascent/protected-path) — use those numbers verbatim in the prose
  - Run `node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs 2>&1 | tail -10` to confirm the current passing test count
- **Do not modify:** any source code, any other paper section, or YURI control-plane files.

### Constraints

- **Word count:** 660–740 words. Target ~700.
- **Voice:** continues Sections 1–3 register. Slightly more concrete than Section 3 (this is the grounding section). Code excerpts or function-signature mentions are encouraged where they sharpen meaning.
- **First time YURI is named.** Sections 1–3 deliberately avoided naming the implementation. Section 4 opens by naming YURI as the reference implementation and frames it as "an independently developed single-operator control plane built by the author." Do not overclaim — YURI is not a published platform, not a product, not a multi-tenant system. It is one operator's working substrate that happens to instantiate Section 3's mechanism.
- **Actual function names from the code, not pseudocode.** Section 4 must cite the real exports: `computeU()`, `computeDeltaU()`, `gateProposal()`, `DEFAULT_WEIGHTS`. Use camelCase where the code uses it; explicitly note the convention shift from Section 3's underscore pseudocode if relevant.
- **Worked example with actual numbers.** Section 4 must cite at least two ΔU values from the live worked example: the Scenario A descent value (a small negative number, approximately −0.26 — confirm with the live run) and the Scenario B ascent value (exactly +100, dominated by the protected-path violation). Use the actual numbers from the live run, not approximations. Verify by running the script before writing.
- **Honest scope statement is mandatory.** Section 4 must explicitly state what runs (28/28 tests pass after Codex tightening pass; deterministic worked example; CLI surface tested) and what is prototype (not yet wired into the dispatch layer; weights are hand-tuned, not learned; one-operator scale, not production).
- **`advisory_only` framing required.** The phrase `advisory_only` (or `advisory-only`) must appear at least once, framed as YURI's signature differentiator — every result envelope from `yuri-energy.mjs` carries `advisory_only: true` and `local_truth_claim: false` until verified against deterministic local evidence.
- **Continuity:** at least one reference back to Section 3's mechanism, framed as "the proposal of Section 3, instantiated as ..."
- **No first-person plural.** Continue the discipline. "This paper's implementation," "the reference implementation," "the working substrate" are acceptable substitutes.
- **Forbidden terms** (Section 5+ territory): `caveat`, `limitation`, `weakness`, `open question`, `future work`. Section 4 is grounding, not hedging. Limitations are Section 5's job.

### Acceptance criteria

1. Word count is 660–740 (inclusive).
2. The word `YURI` appears at least 3 times (first naming + at least 2 elaborations).
3. The string `yuri-energy.mjs` appears at least once with the actual path `_SYSTEM/Scripts/math/yuri-energy.mjs`.
4. At least 2 of these function names appear: `computeU`, `computeDeltaU`, `gateProposal`, `DEFAULT_WEIGHTS`.
5. The phrase `advisory_only` or `advisory-only` appears at least once.
6. At least 2 distinct numeric ΔU values from the worked example appear in the prose (one negative ~-0.26, one positive exactly 100). Use the live run.
7. The string `28/28` or `28 tests` or `28 of 28` appears at least once (test evidence).
8. Honest-scope language appears: at least one of `not yet wired`, `not yet dispatched`, `hand-tuned`, `prototype`, `single-operator`, `not production`.
9. Continuity reference back to Section 3 — at least one of: `Section 3`, `the proposal`, `the mechanism described above`.
10. No first-person plural. `grep -ciE '\b(we|our|us)\b'` returns 0.
11. Section 5-territory terms do NOT dominate (allowed: maybe one in a forward-pointer at end). `grep -oiE '(caveat|limitation|weakness)' | wc -l` returns ≤ 1.
12. Section 4 ends with a forward pointer to Section 5 (Honest Limitations) — explicit or implicit.

### Test command

```bash
F=_SYSTEM/reports/energy-landscape-paper-2026-07/section-4-reference-implementation.md
WC=$(wc -w < "$F" | tr -d ' ')
[ "$WC" -ge 660 ] && [ "$WC" -le 740 ] && echo "PASS word-count=$WC" || echo "FAIL word-count=$WC"

YURI_COUNT=$(grep -oE '\bYURI\b' "$F" | wc -l | tr -d ' ')
[ "$YURI_COUNT" -ge 3 ] && echo "PASS YURI-mentions=$YURI_COUNT" || echo "FAIL YURI-mentions=$YURI_COUNT"

grep -qF 'yuri-energy.mjs' "$F" && echo "PASS yuri-energy.mjs-cited" || echo "FAIL yuri-energy.mjs-not-cited"
grep -qF '_SYSTEM/Scripts/math/yuri-energy.mjs' "$F" && echo "PASS actual-path-cited" || echo "FAIL path-not-cited"

FN_COUNT=$(grep -oE '\b(computeU|computeDeltaU|gateProposal|DEFAULT_WEIGHTS)\b' "$F" | sort -u | wc -l | tr -d ' ')
[ "$FN_COUNT" -ge 2 ] && echo "PASS distinct-function-names=$FN_COUNT" || echo "FAIL distinct-function-names=$FN_COUNT"

grep -qE 'advisory[_-]only' "$F" && echo "PASS advisory_only-framing" || echo "FAIL advisory_only-missing"

# At least 2 distinct numeric ΔU values (one negative ~-0.26, one +100)
NEG_PRESENT=0
POS_PRESENT=0
grep -qE '\-0\.2[0-9]' "$F" && NEG_PRESENT=1
grep -qE '\b(100|\+100)\b' "$F" && POS_PRESENT=1
[ "$NEG_PRESENT" -eq 1 ] && [ "$POS_PRESENT" -eq 1 ] && echo "PASS two-distinct-delta-U-numbers" || echo "FAIL delta-U-numbers neg=$NEG_PRESENT pos=$POS_PRESENT"

grep -qE '(28/28|28 tests|28 of 28)' "$F" && echo "PASS test-evidence" || echo "FAIL test-evidence-missing"

grep -qiE '(not yet wired|not yet dispatched|hand-tuned|prototype|single-operator|not production)' "$F" && echo "PASS honest-scope" || echo "FAIL honest-scope-missing"

grep -qiE '(Section 3|the proposal|the mechanism described above)' "$F" && echo "PASS S3-continuity" || echo "FAIL S3-continuity-missing"

grep -ciqE '\b(we|our|us)\b' "$F" && echo "FAIL first-person-plural" || echo "PASS no-first-person-plural"

S5_LEAK=$(grep -oiE '(caveat|limitation|weakness)' "$F" | wc -l | tr -d ' ')
[ "$S5_LEAK" -le 1 ] && echo "PASS S5-term-budget=$S5_LEAK" || echo "FAIL S5-terms-exceeded=$S5_LEAK"

tail -c 400 "$F" | grep -qiE '(section 5|next|limitations|honest)' && echo "PASS forward-pointer-S5" || echo "FAIL no-forward-pointer"
```

All twelve checks must pass.

### Rollback boundary

Single file. If acceptance fails, delete and re-dispatch:
```bash
rm _SYSTEM/reports/energy-landscape-paper-2026-07/section-4-reference-implementation.md
```

### Route-plan classification

- `lane: quantum-rick`
- `scenario: paper-section-draft`
- `tier: focused-implementation-grounded`
- `qualityGate: main-session-review`
- `codexPolicy: required-final-pass` (Section 4 makes concrete claims about real running code — Codex review on this section before Section 5 is recommended for accuracy)

### Adversarial verification (Quantum self-checks before reporting done)

Four failure modes worth checking:

1. **Overclaim of YURI maturity.** Section 4 names YURI for the first time. Easy drift: presenting YURI as "a system" or "a platform" implies production scale. Verification: re-read with the question "does this read as a single-operator working substrate or as a published product?" If it reads as the latter, soften. The honest-scope language and `advisory_only` framing are the corrective.

2. **Numeric drift from the live run.** Section 4 cites specific ΔU values. Easy drift: writing the numbers from memory rather than running the script. Verification: re-run `node _SYSTEM/Scripts/math/yuri-energy.mjs --worked-example` before final write and confirm Scenario A's `deltaU` and Scenario B's `deltaU` match what's in the prose to two decimal places.

3. **Notation collision with Section 3.** Section 3's code block uses underscore form. Section 4 should use the actual function names (camelCase as exported). Verification: a reader implementing from Sections 3 and 4 together must not encounter `KL_divergence` in Section 3 and `klDivergence` in Section 4 without explanation. If both forms appear, Section 4 needs a single sentence acknowledging the shift.

4. **Limitation leakage.** Section 4 is grounding, not hedging. Easy drift: writing defensive language ("a limitation here is...") that belongs in Section 5. Verification: scan for `caveat`, `limitation`, `weakness`. Budget is ≤1 (allowed as a forward-pointer to Section 5 only).

### What Quantum returns

A single message containing:
1. Confirmation of file path.
2. Output of the 12 test commands.
3. Four named failure modes considered + verification result.
4. Numeric ΔU values cited + confirmation they match a fresh `--worked-example` run.
5. Residual risk statement.
6. Any integration findings (peer-lane neutral voice).

---

## Notes for Marcel (not in the packet)

- Section 4 is where YURI's actual story enters the paper. The honest-scope language is a hard requirement because this is exactly the section where the paper could overclaim and become refutable.
- Quantum's lane context was at ~76% after Section 3. If Quantum runs the live worked-example + reads the code + writes 700 words, it may need to compact mid-task. That is acceptable.
- Codex final-pass on Section 4 is recommended (not Sections 1–3, where the abstract content is harder for Codex to fact-check usefully — but Section 4 makes concrete code claims that Codex can verify line-by-line).
- Dispatch command:
  ```bash
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick — Section 4 of the energy-landscape methodology paper (Reference Implementation: YURI). Full Claude Control Packet at _SYSTEM/reports/claude-output-lane/draft-artifacts/2026-05-28-quantum-section-4-packet.md — read it fully before starting. Run 'bash _SYSTEM/Scripts/ai route-plan paper-section-draft' in your lane first. CRITICAL: before writing prose, run 'node _SYSTEM/Scripts/math/yuri-energy.mjs --worked-example' and 'node --test _SYSTEM/Scripts/math/yuri-energy.test.mjs 2>&1 | tail -10' to capture live numeric output and test count. Use those exact numbers in the prose. Write Section 4 (660-740 words) to _SYSTEM/reports/energy-landscape-paper-2026-07/section-4-reference-implementation.md per the 12 acceptance criteria. Honest-scope language and advisory_only framing are hard requirements. Peer-lane neutral voice." --execute
  ```
- After Section 4: Section 5 (Honest Limitations, ~400 words) and Section 6 (Open Questions, ~300 words). Both shorter than Section 4. Section 4 is the last full-length section.
