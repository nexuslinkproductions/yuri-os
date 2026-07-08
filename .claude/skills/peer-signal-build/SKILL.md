---
name: peer-signal-build
description: Curated recipe for a PEER LANE (native Sonnet agent OR ollama nano-swarm) to build ONE alpha-factor-library signal/scoring/analysis module for the crypto trading engine — exact contract, signal interface, fail-open discipline, --test, capability tag, read-live-sigs, verify-locally, terse-data return. Use when dispatching a peer to build or extend an AFL module so the contract is not re-written each time.
triggers:
  - /peer-signal-build
  - dispatch a peer to build a signal module
  - build an AFL signal or scorer with a peer lane
  - nano-swarm signal module build
  - peer lane quant module recipe
scope: instance
invocation: ability
---

# peer-signal-build — peer recipe for building one AFL module

A curated, reusable CONTRACT the operator lane hands to a peer instead of hand-writing it each dispatch.
Two consumption modes (same source):
- **Native Sonnet agent** (`Agent` tool): the dispatch prompt says *"Follow `.claude/skills/peer-signal-build/SKILL.md`"* + the task deltas (which module, which file). The agent reads this file.
- **ollama nano-swarm lane** (`ai llm ollama-cloud --model X:cloud`): inject the BODY below as the procedure preamble (lanes have no filesystem) + the task deltas.

The operator lane (me) still supplies the DELTAS per task: module name, target file, what it computes, which rung/market. This skill supplies everything that is the SAME every time.

## ROLE (give this to the peer verbatim)

You are a first-class quant peer building ONE module for the YURI alpha-factor-library. Terse, concrete, skeptical. Your final message is DATA for the operator lane, not a human report — no preamble, no "I'll", return facts. Build only the one file you are told to; do not edit anything else.

## THE CONTRACT (the stable recipe)

1. **One file**, at the exact path given. Create only it.
2. **Signal shape** (when the module emits signals) MUST match the live AFL convention exactly:
   `{ factorId, value, side, confidence, ts, source }` — `side ∈ {'long','short'}`, `confidence` capped LOW for advisory overlays (≤ 0.65–0.70), `ts` in unix SECONDS.
3. **Pure mappers exported** for unit test; the ONE data-bound entry isolated and deterministic given injected inputs. No hidden globals.
4. **Fail-open**: the top-level entry returns `[]` / a safe empty result on ANY error (never throws out of the cycle). Guard NaN / zero-variance / <N-points / divide-by-zero.
5. **`--test`** self-contained, deterministic, NO network, NO real files (use injected data + `/tmp`). Cover: happy path, the inversion/edge case, sub-threshold → empty, NaN/Inf → safe, confidence cap. Print `<name> --test: N pass, M fail`; `process.exit(1)` on any fail. Guard the main block with `import.meta.url === pathToFileURL(process.argv[1]).href`.
6. **Capability tag** at byte 0 (after an optional `#!/usr/bin/env node`), in this CONTIGUOUS order — the scanner reads only 12 lines past `@capability` and needs `@exports` inside the cluster:
   ```
   // @capability: <kebab-id>
   // @serves: <need phrase> | <synonym> | <words someone would search>
   // @does: <one line>
   // @use: <one line>
   // @exports: fnA, fnB, fnC
   ```
7. **Match the idiom** of the sibling you are told to mirror (read it first): the `isNum` guard, terse JSDoc, fail-soft returns, the `_main` CLI guard pattern.

## HARD INVARIANTS (non-negotiable)

<!-- @anchor: v1 | failure: proj-alpha-factor-library-2026-06-13 (design-doc sigs were WRONG; built against verified organ sigs) + horizon-ladder false-empty path bug 2026-06-17 | regression: this skill + end-to-end seam test in the dispatching lane -->
- **READ LIVE SIGNATURES FROM SOURCE — never hardcode an interface from a design doc or memory.** Open the file you import from, confirm the exact export names + arg shapes, THEN call them. Design docs and memory drift; the source is truth.
- **INV-1 paper/analysis only** — no order path, no POST, no live mutation. Most AFL modules are pure math on injected data.
- **INV-2 no secret reads** — never read `.env` / keychain / credentials. Network (if any) routes through the adapter's injected `setHttpGet`.
- **No `--yuri-hud-*` / `--yuri-kagami-*` design tokens** anywhere (irrelevant to logic modules, but standing).

## VERIFY BEFORE RETURNING (the peer does this, then the operator RE-verifies)

<!-- @anchor: v1 | failure: feedback-nano-swarm-orchestration (lanes over-claim: 18/19 reported 19/19; NS2 went 0/4) + ladder agent reported "all rungs empty" on a path bug 2026-06-17 | regression: feedback-nano-swarm-orchestration -->
- Run `node <yourfile> --test` from the repo root and confirm ALL pass. Paste the pass/fail line.
- If the module reads the real ledger/state, run it once read-only and paste the summary (so the operator can sanity-check against known reality, e.g. empty-rung honesty).
- Return: test pass/fail counts, exact `@exports`, and ONE example output object.

**Operator-lane duty (me, after the peer returns):** RE-VERIFY locally — peers over-claim. Re-run `--test`, sanity-check claims against live data (a peer's "all empty" or "all pass" is a hypothesis), grep the actual code for the seam, and run an end-to-end seam test before trusting it. A green peer report is not evidence; my local run is.

## Anti-rationalization

| Excuse | Reality |
|--------|---------|
| "The design doc / memory gives the signature, I'll use that." | Docs drift. The AFL design-doc sigs were wrong (2026-06-13). Read the source export line. |
| "The peer's `--test` passed, so it's correct." | `--test` uses synthetic /tmp data and never exercises the real STATE path — the ladder agent's CLI had a path bug its 33 green tests missed. Re-verify on real data. |
| "The peer said all rungs/strategies were empty/passing." | Lanes over-claim (18/19→reported 19/19). Verify the claim against your own run before acting. |
| "It's advisory-only, correctness matters less." | Advisory signals feed the learn ledger; a look-ahead leak there manufactures phantom edge. Same rigor. |
| "Skip the seam test, the unit tests cover it." | Unit tests cover the function; the SEAM (signal → recordForecasts → ledger → scorer) is where wiring breaks. Test the chain. |

## Red flags (stop and re-check)

- A signature you "remember" instead of one you read this session.
- A `--test` that touches no real path and a claim about real-data behavior.
- A peer report with no pasted `--test` line or example output.
- Any code path that can throw out of the live cycle.
- A signal that uses future data relative to its `ts` (look-ahead leak).

## Session Notes

### 2026-06-17
- tools used: Agent (Sonnet ×2), Read, Edit, Bash, capability-scan
- origin: extracted from 2 same-session peer dispatches (cross-asset-signal.mjs, horizon-ladder.mjs) that shared an identical hand-written contract.
- corrections caught: ladder agent's CLI used a wrong STATE path (`'..','state'` vs `'..','..','state'`) → falsely reported all rungs empty; its 33 synthetic tests missed it. Reinforced the read-live-sigs + re-verify-on-real-data invariants.
- errors: none in the skill itself (first version).
- notes: serves both native Sonnet agents (file-load) and ollama lanes (prompt-inject). Pairs with `peer-redteam` (adversarial review recipe, planned next).
