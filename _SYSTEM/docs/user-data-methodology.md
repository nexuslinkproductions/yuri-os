# YURI User-Data Methodology — Enterprise-Grounded

**Status:** authority doc for Phases 0/2/4/6 of the user-data build. Build to this, not to vibes.
**Grounded in:** deep-research pass 2026-05-30 (6 angles, 30 sources fetched, 148 claims extracted, 25 adversarially verified 3-vote, 24 confirmed / 1 killed). Primary sources cited inline. Full report archived in the workflow transcript.

> Honest scope: angles **1 (event taxonomy), 3 (HEART), 6 (experimentation/flags)** are primary-source-verified 3-0. Angles **4 (privacy/GDPR specifics), 5 (small-N research channel)** and the **backlog-ranking** step are reasoned inference grounded on the authoritative sources we *fetched* (GDPR Art.5, EDPB by-design + pseudonymisation, ICO data-minimisation, NN/g triangulation) but were not deep-verified claim-by-claim in this pass. Flagged where used.

---

## 1. The five verified principles (and how YURI already meets — or must meet — each)

**P1 — Events are structured + exact-string-matched. Naming = Object + Action / [Noun]+[Past-tense verb], ONE fixed casing.**
`Song Played`, `song played`, `Played Song` are three different events; recasing/reordering fragments the data ([Amplitude data-planning-playbook](https://amplitude.com/docs/data/data-planning-playbook); [Segment Track spec](https://segment.com/docs/connections/spec/track/)). Binding rule is *consistency + enforcement*, not a specific casing pair (verification 2-1 on the exact pair).
→ **YURI action:** formalize a closed event taxonomy with fixed casing (see §2). Today's records carry `lane`/`decision`/`dominantTerm` but no canonical `event` name. Add one, from a frozen enum.

**P2 — Dynamic detail + free text NEVER in event names or in dynamic property *keys*; only in structured property *values* under a fixed predefined schema.** Dynamic keys (`feature_1:true`) create a new column per value and are unanalyzable; high-cardinality/free content belongs in predefined value fields ([Segment tracking-plan best-practices](https://segment.com/docs/protocols/tracking-plan/best-practices/)). *This is the load-bearing rule that keeps content/PII out of the stream.*
→ **YURI already does this**: the Privacy Gate v3 (`yuri-energy-trace.mjs` `validateRecord`) is a structural allow-list — strings permitted only at fixed root paths, numeric-only context, no dynamic keys. **Keep it. It is the enterprise best practice, enforced mechanically.** Do not loosen it.

**P3 — Event properties (per single instance) are distinct from user properties/traits (persistent until changed).**
([Amplitude](https://amplitude.com/docs/data/data-planning-playbook); [Segment Track spec](https://segment.com/docs/connections/spec/track/).)
→ **YURI mapping:** the **roster** (`user-roster.json`) = user traits (githubId, role, consent). The **trace records** = event properties (one gate evaluation). Keep them in separate stores; never copy traits into every event beyond the stable `user` key.

**P4 — Identity = one stable `userId`, exact-string matched, no coercion/fuzzy reconciliation. Assign each partner ONE stable id; don't rely on the system to merge near-misses.**
`user-456 != 456` ([PostHog identity-resolution](https://posthog.com/docs/product-analytics/identity-resolution)).
→ **YURI correction (important):** the `user` handle must be **set once at onboarding from `githubId`, persisted, and read verbatim** — NOT re-derived from a mutable display name each session (drift risk). `githubId` = the stable userId; `handle = normalizeHandle(githubId)` computed once and stored in both the roster and the local user config. The resolver reads the *persisted* handle.

**P5 — HEART + Goals→Signals→Metrics is the canonical UX-quality framework; pick metrics from goals, not ad hoc.**
HEART = Happiness, Engagement, Adoption, Retention, Task-success; operationalized by articulating a Goal → identifying Signals of success/failure → defining Metrics ([Rodden et al., CHI 2010](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); [Kerry Rodden](https://kerryrodden.com/heart/)).
→ **YURI action:** restructure the improvement backlog (Phase 6) as Goals→Signals→Metrics mapped to HEART (see §3). Friction signals stop being an ad-hoc reject-rate table.

**P6 — Feature flags decouple experience from deploy; percentage rollout + sticky-bucketing is how a cohort keeps the winning experience without reverting — the mechanism by which "users get updates from the feedback they generated."**
([Spotify Confidence](https://confidence.spotify.com/blog/feature-flags), corroborated Unleash/GrowthBook.) Mechanically it's "stay in your assigned bucket as it ramps to 100%," not telemetry mutating an individual in real time.
→ **YURI mapping:** for N=2, the `energy-weights.json` + per-user profile already approximates per-cohort config. **Do not build a flag platform for two users.** Park it; the "update" path is: backlog → you ship to `main` → users pull. Note the pattern for scale.

---

## 2. The YURI event taxonomy (frozen — Object + Action, Title Case)

Canonical `event` names (closed enum; recasing/reordering forbidden per P1):

| event | fires when | regime field |
|---|---|---|
| `Gate Evaluated` | every energy-gate evaluation on a dispatch | `observability` \| `action` |
| `Dispatch Recorded` | a dispatch traced (no real ΔU) | `observability` |
| `Proposal Rejected` | gate rejected a transition (ΔU > threshold) | `action` |
| `Proposal Accepted` | gate accepted a transition | `action` |
| `User Onboarded` | onboarding completes | n/a |
| `Session Started` | a user session begins | n/a |

**Event-property schema (numeric/enum only, fixed keys — P2):** `user` (stable handle), `event` (enum above), `regime` (enum), `lane` (enum), `decision` (`accept`|`reject`), `dominantTerm` (enum|null), `deltaU`, `U_before`, `U_after`, `componentContributions` (fixed numeric keys = the 9 weight terms), `timestamp`. All already gate-safe; `event` + `regime` are the additions (both added to `ALLOWED_STRING_PATHS`).

**User-trait schema (roster, persistent — P3):** `githubId`, `handle`, `displayName`, `role`, `consent{version,at}`, `dataBranch`, `registeredAt`. No event data. No secrets.

---

## 3. Backlog as Goals → Signals → Metrics → HEART (Phase 6)

Each friction signal maps to a HEART category and a goal; the backlog is ranked, not a flat dump.

| YURI Goal | HEART | Signal (from telemetry) | Metric |
|---|---|---|---|
| YURI accepts good work, rejects drift | Task-success | gate reject rate by lane (`regime:action`) | rejects / dispatches per lane |
| The gate isn't fighting the user | Happiness | high-ΔU rejections on user-initiated work | count of `Proposal Rejected` where dominantTerm = user-facing term |
| Users keep using YURI | Engagement / Retention | dispatch frequency per user over time | dispatches/day/user |
| New users get productive | Adoption | time/sessions to first accepted action | sessions before first `Proposal Accepted` |

**Ranking:** RICE/ICE on the derived items (Reach=users affected, Impact, Confidence, Effort). *Note: RICE and the non-HEART frameworks (North Star, AARRR, OKR) were requested but not primary-verified this pass — RICE is used as the well-known default, flag if it needs its own grounding pass.*

---

## 4. Privacy & consent — grounded on the authoritative texts (Phase 0/7)

Sources fetched (not deep-verified claim-by-claim this pass, but authoritative): [GDPR Art.5](https://gdpr-info.eu/art-5-gdpr/), [EDPB data-protection-by-design](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_201904_dataprotection_by_design_and_by_default_v2.0_en.pdf), [EDPB pseudonymisation 2025](https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf), [ICO data-minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/).

YURI posture, mapped:
- **Data minimisation (Art.5(1)(c))** → the Privacy Gate allow-list: only what's adequate, relevant, limited. Numeric-only. Already enforced.
- **Purpose limitation (Art.5(1)(b))** → CONSENT.md states the two purposes (product improvement + research) explicitly; data is used for nothing else.
- **Storage limitation (Art.5(1)(e))** → per-user daily files, owner can delete a user's folder on request.
- **Pseudonymisation (EDPB)** → the public zone (`toPublicZone`) already drops the `user`/lane identity to numeric ids; the data branch keeps the self-chosen handle (consented), public artifacts carry none.
- **Consent = explicit opt-in, recorded** → mandatory `I AGREE` at onboarding writes `consent{version,at}` to the roster before any attribution. Reversible (unset env, uninstall collector, ask for deletion).
- **What we never collect:** prompts, file contents, secrets, free text, paths — structurally impossible past the gate.

---

## 5. The honest small-N limitation (CRITICAL — protects the paper)

**N=2 is not statistically significant.** Netflix's bar — "enough participants to draw statistically meaningful conclusions" — explicitly does not hold at two users. We do **not** claim A/B statistical power from Marcel + Mike.

What the 2-user data legitimately is:
- **Descriptive / mechanistic evidence** — *does the energy gate actually descend on real traffic?* That's a mechanism demonstration, not a population inference. The paper's claim is "the gate behaves as designed on real-world dispatches," provable at N=2.
- **Qualitative design-partner / dogfooding signal** — high-bandwidth friction discovery, the recognized value of single-digit early-access cohorts. Triangulated with the quantitative trace ([NN/g triangulation](https://www.nngroup.com/articles/triangulation-better-research-results-using-multiple-ux-methods/)).
- **Per-user case studies**, not a powered experiment.

**Paper framing:** real-ΔU from 2 users = existence/mechanism evidence + qualitative triangulation, reported per-user with CIs on within-user distributions where N-of-dispatches supports it — never cross-user significance claims. This goes in the paper's §5 Honest Limitations. It is also why `regime` tagging matters: synthetic baseline (powered, many runs) vs real-traffic (descriptive, N=2) stay separate columns.

---

## 6. Deltas this forces into the approved plan

1. **Phase 0:** handle set once from `githubId`, persisted, read verbatim (P4 — kill identity drift). Roster = user-traits store (P3).
2. **Phase 2:** add canonical `event` field from the frozen enum (§2) alongside `regime`; both into `ALLOWED_STRING_PATHS`. Keep numeric-only allow-list (P2 — validated, don't touch).
3. **Phase 6:** backlog restructured to Goals→Signals→Metrics→HEART (§3) + RICE ranking, split by `regime`.
4. **Phase 7/CONSENT.md:** ground consent text on GDPR Art.5 purposes + minimisation + pseudonymisation (§4).
5. **Paper / new artifact:** §5 small-N honesty becomes a paragraph in the energy-landscape paper's Honest Limitations.

## Open follow-ups (parked, not blocking)

- Deep-verify the privacy/GDPR angle claim-by-claim (we have the primary URLs; this pass synthesized, didn't verify).
- Verify backlog-ranking frameworks (RICE/ICE/North Star/AARRR/OKR) if we scale past dogfooding.
- Define the minimum statistically-defensible N + method for when YURI grows past 2 users.
