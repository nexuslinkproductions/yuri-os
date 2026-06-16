---
name: nen-phase-detector
description: "Adaptive phase specialization that sets the work-phase mode (deep_code, design, strategy, research, admin, rest) to tune depth, verbosity, and approach to match what the current phase needs. Use when starting a new work phase, when the user says \"/nen deep_code\", \"switch to research mode\", \"I need strategy thinking\", or when the task type changes and the approach needs realignment."
invocation: model
triggers:
  - /nen
  - /yuri-nen
---

# Nen (念) — Adaptive Phase Specialization

**Source anime:** Hunter × Hunter — Nen is personal life energy (aura) shaped by willpower into 6 categories (Enhancement, Emission, Manipulation, Conjuration, Transmutation, Specialization). Each person has a natural category; forcing the wrong one is inefficient. Mastery means knowing your type and training within it.

**Cognitive translation:** Musubi detects Marcel's current work phase from session context signals and auto-configures its behavior — ensemble composition, lane priority, verbosity, depth — to match what that phase actually requires. Forcing research-mode behavior onto a deep-code session wastes energy. Forcing code-mode behavior onto a strategy session misses the point.

---

## Phase Map

| Nen Phase | Signals | Ensemble | Depth | Lane priority | Verbosity |
|-----------|---------|----------|-------|--------------|-----------|
| `deep_code` | Recent commits: code; files: .ts/.py/.mjs; task: fix/implement | Codex-first + DeepSeek-flash | max | gpt-5.5 → deepseek-v4-flash | low (code, not prose) |
| `design` | Files: .html/.css/.tsx; keywords: UI/UX/layout/visual | design-master + DeepSeek-pro | max | deepseek-pro → codex-spark | medium |
| `strategy` | Keywords: architecture/roadmap/decision/plan | 6-advisor ensemble + Shura | max | deepseek-pro → shura | high |
| `research` | Keywords: research/investigate/scan/find out | knowledge-scout + DeepSeek-flash | medium | deepseek-flash → local | medium |
| `admin` | Keywords: cleanup/organize/update/status | minimal (DeepSeek-flash only) | low | deepseek-flash | low |
| `rest` | Long gaps, short prompts, casual tone | minimal | low | deepseek-flash | low |

---

## Detection Algorithm

### Signal extraction (from session-state.json + recent commits + current prompt)

```
phase_score = {}
for each phase in PHASES:
  score = 0
  score += keyword_match(current_prompt, phase.keywords) * 3
  score += keyword_match(recent_commits, phase.commit_signals) * 2
  score += file_type_match(touched_files, phase.file_types) * 2
  score += complexity_tier_match(pulse_plan.complexityTier, phase) * 1
  phase_score[phase] = score

detected_phase = argmax(phase_score)
confidence = phase_score[detected_phase] / sum(phase_score.values())
```

### Confidence gate
- confidence > 0.6: auto-apply phase config, log to session-state.json
- confidence 0.4–0.6: apply phase config but surface it briefly
- confidence < 0.4: surface top 2 as options, let Marcel choose

---

## Execution Steps

1. Read recent git commits + current task context
2. Run the detection heuristic (signals → phase)
3. Adopt the phase config for the turn: depth, verbosity, approach

---

## Output Format (when surfaced)

```
⬡ NEN — Phase detected: deep_code [82% confidence]
  Ensemble: Codex-first + DeepSeek-flash backup
  Depth: max | Verbosity: low | Priority: gpt-5.5 → deepseek
  Switching to code-execution mode.
```

---

## Session Notes

### 2026-06-02
- session: 22m | peak ctx: 0% | compacts: 0
- tools: Bash×64, Read×23, WebFetch×4, StructuredOutput×4, Workflow×1
- corrections: im back again rick, we pull up the latest station we left off from the previous session | commit and push phase 1 then proceed, im going to rest for a bit again (currently sitting in an ICE train from vienna to frankfurt airport, arrival around 13:00.) | ai pipeline offloading as far as im aware is again another routing workaround to achieve that what opus 4.8 does natively, confirm if that is the case, then you should be able to figure out what to do
- errors: none

### 2026-06-02
- session: 18m | peak ctx: 0% | compacts: 0
- tools: Bash×56, Read×20, WebFetch×4, StructuredOutput×3, Workflow×1
- corrections: im back again rick, we pull up the latest station we left off from the previous session | commit and push phase 1 then proceed, im going to rest for a bit again (currently sitting in an ICE train from vienna to frankfurt airport, arrival around 13:00.)
- errors: none

### 2026-05-16 — Created
Tools: Write. Part of Musubi Hyper-Intelligence v2 sprint.
Anime source: Hunter × Hunter — Nen system introduced in the Yorknew City arc. Wing teaches Gon and Killua to use Ten/Zetsu/Ren/Hatsu.
Translation principle: Nen categories map to work modes — forcing Enhancement-type (direct action/power) behavior during a Specialization-type (creative/unique) task burns energy without results. Phase alignment is efficiency.
