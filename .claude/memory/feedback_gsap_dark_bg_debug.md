---
name: feedback-gsap-dark-bg-debug
description: Three GSAP + dark-bg debugging rules discovered fixing Kagami section invisibility bug
metadata:
  type: feedback
  originSessionId: 74775e0d-977a-4d89-a045-5fa1449d1178
---

Three rules from 2026-05-20 Kagami section debug:

**Rule 1 — GSAP filter + overflow:hidden = invisible:** Never use `filter:` property (blur/brightness/contrast) in `gsap.from()`/`gsap.to()` inside an `overflow:hidden` container. Browser compositor freezes the element permanently invisible. Use `opacity` + `scale` + `y` only for scroll-reveal animations.

**Rule 2 — toggleActions programmatic scroll miss:** GSAP `toggleActions:'play none none reverse'` only fires when a user physically crosses the trigger line scrolling. Programmatic `scrollTo()` / `scrollIntoView()` does NOT fire it. Always add `onRefresh: self => { if (self.progress > 0.01 && self.animation) self.animation.progress(1, true) }` as guard.

**Rule 3 — Dark-bg preview screenshots are blind:** `preview_screenshot` on dark-bg pages returns solid black even when compositing bugs make elements invisible. Use `getComputedStyle(el).opacity` + `.transform` as ground truth for visibility verification.

**Why:** All three discovered in one bug: Kagami section cards invisible on page load. filter:blur was the primary cause; the other two were discovered during diagnosis.

**How to apply:** Before shipping any design HTML with GSAP scroll animations — grep for filter: in from/to, add onRefresh guard to all toggleActions triggers, verify dark-bg visibility via getComputedStyle not screenshot.
