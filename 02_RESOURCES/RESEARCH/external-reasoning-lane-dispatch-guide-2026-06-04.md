# External Reasoning-Lane Dispatch Guide (Nemotron 3 Ultra + generic)

Reusable template for dispatching hard architecture/security reasoning to an external reasoning lane (Nemotron 3 Ultra, and generically any large cloud reasoning model) and getting trustworthy output. DEV-ONLY (per owner: Nemotron Ultra integration is a private building lane, never shipped YURI surface).

Proven 2026-06-04 by an A/B on the same 63KB YURI full-package task: the scaffolds below removed symbol-hallucination-as-fact, added per-claim calibration, surfaced genuinely-new findings, and stopped a confident layer-conflation error from recurring. See [nemotron-3-ultra-550b-eval-2026-06-04.md](nemotron-3-ultra-550b-eval-2026-06-04.md).

## The profile this corrects

A strong cloud reasoner is an A− architecture second-brain and a C+ source of unverified concrete claims. Cold, it (1) invents function names/paths the instant it writes code, (2) states confident logic errors with no hedge (esp. conflating control layers), (3) pads — re-dresses risks you fed it as "findings." None of (1)-(3) are reasoning-capacity limits; they are grounding + discipline gaps, and prompting closes most of them.

## Five discipline scaffolds (paste into the dispatch preamble)

1. **SYMBOL GROUNDING.** Provide a SYMBOL INVENTORY of the real exports of every file it may reference. Rule: "use ONLY symbols in the inventory or an organ's Mechanisms; anything you'd add, tag `[NEW]` and name the file; never reference an unverified symbol — inventing a plausible name is the worst failure and will be checked against live code." → kills symbol-hallucination-as-fact.
2. **NEW vs RESTATED.** "The briefing's Known-risks lists are KNOWN. Tag each finding `[NEW]` (cross-organ inference not in any risk list) or `[RESTATED]`, and drop the restated ones." → kills padding; surfaces real novelty.
3. **TRACE BEFORE ASSERT.** "Before claiming a contradiction/bug/bypass, trace BOTH sides to the exact mechanism and confirm they sit on the SAME control layer and actually interact; else downgrade to an OPEN QUESTION." → kills confident layer-conflation errors.
4. **PER-CLAIM EPISTEMIC TAG.** Every finding + fix step ends with: `CONFIDENCE: high|medium|low · BASIS: direct-from-briefing | cross-organ-inference | speculative · FALSIFIER: <single observation that would disprove it>`. → makes its calibration legible; falsifiers become your verify checklist.
5. **REASONING.** "Reason step by step internally; spend output only on verified conclusions; no padding/flattery/restating the prompt." (These are YURI's own evidence-grammar + claim/evidence-separation + adversarial-verification floor, exported to the external lane.)

Then provide: SYMBOL INVENTORY block, the FULL PACKAGE briefing (faithful, evidence-tagged organ digests), the task.

## Generate the symbol inventory (real exports, no hallucination surface)

```bash
for f in <files-the-task-may-touch>; do
  syms=$(grep -oE "^export (async function|function|const|class) [A-Za-z0-9_]+" "$f" \
    | sed -E 's/^export (async function|function|const|class) //' | sort -u | paste -sd', ' -)
  printf '%s :: %s\n' "$f" "${syms:-(no named exports)}"
done
```

## Dispatch hygiene (NIM lane)

- **ALWAYS `LANE_FRESH=1`** for a clean eval. The NIM lane persists per-model history (`_SYSTEM/state/lane-sessions/<provider>_<model>__default.jsonl`) and PREPENDS it as context (`offload-runner.mjs:1922`). Without `LANE_FRESH=1` a "re-run" sees its own prior answer and rehashes it — A/B contamination. (Also `--no-session` / `--no-lane-session` exist.)
  ```bash
  LANE_FRESH=1 _SYSTEM/Scripts/ai offload --model "nvidia/nemotron-3-ultra-550b-a55b" "$(cat /tmp/prompt.txt)"
  ```
- **Prompt travels via env** (`OFFLOAD_PROMPT_TEXT`, `offload.sh:210`), so large briefings (60-70KB) don't stall as args. `--model` sets `PULSE_LANE_BYPASS=1` (skips the stdin classifier).
- **Retry on generation collapse.** A 550B long-reasoning run can collapse into degenerate token garbage mid-output (observed once at ~8.6KB into a 31KB answer). It's transient — retry fresh once before concluding anything about quality.

## The non-negotiable backstop

Scaffolds raise signal and kill hallucination-as-fact, but the lane STILL fabricates file:line precision (it guesses line numbers it cannot know). Only tool-grounding (giving it grep/read) fixes that — not prompting. So: **never trust a concrete claim or patch unverified.** Always wrap the dispatch in a live-code cross-reference loop — dispatch → verify every beyond-briefing claim against live code → keep only what survives. The per-claim FALSIFIERS (scaffold 4) are your ready-made checklist.

## Measured lift (2026-06-04 A/B, fresh sessions, identical briefing/task)

| Dimension | Baseline (no scaffolds) | Scaffolded |
|---|---|---|
| Invented symbols presented as real | yes (untagged) | none — explicit `[NEW]` table vs "already exported" |
| Per-claim confidence/basis/falsifier | absent | on all 8 findings + 6 failure modes |
| New vs restated legible | no | self-labeled per finding |
| Confident layer-conflation error | present in priming run | did not recur (traced to correct layer) |
| Genuinely-new mechanism finding | padding-heavy | yes (e.g. verifiedEvidenceCount double-count across tool-event + claim axes) |
| Fabricated file:line precision | yes | STILL yes (prompting ceiling; needs tool-grounding) |
