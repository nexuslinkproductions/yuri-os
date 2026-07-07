# NEXUS-LINK — Web-App Auth: Research Synthesis & Next Plan of Action

**Date:** 2026-07-07 · **Author:** YURI (opus-fleet orchestration, 9-lane MURE sweep)
**Scope:** OAuth for the hosted NEXUS-LINK web app + the in-app AI-chat model decision
**Status:** Research complete → plan ready for build. **Do not start building until Marcel signs off on the decisions in §2.**

Lane reports (evidence): [`lanes/`](./lanes/) — OMP-OAUTH-SOURCE · NEXUS-AUTH-STATE · GOOGLE-SIGNIN-OIDC · META-OAUTH-SUITE · GOTRUE-PROVIDERS · OAUTH-SECURITY-BCP · CHAT-MODEL-DECISION · (Ollama) COMPETE + RISK.

---

## 1. TL;DR — what the research actually changed

Three decisions in your brain dump need correcting or confirming. All are evidence-backed and cross-checked across ≥2 independent model substrates.

1. **"OAuth logins for Google, Facebook, Instagram, Threads" — only two of those can be logins.**
   Google + Facebook are real federated **identity** providers ("Login with…"). **Instagram and Threads are NOT login providers** — they are data-access APIs (professional-account only). Instagram Basic Display (the old "login with Instagram") was **permanently shut down 2024-12-04**. So: IG + Threads become **connectors** (link-your-account-to-pull-data), never sign-in. GoTrue confirms this at the code level — it ships `google.go` + `facebook.go` but **no `instagram.go`/`threads.go`**. (META-OAUTH-SUITE, GOTRUE-PROVIDERS)

2. **Embedding the OMP + YURI CLI as the in-app user chat — killed. It's a category error, not a hard build.**
   Four independently fatal constraints: (a) OMP has no HTTP router — it's an in-process terminal harness; (b) headless Claude is banned by our own CLAUDE.md launch rule; (c) OMP's token model is single-operator with no per-user segregation; (d) **Anthropic's Feb-2026 Consumer Terms prohibit using a subscription's OAuth tokens inside a third-party product** — proxying your Claude/Cursor sub to paying tenants = ToS violation + account-ban risk, with your billing as the blast radius. Cursor tried BYO-subscription and **removed it under provider pressure**. OMP/YURI stays our internal build tool. (CHAT-MODEL-DECISION, RISK, COMPETE)

3. **Built-in model vs bring-your-own — they are NOT mutually exclusive; ship both, in order.**
   **Primary = built-in DeepSeek-Flash routed through us** (Option B). It IS the product promise ("no subscription needed"), zero friction for non-technical business owners, and costs a rounding error: **~$45/mo total at 200 customers** (DeepSeek-Flash $0.14/M in · $0.28/M out). The schema already anticipated this — `ai_workspace_config.key_mode` already supports `platform | byok | hybrid`, and `ai_usage_events` is a built metering ledger. **BYO-API-key (Option C) is a Phase-2 opt-in** for power users. They coexist naturally. (CHAT-MODEL-DECISION, COMPETE)
   ⚠️ **DSGVO optics:** DeepSeek is China-origin — for the German/Atilla market, offer an **EU-native fallback (e.g. Mistral)** as the default or a toggle. Decision needed (§2).

**Bottom line:** the funnel's **data model + security spine already exist** (migrations 00001–00003: workspaces, profiles, RLS, AES-GCM token vault, hash-chained audit log). The missing work is **runtime wiring**, not schema — plus one infra gap (§4).

---

## 2. Decisions needed from Marcel before building

| # | Decision | Recommendation | Blocks |
|---|----------|----------------|--------|
| D1 | IG/Threads as connectors-only (not logins) — accept? | Yes — it's the only technically valid option | Login UI scope |
| D2 | Kill OMP-embed-as-chat? | Yes — category error + ToS | Chat architecture |
| D3 | Built-in DeepSeek default + BYO Phase-2? | Yes | Chat Phase 1 |
| D4 | **DeepSeek vs EU-native (Mistral) for built-in** — DSGVO | Mistral EU default OR DeepSeek+EU-toggle; your call given Atilla's market | Chat Phase 1 |
| D5 | Which connectors are **launch-critical**? (drives Meta App Review timing — the longest pole, 4–8 wks) | Start Meta Business Verification NOW regardless | Connector Phase 3 |
| D6 | Hosted redirect domain (e.g. `app.nexuslink.eu`) | Pick early — redirect URIs are exact-match, changing later is painful | Phases 1 & 3 |

---

## 3. Current state (verified) — what's built vs missing

**The web app** = `03_NEXUS-LINK/nexus-app/` — Python stdlib server (`service/server.py`, no deps) serving a JS UI (`ui/app.js`), Rust `engine/` + `src-tauri/` as the production path. **Running now at http://127.0.0.1:8787/** (launched this session, HTTP 200, Microsoft connector live). This is the demo you can show in Comet.

| Surface | Status | Mechanism | Verdict for hosted web |
|---|---|---|---|
| **User sign-in / accounts** | ❌ **ABSENT** — app is fully open, no login, no auth middleware | — | **Build from scratch** (Phase 1) |
| Microsoft connector | ✅ LIVE | PKCE + loopback `http://localhost:{port}` + macOS Keychain | **Rebuild for hosted** (Phase 3) |
| Gmail/Google connector | ✅ built | same desktop pattern | Rebuild for hosted |
| Google / X / Threads / Apple connectors | 🟡 ready-stubs | awaiting client creds | Rebuild for hosted |
| Meta / WhatsApp connectors | 🔴 review-gated | Meta App Review required | Rebuild + app review |
| **DB schema (auth+tenant+tokens+audit)** | ✅ **BUILT** (migrations 00001–03) | workspaces · profiles (Better-Auth-shaped, FK-deferred) · workspace_members · ai_workspace_config · ai_usage_events · connector_accounts · connector_tokens (AES-GCM BYTEA) · audit.audit_log (hash-chained) · RLS via `app_current_workspace_id()` | **Reuse as-is** ✅ |
| Supabase stack (GoTrue/PostgREST/Kong/Studio) | 🟡 **wired but NOT running** | docker-compose defined; GoTrue disconnected from service | See §4 infra gap |

**Desktop → hosted-web gap (the core rebuild):** loopback redirect → **fixed HTTPS callback**; macOS Keychain → **Postgres AES-256-GCM at-rest + httpOnly session cookies**; single-operator → **per-tenant RLS via `SET LOCAL app.workspace_id`**; in-process refresh → **async refresh worker with rotation + reuse detection**. (NEXUS-AUTH-STATE, OAUTH-SECURITY-BCP, OMP-OAUTH-SOURCE)

---

## 4. Infra reality (blocker to flag)

The Supabase stack that the auth plan assumes **cannot start on this machine right now**: **Docker is not installed, Supabase CLI is not installed.** The Postgres that's "running" is a **bare native Homebrew Postgres on :5432** — NOT the Supabase stack (which lives on :54321/54322). GoTrue (the thing that brokers Google/Facebook login) needs the stack.

**Prod path (from README-SETUP):** dev = Supabase GoTrue; **prod = Hetzner EU + Better Auth**. The `profiles`/`workspace_members` schema is deliberately auth-provider-agnostic so the GoTrue→Better-Auth swap is clean. **→ The auth wiring must abstract the auth provider, not hard-bind GoTrue.**

**Phase 0 owner action:** install **Docker Desktop** OR `brew install supabase/tap/supabase`, then `supabase start` (Option A, recommended) / `./infra/scripts/bootstrap.sh` (Option B) → applies migrations 00001–03 → GoTrue live on :54321.

---

## 5. Security spine (non-negotiable gates — apply to every flow)

From OAUTH-SECURITY-BCP (RFC 9700/7636/6749 + OWASP) + RISK enumeration. These are gates, not suggestions:

- **PKCE S256 on ALL flows** (even confidential). **`state` (CSRF) + `nonce` (OIDC)** every request, verified exact.
- **Redirect URI exact-match, pre-registered, HTTPS** — no wildcards, no subdomains, no `localhost`↔`127.0.0.1` confusion.
- **Tokens server-side, encrypted-at-rest (AES-256-GCM)** — never browser `localStorage`. Session = **httpOnly + Secure + SameSite** cookie holding a session-ref, not a raw JWT. Backend-for-Frontend pattern.
- **Refresh-token rotation + reuse detection** (revoke the whole token family on reuse) + serialized refresh (no race).
- **Multi-tenant isolation = RLS + `SET LOCAL app.workspace_id` on every request** — verify with **negative tests (tenant A ≠ tenant B) in CI** before any real data loads. This is the entire tenant security model.
- **Least-privilege scopes**, incremental; log scope grants; force re-auth on scope change.
- **The AI chat agent must NEVER receive raw connector tokens** — mint short-lived, scope-narrowed tokens on demand; token vault is write-only to the agent.
- Highest-severity design risk (RISK lane): the shared-CLI-credential hazard — already eliminated by killing OMP-embed (D2).

---

## 6. THE PLAN OF ACTION (phased, ordered)

Dependencies are real: Phase 0 gates 1; 1 gates the rest. Within a phase, items parallelize.

### Phase 0 — Infra bring-up *(prereq; owner + verify)*
0.1 Install Docker Desktop **or** Supabase CLI (§4). 0.2 `supabase start` / `bootstrap.sh`; apply migrations 00001–03. 0.3 Verify GoTrue :54321, Studio :54323, Postgres :54322. 0.4 Decide dev-secrets in `.env` (never commit).
**Exit:** GoTrue reachable; schema applied; `nexus-dev` seed workspace present.

### Phase 1 — User sign-in (auth runtime wiring) — *the headline deliverable*
Owner actions (can't be automated): register **Google Cloud OAuth web client** (consent screen + redirect `${API_EXTERNAL_URL}/auth/v1/callback`) and **Meta app w/ Facebook Login** (start Business Verification). Build:
1.1 GoTrue env: `GOTRUE_EXTERNAL_GOOGLE_ENABLED/CLIENT_ID/SECRET/REDIRECT_URI` + `GOTRUE_EXTERNAL_FACEBOOK_*` added to `infra/docker-compose.yml auth:` from `.env`.
1.2 Email/password signup + "Login with Google" + "Login with Facebook" UI (login/register screens — the app has none today).
1.3 **Auth middleware in the service**: validate GoTrue JWT → resolve workspace → `SET LOCAL app.workspace_id` per request. Abstract behind an interface (GoTrue now / Better Auth later).
1.4 Session cookies (httpOnly/Secure/SameSite); logout; the security gates in §5.
**Exit:** a user can register + log in with email/Google/Facebook; every API call is tenant-scoped; negative RLS tests green.

### Phase 2 — Built-in AI chat (the "no subscription needed" promise)
2.1 Server-side model key (DeepSeek-Flash **or** Mistral-EU per D4) in secrets. 2.2 Chat endpoint with **SSE streaming**. 2.3 Meter every call into `ai_usage_events` (prompt/completion tokens, `request_id` idempotency); enforce `ai_workspace_config` caps. 2.4 Chat UI surface.
**Exit:** any logged-in workspace can chat; usage metered per workspace; cost dashboarded.

### Phase 3 — Hosted connectors (rebuild off desktop) — *start Meta review NOW*
3.1 Replace loopback with fixed HTTPS callback `/auth/callback/{provider}`; state+PKCE; tenant from session. 3.2 Write tokens to `connector_tokens` **AES-GCM vault** (not Keychain). 3.3 Central **refresh worker** (rotation + reuse detection + 24h-before-expiry). 3.4 Port Google + Facebook/Instagram/Threads connectors onto this. 3.5 **Meta Business Verification + App Review** (D5) — longest pole, do first.
**Exit:** a tenant links Google/Meta/IG/Threads via hosted flow; tokens vaulted; data pulls into the funnel.

### Phase 4 — BYO-key opt-in (power users)
4.1 Settings UI (`key_mode = byok|hybrid`). 4.2 Encrypted per-workspace key storage. 4.3 Multi-provider routing (Claude/OpenAI/etc. via user's own key or sanctioned OAuth — NOT personal-sub proxy).
**Exit:** a workspace can switch to its own key; platform default still available.

### Phase 5 — Production migration
5.1 `pg_dump` local → Hetzner Postgres 17. 5.2 Swap GoTrue → **Better Auth** (interface from 1.3 makes this mechanical; RLS unchanged). 5.3 Fastify API on Coolify; real domain + TLS; production redirect URIs.
**Exit:** live on Hetzner EU, DSGVO-clean.

---

## 7. Appendix — evidence map & model roster used

**Substrates (breadth-9, MURE):** OMP `task()` — explore ×2 (OMP source, auth census), librarian ×4 (Google, Meta, GoTrue, security-BCP), plan ×1 (chat decision). Ollama Cloud — nemotron-3-ultra (COMPETE), deepseek-v4-flash (RISK). GLM glm-5.2 refarch (bonus, appended if landed: [`lanes/GLM-REFARCH.md`](./lanes/GLM-REFARCH.md)).
**Cross-substrate agreement (high confidence):** built-in-model-default, kill-OMP-embed, IG/Threads-not-logins, and the desktop→hosted security migration were each corroborated independently by ≥2 lanes on different model families.

---
> **Update 12:28 CEST:** GLM glm-5.2 refarch bonus lane timed out twice (fleet wrapper); not produced. No gap — the target reference architecture is fully covered by `lanes/NEXUS-AUTH-STATE.md` (desktop→web gap table), `lanes/OAUTH-SECURITY-BCP.md` (migration mapping), and `lanes/OLLAMA-COMPETE.md` (architecture pattern). Plan stands on 9 delivered lanes across 3 substrates.
