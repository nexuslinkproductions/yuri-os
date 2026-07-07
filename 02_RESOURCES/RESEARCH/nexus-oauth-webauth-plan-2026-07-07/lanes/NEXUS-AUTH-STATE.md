# NEXUS-LINK — Current Auth/Connector State Audit

**Lane:** NexusAuthState (explore) · **Date:** 2026-07-07
**Source:** `03_NEXUS-LINK/nexus-app/service/` (server.py, connectors/*), `ui/app.js`, `03_NEXUS-LINK/infra/` (docker-compose, migrations, .env.example)

## Summary
Two OAuth surfaces exist conceptually; only one is built. **(1) Connector OAuth** (link external accounts to pull data): Microsoft + Gmail LIVE via PKCE + loopback + macOS Keychain; Google/X/Threads/Apple ready-stubs; Meta/WhatsApp review-gated. **(2) User sign-in: NONE** — the app is completely open/unauthenticated; `server.py` has no auth middleware, `ui/app.js` has no login. The Supabase stack (GoTrue + PostgREST + RLS) is wired in `infra/` but **disconnected** from the Python service. **DB schema is multi-tenant-ready** (workspaces, profiles, connector_accounts, connector_tokens with AES-GCM). Desktop pattern (loopback + Keychain + single-operator) is incompatible with hosted web.

## Verified findings
**User auth:** ABSENT. `server.py` routes are all open `/api/*` (health, forecast, metrics, connectors, calendar, MURE). No JWT validation, no session, no login UI. Single-operator assumption (developer's Keychain holds tokens).

**Connector OAuth:** PKCE S256 (RFC 7636) + loopback `http://127.0.0.1:{random-port}` + macOS Keychain (`security` CLI, service `com.nexuslink.app.{provider}`), in `service/connectors/_oauth.py` (shared helpers) + `microsoft.py` / `google.py`.
- Microsoft Graph: **LIVE** (delegated read/write scopes).
- Gmail: **LIVE** (`SupportsComms`).
- Google / X / Threads / Apple: **ready-stubs** (`stubs.py` — "OAuth ready, add credentials").
- Meta / WhatsApp: **review** (Meta App Review gated).

**Supabase stack (`infra/docker-compose.yml`):** Postgres 17 + GoTrue v2.189.0 + PostgREST + postgres-meta + Kong + Studio. Auth env vars templated (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, email signup). **Python service does not validate GoTrue tokens** — the two are not connected.

**DB schema (migrations 00001–00003):** multi-tenant-ready.
- 00001: `workspaces`, `profiles` (Better-Auth-compatible shape, auth.users FK **deferred** for GoTrue↔BetterAuth portability), `workspace_members`, `ai_workspace_config`, `ai_usage_events`; RLS on all via `app_current_workspace_id()` (`SET LOCAL app.workspace_id`); service_role bypass.
- 00002: `connector_accounts`, `connector_tokens` (**AES-GCM ciphertext, BYTEA never TEXT**), `conversations`, `conversation_messages`, `datapoints`, `social_posts` — all `workspace_id NOT NULL` + RLS.
- 00003: `audit.audit_log` (append-only, hash-chained RFC 6962, workspace_id first-class, PII triggers on connector_tokens/conversations; requires `SET LOCAL app.workspace_id`).
- Seed workspace: `nexus-dev`.

## Desktop→hosted-web gap
| Gap | Desktop | Hosted web |
|---|---|---|
| OAuth redirect | `http://127.0.0.1:{port}` loopback, runtime bind | `https://{app}/auth/callback/{provider}` fixed HTTPS |
| Token storage | macOS Keychain (subprocess) | Encrypted Postgres (`connector_tokens` AES-GCM) + httpOnly session cookie |
| User identity | single operator (implicit) | per-user registration/login + JWT + workspace scope |
| Tenant isolation | implicit (one machine) | explicit RLS via `app_current_workspace_id()` |
| Port binding | runtime SO_REUSEADDR | HTTPS reverse proxy, fixed 443 |

## Recommendations
1. **User sign-in:** wire GoTrue signup/login; registration UI; auth middleware validating JWT + setting `app.workspace_id`.
2. **Connector OAuth for web:** replace loopback with fixed HTTPS callback; store encrypted tokens in `connector_tokens`; centralized refresh job.
3. **Multi-tenant:** enforce RLS + auth middleware + `workspace_members` validation.
4. **Security:** refresh rotation + reuse detection, rate limiting, audit logging.

## Open questions
Tenant discovery on login · encryption key management (KMS/vault vs env) · transactional email delivery · session fixation defenses · workspace sharing/invites · token expiry/refresh scheduling.

**Reusable as-is:** the entire DB schema + RLS + audit spine. **Must be rebuilt for hosted:** all connector OAuth runtime + the (nonexistent) user-auth layer.
