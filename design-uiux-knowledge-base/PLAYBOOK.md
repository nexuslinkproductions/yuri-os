# Design UI/UX Playbook

This is the operational layer for the source database.

## Goal

Build better landing pages faster by combining:

1. proven references
2. reusable systems
3. accessibility rules
4. AI generation
5. conversion testing

## Ranked workflow

### Tier 1: Highest leverage

1. Start with a reference library.
   - Use [Lapa Ninja](https://www.lapa.ninja/), [Land-book](https://land-book.com/), [Mobbin](https://mobbin.com/), [Page Flows](https://pageflows.com/), and [One Page Love](https://onepagelove.com/).
   - Reason: structure and section order matter before visual polish.
2. Lock the content structure.
   - Use [W3C page structure](https://www.w3.org/WAI/tutorials/page-structure/), [GOV.UK content design](https://www.gov.uk/guidance/content-design/what-is-content-design/), and [NNGroup visual design principles](https://media.nngroup.com/media/articles/attachments/Principles_Visual_Design-Letter.pdf).
   - Reason: this prevents beautiful but unusable pages.
3. Build from a system, not from scratch.
   - Use [shadcn/ui](https://github.com/shadcn-ui/ui), [Radix UI](https://github.com/radix-ui/primitives), [Storybook](https://storybook.js.org/docs/), [Material UI](https://github.com/mui/material-ui), or [Tailwind Plus](https://tailwindcss.com/plus).
   - Reason: component reuse raises speed and consistency.

### Tier 2: Strong leverage

4. Choose a domain-specific system.
   - Commerce: [Shopify Polaris](https://polaris-react.shopify.com/)
   - Enterprise: [Atlassian Design System](https://atlassian.design/design-system/), [Carbon](https://carbondesignsystem.com/), [Fluent 2](https://fluent2.microsoft.design/design-principles)
   - Creative / product suites: [Adobe Spectrum](https://spectrum.adobe.com/)
5. Encode accessibility early.
   - Use [W3C forms](https://www.w3.org/WAI/tutorials/forms/), [W3C contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), and [Microsoft Inclusive Design](https://inclusive.microsoft.design/).
   - Reason: accessibility fixes are expensive late.
6. Use AI to draft, not to decide.
   - Use [Relume](https://www.relume.io/), [Framer](https://www.framer.com/solutions/landing-page-builder), [Webflow AI](https://webflow.com/ai-site-builder), [v0](https://v0.dev/docs/text-prompting), [Uizard](https://uizard.io/), or [Wix](https://www.wix.com/landing-page-builder).
   - Reason: AI is fastest at first-pass layout and copy blocks.

### Tier 3: Validation

7. Test against conversion research.
   - Use [Baymard Homepage Benchmark](https://baymard.com/homepage-and-category-usability/benchmark/page-types/homepage/) and [Baymard Checkout Research](https://baymard.com/research/checkout-usability).
8. Tune variants and messaging.
   - Use [Unbounce optimization guidance](https://unbounce.com/landing-pages/optimize-with-smart-traffic-landing-page-variants/).
9. Compare against real-world screenshots and flows.
   - Use [Page Flows](https://pageflows.com/) and [Really Good Emails](https://reallygoodemails.com/).

## Prompt pattern

Use this shape for AI page generation:

```text
Build a [page type] for [audience] who need to [job].
Context: [where it will be used].
Goal: [primary conversion or task].
Constraints:
- platform
- layout
- tone
- accessibility
- content length
- CTA style
```

## Internal rules

- One primary action per screen.
- Hero copy must communicate value in one sentence.
- Use short labels and concrete buttons.
- Keep forms short and self-explanatory.
- Favor one-column mobile flow.
- Show trust signals early.
- Avoid decorative visuals that do not support comprehension.

## Recommended stacks

### Code-first landing pages

- `v0` + `shadcn/ui` + `Radix UI` + `Storybook`

### Marketing pages

- `Relume` + `Framer` + `Lapa Ninja` + `Baymard`

### Enterprise product surfaces

- `Atlassian Design System` + `Carbon` + `Fluent 2` + `Storybook`

### Ecommerce and merchant tools

- `Shopify Polaris` + `Baymard` + `Page Flows` + `GOV.UK content design`

## Database tags

- `inspiration`
- `flow`
- `email`
- `design_system`
- `component_library`
- `accessibility`
- `content_design`
- `conversion`
- `ai_builder`
- `prompting`

## Shortlist

If we are only going to keep 20 sources live, keep these first:

1. Lapa Ninja
2. Land-book
3. Mobbin
4. Page Flows
5. One Page Love
6. shadcn/ui
7. Radix UI
8. Storybook
9. Material UI
10. Tailwind Plus
11. Atlassian Design System
12. Shopify Polaris
13. Carbon Design System
14. Adobe Spectrum
15. GOV.UK Design System
16. Baymard Homepage Benchmark
17. NNGroup visual design principles
18. W3C page structure
19. Relume
20. v0 prompting guide
