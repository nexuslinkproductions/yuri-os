# Trading Engine Overview — for the trader review (2026-06-20)

Two formats of the same honest overview of the YURI paper-trading engine.

## `trading-engine-overview.html` ← use this for the call
Open directly in any browser (`open trading-engine-overview.html`). Self-contained (no internet, no app, no setup).
This is the reliable one — it will render identically on any machine.

## `trading-engine-overview.mdx` ← the visual-plan format
Viewable in the [Agent-Native plans app](https://www.agent-native.com/docs/template-plan) in **local-files mode**
(no sharing of engine internals to a hosted DB). Install the viewer skill if not present:
`npx @agent-native/skills@latest add --skill visual-plan --mode local-files`.
The MDX uses visual-plan's documented component conventions (`Callout`, `Columns`, `Card`, `OpenQuestions`);
minor tag-casing tweaks may be needed for pixel-perfect app rendering — the HTML is the source of truth for content.

## What's in it
1. The honest headline — why the tape is red (inverted 0.08:1 reward:risk + no validated edge + short bias).
2. The architecture pipeline (Binance data → 32 factors → ensemble → gates → computeSize → paper → learn loop).
3. The signal problem (32 same-source 1m factors, eff-N≈1; 5 overlays validated 0/5).
4. Sizing & gates (computeSize DISARMED; energy gate advisory; the phantom-edge finding).
5. Evidence — today's tape numbers.
6. Path to real edge (fix RR first; a validating factor; calibrate sizer inputs).
7. Open questions for the reviewer (stop/target, short bias, sizing at $10–15k, edge sources, time horizon).

## Provenance
Every claim is evidenced in the live ledger + `../trading-audit-2026-06-19/` + `../overlay-source-validation-2026-06-20.md`.
Paper-only (INV-1) — no real orders. Living document — flag anything wrong and it gets corrected against the ledger.
