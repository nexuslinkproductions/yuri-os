# The Brain Dump Decoder — General Purpose

> The single function that turns chaos into structure. Works for websites,
> business ideas, project requirements, feature specs — anything your brain
> spawns as a mess of disconnected sparks.

---

## The Core Idea

Your brain generates **nodes**. The system connects them into a **graph**.

```
Your dump:                    System output:

[A]                            ┌─────┐    ┌─────┐
  └─ thinks about X            │ A   │────│ B   │
[B]                            └──┬──┘    └──┬──┘
  └─ remembers Y                   │         │
[C]                            ┌──┴──┐    ┌──┴──┐
  └─ sees connection            │ C   │────│ D   │
[D]                            └─────┘    └─────┘
  └─ but also Z                       │
                                  ┌───┴───┐
                                  │   E   │
                                  └───────┘
```

You don't need to know how they connect. You just need to dump them.

---

## The Universal Prompt

```
You are a thought decoder. I will give you a raw, unstructured brain dump —
random thoughts, disconnected ideas, half-formed concepts, things I saw,
things I want, things I'm worried about. They may or may not be related.
Some are relevant. Some are tangents. I haven't organized any of it.

DO NOT evaluate whether my thoughts are "good." Just decode them.

Take this mess of text and produce structure:

## Step 1: Extract all distinct nodes
Every distinct thought, requirement, concern, observation, or idea gets its own entry.
Even the tangents. Even things I might discard later. Capture everything.

## Step 2: Identify clusters
Which nodes belong together? Group them by theme.
The groups might surprise me — that's okay.

## Step 3: Find connections
How do the groups relate? Does one group imply another?
Does one group conflict with another?

## Step 4: Identify gaps
What's missing? Based on what I said, what should logically exist
but I didn't mention? These are the blind spots.

## Step 5: Prioritize
Which groups are foundational (must be solved first)?
Which are downstream (depend on other groups)?
Which are optional/nice-to-have?

## Step 6: Produce output

Output format (ALWAYS use this structure):

# Decoded Structure

## Raw Nodes
Every distinct thought I captured, numbered.

## Clusters
The groups they naturally fall into, with their constituent nodes.

## Connections Map
How clusters relate to each other.

## Blind Spots
What's missing that should logically be here.

## Priority Stack
What to work on first, second, third.

## Synthesis
A one-paragraph summary of the coherent picture I'm actually describing,
even though I didn't know it when I started writing.

---

RAW DUMP:
"""
{{PASTE YOUR UNSTRUCTURED TEXT HERE}}
"""
```

---

## Example: Website-Focused Dump

Input:
```
I want to build a portfolio website for my creative work.
Dark theme definitely. I keep thinking about that one site
with the horizontal scroll, it felt so premium. Also need
a way to show my media without it being a grid of thumbnails
like everyone else. My design research mentioned something about
magnetic buttons. Should I use a CMS or just hardcode it.
Client needs to be able to update their own portfolio.
Loading speed is important because the media is heavy. I saw a cool
thing where the background changes color as you scroll.
Three.js maybe but I've never used it. Budget is tight.
Mobile first obviously. The contact form needs to not
look like a contact form. Actually maybe I should do
a free consultation first to understand the client better.
```

Output:

```
# Decoded Structure

## Raw Nodes
1. Dark theme
2. Horizontal scroll (premium feel)
3. Media showcase that isn't a thumbnail grid
4. Magnetic buttons (from design research)
5. CMS vs hardcoded question
6. Client self-update requirement
7. Loading speed concern (media-heavy)
8. Scroll-based background color shift
9. Three.js consideration (no experience)
10. Tight budget
11. Mobile first
12. Contact form that doesn't look like a contact form
13. Free consultation idea
14. Better client understanding needed

## Clusters

### Cluster A: Visual Direction (nodes 1, 2, 8, 4)
Dark theme + horizontal scroll + scroll-based color shift + magnetic buttons
→ Core interaction model. Premium, dark, scroll-driven.

### Cluster B: Content System (nodes 3, 6, 5)
Media showcase + client self-update + CMS question
→ Need a CMS, not hardcoded. Client must update their own portfolio.
→ This rules out static site unless you add a headless CMS.

### Cluster C: Technical Constraints (nodes 7, 9, 10, 11)
Loading speed + Three.js inexperience + tight budget + mobile first
→ Video + performance tension. Three.js is a stretch given budget and experience.
→ Mobile-first means horizontal scroll needs careful fallback.

### Cluster D: Conversion (nodes 12, 13, 14)
Contact form + free consultation + client understanding
→ The form is a conversion point, not a utility. Needs to feel like starting a conversation.

## Connections Map

Cluster A (Visual) ←feeds into→ Cluster C (Technical): 
  Horizontal scroll and dark theme are achievable. Three.js might be too much.
  Recommendation: CSS-based color shift instead of Three.js.
  GSAP for scroll animations instead of custom WebGL.

Cluster B (Content) ←constrains→ Cluster A (Visual):
  CMS choice affects what's possible with the media showcase.
  Recommendation: Decap CMS (Git-based, free, client can use).

Cluster D (Conversion) → depends on all clusters being resolved first.

Cluster C (Technical) ←conflicts with→ Cluster A (Visual):
  Horizontal scroll + heavy media + performance = tension.
  Solution: Lazy-load everything below fold. Use poster images.
  Horizontal scroll only on desktop; vertical stack on mobile.

## Blind Spots

⚠️ No mention of typography strategy or font choices
⚠️ No mention of SEO or meta strategy
⚠️ No mention of analytics/tracking
⚠️ No mention of hosting or deployment
⚠️ No mention of project timeline or milestones
⚠️ Horizontal scroll accessibility not considered (keyboard nav, screen readers)

## Priority Stack

Priority 1: Cluster C (Technical Constraints) — these are non-negotiable
  → Budget, performance, mobile-first define everything else
  
Priority 2: Cluster B (Content System) — the CMS decision gates everything
  → Choose CMS → determines video pipeline → determines client experience
  
Priority 3: Cluster A (Visual Direction) — once constraints are known
  → Design within the technical envelope, not against it
  
Priority 4: Cluster D (Conversion) — last, because form depends on everything else

## Synthesis

You're describing a premium, dark-themed creative portfolio with a scroll-driven
interaction model, but the real differentiator isn't the visual design — it's that
the client needs to update it themselves. That means the architecture should center
on a headless CMS with a beautiful admin experience, then layer the visual innovation
on top within a tight budget. The horizontal scroll and color-shift can be done with
CSS + GSAP, not Three.js. The real innovation opportunity is making the CMS-backed
media showcase feel bespoke instead of templated, and turning the contact form into
a conversation starter rather than a data collection tool.
```

---

## How to Use This

**Step 1:** Open a new agent session (or sub-agent)
**Step 2:** Paste the full prompt with your brain dump at the bottom
**Step 3:** Get back structured output
**Step 4:** Review the blind spots and priority stack — those are your action items
**Step 5:** Feed the output into the planner prompt (from `02-PLANNER-PROMPT-TEMPLATE.md`) to generate the actual build plan

**The key insight:** You don't need to know what you want before you dump. The decoder finds the structure you didn't know was there. That's the whole point.
