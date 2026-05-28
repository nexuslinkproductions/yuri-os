# Opus Prime Packet: Energy Dashboard Revision Brief

## Dispatch

Prime, review the current energy landscape dashboard as an editorial and visual
artifact. Return a revision brief only. Do not edit files.

Primary file:

- `_SYSTEM/reports/energy-landscape-paper-2026-07/energy-landscape-dashboard.html`

Supporting context:

- `_SYSTEM/reports/energy-landscape-paper-2026-07/00-evidence-plan.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/01-sandbox-simulation-architecture.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/04-operator-decisions.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/05-quantum-a1-telemetry-packet.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/section-3-proposal.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/section-4-reference-implementation.md`
- `_SYSTEM/reports/energy-landscape-paper-2026-07/section-5-honest-limitations.md`
- `_SYSTEM/Scripts/math/yuri-energy.mjs`

## User Signal

The first dashboard draft works and the new visual models are strong. The next
revision should make the artifact less developer-ish and less self-explanatory
in an AI-generated way.

Keep the useful control-room feel, but make the reading path sharper:

- less "look, here is a cool visual model"
- less generic explanatory copy
- more evidence-bearing structure
- more direct orientation for Marcel's actual work
- dark mode remains the default
- visuals should clarify what is operational, what is simulated, and what is
  still schematic

Critical added requirement: the weight controls cannot just show names like
alpha, beta, gamma. They must explain what the weights are, what they multiply,
which direction they push U, and why their magnitude matters.

## Weight Clarification Requirement

The dashboard currently exposes weight names and values, but the reader needs
the actual meaning. The revision should add a plain-English weight explainer
that makes the scoring mechanism legible.

Canonical default weights from `_SYSTEM/Scripts/math/yuri-energy.mjs`:

| Weight | Value | Multiplies | Direction | Meaning |
| --- | ---: | --- | --- | --- |
| alpha | 1.0 | entropy(claimPromotionDistribution) | raises U | Uncertainty about claim promotion status. |
| beta | 2.0 | klDivergence(claimed, verified) | raises U | Drift between claimed state and verified evidence. |
| gamma | 1.0 | logLoss(predictions, outcomes) | raises U | Forecast calibration penalty. |
| delta | 1.0 | brierScore(forecasts, results) | raises U | Forecast accuracy penalty. |
| epsilon | 1.0 | -informationGain(prior, posterior) | lowers U when evidence improves state | Reward for genuine information gain. |
| zeta | 0.5 | sum(staleness) | raises U | Penalty for stale evidence dragging the state upward. |
| eta | 100.0 | protectedPathViolations | raises U sharply | Catastrophic penalty for protected-path violations. |
| theta | 10.0 | promotionLadderInversions | raises U sharply | Penalty for skipping or inverting the promotion ladder. |
| iota | 0.1 | -verifiedEvidenceCount | lowers U when evidence is verified | Small credit for verified evidence volume. |

Plain-language rule:

`U = weighted penalties - weighted evidence credits`

The gate accepts a proposed transition when `Delta U <= 0` and rejects it when
`Delta U > threshold`, unless an operator override is explicitly allowed.

Important limitation:

These weights are hand-tuned operator policy, not learned model parameters and
not a mathematical proof of semantic correctness. The dashboard should say this
cleanly without apologizing for it.

## Requested Output

Return a compact revision brief with these sections:

1. Top-line verdict on the dashboard.
2. New reading path: section order, section titles, and what each section does.
3. Copy cuts: what text should be deleted because it sounds explanatory,
   generic, or decorative.
4. Copy replacements: specific replacement lines for the hero, geometry model,
   weight explainer, scenario panel, telemetry parser, and workstream map.
5. Visual model critique: how to make the conservative/unconstrained field and
   landscape visuals feel like evidence instruments, not decoration.
6. Weight explainer design: exact UI recommendation for showing value,
   component, direction, effect, and operator-tuned status.
7. Priority implementation checklist for Codex.
8. Do-not-change list: anything the dashboard currently gets right and should
   preserve.
9. Residual risk: anything the dashboard could accidentally overclaim.

## Constraints

- Do not edit files.
- Do not commit or push.
- Do not read protected runtime or secrets.
- Do not call live external services.
- Do not use Canva or Figma.
- Keep the output actionable for Codex implementation.
- Keep the voice peer-lane neutral.
- Keep the brief around 120 lines or less.

