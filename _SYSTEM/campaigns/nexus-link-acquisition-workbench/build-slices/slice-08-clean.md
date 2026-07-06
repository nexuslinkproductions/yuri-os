# Slice 08 — Clean

## Goal
Block any draft with leaked template tokens before send. A leak is a **hard, non-negotiable block** — the same class of veto as a compliance violation.

> **Metric this slice computes:** none — and that is correct. Cleaning is a **binary gate**, not a ranked or scored quantity. It is the leak-side twin of the U governor's non-offsettable veto (`11-math-models.md` §6.4): no lead value, no EVH, no "but these are great leads" can buy a leaked draft past this gate.

## Inputs
- `leads/drafted/<id>.json`

## Outputs
- validated drafts (or blocked with reason)

## Spec
1. Scan each draft for un-replaced tokens: `{name}`, `{specific_artifact}`, etc.
2. Detect fallback leakage ("Hi there", "INSERT X").
3. **Any leak → hard block + reason.** Non-offsettable: this gate never weighs the leak against the lead's EV. A high-EVH lead with a leaked `{name}` is blocked exactly as hard as a worthless one.
4. Pass → mark clean.

## Why it is a veto, not a score (ties to §6.4)
The math spec's U governor uses a non-offsettable hard veto for protected-path / compliance violations — no amount of verified-evidence credit overrides it. Template leakage is the deliverability/credibility equivalent: a leaked token destroys the specificity premise the entire campaign is built on, so it gets the same treatment — block, do not discount. This is the **silent killer**.

## Patterns
`\{[a-z_]+\}`, "Hi there", "INSERT", placeholder text.

## Done-test
- Blocks 100% of leaked tokens.
- A high-value lead with a leaked token is blocked identically to a low-value one (veto is value-blind).

## THE DECISION IT DRIVES
Send vs. hard-block on credibility grounds — a binary gate that ranking can never override.
