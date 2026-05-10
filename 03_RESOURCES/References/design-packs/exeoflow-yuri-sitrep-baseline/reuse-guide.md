# Reuse Guide

## When To Use

Use this pack when building:

- Target intelligence dashboards.
- Client-facing business development briefings.
- Public-source account dossiers.
- Regional opportunity maps.
- Enterprise workflow pitch surfaces.
- SITREP-style sales strategy pages.

## Required Sections

Every derivative should keep this basic sequence:

1. What this is.
2. How to use it.
3. Commercial path.
4. Target explorer.
5. Location / territory view.
6. Evidence and source anchors.
7. Next action / package close.

## Data Rules

- Public sources only.
- Official company contact channels only.
- No private personal contact data.
- No credentialed systems.
- No leaked databases.
- No sensitive non-public information.
- Every target needs a public signal, a first wedge, and a reasonable action plan.

## Design Rules

- Start with readability before adding visual density.
- Use cinematic depth, not clutter.
- Prefer one expanded account at a time.
- Use animation to guide attention, not decorate.
- Map must support pan and zoom if geography is central.
- Use filters to reduce cognitive load.
- Keep the first screen simple enough for a non-technical buyer.

## Build Notes

The current baseline is a standalone HTML file using:

- CSS custom properties.
- Google Fonts.
- Leaflet.
- OpenStreetMap/CARTO dark tiles.
- Inline target data.
- Vanilla JavaScript.

Recommended next implementation:

- Move target data to JSON.
- Port UI to React components.
- Use Framer Motion for reveals.
- Use Leaflet marker clustering.
- Add export mode.
- Add per-target route/status state.
