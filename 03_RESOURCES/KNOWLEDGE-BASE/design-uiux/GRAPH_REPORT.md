# Design UI/UX Research Map

Scope: repositories, inspiration libraries, UX skill resources, and AI-assisted landing page builders/tutorials.

## What matters most

The strongest pattern across the sources is a three-step workflow:

1. Research proven patterns from galleries and design systems.
2. Encode structure first with sitemap and wireframe tools.
3. Refine with accessibility, content design, and conversion testing.

That gives us a practical internal database for building pages faster without turning the output into generic AI layouts.

## Core clusters

### 1. Inspiration Libraries

Best for scanning real-world landing pages, visual direction, and section patterns.

- [Lapa Ninja](https://www.lapa.ninja/) - large landing-page gallery with screenshots and video captures.
- [Land-book](https://land-book.com/) - curated website inspiration with filters by style and industry.
- [Mobbin](https://mobbin.com/) - reference library for real product screens and flows.
- [Page Flows](https://pageflows.com/) - annotated user-flow recordings for web, app, and email journeys.
- [Really Good Emails](https://reallygoodemails.com/) - searchable email pattern archive.
- [One Page Love](https://onepagelove.com/) - one-page and landing-page inspiration.
- [Awwwards](https://www.awwwards.com/) - award-style showcase for polished web experiences.
- [Dribbble](https://dribbble.com/) - component-level inspiration and exploratory visual ideas.
- [Behance](https://www.behance.net/) - portfolio and case-study style references.

### 2. Design Repositories and Systems

Best for reusable building blocks, accessibility defaults, and implementation-ready patterns.

- [shadcn/ui](https://github.com/shadcn-ui/ui) - copyable accessible React components.
- [Radix UI](https://github.com/radix-ui/primitives) - accessible primitives for custom design systems.
- [Material UI](https://github.com/mui/material-ui) - mature React component library with large ecosystem coverage.
- [Headless UI](https://github.com/tailwindlabs/headlessui) - unstyled accessible components for Tailwind workflows.
- [Atlassian Design System](https://atlassian.design/design-system/) - enterprise foundations, content, and AI patterns.
- [Shopify Polaris](https://polaris-react.shopify.com/) - commerce admin patterns and content guidance.
- [Carbon Design System](https://carbondesignsystem.com/) - IBM's accessible, code-linked system.
- [Adobe Spectrum](https://spectrum.adobe.com/) - Adobe's system for creative and marketing products.
- [Storybook](https://storybook.js.org/docs/) - isolated component states, docs, and edge-case coverage.
- [Ant Design](https://ant.design/docs/spec/overview/) - enterprise patterns and reusable templates.
- [Tailwind Plus UI Blocks](https://tailwindcss.com/plus) - ready-made page and component blocks.
- [Figma design system examples](https://www.figma.com/resource-library/design-system-examples/) - examples of mature systems in the wild.
- [Figma UI kits](https://help.figma.com/hc/en-us/articles/24037724065943-Start-designing-with-UI-kits) - curated starter kits and libraries.
- [Primer](https://github.com/primer) - GitHub's design system ecosystem.
- [GOV.UK Design System](https://design-system.service.gov.uk/) - strong public-sector patterns and content structure.
- [Material Design](https://m1.material.io/layout/principles.html) - hierarchy, grid, spacing, and accessibility foundations.
- [Fluent 2 Design System](https://fluent2.microsoft.design/design-principles) - adaptive, accessible cross-platform principles.

Curated meta-repositories:

- [Awesome Design](https://github.com/gztchan/awesome-design)
- [Awesome UI](https://github.com/kevindeasis/awesome-ui)
- [Awesome Design Systems](https://github.com/klaufel/awesome-design-systems)
- [Awesome Landing Page](https://github.com/nordicgiant2/awesome-landing-page)
- [Awesome Design Assets for Developers](https://github.com/noobnooc/awesome-design-dev)

### 3. UI/UX Skill Resources

Best for turning taste into rules the team can follow.

- [Baymard Homepage Benchmark](https://baymard.com/homepage-and-category-usability/benchmark/page-types/homepage/) - research-backed landing/homepage insights.
- [Baymard Checkout Research](https://baymard.com/research/checkout-usability) - friction reduction in conversion flows.
- [Smashing Magazine UX Guide](https://www.smashingmagazine.com/guides/ux-design/) - practical UX articles and landing page guidance.
- [NNGroup visual design principles PDF](https://media.nngroup.com/media/articles/attachments/Principles_Visual_Design-Letter.pdf) - concise hierarchy, balance, contrast, gestalt framework.
- [W3C WAI Page Structure](https://www.w3.org/WAI/tutorials/page-structure/)
- [W3C WAI Forms](https://www.w3.org/WAI/tutorials/forms/)
- [W3C WAI Contrast Minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [W3C WAI Link Purpose](https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html)
- [GOV.UK content design](https://www.gov.uk/guidance/content-design/what-is-content-design)
- [Atlassian content design](https://atlassian.design/get-started/content-design/)
- [Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Material accessibility](https://m1.material.io/usability/accessibility.html)
- [Microsoft Inclusive Design](https://inclusive.microsoft.design/)

### 4. AI Landing Page Builders and Tutorials

Best for the actual workflow of turning a prompt into a publishable page.

- [Framer AI / Wireframer](https://www.framer.com/solutions/landing-page-builder) - prompt to landing page with responsive publishing.
- [Webflow AI site builder](https://webflow.com/ai-site-builder) - prompt to multi-page site with theme controls.
- [Webflow AI help](https://help.webflow.com/hc/en-us/articles/38840145286035-Build-a-site-with-Webflow-s-AI-site-builder) - practical site-generation workflow.
- [Relume AI site builder](https://www.relume.io/) - prompt to sitemap, then wireframe, then style guide.
- [v0 text prompting](https://v0.dev/docs/text-prompting) - prompt-to-UI for React-style production interfaces.
- [How to prompt v0](https://vercel.com/blog/how-to-prompt-v0) - the best prompt framework found in this research.
- [Wix AI landing page builder](https://www.wix.com/landing-page-builder) - generator plus optimization tools.
- [Uizard](https://uizard.io/) - text prompt to editable prototypes.
- [Landingi Lunar](https://www.landingi.com/product/lunar/) - chat-to-generate and publish landing pages.
- [Unbounce optimization guidance](https://unbounce.com/landing-pages/optimize-with-smart-traffic-landing-page-variants/) - variant testing and conversion tuning.

## Practical workflow we should adopt

### Step 1: Structure first

Use Relume-style prompting or a manual sitemap before visual work.

### Step 2: Pull references

Search Lapa Ninja, Land-book, Mobbin, and the curated GitHub lists for relevant layouts, components, and section patterns.

### Step 3: Encode rules

Apply the skill sources:

- hierarchy and scannability
- form and CTA clarity
- accessibility and contrast
- short, plain-language copy
- mobile-first layout

### Step 4: Generate with AI

Use Framer, Webflow, v0, Wix, or Uizard depending on the target stack.

### Step 5: Test and tighten

Use Baymard, Unbounce-style variant thinking, and accessibility checks to remove friction.

## Prompt recipe

Use this structure when creating landing pages with AI:

```text
Build [specific page surface].
Used by [who], in [what moment], to [what outcome].
Constraints:
- platform / device
- visual tone
- layout assumptions
- accessibility requirements
- conversion goal
```

That is the common denominator across the best prompting guidance in the sources.

## Source-backed heuristics

- Keep the hero message narrow.
- Make the CTA obvious and singular.
- Use short forms with clear labels.
- Prefer one-column or very limited multi-column layouts on mobile.
- Show trust signals early.
- Do not use decorative imagery unless it supports the task.
- Treat accessibility as a default, not a later pass.

## Suggested internal database tags

- `inspiration`
- `design_system`
- `component_library`
- `accessibility`
- `content_design`
- `conversion`
- `landing_page`
- `prompting`
- `ai_builder`
- `wireframe`

## Recommended starting set

If we only seed the database with 16 sources, start here:

1. [Lapa Ninja](https://www.lapa.ninja/)
2. [Land-book](https://land-book.com/)
3. [Mobbin](https://mobbin.com/)
4. [Page Flows](https://pageflows.com/)
5. [One Page Love](https://onepagelove.com/)
6. [shadcn/ui](https://github.com/shadcn-ui/ui)
7. [Radix UI](https://github.com/radix-ui/primitives)
8. [Material UI](https://github.com/mui/material-ui)
9. [Atlassian Design System](https://atlassian.design/design-system/)
10. [Shopify Polaris](https://polaris-react.shopify.com/)
11. [GOV.UK Design System](https://design-system.service.gov.uk/)
12. [Baymard Homepage Benchmark](https://baymard.com/homepage-and-category-usability/benchmark/page-types/homepage/)
13. [NNGroup visual design principles](https://media.nngroup.com/media/articles/attachments/Principles_Visual_Design-Letter.pdf)
14. [W3C WAI page structure](https://www.w3.org/WAI/tutorials/page-structure/)
15. [Relume](https://www.relume.io/)
16. [v0 prompting guide](https://vercel.com/blog/how-to-prompt-v0)

## Notes on source quality

- Official docs and design systems were prioritized where available.
- Community blog posts were included only when they provided concrete workflow guidance.
- Search results with thin content or obvious SEO filler were excluded from the recommended set.
