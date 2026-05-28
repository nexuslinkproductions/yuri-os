# Quantum Rick Packet — Conservative State Flows, Section 3 (The Proposal)

**Status:** draft, awaiting dispatch
**Drafted by:** Claude (main thread)
**Predecessors:**
- Section 1 (Premise) — landed, 8/8 acceptance, peer-verified
- Section 2 (The Gap) — landed, 9/9 acceptance, peer-verified

**Carry-forward from Section 2 residual risk:** Section 2 para 4 contained an implicit convergence claim ("eventually terminating at a low-energy configuration") that overstates the EBM analogue — EBM surfaces have local minima, not guaranteed global convergence. **Section 3 MUST address this honestly when specifying the composition rule.** Local-minima honesty is a hard requirement, not a residual concern.

---

## CLAUDE CONTROL PACKET

### Goal

Produce Section 3 (The Proposal) of *Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment Methodology*. Section 3 names the specific mechanism: a scalar potential U over orchestration state, composed from proven mathematical primitives, gated by a strict-descent rule (ΔU ≤ 0). Section 3 also makes the level-shift explicit — this is a control-plane mechanism, not a neural-network-weight mechanism — and addresses the local-minima caveat surfaced by Section 2.

### Section context (do not re-read in full)

- **Section 1 closes:** "When structural containment is solved, what governs the dynamics inside it?"
- **Section 2 answers categorically:** The missing object is a scalar potential / Lyapunov-style function. Section 2 framed this as an open question.
- **Section 3's job:** propose the specific mechanism — composition rule + gating rule + level-shift declaration + local-minima honesty.

### Target files

- **Write:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md`
- **Read for context:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md`, `_SYSTEM/reports/energy-landscape-paper-2026-07/section-2-gap.md`
- **Do not modify:** any other paper section or YURI control-plane files.

### Constraints

- **Word count:** 660–740 words. Target ~700. Largest section in the paper — this is the proposal.
- **Voice:** declarative, slightly more technical than Sections 1–2. Mathematical notation allowed where it sharpens meaning.
- **Mechanism is now named, not analogized.** Section 2 said "a Lyapunov-style function would close the gap." Section 3 says "this paper proposes the following: define U(state) as ..." — commitment, not exploration.
- **Composition rule:** must name at least 4 of the following 6 primitives as components of U: entropy, KL divergence, log loss, Brier score, information gain, confidence decay. These are the building blocks of the scalar potential.
- **Gating rule:** must state the ΔU ≤ 0 rejection rule (or ΔU > threshold rejection) explicitly. The notation ΔU is now allowed and expected.
- **Level shift must be explicit.** Section 3 must contain a clear declarative sentence that distinguishes this proposal from the Potential-Derived layer in EBM literature — this is at the *control-plane* layer, not the *neural-network weight* layer. Avoid overclaim. A reader who knows the EBM literature must finish Section 3 understanding exactly what this proposal is and is not.
- **Local-minima honesty.** Section 3 must acknowledge that scalar potentials have local minima and that strict-descent gating does not guarantee global optimality. This must appear explicitly, not be buried. Suggested framing: "Strict-descent gating ensures monotonic improvement along accepted transitions; it does not guarantee convergence to a global minimum. The trade-off is intentional — local descent is verifiable; global optimality is not."
- **Continuity with ICM/MWP:** Section 3 must reference ICM/MWP at least once as the foundation being extended. The proposal is *extension*, not replacement.
- **No first-person plural** (`we`, `our`, `us`). Continue Section 1–2 voice. Use "this paper proposes," "the mechanism is," "the proposed construction" as substitutes.
- **Forbidden terms** (Section 4 territory — reference implementation): `YURI`, `yuri-energy`, `claim-integrity-gate`, `promotion ladder`, `gateProposal`, `computeU` (function-name form), `_SYSTEM/`, file paths. Section 3 stays at the methodology level. Specific function names and file paths land in Section 4.
- **Peer-lane neutral voice** when discussing ICM/MWP, EBM literature, or any prior work.

### Acceptance criteria

1. Word count is 660–740 (inclusive). `wc -w` on the output file.
2. The notation `ΔU` appears at least twice (the gating rule + at least one elaboration).
3. The word `Lyapunov` appears at least twice (named mechanism + property).
4. At least four of these six primitive names appear: `entropy`, `KL divergence`, `log loss`, `Brier`, `information gain`, `confidence decay`.
5. The phrase `control-plane` (or `control plane`) appears at least once AND the phrase `neural-network` (or `neural network`) appears at least once — the level-shift must be explicit by contrast.
6. The phrase `local minim` (matches "local minima" and "local minimum") appears at least once — local-minima honesty is enforced.
7. `ICM` appears at least once (continuity with Sections 1–2).
8. Forbidden terms do NOT appear: `YURI`, `yuri-energy`, `claim-integrity-gate`, `promotion ladder`, `gateProposal`, `computeU`. File paths under `_SYSTEM/` do NOT appear.
9. No first-person plural pronouns.
10. Section 3 ends with a forward pointer to Section 4 — either explicit ("the following section grounds this proposal in a working implementation") or implicit ("how this composes in practice is the subject of Section 4"). Closing must point forward.

### Test command

```bash
F=_SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md
WC=$(wc -w < "$F" | tr -d ' ')
[ "$WC" -ge 660 ] && [ "$WC" -le 740 ] && echo "PASS word-count=$WC" || echo "FAIL word-count=$WC"
DU=$(grep -cF 'ΔU' "$F")
[ "$DU" -ge 2 ] && echo "PASS delta-U=$DU" || echo "FAIL delta-U=$DU"
LY=$(grep -c 'Lyapunov' "$F")
[ "$LY" -ge 2 ] && echo "PASS Lyapunov=$LY" || echo "FAIL Lyapunov=$LY"
PRIM=$(grep -ciE '(entropy|KL divergence|log loss|Brier|information gain|confidence decay)' "$F")
[ "$PRIM" -ge 4 ] && echo "PASS primitives-mentions=$PRIM" || echo "FAIL primitives-mentions=$PRIM"
grep -ciE 'control[- ]plane' "$F" >/dev/null && grep -ciE 'neural[- ]network' "$F" >/dev/null \
  && echo "PASS level-shift-explicit" || echo "FAIL level-shift-not-explicit"
grep -ci 'local minim' "$F" >/dev/null && echo "PASS local-minima-honesty" || echo "FAIL local-minima-missing"
grep -c 'ICM' "$F" | (read n; [ "$n" -ge 1 ] && echo "PASS ICM-continuity=$n" || echo "FAIL ICM-missing=$n")
grep -ciE '\b(YURI|yuri-energy|claim-integrity-gate|promotion ladder|gateProposal|computeU)\b' "$F" \
  && echo "FAIL: Section-4 term leaked" || echo "PASS: no Section-4 term"
grep -F '_SYSTEM/' "$F" && echo "FAIL: file path leaked" || echo "PASS: no file paths"
grep -ciE '\b(we|our|us)\b' "$F" && echo "FAIL first-person-plural" || echo "PASS no-first-person-plural"
tail -c 400 "$F" | grep -qiE '(section 4|next section|grounds this|in practice|implementation)' \
  && echo "PASS forward-pointer-to-S4" || echo "FAIL no-forward-pointer"
```

All eleven checks must pass.

### Rollback boundary

Single file. If acceptance fails, delete and re-dispatch:
```bash
rm _SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md
```

### Route-plan classification

- `lane: quantum-rick`
- `scenario: paper-section-draft`
- `tier: focused-implementation-high-stakes` (Section 3 is the paper's core; review pass should be tighter)
- `qualityGate: main-session-review`
- `codexPolicy: optional-final-pass` (consider escalating to required-final-pass after Section 3 lands)

### Adversarial verification (Quantum self-checks before reporting done)

Four failure modes worth checking before claiming done:

1. **Overclaim of convergence.** The local-minima honesty acceptance criterion exists because Section 2 already drifted into implicit global-convergence framing. If Section 3 says "guarantees descent to a stable configuration" without the local-minima caveat in the same paragraph, rewrite.

2. **Level-shift muddiness.** A reader who knows EBM/PD-layer work must finish Section 3 understanding the distinction clearly. Test: imagine a reader saying "isn't this just a PD layer?" — Section 3 must have already answered "no, it's the analogue applied at the control-plane meta-level, not at the weight level."

3. **Implementation leakage.** Section 3 stays at the methodology level. If `yuri-energy`, `computeU`, file paths, or YURI-specific names appear, the proposal has slipped into reference-implementation territory. Section 4's job.

4. **Lost continuity with ICM/MWP.** Section 3 must extend, not detach from, Sections 1–2. The proposal frames itself as "the dynamical-containment layer that ICM/MWP did not yet formalize." Without that thread, Section 3 reads as an unrelated proposal that happens to follow.

### What Quantum returns

A single message containing:
1. Confirmation of file path.
2. Output of the 11 test commands.
3. Four named failure modes considered + verification result.
4. Residual risk statement.
5. Any integration findings (peer-lane neutral voice).

---

## Notes for Marcel (not in the packet)

- This is the paper's core section. If anything fails review, this is the section to re-dispatch with tightened constraints — the surrounding sections depend on Section 3 landing right.
- Pre-flight `bash _SYSTEM/Scripts/ai route-plan "paper-section-draft section 3 the proposal"` is recommended though Quantum noted the gate fires per-lane regardless. For full suppression, Quantum's session would need its own route-plan invocation before Write — worth instructing Quantum to do that itself in this packet's dispatch prompt.
- Dispatch command:
  ```bash
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick — Section 3 of the energy-landscape methodology paper. Full Claude Control Packet at _SYSTEM/reports/claude-output-lane/draft-artifacts/2026-05-28-quantum-section-3-packet.md — read it fully before starting. Run 'bash _SYSTEM/Scripts/ai route-plan paper-section-draft' in your own lane FIRST to clear the protocol-gate WARN. Then write Section 3 (The Proposal, 660-740 words) to _SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md per the packet's 11 acceptance criteria. Apply adversarial self-checks before reporting done. Carry-forward: Section 2 left an implicit global-convergence claim that Section 3 MUST resolve with explicit local-minima honesty. Peer-lane neutral voice throughout." --execute
  ```
- After Section 3 lands, packets 4 (Reference Implementation), 5 (Honest Limitations), 6 (Open Questions) follow. Section 4 will name YURI specifically and ground the proposal in working code.
