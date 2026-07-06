# CONTROL PACKET — W4 social intake adapter (deepseek-v4-pro lane)

GOAL: Build a READ-ONLY public-source social-sentiment intake adapter for the Observatory, modeled on the `last30days` MIT approach (public, no-auth, rate-limited sources only). It produces a normalized sentiment signal per crypto asset that the orchestrator can fold in as an extra factor. NO scraping of auth-walled or ToS-hostile sources.

GROUND FIRST (read these — do NOT guess signatures):
1. `_SYSTEM/Scripts/alpha-factor-library/adapters/perp-adapter.mjs` — THE adapter template. Copy its exact shape: `@capability` header block, injectable `setHttpGet(fn)`, SSRF guard (ALLOWED_HOSTS Set), error classes (VenueApiError/MappingError/SsrfError), `parseNum` at boundary (''→null), keyless, INV-1..9 contract in the header comment. Match this style precisely.
2. `_SYSTEM/Scripts/alpha-factor-library/adapters/coinbase-adapter.mjs` — second reference for the canonical output + SSRF.
3. `02_RESOURCES/RESEARCH/afl-field-lanes-2026-06-14/` — prior peer research on social-edge → signal pipelines + the SAFE public-source list (deepseek-social-edge). USE the source list there; do not invent endpoints.
4. `02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md` §4 constraints + §7 directives.

TARGET FILE (new): `_SYSTEM/Scripts/alpha-factor-library/adapters/social-adapter.mjs`

REQUIREMENTS / INV CONTRACT (all mandatory):
- INV-1 NO execution / NO writes to any external service — READ-ONLY GET only.
- INV-2 NO key reads (no fs reads of .env / secrets / credential files). Any optional API token comes from `process.env` ONLY, and the adapter MUST work keyless against at least one public source.
- INV-3 live public reads OK.
- Injectable `setHttpGet(fn)` where `fn(url, headers?) -> Promise<{status, headers, body}>`; default uses node:https. ALL network goes through it (offline-testable).
- SSRF guard: ALLOWED_HOSTS allowlist; reject private/link-local/metadata hosts (10./127./169.254./172.16-31./192.168./::1).
- `parseNum` at every numeric boundary (''→null, non-finite→null).
- Canonical output shape — `getSentiment(asset, opts?) -> Promise<{ asset, ts, score, magnitude, sampleCount, sources, raw? }>` where `score ∈ [-1,1]` (bearish→bullish), `magnitude ∈ [0,1]` (confidence/volume), `ts` = unix-SECONDS. Pure mappers exported separately (e.g. `mapPost`, `aggregateSentiment`) so they're unit-testable without network.
- A simple, transparent lexicon/heuristic sentiment scorer is fine (document it); do NOT add an ML dep or any new npm package.
- Pure ESM. Node built-ins only. No new dependencies.

ACCEPTANCE:
- `node --check _SYSTEM/Scripts/alpha-factor-library/adapters/social-adapter.mjs` passes.
- A `--test` block (run via `node social-adapter.mjs --test`) with an INJECTED mock httpGet runs deterministically and exits 0, asserting: keyless path works, score∈[-1,1], magnitude∈[0,1], ts is unix-seconds, SSRF denies a private host, parseNum maps ''→null.
- Self-test prints `N pass, 0 fail`.

TEST CMD: `node _SYSTEM/Scripts/alpha-factor-library/adapters/social-adapter.mjs --test`
ROLLBACK: delete the new file (nothing else touched).
AFTER WRITING: write the file, run node --check + --test yourself, report PASS/FAIL + exact counts + the public source(s) you used + a ≤8-line summary. DO NOT git commit. Your final message IS the result.
