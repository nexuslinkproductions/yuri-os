# Nexus Link — Social-Connect Foundation Deep Research

**Date:** 2026-07-05
**Provenance:** 5-angle Workflow fan-out → 10 adversarial verifications → synthesis (16 agents, 1.12M tokens, 244 tool-uses, ~29 min). Run ID `wf_e2f00c4a-bc8`. Findings are primary-sourced; FIVE original overclaims were corrected mid-flight by the verify stage.
**Question:** How do socials get linked via a web page that an internal DeepSeek agent lane can use? Do we need MCP connectors, or direct OAuth? What is the foundation to connect the owner's own socials now?
**Scope:** extends `03_NEXUS-LINK/nexus-app/tasks/provider-connectors-design-glm.md` (Workstream C, locked D-RAIL/D-META) from calendar-capability-only to the full social suite + the agent-facing seam.

---

## 1. Decision — the agent seam

**Build ONE Nexus-built aggregator MCP server** at `:8787/mcp` (Streamable-HTTP + OAuth 2.1 + RFC 7591 Dynamic Client Registration). Reject per-provider-MCP and REST-only.

**Why (load-bearing, primary-sourced):**
1. The MCP 2025-06-18 spec makes server-side validation, access-control, rate-limiting, output-sanitization a binding RFC-2119 **MUST**. That mandatory gateway IS the multi-tenant resale surface — built by contract, not retrofitted.
2. The official MCP registry has **ZERO** social servers; `modelcontextprotocol/servers` ships only 7 generic servers (everything/fetch/filesystem/git/memory/sequentialthinking/time — Slack+GDrive+Brave archived to community). Every social MCP in the wild is community-fragile (eclincher ~6★, Zernio ~6★, all stdio+long-lived-API-key). No incumbent to consume.
3. Remote Streamable-HTTP + OAuth/DCR is converged across Claude Code, Cursor (camelCase `streamableHttp`), VS Code, Continue, Cline. One endpoint = auto-consumable by every major agent client + the internal DeepSeek lane. (Correction: Claude **Desktop** uses the experimental `mcp-remote` bridge for JSON-remote; Cursor has open CLI bugs. Thesis holds, attributions need care.)
4. **DeepSeek `tool_calls` is OpenAI-Chat-Completion-compatible** — the same curated 7-verb schema serves MCP tools AND direct function-calling. Not mutually exclusive. (Caveat: DeepSeek strict mode rejects `minLength/maxLength/minItems/maxItems` and forces `required=all` + `additionalProperties:false` at every nesting level — run a thin normalizer, or non-strict.)

**Build shape:** `service/agent/social_aggregator_mcp.py` exposing 7 curated verbs over the canonical store + outbox. OAuth 2.1 at the MCP boundary maps session tokens → per-subscriber provider tokens (DPoP-bound, short-lived, never raw refresh tokens to the agent). Rate-limit + tier-gate at `tools/call`. **Curate, do not CRUD-dump** (jlowin, Christian Posta, arxiv 2507.16044).

**Curated verbs:** `post_now`, `schedule`, `draft`, `read_mentions`, `read_analytics`, `reply`, `cross_post_with_overrides`.

### Option scorecard (EV × reversibility × blast)

| Option | EV | Reversibility | Blast | Verdict |
|---|---|---|---|---|
| **Aggregator-MCP** (one Nexus MCP at /mcp) | **8.5** | high | medium | **BUILD** |
| REST + OpenAPI function-calling only | 5.0 | high | low | reject — no spec-mandated gateway; locks to function-calling clients; loses resale seam |
| Per-provider-MCP (N servers) | 3.5 | medium | high | reject — auth boundary ×N; breaks single-tenant-per-subscriber isolation; token bloat |

---

## 2. The single biggest gap before any social connector ships

The canonical-first → outbox → propagate spine (live for MS calendar) is the right shape (confirmed by Mixpost + Postiz prior art) **but it is a synchronous job-queue STUB, not a durable executor**: no retry/backoff, no `scheduled_at`, no crash-recovery sweep, no media state-machine. The `Connector` protocol (`base.py:23-27` — only `status()`+`auth_url()`) is too thin — must be extended with `post()`/`media_upload()`/`media_publish()` + typed errors.

**Hardening the outbox is the prerequisite, not the connectors.** (This dovetails with Workstream A4/A5 in the Phase-1 handoff — retry+dead-letter + background worker.)

---

## 3. The PKCE+loopback pattern fits ONLY some providers

The Microsoft pattern (`microsoft.py`: `_pkce` S256 64-char verifier, `HTTPServer(('127.0.0.1',0))`, `secrets.token_urlsafe(32)` state, `security`-CLI Keychain) is RFC 7636/8252/9700-correct and reusable — but cleanly fits only **Google/YouTube and X**.

| Provider | Fit | Divergence from microsoft.py |
|---|---|---|
| **Google/YouTube** | clean clone | swap SCOPES + authority; `access_type=offline` + `prompt=consent`; all-day events exclusive-end |
| **X (Twitter)** | clean clone | `offline.access` scope; ~2h access tokens, lazy refresh; client-driven RT rotation |
| **Instagram/Meta** | **loopback impossible** | webview-fragment intercept of `https://www.facebook.com/connect/login_success.html#access_token=`. (PKCE itself is NOT broken — only the loopback transport.) |
| **TikTok** | **confidential client** | `client_secret` required at `open.tiktokapis.com/v2/oauth/token/` — must live SERVER-SIDE in the :8787 service, NOT the Tauri binary |
| **LinkedIn** | **confidential-ish** | 3-legged; PKCE not enabled by default (support ticket); `redirect_uri` must be pinned exact (no floating port); scopes need review |
| **Reddit** | **script-app (owner)** / web-app (tenants) | owner: password-grant script app, no browser redirect (simplest). Tenants: web-app + auth-code + loopback |
| **Telegram** | **NOT OAuth** | Bot API: token in URL PATH (`api.telegram.org/bot<token>/METHOD`), separate `BotTokenConnector` base. Long-poll OR webhook, mutually exclusive. (Telegram Login is now a separate OIDC provider — don't conflate.) |

---

## 4. Per-platform priority + free-tier write reality

| Platform | Free tier writes? | Key gotcha | Priority |
|---|---|---|---|
| **Google/YouTube** | yes — 10k units/day per **GCP project** (not per user); `videos.insert` ~100 units | quota per-project → resale needs many projects / quota-increase; `youtube.upload` sensitive scope needs verification >100 users; **Testing-mode refresh tokens expire in 7 days** (publish to remove) | **P0** |
| **X** | yes — **write-only** 1,500 posts/mo via `POST /2/tweets` + media; **no read** on free. Basic $200/mo adds reads + 50k posts. Pro $5,000/mo | free 1,500/mo is **per-APP-ID shared across ALL users** → resale needs per-tenant app IDs or Basic tier | **P0** |
| **Instagram** | yes — requires Business/Creator account linked to a FB Page; App Review | two-step create-then-publish (container → poll → publish) needs media state-machine; long-lived token 60d, refresh only in 24h-60d window; resale needs System User tokens | **P0** |
| **TikTok** | conditional — Content Posting API needs per-app review | shortest token lifetime (24h) → refresh beat <24h; multi-step chunked upload; organic-write thin everywhere | **P0** |
| **LinkedIn** | conditional — `w_member_social` + `w_organization_social` both need review | redirect_uri exact-match; multi-step upload→UGC | **P1** |
| **Reddit** | yes — 100 QPM per client ID; `POST /api/submit`; mandatory User-Agent | **NEW gate:** "Responsible Builder Policy" approval before tokens issue; script-app wrong model for resale | **P1** |
| **Telegram** | yes — ~30 msg/s per bot, effectively unlimited | separate `BotTokenConnector` base; cleanest for resale (tenant provisions own bot via BotFather — zero app-level friction) | **P2** |
| **Meta/FB + WhatsApp** | conditional — per-tenant Business verification + App Review | same 60d token + System User path as IG; keep `state="review"` stubs until cleared | **P2** |

**Sequence by delta-from-microsoft.py (not reach):** Google + X (P0) → TikTok + LinkedIn (P1, service-side secret) → Reddit (P1) → Meta/IG (P2, webview) → Telegram (P2, separate base). Telegram is the fastest path to a **resale-ready** lane (zero app-level friction).

---

## 5. Security musts (binding)

1. **Keep the S256 PKCE primitive** — RFC 7636 §4.1 compliant; OAuth 2.1 elevates it to REQUIREMENT. Carry `_pkce()` verbatim into every social connector. (RFC 9700: servers supporting-but-not-requiring PKCE are downgrade-vulnerable.)
2. **Replace macOS-only `security`-CLI Keychain with the Rust `keyring` crate (v3.x)** exposed to Python via the Tauri/native bridge. Unifies Keychain/DPAPI/libsecret; future-proofs Windows/Linux; keeps secrets out of the Python process's reachable filesystem so the agent lane cannot exfiltrate via the local store. (OWASP MASVS-STORAGE: hardware-backed secure store, never plaintext/SQLite/config.)
3. **Nexus is a TOKEN BROKER, never a token pipe.** Keep provider refresh tokens vaulted locally; mint short-lived (5-15 min), scope-narrowed, **DPoP-bound (RFC 9449)** access tokens for the agent lane on demand; agent proves possession of its own ephemeral keypair per request. This is the single biggest design decision for resale — getting it wrong = a leaked agent credential impersonates every subscriber.
4. **Per-provider refresh cadence (Nexus owns rotation, atomic — write new RT to keyring BEFORE using old):** X (POST `/2/oauth2/token`, old RT burned) · Google (`access_type=offline`+`prompt=consent`, 7d death in Testing) · Meta/IG (no standard RT; renew via `GET /refresh_access_token` in 24h-60d window, ~50d launchd beat, 60d hard wall) · TikTok (<24h beat).
5. **State in keyring + 5-min TTL** on `self._pending[state]` → crash/restart fails-closed. (RFC 8252 §10: PKCE protects code, state protects session.)
6. **Tiered + incremental scopes**, not broad upfront. (Current MS connector requests Mail/Calendar/Contacts/Files all upfront — fine for desktop, blocks Google sensitive-scope verification + slows Meta review.)
7. **Dual-stack loopback bind** (`127.0.0.1` + `::1`); register the literal exactly for Meta/Google (RFC 8252 §7.3).

---

## 6. Multi-tenancy — bake in NOW

Postiz shape: `organizationId`/`customerId` on every row from day one. Retrofitting tenancy into a fan-out store is the classic unscheduled rewrite. The owner's resale goal makes this load-bearing, not speculative. The MCP aggregator's per-tenant token mapping is where this lands architecturally.

---

## 7. Resale blockers (external, weeks-long — NOT code; flag for owner now)

- **YouTube** — GCP quota planning (10k units/day per project) + sensitive-scope verification for `youtube.upload` (>100 users).
- **X** — free 1,500/mo is per-APP-ID shared across all users.
- **Meta** — per-tenant Business verification + App Review.
- **TikTok** — Content Posting API per-app review.
- **LinkedIn** — scope app review + verification; PKCE needs a support ticket.
- **Reddit** — Responsible Builder approval gate.
- **Telegram** — the ONLY platform with zero app-level resale friction.

---

## 8. Open questions for owner

1. **Resale model** — pooled shared app IDs (rate-limited free tier) vs dedicated per-tenant app IDs (paid, passed-through review costs)? Recommendation: build the tier scaffold now even if V1 is single-tenant.
2. **Google consent publication** — move from Testing → In production + pass sensitive-scope verification for `youtube.upload`? Acceptable for owner account; not for paid subs. Single biggest external YouTube blocker.
3. **TikTok secret placement** — confirm routing TikTok (+ LinkedIn until PKCE granted) through :8787 holding `client_secret` server-side, not the Tauri binary. Does :8787 stay running when Tauri closes (needed for <24h TikTok + 60d Meta refresh beats)?
4. **Meta System User vs User Token** — System User tokens mandatory for resale (avoid 60d reauth storms). Acceptable onboarding gate, or accept 60d reauth for V1?
5. **V1 platform scope** — confirm sequence Google+X → TikTok+LinkedIn → Reddit → Meta → Telegram. Move IG earlier for creator-economy priority? Bump Telegram for fastest resale lane?
6. **MCP hosted URL** — V1 is `localhost:8787/mcp`. Resale needs hosted (`mcp.nexuslink.app`) with OAuth 2.1 DCR discovery at `/.well-known/oauth-authorization-server`. In scope for resale MVP, or tenants run own Nexus + you resell DeepSeek access to their local :8787?

---

## 9. Claims corrected by adversarial verification (do not repeat)

- **Meta PKCE is NOT broken** — only the loopback transport is. Use webview-fragment intercept.
- **Telegram Bot API token is in the URL PATH**, not query param or Authorization header. Telegram Login is now a separate full OIDC provider.
- **X free tier is WRITE-ONLY, not write-removed** — 1,500 posts/mo, no read. Read was the casualty, not write.
- **eclincher is NOT the dominant/only inbox MCP** — Zernio is a shipping peer; both ~6★. The aggregator PATTERN is real; eclincher-as-dominant is marketing.
- **DeepSeek strict mode rejects** `string.minLength/maxLength` + `array.minItems/maxItems`, requires `required=all` + `additionalProperties:false` everywhere → real OpenAPI schemas need a normalizer.
- **Per-provider-MCP cost is TOKEN/context bloat** from N tool definitions, not connection latency; the host aggregates tool lists anyway. Real option-3 cost = deployment/versioning/auth-gate surface ×N.

---

*Companion local specs: `03_NEXUS-LINK/nexus-app/tasks/provider-connectors-design-glm.md` (Workstream C, ABC + Google/Meta design + owner checklists) · `docs/NEXUS-LINK-PHASE1-CURSOR-HANDOFF.md` · `03_NEXUS-LINK/business/NEXUS-MASTER-PLAN.md` §5 · `NEXUS-REASSESSMENT-AND-PLAN-2026-07-01.md` §3-4.*
