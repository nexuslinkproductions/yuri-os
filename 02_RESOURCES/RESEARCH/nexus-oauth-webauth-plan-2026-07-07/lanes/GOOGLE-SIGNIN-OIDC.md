# Google Sign-In OIDC for NEXUS-LINK

**Lane ID:** GoogleSigninOidc  
**Date:** 2026-07-07  
**Status:** Research Complete  
**RFC Versions:** OAuth 2.0 (RFC 6749) + OpenID Connect (OIDC Core 1.0)

---

## Summary

Google Sign-In for NEXUS-LINK uses OpenID Connect (OIDC) identity layer built on OAuth 2.0 web-server flow. Supabase GoTrue handles the exchange natively; you configure Google Cloud Console OAuth consent screen + OAuth client, store Client ID/Secret in `.env` as `GOTRUE_EXTERNAL_GOOGLE_*`, and users sign in via `signInWithOAuth({provider:'google'})`. Key: redirect URI MUST match exactly (`http://127.0.0.1:54321/auth/v1/callback` locally), scopes are `openid email profile`, and refresh tokens use `access_type=offline` parameter (NOT a scope). PKCE flow recommended over implicit for token security.

---

## Verified Findings (with Source URLs)

### 1. Google OAuth 2.0 / OIDC Protocol

**Specification:**  
Google's OAuth 2.0 implementation conforms to RFC 6749 (core OAuth 2.0) + OpenID Connect Core 1.0 specification. Google is OpenID Certified.
- **Source:** [OpenID Connect | Google Developers](https://developers.google.com/identity/openid-connect/openid-connect) (May 2026)
- **Source:** [Using OAuth 2.0 for Web Server Applications | Google Developers](https://developers.google.com/identity/protocols/oauth2/web-server) (May 26, 2026)

**Authentication Flow:**  
User → `signInWithOAuth({provider:'google'})` → browser redirect to Google authorization endpoint → user consents → Google redirects back with authorization code → Supabase GoTrue exchanges code for ID token + access token → Supabase stores tokens + creates session → app receives session.

**ID Token & Nonce:**  
Google returns a signed ID token (JWT) containing user identity claims (`sub`, `email`, `name`, `picture`). A `nonce` parameter is included for replay-attack protection. Supabase supports nonce validation (recommended) or can skip it with `GOTRUE_EXTERNAL_SKIP_NONCE_CHECK=true` if client-side nonce handling is unavailable.
- **Source:** [OpenID Connect | Google Developers](https://developers.google.com/identity/openid-connect/openid-connect)

---

### 2. Google Cloud Console Setup (2026 UI)

**Console Reorganization:**  
As of 2025–2026, Google Cloud Console OAuth flow moved to **Google Auth Platform** (not the old "OAuth consent screen" menu). The setup has 3 tabs: **Branding**, **Audience**, **Data Access**.

#### Step 1: Configure OAuth Consent Screen (Branding & Audience)

1. Go to **Google Cloud Console** (console.cloud.google.com)
2. Navigate to **APIs & Services > Google Auth Platform > Branding**
3. If not yet configured, click **Get Started**
4. Fill **App Information:**
   - **App name:** e.g., "Nexus Link Local Dev"
   - **User support email:** e.g., admin@example.com
   - **App logo:** optional (not verified for test/local apps)
5. Click **Next** → **Audience** tab
6. **Select user type:** Choose **External** for a public/local web app
   - **External apps start in "Testing" mode** — only test users (you) can sign in until published
   - **Internal:** only if you control the Google Workspace account
7. Click **Next** → **Contact Information** tab
8. Enter **email address** for notifications
9. Click **Save and Continue**

**Critical Note:** External vs. Internal choice is **permanent per project**; cannot change later without creating a new project.
- **Source:** [Google Cloud OAuth Consent Screen + OAuth Client ID (2026 New UI)](https://var.gg/en/blog/gcp-oauth-consent-screen) (April 18, 2026)
- **Source:** [Configure the OAuth consent screen | Google Developers](https://developers.google.com/workspace/guides/configure-oauth-consent) (April 20, 2026)

#### Step 2: Create OAuth 2.0 Client ID for Web Application

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. **Application type:** Select **Web application**
4. **Name:** e.g., "Nexus Link Web Client (Local)"
5. **Authorized JavaScript origins:** For local dev: `http://127.0.0.1:3000` (your SITE_URL)
   - Leave blank if backend handles all OAuth token exchanges (recommended for GoTrue)
6. **Authorized redirect URIs:** Click **Add URI** and enter:
   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```
   ⚠️ **Must be EXACT match** — trailing slash, protocol, port, path all matter. Single character mismatch → `redirect_uri_mismatch` error.
7. Click **Create**
8. **IMMEDIATELY download** Client ID and Client Secret from the dialog
   - **Secret is only shown ONCE** — if you close the dialog without saving, you must recreate the client
   - Store securely (do not commit to `.env` — use a secret manager in production)
- **Source:** [Manage OAuth Clients | Google Cloud Help](https://support.google.com/cloud/answer/15549257?hl=en)
- **Source:** [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

### 3. Scopes & Identity Claims

**Identity Scopes (for user sign-in):**  
- `openid` — indicates OIDC authentication request; returns ID token with user identity
- `email` — returns user's email address in ID token
- `profile` — returns user's name, picture, locale in ID token

**Request format (space-separated):**  
```
scope=openid email profile
```

**Returned Identity Claims (in ID token JWT):**
- `sub` — user's unique Google ID
- `email` — user's email address
- `name` — user's full name (if profile scope granted)
- `picture` — user's profile picture URL (if profile scope granted)
- `aud` — audience (your Client ID)
- `iss` — issuer (Google; `https://accounts.google.com`)
- `nonce` — for replay-attack prevention

**No `offline_access` Scope in Google:**  
❌ Google does NOT support the standard `offline_access` scope.  
✅ Instead, use the `access_type=offline` HTTP query parameter when redirecting to Google's authorization endpoint.

- **Source:** [OAuth 2.0 Scopes for Google APIs | Google Developers](https://developers.google.com/identity/protocols/oauth2/scopes) (May 26, 2026)
- **Source:** [OpenID Connect and OAuth2 Standard Scopes | CerberAuth](https://www.cerberauth.com/blog/openid-connect-oauth2-scopes/)

---

### 4. Refresh Tokens (Offline Access)

**How to Request:**  
When initiating the OAuth authorization request, include the `access_type=offline` parameter (NOT a scope):
```
GET https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://127.0.0.1:54321/auth/v1/callback&
  scope=openid email profile&
  response_type=code&
  access_type=offline&
  prompt=consent
```

**When Refresh Token Issued:**  
- Only on the **FIRST authorization** when `access_type=offline` is set
- Subsequent sign-ins will NOT return a new refresh token (if user already consented)
- To force re-consent, add `prompt=consent` (shown above)

**Refresh Token Limitations:**
- Max **100 refresh tokens** per Google account per OAuth client ID
- If limit exceeded, oldest token is automatically invalidated
- Token **expires after 6 months of non-use**
- Token **invalidates** if:
  - User revokes app access
  - User changes password (if Gmail scopes are requested)
  - User account exceeds max granted tokens
- **Test projects (External + Testing status):** refresh tokens expire in **7 days** unless ONLY using `openid email profile` scopes (no data API scopes)

**Supabase Handling:**  
Supabase GoTrue extracts the refresh token from Google's response and stores it. On user session, app can access via `provider_token` from the returned session object.
- **Source:** [Using OAuth 2.0 to Access Google APIs | Google Developers](https://developers.google.com/identity/protocols/oauth2) (May 26, 2026)

---

### 5. Supabase GoTrue Self-Hosted Configuration

**Environment Variables (in `.env`):**

For self-hosted Supabase with GoTrue, use `GOTRUE_EXTERNAL_GOOGLE_*` prefix:

```bash
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<YOUR_CLIENT_ID>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<YOUR_CLIENT_SECRET>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback
```

**Optional nonce handling:**
```bash
GOTRUE_EXTERNAL_SKIP_NONCE_CHECK=false  # Recommended: keep true for proper security
```

**Variables Required by `.env.example` (NEXUS-LINK specific):**

Map your Google OAuth to the existing env template:
- **`SITE_URL`** = `http://127.0.0.1:3000` (your front-end URL; already in template)
- **`API_EXTERNAL_URL`** = `http://127.0.0.1:54321` (Supabase GoTrue callback base; already in template)
- **`ADDITIONAL_REDIRECT_URLS`** = (optional) any additional app URLs users might land on after login (e.g., `http://localhost:3000/dashboard,https://app.example.com`)

After OAuth sign-in, user is redirected back to `SITE_URL` by default (or one of `ADDITIONAL_REDIRECT_URLS` if specified).

- **Source:** [Configure Social Login (OAuth) Providers | Supabase Docs](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth)

---

### 6. App-Side Flow (Browser + Supabase)

**Browser Flow (JavaScript):**

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://127.0.0.1:54321',
  'YOUR_ANON_KEY'
);

// User clicks "Sign in with Google"
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'http://127.0.0.1:3000/auth/callback',  // Where to land after OAuth
    queryParams: {
      access_type: 'offline',  // Request refresh token
      prompt: 'consent',       // Force re-consent (to refresh token)
    },
  },
});
```

**What Happens:**
1. `signInWithOAuth({provider:'google'})` redirects browser to Google authorization endpoint
2. User authenticates with Google, sees consent screen
3. Google redirects to `http://127.0.0.1:54321/auth/v1/callback` (GoTrue handles)
4. GoTrue exchanges auth code for ID token + access token
5. GoTrue creates a Supabase session and redirects to `redirectTo` URL
6. Browser receives session (stored in localStorage by default)
7. App is signed in

**Extracting Provider Token (for data access later):**

```javascript
const { data } = await supabase.auth.getSession();
if (data.session?.provider_token) {
  const googleAccessToken = data.session.provider_token;
  // Store securely (e.g., server-side session)
  // Use to call Google APIs on user's behalf
}
```

- **Source:** [Supabase JavaScript: signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- **Source:** [Login with Google | Supabase Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

### 7. PKCE vs. Implicit Flow

**Implicit Flow (Legacy):**  
Browser receives ID token + access token directly in URL fragment. Tokens exposed in browser history.  
⚠️ **Security risk; not recommended for modern apps.**

**Authorization Code Flow with PKCE (Recommended):**  
1. App generates random `code_verifier` + `code_challenge`
2. Redirects to Google with `code_challenge` + `challenge_method=S256`
3. Google redirects with authorization code (NOT tokens)
4. App backend exchanges code + `code_verifier` for tokens
5. Tokens never exposed in URL; PKCE prevents code interception

**Supabase Implementation:**  
Supabase GoTrue automatically supports PKCE. For browser-initiated flows, Supabase handles the code exchange server-side and returns the session to the browser.

- **Source:** [OAuth 2.0 for Web Server Applications | Google Developers](https://developers.google.com/identity/protocols/oauth2/web-server) (May 26, 2026)

---

### 8. Redirect URI Validation Rules

**HTTPS vs. HTTP:**  
- ✅ HTTPS required for all redirect URIs  
- ✅ **Localhost exception:** `http://127.0.0.1:PORT` allowed (local dev only)  
- ❌ Raw IP addresses (e.g., `http://192.168.1.100`) NOT allowed outside localhost

**Format Rules:**
- ✅ Must match EXACTLY (no trailing slashes, protocol, port, path mismatch)
- ❌ No URL shortener domains (e.g., `goo.gl`)
- ❌ No path traversal (`..` or `%2e%2e`)
- ❌ No URL fragments (`#`)
- ❌ No userinfo subcomponent (`user:pass@`)

**Common Mistakes:**
- `/callback` vs. `/callback/` (trailing slash mismatch) → `redirect_uri_mismatch`
- `http://` vs. `https://` mismatch → `redirect_uri_mismatch`
- Missing port (`:54321`) → `redirect_uri_mismatch`

- **Source:** [Manage OAuth Clients | Google Cloud Help](https://support.google.com/cloud/answer/15549257?hl=en)

---

## Concrete Config / Steps

### Phase 1: Google Cloud Console Setup (15 min)

| Step | Action | Output |
|------|--------|--------|
| 1.1 | Go to console.cloud.google.com, create or select project | Project ID visible |
| 1.2 | Navigate to **APIs & Services > Google Auth Platform > Branding** | Branding config form |
| 1.3 | Fill App name, support email; click **Next** | Branding saved |
| 1.4 | Select user type: **External**; click **Next** | Audience: External (Testing mode) |
| 1.5 | Enter contact email; click **Save and Continue** | OAuth consent configured |
| 1.6 | Go to **APIs & Services > Credentials** | Credentials page |
| 1.7 | Click **Create Credentials > OAuth client ID** | New client form |
| 1.8 | Select **Application type = Web application** | Web app selected |
| 1.9 | Enter name: "Nexus Link Web Client (Local)" | Name filled |
| 1.10 | **Authorized JavaScript origins** (optional): `http://127.0.0.1:3000` | Origin added |
| 1.11 | **Authorized redirect URIs**: `http://127.0.0.1:54321/auth/v1/callback` | Redirect URI added (exact match!) |
| 1.12 | Click **Create**; copy Client ID + Secret immediately | Dialog shows credentials |

**Outputs:**
- `GOOGLE_CLIENT_ID` (e.g., `1234567890-abc...apps.googleusercontent.com`)
- `GOOGLE_CLIENT_SECRET` (e.g., `GOCSPX-...`)

---

### Phase 2: NEXUS-LINK `.env` Configuration (5 min)

**Update `03_NEXUS-LINK/infra/.env` (from `.env.example`):**

```bash
# Already present; verify:
SITE_URL=http://127.0.0.1:3000
API_EXTERNAL_URL=http://127.0.0.1:54321
ADDITIONAL_REDIRECT_URLS=

# Add Google OAuth (GoTrue environment variables):
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<PASTE_CLIENT_ID>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<PASTE_CLIENT_SECRET>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback
GOTRUE_EXTERNAL_SKIP_NONCE_CHECK=false
```

**Where to add:** Append to the `############  # Auth (GoTrue)  ############` section in `.env`.

---

### Phase 3: Verify Callback Setup in `docker-compose.yml`

**Check that GoTrue is listening on the correct port:**

In `03_NEXUS-LINK/infra/docker-compose.yml`, verify the auth service:
```yaml
services:
  auth:
    container_name: supabase-auth
    image: supabase/gotrue:...
    ports:
      - "${API_EXTERNAL_URL}:8000"  # Should map to 54321
    environment:
      # GOTRUE_* variables are loaded from .env
```

Kong gateway (reverse proxy) should forward `http://127.0.0.1:54321/auth/v1/callback` to GoTrue's `/auth/v1/callback` endpoint.

---

### Phase 4: Frontend Integration

**React / Next.js Example:**

```typescript
import { useEffect } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export function GoogleSignIn() {
  const supabase = useSupabaseClient();

  const handleGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://127.0.0.1:3000/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) console.error('Sign-in failed:', error.message);
  };

  return (
    <button onClick={handleGoogleSignIn}>
      Sign in with Google
    </button>
  );
}
```

**Callback Handler (at `/auth/callback`):**

```typescript
import { useEffect } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

export default function AuthCallback() {
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  return <p>Signing you in...</p>;
}
```

---

## Gotchas & App-Review Gates

### Local Development Gotchas

1. **Redirect URI Exact Match**  
   Even a trailing slash causes `redirect_uri_mismatch`. If setup fails:
   - Double-check GCP console vs. `.env` redirect URI
   - Verify no typos in `API_EXTERNAL_URL`

2. **Client Secret Never Shown Again**  
   If you close the GCP "OAuth client created" dialog without copying the secret:
   - Must regenerate the client (delete old, create new)
   - Takes ~1 minute to propagate

3. **External + Testing Mode Limitation**  
   If you select **External** user type, app starts in "Testing" mode:
   - Only test users (you, as the project owner) can sign in
   - To allow public signups, must submit app for Google verification (production only)

4. **Refresh Token Expiry (Testing Projects)**  
   Test projects with `access_type=offline` only work for 7 days unless using ONLY `openid email profile` scopes (no Gmail/Drive API scopes):
   - For demo/local: add `prompt=consent` to force re-grant
   - For production: publish app to remove 7-day limit

5. **Nonce Validation**  
   If using older Android/iOS SDKs that don't support nonce:
   - Can set `GOTRUE_EXTERNAL_SKIP_NONCE_CHECK=true` (weakens replay protection)
   - **Recommended:** use PKCE flow instead (Supabase does this automatically)

### App Review Gates (Production Deployment)

If you intend to publish beyond testing:

1. **OAuth Consent Screen Verification**
   - Google may ask for your brand to be verified (logo, app name visible to users)
   - Requires ownership verification (domain control, business info)
   - ~3–5 business days

2. **Scopes Justification**
   - For each scope beyond `openid email profile`, Google asks why
   - Example: if requesting Gmail API scopes later, must explain data use

3. **Data Policy & Terms**
   - Must have **Privacy Policy** URL
   - Must have **Terms of Service** URL
   - Google flags apps without them

4. **Redirect URI Validation**
   - Must use HTTPS (not `http://`) in production
   - Must own the domain
   - Redirect URIs must not point to shortened URLs or third-party domains

---

## Distinction: Google Sign-In (Identity) vs. Platform Connectors (Data Access)

### Google Sign-In (OIDC) — This Lane

**Purpose:** User authentication & identity.

**When used:** User creates account on NEXUS-LINK; signs in with Google credentials.

**Scopes:** `openid email profile`  
**Returns:** ID token (JWT) with identity claims: `sub`, `email`, `name`, `picture`  
**Frequency:** ONCE per user, at initial login  
**Token lifetime:** ID token valid ~1 hour; Supabase session refreshes automatically  
**What app gets:** User's Google ID, email, name, profile picture in Supabase `auth.users` table

**Example:** "Sign in with Google" button on login page.

---

### Platform Connectors (OAuth 2.0 + Data APIs) — Future Lane

**Purpose:** Data access to user's Google services (Gmail, Drive, Photos, etc.).

**When used:** After login, user grants app permission to pull their emails, files, photos, etc.

**Scopes:** API-specific (e.g., `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/drive.readonly`)  
**Returns:** Access token for calling Google APIs (e.g., Gmail API, Drive API)  
**Frequency:** Per-platform, per-user; stored in `platform_connectors` table  
**Token lifetime:** Access token valid ~1 hour; refresh token used to get new tokens  
**What app gets:** Access to user's emails, files, photos on-demand; stored separately from identity

**Example:** "Connect your Gmail" button on settings page; app pulls recent emails.

---

**Key Difference in One Paragraph:**

Google Sign-In (OIDC) is a one-time identity layer — it authenticates the user, proves who they are to NEXUS-LINK, and stores their basic profile. It answers the question "Who is this user?" Platform Connectors (OAuth 2.0 + APIs) come AFTER sign-in and answer "What data can I access for this user?" — they grant granular, per-service access tokens that let the app pull emails from Gmail, files from Drive, or other user data. Sign-in is infrastructure (app needs it to function); connectors are optional features (app can function without them, but offers extra value if users grant access). Both use OAuth 2.0 / OIDC under the hood, but OIDC adds the identity layer, while raw OAuth 2.0 handles pure authorization to APIs.

---

## Open Questions

1. **Multiple Google OAuth Clients (Web + Mobile)?**  
   Current setup is Web (browser) only. If adding iOS/Android, will need separate OAuth clients per platform. Supabase supports concatenating client IDs (web first in list).

2. **Custom Scopes for Platform Connectors?**  
   Gmail, Drive, YouTube, etc., all have separate API scopes. Need separate OAuth client(s) per connector service, or single client with all scopes? (TBD by platform connector lane.)

3. **Refresh Token Storage & Rotation?**  
   Supabase extracts `provider_token` (refresh token) from Google response. Where should app store it for later use? Encrypted in Postgres `platform_connectors.token_refresh`?

4. **User Verification & Branded Consent Screen?**  
   For local dev, unverified brand is fine. For production, need brand verification. Timeline & process?

5. **Account Linking (Email Duplication)?**  
   If user signs up with Google (email: user@example.com) and later tries to sign up with email/password (same email), should the account auto-link? GoTrue supports identity linking.

---

## Sources

| Source | URL | Date |
|--------|-----|------|
| Google OAuth 2.0 Web Server | https://developers.google.com/identity/protocols/oauth2/web-server | May 26, 2026 |
| Google OpenID Connect | https://developers.google.com/identity/openid-connect/openid-connect | Current |
| Google OAuth Scopes | https://developers.google.com/identity/protocols/oauth2/scopes | May 26, 2026 |
| Google Cloud OAuth Consent Screen (2026 UI) | https://var.gg/en/blog/gcp-oauth-consent-client-id | April 18, 2026 |
| Google Cloud Console Help (Manage OAuth Clients) | https://support.google.com/cloud/answer/15549257?hl=en | Current |
| Supabase Google Login Guide | https://supabase.com/docs/guides/auth/social-login/auth-google | Current |
| Supabase Self-Hosted OAuth Config | https://supabase.com/docs/guides/self-hosting/self-hosted-oauth | Current |
| Supabase signInWithOAuth Reference | https://supabase.com/docs/reference/javascript/auth-signinwithoauth | Current |
| CerberAuth OAuth Scopes | https://www.cerberauth.com/blog/openid-connect-oauth2-scopes/ | Oct 2024 |

---

**Next Steps:** Deploy to local docker-compose, test `signInWithOAuth({provider:'google'})` end-to-end, then integrate with Platform Connectors lane for Gmail/Facebook data access.

