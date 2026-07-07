# Supabase GoTrue — Native External OAuth Providers

**Lane:** GotrueProviders (librarian) · **Date:** 2026-07-07
**Sources:** `supabase/auth` GitHub (`internal/api/provider/`, `example.env`, README), `supabase/supabase` docker-compose + kong.yml, developers.facebook.com

## Summary
GoTrue natively supports **25+ OAuth/Web3 providers**, incl. Google, Facebook, Apple, GitHub, GitLab, Azure, Discord, LinkedIn, Notion, Slack, Snapchat, Spotify, Twitch, Twitter(X), Zoom, WorkOS, Kakao, Figma, Bitbucket, Fly + Web3 (Solana/Ethereum). **Instagram and Threads are NOT native GoTrue providers** — no `instagram.go`/`threads.go` exist; they are separate Meta APIs requiring custom integration (connectors, not sign-in).

## Verified findings (with sources)
- **Provider list** — `supabase/auth` `internal/api/provider/` ships: apple, azure, bitbucket, discord, facebook, figma, fly, github, gitlab, google, kakao, keycloak, linkedin, notion, slack, snapchat, spotify, twitch, twitter, workos, zoom, web3. **No instagram.go / threads.go.**
- **Env var pattern** (`EXTERNAL_X_*`): `ENABLED` (bool), `CLIENT_ID` (req), `SECRET` (req), `REDIRECT_URI` (req).
- **Google** (from `example.env`): `GOTRUE_EXTERNAL_GOOGLE_ENABLED/CLIENT_ID/SECRET/REDIRECT_URI`.
- **Facebook**: `GOTRUE_EXTERNAL_FACEBOOK_ENABLED/CLIENT_ID/SECRET/REDIRECT_URI` + `GOTRUE_EXTERNAL_FACEBOOK_SKIP_NONCE_CHECK` (dev-only nonce skip).
- **Callback URL:** `${API_EXTERNAL_URL}/auth/v1/callback`, routed through **Kong gateway (port 54321)** to `http://auth:9999/`.
- **Instagram** (Meta docs): Instagram Graph API (OAuth2, professional accounts only); Basic Display API deprecated 2024-09-04, shut down **2024-12-04**. Not identity.
- **Threads** (Meta docs): OAuth2 auth-code, every request needs a user access token; not a GoTrue provider. Not identity.
- ⚠️ **Supabase changelog (week of 2026-07-06):** `API_EXTERNAL_URL` moving to include the `/auth/v1` path prefix (new format `http://localhost:8000/auth/v1`); `GOTRUE_JWT_ISSUER` becomes `${API_EXTERNAL_URL}`; OAuth redirect resolves to `/auth/v1/callback`; SAML routes move under `/auth/v1/sso/saml/*`. **Pin the GoTrue image version and verify the callback path against the running version.**

## Concrete config (extend existing `infra/docker-compose.yml auth:` from `.env`)
```yaml
# auth: environment: (add these, values from .env — never commit secrets)
GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_ENABLED}
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback
GOTRUE_EXTERNAL_FACEBOOK_ENABLED: ${FACEBOOK_ENABLED}
GOTRUE_EXTERNAL_FACEBOOK_CLIENT_ID: ${FACEBOOK_CLIENT_ID}
GOTRUE_EXTERNAL_FACEBOOK_SECRET: ${FACEBOOK_SECRET}
GOTRUE_EXTERNAL_FACEBOOK_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback
```

## Provider-support table (for NEXUS)
| Provider | Native GoTrue login? | Env prefix | Role in NEXUS |
|---|---|---|---|
| Google | ✅ yes | `GOTRUE_EXTERNAL_GOOGLE_` | **user sign-in** |
| Facebook | ✅ yes | `GOTRUE_EXTERNAL_FACEBOOK_` | **user sign-in** |
| Apple / GitHub / LinkedIn / X… | ✅ yes | `GOTRUE_EXTERNAL_<P>_` | optional future sign-in |
| **Instagram** | ❌ **no** | — | **connector only** (data) |
| **Threads** | ❌ **no** | — | **connector only** (data) |

## Gotchas & app-review gates
- Redirect URI must exactly match what's registered at Google/Meta AND the GoTrue `REDIRECT_URI`.
- Facebook `SKIP_NONCE_CHECK` is dev-only — do not ship it true.
- Instagram/Threads require Meta App Review + a linked Facebook Page / professional account — connector path, not login.

## Open questions
- Exact GoTrue image version pin vs the 2026-07-06 `/auth/v1` path change.
- Whether to enable Apple sign-in at launch (EU users) — low effort once Google/Facebook wired.
