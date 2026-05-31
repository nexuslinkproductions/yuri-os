---
domain: craft
tradition: Data Visualization · Copywriting · Presentation
layer: Layer 2 (operational reference)
related: [[japanese-aesthetics]], [[motion-design-manifesto]]
tags: [craft, yuri, knowledge-base, dataviz, copywriting, storytelling, presentation, marketing-psychology, physics-viz]
last-updated: 2026-05-31
sources: Anthropic interpretability (attribution graphs), Phys Rev X (energy-landscape manifold viz), NVIDIA Research, ScrollyVis (IEEE TVCG), Apple copywriting analyses, neuromarketing/narrative-transportation research
purpose: Local-first research center entry — consult BEFORE going online when doing design/copy/presentation work.
---

# Data Presentation & Storytelling — How the Best Move People

The reusable craft reference for YURI presentation work (dashboards, reports, papers, decks).
Research-local-first: read this before WebSearch. Append new findings here so the asset compounds.

## I. How the best present DATA (visual language)

- **Anthropic — show the mechanism as a traceable graph, not a table.** Their interpretability work renders model "thoughts" as *attribution graphs*: nodes = features, edges = causal influence, interactive/annotatable. Lesson: when a system has internal mechanism, draw the causal flow, let the viewer trace it. (marktechpost.com attribution-graphs; neuronpedia frontend)
- **Energy-landscape physics canon — use the field's own iconic viz.** (a) *Disconnectivity graphs* — a tree of minima + the barriers between them. (b) *Basins of attraction* — the surface partitioned by where steepest-descent lands. (c) *SHEAP / manifold funnels* — low-dimensional "funnel into the global minimum." (d) *Gradient-flow trajectories* — follow −∇U to a stationary point. These instantly read as fluent energy-landscape work. (Phys Rev X 11.041026; PMC disconnectivity graphs)
- **NVIDIA — "technical power" via real-time fields/surfaces.** Depth, ray-traced light, GPU-rendered fields, motion. Take the *energy and depth*, drop the green-on-black HUD cliché.
- **Distill / Observable / ScrollyVis — explorable explanations.** Scientific scrollytelling: the physics *animates as you scroll* (field tilts, ball descends, components light up in sequence). Gold standard for explaining a mechanism. (IEEE TVCG ScrollyVis)

### Unique-viz menu (beyond line charts)
1. Live gradient-descent field with a marker rolling into a basin (conservative settles / unconstrained circulates).
2. Tie an abstract metric curve to a physical descent (ball on the potential moves with the curve).
3. Attribution graph for a scoring function — components flow into the score, edge weight = contribution.
4. Disconnectivity / funnel diagram — the signature physics piece.
5. Mermaid/SVG architecture flow for systems (crossings, boundaries).
6. Worked-example "teeth": run the real function on adversarial input to show rejection behavior honestly.

## II. How the best write COPY (move people, don't inform them)

- **Apple — sell the experience, not the spec.** Human-centric, timeline-driven mini-movie arc, ONE commanding idea per beat, a closing line that loops back. Never "processor/RAM"; always "how it fits your life." (323works; zamora.design; creativebloq)
- **Neuroscience of story — why it works.** Stories activate emotion/empathy/memory regions; *narrative transportation* lowers resistance (the reader is "transported," persuaded indirectly); well-told stories release oxytocin (trust); the brain processes emotion FASTER than logic. Facts inform; stories change belief and are remembered. (sciencedirect neuromarketing; medium "why your brain needs stories")
- **Mono no aware (see [[japanese-aesthetics]]).** The pathos of transience — what makes film make people cry. Great copy makes the reader *fully inhabit a moment they know will pass*. Emotion that is true, not manipulative.

### Copy operating rules
- Lead with the human/philosophical stake, not the mechanism. (Why does a machine refusing to make itself worse *matter*?)
- One commanding idea per section; arc across sections (tension → turn → resolution).
- Concrete + sensory over abstract + declarative. Verbs over nouns. Rhythm over uniformity.
- Earn the number: wrap every statistic in the story of what it cost and what it means.
- Never spec-prose / highschooler-flat. Read it aloud — if it's monotonic, it's wrong.

## III. Synthesis for YURI surfaces
Layout = Ma (charged negative space, varied asymmetric rhythm — never slide-deck). Palette = wabi-sabi/kintsugi (gold joinery + verdigris patina). Copy = mono no aware (feel the weight + transience). Viz = the field's own iconic language, animated as explorable explanation. Depth, motion, emotion — an experience, not a report.
