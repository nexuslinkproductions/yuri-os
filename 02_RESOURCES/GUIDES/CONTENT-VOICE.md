# CONTENT-VOICE.md — NEXUS LINK voice constitution

Authority for every draft the content engine produces. A draft that violates a
HARD RULE is rejected before Marcel ever sees it. Sources: live scan of
@nexuslinkproductions (Threads), Lilly's `nexus_link_content_strategy.html`
(July 2026), competitor scan (rowancheung, claudeai, alexngsx, chase.h.ai,
prettyshisya).

---

## 0. HARD RULES (non-negotiable)

1. **DRAFT-ONLY.** Nothing is ever posted automatically — not Threads, not
   LinkedIn, not replies. Every artifact lands in
   `00_COMMAND-CENTER/Inbox/content-drafts/` and waits for Marcel's explicit
   approval. His family (incl. his dad) is on LinkedIn — assume everything is
   read by someone who knows him personally.
2. **ENGLISH ONLY.** Marcel does not read Chinese or Japanese. His VPN egress
   is Japan, so feeds surface Japanese lettering — ignore it at capture time,
   never quote it, never generate it. All drafts: English.
3. **NO YURI LEAK.** Public content teaches the *philosophy and spinoff code*,
   never YURI internals. Org counts and layer names may be teased (he already
   posted "10 Layers / 242 organs") but no file paths, no skill names, no
   memory schema, no MURE topology details, no code lifted from `_SYSTEM/`.
4. **NO AI SLOP.** Banned patterns (auto-fail):
   - "In today's fast-paced world", "game-changer", "revolutionize",
     "unlock the power of", "delve", "landscape", "supercharge", "elevate"
   - emoji bullet walls, 🚀💡✨ as punctuation
   - "Let that sink in.", "Read that again.", "Agree?"
   - **EM-DASHES (—) — HARD NO, zero exceptions, not even one** (Marcel's rule,
     overrides every stylistic instinct)
   - "not a X" sentence endings and "this is X, not Y" / "this is, this it
     isn't" constructions in ANY form (e.g. "it's a map, not a compass" is
     auto-fail)
   - "It's not X. It's Y." used anywhere
   - generic engagement bait ("Comment X to get Y" — that's chase.h.ai's
     game, not ours)
5. **EARNED NUMBERS ONLY.** Every metric in a post must be real and
   reproducible (test output, star counts, benchmark verdicts). The brand is
   proof, not vibes.
6. **NO CTAs OF ANY KIND.** Not "comment X", not "DM me", not "link in
   bio/comments", not "follow for more", not "what do you think?", not an
   invitation, not a question to the audience. Posts end on a flat statement
   (an understatement or an extrapolation jab per the voice profile). The
   work carries the interest; the profile bio carries any link. A factual
   scarcity statement ("spots opening mid next week") is a statement, not a
   CTA, and stays allowed.

---

## 1. Positioning (from Lilly's strategy — the sentence everything returns to)

> NEXUS LINK builds the control layer above AI models. Memory, evidence,
> gates, cost sense, and audit *before* the system acts.

Public shorthand: **"I build AI systems that are allowed to say no."**
The proof ladder: Recognition (name the break) → Mechanism (show the control)
→ Proof (publish the learning) → Action (filter demand). Never skip rungs —
no "apply for the pilot" before three posts of recognition+mechanism.

---

## 2. Platform registers

### Threads — the language lab (4–6 posts/week)
Marcel's verified voice, from live posts:
- Short. 1–6 lines. Lowercase-leaning, contractions, no corporate polish.
- Dry self-aware humor about the builder life: "Right when Opus 5 releases I
  hit my limits, reset maybe please @boris_cherny", "had to use up all saved
  weekly resets before they expired".
- Then, without warning, a high-signal flex with concrete numbers:
  "10 Layers / 242 organs… like Swiss Clockwork", "true deterministic
  governance at play that wraps around any LLM and SLM".
- Scarcity closes, understated: "Spots opening as of mid next week, invite
  only". Never desperate.
- Replies and shitposts are part of the persona — the ratio is ~60% human
  noise / 40% signal. That contrast IS the brand; don't sterilize it.
- Format: hook line first (no "🧵"), numbers mid-post, one idea per post.
  Threads chains marked 1/ 2/ only when the idea genuinely needs it.

### LinkedIn — the serious room (2 posts/week)
- Same brain, cleaner clothes. Full sentences, correct casing, no shitposting.
- Structure: concrete scene or claim → mechanism in plain language → one
  proof point → flat close (a statement, NEVER a question, invitation, or
  CTA of any kind).
- 150–300 words sweet spot. No hashtag walls (0–3, only #AIAgents
  #BuildInPublic style, at the end).
- Every LinkedIn post pairs with a visual: infographic spec is part of the
  draft (see §4).
- Remember the audience includes his dad, former colleagues, DACH/EU
  business contacts: nothing posted here should need explaining at a family
  dinner.

---

## 3. The René / holster-mold case study (flagship social proof)

Real story: Marcel ran a Blender pipeline (via AI-orchestrated blender-mcp)
that turned gun scans into production split-molds for custom-gear.ch (René
Spatz). STL deliverables, real invoice, real client.

Rules:
- **The star is the orchestration, not the workflow.** René's actual holster
  craft and business workflow stay private — never describe his process,
  pricing, client list, or mold geometry decisions.
- Talk about: "I pointed an AI-orchestrated Blender pipeline at a physical
  manufacturing problem and shipped production parts" — scan → mold →
  delivered STL → paid invoice.
- No screenshots of René's workshop material without asking Marcel first;
  use the abstract pipeline diagram instead.
- LinkedIn angle: "AI doesn't just write code — it operated a 3D toolchain
  end-to-end and a manufacturer shipped the result." Threads angle: casual
  build-log tone, "week I became a Blender operator without learning
  Blender".
- This is the proof-of-work anchor for the whole "control layer" story: a
  gated, auditable pipeline touching the physical world.

---

## 4. Infographic spec (LinkedIn + IG)

Clean technical visuals, anti-slop:
- **References first, render second.** No visual is generated from a bare
  text spec. Every render task anchors to 3–5 curated references from
  `_SYSTEM/content-engine/references/` (Pinterest-sourced, WIRED/Bloomberg
  editorial tier). See `references/REFERENCE.md` for the style anchors and
  the anti-slop test every render must pass.
- Dark background, one accent color (YURI violet/cyan family), monospace for
  numbers, sans for prose. No stock-photo hands-shaking-robots, no glowing
  brains, no 3D bevels, no gradient soup.
- One concept per graphic: a gate diagram, a before/after metric, a pipeline
  strip, a "205 factors examined → 0 survivors" honesty stat.
- Text on graphic ≤ 25 words. If it needs more, it's a carousel.
- Drafts include an `infographic:` block describing exactly what to render
  (layout, labels, numbers) so it can be produced as HTML/SVG screenshot.

---

## 5. Content pillars (Lilly's 8, mapped to our assets)

| Pillar | Our proof asset |
|---|---|
| Category / Control Layer | "Built to say NO" positioning, stack diagrams |
| Work-Risk Moments | tool-call-before-evidence stories, lane failures |
| Memory & Evidence | Track A ledger concepts, evidence contract |
| Gates, Audit & Compliance | energy-gate veto, six-gates, EU buyer angle |
| Pilot Proof & Waitlist | René case study, pilot friction logs |
| OSS & Builder Trust | spinoff repos (quantum-order-effects, qsphere) |
| Cost & Enterprise Economics | token-layer stories, "reset maybe please" humor |
| MURE & Architecture | "242 organs" flex posts, one organ at a time |

---

## 6. Competitor patterns to adapt (not copy)

From live radar:
- **rowancheung** (213K): interview-access quotes, numbered thread parts.
  Adapt: quote YURI's own engine outputs as the "interview subject".
- **claudeai** (342K): release notes as plain sentences, model-choice guides.
  Adapt: "which organ handles this" guides — teaching through use-cases.
- **alexngsx** (645 likes): "NOBODY IS TALKING ABOUT THIS" + tool spotlight +
  spec bullets + "Open source. Free." Adapt the structure, drop the caps-lock
  gimmick — our version: the number IS the hook ("1,134,061× ordering
  effect. Nobody talks about sequence.")
- **prettyshisya**: problem-first caps line + spec bullets. Same adaptation.
- Winning formula for us: **honest stat hook → what it means in one plain
  sentence → where to inspect it (repo) → understated close.**

---

## 7. Draft file format

Every draft is one markdown file in
`00_COMMAND-CENTER/Inbox/content-drafts/YYYY-MM-DD/`:

```markdown
---
platform: threads | linkedin
pillar: <one of the 8>
status: draft          # draft → approved (Marcel) → posted
source_signal: <radar item or "original">
created: YYYY-MM-DD
---

<post text, ready to paste>

---
infographic: <spec block or "none">
media_needed: <screenshot/video Marcel must attach, or "none">
```

Review loop: Marcel edits text in place and sets `status: approved`.
Only then may a browser-wired agent post it and log the permalink to
`_SYSTEM/content-engine/content-ledger.jsonl`.
