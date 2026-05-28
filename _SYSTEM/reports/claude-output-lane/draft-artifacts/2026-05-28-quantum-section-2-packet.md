# Quantum Rick Packet — Conservative State Flows, Section 2 (The Gap)

**Status:** draft, awaiting dispatch
**Drafted by:** Claude (main thread)
**Predecessor:** Section 1 landed at `_SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md` (8/8 acceptance, peer-verified)
**Pre-flight recommended:** `bash _SYSTEM/Scripts/ai route-plan "paper-section-draft"` before dispatch — clears the protocol-gate WARN integration finding from the Section 1 cycle.

---

## CLAUDE CONTROL PACKET

### Goal

Produce Section 2 (The Gap) of *Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment Methodology*. Section 2 takes the closing question of Section 1 ("when structural containment is solved, what governs the dynamics inside it?") and characterizes the gap with mathematical precision — naming the *shape* of the missing mechanism without committing to the specific proposal.

### Section 1 context (do not re-read in full; this is the summary)

Section 1 establishes that ICM/MWP solves *structural* containment elegantly. Para 5 of Section 1 already lists symptoms of the gap (loop, drift, contradictory claims, unverified promotion). Section 2 must NOT just re-list those symptoms — that would be redundant. Section 2's job is to **characterize the gap categorically and mathematically**, giving the reader a precise vocabulary for the problem that Section 3 will then propose a solution to.

### Target files

- **Write:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-2-gap.md`
- **Read for context:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md` (the closing question Section 2 answers)
- **Do not modify:** any other paper section, the brief, the ground-truth audit, or YURI control-plane files.

### Constraints

- **Word count:** 380–420 words. Target ~400. Section 2 has more budget than Section 1 because the gap characterization requires precision.
- **Voice:** continues Section 1's register — declarative, no preamble, operator-readable. Slightly more technical than Section 1, but no jargon thrown without explanation.
- **The structural-vs-dynamical distinction is the spine.** The phrases "structural containment" and "dynamical containment" must each appear at least once. This is the categorical move Section 2 makes that Section 1 did not.
- **Cite the energy-based-models / Potential-Derived (PD) layer inspiration.** Reference the EBM literature as the source domain. Use neutral language: "the energy-based-models literature offers a useful analogue," not "the PD-layer paper proves..." The inspiration is acknowledged; the mechanism transfer is left for Section 3.
- **Name the *shape* of the missing machinery without committing to it.** Section 2 may use phrases like "a Lyapunov-style function," "a conservative vector field constraint," "a gradient with respect to a scalar potential" — but always framed as the *kind* of object that would close the gap, never as "this is what we will build." That commitment is Section 3.
- **No first-person plural ("we", "our", "us").** Same rule as Section 1.
- **Forbidden terms** (Section 3+ territory): `YURI`, `yuri-energy`, `claim-integrity-gate`, `promotion ladder`, `gateProposal`, `computeU`, `ΔU`. The reference implementation is named in Section 4, not Section 2.
- **Peer-lane neutral voice when discussing ICM/MWP and the EBM literature.** Frame the gap as a natural next problem, not as a deficiency.

### Acceptance criteria

1. Word count is 380–420 (inclusive). `wc -w` on the output file.
2. The phrase `structural containment` appears at least once.
3. The phrase `dynamical containment` appears at least once.
4. At least one of: `energy-based`, `EBM`, `Potential-Derived`, `PD layer`, `PD-layer` appears (EBM literature reference).
5. At least one of: `Lyapunov`, `conservative vector field`, `scalar potential`, `gradient descent on` appears (the shape of the missing machinery).
6. The forbidden Section-3+ terms do NOT appear: `YURI`, `yuri-energy`, `claim-integrity-gate`, `promotion ladder`, `gateProposal`, `computeU`, and `ΔU`.
7. No first-person plural pronouns (`we`, `our`, `us`).
8. The opening sentence connects to Section 1's closing question — either by echoing the "dynamics inside it" framing, or by answering "what governs the dynamics" structurally.

### Test command

```bash
F=_SYSTEM/reports/energy-landscape-paper-2026-07/section-2-gap.md
WC=$(wc -w < "$F" | tr -d ' ')
[ "$WC" -ge 380 ] && [ "$WC" -le 420 ] && echo "PASS word-count=$WC" || echo "FAIL word-count=$WC"
grep -c 'structural containment' "$F" | xargs -I {} sh -c '[ {} -ge 1 ] && echo "PASS structural-containment={}" || echo "FAIL structural-containment={}"'
grep -c 'dynamical containment' "$F" | xargs -I {} sh -c '[ {} -ge 1 ] && echo "PASS dynamical-containment={}" || echo "FAIL dynamical-containment={}"'
grep -ciE '(energy-based|EBM|Potential-Derived|PD[ -]layer)' "$F" | xargs -I {} sh -c '[ {} -ge 1 ] && echo "PASS EBM-reference={}" || echo "FAIL EBM-reference={}"'
grep -ciE '(Lyapunov|conservative vector field|scalar potential|gradient descent on)' "$F" | xargs -I {} sh -c '[ {} -ge 1 ] && echo "PASS shape-of-machinery={}" || echo "FAIL shape-of-machinery={}"'
grep -ciE '\b(YURI|yuri-energy|claim-integrity-gate|promotion ladder|gateProposal|computeU)\b' "$F" \
  && echo "FAIL: forbidden Section-3+ term leaked" \
  || echo "PASS: no forbidden Section-3+ term"
grep -cF 'ΔU' "$F" | xargs -I {} sh -c '[ {} -eq 0 ] && echo "PASS no-delta-U" || echo "FAIL delta-U-leak={}"'
grep -ciE '\b(we|our|us)\b' "$F" \
  && echo "FAIL: first-person plural present" \
  || echo "PASS: no first-person plural"
head -c 400 "$F" | grep -qiE '(dynamics|governs)' \
  && echo "PASS opening-connects-to-section-1" \
  || echo "FAIL opening-does-not-connect-to-section-1"
```

All nine checks must pass.

### Rollback boundary

Single file. If the output fails acceptance, delete and re-dispatch:
```bash
rm _SYSTEM/reports/energy-landscape-paper-2026-07/section-2-gap.md
```

### Route-plan classification

- `lane: quantum-rick`
- `scenario: paper-section-draft`
- `tier: focused-implementation`
- `qualityGate: main-session-review`
- `codexPolicy: optional-final-pass`

### Adversarial verification (Quantum self-checks before reporting done)

Three failure modes worth checking before claiming done:

1. **Over-naming the solution.** Section 2 may use the *shape* of the missing machinery (Lyapunov, conservative vector field, etc.) but must not commit to the specific proposal. If a sentence reads like "here's what we will build," it has drifted into Section 3 territory. Rewrite.

2. **Re-listing Section 1's symptoms.** Section 1 already names loop, drift, contradictory claims. Section 2 should *categorize* (structural vs dynamical) not *re-symptomize*. If Section 2 paragraphs read as a longer version of Section 1's gap statement, the categorical move is missing.

3. **Brittle EBM citation.** Cite the EBM literature broadly or by stable conceptual reference. Do not pin to a specific paper title, author surname, or year that may drift. The PD-layer concept is what matters; its provenance can be cited generically.

### What Quantum returns

A single message containing:
1. Confirmation of file path.
2. Output of the 9 test commands.
3. Three named failure modes considered + verification result.
4. Residual risk statement.
5. Any integration findings (peer-lane neutral voice).

---

## Notes for Marcel (not in the packet)

- Pre-flight `bash _SYSTEM/Scripts/ai route-plan "paper-section-draft"` recommended — Quantum flagged the missing route-plan evidence as an integration finding during Section 1. Running route-plan once before dispatch clears the WARN cleanly.
- Dispatch command (when ready):
  ```bash
  node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum --prompt "Quantum Rick — Section 2 of the energy-landscape methodology paper. Full Claude Control Packet at _SYSTEM/reports/claude-output-lane/draft-artifacts/2026-05-28-quantum-section-2-packet.md — read it fully before starting. Goal: write Section 2 (The Gap, 380-420 words) to _SYSTEM/reports/energy-landscape-paper-2026-07/section-2-gap.md per the packet's 9 acceptance criteria and test commands. Apply adversarial self-checks before reporting done. Peer-lane neutral voice throughout. Section 1 closing question is the anchor — read section-1-premise.md first." --execute
  ```
- Expected turnaround: similar to Section 1 (~3 minutes thinking + tests).
- Section 3 (The Proposal) packet will be drafted after Section 2 lands and passes review.
