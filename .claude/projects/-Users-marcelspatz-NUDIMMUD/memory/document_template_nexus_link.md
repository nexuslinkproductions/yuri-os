---
name: Nexus Link Document Template — Legal Letter + Equipment Schedule
description: Reference template for branded, print-ready PDF documents combining equipment compensation schedules with formal legal letters
type: reference
originSessionId: 148d305b-f8a0-405b-ae20-bb97e0c295d3
---
## Template File
- **Source:** `/Users/marcelspatz/Downloads/formelles-schreiben-sageder-NLP.html`
- **Output:** `/Users/marcelspatz/Downloads/formelles-schreiben-sageder-NLP.pdf`
- **Generator:** Puppeteer (Node.js) via `/tmp/generate-pdf.js`

## Design Specification

### Brand Integration (Nexus Link Productions)
- **Header:** Dark void background (`#06060a`) with inline SVG logo (40px height in print), right-aligned metadata
- **Accent bar:** 3px gradient (purple → darker purple → void)
- **Color system:** Void/Deep bg, Purple (`#7c3aed`) primary, Cyan (`#00FFA7`) for highlights/demands
- **Typography:** Space Grotesk (headings), Outfit (body), JetBrains Mono (code)
- **Watermark:** Centered knot pattern at 5% opacity (absolute-positioned, z-index layered behind content)

### Page Structure
1. **Equipment Schedule (Page 1):** Tables with equipment details, costs, subtotals, savings callouts
2. **Legal Letter (Pages 2–3):** 
   - Numbered sections (§1–7) with purple badges
   - Statute quotes with purple left border (indented)
   - Demand box with cyan left border and cyan circular bullets
   - Signature receipt section (two-column sig block with role labels)
   - Legal footer (statute references)
   - Page number (right-aligned)

### Critical CSS Fixes
1. **`overflow: visible` on `.page` in print mode** — prevents bottom-content clipping (was the main cutoff issue)
2. **Margin overrides in puppeteer** — `margin: { top: '0', ... }` to control print spacing without CSS `@page` conflicts
3. **No `format: 'A4'` in puppeteer** — let CSS `@page` control sizing
4. **Print-specific compaction** — reduced font sizes, padding, margins to fit 3 pages

### PDF Generation (Puppeteer)
```javascript
const puppeteer = require('/tmp/node_modules/puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('file:///<PATH_TO_HTML>', { waitUntil: 'networkidle0' });
  await page.pdf({
    path: '<OUTPUT_PDF>',
    printBackground: true,
    displayHeaderFooter: false,
    margin: { top: '0', bottom: '0', left: '0', right: '0' }
    // No format — CSS @page controls sizing
  });
  await browser.close();
})();
```

### Key Lessons
- **Print CSS `@media print`:** Font sizes, padding, margins all reduce significantly (10.5px body vs 13.5px screen)
- **Page breaks:** `page-break-before: always; break-before: always;` on `.print-break` div forces pagination reliably in puppeteer
- **Content overflow:** `overflow: hidden` clips bottom content; use `overflow: visible` in print mode
- **Margins:** Puppeteer's margin settings override CSS `@page { margin }` — be explicit
- **Colors:** Use `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on every colored element to force print reproduction

### File Assets
- **Logo (inline SVG):** Embedded directly in HTML (no external dependencies)
- **Fonts:** Google Fonts CDN (Space Grotesk, Outfit)
- **Watermark (inline SVG):** Knot pattern embedded; use `fill: #7c3aed` for color

### Reuse Notes
- Single HTML file = no external dependencies
- Fully self-contained; portable across systems
- Print-optimized for A4 (210mm × 297mm)
- 3-page format suitable for formal legal/business documents
- Compact sig block includes two-party signature areas + date fields + receipt text

### When This Works Well
- Formal letters with equipment/financial schedules
- Multi-party signature requirements
- Brand-heavy legal documents
- Print-first delivery (physical copies)
