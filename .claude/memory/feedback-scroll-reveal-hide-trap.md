---
name: feedback-scroll-reveal-hide-trap
description: Scroll-reveal opacity:0+IntersectionObserver can permanently hide content; ship visible-by-default, motion as enhancement
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["reveal", "opacity", "blank", "hidden", "intersectionobserver", "scroll", "not loading", "invisible", "html"]
  refs: ["[[feedback-nexus-memo-design-fixes]]"]
---

RULE  Scroll-reveal patterns are a content-hiding trap. A rule like `.nx-reveal{opacity:0;transform:translateY(...)}` revealed only when JS adds `.in` (via IntersectionObserver) can leave whole sections PERMANENTLY invisible if the observer never fires for lower/off-screen blocks — symptom: "the page renders fine but one section/table is blank," DOM present, zero JS errors. For SHIPPED HTML deliverables, make critical content VISIBLE BY DEFAULT and treat motion as progressive enhancement; never gate must-see content behind an observer that can silently no-op.

WHEN  Building any motion/scroll-reveal HTML deliverable (memos, decks, the future Nexus app surfaces).

DO  `opacity:1` default + reveal-on-scroll as enhancement; OR a guaranteed on-load fallback that adds `.in` to all reveal elements; always open the file in a REAL browser before calling it done.

DONT  Ship `opacity:0`-until-JS on content that must be seen. Don't trust that the observer fired everywhere.

WHY  This session: the 79-row master table stayed `opacity:0` because its reveal observer never fired in the owner's browser; fix was deleting the hide at source (`.nx-reveal{opacity:1}`).

SEE  [[feedback-nexus-memo-design-fixes]] · [[feedback-nexus-design-no-hud]] · [[feedback-harness-batch-and-headless]]
