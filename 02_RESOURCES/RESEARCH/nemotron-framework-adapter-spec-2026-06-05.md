# Nemotron Framework Adapter — Prepared Spec (2026-06-05)

> Marcel's idea, prepared: a `NEMOTRON.md`-style adapter that loads the YURI spine into the Nemotron-3-Ultra lane to fight false claims / hallucination. Grounded in the live eval + dispatch guide ([[nemotron-3-ultra-550b-eval-2026-06-04]] · `external-reasoning-lane-dispatch-guide-2026-06-04.md`) and the actual NIM call path. **Advisory until built + owner-greenlit. DEV-ONLY** (Nemotron Ultra is a private building lane, never a shipped YURI surface).

## The honest thesis (read this first)
The thing that fights false claims is **not** the brain transplant — it's the **verification harness**, which is already model-agnostic (the NIM output-rail already tags every Nemotron response `[ADVISORY_HYPOTHESIS_ONLY] [EVIDENCE_MISSING]`). The adapter's job is narrower and real: **make Nemotron's output disciplined enough to be checkable, and grounded enough to hallucinate less** — then let the existing gate do the verifying. It does not make the model honest; it makes its output *gradeable*.

What's already proven (2026-06-04 A/B, identical 63KB briefing): the discipline scaffolds removed symbol-hallucination-as-fact, added per-claim calibration, surfaced genuinely-new findings, and stopped a confident layer-conflation error from recurring. **Measured, not hoped.** This adapter consolidates that one-off into a default.

## The profile it corrects (from the live eval)
Nemotron-3-Ultra = **A− architecture second-brain, C+ source of unverified concrete claims.** Cold, three failure modes — all *grounding + discipline* gaps, not reasoning-capacity, so prompting closes most:
1. Invents function names / import paths the instant it writes code (`projectStateAfter`, `loadCurrentEnergyState` — neither exists).
2. States confident logic errors with no hedge — especially conflating control layers (claimed breaker clock-skew bypasses the veto; false — veto computes in `gateProposal`, independent of the breaker).
3. Pads — re-dresses risks you fed it as "findings" (~8 of 10 were quote-backs).

## The adapter = three layers (not a brain transplant)

### Layer 1 — Discipline preamble (thin, inherit-by-reference)
The 5 scaffolds, consolidated, + persona/authority loaded **by reference** (an adapter "may not restate shared policy or create multi-hop chains" — yuri-origin). This is the ready template below.

### Layer 2 — Grounding (the hallucination-source closers)
- **Symbol inventory** of the real exports of every file the task may touch (auto-generated, snippet below) → kills failure mode #1. Rule: "use ONLY inventoried symbols; anything new tag `[NEW]` + name the file; inventing a plausible name is the worst failure and WILL be checked against live code."
- **Track-A memory handles** relevant to the task injected into the briefing — Track A is *designed* to be shared across lanes. **NEVER Track B** (Claude behavioral self-development; sharing it violates the two-track contract [[feedback-two-track-rule]] + dilutes).

### Layer 3 — Advisory backstop + live-code cross-reference (non-negotiable)
The eval found that, prompting-only, the lane fabricates `file:line` precision. **CORRECTION (verified live 2026-06-05):** the offload lane already exposes `--tools` (`offload-runner.mjs` — `--tools|--no-tools`, a tool-repetition limit, `readFileSync`). In the live wrapper test, Nemotron autonomously **read the actual files** ("Now I have both files") and named `roleSignal` — an internal function introduced in this same session that was **never** in its prompt. So tool-grounding is **partly already present**, not an unbuilt lever: when tools are on, the lane grounds itself on live code instead of guessing. Caveats: (a) the open-ended task **collapsed / hit the tool-repetition limit** mid-analysis once — bound the task + retry-fresh; (b) tool-grounded output is **still advisory** until the active session re-verifies. So the rule stands: **never trust a concrete claim unverified.** Every dispatch wraps in: dispatch → verify each beyond-briefing claim against live code → keep only what survives. The per-claim FALSIFIERS (scaffold 4) ARE the verify checklist; the output-rail's `[ADVISORY_HYPOTHESIS_ONLY]` tag enforces it at display.

## Ready-to-use dispatch preamble (paste/inject — this is the adapter today)
```
You are an external reasoning lane for YURI-OS (Nemotron-3-Ultra, DEV-ONLY). You operate BY the YURI framework: authority = owner intent > local evidence > yuri-origin contract. Your output is ADVISORY until YURI verifies it against live code. Fluency is not verification.

DISCIPLINE (mandatory, every finding + fix step):
1. SYMBOL GROUNDING — use ONLY symbols in the SYMBOL INVENTORY below or an organ's stated Mechanisms. Anything you'd add: tag [NEW] and name the file. Never reference an unverified symbol — inventing a plausible name is the worst failure and will be checked against live code.
2. NEW vs RESTATED — the briefing's Known-risks are KNOWN. Tag each finding [NEW] (cross-organ inference, in no risk list) or [RESTATED]; drop the restated.
3. TRACE BEFORE ASSERT — before claiming a contradiction/bug/bypass, trace BOTH sides to the exact mechanism; confirm they sit on the SAME control layer and actually interact; else downgrade to OPEN QUESTION.
4. PER-CLAIM TAG — end every finding/fix with: CONFIDENCE: high|medium|low · BASIS: direct-from-briefing | cross-organ-inference | speculative · FALSIFIER: <one observation that would disprove it>.
5. REASONING — reason step by step internally; spend output only on verified conclusions; no padding, no flattery, no restating the prompt.

SYMBOL INVENTORY:
<auto-generated, real exports only>

RELEVANT YURI CANONICAL TRUTH (Track-A handles):
<injected canonical facts the task depends on>

BRIEFING (faithful, evidence-tagged organ digests):
<...>

TASK:
<...>
```

## Symbol-inventory generator (real exports, zero hallucination surface)
```bash
for f in <files-the-task-may-touch>; do
  syms=$(grep -oE "^export (async function|function|const|class) [A-Za-z0-9_]+" "$f" \
    | sed -E 's/^export (async function|function|const|class) //' | sort -u | paste -sd', ' -)
  printf '%s :: %s\n' "$f" "${syms:-(no named exports)}"
done
```

## Dispatch hygiene (NIM lane — load-bearing)
- **`LANE_FRESH=1` always** for a clean run — the NIM lane persists per-model history (`_SYSTEM/state/lane-sessions/<provider>_<model>__default.jsonl`) and PREPENDS it (`offload-runner.mjs:1922`); without fresh, a re-run rehashes its own prior answer (contamination).
- Prompt travels via env (`OFFLOAD_PROMPT_TEXT`, `offload.sh:210`) so 60-70KB briefings don't stall as args. `--model` sets `PULSE_LANE_BYPASS=1` (skips the stdin classifier).
- **Retry once on generation collapse** — a 550B long-reasoning run can collapse into token garbage mid-output; transient, retry fresh before judging quality.
- Call path (zero integration cost, passthrough exists at `offload.sh:366`):
  `LANE_FRESH=1 _SYSTEM/Scripts/ai offload --model "nvidia/nemotron-3-ultra-550b-a55b" "$(cat /tmp/prompt.txt)"`

## The moat — cross-model triangulation
Once Nemotron emits the **same** per-claim grammar (confidence/basis/falsifier) through the **same** advisory gate, you get what one lane can't do alone: **two independent models forced to agree on the same local evidence.** Claude (or the verify loop) takes Nemotron's FALSIFIERS and checks each against live code; a claim only survives if it's reproducible, not merely fluent. The adapter is the enabler; the triangulation is the payoff — and it only works *because* the gate is model-agnostic.

## Build roadmap (what "build it" means, in order of leverage)
1. **`ai nemotron` wrapper** (`nemotron-dispatch.mjs`) — takes `<task>` + `<files-it-may-touch>`, auto-generates the symbol inventory, assembles the preamble (scaffolds + persona-by-reference + injected Track-A handles), dispatches with `LANE_FRESH=1`, and extracts the per-claim FALSIFIERS into a ready verify checklist. Turns the hand-assembled preamble into a default. *Effort: S/M, low risk (wraps existing passthrough).*
2. **Tool-grounding — mostly ALREADY PRESENT, wire it through (revised after the live test).** The offload lane already supports `--tools` and the model read live files unprompted. So this is no longer a from-scratch build — it is: (a) have the wrapper **pass `--tools` explicitly** for grounded dispatch (don't rely on a default); (b) **bound the tool-loop** (the open-ended run hit the repetition limit / collapsed — cap the task, retry fresh once); (c) verify the grounding actually closes `file:line` fabrication on a controlled task. Smaller lift than the original spec assumed.
3. **Optional — register `@nvidia-nemotron-ultra` as a named lane** (dispatch token + `offload.sh` case + contract live registry + `ai` facade help) so it's first-class, not passthrough-only.

## Honest boundaries (what this does NOT do — keep it sober)
- **Does not reduce hallucination by itself.** The gate + the live-code verify loop do. The adapter makes output checkable + grounded; it is not a truth serum.
- **The laundering risk** — a YURI-fluent Nemotron dresses hallucinations in the evidence grammar, making them *harder* to spot (same class as today's lexical-as-structural + completeness-over-truncated-engine bugs). Mitigation: voice/format must NEVER imply trust; advisory stays hard; the FALSIFIER checklist is mandatory, not decorative.
- **file:line precision** is fabricated when tools are OFF; with `--tools` the lane grounds on live code (verified 2026-06-05) but the output is **still advisory** — never accept a concrete location unverified regardless.
- **the lane can collapse / hit the tool-repetition limit** on open-ended tasks (observed live) — bound the task, retry fresh once before judging quality.
- **Track-A only, never Track-B.** **Bounded-dispatch, not brain-inject** (brain-inject is volatile session state for a standing PTY lane; a Nemotron dispatch is a packet). **DEV-ONLY** — never a shipped surface.

## SEE
- [[nemotron-framework-adapter-idea]] (the decoded take) · [[nemotron-3-ultra-lane-live]] · [[feedback-two-track-rule]] · [[completeness-cert-needs-total-counts]]
- `02_RESOURCES/RESEARCH/nemotron-3-ultra-550b-eval-2026-06-04.md` · `external-reasoning-lane-dispatch-guide-2026-06-04.md`
