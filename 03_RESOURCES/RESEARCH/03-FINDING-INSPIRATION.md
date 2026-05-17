# Perplexity Research Prompts — Finding Truly Advanced Websites

> Most "best website" lists are S tier templates on squarespace. You need sites
> that push technical boundaries — WebGL, custom scroll engines, fluid typography,
> innovative interaction models.

---

## The Prompt for Perplexity

Copy-paste exactly:

```
I need to find websites that are technically groundbreaking, not just visually nice.
Not template sites, not squarespace, not "award winning" generic portfolio sites.

I need sites that push boundaries in these specific areas:

1. WEBGL & 3D: Sites that use Three.js, WebGL, or custom 3D rendering in innovative ways
   — Not just a spinning logo, but integrated 3D that responds to scroll/cursor
   — Examples: Bruno Simon's portfolio, Apple's product pages, 
     the ones where the 3D scene IS the navigation

2. SCROLL INNOVATION: Sites that reimagine scrolling
   — Horizontal scroll sections that feel natural
   — Scroll-linked animations that tell a story
   — "Scroll hijacking" done right (not the annoying kind)
   — Inertial scrolling physics

3. CURSOR & INTERACTION: Sites where the cursor is part of the design
   — Custom cursors that morph based on context
   — Magnetic buttons (cursor pulls the button)
   — Hover states that feel physical, not just color changes

4. TYPOGRAPHY AS DESIGN: Sites where type is the main visual element
   — Variable font animations
   — Fluid typography that responds to viewport in creative ways
   — Kinetic typography (text as motion)
   — Custom font rendering

5. PERFORMANCE PARADOX: Sites that look heavy but load incredibly fast
   — Instant loads despite rich visuals
   — Clever preloading strategies
   — Progressive enhancement that feels native

6. AUDIO-VISUAL: Sites that integrate sound meaningfully
   — Ambient audio that responds to interaction
   — Generative music tied to visual state
   — Cursor/scroll sonification

For each category, give me:
— 2-3 specific URL examples
— What specifically makes them technically impressive
— What frameworks/libraries they likely use (if you can tell)
— Where they might fall short (nothing is perfect)

Don't give me generic "award winning" sites. I want the ones that developers 
and designers actually study to learn from.
```

---

## What Perplexity Can Also Do

Once it gives you the initial list, follow up:

```
For each of those sites, can you tell me:
1. What tech stack they're likely using (React, Svelte, vanilla?)
2. What animation library (GSAP, Framer Motion, custom?)
3. Estimated page weight and load time
4. Whether they have a public case study or writeup about how they built it
```

And if you want more in a specific direction:

```
From that list, the horizontal scroll sites were most relevant to what I'm building.
Give me 5 more sites that do horizontal scrolling exceptionally well,
specifically the ones where it feels intuitive and not disorienting.
```

---

## If Perplexity Has Web Browsing

You can also have it actively find new things:

```
Browse recent Awwwards Site of the Day winners from the last 3 months.
Extract the ones that are technically interesting, not just visually pretty.
For each, note what makes the tech interesting — WebGL, custom scroll, 
accessibility, performance, or novel interaction patterns.
```

---

## The Pattern to Look For

The sites worth studying aren't the ones where "everything works perfectly."
They're the ones where **one thing is pushed to an extreme** — sometimes at
the cost of other things. That's where you learn.

- A site with incredible scroll physics but terrible load time → learn from the scroll, fix the load
- A site with mind-blowing WebGL but inaccessible → learn the 3D, add the accessibility
- A site that loads instantly but looks plain → learn the performance, add the visuals

Every site teaches you something. Take the innovation, leave the compromises.
