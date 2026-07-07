# Meta OAuth Platform Analysis: Facebook, Instagram, Threads (2026)

**Research Date:** 2026-07-07  
**Scope:** Identity provider vs. data-connector classification, OAuth flows, app review gates, redirect URI rules, deprecations  
**Primary Source:** developers.facebook.com/docs (current 2026 documentation)

---

## Summary

| Platform | Identity Provider? | Data Connector? | Usable as USER LOGIN? | Status | Deprecation Notes |
|----------|:-:|:-:|---|---|---|
| **Facebook Login** | ✅ YES | ✅ YES | **✅ BOTH LOGIN + CONNECTOR** | Active, v25.0 | None; stable |
| **Facebook Login for Business** | ✅ YES | ✅ YES | **✅ BOTH LOGIN + CONNECTOR** | Active, multi-tenant | None; stable |
| **Instagram API with Instagram Login** | ❌ NO | ✅ YES | **❌ CONNECTOR ONLY** | Active, v2024 | Instagram Basic Display (ended Dec 4, 2024) → replaced by this API |
| **Threads API** | ❌ NO | ✅ YES | **❌ CONNECTOR ONLY** | Active (launched June 2024) | None yet; limited availability |

---

## Platform Details

### 1. Facebook Login

#### Classification
- **Identity Provider:** ✅ YES — Federated user sign-in via Facebook account
- **Data Connector:** ✅ YES — Access friend lists, profile, insights via Graph API
- **Verdict:** **USABLE AS USER LOGIN** (primary use case)

#### OAuth Flow Endpoints
| Step | Endpoint | Method | Notes |
|------|----------|--------|-------|
| **Authorize** | `https://www.facebook.com/v25.0/dialog/oauth` | GET | Returns authorization code or access token |
| **Token Exchange** | `GET https://graph.facebook.com/v25.0/oauth/access_token` | GET | Exchange code for access token (requires client_secret) |
| **Token Debug** | `GET graph.facebook.com/debug_token` | GET | Verify/inspect token validity and scopes |

#### Key Scopes & Permissions
| Scope | Category | Approval Required? | Notes |
|-------|----------|:-:|---|
| `public_profile` | Pre-approved | ❌ NO | Always required, cannot be declined |
| `email` | Pre-approved | ❌ NO | Common for sign-in; pre-approved |
| `user_friends` | Restricted | ✅ **APP REVIEW** | Only for limited partners; requires approval |
| `user_likes`, `user_posts`, `user_photos`, `user_tagged_places` | **PROHIBITED** | ❌ NOT AVAILABLE | Cannot request for Facebook Login |

#### Token Types & Expiration
- **Short-lived:** 1 hour validity  
- **Long-lived:** Via session info token exchange; valid for extended period with refresh
- **Session Info Token:** For federated identity providers; non-expiring, used for session management

#### App Review Gates
- **Pre-approved:** `public_profile`, `email` (no review needed for basic sign-in)
- **App Review Required:** `user_friends`, any advanced data access
- **Process:** Submit with screen recordings; 2–4 week review cycle
- **Business Verification:** Not required for standard Facebook Login; required if accessing business data

#### Redirect URI Rules
- **HTTPS:** ✅ Required for production (enforced since Oct 2018)
- **Localhost Dev:** ✅ Allowed during development; HTTP permitted on localhost (not enforced if app not yet live)
- **Exact Match:** ✅ Strict mode enforced—`https://yourdomain.com/callback` ≠ `https://yourdomain.com/callback?extra=param`
- **Configuration:** Registered in App Dashboard → Facebook Login → Settings → Valid OAuth Redirect URIs

#### Security & Best Practices
- **CSRF Protection:** Use `state` parameter (required)
- **App Secret:** Never expose in client-side code or binaries
- **Token Storage:** Server-side session storage recommended
- **Revocation:** User can revoke login permission separately from app uninstall

#### Sources
- [Manually Build a Login Flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) — OAuth endpoints, code exchange, token inspection
- [Login Security](https://developers.facebook.com/docs/facebook-login/security/) — Redirect URI rules, HTTPS enforcement
- [App Review](https://developers.facebook.com/docs/apps/review?locale=en_GB) — Gated permissions, pre-approved scopes
- [Get Session Info Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-session-info/) — Federated identity patterns

---

### 2. Facebook Login for Business

#### Classification
- **Identity Provider:** ✅ YES — Federated user sign-in for business multi-tenant scenarios
- **Data Connector:** ✅ YES — Access business data via Graph API
- **Verdict:** **USABLE AS USER LOGIN** (multi-tenant variant of Facebook Login)

#### Key Differences from Standard Facebook Login
- **Multi-Tenant:** Create multiple configurations, present different login flows to different user cohorts
- **Token Types:** Choose User access token (personal FB account) OR System-user access token (business portfolio required)
- **Config ID:** Replaces scope in some scenarios; identifies the specific business configuration
- **Granular Tokens:** Multiple business integration system-user tokens per client business for scalability

#### OAuth Flow Endpoints
- Same as Facebook Login (v25.0)
- **Code Exchange:** `GET https://graph.facebook.com/v25.0/oauth/access_token?client_id=<APP_ID>&client_secret=<APP_SECRET>&code=<CODE>`

#### Scopes & Token Type Selection
| Token Type | User Requirement | Use Case | Approval |
|------------|------------------|----------|----------|
| **User Token** | Personal FB account | Consumer-facing login | Pre-approved (email, public_profile) |
| **System-user Token** | Business portfolio (Creator/Business account) | B2B data access, managed accounts | Requires Advanced Access + App Review |

#### App Review Gates
- Standard Facebook Login app review process applies
- **Advanced Access** requires: Business Verification + App Review
- **Limited to Partners:** System-user token access restricted to vetted partners

#### Redirect URI Rules
- Same as Facebook Login (HTTPS, exact match, localhost allowed in dev)

#### Sources
- [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business) — Multi-tenant configuration, token types
- [Multiple Providers Integration](https://developers.facebook.com/docs/facebook-login/multiple-providers/) — Federated identity patterns

---

### 3. Instagram API with Instagram Login

#### Classification
- **Identity Provider:** ❌ **NO** — NOT a user sign-in provider
- **Data Connector:** ✅ YES — Access Instagram professional account data (posts, insights, messages, comments)
- **Verdict:** **❌ CONNECTOR ONLY — Cannot be used for user sign-in**

#### Critical Distinction
The docs explicitly state: *"The Instagram API with Instagram Login allows Instagram professionals — businesses and creators — to use your app to manage their presence on Instagram."*

This is **account management**, not identity provision. Users must have an existing Instagram professional account; the API does NOT create or authenticate new users into your app.

#### OAuth Flow Endpoints
| Step | Endpoint | Method | Notes |
|------|----------|--------|-------|
| **Authorize** | `https://www.instagram.com/oauth/authorize` | GET | Returns authorization code (valid 1 hour) |
| **Short-lived Token** | `POST https://api.instagram.com/oauth/access_token` | POST | Exchange code for short-lived token (1 hour) |
| **Long-lived Token** | `GET https://graph.instagram.com/access_token` | GET | Exchange short-lived → 60-day long-lived token |
| **Refresh Token** | `GET https://graph.instagram.com/refresh_access_token` | GET | Refresh long-lived token for another 60 days |

#### Key Scopes & Permissions (UPDATED Jan 27, 2025)
| New Scope (Current) | Old Scope (Deprecated) | Expires | Purpose |
|---|---|:-:|---|
| `instagram_business_basic` | `business_basic` | **Jan 27, 2025** | Read basic profile data (required) |
| `instagram_business_content_publish` | `business_content_publish` | **Jan 27, 2025** | Publish posts, stories, reels |
| `instagram_business_manage_messages` | `business_manage_messages` | **Jan 27, 2025** | Send/receive DMs |
| `instagram_business_manage_comments` | `business_manage_comments` | **Jan 27, 2025** | Moderate and reply to comments |

**⚠️ CRITICAL:** Old scopes will **stop working** on January 27, 2025. Migration to new scopes is mandatory.

#### Token Types & Expiration
- **Short-lived:** 1 hour (exchanged immediately for long-lived)
- **Long-lived:** 60 days validity
- **Refresh:** Long-lived tokens can be refreshed for another 60 days if:
  - Token is ≥ 24 hours old
  - Token not yet expired
  - `instagram_business_basic` permission granted
  - User has not revoked access

#### App Review Gates
| Access Level | Requirements | Use Case | Approval |
|---|---|---|:-:|
| **Standard Access** | App serves accounts you own/manage | Personal/team apps | ❌ No review |
| **Advanced Access** | App serves accounts you don't own | Third-party management platforms | ✅ **App Review + Business Verification** |

- Advanced Access requires: Meta App Review submission + Business Verification (estimated 1–2 weeks)
- Required permissions added by default: `instagram_business_basic`, `instagram_business_manage_messages`

#### Redirect URI Rules
- **HTTPS:** ✅ **Required** — even for development
- **Localhost:** ❌ HTTP not supported; must use HTTPS (e.g., `https://localhost:8443/callback`)
- **Exact Match:** ✅ Strict enforcement—query parameters and path must match exactly
- **Configuration:** App Dashboard → Instagram → API setup with Instagram login → Business login settings → OAuth redirect URIs

#### Deprecation & Migration Path
- **Deprecated:** Instagram Basic Display API (ended **December 4, 2024**)
- **Replacement:** Instagram API with Instagram Login (launched July 2024)
- **Impact:** Basic Display apps lost data access on Dec 4, 2024; migration to this API required
- **Scope Change:** Migrate from old → new scope names before Jan 27, 2025

#### Limitations
- Cannot access ads or tagging
- Requires Instagram professional (Creator/Business) account
- No personal account support (only professional accounts)

#### Sources
- [Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login) — Overview, use cases
- [Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login) — OAuth flow, endpoints, scopes, token exchange
- [Instagram Platform Overview](https://developers.facebook.com/docs/instagram-platform/overview/) — Access levels, app review requirements
- [Instagram Basic Display Deprecation](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/) — Migration guidance

---

### 4. Threads API

#### Classification
- **Identity Provider:** ❌ **NO** — NOT a user sign-in provider
- **Data Connector:** ✅ YES — Publish posts, read/manage replies, view insights on Threads account
- **Verdict:** **❌ CONNECTOR ONLY — Cannot be used for user sign-in**

#### Overview
The Threads API allows apps to publish posts, manage replies, and view insights on Threads. Users must have an existing Threads account; the API does NOT create new users or serve as a sign-in mechanism.

Launched June 2024; not open by default (requires approval).

#### OAuth Flow Endpoints
Uses **Instagram's OAuth endpoints** (Threads is built on Instagram infrastructure):

| Step | Endpoint | Method | Scopes |
|------|----------|--------|--------|
| **Authorize** | `https://www.instagram.com/oauth/authorize` | GET | `threads_basic`, `threads_content_publish`, etc. |
| **Token Exchange** | Instagram OAuth endpoints | POST/GET | Same as Instagram API |
| **Long-lived Token** | `https://graph.instagram.com/access_token` | GET | Exchange to 60-day token |
| **Refresh Token** | `https://graph.instagram.com/refresh_access_token` | GET | Refresh for another 60 days |

#### Key Scopes & Permissions
| Scope | Purpose | App Review |
|-------|---------|:-:|
| `threads_basic` | **Required** for all Threads API calls | Pre-approved for testers |
| `threads_content_publish` | Create and publish posts | ✅ App Review |
| `threads_manage_replies` | Manage replies (POST calls) | ✅ App Review |
| `threads_read_replies` | Read replies (GET calls) | ✅ App Review |
| `threads_manage_insights` | View post and account insights | ✅ App Review |

#### Token Types & Expiration
- **Short-lived:** 1 hour (from authorization window)
- **Long-lived:** 60 days (via exchange from short-lived)
- **Refresh:** 60 days (via refresh endpoint)
- **Permission Grants:** 90 days for public profiles; cannot be extended for private profiles (user must re-authorize)

#### App Review Gates (CRITICAL — High Friction)
1. **Tech Provider Verification** (~1 week)
   - Meta verifies your organization as legitimate API user
   - Required before production access

2. **Permission-Level App Review** (2–4 weeks per permission)
   - **Each permission** requires separate app review submission
   - Must include screen recording showing complete user flow
   - Reviewers manually test; screenshots/calls alone will be rejected
   - Example: `threads_content_publish` needs recording of: user login → authorize scope → publish post flow

3. **Testing Restrictions**
   - Only test users can authenticate until app review passes
   - Add test users in App Dashboard → App Roles → Roles
   - Test users must accept Threads Tester invitation in Threads Settings
   - Cannot test with production Threads accounts until approved

#### Redirect URI Rules
- **HTTPS:** ✅ **Required** — even for localhost (`https://localhost:3000/callback`)
- **Localhost:** ✅ Allowed, but must use HTTPS (not HTTP)
- **Exact Match:** ✅ Strict enforcement—must match whitelist exactly
- **Configuration:** App Dashboard → Settings → Basic → Add Valid OAuth Redirect URIs

#### Status & Availability (June 2024 launch)
- ✅ API endpoints live and functional
- ❌ Not open to all developers — requires approval
- ✅ Sample app available: [GitHub threads_api sample](https://github.com/fbsamples/threads_api)

#### Key Gotchas
- **No Personal Account Support:** Only professional/creator accounts can be used
- **Public Profile Requirement:** Best with public profiles; private profiles cannot extend permission grants
- **Screencast Requirement:** App review rejections common if screen recording doesn't show actual user interaction
- **Long Review Cycles:** Each permission is a separate 2–4 week review; bundle all permissions in one submission if possible
- **Authorization Window Confusion:** The "Authorization Window" is for data access permissions, NOT user sign-in — it follows Instagram's OAuth, not a separate identity provider

#### Sources
- [Get Started — Threads API](https://developers.facebook.com/docs/threads/get-started/) — Overview, permissions, authorization window
- [Get Access Tokens](https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions/) — OAuth flow, scopes, token types
- [Long-Lived Tokens](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens) — Token refresh, permission grant expiry
- [Threads Use Case](https://developers.facebook.com/docs/development/create-an-app/threads-use-case/) — App creation, API access
- [Blog: Threads API Launch](https://developers.facebook.com/blog/post/2024/06/18/the-threads-api-is-finally-here/) — Public announcement, limitations

---

## Verdict Summary Table

| Platform | Category | Identity? | Data? | Redirect URI (Dev) | Redirect URI (Prod) | App Review Required? | HTTPS Required? | Deprecated? |
|---|---|:-:|:-:|---|---|:-:|:-:|:-:|
| **Facebook Login** | LOGIN | ✅ | ✅ | HTTP ok | HTTPS only | `email` + others only | ✅ (prod) | ❌ NO |
| **Facebook Login for Business** | LOGIN (multi-tenant) | ✅ | ✅ | HTTP ok | HTTPS only | ✅ (Advanced) | ✅ (prod) | ❌ NO |
| **Instagram API + Login** | CONNECTOR | ❌ | ✅ | HTTPS only | HTTPS only | ✅ (Advanced) | ✅ | ⚠️ Scopes: Jan 27, 2025 |
| **Threads API** | CONNECTOR | ❌ | ✅ | HTTPS only | HTTPS only | ✅✅ (Tech Verify + Per-Permission) | ✅ | ❌ NO |

---

## Key Findings for NEXUS-LINK Implementation

### For User Sign-In (Federated Identity)
✅ **Use:** Facebook Login (or Facebook Login for Business for multi-tenant)
- Supports email, basic profile data
- Pre-approved scopes require no app review
- Can request `user_friends` with app review if needed
- OAuth v25.0 stable and production-ready

### For Platform Connectors (Data Access)
✅ **Instagram:** Use Instagram API with Instagram Login
- ⚠️ **NOT for sign-in** — connector only
- Requires Advanced Access (app review + business verification) for third-party accounts
- **URGENT:** Migrate off old scopes before Jan 27, 2025
- HTTPS required everywhere

✅ **Threads:** Use Threads API
- ⚠️ **NOT for sign-in** — connector only
- Very high friction: Tech Provider Verification + per-permission app review (2–4 weeks each)
- Test users only until approval
- HTTPS required everywhere; good for MVP testing with test accounts

### OAuth Security Patterns
- **CSRF:** Use `state` parameter in all flows
- **Token Storage:** Server-side session; never expose in client JS
- **Redirect Matching:** Exact-match enforcement; register all URIs in dashboard
- **HTTPS:** Production-mandatory for all platforms; localhost can be HTTP during early dev but must switch before going live

---

## Next Steps for Implementation

1. **Create Facebook Login app** in App Dashboard (OAuth scope: email, public_profile)
2. **For Instagram connector:** Create separate Instagram app; request Advanced Access (budget 2–3 weeks for review)
3. **For Threads connector:** Create Threads use-case app; prepare for Tech Provider Verification + per-permission app review (budget 4–6 weeks minimum)
4. **Register redirect URIs:** All platforms require exact-match URIs; use GoTrue callback handling
5. **Scope Migration Alert:** If any existing Instagram Basic Display apps: migrate before Dec 4, 2024 deadline (now past); if not yet migrated, migrate immediately to new scopes before Jan 27, 2025

---

## Related Resources

- **GoTrue Auth Setup:** See `GotrueProviders` lane for Supabase GoTrue configuration
- **OAuth Security:** See `OauthSecurityBcp` lane for comprehensive security requirements
- **OMP Callback Flow:** See `OmpOauthSource` lane for loopback port handling and callback routing
- **Google OIDC:** See `GoogleSigninOidc` lane for alternative identity provider (recommended as primary)

---

**Report Generated:** 2026-07-07  
**Researcher:** MetaOauthSuite  
**Status:** ✅ VERIFIED from current Meta developer documentation (developers.facebook.com/docs)

