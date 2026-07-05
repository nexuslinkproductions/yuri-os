# Nexus Link — Analytics + Ad-API READ-First Research

**Date:** 2026-07-05
**Provenance:** 3-angle Workflow fan-out → 4 adversarial verifications → synthesis (8 agents, 617k tokens, 118 tool-uses, ~15 min). Run ID `wf_a7dd81a6-5bd`. Sibling to `nexus-social-connect-deep-research-2026-07-05.md` (organic social OAuth + MCP).
**Reframe (owner, this session):** connecting socials is for **communications (unified inbox + replies)** + **analytics (organic + ad)** → one digital-overview dashboard. Bulk feed **publishing is deferred**. So: READ is primary, messaging-WRITE (reply, not post) is secondary, feed-publish-WRITE is deferred.

---

## 1. THE CORRECTION (verified, load-bearing)

**Read-only does NOT shorten the external review gate on the platforms that matter.** App Review / Marketing-API access tiers / developer-token ladders are **orthogonal to read-vs-write**.

| Platform | Does READ-only shorten the gate? |
|---|---|
| Meta (ads_read, read_insights, instagram_manage_insights) | **No** — App Review + Marketing-API Access Tier is the same. |
| Google Ads (single `adwords` scope, no read/write split) | **No** — developer-token ladder identical for "Reporting" permissible use. |
| TikTok | **Partial** — Sandbox gives MOCK read without review; live read needs the same Standard review as write. |
| LinkedIn Campaign Manager | **YES** — READ is UNLIMITED at the Development tier (Dev limits only CREATE/EDIT). Most favorable gate. |
| Reddit Ads | **YES** — "open to all developers," no tier, no review for READ. Lowest friction. |
| X Ads | **No** — Standard Access (the only tier with Analytics READ) via Ads API Access Form. |

**Same pattern on organic analytics:** `read_insights`, `instagram_manage_insights`, `r_organization_social`, TikTok `video.list` ALL require App Review — read-only avoids the scope, not the review. Only **X public_metrics (Bearer token)** and **YouTube Analytics (`yt-analytics.readonly`)** deliver substantial organic reach on lighter gates.

**NET:** the external-gate timeline for Meta + Google + LinkedIn-organic + TikTok is **brought FORWARD, not deferred**, by read-first. Budget **1–3 months of parallel reviews starting day one.** What read-first DOES buy: less screencast-demo burden per scope, narrower use-case statements (Google "Reporting"), cleaner blast radius — not calendar time.

---

## 2. Build order INVERTS — ship-the-pipeline-fast beats connect-for-value

| # | Platform | Ship latency | Why |
|---|---|---|---|
| 1 | **Reddit Ads** | hours | no gate — validates OAuth2 → Reporting → Rust engine → dashboard end-to-end |
| 2 | **LinkedIn Ads** | days | Dev-tier READ-unlimited, no App Review |
| 3 | **X organic public_metrics + YouTube Analytics** | weeks | Bearer token / `yt-analytics.readonly`, no heavy review |
| 4 | **Meta Ads + IG** | weeks | burn 500 dev calls <15% err → Full-Access review; run parallel with FB/IG organic review |
| 5 | **Google Ads** | weeks | Test → Explorer → Basic ladder, brand verification, apply under "Reporting" |
| 6 | **TikTok** | 2–6 wks | build against Sandbox mock first; sequence behind LinkedIn/Reddit for live validation |
| 7 | **X Ads** | weeks | OAuth 1.0a adapter, lowest stability confidence, build last |

Owner's value-P0 (Meta + Google Ads) stays value-P0 but is **not** the first thing that ships to the dashboard. Engineering validation (Reddit, LinkedIn) ahead of customer value (Meta, Google).

---

## 3. Canonical metrics model (the from-scratch math layer)

The Rust engine today is **Lead-centric** (`LeadFeatures`, `lead_score`, `attribute` with loose `(String,f64)` tuples) — NO canonical Metric/DataPoint/SocialPost entity. But `Money{Decimal,ISO-4217}→(i64 cents, TEXT)` and the time-decay `attribute()` are reusable primitives matching GA4 / Northbeam prior art.

**Model: GA4-style EVENT with typed value-union, dimensions-first-class.** Two entities emit into ONE time-series table.

**Entity 1 — SocialPost (organic, flat: 1 post = 1 row):** `{post_id, profile_id, network, post_type, content_category, created_at_utc_micros, metrics: SocialPostMetrics}`. Metrics carry impression-split (organic/viral/nonviral/paid/follower/nonfollower/unique/total) + engagement decomposition (likes/reactions/comments/shares/saves/link_clicks/exits) + engagement_rate (COMPUTED). `posts__lifetime_*` = monotonically-increasing cumulative (OVERWRITE on refresh).

**Entity 2 — AdNode (paid, hierarchical, depth-tagged):** `{node_id, parent_id, depth(account|campaign|ad_group|ad|keyword_creative), platform, name, status, metrics}`.

**Shared contract — DataPoint (the row both emit):** `{entity_id, entity_type, platform, channel_type(organic|paid), metric_name, value: ValueUnion{int|float|cents_native+currency_native+cents_eur|ratio|text|ts_utc_micros}, dimensions(JSON), period(day|month|lifetime|event), metric_kind(counter|ratio|duration|currency|unique_count), aggregation_rule(sum|recompute_from_num_denom|non_aggregatable), freshness_window, captured_at_utc_micros}`.

**Currency + TZ:** dual-column `value_native_cents` + `currency_native(ISO-4217)` + `value_eur_cents`, FX-locked at day's rate at INGEST. **EUR reference** (EU-hosted, DACH SMBs) — the GA4 dual-currency pattern + Google Ads `cost_micros` integer-minor-units. Timestamps UTC i64 micros raw; source account tz is a dimension for display only.

**Aggregation rules (prevents the classic dashboard bug where SUM(daily unique reach) inflates monthly reach 3–5x):** counter→SUM; ratio→store num+denom, RECOMPUTE on aggregate; unique_count→NON-aggregatable (HLL/precise at query); duration→SUM; currency→SUM with normalization.

**Silent-zero defense (critical):** IG, TikTok, post-Nov-2025 FB return **empty data sets, not zeros**. Connector must assert each requested field came back and **fail-closed** on deprecated/omitted metric names (Meta deprecated a wave of Page Insights metrics Nov 15 2025; unpublished-Page data stored only 5 days). Empty-set must NOT aggregate as 0 — it corrupts engagement-rate denominators.

**Attribution layer (generalize `attribute()`):** replace loose `(String,f64)` tuples with typed `Touchpoint{channel, touchpoint_class(UpperFunnel|LowerFunnel|Direct), timestamp_utc_micros, is_view, is_verified_view}`. Implement LastTouch, **LastNonDirectTouch (MUST offer — every in-platform ad report defaults to this)**, Linear, + existing time-decay. `channel_prior()` becomes data-driven config, not hard-coded match. Northbeam funnel classes: Lower = {Direct, Organic Search, Paid Branded Search, Email/SMS}; Upper = {Paid Social, Paid Search non-brand, PMax, Organic Social, Affiliate, Influencer, Display}.

---

## 4. Multi-tenant silent killer — shared quota

Meta rate limits are **per-ad-account AND per-app**; Google rate limits are **per-developer-token**. In both cases, **one Nexus app token serves ALL tenants against ONE throttled quota.** Explorer tier (2,880 ops/d on production) is fine for one SMB, **fatal for a multi-tenant aggregator** — Nexus must climb to Basic (15,000 ops/d) before meaningful multi-tenant READ works. Scheduler must be a **priority queue keyed by (tenant_id, freshness_window, metric_kind)** with per-tenant fairness weights, not round-robin.

---

## 5. Communications inbox (the secondary WRITE pillar)

Owner confirmed: unified inbox merges DMs (IG/FB/WhatsApp/X/LinkedIn) + email (live Microsoft Graph) into one panel; WRITE = **reply**, not feed-post creation. Messaging scopes (`pages_messaging`, `instagram_manage_messages`, WhatsApp Cloud API) need the **same App Review** as organic — read-vs-write orthogonality applies here too. WhatsApp Cloud API outbound needs verified business + template approval. The unified-inbox pattern is well-trodden (Front, Missive, Hootsuite Inbox). Microsoft Graph `Mail.Send` already covers email reply on the live connector.

---

## 6. Three pillars (read-first scope)

1. **Unified Communications Inbox** — READ all channels + WRITE replies (DM/email). NOT feed publishing.
2. **Analytics ingestion (READ)** — organic social + ad performance → canonical DataPoint table → Rust attribution → digital-overview dashboard.
3. **Deferred** — bulk feed post/schedule/cross-post publishing (the original Wave-1 write path; parked, not cancelled).

---

## 7. Outbox-hardening prerequisite — DEMOTED

Read-first demotes the synchronous-outbox hardening (Wave 0 of the prior plan) off the critical path: a failed READ = retry next poll cycle (stale, not lost). The durable executor becomes a later concern when reply/schedule land. The NEW prerequisite is the **canonical metrics layer + ingestion scheduler** (priority queue, per-tenant fairness, silent-zero defense, fail-closed allowlists).

---

## 8. MCP verbs — READ-first

`/mcp` aggregator exposes READ verbs first, only READ for v1: `list_ad_accounts`, `list_campaigns` (AdNode tree), `get_ad_insights`, `list_social_profiles`, `get_social_post_metrics`, `get_page_analytics`, `get_aggregated_metrics` (the canonical DataPoint query). `reply` (messaging write) is the one write verb in scope. Defer `post_now`/`schedule`/`cross_post_with_overrides`. READ-first verb naming makes App-Review use-case statements narrower and more defensible.

---

## 9. Open questions (consolidated for owner — see chat)

1. **v1 customer profile** — B2B coaches (LinkedIn-heavy) vs B2C SMBs (Meta/Google/TikTok-heavy)? Decides platform priority + review-track emphasis + ad build order.
2. **Multi-tenant timing** — bake tier scaffold + per-tenant scheduler now (recommended) or single-tenant V1?
3. **X + Telegram scope** — X Ads is OAuth 1.0a + unstable; Telegram MTProto needs phone+code user session. Skip X Ads (organic-only) + Bot-API-only Telegram?
4. **Inbox channels for V1** — which DM channels first? (WhatsApp + IG + FB via Meta review, X DMs, LinkedIn mail, email via Graph.)
5. Currency reference: **EUR** (recommended, EU-hosted) vs USD.
6. Google Ads: apply for **Basic immediately** (5-day review, brand verification) vs validate on Explorer first.
7. Meta shared-quota: one Nexus app token + per-tenant priority scheduling (recommended) vs per-tenant tokens vs hybrid.
8. LinkedIn personal-profile analytics: Page-only (recommended) vs build socialMetadata shape once for later member-read.

---

*Companion: `nexus-social-connect-deep-research-2026-07-05.md` (organic OAuth + MCP decision) · `03_NEXUS-LINK/nexus-app/engine/crates/nexus-metrics/src/lib.rs` (Rust kernel to extend) · `03_NEXUS-LINK/business/NEXUS-MASTER-PLAN.md` §6 (math moat).*
