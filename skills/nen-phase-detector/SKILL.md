---
name: nen-phase-detector
description: Adaptive Phase Specialization — detects Marcel's current work phase (deep_code, design, strategy, research, admin, rest) from session context and auto-configures ensemble composition, lane priority, verbosity, and response depth for that phase. Nen category alignment for optimal energy use.
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

1. Read session-state.json + recent git commits + current prompt
2. Run detection algorithm
3. Write `nen_phase` to session-state.json
4. Configure: ensemble composition, lane priority, verbosity
5. Emit `### NEN_PHASE` block in brain (read by brain-inject.js)

---

## brain-inject.js Integration

`loadNenPhase()` function reads `session-state.json.nen_phase` and injects into brain block:

```
### NEN_PHASE — Active work phase
Phase: deep_code | Confidence: 0.82
Config: Codex-first ensemble, max depth, gpt-5.5 priority, minimal prose
```

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

### 2026-05-16 — Created
Tools: Write. Part of Musubi Hyper-Intelligence v2 sprint.
Anime source: Hunter × Hunter — Nen system introduced in the Yorknew City arc. Wing teaches Gon and Killua to use Ten/Zetsu/Ren/Hatsu.
Translation principle: Nen categories map to work modes — forcing Enhancement-type (direct action/power) behavior during a Specialization-type (creative/unique) task burns energy without results. Phase alignment is efficiency.
