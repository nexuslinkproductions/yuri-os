# Sales Signal Model

advisory_only: true
local_truth_claim: false

## Principle

Buyer behavior is evidence. So is missing behavior. Yuri must weigh positives, negatives, omissions, and silence separately.

## Positive Signals

| Signal | Meaning | Caution |
|---|---|---|
| Praise | Emotional approval, taste fit, trust lift | Praise is not budget or authority |
| Implementation questions | Buyer is mentally simulating ownership | Still verify decision path |
| Fast replies | Attention and priority | May reflect urgency, not commitment |
| Future-tense language | Buyer imagines a future with the offer | Clarify timeline and next action |
| Voluntary detail | Trust and engagement | Do not over-read if decision criteria absent |
| Referral/intro language | Advocacy energy | Protect quality; do not harvest referrals prematurely |
| Budget openness | Commercial readiness | Anchor scope before negotiating price |
| Emotional lift | Positive state shift | Avoid closing if buyer is merely excited but ungrounded |

## Omission Signals

| Omission | Risk | Next Move |
|---|---|---|
| No budget language | Economic feasibility unknown | Ask practical budget range or value threshold |
| No decision-maker mention | Authority gap | Ask who else must weigh in |
| No timeline | Priority unclear | Ask when the outcome becomes useful |
| No pain ownership | Motivation weak | Ask what happens if nothing changes |
| No curiosity | Low engagement or hidden objection | Ask what feels unclear or irrelevant |
| No competitor mention | Market context unknown | Ask what alternatives are being considered |
| No objection | Could mean alignment, politeness, or disengagement | Check for hidden concerns |
| Silence after price | Possible threat response, calculation, or disengagement | Pause, then invite the real concern |

## Negative Signals

Negative signals include fear, distrust, resentment, scope confusion, price shock, evasiveness, status threat, autonomy threat, and lack of internal champion behavior. Negative signals do not mean "push harder"; they usually mean clarify, slow down, or disqualify.

## Fan-Energy Signals

Raving-fan potential appears when customers:

- use identity language around the offer
- praise the experience without prompting
- ask how to expand or repeat the service
- introduce others
- defend the value internally
- notice delivery details
- compare the experience favorably against prior providers

Fan-energy is not harvested. It is earned through a designed experience that keeps promises.

## Signal Scoring Defaults

| Score | Meaning |
|---|---|
| `positiveMomentum` | Sum of praise, curiosity, future language, implementation questions, fast response, referral energy |
| `omissionRisk` | Sum of missing budget, authority, timeline, pain ownership, curiosity, emotional response |
| `buyerReadConfidence` | Confidence that Yuri has enough signal to recommend a move |
| `downsideRisk` | Risk of harm, pressure, misread, bad fit, or premature close |

If signal data is thin, Yuri must recommend discovery, not persuasion.
