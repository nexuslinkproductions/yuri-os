# GAN Loop — Usage Examples

---

## Example 1: Shot List for C2MOVIEZ Shoot

### Input File: `brief.md`

```markdown
# Claudio's Q2 Campaign — Shot List Request

**Client:** Internal (C2MOVIEZ brand content)
**Shoot Date:** May 15, 2026
**Location:** Zurich, creative studio + outdoor city
**Duration:** 1 day (8h available)
**Crew:** Marcel (camera), 1 grip, 1 gaffer, 1 PA
**Budget:** Normal (no premium overtime)

## Scenes Needed

1. **Setup sequence** — Team gathering for brief, collaborative energy
2. **Process montage** — Storyboarding, sketching, discussion (B-roll friendly)
3. **Final presentation** — Client looking at concepts, nodding along
4. **Wrap** — Team celebration shot

## Creative Direction

- Warm, bright, professional
- Natural light where possible
- Fast cuts for process, slow for beauty moments
- Show hands and faces equally

## Special Requests

- One shot from drone (sunset over city)
- Interview-style close-up of Claudio (3–5 min cut available)

## Known Constraints

- Can't access studio after 5pm (building closes)
- Weather forecast: 60% chance rain afternoon
- One team member has flight at 7pm
```

### Run GAN Loop

```bash
```

### Iteration 1: Generator Output (Simplified)

```markdown
# C2MOVIEZ Q2 Campaign — Shot List

## Scene 1: Team Setup
- **Duration:** 20 min (including setup)
- **Camera:** Red Komodo, 50mm, f/2.0
- **Crew:** Camera, grip (reflector duty), gaffer (key + fill)
- **Description:** Locked wide of team desk, natural light window left, soft fill from reflector right. Team enters, sits, discusses.
- **Logistics:** Arrive studio 9:30am, prep light by 10am, roll by 10:15am.

[... continues with Scenes 2–5 ...]
```

### Iteration 1: Evaluator Feedback

```
Gate Check: FAILED

✗ Time Allotment per Shot — Scene 1 has 20 min, but Scene 3 (interview) shows "3–5 min available" as constraint, not duration. Unclear how long interview actually takes.

Fix: Change Scene 3 from:
  "Interview-style close-up of Claudio (3–5 min cut available)"
to:
  "Interview-style close-up of Claudio (12–15 min total: 8 min rolling, 4 min reset/retake)"

Once gate passes, I'll score dimensions.
```

### Iteration 2: Generator Revises

```markdown
# C2MOVIEZ Q2 Campaign — Shot List (Revision 2)

## Scene 3: Interview — Claudio Close-Up
- **Duration:** 12–15 min total
  - 2 min: camera/audio setup
  - 8 min: rolling (3 questions, multiple takes)
  - 2 min: playback check + retake if needed
- **Camera:** Red Komodo, 35mm, f/1.6 (shallow depth for beauty)
- **Crew:** Camera, gaffer (eyebrow light + kick), audio tech
- **Description:** Claudio seated at desk, talking about process. Warm, conversational. Multiple takes for editing options.

[... continues ...]
```

### Iteration 2: Evaluator Scores

```
Gate Check: PASSED ✓

Dimension Scores:
- Completeness: 8/10 — All scenes covered, realistic B-roll breakdown
- Clarity: 7/10 — Equipment specific, timings clear; one ambiguity on drone setup location
- Feasibility: 7/10 — Realistic given 1-day, 8h window; rain contingency noted
- Client Alignment: 8/10 — Clearly serves brief's warm/process focus
- Risk Mitigation: 6/10 — Good backup indoor shots, but no crew contingency if PA leaves early

**Final Score: 7.2/10** → PASS

Strength: Clear equipment choices show deep understanding of brief's lighting needs.
```

### Output

```
Final shot list saved to:

Ready to send to crew.
```

---

## Example 2: Client Brief for MACL ONE

### Input File: `macl-requirements.txt`

```
Client: MACL ONE (sports apparel brand)
Project: Q2 Product Launch Video
Deliverable: 90-second main video + 30-second TikTok cut
Shoot Date: June 1–2, 2026
Location: TBD (outdoor location with athletic vibe)
Budget: €8,500 (exclusive of travel)
Timeline: Deliver final cut by June 20
Tone: Aspirational but accessible. Young, energetic, real athletes (not models).
Creative: Show product in use, athlete testimonial, slow-mo beauty of fabric/design
Revision Rounds: 2 included, 3rd round €1,500 each

Key Messaging:
- Sustainability (eco-friendly materials)
- Performance (tested by real athletes)
- Accessible pricing (quality at fair cost)

Known Constraints:
- Athletes travel, need coordination 2 weeks ahead
- Location scout needed (€500 budget available)
- Post-production 8 weeks (color, sound, motion graphics)
```

### Run GAN Loop

```bash
```

### Iteration 1: Generator Output

```markdown
# MACL ONE Q2 Product Launch — Creative Brief

## Overview

[... standard brief structure ...]

## Deliverables
- 90-second main video (4K ProRes)
- 30-second TikTok cut (vertical 1080×1920)
- Color grade + DCP for distribution

## Timeline
- Shoot: June 1–2
- Delivery: June 20 (4 weeks post-production)

## Budget
€8,500 (exclusive of travel)

[... continues ...]
```

### Iteration 1: Evaluator Feedback

```
Gate Check: FAILED

✗ Creative Direction — Brief doesn't mention sustainability messaging. The input emphasizes eco-friendly materials, but the brief summary only mentions "performance."

Fix: Add to "Key Messaging" section:
  "Emphasize sustainability: eco-friendly materials, transparent sourcing, real environmental impact."
  
Also add to "Visual Approach":
  "Include 15-second segment on material origin (optional: factory/farm footage if available)"

Re-submit once sustainability is explicit, then I'll score.
```

### Iteration 2: Generator Revises

```markdown
# MACL ONE Q2 Product Launch — Creative Brief (Revision 2)

## Key Messaging

1. **Performance** — Product tested by real athletes in demanding use
2. **Sustainability** — Eco-friendly materials, transparent sourcing, measurable environmental benefit
3. **Accessibility** — High quality at fair price point

## Visual Approach

- 40% athlete product-in-use (running, climbing, movement)
- 30% testimonial (2–3 athletes speaking)
- 20% beauty/material (slow-mo detail shots of fabric weave, zipper, stitching)
- 10% sustainability (optional: supply chain or recycling info if we can source footage)

[... continues ...]
```

### Iteration 2: Evaluator Scores

```
Gate Check: PASSED ✓

Dimension Scores:
- Completeness: 7/10 — Deliverables, timeline, budget clear. One revision: payment terms for round 3.
- Clarity: 8/10 — Well-structured. Messaging priorities explicit. Could add athlete count (3? 5? 10 athletes).
- Tone Match: 7/10 — Matches Marcel's voice, but final paragraph still formal ("utilizing footage"). 
- Confidence: 8/10 — Realistic timeline for 8-week post. Budget leaves 15% buffer (good).
- Next Steps: 7/10 — "Approve by May 20" is stated, but no clear approval process (email Claudio? Slack? Zoom call?).

**Final Score: 7.4/10** → PASS

Strength: Sustainability messaging now clear and woven throughout. Shows you understood the brand's core value.
```

### Output

```
Final brief saved to:

Ready to send to MACL ONE.
```

---

## Tips

1. **Input quality matters** — Clearer requirements = faster loop. Vague input = more iterations.
2. **One shot per content** — Don't try to generate 5 shot lists at once. Run them individually.
3. **Keep outputs** — All iterations saved. Good for learning how Claude improved your output.
4. **Reuse rubrics** — Use same rubric for Claudio's shoots, customize for new contexts.
5. **Test feedback** — First time GAN Loop rejects your input, that's data. Adjust rubric if it's too harsh.
