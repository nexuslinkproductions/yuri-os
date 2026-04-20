# Shot List Rubric — GAN Evaluator

**Domain:** On-set videography / cinematography  
**Context:** Shot lists for commercial shoots, branded content, corporate video  
**Target Score:** 7.0/10 or higher  
**Max Iterations:** 3

---

## Binary Gates (Fail on ANY failure)

These must pass. If any fails, shot list is rejected regardless of weighted score.

- [ ] **Shoot Date Present** — List explicitly states shoot date/day
- [ ] **Location Named** — Specific location(s) named, not generic
- [ ] **Time Allotment per Shot** — Each shot has estimated duration (e.g., "3–5 min")
- [ ] **Equipment Specified** — Camera type, lens, rig, or special gear noted
- [ ] **Crew Requirements** — Who's needed (camera, grip, lighting, audio, etc.)

---

## Weighted Scoring Dimensions

Score each 1–10. Average = weighted score.

### 1. Completeness (25%)
**What:** Does the list cover all scenes/angles from the brief?

- **9–10 (Exceptional):** Every scene from brief appears. All angles covered. Backup options noted.
- **6–7 (Acceptable):** Most scenes covered. Key angles present. Minor gaps noted.
- **1–4 (Reject):** Missing major scenes. Unclear what angles were planned. Incomplete.

---

### 2. Clarity (25%)
**What:** Can a crew member execute each shot without questions?

- **9–10 (Exceptional):** "Wide of room, lock-off, 3–5 min, 35mm at f/2.8, camera on crane" — zero ambiguity.
- **6–7 (Acceptable):** Shot intent clear. Some minor details could be more specific.
- **1–4 (Reject):** Vague language. "Get some room shots" — unclear what's needed.

---

### 3. Feasibility (20%)
**What:** Can this be shot in the time/budget/location given?

- **9–10 (Exceptional):** Timings are realistic. Equipment available. Location constraints understood.
- **6–7 (Acceptable):** Generally doable. One or two ambitious shots that might need contingency.
- **1–4 (Reject):** Unrealistic timings. Requests equipment not available. Ignores location constraints.

---

### 4. Client Alignment (20%)
**What:** Does the list match the brief's creative intent and deliverables?

- **9–10 (Exceptional):** Clearly references brief requirements. Every shot serves the story/message.
- **6–7 (Acceptable):** Generally aligned. One or two shots feel tangential.
- **1–4 (Reject):** Diverges from brief. Doesn't match creative direction.

---

### 5. Risk Mitigation (10%)
**What:** Are backup shots planned? Are location/weather/crew risks addressed?

- **9–10 (Exceptional):** Alternatives listed for each complex shot. Contingencies explicit.
- **6–7 (Acceptable):** Some contingencies noted. Generally prepared.
- **1–4 (Reject):** No backups. Assumes perfect conditions. Single point of failure.

---

## Feedback Template

When scoring, provide:

1. **Gate Failures** (if any): Exact quote of what's missing, how to add it
2. **Dimension Scores**: One sentence reason for each 1–10 score
3. **Specific Fixes**: "Add 'lighting: 2x 1K + reflector' to shot 3" (not vague)
4. **One Strength**: What this iteration did well

**Example:**

```
Gate Check:
  ✗ Equipment Specified — Missing rig info on crane shot
  
Dimensions:
  Completeness: 7/10 — All scenes covered, but missing detail on B-roll angles
  Clarity: 6/10 — Shot intent clear, but "wide of hallway" needs lens/distance
  Feasibility: 8/10 — Timings realistic, but 4-shot sequence feels tight in 15 min
  Client Alignment: 8/10 — Clearly serves the brief
  Risk Mitigation: 5/10 — No rain contingency for outdoor shots
  
Fixes:
  - Add "Arri Mini LF" to crane shot
  - Specify "20mm, locked, slow push from 20ft to 40ft" for hallway
  - Move "B-roll walkthrough" to after main setup (time savings)
  - Plan indoor hallway backup if weather bad
  
Strength: Clear equipment choices show deep understanding of brief needs.
```

---

## Notes for Generator

**DO NOT SHOW THIS RUBRIC TO GENERATOR** before it creates the first version. The generator should read only the brief, not the evaluation criteria. This prevents "optimizing for the rubric" instead of genuine quality.

Generator should see this ONLY after first rejection if needed.
