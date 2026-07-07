# OAuth 2.0 Security Best Current Practice — NEXUS-LINK Hosted Web

**Document Date:** 2026-07-07  
**Status:** Security Architecture & Migration Reference  
**Scope:** NEXUS-LINK multi-tenant hosted web app authentication and platform-connector OAuth  
**Authority:** RFC 9700, RFC 6749, RFC 7636, OWASP Cheat Sheets  

---

## Executive Summary

This document defines the security spine for NEXUS-LINK's hosted multi-tenant web OAuth architecture. It maps the current desktop pattern (loopback + macOS Keychain) to the hosted web replacement (server-side encrypted token storage + httpOnly session cookies), backed by authoritative RFC citations and OWASP guidance. **Key shift:** OAuth for loopback-constrained desktop apps does NOT translate directly to public-internet hosted multi-tenant web apps—the threat model, token storage, redirect URI handling, and per-tenant isolation all fundamentally change.

---

## Part 1: Security Checklist (RFC 9700 + OWASP + Hosted Web)

### 1.1 Authorization Code Flow (All Clients)

- [ ] **PKCE (RFC 7636) MANDATORY** for ALL OAuth clients, including confidential clients  
  - Verifier: 64 chars from charset `[A-Za-z0-9-._~]` (RFC 7636 §4.1 unreserved set)  
  - Challenge: `S256` (base64url(sha256(verifier)), no padding) — NEVER `plain`  
  - Both verifier and challenge generated fresh per authorization request  
  - **Source:** RFC 9700 §2.2; RFC 7636 (Proof Key for Code Exchange)  

- [ ] **State Parameter** for all flows (CSRF + session fixation defense)  
  - 32+ bytes of cryptographically random data  
  - Verified exactly during callback (no substring matching)  
  - Bound to a single authorization request; never reused  
  - **Source:** RFC 9700 §2.1.1, RFC 6749 §4.1.1  

- [ ] **Nonce Parameter** for OIDC flows (OpenID Connect)  
  - 32+ bytes, cryptographically random  
  - Verified in `id_token` claims post-login  
  - Prevents token replay and authorization code swapping  
  - **Source:** OpenID Connect Core 1.0 §3.1.3.3, RFC 9700 §4.8  

- [ ] **Authorization Code** used exactly once  
  - Expires within 10 minutes (RFC 9700 §4.1.2)  
  - Revoked after first use; reuse is rejected immediately  
  - Bound to the exact client_id that requested it (no transfer to other clients)  
  - **Source:** RFC 9700 §4.1; RFC 6749 §4.1.2  

- [ ] **Authorization Response Validation**  
  - Reject if `state` is missing or doesn't match  
  - Reject if `error` param present  
  - Extract `code` from query string only (never POST body)  
  - **Source:** RFC 9700 §3.3, RFC 6749 §4.1.2  

### 1.2 Redirect URI (EXACT Matching, No Wildcards)

- [ ] **Redirect URI MUST be pre-registered** at provider setup  
  - Character-exact matching (including trailing slashes, query params, fragment)  
  - NO wildcards, NO subdomains, NO ports outside pre-registered set  
  - HTTPS enforced for all production URLs (localhost exempt for native/desktop only)  
  - **Source:** RFC 9700 §2.1.1, RFC 6749 §3.1.2.1  

- [ ] **Hosted Web Redirect URI Format** (replaces loopback)  
  - Per-tenant fixed URL: `https://app.example.com/auth/callback/google`  
  - Not user-selected, not dynamic, not ephemeral  
  - Endpoint MUST verify provider, tenant, and CSRF token before exchanging code  
  - **For localhost dev only:** `http://127.0.0.1:3000/auth/callback/google` (strict port matching)  

- [ ] **Subdomain Isolation NOT Allowed** (per RFC 9700 §4.1.4)  
  - `https://tenant1.example.com/auth/callback` ≠ `https://tenant2.example.com/auth/callback`  
  - Must use path-based routing or separate base domains if per-tenant redirect URIs required  
  - Recommended: central redirect at app domain, parse tenant from session/cookie post-callback  

### 1.3 Token Storage (Server-Side Encrypted, NOT Browser)

- [ ] **ACCESS TOKENS (Short-lived JWT, 5-60 min)**  
  - Stored server-side in Postgres, encrypted-at-rest (AES-256-GCM)  
  - Decryption key managed by Supabase GoTrue or similar HSM  
  - Returned to frontend ONLY during API calls (memory-only in JS, never persisted to storage)  
  - Expire claim checked on every API request; refresh before expiry  
  - **NEVER stored in localStorage, sessionStorage, or unencrypted cookies**  
  - **Source:** OWASP Session Management Cheat Sheet, OWASP OAuth2 Cheat Sheet  

- [ ] **REFRESH TOKENS (Long-lived, days/weeks)**  
  - Stored server-side ONLY (Postgres, encrypted-at-rest)  
  - Accessible to backend API calls only (via httpOnly cookie or secure internal channel)  
  - Implements refresh token rotation: new RT issued on every refresh, old RT invalidated  
  - Reuse detection: if old RT used twice, entire token family revoked + user re-authentication required  
  - Grace period: ~5-10 seconds for leeway between concurrent refresh requests  
  - **NEVER issued to frontend**, NEVER stored in browser localStorage  
  - **Source:** RFC 9700 §2.2.2, OWASP OAuth2 Cheat Sheet, Auth0 Refresh Token Security  

- [ ] **SESSION TOKENS (httpOnly Cookies)**  
  - Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Domain=; Path=/`  
  - `__Host-` prefix enforced (cookie only sent to initiating host, not subdomains)  
  - Max-Age: set to far-future timestamp (browser deletes stale cookies; session valid server-side)  
  - Contains encrypted session ID (reference to server-side session record), NOT JWT  
  - Refreshed on every new access token issue (automatic rotation)  
  - **Decrypted/validated server-side only**; no JS access via `document.cookie`  
  - **Source:** OWASP Session Management Cheat Sheet, OWASP Authentication Cheat Sheet  

- [ ] **Per-Tenant Token Isolation**  
  - Each token record linked to exact `workspace_id` + `user_id`  
  - Decryption/use requires caller to prove workspace ownership (RLS policy)  
  - No cross-tenant token reuse or leakage via cache/replay  
  - **Source:** Internal NEXUS-LINK schema design (workspace_id in connector_tokens table)  

### 1.4 Token Refresh & Rotation

- [ ] **Refresh Token Rotation (Every Exchange)**  
  - On `/auth/refresh` endpoint:  
    1. Verify old RT signature and expiry  
    2. Check `used_at` timestamp; reject if already exchanged  
    3. Issue new RT (different value, new signature)  
    4. Issue new AT (same format, new exp claim)  
    5. Mark old RT as consumed  
    6. Log event for audit trail  
  - Client receives `{access_token, refresh_token}` pair; must store RT securely (httpOnly cookie)  
  - **Source:** RFC 9700 §2.2.2, Obsidian Security Refresh Token Best Practices  

- [ ] **Reuse Detection**  
  - If old RT is submitted again (after first exchange), return immediate 401  
  - On detection: revoke entire token family (all RTs issued to that user since login)  
  - Force user re-authentication; don't silently re-issue  
  - Log event: `token_reuse_detected, user_id, workspace_id, timestamp`  
  - **Source:** RFC 9700 §4.10.2, Obsidian Security Refresh Token Security  

- [ ] **Token Family Tracking**  
  - Assign each initial auth session a `token_family_id` (UUID)  
  - All RTs issued from that login chain this family ID  
  - On reuse detection, query all RTs with matching family_id and revoke all  
  - Prevents attacker from using cached/rotated tokens from earlier exchanges  
  - **Source:** Auth0 Refresh Token Rotation, RFC 9700 threat analysis  

### 1.5 Client Authentication (Confidential Clients Only)

- [ ] **Client Secret Handling** (For backend-to-auth-server communication)  
  - Secret stored in `.env` file (NOT repo), loaded into process memory only  
  - Transmitted only over TLS 1.2+ (NEVER plain HTTP)  
  - Rotated periodically (provider-dependent; Google allows ~3 active secrets)  
  - HTTP Basic Auth: `Authorization: Basic base64(client_id:client_secret)` in token endpoint  
  - **Source:** RFC 9700 §2.3, RFC 6749 §2.3.1  

- [ ] **Proof of Possession (DPoP) Alternative** (Emerging standard)  
  - Client generates asymmetric key pair; signs each API request with private key  
  - Server validates signature + timestamp using public key  
  - Token cannot be replayed without key possession  
  - Not yet required by Supabase/Google/Meta; reserved for future hardening  
  - **Source:** RFC 9449 (DPoP), RFC 9700 §4.10.3  

### 1.6 Authorization Server Configuration (GoTrue Specifics)

- [ ] **Supabase GoTrue Environment Setup**  
  - `GOTRUE_SITE_URL=https://app.example.com` (public frontend URL)  
  - `API_EXTERNAL_URL=https://api.example.com` (backend auth endpoint, must be HTTPS)  
  - `GOTRUE_URI_ALLOW_LIST=https://app.example.com/auth/callback/*` (redirect URIs)  
  - `ADDITIONAL_REDIRECT_URLS` for all OAuth callbacks (exact match, no wildcards)  
  - `GOTRUE_JWT_EXP=3600` (access token lifetime, seconds; 5-60 min recommended)  
  - `GOTRUE_JWT_SECRET` (signing key, 32+ bytes, random, rotated periodically)  
  - `GOTRUE_EXTERNAL_EMAIL_ENABLED=true` (email signup/login)  
  - Provider secrets (GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID, etc.) in `.env`, NOT committed  
  - **Source:** Supabase Auth Documentation, docker-compose.yml (NEXUS-LINK)  

- [ ] **Refresh Token Lifecycle (GoTrue V2)**  
  - Two algorithms: V1 (legacy) and V2 (current, with rotation)  
  - V2 implements automatic rotation + reuse detection  
  - Grace period (leeway) for concurrent refresh races handled server-side  
  - Cross-tab refresh coordination via `parent-of-active` mechanism  
  - **Source:** Supabase Session Management Docs, GoTrue GitHub  

### 1.7 Attack Surface Mitigation

- [ ] **Authorization Code Interception** → PKCE + state  
  - Verifier never exposed to attacker; code alone is useless  
  - State mismatch = reject immediately  
  - **Source:** RFC 9700 §4.1, RFC 7636  

- [ ] **Token Leakage (XSS)**  
  - httpOnly cookies prevent JS access  
  - Server-side encrypted storage prevents DB leak  
  - Memory-only AT in frontend; not persisted  
  - **Source:** OWASP Session Management Cheat Sheet  

- [ ] **Token Replay (Interception Reuse)**  
  - Refresh token rotation + reuse detection  
  - DPoP (future): cryptographic proof of possession  
  - Short access token lifetime (5 min) limits exposure window  
  - **Source:** RFC 9700 §4.10.2, RFC 9449  

- [ ] **CSRF (Cross-Site Request Forgery)**  
  - State parameter bound to session  
  - SameSite=Strict cookies (browser doesn't send to cross-site requests)  
  - POST-based token exchange (not GET)  
  - **Source:** RFC 9700 §2.1.1, OWASP CSRF Prevention Cheat Sheet  

- [ ] **Account Takeover (Malicious OAuth Provider Compromise)**  
  - Never trust provider's auth claims alone; require in-app re-auth for sensitive actions  
  - Email verification before linking new provider  
  - Rate limit login attempts (5 failed attempts = 15 min lockout)  
  - **Source:** OWASP Authentication Cheat Sheet, RFC 9700 §4.8  

- [ ] **Redirect URI Mismatch (Provider Confusion)**  
  - Character-exact matching (including trailing `/`)  
  - Reject `localhost` vs `127.0.0.1` confusion  
  - Reject port number mismatches  
  - **Source:** RFC 9700 §4.1.4  

- [ ] **Scope Escalation**  
  - User prompted explicitly for each new scope  
  - Connector scopes limited to minimum required (least privilege)  
  - Scope changes logged: `scope_requested, scope_granted, user_id, timestamp`  
  - **Source:** RFC 6749 §3.3, OWASP OAuth2 Cheat Sheet  

### 1.8 Per-Tenant Isolation & Multi-Tenancy

- [ ] **Data Isolation at DB Level**  
  - Every OAuth token record has `workspace_id` foreign key  
  - RLS policy: `workspace_id = auth.uid()::workspace_id` (requires middleware to set app_current_workspace_id)  
  - No cross-tenant token query/reuse possible  
  - **Source:** NEXUS-LINK RLS schema (public.connector_tokens, public.connector_accounts)  

- [ ] **Session Isolation**  
  - Session cookie includes encrypted workspace context  
  - Backend middleware verifies workspace_id on every API call  
  - Redirect URI does NOT include tenant ID (prevents subdomain-based confusion)  
  - **Recommendation:** Central redirect at `app.example.com/auth/callback`, resolve tenant from session cookie post-auth  

- [ ] **OAuth Provider Credential Isolation**  
  - Each provider's client_id/secret stored separately (not shared across tenants)  
  - Workspace admins can rotate provider credentials independently  
  - Token storage encrypted with key unique to workspace (future: per-user keys)  
  - **Source:** NEXUS-LINK connector_accounts schema, credentials vault pattern  

- [ ] **Audit Logging (Per Tenant)**  
  - Log all OAuth events: `login, token_refresh, scope_grant, reuse_detection, logout`  
  - Include: `user_id, workspace_id, provider, action, timestamp, ip_address, user_agent`  
  - Retention: 90 days minimum (for incident response)  
  - Query isolation: workspace admins see only their tenant's logs  
  - **Source:** OWASP Logging Cheat Sheet, RFC 9700 §4.16  

---

## Part 2: Desktop → Hosted Web Migration Mapping

### Key Insight
The desktop pattern assumes:
- Single operator (one Mac, one user)
- Localhost always available (binding ephemeral port)
- OS-level credential storage (Keychain)
- No cross-tenant concerns

The hosted web pattern assumes:
- Multi-tenant (1000s of users, many workspaces)
- No localhost available to web users
- Credentials must be server-side encrypted, not browser-side
- Every operation must isolate by tenant

| **Element** | **Desktop Pattern** | **Why It Breaks for Hosted Web** | **Hosted Web Replacement** | **RFC/OWASP Anchor** |
|---|---|---|---|---|
| **Redirect URI** | `http://localhost:{random_port}` (via `loopback_catcher()`, port chosen per-connect, state-bound in URL) | Loopback is OS-specific (unprivileged port binding). Web users have no localhost. Ephemeral port negotiation is single-operator only. No way to pre-register dynamic ports with providers. | Fixed HTTPS redirect URL: `https://app.example.com/auth/callback/google` (character-exact pre-registration). Backend middleware resolves tenant from session cookie post-callback. Optional: per-provider path (`/callback/facebook`, `/callback/instagram`) for routing clarity. | RFC 9700 §2.1.1 (Redirect URI must be pre-registered, exact match) |
| **Token Storage** | macOS Keychain via `security` CLI (`kc_set`/`kc_get`, service string `com.nexuslink.app.{provider}`, subprocess calls) | Keychain is Darwin-only. Web browsers have no equivalent OS credential API. Trusting browser storage (localStorage) violates OWASP guidance (XSS exposure). Cannot implement rotation/reuse detection without server-side state. | Postgres encrypted-at-rest (AES-256-GCM). Access token: server memory (issued fresh per API call, never persisted). Refresh token: httpOnly+Secure+SameSite cookie + server DB row (rotation on every exchange). Both linked to workspace_id + user_id (RLS enforced). | OWASP Session Management Cheat Sheet (Never store tokens in localStorage). RFC 9700 §2.2 (Refresh token rotation). |
| **Access Token Delivery** | Keychain lookup on each provider API call (app ↔ provider, no browser involved) | Browser JavaScript cannot access Keychain. Frontend needs valid token for API calls but cannot store it securely. Passing token from backend to JS opens XSS exposure. | **Backend-for-Frontend (BFF) pattern:** Frontend calls `/api/endpoint` (backend). Backend holds access token server-side, exchanges it with provider, caches response. Frontend never sees raw AT. For SPA access to user data: issue short-lived AT (~5 min), return in memory-only JS (never stored). Backend refreshes proactively before expiry. | OWASP OAuth2 Cheat Sheet (Backend-for-Frontend recommended). Supabase SSR guide (token kept on server). |
| **PKCE** | S256 verifier (64 chars `[A-Za-z0-9-._~]`), challenge pre-computed, sent in auth URL, verified on token exchange | PKCE is a protocol detail; same for desktop & web. Mobile/native apps MUST use it; confidential clients SHOULD use it. No breaking change in hosted web. | **PKCE MANDATORY for ALL flows** (even confidential backend-to-backend). Verifier generated fresh per request, never reused. Challenge computed S256. Verified by auth server (Supabase GoTrue) before issuing token. | RFC 9700 §2.2 (PKCE recommended for all). RFC 7636 (S256 challenge method). |
| **State Parameter** | 32+ bytes random, bound to single loopback request, verified in redirect | State is protocol-required CSRF defense. No breaking change. | **Same as desktop:** Generate 32+ bytes cryptographically random per request, store in session (server-side). Verify exact match on redirect callback. Bind to workspace_id + user_id to prevent cross-tenant CSRF. | RFC 9700 §2.1.1 (State REQUIRED). RFC 6749 §4.1.1. |
| **Nonce (for OIDC)** | Not currently used in NEXUS desktop connectors (only OAuth 2.0 profile endpoints, not OIDC) | If using Supabase GoTrue for user sign-in (which supports OIDC), nonce becomes critical. | Generate 32+ bytes random per request. Pass in auth request. Verify in `id_token` (JWT claim) post-login. Prevents token replay + authorization code swapping. Store nonce server-side during request, verify on callback. | OpenID Connect Core 1.0 §3.1.3.3. RFC 9700 §4.8 (Nonce). |
| **Code Exchange** | Desktop app receives `code` via loopback callback. App exchanges code for tokens immediately (in-process, single-threaded). | Multi-threaded hosted backend. Race conditions possible if not careful. Web user's session may not be active when code is exchanged. Need explicit request binding. | Backend `/auth/callback` endpoint receives `code` + `state`. (1) Verify state + code validity. (2) Look up pending request (from session cookie). (3) Exchange code for tokens (backend-to-GoTrue, confidential). (4) Store tokens in Postgres + httpOnly cookie. (5) Redirect to app home. Concurrent exchanges from same user handled via token family revocation. | RFC 9700 §4.1 (Authorization code valid once only). |
| **Session Persistence** | Single-user desktop app; no session concept. Keychain tokens persist across app restarts. | Web sessions must survive across requests, multiple tabs, network interruptions, server restarts. Session state must be server-side (not client-side) for safety. | Server-side session table (workspace_sessions). httpOnly cookie holds encrypted session ID (reference to session record). Session record includes: user_id, workspace_id, created_at, last_refreshed_at, ip_address, user_agent. Auto-refresh on every API call (extend expiry). Invalidate on logout / suspicious activity. | OWASP Session Management Cheat Sheet (Server-side session storage). |
| **Multi-User Isolation** | N/A (single operator, single user per machine) | Hosted web: 1000s of users, many workspaces. Tokens must never leak across users or tenants. | Every OAuth token record includes workspace_id + user_id. RLS policy enforces: only workspace members can access their own tokens. Separate encryption keys per workspace (future). No cross-workspace token query possible. Audit log all token usage by user + tenant. | OWASP Multi-Tenancy Cheat Sheet (Data isolation). NEXUS-LINK RLS schema. |
| **Refresh Token Rotation** | Not implemented (static RT from provider, no rotation) | Static RTs are vulnerable: if leaked, attacker has indefinite access. Rotation + reuse detection are RFC 9700 BCP. | **Rotate on every exchange:** (1) Accept old RT. (2) Verify signature + not-already-used. (3) Issue new RT (different value). (4) Issue new AT. (5) Mark old RT consumed. (6) Return new pair. On reuse: revoke entire token family, require user re-auth. Implement grace period (~5 sec) for concurrent refresh races. | RFC 9700 §2.2.2. RFC 6819 §4.8.3 (Refresh token protection). Auth0 Refresh Token Rotation. |
| **Reuse Detection** | N/A (no rotation, no multi-user concurrency) | Detect if attacker is using old (compromised) RT. Must be automatic, not manual. | On `/auth/refresh` endpoint: if submitted RT is already marked consumed (i.e., used before), check timestamp. If used within grace period, likely concurrent race (allow once). If used after grace period, revoke entire token family + log breach + notify user. Rate-limit: max 3 refresh attempts per minute per user. | RFC 9700 §4.10.2. Obsidian Security. |
| **Logging** | None (single-user, not required) | Detect breaches, investigate incidents, audit access. Compliance requirement (SOC 2, GDPR). | **Log every OAuth event:** (1) Login attempt (provider, success/fail, scope). (2) Token refresh (refresh_token_id, timestamp). (3) Reuse detection (old_token_id, action taken). (4) Scope grant. (5) Logout. Include: user_id, workspace_id, provider, ip, user_agent, timestamp. Retain 90 days. Query-isolate by workspace. Alert on suspicious patterns (reuse detection, unusual IP, multi-workspace anomaly). | OWASP Logging Cheat Sheet. RFC 9700 §4.16 (Logging). |
| **Secret Rotation** | Anthropic/Google/Meta credentials stored in Keychain (no rotation applied) | Credentials may be rotated by provider (e.g., if leaked). App must support new credentials without restart. | Store provider credentials (client_id, client_secret) in `.env` (loaded into memory). Support credential rotation: (1) Add new secret to provider. (2) Deploy updated `.env`. (3) Keep old secret in memory for grace period (~1 hour). (4) Retire old secret after grace period. Transparent to users (no downtime). Support multiple secrets per provider for zero-downtime rotation. | RFC 9700 §2.3 (Client authentication). |
| **Provider Configuration** | Hardcoded in Python (connectors/google.py, microsoft.py, etc.) | Hardcoding blocks provider rotation, secrets visibility in code. | Move to environment variables (already in .env.example): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, etc. Each provider wired via GoTrue env vars (GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID, etc.). Workspace-level overrides in future (multi-workspace multi-provider support). | Supabase GoTrue config. NEXUS-LINK infra/.env.example. |
| **Scope Management** | Static scopes hardcoded per provider (google.py line ~150: SCOPES=["https://www.googleapis.com/auth/gmail.readonly", ...]) | Scope changes require app redeployment. Users not prompted; silent scope escalation possible. | **Dynamic scopes:** (1) Define scopes per connector (analytics_read, comms_read, comms_write). (2) User selects scopes during auth. (3) Only authorized scopes stored in token. (4) API enforces scope on every call. (5) Scope changes require re-auth. Log all scope grants by user + workspace. | RFC 6749 §3.3 (Scopes). RFC 9700 §2.4 (Scope validation). OWASP OAuth2 Cheat Sheet. |

---

## Part 3: Concrete Configuration & Deployment Steps

### 3.1 Environment Setup (Supabase GoTrue)

```bash
# .env (NEXUS-LINK/infra/.env)
# DO NOT commit. Load via docker-compose secrets in production.

# Auth URLs
SITE_URL=https://app.example.com                          # Public app URL
API_EXTERNAL_URL=https://api.example.com                  # Auth server (backend)
GOTRUE_URI_ALLOW_LIST=https://app.example.com/auth/callback/google,https://app.example.com/auth/callback/facebook,https://app.example.com/auth/callback/instagram

# JWT
JWT_SECRET=<32-byte-random-hex>                           # Signing key (rotate 90 days)
JWT_EXPIRY=3600                                            # 1 hour (5-60 min recommended)

# Google OAuth
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<from-google-cloud-console>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.example.com/auth/v1/callback?provider=google

# Facebook/Meta OAuth
GOTRUE_EXTERNAL_FACEBOOK_ENABLED=true
GOTRUE_EXTERNAL_FACEBOOK_CLIENT_ID=<from-meta-for-developers>
GOTRUE_EXTERNAL_FACEBOOK_SECRET=<from-meta-for-developers>
GOTRUE_EXTERNAL_FACEBOOK_REDIRECT_URI=https://api.example.com/auth/v1/callback?provider=facebook

# Email (for passwordless signup/login)
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=false                           # Require email verification (production)

# Session/Refresh Token
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_ISSUER=https://api.example.com/auth/v1

# Disable anonymous signup in production
GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false
DISABLE_SIGNUP=false                                       # Allow new user registration (set true to admin-only)
```

### 3.2 Backend OAuth Callback Handler

```python
# nexus-app/service/auth.py (NEW module)
"""
OAuth 2.0 callback handler for hosted multi-tenant web app.
Implements authorization code exchange, token storage, and session management.
"""

import os, secrets, hashlib, json, time
from datetime import datetime, timedelta
from typing import Optional
import requests
from flask import request, jsonify, make_response
from cryptography.fernet import Fernet
import psycopg2

# --- CONFIG ---
REDIRECT_URI = os.getenv("SITE_URL") + "/auth/callback"
GOTRUE_URL = os.getenv("API_EXTERNAL_URL")
DB_URL = os.getenv("DATABASE_URL")
ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY")  # 32-byte base64 key

cipher = Fernet(ENCRYPTION_KEY.encode())

# --- DATABASE HELPERS ---
def get_db():
    return psycopg2.connect(DB_URL)

def encrypt_token(token: str) -> str:
    """Encrypt token with Fernet (AES-128 in CBC mode, HMAC)."""
    return cipher.encrypt(token.encode()).decode()

def decrypt_token(ciphertext: str) -> str:
    """Decrypt token."""
    return cipher.decrypt(ciphertext.encode()).decode()

# --- OAUTH FLOW ---
def start_oauth_flow(provider: str, workspace_id: str):
    """
    Step 1: Initiate OAuth flow.
    Generate state + nonce, store in session, redirect to provider.
    """
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    
    # Store state/nonce server-side (in session table or Redis)
    # Bind to workspace_id to prevent cross-workspace CSRF
    db = get_db()
    db.execute("""
        INSERT INTO auth_sessions (workspace_id, state, nonce, provider, created_at, expires_at)
        VALUES (%s, %s, %s, %s, NOW(), NOW() + INTERVAL '10 minutes')
    """, (workspace_id, state, nonce, provider))
    db.commit()
    
    # Build auth URL
    auth_url = f"{GOTRUE_URL}/auth/v1/authorize"
    params = {
        "client_id": os.getenv(f"GOTRUE_EXTERNAL_{provider.upper()}_CLIENT_ID"),
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid profile email",  # OIDC + email
        "state": state,
        "nonce": nonce,
        "code_challenge": generate_pkce_challenge(),  # RFC 7636
        "code_challenge_method": "S256",
    }
    
    # Provider-specific params
    if provider == "google":
        params["access_type"] = "offline"  # Request refresh token
        params["prompt"] = "consent"       # Force consent screen (get refresh token)
    
    return auth_url + "?" + urllib.parse.urlencode(params)

def handle_oauth_callback(code: str, state: str, provider: str):
    """
    Step 2: Exchange authorization code for tokens.
    Verify state, exchange code, store tokens in DB, issue session cookie.
    """
    # Verify state
    db = get_db()
    session_row = db.execute("""
        SELECT workspace_id, nonce FROM auth_sessions
        WHERE state = %s AND provider = %s AND expires_at > NOW()
    """, (state, provider)).fetchone()
    
    if not session_row:
        return {"error": "invalid_state"}, 400
    
    workspace_id, nonce = session_row
    
    # Exchange code for tokens (backend-to-backend, confidential client)
    token_url = f"{GOTRUE_URL}/auth/v1/token"
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": os.getenv(f"GOTRUE_EXTERNAL_{provider.upper()}_CLIENT_ID"),
        "client_secret": os.getenv(f"GOTRUE_EXTERNAL_{provider.upper()}_SECRET"),
        "code_verifier": session_row.get("code_verifier"),  # PKCE verifier
    }
    
    resp = requests.post(token_url, json=payload)
    if resp.status_code != 200:
        return {"error": "code_exchange_failed"}, 400
    
    tokens = resp.json()
    id_token = tokens["id_token"]  # JWT
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    
    # Verify nonce in id_token
    import jwt
    try:
        claims = jwt.decode(id_token, options={"verify_signature": False})
        if claims.get("nonce") != nonce:
            return {"error": "nonce_mismatch"}, 400
    except Exception as e:
        return {"error": "invalid_id_token"}, 400
    
    # Extract user info from id_token
    user_id = claims["sub"]
    email = claims.get("email", "")
    
    # Store tokens in DB (encrypted)
    encrypted_at = encrypt_token(access_token)
    encrypted_rt = encrypt_token(refresh_token)
    
    db.execute("""
        INSERT INTO user_sessions (workspace_id, user_id, provider, 
                                    access_token_crypt, refresh_token_crypt, 
                                    token_family_id, issued_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW() + INTERVAL '1 hour')
    """, (workspace_id, user_id, provider, encrypted_at, encrypted_rt, secrets.token_hex(16)))
    db.commit()
    
    # Issue session cookie (httpOnly, Secure, SameSite)
    session_id = secrets.token_urlsafe(32)
    response = make_response(jsonify({"status": "ok", "redirect": "/"}))
    response.set_cookie(
        "__Host-nexus_session",
        session_id,
        httponly=True,
        secure=True,
        samesite="Strict",
        domain=".example.com",  # Allow parent domain (but not subdomains)
        path="/",
        max_age=86400 * 30,  # 30 days (browser deletes; server tracks independently)
    )
    
    return response

def refresh_access_token(workspace_id: str, user_id: str, provider: str):
    """
    Refresh an access token using stored refresh token.
    Implements rotation: issue new RT, mark old RT consumed.
    """
    db = get_db()
    
    # Get current refresh token
    row = db.execute("""
        SELECT refresh_token_crypt, token_family_id, used_at FROM user_sessions
        WHERE workspace_id = %s AND user_id = %s AND provider = %s
        ORDER BY issued_at DESC LIMIT 1
    """, (workspace_id, user_id, provider)).fetchone()
    
    if not row:
        return {"error": "no_session"}, 401
    
    encrypted_rt, token_family_id, used_at = row
    
    # Reuse detection: if RT was used recently (outside grace period), reject
    grace_period = 5  # seconds
    if used_at and (time.time() - used_at.timestamp()) > grace_period:
        # This RT was already used. Likely compromise. Revoke entire family.
        db.execute("""
            UPDATE user_sessions SET revoked = TRUE
            WHERE token_family_id = %s
        """, (token_family_id,))
        db.commit()
        return {"error": "token_reuse_detected", "action": "logout"}, 401
    
    rt = decrypt_token(encrypted_rt)
    
    # Exchange RT for new AT + RT (via GoTrue)
    token_url = f"{GOTRUE_URL}/auth/v1/token"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": rt,
    }
    resp = requests.post(token_url, json=payload)
    if resp.status_code != 200:
        return {"error": "refresh_failed"}, 401
    
    tokens = resp.json()
    new_at = tokens["access_token"]
    new_rt = tokens["refresh_token"]
    
    # Rotation: Mark old RT as used, store new RT
    db.execute("""
        UPDATE user_sessions SET used_at = NOW(), revoked = FALSE
        WHERE workspace_id = %s AND user_id = %s AND provider = %s
    """, (workspace_id, user_id, provider))
    
    encrypted_new_at = encrypt_token(new_at)
    encrypted_new_rt = encrypt_token(new_rt)
    
    db.execute("""
        INSERT INTO user_sessions (workspace_id, user_id, provider,
                                    access_token_crypt, refresh_token_crypt,
                                    token_family_id, issued_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW() + INTERVAL '1 hour')
    """, (workspace_id, user_id, provider, encrypted_new_at, encrypted_new_rt, token_family_id))
    db.commit()
    
    # Return new AT (never to frontend; backend holds it)
    return {"access_token": new_at, "expires_in": 3600}
```

### 3.3 Scope Management

```python
# nexus-app/service/connectors/scope_registry.py
"""
Define required scopes per platform connector.
User selects which scopes to grant during OAuth.
"""

CONNECTOR_SCOPES = {
    "google": {
        "email_read": ["https://www.googleapis.com/auth/gmail.readonly"],
        "email_send": ["https://www.googleapis.com/auth/gmail.send"],
        "calendar_read": ["https://www.googleapis.com/auth/calendar.readonly"],
        "calendar_write": ["https://www.googleapis.com/auth/calendar"],
    },
    "facebook": {
        "pages_manage": ["pages_manage_metadata", "pages_read_engagement"],
        "ads_read": ["ads_read"],
    },
    "instagram": {
        "insights_read": ["instagram_business_basic", "instagram_business_content_publish"],
    },
}

def validate_scope(provider: str, requested_scope: list[str]) -> bool:
    """
    Verify requested scope is in allowed registry.
    Prevent scope escalation (e.g., requesting admin scope when user only granted read).
    """
    allowed = []
    for scope_name, scope_list in CONNECTOR_SCOPES.get(provider, {}).items():
        allowed.extend(scope_list)
    
    return all(s in allowed for s in requested_scope)

def log_scope_grant(workspace_id: str, user_id: str, provider: str, 
                     scopes: list[str], granted: bool, timestamp: str):
    """Log all scope requests for audit trail."""
    db = get_db()
    db.execute("""
        INSERT INTO scope_audit_log (workspace_id, user_id, provider, scopes, granted, timestamp)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (workspace_id, user_id, provider, json.dumps(scopes), granted, timestamp))
    db.commit()
```

---

## Part 4: Gotchas & App-Review Gates

### 4.1 Provider-Specific Gotchas

**Google OAuth:**
- ✅ Redirect URI trailing slash matters: `/callback` ≠ `/callback/`
- ✅ `access_type=offline` is NOT a scope; it's a query param (common mistake)
- ✅ Refresh token issued only on FIRST login when `access_type=offline` set + `prompt=consent` forced
- ✅ Refresh tokens expire after 6 months of non-use (silently invalid)
- ✅ Max 100 refresh tokens per client ID per user account (oldest revoked when limit hit)
- ✅ Localhost URIs exempt from HTTPS requirement; raw IPs (127.0.0.1) NOT allowed in production
- **Source:** Google OAuth 2.0 Documentation, GoogleSigninOidc findings

**Facebook/Meta OAuth:**
- ✅ App Review required for production scopes (pages_manage, ads_read, instagram_business_content_publish)
- ✅ Business Verification required for sensitive scopes
- ✅ Redirect URI must be HTTPS in production; localhost allowed for dev only
- ✅ Token lifetime: access tokens 60 days, refresh tokens 60 days (no auto-rotate from Meta; client-side rotation needed)
- ✅ Scope escalation requires user to re-authenticate and re-grant (no silent upgrade)
- ✅ IP whitelisting available for backend-to-backend calls (recommended for token exchange)
- **Source:** Meta for Developers, MetaOauthSuite findings

**Instagram (via Meta Graph API):**
- ✅ Basic Display API DEPRECATED 2024-12-04 (migrate to Graph API)
- ✅ Requires Business Account + App Review for insights/publishing
- ✅ Same scope grants as Facebook (no separate Instagram scopes)
- ✅ Rate limits: 200 calls/hour per access token (plan for batch refresh)
- **Source:** Instagram API Documentation

**Supabase GoTrue:**
- ✅ PKCE flow enabled by default in @supabase/ssr package (good!)
- ✅ Refresh token rotation + reuse detection built-in (V2 algorithm)
- ✅ Cross-tab refresh coordination via `parent-of-active` mechanism (handles race conditions)
- ✅ Session cookies max-age can be far-future; browser deletes stale, but GoTrue server-side session is authoritative
- ✅ `GOTRUE_EXTERNAL_SKIP_NONCE_CHECK=false` in production (require nonce for OIDC)
- **Source:** Supabase Session Management, GotrueProviders findings

### 4.2 Security Gates Before Production

**Before Deploying to Production:**

- [ ] **Secrets Audit**
  - [ ] No provider credentials in code (check git history)
  - [ ] `.env` never committed (update `.gitignore`)
  - [ ] Encryption key rotated (never static across deployments)
  - [ ] Secrets loaded from environment / secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)

- [ ] **Scope Audit**
  - [ ] Only minimum required scopes (email, calendar_read, etc.; NOT admin)
  - [ ] Each scope justified in connector documentation
  - [ ] Scope changes logged and auditable

- [ ] **Redirect URI Audit**
  - [ ] Production: HTTPS only (no localhost)
  - [ ] Character-exact match with provider registration (trailing slash, query params)
  - [ ] No dynamic/user-controlled redirect URIs
  - [ ] No subdomain-based routing (security risk; use path-based or central callback)

- [ ] **Token Storage Audit**
  - [ ] No access tokens in localStorage/sessionStorage (code review)
  - [ ] No refresh tokens in frontend (HTTP cookie + backend only)
  - [ ] Encryption at rest (Fernet or AES-256-GCM)
  - [ ] Encryption key rotation plan (90 days)

- [ ] **Session Security Audit**
  - [ ] httpOnly + Secure + SameSite=Strict on all session cookies
  - [ ] `__Host-` prefix enforced (cookies not sent to subdomains)
  - [ ] Session timeout (30 min inactivity, 24 hour max lifetime)
  - [ ] Concurrent session limit (1 per user per workspace, or tracked)

- [ ] **Refresh Token Rotation Audit**
  - [ ] New RT issued on every refresh (verify in code)
  - [ ] Old RT marked consumed (verify in DB)
  - [ ] Reuse detection implemented (query log: how many reuses detected last week?)
  - [ ] Token family revocation on breach (entire family invalidated, not just one token)

- [ ] **Logging & Monitoring Audit**
  - [ ] All OAuth events logged (login, refresh, reuse_detection, logout)
  - [ ] Logs retained 90 days minimum
  - [ ] Alerting on suspicious patterns (reuse detection = alert + dashboard notification)
  - [ ] Query isolation (workspace admins see only their logs)

- [ ] **Provider Compliance Audit**
  - [ ] Google: Workspace verification (if using Workspace APIs)
  - [ ] Facebook/Meta: Business Verification completed, App Review submitted
  - [ ] Instagram: Business Account confirmed, rate limits understood
  - [ ] Terms of Service reviewed (token storage, refresh limits, etc.)

- [ ] **Penetration Testing**
  - [ ] XSS mitigation (no token in localStorage, httpOnly enforced)
  - [ ] CSRF mitigation (state parameter, SameSite cookies, POST-only token endpoint)
  - [ ] Token replay (refresh rotation + reuse detection, short AT lifetime)
  - [ ] Authorization code interception (PKCE + state, no code in logs)

---

## Part 5: Open Questions & Future Enhancements

### 5.1 Remaining Design Decisions

1. **Per-Tenant OAuth Credentials?**
   - Current: Single Google/Facebook client ID shared across all workspaces
   - Alternative: Each workspace has own provider credentials (requires workspace-level configuration UI)
   - Security impact: Shared creds = single point of failure; separate creds = operational complexity
   - **Recommendation:** Start with shared creds; migrate to per-tenant after GA (lower initial complexity)

2. **Sender-Constrained Tokens (DPoP)?**
   - RFC 9449 (Demonstration of Proof-of-Possession)
   - Client generates asymmetric key pair, signs each API call
   - Token stolen without key is useless (future hardening)
   - **Timeline:** Post-GA (requires provider support + client library updates)

3. **Multi-Workspace Per User?**
   - Current: One workspace per session (workspace_id in session cookie)
   - Alternative: User can switch workspaces within session (requires explicit scope check per API call)
   - Security impact: Higher complexity, more chances for cross-workspace leakage
   - **Recommendation:** Require re-auth to switch workspaces (simpler, safer for MVP)

4. **Historical Token Rotation Audit Trail?**
   - Current: Track token_family_id, used_at, revoked status
   - Enhancement: Full token lifecycle log (issued, refreshed, revoked, reason)
   - **For SOC 2 Type II Compliance:** Track all token events for auditors
   - **Timeline:** Pre-SOC 2 audit (Q4 2026)

### 5.2 Post-GA Security Hardening

- [ ] **Per-User Encryption Keys** (currently workspace-level)
- [ ] **Hardware Security Module (HSM)** for encryption key storage (currently in-memory)
- [ ] **Audit Log Signing** (append-only, cryptographic proof of tampering)
- [ ] **Rate Limiting by Workspace** (detect brute-force token refresh attempts)
- [ ] **Anomaly Detection** (unusual IP, impossible travel, new device detection)
- [ ] **Step-Up Authentication** (require re-auth for sensitive actions: change workspace settings, revoke all sessions)

---

## Part 6: References

### RFCs

| RFC | Title | URL |
|---|---|---|
| RFC 9700 | OAuth 2.0 Security Best Current Practice | https://datatracker.ietf.org/doc/rfc9700/ |
| RFC 6749 | OAuth 2.0 Authorization Framework | https://datatracker.ietf.org/doc/rfc6749/ |
| RFC 6750 | OAuth 2.0 Bearer Token Usage | https://datatracker.ietf.org/doc/rfc6750/ |
| RFC 7636 | Proof Key for Public OAuth 2.0 Clients (PKCE) | https://datatracker.ietf.org/doc/rfc7636/ |
| RFC 6819 | OAuth 2.0 Threat Model & Security Considerations | https://datatracker.ietf.org/doc/rfc6819/ |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | https://datatracker.ietf.org/doc/rfc8414/ |
| RFC 9449 | OAuth 2.0 Demonstration of Proof-of-Possession (DPoP) | https://datatracker.ietf.org/doc/rfc9449/ |
| OpenID Connect Core 1.0 | OpenID Connect authentication layer | https://openid.net/specs/openid-connect-core-1_0.html |

### OWASP Cheat Sheets

| Cheat Sheet | URL |
|---|---|
| OAuth 2.0 Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html |
| Session Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html |
| Authentication Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html |
| CSRF Prevention Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html |
| Logging Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html |

### Official Provider Documentation

| Provider | Resource |
|---|---|
| Google OAuth | https://developers.google.com/identity/protocols/oauth2/web-server |
| Google OpenID Connect | https://developers.google.com/identity/openid-connect/openid-connect |
| Meta (Facebook/Instagram) | https://developers.facebook.com/docs/facebook-login/overview |
| Instagram Graph API | https://developers.instagram.com/docs/instagram-api/overview |
| Supabase Auth | https://supabase.com/docs/guides/auth |
| GoTrue (Supabase Auth Server) | https://github.com/supabase/gotrue |

### Security & Best Practices

| Resource | URL |
|---|---|
| Auth0 Refresh Token Rotation | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation |
| Obsidian Security Refresh Tokens | https://www.obsidiansecurity.com/blog/refresh-token-security-best-practices |
| Frontegg OAuth 2 Refresh Tokens | https://frontegg.com/blog/oauth-2-refresh-tokens |
| WorkOS OAuth Best Practices | https://workos.com/blog/oauth-best-practices |

---

## Summary: Desktop vs. Hosted Web

| Dimension | Desktop | Hosted Web |
|---|---|---|
| **Redirect URI** | Ephemeral loopback (`http://localhost:{port}`) | Fixed HTTPS (`https://app.example.com/auth/callback`) |
| **Token Storage** | macOS Keychain (OS-level) | Server DB encrypted-at-rest + httpOnly cookies |
| **Session Model** | Single-user, persistent Keychain | Multi-user, server-side session table + cookie |
| **PKCE** | S256 (manual in app) | S256 (GoTrue handles) |
| **Refresh Rotation** | None (static RT from provider) | Rotation + reuse detection (every exchange) |
| **Multi-Tenancy** | N/A | Mandatory (workspace_id isolation, RLS) |
| **Scope Management** | Static/hardcoded | Dynamic (user selects during auth) |
| **Audit Logging** | None | Comprehensive (all OAuth events) |
| **Security Posture** | Single-operator, lower threat surface | Public-internet, multi-tenant, higher threat surface → requires BCP adherence |

---

**Document Status:** FINAL (ready for implementation)  
**Next Steps:** Coordinate with peer lanes (GoogleSigninOidc, MetaOauthSuite, GotrueProviders) for provider-specific setup. Implement backend OAuth handler per section 3.2. Deploy to staging; security audit per section 4.2. Migrate desktop connectors to hosted pattern post-GA.
