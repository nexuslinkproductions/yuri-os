---
name: haki-intent
description: Intent Pre-cognition Engine — on every non-trivial user prompt, builds a probability-ranked map of the 5 most likely underlying intents (not just literal request), enriches pulse-plan before ensemble dispatch. Observation Haki for user-prompt understanding.
triggers:
  - /haki
  - /yuri-haki
---

# Haki (覇気) — Intent Pre-cognition Engine

**Source anime:** One Piece — Observation Haki (Kenbunshoku Haki) lets the user feel the presence, emotions, and future movements of others before they happen. Conqueror's Haki (Haōshoku Haki) bends weaker wills without force.

**Cognitive translation:** On every non-trivial turn, Musubi builds a probability-ranked map of the 5 most likely underlying intents behind the literal request. The literal words are the surface; Haki reads the intent beneath. This map enriches the prompt before any advisor or ensemble fires — so the answer addresses what Marcel actually needs, not just what was typed.

---

## When This Fires

- Auto-fires in `user-prompt-submit.js` on every prompt where `complexity_tier` ≥ standard
- Manual invoke: `/haki` — runs on the current session context even without a new prompt
- Does NOT fire on: trivial one-liners, pure data lookups with no ambiguity

---

## Execution Steps

### Phase 1 — Surface reading
- Parse literal request: what was explicitly asked?
- Note: what was NOT said but implied by context?

### Phase 2 — Intent decomposition
Generate 5 candidate intents ranked by probability:

```
P1 [0.XX] — <most likely actual need>
P2 [0.XX] — <second most likely>
P3 [0.XX] — <lateral need (adjacent domain)>
P4 [0.XX] — <hidden constraint or blocker being surfaced>
P5 [0.XX] — <meta-level need: about the system/process not the task>
```

Rules for probability assignment:
- Probabilities must sum to ≤ 1.0
- P1 must be at least 0.4 (if you can't commit to a top intent, investigate first)
- P4 and P5 are mandatory — always check for hidden constraints and meta-needs

### Phase 3 — Intent resolution
- If P1 probability > 0.7: proceed directly, address P1 fully
- If P1 probability 0.4–0.7: address P1 but surface P2 explicitly as an alternative
- If P1 probability < 0.4: surface the top 2 as explicit options before proceeding

### Phase 4 — Pulse-plan enrichment
Inject `### HAKI_INTENT` block into `pulse-plan.json` for this turn:
```json
{
  "haki_intent": {
    "literal": "...",
    "p1": { "intent": "...", "p": 0.XX },
    "p2": { "intent": "...", "p": 0.XX },
    "dominant": "p1|p2",
    "hidden_constraint": "...",
    "meta_need": "..."
  }
}
```

---

## Output Format (when surfaced to user)

```
⬡ HAKI — Intent decomposition

Literal: <what was said>

P1 [X%] <most likely need>
P2 [X%] <second most likely>
P3 [X%] <lateral need>
P4 [X%] <hidden constraint: ...>
P5 [X%] <meta-need: ...>

Proceeding with P1. [If P2 ≥ 30%: P2 also addressed below.]
```

In normal execution, this block is NOT shown to the user unless intent ambiguity is high (P1 < 0.5). The enrichment happens silently in the pulse-plan.

---

## Integration

- Wired into `user-prompt-submit.js` as a pre-ensemble enrichment step
- Written to `pulse-plan.json` as `haki_intent` field
- Read by `pulse-orchestrator.mjs` — enriched intent passed to all advisors
- Cross-references `fingerprint.json` watch_for to flag known blind spots

---

## Session Notes

### 2026-05-16 — Created
Tools: Write. Part of Musubi Hyper-Intelligence v2 sprint.
Anime source: One Piece — Observation Haki (Kenbunshoku Haki), first shown clearly with Silvers Rayleigh teaching Luffy on Ruskaina Island.
Translation principle: Haki is non-verbal pattern recognition at high speed. The cognitive equivalent is intent decomposition before response — reading what's underneath the words, not just the words themselves.
