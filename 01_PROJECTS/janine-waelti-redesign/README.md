# Janine Wälti — Website Redesign

A fresh, hand-built static design for [janinewaelti.ch](https://www.janinewaelti.ch/)
(Swiss copywriter + Human Design reader & workshops), intended to replace the
current WIX site and later deploy to **Hosttech**.

## Status

**Design draft v1** — visual direction + full page skeleton, ready for real
content and photos. All copy is German placeholder text you can replace.

> The live WIX site could not be scraped from the build sandbox (network policy
> + WIX bot protection block it), so this is an original design informed by the
> site's stated offering — not a 1:1 copy of the current layout. Send me the
> real texts/photos (or the current site content) and I'll wire them in.

## Preview locally

```bash
cd 01_PROJECTS/janine-waelti-redesign/site
python3 -m http.server 8099
# open http://localhost:8099  in Chrome
```

Or just open `site/index.html` directly in a browser (no build step, no
dependencies — plain HTML/CSS/JS).

## Files

```
site/
  index.html   — single-page layout (hero, two services, about, process,
                 testimonials, contact)
  styles.css   — design system (colors, type scale, components, responsive)
  script.js    — mobile nav + scroll reveal, no framework
```

## Design direction

- **Aesthetic:** warm editorial / personal-brand. Not a generic SaaS template.
- **Type:** Fraunces (display serif, has personality) + Instrument Sans (body).
- **Palette:** paper cream, terracotta/rust accent, deep forest section, blush.
- **Two-offer structure:** Copywriting (Texte) + Human Design (Readings/Workshops)
  given equal weight, since the brand spans both.
- **Motion:** scroll-reveal + hover lifts, respects `prefers-reduced-motion`.
- Fully responsive (desktop + mobile verified via screenshot).

## Open placeholders to fill

- Real portrait photos (2 slots marked "Foto folgt")
- Real about story / bio
- Real testimonials
- Exact service names + any pricing
- Social links (Instagram, LinkedIn), contact email
- Impressum + Datenschutz (legally required for a CH site)
- Contact-form backend (wire on Hosttech — static form is a placeholder)
```
