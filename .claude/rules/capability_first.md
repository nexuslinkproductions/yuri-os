# CAPABILITY_FIRST — check YURI's own mechanisms before building new code

Sibling of the local-first research mandate (`research_pipeline.md`). That one says *check our DB
before going online*; this one says **check our MECHANISMS before building new code.**

Born from a real miss (2026-06-13): four external "innovations" were investigated for adoption when
YURI already had every one — `yuri-match` (global IDF / fuzzy recall), `openprocess-pool` (hazard-decay
staleness + composite attention mass), `computeU` (weighted energy composite), `filing-assessor`
(placement + staleness). They got forgotten because nothing surfaced them BY FUNCTION; the recall path
indexed files and sections, never "what do we already have for need X."

## THE MANDATE (non-negotiable)

Before building, importing, or designing any new primitive / mechanism / scorer / matcher / loop / parser:

1. Run `node _SYSTEM/Scripts/capability-recall.mjs "<need>"` — does YURI already have it?
   (`xref-query.mjs` now auto-surfaces ⚡ capability hits at the top of every query, so this also fires
   for free during normal navigation.)
2. If a registered capability serves the need → **USE IT.** Do not rebuild. Extend it if it falls short.
3. Build new ONLY when recall + xref return nothing — and then REGISTER it (next section).

Rebuilding a capability YURI already has is the same class of waste as going online before querying our DB.

## REGISTER EVERY NEW MECHANISM (auto-registration)

When you ship a new reusable mechanism, annotate it at the source so it never gets forgotten:

```
// @capability: <kebab-id>
// @serves: need phrase | synonym | the words someone would actually search
// @does: one line — what it actually does
// @use: when to reach for it instead of building
// @exports: mainFn, otherFn
```

Then run `node _SYSTEM/Scripts/capability-scan.mjs` to regenerate `_SYSTEM/capabilities.json`.
The registry is GENERATED from these tags — edit the tag at the mechanism, never the JSON by hand.

## SCOPE

- Applies to reusable mechanisms (scorers, matchers, gates, loops, parsers, registries) — not one-off task code.
- The registry is advisory recall, not an authority gate. But skipping the check before a build is a process violation.
