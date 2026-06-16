# CONTROL PACKET — W4 dashboard surfacing (Sonnet agent)

GOAL: Surface the new Wave-4 telemetry in the existing Observatory dashboard — the quantum factor-circuit ordering, the perp + social OVERLAY signals (visually distinct from price signals), and confirm Polymarket markets render. Pure VIEW work; do NOT touch backend `.mjs` files.

USE SKILLS: load `.claude/skills/frontend-design/SKILL.md` (self-contained CSS, NO HUD/Kagami `--yuri-hud-*`/`--yuri-kagami-*` tokens — BANNED) and `.claude/skills/viz-lab/SKILL.md` (for the QSphere real-data feed). Self-contained purpose-built CSS only.

GROUND FIRST (read before editing):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md §4 (NO HUD/Kagami tokens) + §8 (REST/SSE contract).
2. The dashboard you extend (read all):
   - _SYSTEM/src/hooks/useObservatoryStream.ts — the typed snapshot + SSE hook (normalizes server fields).
   - _SYSTEM/src/components/observatory/MechanismTab.tsx — factor signals / regime / energy panels (where circuit + overlays go).
   - _SYSTEM/src/components/observatory/MarketsTab.tsx — candles + paper table (confirm Polymarket markets render).
   - _SYSTEM/src/components/observatory/MindTab.tsx + _SYSTEM/src/scenes/QSphereScene.tsx — 3D.
   - _SYSTEM/src/components/observatory/observatory.css — self-contained styles.

NEW SNAPSHOT SHAPE (the server now emits these — match EXACTLY):
- Per market `snap.circuit` (nullable): `{ ratio:number|null, allCommute:boolean|null, bestOrdering:number[]|null, factorIds:string[], injected:boolean, degenerate:boolean }`.
  - SSE event: `{ type:'circuit.state', market, ratio, allCommute, bestOrdering, factorIds, injected, ts }`.
  - MEANING: `ratio>1` = a genuine NON-COMMUTATIVE order advantage exists (sequencing the factors in `bestOrdering` beats order-blind by (ratio-1)); `ratio==1` / `allCommute=true` = factors commute, no ordering advantage (the engine refuses to fake one); `injected=true` = computed on REAL return vectors (not metadata).
- `snap.signals[]` now includes OVERLAY signals alongside price signals. Distinguish by `factorId` prefix + optional `source` field:
  - price: `obs-momentum-*`, `obs-vol-regime-*` (drive paper P&L)
  - perp overlay: `perp-funding-carry-*`, `perp-basis-*` (`source:'perp'`) — advisory positioning, NOT paper-traded
  - social overlay: `social-sentiment-*` (`source:'social'`, has `sampleCount`) — advisory, NOT paper-traded
- Polymarket markets appear in the markets map with `venue:'polymarket'` and a `question` field (key `poly-<tokenId>`).

REQUIREMENTS:
- MechanismTab: add a **Factor Circuit** panel per market showing ratio (formatted, e.g. "1.67× order advantage" when >1, "commuting — no order edge" when ==1/allCommute), the `bestOrdering` as the factorId sequence, and an `injected` (real-vectors) indicator. Keep it compact, dark, readable.
- MechanismTab signals list: visually tag overlay signals (perp/social) distinctly from price signals (e.g. a small "PERP"/"SOCIAL" chip + a muted style) and label them "advisory — not paper-traded".
- MarketsTab: confirm Polymarket markets render (question as title, last price as odds 0–1). If they already do, state that; if not, add minimal rendering.
- QSphereScene (optional, if clean): feed it the real `factors` (side+confidence) from the live snapshot if not already.
- Update the hook's TypeScript types for `circuit` + the overlay `source`/`sampleCount` fields so `tsc` stays clean.
- NO new npm dependency. NO HUD/Kagami tokens.

ACCEPTANCE: `npm run build` (tsc && vite build) GREEN. All 3 tabs still render; MechanismTab shows the circuit panel + tagged overlay signals.

TEST CMD: `npm run build`
ROLLBACK: revert the edited _SYSTEM/src files.
AFTER: run `npm run build`; report PASS/FAIL + exact tsc/vite result + a ≤8-line summary of what you added + which files changed. Do NOT git commit.
