# Reference packs — anti-slop visual references

Imagery lane rule: REFERENCES FIRST, RENDER SECOND. No visual gets generated
from a bare text spec. Every render task anchors to 3–5 real editorial
references curated here (Pinterest-first, per Marcel).

## Access status (2026-07-29)

- Exa finds pin/board URLs + titles fine (`site:pinterest.com` queries).
- Pin pages are JS/CAPTCHA-walled for curl; image harvest runs through the
  October browser (eval extract of pinimg.com `/736x/` URLs, then curl the
  CDN direct).
- **OFFICIAL PATH (chosen): Pinterest API v5.** Setup steps in
  `PINTEREST-API.md` next to this file. Once Marcel's trial app is approved
  and the "NLP Content References" board exists, `/refs` harvests the board
  via `GET /v5/boards/{id}/pins` (direct pinimg originals, no login wall).
  Global discovery stays on Exa; the API owns the curated board.
- FALLBACK until the app is approved: October browser login (currently a
  login wall in that session, flag to Marcel).

## Style anchors (searched 2026-07-29 via Exa)

Boards/idea hubs to harvest once logged in:
- pinterest.com/ideas/minimal-data-visualization/932055498405/
- pinterest.com/ideas/dark-infographic/923069490911/
- pinterest.com/ideas/dark-theme-infographic/929214558711/
- pinterest.com/ideas/infographic-posters-design/955233007568/
- pinterest.com/ideas/minimalist-infographic-template-grid-layout/945504554308/
- pin: "WIRED Bloomberg Data Visualization Poster" (54324739241859696)
- pin: "Knowledge Graph UI for the Dark System" (9570217952536143)
- pin: "Minimalist information graphic, International typographic style" (1759287347840600)

## Style keywords for searches

"minimal dark data visualization" · "swiss international typographic style
poster" · "editorial infographic dark" · "Bloomberg/WIRED data poster" ·
"terminal UI aesthetic" · "monospace data poster" · "dark system dashboard UI"

## Anti-slop test (apply to every candidate render)

1. Would this look at home in a WIRED/Bloomberg graphic? If not, reject.
2. One idea per graphic, ≤25 words on it.
3. Grid-aligned, real typography (mono for numbers, grotesk for prose).
4. Flat or subtle glow only: no 3D bevels, no gradients-on-gradients, no
   glowing brain stock art, no robot hands.
5. Palette locked: #0d0b14 bg, #39d0ff cyan, #8b5cf6 violet, mono white text.
