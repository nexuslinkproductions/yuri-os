# NEXUS-LINK AI Chat — Model Strategy Decision

**Date:** 2026-07-07  
**Lane:** ChatModelDecision  
**Status:** DECIDED  
**Question:** What powers the in-app AI chat for a hosted multi-tenant funnel-SaaS (€290–€1290/mo tiers) whose users are non-technical DACH businesses?

---

## 0. The Three Options Under Evaluation

| Option | Shape | Who pays for inference? |
|---|---|---|
| **(A) Embed OMP+YURI CLI** | Run a per-user OMP agent process server-side; users authenticate their own Claude/Cursor subscription via OAuth | User (own Max/Pro subscription) |
| **(B) Built-in model** | NEXUS-LINK server calls DeepSeek V4-Flash (via Ollama Cloud or direct API) with YURI's server-side key; users need NO subscription | NEXUS-LINK (metered, absorbed/tiered) |
| **(C) Bring-Your-Own-API-Key** | User pastes their own provider API key (Anthropic, OpenAI, DeepSeek, etc.); NEXUS-LINK proxies calls directly | User (own API billing) |

---

## 1. The OMP Feasibility Question (Option A)

### Does embedding OMP-as-chat make sense for a hosted multi-tenant app?

**NO. It is a category error.**

This is not a qualified "maybe with workarounds" — it is an architectural impossibility given four load-bearing constraints that compound:

#### VERIFIED constraints (primary-sourced, each independently fatal)

| # | Constraint | Source | Why it kills Option A |
|---|---|---|---|
| 1 | **OMP is a LOCAL CLI harness with NO HTTP router** | `07-claude-cursor-brain.md` [L]: *"OMP exposes no HTTP model-router. `task()`/`completion()` are in-process function calls only."* | A web app cannot POST to OMP. Each "user session" would require a dedicated Bun/Node process embedding `createAgentSession()` — one OS process per concurrent user, on your server. |
| 2 | **Headless Claude is FORBIDDEN** | Global `CLAUDE.md` [L]: *"Forbidden everywhere: `claude -p`, `claude --print`, SDK headless calls, fresh no-persistence prompt processes."* | OMP's `createAgentSession()` is designed for ONE interactive terminal session with Marcel as operator, not for spawning N headless sessions serving web requests. |
| 3 | **Single-operator token model** | OMP stores all credentials in `~/.omp/agent/agent.db` [L]; no per-user token segregation. OAuth tokens (Claude Max) are tied to ONE operator identity. | Multi-tenant = multi-user credentials. OMP has no concept of "user A's token vs user B's token." You'd need N separate OMP installs with N separate credential stores — operationally insane. |
| 4 | **Anthropic ToS prohibits subscription proxying** | Anthropic Consumer Terms (Feb 2026) [P]: *"The use of OAuth tokens obtained via Claude Free, Pro, or Max accounts in any other product, tool, or service is not permitted."* [theregister.com, apiyi.com, sitepoint.com] | Even if OMP could run multi-tenant (it can't), routing users' Max subscription tokens through your SaaS server violates Anthropic's ToS. The OpenClaw ban (Apr 2026) enforced exactly this. |

#### INFERRED compounding problems (if the above were somehow solved)

- **Resource cost**: Each OMP agent session holds model context, MCP server connections, hook state, and a streaming event loop. At 50 concurrent users, that's 50 persistent Node processes with full agent state — on a CPX32 (4 vCPU, 8GB RAM) hosting budget of €35–70/mo. Impossible.
- **Cursor SDK is account-locked**: `@cursor/sdk` auth is tied to a Cursor subscription account, not transferable to third-party end users. Cannot be proxied.
- **No process isolation**: Multiple OMP instances sharing one server have no tenant isolation for tool calls (`bash`, `read`, filesystem access). A security nightmare for multi-tenant SaaS.

**Verdict: Option A is dead. Not "hard" — architecturally impossible within the stated constraints. Do not pursue.**

---

## 2. Option Matrix

### Dimensions × Options

| Dimension | **(A) Embed OMP+YURI CLI** | **(B) Built-in DeepSeek V4-Flash** | **(C) BYO-API-Key** |
|---|---|---|---|
| **User friction** | ☠️ **FATAL.** Non-technical DACH SMBs must: (1) have a Claude Max subscription ($100-200/mo), (2) understand OAuth, (3) grant token access to a third party. Conversion-killing for hairdressers and coaches. | ✅ **ZERO.** AI just works. User sees a chat box, types, gets answers. No signup, no key, no concept of "model." This is the product. | ⚠️ **HIGH.** User must: (1) create an API account with a provider, (2) add billing, (3) find and copy an API key, (4) paste it into settings. Non-technical users will not do this. Power-user-only feature. |
| **Unit economics / cost exposure** | N/A (dead) | ⚠️ **We eat inference cost.** DeepSeek V4-Flash: $0.14/M input, $0.28/M output. A 20-turn conversation ≈ $0.003–0.006. At 100 active workspaces × 10 conversations/day: **~$1–2/day, ~$30–60/mo total.** Manageable. Cached input drops to $0.003/M (98% savings). Monthly burn stays well under 1% of revenue even at scale. | ✅ **Zero cost to us.** User pays their own API bill. But: users who pay €290–1290/mo for our SaaS expect AI to be included, not separately billed. |
| **ToS / legal risk** | ☠️ **FATAL.** Anthropic Consumer Terms (Feb 2026): subscription OAuth tokens prohibited in third-party products. Cursor SDK account-locked. The "wrapper ban" (Feb 2026) + OpenClaw enforcement (Apr 2026) make this unambiguously prohibited. | ✅ **CLEAN.** We hold our own DeepSeek API key. We are DeepSeek's customer, our users are our customers. Standard B2B API consumption. DeepSeek's terms permit commercial use (MIT-licensed model, commercial API). No subscription proxying. | ✅ **CLEAN for us.** User's own key = user's own ToS relationship with the provider. We are a conduit, not a reseller. Anthropic's own recommendation for SaaS builders: *"Implement BYOK so each user authenticates with their own API key"* [sitepoint.com]. |
| **Security & multi-tenant isolation** | ☠️ **IMPOSSIBLE.** OMP has filesystem tool access, single credential store, no tenant boundaries. One user's agent session could access another's data. | ✅ **STRONG.** Server-side key never exposed to users. All calls go through our backend with workspace-scoped context. RLS tenant isolation (already built: `ai_usage_events.workspace_id`). Token ledger tracks per-workspace usage. | ⚠️ **MEDIUM.** User API keys stored in our database — must be encrypted at rest (AES-GCM, same pattern as `connector_tokens`). Key exposure = user's billing compromise. We become a key custodian. |
| **Engineering effort** | ☠️ **MASSIVE + FUTILE.** Would require: rewriting OMP as a multi-tenant server, building per-user process isolation, credential segregation, WebSocket bridges. Months of work on a fundamentally wrong architecture. | ✅ **LOW.** OpenAI-compatible API (DeepSeek supports `/v1/chat/completions`). Standard server-side integration: system prompt + user message → API call → stream response to frontend via SSE/WebSocket. Schema already exists (`ai_workspace_config`, `ai_usage_events`). ~1–2 weeks for MVP. | ⚠️ **MEDIUM.** Same API integration as (B), plus: key storage/encryption, key validation per provider, multi-provider routing (Anthropic/OpenAI/DeepSeek each have different API shapes), settings UI for key management. ~3–4 weeks. |
| **Product fit for funnel-SaaS** | ☠️ **NONE.** A coding-agent CLI has nothing to do with funnel management, CRM, or business automation. OMP is built for developers writing code, not coaches managing leads. | ✅ **EXCELLENT.** "AI-powered" is table stakes for SaaS in 2026. A built-in AI assistant that knows the user's leads, pipeline, and scripts — grounded in their workspace data — is the differentiator (Master Plan §10: *"AI chat / auto-reply console"*). | ⚠️ **PARTIAL.** Works for power users who want Claude-quality over DeepSeek. But making AI a separately-purchased add-on undermines the "AI-powered platform" positioning. |

### Scoring summary

| Dimension | A | B | C |
|---|---|---|---|
| User friction | 0 | 10 | 3 |
| Unit economics | — | 7 | 10 |
| ToS/legal | 0 | 10 | 9 |
| Security | 0 | 9 | 6 |
| Engineering effort | 0 | 9 | 6 |
| Product fit | 0 | 10 | 5 |
| **Weighted total** | **☠️** | **🏆 9.2** | **6.3** |

---

## 3. Cost Analysis: Can We Afford Built-In AI?

### DeepSeek V4-Flash pricing (verified July 2026)

| | $/M tokens | With caching |
|---|---|---|
| Input | $0.14 | $0.003 (cached) |
| Output | $0.28 | $0.28 |

### Per-conversation cost model

| Scenario | Tokens (in/out) | Cost | Notes |
|---|---|---|---|
| Short turn (1 message) | ~800 in / 120 out | **$0.00015** | System prompt + short history |
| 10-turn conversation | ~8k in / 1.2k out (cached) | **$0.00036** | Steady-state, prefix cached |
| 20-turn conversation | ~16k in / 2.4k out (cached) | **$0.00072** | Deep session |
| Heavy daily user (20 conversations) | ~320k in / 48k out | **$0.014/day** | Power user ceiling |

### Monthly platform cost projections

| Scale | Active workspaces | Conversations/day | Monthly AI cost | Per-workspace | % of €290 tier |
|---|---|---|---|---|---|
| Launch (10 customers) | 10 | 50 | **~$2.25** | $0.22 | 0.08% |
| Growth (50 customers) | 50 | 250 | **~$11** | $0.22 | 0.08% |
| Scale (200 customers) | 200 | 1,000 | **~$45** | $0.22 | 0.08% |
| Aggressive (500 customers) | 500 | 5,000 | **~$225** | $0.45 | 0.15% |

**Verdict: At DeepSeek V4-Flash pricing, AI inference is a rounding error on hosting costs.** Even at 500 customers with aggressive usage, monthly AI cost (~$225 ≈ €207) is less than the price of ONE customer's monthly subscription. The €40–90/mo hosting budget (Hetzner, Master Plan §8) absorbs this trivially.

### Comparison: What if we used Claude Sonnet instead?

| Scale | Monthly cost (Sonnet 4.5 intro pricing) | Monthly cost (DeepSeek V4-Flash) | Ratio |
|---|---|---|---|
| 50 customers | ~$550 | ~$11 | **50×** |
| 200 customers | ~$2,200 | ~$45 | **49×** |
| 500 customers | ~$5,500 | ~$225 | **24×** |

DeepSeek is the correct default model for a margin-preserving SaaS. Claude is the correct upgrade for users who want it and will pay for it (via BYO-key).

---

## 4. Primary Recommendation

### **Option B (Built-in DeepSeek V4-Flash) as PRIMARY, Option C (BYO-API-Key) as OPTIONAL UPGRADE**

The two options coexist naturally. The `ai_workspace_config.key_mode` column already supports this:

```
key_mode IN ('platform', 'byok', 'hybrid')
```

- **`platform`** (default): All AI calls use NEXUS-LINK's server-side DeepSeek API key. User sees "AI Assistant" — no configuration, no friction. Included in all tiers.
- **`byok`**: Power user pastes their own API key (Anthropic, OpenAI, etc.) in workspace settings. Their key, their model, their bill. NEXUS-LINK routes calls through their key instead.
- **`hybrid`**: Platform default + user override per feature (e.g., use DeepSeek for auto-replies but user's Claude key for deep analysis). Future enhancement.

### Why this is the right call

1. **Product positioning**: NEXUS-LINK sells "a team, powered by AI" (Master Plan §1). AI must be built-in, invisible, always-on. Making users configure their own model subscription contradicts the core value prop.

2. **Unit economics work**: DeepSeek V4-Flash inference cost is negligible relative to subscription revenue. At €290/mo minimum tier, even generous AI usage costs <€0.50/workspace/month. This is not a cost center — it's a feature that justifies the price.

3. **Competitive parity**: Every SaaS competitor (ClickTools successors, GoHighLevel, etc.) includes AI features in their tier pricing. Requiring users to bring their own AI subscription is a competitive disadvantage.

4. **BYO-Key serves the power-user tail**: The small percentage of technically sophisticated users who want Claude Opus or GPT-5 quality can bring their own key. This is an upsell differentiator, not the default experience.

5. **Schema already supports it**: The `ai_workspace_config` table with `key_mode`, `monthly_credit_usd`, `soft_cap_usd`, `hard_cap_usd` and the `ai_usage_events` ledger are already built. The data model anticipated this decision.

---

## 5. Phased Delivery Path

### Phase 1: Built-in AI (ship with platform, ~1–2 weeks)

- **Model**: DeepSeek V4-Flash via direct API (`api.deepseek.com`, OpenAI-compatible endpoint)
- **Backend**: Python service endpoint accepting workspace-scoped chat requests, calling DeepSeek, streaming response via SSE
- **Context grounding**: System prompt includes workspace name, user role, and relevant CRM/pipeline context from the workspace's own data
- **Metering**: Every request logged to `ai_usage_events` with `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`
- **Caps**: `ai_workspace_config.monthly_credit_usd` enforced server-side; soft cap → warning, hard cap → block
- **Tier gating**: `plan_tier` determines monthly credit allocation (e.g., trial=$0, starter=$5, professional=$15, business=$50)
- **Frontend**: Chat widget in the app sidebar; conversation history stored per-workspace
- **No user configuration required**

### Phase 2: BYO-API-Key (optional, ~2–3 weeks after Phase 1)

- **Settings UI**: Workspace admin can paste an API key for Anthropic, OpenAI, or DeepSeek
- **Key storage**: AES-GCM encrypted in `connector_tokens` (same pattern as OAuth tokens; keys in OS keyring, not in DB plaintext)
- **Key validation**: On save, make a minimal API call to verify the key works
- **Model selection**: When BYO key is active, user can choose model (Claude Sonnet, GPT-4, etc.)
- **Routing**: Backend checks `key_mode` → if `byok`, use user's key; if `platform`, use ours
- **Usage tracking**: Still logged to `ai_usage_events` for analytics (cost_usd = $0 for BYO since we don't pay)
- **No change to UX**: Same chat widget, same experience, just better model if user pays for it

### Phase 3: AI Auto-Reply Console (follows Master Plan §4 timeline)

- **Bot configuration**: Admin defines AI behavior for auto-replies on connected social/chat channels
- **Knowledge grounding**: Sales scripts, FAQ, product knowledge uploaded per workspace
- **Human-handoff thresholds**: Confidence scoring; below threshold → route to human inbox
- **Audit trail**: Every AI-generated reply logged with the message it responded to
- **This is the revenue-generating AI surface** — the thing that makes the platform "run the business"

### Phase ∞: NOT on the roadmap

- ❌ OMP/YURI CLI embedding (architecturally impossible, ToS-violating)
- ❌ Claude Max subscription proxying (ToS-violating)
- ❌ Running local models on Hetzner (inference compute doesn't fit the CPX32–42 hosting budget)
- ❌ Fine-tuned model (premature — DeepSeek + system prompt + RAG is sufficient for V1; the "owned AI" from Master Plan §10 is a separate, later track)

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| DeepSeek API instability/downtime | MEDIUM | Add OpenAI-compatible fallback (e.g., Groq, Together.ai). The OpenAI-compatible endpoint means swapping `base_url` is a 1-line change. |
| DeepSeek pricing increases | LOW | Current pricing ($0.14/$0.28 per M) has headroom for 10× increase before it matters. If pricing becomes material, switch to another cheap model (Qwen, Llama via Together/Groq). |
| DeepSeek China-origin regulatory concern (EU/DACH) | MEDIUM | Data sent to DeepSeek API = user prompts + workspace context. For DSGVO: document the data processor relationship, ensure no PII in system prompts, offer BYO-key with EU-hosted provider (Anthropic EU, Mistral) as alternative. Consider Mistral as EU-native fallback. |
| Users abuse AI (high volume) | LOW | `hard_cap_usd` already in schema. Enforce per-workspace monthly limits. Aggressive users hit the cap; they can BYO-key to continue. |
| BYO-key security (key stored in our DB) | MEDIUM | AES-GCM encryption (same as `connector_tokens`). Keys decrypted only at call time, never logged, never sent to frontend after initial save. Key rotation reminder. |
| Anthropic ToS changes affect BYO-key | LOW | BYO-key is explicitly Anthropic's recommended pattern for SaaS builders. They endorsed it as the compliant alternative to wrapper/proxy models. |

---

## 7. Evidence Classification

### VERIFIED (primary-sourced, load-bearing)

- OMP has no HTTP router; in-process only [L: `07-claude-cursor-brain.md`]
- Global CLAUDE.md bans headless Claude [L: `.claude/CLAUDE.md`]
- OMP single-operator credential store [L: `07-claude-cursor-brain.md`]
- Anthropic Consumer Terms (Feb 2026) prohibit subscription OAuth tokens in third-party products [P: theregister.com, anthropic.com, sitepoint.com, apiyi.com — 4 independent sources]
- Anthropic OpenClaw ban enforcement (Apr 2026) [P: mindstudio.ai, decodethefuture.org, dev.to]
- DeepSeek V4-Flash pricing: $0.14/M in, $0.28/M out, $0.003/M cached [P: api-docs.deepseek.com, openrouter.ai, aipricing.guru]
- NEXUS-LINK schema already has `key_mode IN ('platform', 'byok', 'hybrid')` [L: `00001_nexus_core_stub.sql`]
- NEXUS-LINK schema has `ai_usage_events` immutable token ledger [L: `00001_nexus_core_stub.sql`]
- Claude Sonnet 4.5 pricing: $3.00/M in, $15.00/M out (intro: $2/$10 through Aug 2026) [P: platform.claude.com]
- NEXUS-LINK target: non-technical DACH SMBs, €290–1290/mo tiers [L: `NEXUS-MASTER-PLAN.md`]
- BYO-key is Anthropic's explicitly recommended SaaS pattern [P: sitepoint.com citing Anthropic docs]

### INFERRED (reasonable, not primary-verified)

- DeepSeek V4-Flash quality is sufficient for CRM/funnel assistant tasks (not code generation) [INFERENCE: based on benchmark positioning as "Sonnet-class" for general tasks; needs product testing]
- 10 conversations/day/workspace is a reasonable usage estimate for SMB users [INFERENCE: based on CRM usage patterns; actual usage will vary]
- BYO-key adoption will be <10% of users [INFERENCE: based on the non-technical ICP; power users are a small tail]
- Mistral is a viable EU-native fallback for DSGVO-sensitive customers [INFERENCE: Mistral is EU-based and offers API access, but pricing/quality not verified for this use case]

---

## 8. Decision Summary (8-line digest)

```
DECISION: Built-in DeepSeek V4-Flash (Option B) as default; BYO-API-Key (Option C) as optional upgrade.
KILLED:   OMP+YURI CLI embedding (Option A) — architecturally impossible + ToS-violating. Category error.
WHY B:    Zero user friction, negligible cost (~$0.22/workspace/mo), schema already built, product-fit perfect.
WHY C:    Power-user escape hatch; Anthropic-endorsed pattern; lets users upgrade to Claude/GPT if they want.
COST:     DeepSeek V4-Flash at 200 customers ≈ $45/mo total. Rounding error on Hetzner hosting.
PHASE 1:  Built-in DeepSeek chat, server-side key, SSE streaming, metered per workspace. ~1-2 weeks.
PHASE 2:  BYO-key settings UI + encrypted key storage + multi-provider routing. ~2-3 weeks after Phase 1.
RISK:     DeepSeek China-origin DSGVO optics → mitigate with EU-native fallback option (Mistral).
```
