# Improvement Backlog

## P0 - Make The Baseline Reliable

1. Add graceful map fallback when external Leaflet or tile providers are unavailable.
2. Add marker clustering for Vienna, Bern, Zurich, and local Swiss target clusters.
3. Add keyboard navigation for map markers and target cards.
4. Add last-updated timestamp and source freshness notes.
5. Add visible boundary note near contacts: official business routes only.

## P1 - Presentation Upgrade

1. Add scroll-triggered section reveals with subtle stagger.
2. Add target-selection transitions: fade/slide profile panel, animate marker pulse, update map smoothly.
3. Replace flat account cards with bento cards grouped by target type.
4. Add a cinematic “Swiss priority scan” section focused on Claudio’s region.
5. Add a proper briefing mode that hides internal notes and shows only client-facing narrative.
6. Add a print/export mode for PDF generation.

## P2 - Information Upgrade

1. Add confidence scores per contact route, source, and action plan.
2. Add buyer-role matrix per target.
3. Add first email / LinkedIn outreach draft per target, using only public business context.
4. Add decision tree: if contact is enterprise, go through official channel; if local/medium, use founder/operator route via official pages.
5. Add pipeline status fields: uncontacted, researched, warm intro possible, discovery queued, prototype candidate.
6. Add estimated effort and likely budget band per target.

## P3 - Advanced SITREP

1. Add Leaflet marker clustering or spiderfy.
2. Add map layers: enterprise, local/medium, energy, logistics, infrastructure, finance, healthcare.
3. Add geospatial heat rings for target density.
4. Add travel/meeting clusters around Claudio’s likely access region.
5. Add “route planning” view for a Switzerland outreach trip.
6. Add source-linked popups with official contact and first action directly inside the map.

## P4 - Productization

1. Extract data into JSON.
2. Build as React/Vite component instead of standalone HTML.
3. Add stateful saved filters and selected-account URL params.
4. Add CSV/Markdown import pipeline for new targets.
5. Add automated source validation.
6. Add PDF/DOCX generation pipeline.
