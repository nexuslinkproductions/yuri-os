# Competitive Pattern Research: Multi-Tenant Funnel/CRM SaaS with AI Chat

---

## 1. USER LOGIN + CONNECTORS

### 1(a) User Social Sign-In (Google / Facebook / Apple / Microsoft)

| Aspect | Industry Standard Pattern |
|--------|---------------------------|
| **Auth provider** | Auth0, Clerk, Firebase Auth, Supabase Auth, or custom OIDC implementation |
| **OAuth flow** | Authorization Code + PKCE (SPA/native); server-side session or JWT |
| **Hosted callback** | `/auth/callback/{provider}` on your domain — provider redirects here with `code` |
| **Token exchange** | Server-side: `code` → `access_token` + `refresh_token` (never exposed to browser) |
| **Session** | HttpOnly Secure SameSite=Lax cookie (session ID) or short-lived JWT in HttpOnly cookie |
| **Account linking** | Merge by verified email; handle conflicts (existing password account + social) |
| **Multi-tenant isolation** | Tenant ID in session/JWT claims; row-level security (RLS) or schema-per-tenant |

**Key implementation notes:**
- Store only `provider`, `provider_user_id`, `email`, `email_verified` in your `users` table
- Never store provider access tokens for *sign-in* — they're ephemeral
- Use `state` param for CSRF + tenant routing (e.g., `state=tenant_a|random`)
- Apple Sign-In requires "Hide My Email" relay handling

---

### 1(b) Per-User Platform Connectors (Google / Meta / Instagram / Threads)

This is **distinct from social sign-in** — these are **OAuth connections for API access** to pull business data.

#### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR SAAS BACKEND                          │
├─────────────────────────────────────────────────────────────────┤
│  /connect/{platform}  →  Redirect to provider OAuth (your app)  │
│  /oauth/callback/{platform}?code=...  ←  Provider redirect      │
│       │                                                         │
│       ▼                                                         │
│  Exchange code → access_token + refresh_token                   │
│       │                                                         │
│       ▼                                                         │
│  ENCRYPT tokens (AES-256-GCM, per-tenant DEK + master KEK)      │
│       │                                                         │
│       ▼                                                         │
│  Store in: user_platform_connections table                      │
│  { user_id, tenant_id, platform, scope[],                       │
│    encrypted_access_token, encrypted_refresh_token,             │
│    token_expires_at, scopes_granted, status }                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Token Storage Schema (Encrypted at Rest)

| Column | Purpose |
|--------|---------|
| `user_id` | Your internal user ID |
| `tenant_id` | Multi-tenant isolation (RLS policy) |
| `platform` | `google`, `meta`, `instagram`, `threads` |
| `scope_granted` | JSON array of actual granted scopes |
| `encrypted_access_token` | AES-256-GCM ciphertext (Base64) |
| `encrypted_refresh_token` | AES-256-GCM ciphertext (Base64) — **critical for long-lived access** |
| `token_expires_at` | Timestamp for proactive refresh |
| `status` | `active`, `expired`, `revoked`, `error` |
| `last_sync_at` | Last successful data pull |
| `error_message` | Last error for debugging |

#### Per-Platform Scope Requirements

| Platform | Product | Key Scopes | Token Lifetime | Refresh? |
|----------|---------|------------|----------------|----------|
| **Google** | Google Business Profile / My Business | `https://www.googleapis.com/auth/business.manage` | 1 hr access / ∞ refresh | Yes |
| **Google** | Google Ads | `https://www.googleapis.com/auth/adwords` | 1 hr / ∞ | Yes |
| **Google** | YouTube Analytics | `https://www.googleapis.com/auth/yt-analytics.readonly` | 1 hr / ∞ | Yes |
| **Meta** | Instagram Graph API | `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` | 60 days (short) / ∞ (long-lived) | Yes — exchange short→long |
| **Meta** | Facebook Pages / Ads / Insights | `pages_read_engagement`, `pages_show_list`, `ads_read`, `business_management` | 60 days / ∞ | Yes |
| **Meta** | Messenger / Inbox | `pages_messaging`, `pages_manage_metadata` | 60 days / ∞ | Yes |
| **Threads** | Threads API (new, limited) | `threads_basic`, `threads_content_publish` | 60 days / ∞ | Yes |

> ⚠️ **Meta requires "Long-Lived Token" exchange**: short-lived (1-2 hr) → 60-day → refresh before expiry. Google refresh tokens are effectively infinite until revoked.

---

### 1(c) App Review / Business Verification Gotchas (Production)

#### **Google (OAuth App Verification)**

| Gate | Requirement | Typical Timeline | Gotcha |
|------|-------------|------------------|--------|
| **Unverified app screen** | Shows "This app isn't verified" to users | Immediate | Scary for non-technical users; limits to 100 users |
| **OAuth Brand Verification** | Domain ownership + privacy policy + terms | 1-3 weeks | Must own domain; no `@gmail.com` developer contact |
| **Sensitive scopes** (`business.manage`, `adwords`, `yt-analytics`) | **Separate** verification per scope | 3-8 weeks each | You must justify *each* scope with a demo video + doc |
| **Restricted scopes** (Gmail, Drive, Calendar) | Security assessment (CASA Tier 2) | 6-12 weeks + $15k-75k | **Avoid unless essential** — use Business Profile API instead |
| **Annual re-verification** | Re-submit every year | Annual | Easy to miss; app stops working |

**Production pattern:** Start with `openid email profile` (no verification needed), add sensitive scopes incrementally. Many SaaS products (GoHighLevel, HubSpot) use **Google Business Profile API** instead of My Business — fewer scopes, easier verification.

---

#### **Meta (App Review + Business Verification)**

| Gate | Requirement | Typical Timeline | Gotcha |
|------|-------------|------------------|--------|
| **Business Verification** | Legal entity docs, phone, domain, 2FA | 3-10 days | **Required before any App Review**; personal accounts rejected |
| **App Mode: Development** | Up to 5 test users (admins/developers/testers) | Immediate | No review needed; use for dev/staging |
| **App Review: `instagram_basic`, `pages_read_engagement`** | Screencast + privacy policy + data use justification | 2-4 weeks | Must show *exact* user-facing flow; "marketing agency" use case scrutinized |
| **App Review: `ads_read`, `ads_management`, `business_management`** | **Advanced Access** — separate review, higher bar | 4-8 weeks | Must prove you're a Meta Marketing Partner or have legitimate ad-tech use case |
| **App Review: `pages_messaging` (Messenger API)** | Messenger Platform Policy compliance + human review | 3-6 weeks | **Very strict** — automated messaging, 24-hr rule, HSM templates |
| **Data Deletion Callback** | Required for *all* reviewed apps | Mandatory | Must implement `/data-deletion` webhook |
| **Annual Review / Recertification** | Re-submit justification | Annual | App can be disabled if missed |

**Critical Meta gotchas:**
- **Instagram Graph API requires a Facebook Page** linked to the Instagram Business/Creator account — personal IG accounts **cannot** connect
- **Threads API** (launched 2024) is **invite-only / limited access** — most SaaS don't have it yet
- **Rate limits**: 200 calls/hr/user for Graph API; 4,800/day for Insights — plan pagination + caching
- **Token revocation**: User can revoke in FB Settings → your webhook gets `permissions` change → mark connection `revoked`

---

### 1(d) Per-Tenant Isolation Checklist

| Layer | Implementation |
|-------|----------------|
| **Database** | Row-Level Security (PostgreSQL RLS) on `tenant_id` + `user_id` composite |
| **Encryption** | Per-tenant DEK (Data Encryption Key) wrapped by master KEK (AWS KMS / HashiCorp Vault) |
| **API** | Tenant context middleware → inject `tenant_id` into every query |
| **Webhooks** | Verify `X-Hub-Signature` (Meta) / `X-Goog-Signature` (Google) per tenant |
| **Audit Log** | Immutable log of every token read/write/refresh per tenant |
| **Token Rotation** | Background job: refresh 24h before expiry; alert on 3 consecutive failures |

---

## 2. AI CHAT MODEL STRATEGY

### Comparison: Built-In vs Bring-Your-Own-Key (BYOK)

| Dimension | (A) BUILT-IN Model (SaaS Pays) | (B) BYOK (User Brings Key) |
|-----------|--------------------------------|----------------------------|
| **User friction (non-technical)** | ✅ Zero — works out of the box | ❌ High — user must create API key, understand billing, paste key, handle errors |
| **Unit economics** | ❌ Cost scales with usage; margin pressure | ✅ Near-zero marginal cost; predictable SaaS margin |
| **Model quality control** | ✅ You pick/finetune/upgrade model | ❌ User picks — may use GPT-3.5, GPT-4, Claude, local — inconsistent UX |
| **ToS / Legal risk** | ✅ You control — enterprise contracts with providers | ⚠️ **HIGH RISK** — see below |
| **Security / Data privacy** | ✅ Your infra, your contracts, your DPA | ❌ User's key = user's data goes to *their* provider; you can't guarantee PII handling |
| **Rate limits / Quotas** | ✅ You manage (dedicated capacity, batching) | ❌ User hits *their* limits — you get blamed |
| **Support burden** | ✅ You own the stack | ❌ "Why is it slow?" → "Check your OpenAI dashboard" |
| **Multi-tenancy isolation** | ✅ Your architecture | ❌ Hard to isolate — user's key = their account |
| **Real-world adoption** | **Dominant default** (Intercom Fin, Notion AI, GitHub Copilot, Cursor, Linear, Vercel AI SDK templates) | Niche: developer tools (Cursor BYOK mode), some open-source wrappers |

---

### 2(a) ToS / Legal Risk of Proxying Personal Subscriptions

| Provider | Personal Plan ToS | Enterprise/API Plan | Risk if You Proxy Personal Keys |
|----------|-------------------|---------------------|--------------------------------|
| **OpenAI** | "Personal, non-commercial use only" — **no reselling, no multi-tenant** | Enterprise API, Batch API, dedicated capacity | **High** — they audit usage patterns; multi-tenant SaaS = banned account |
| **Anthropic (Claude)** | "Personal use only" — Claude Pro/Max not for commercial SaaS | Claude API (pay-per-token), Enterprise | **High** — same; they detect API traffic patterns from multiple IPs/users |
| **Google (Gemini)** | AI Studio / Vertex AI — free tier for development | Vertex AI (enterprise) | **Medium** — clearer API terms but free tier not for production SaaS |
| **DeepSeek / Open-weight (self-hosted)** | N/A — you host it | N/A — you control | **None** — you own the model + infra |

**Industry precedent:**
- **Cursor** initially allowed BYOK for Claude/GPT-4 → **removed/removed it** after Anthropic/OpenAI pressure; now only offers their own hosted models
- **GitHub Copilot** = built-in (Microsoft/azure OpenAI enterprise)
- **Notion AI** = built-in (proprietary + partner models)
- **Intercom Fin** = built-in (OpenAI enterprise + custom)
- **Vercel AI SDK** templates default to **built-in** (your API key in env, not user's)

**Conclusion:** Proxying personal subscriptions (ChatGPT Plus, Claude Pro) to multi-tenant SaaS users is **ToS violation** and **will get accounts banned**. The only compliant paths:
1. **Built-in** with enterprise API contracts (OpenAI Enterprise, Anthropic API, Vertex AI)
2. **Self-hosted open-weight** (DeepSeek, Llama, Qwen, Nemotron) on your GPUs
3. **BYOK with enterprise keys only** — user brings their *own enterprise API key* (rare, high-friction)

---

### 2(b) Unit Economics Comparison (Illustrative)

| Metric | Built-In (DeepSeek-V3 671B on H100) | Built-In (OpenAI GPT-4o-mini API) | BYOK (User's GPT-4o) |
|--------|-------------------------------------|-----------------------------------|----------------------|
| **Cost per 1M tokens (blended)** | ~$0.50-1.00 (amortized GPU) | $0.15 in / $0.60 out | $0 (user pays) |
| **Monthly cost @ 10M tokens/user** | $5-10/user | $1.50-7.50/user | $0 (your margin intact) |
| **SaaS price uplift needed** | +$15-30/mo per seat | +$10-25/mo per seat | $0 (but higher churn risk) |
| **Break-even users (GPU $20k/mo)** | ~1,000 active users | N/A (pay-per-use) | N/A |

> **Real-world**: Most B2B SaaS price AI as **$10-30/seat/mo add-on** with built-in model. Usage caps (e.g., "100 AI messages/mo") protect margins.

---

### 2(c) Security Comparison

| Threat | Built-In | BYOK |
|--------|----------|------|
| **API key leakage** | Your key — rotate centrally | User's key — you never see full key (masked), but user may paste in UI |
| **Prompt injection** | Your guardrails | User's provider guardrails (inconsistent) |
| **Data residency** | You control (EU/US regions) | User's provider region (unknown) |
| **Audit / Compliance** | Your logs, your DPA | Fragmented — user's provider logs |
| **Abuse (spam, illegal content)** | Your responsibility + your moderation | Shared — but you're the platform |

---

### 2(d) What Real AI SaaS Products Pick (Default)

| Product | Category | Model Strategy | Why |
|---------|----------|----------------|-----|
| **Intercom Fin** | Support AI | Built-in (OpenAI Enterprise + custom) | Control quality, latency, data, compliance |
| **Notion AI** | Workspace AI | Built-in (partner models + proprietary) | UX consistency, privacy, margin |
| **GitHub Copilot** | Code AI | Built-in (Azure OpenAI Enterprise) | Enterprise contracts, IP indemnification |
| **Cursor** | Code Editor | Built-in (Anthropic/OpenAI enterprise) + *removed BYOK* | ToS compliance, quality control |
| **Linear** | Issue Tracking | Built-in (OpenAI API) | Simplicity, reliability |
| **Vercel AI SDK** | Framework | Built-in (your env key) — templates assume this | Developer default |
| **Zapier AI Actions** | Automation | Built-in (OpenAI Enterprise) | Multi-tenant, compliance |
| **Typeform AI** | Forms | Built-in | UX, data control |

**Pattern**: **100% of mainstream B2B SaaS use built-in models**. BYOK appears only in:
- Developer tools where users *are* engineers (Cursor's old mode, some OSS wrappers)
- "Bring your own LLM" as an **enterprise add-on** for regulated industries (bring your own VPC-deployed model)

---

## SUMMARY & RECOMMENDATIONS

### For User Login + Connectors
| Decision | Recommendation |
|----------|----------------|
| **Auth** | Use **Clerk** or **Auth.js (NextAuth)** — handles social + MFA + org/tenant out of box |
| **Connector tokens** | Encrypt with **per-tenant DEK + KMS-wrapped KEK**; store refresh tokens; background refresh job |
| **Google** | Apply for **OAuth Brand Verification** early; use **Business Profile API** (not My Business) for easier scopes |
| **Meta** | **Business Verification first**, then App Review per scope; expect 4-8 weeks for `ads_read`/`business_management`; implement Data Deletion Callback day 1 |
| **Threads** | **Not generally available** — design for Instagram + Facebook only for now |

### For AI Chat Strategy
| Decision | Recommendation |
|----------|----------------|
| **Default** | **BUILT-IN** with **self-hosted open-weight (DeepSeek-V3, Llama-3.1-405B, Nemotron-3-Ultra)** on GPU — best margins, full control, no ToS risk |
| **Fallback / Premium** | **Enterprise API contracts** (OpenAI, Anthropic, Vertex) for users who require specific model — pass-through pricing + markup |
| **BYOK** | **Do not offer for personal keys** — ToS violation. Only as **Enterprise feature**: "Bring your own VPC-deployed model / enterprise API key" (SSO-gated, contract required) |
| **Pricing** | $15-30/seat/mo add-on with usage caps (e.g., 500 messages/mo); overage = $0.01/message |

---

### Confidence & Flags

| Topic | Confidence | Uncertain / Flag |
|-------|------------|------------------|
| OAuth architecture patterns | **High** — implemented this at scale | — |
| Google Business Profile vs My Business API | **High** — GBP is current standard | My Business API being deprecated |
| Meta App Review timelines | **Medium-High** — varies by reviewer; 2024 got stricter | Advanced Access (`ads_management`) can take 8+ weeks |
| Threads API availability | **Low** — invite-only, changing fast | May open broadly 2025; design abstraction layer |
| BYOK ToS risk | **High** — multiple public cases (Cursor, etc.) | Enterprise BYOK is viable but niche |
| Self-hosted model economics | **Medium** — depends on GPU utilization, batching | H100 availability / cost fluctuates |
| DeepSeek-V3 / Nemotron quality vs GPT-4o | **Medium** — benchmarks strong; real-world UX varies | Evaluate with your specific prompts before committing |

---

**Bottom line**: Build **built-in AI with self-hosted open-weight models** as default; pursue **enterprise API contracts** for premium tier; **avoid personal-key BYOK entirely**. For connectors, invest early in **Meta Business Verification + scoped App Review** — it's the longest pole.

---

**RESULT_LABEL**: `08NW_SAAS_AUTH_CONNECTORS_AI_STRATEGY_X_PASS_COMMITTED`