Now I have a thorough picture of the existing YURI data-routing and privacy architecture. Let me compile the survey.

---

## SURVEY: DATA-ROUTING & PRIVACY FOR A FULL-ACCESS ASSISTANT USING CLOUD LLMs

**Lane:** D8-data-routing-privacy
**Operator:** Marcel Spatz
**Source corpus:** YURI OS (`_SYSTEM/Scripts/lane-kernel.mjs`, `secret-leak-scan.mjs`, `corpus-threat-taxonomy.mjs`, `cyber-authorized-replay-scope.mjs`, `yuri-slm-value-probe.mjs`, `pulse-lane-dispatch.mjs`, `lane-capability-manifest.json`, `llm-compat-contract.mjs`, Nexus Security Audit, DeepSeek API Router Research)

---

### 1. SPLIT-ROUTING: SENSITIVE/PII STAYS LOCAL, HARD-THINKING GOES TO PROVIDER

**HARD-FACT:** YURI already has a lane-level `privacy` field in `lane-capability-manifest.json` (`_SYSTEM/Scripts/lane-capability-manifest.json`). Every lane is tagged `"privacy": "cloud"` or `"privacy": "local"`. The local lanes (gemma-local, ollama-local) are explicitly `"privacy": "local"` — data never leaves the machine. Cloud lanes (deepseek, gpt, mimo) are `"privacy": "cloud"`.

**HARD-FACT:** The `yuri-slm-value-probe.mjs` (`_SYSTEM/Scripts/yuri-slm-value-probe.mjs`) documents the local SLM's enablement axis as: `privacy: 'local-only — sensitive/IP content never leaves the machine (binary enabler)'`. This is the explicit design intent.

**HARD-FACT:** The retired `yuri-symbiotic-pulse.mjs` (`_SYSTEM/archive/retired-pulse-cortex/yuri-symbiotic-pulse.mjs`) had a routing check: `lane?.kind === 'cloud' ? 'medium' : 'low'` for latency, and `lane?.kind === 'cloud' ? 'cloud' : 'local'` for privacy. The routing primitive existed.

**HARD-FACT:** `pulse-lane-dispatch.mjs` (`_SYSTEM/Scripts/pulse-lane-dispatch.mjs`) uses a `routePlan()` call to `llm-compat-contract.mjs` to classify task complexity. Trivial/standard tasks bypass memory context; complex/critical tasks get enriched context. This is the existing tier-gating mechanism — but it does NOT currently check a `privacy` flag before routing to cloud.

**RECALLED-PATTERN:** The `yuri-slm-value-probe.mjs` role-fit jobs include `triage_route` — a deterministic test that routes "compute SHA-256" to `native` lane, not cloud. This pattern (classify → route to cheapest/locallest capable lane) is the right shape for split-routing but is not wired as a pre-dispatch privacy gate.

**RECALLED-PATTERN:** The Nexus DeepSeek Router Research (`03_NEXUS-LINK/business/research/llm-connectivity/DEEPSEEK-API-ROUTER-RESEARCH-2026-07-02.md`) proposes a `nexus-llm-gateway` with model routing logic: default chat → `deepseek-v4-flash` (non-thinking), complex task → `deepseek-v4-pro` (thinking). This is a multi-tenant SaaS pattern, not a personal-assistant pattern, but the tier-gating mechanism is transferable.

**MINIMAL SPLIT-ROUTING RULE-SET:**

1. **Classify before dispatch.** Every outbound provider call must pass through a pre-dispatch classifier that checks: does this prompt contain PII, secrets, credentials, or protected-surface content? If yes → route to local lane only. If no → route to cheapest capable cloud lane.

2. **Lane privacy tag is the gate.** The `privacy` field in the capability manifest is the single source of truth. A cloud lane must never receive a prompt classified as containing PII. A local lane may receive anything.

3. **No implicit cloud fallback for sensitive data.** If the local lane cannot handle the task and the data is sensitive, the system must surface a "cannot process — data too sensitive for available lanes" state, not silently fall through to cloud.

---

### 2. ANONYMIZATION BEFORE PROVIDER CALLS

**HARD-FACT:** `secret-leak-scan.mjs` (`_SYSTEM/Scripts/secret-leak-scan.mjs`) has regex patterns for 9 secret types (OpenAI keys, Anthropic keys, NVIDIA keys, GitHub PATs, AWS access keys, generic secret assignments, etc.) and a `mask()` function that shows only first 4 + last 4 characters. This is a post-hoc scanner, not a pre-dispatch anonymizer.

**HARD-FACT:** The `cyber-authorized-replay-scope.mjs` (`_SYSTEM/Scripts/cyber-authorized-replay-scope.mjs`) defines data handling rules: "no secrets copied into prompts or reports", "client evidence redacted before durable storage", "protected paths remain sealed unless a migration wrapper explicitly exports safe summaries".

**RECALLED-PATTERN:** The `corpus-threat-taxonomy.mjs` (`_SYSTEM/Scripts/corpus-threat-taxonomy.mjs`) defines CREDENTIAL_ACCESS as a HIGH-severity threat: "Reads environment variables, keychains, ~/.ssh, .env files, or API-key/token identifiers. A skill that reads secrets it has no functional reason to touch is a likely exfiltration precursor." The remediation: "Pass credentials in explicitly scoped, never read the ambient secret store."

**MINIMAL ANONYMIZATION RULE-SET:**

1. **Strip before send.** Before any prompt reaches a cloud provider, run a lightweight regex scrubber (the existing `secret-leak-scan.mjs` patterns) over the prompt text. Replace matches with `<REDACTED_TYPE_N>`. This is a 5-line wrapper, not a research-grade PII system.

2. **No PII in metadata.** The `user_id` parameter sent to DeepSeek must match `[a-zA-Z0-9\-_]+` (per DeepSeek docs) and must never contain names, emails, or identifiers that are themselves PII. Use opaque workspace IDs.

3. **Anonymize file paths before provider context.** If file contents are sent to a cloud provider, strip absolute paths, usernames, and machine-specific identifiers from the context. Replace with relative paths from the repo root.

---

### 3. SECRETS/CREDENTIAL HANDLING

**HARD-FACT:** `PROTECTED_SURFACE_PREFIXES` in `lane-kernel.mjs` (`_SYSTEM/Scripts/lane-kernel.mjs`) is a UNIVERSAL read/write block enforced for everyone via `isProtectedPath()`. The list includes: `.env`, `.claude/.credentials.json`, `backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/projects/`, `node_modules/`, `.amp/`, browser-harness, nemo-guardrails, MSA tools. This is the "never-exfiltrate" surface.

**HARD-FACT:** `ROLE_TRUST_SURFACES` in the same file is a COWORKER-ONLY mutation block for enforcement hooks, credential files, and guard code. The dev/owner role edits these freely; coworker lanes cannot mutate them.

**HARD-FACT:** The `secret-leak-scan.mjs` scanner runs against `git ls-files` output (tracked + untracked, excluding standard gitignores). It skips binary extensions and protected prefixes. It flags secrets with type, location, and masked value.

**HARD-FACT:** The Nexus Security Audit (`03_NEXUS-LINK/business/research/security/NEXUS-SECURITY-AUDIT-2026-07-02.md`) lists "PII in prompts" as a P0 finding for the multi-tenant SaaS architecture. The remediation is the `nexus-llm-gateway` acting as the only process with key access — browser never sees provider credentials.

**MINIMAL SECRETS HANDLING RULE-SET:**

1. **Never read secrets into a prompt.** The protected-surface block is the first line of defense. A pre-dispatch check must verify that no content from a protected path has been included in the prompt being sent to a cloud provider.

2. **Credentials are injected at the transport layer, not in the prompt.** The API key for DeepSeek/Anthropic lives in the environment or a vault, and is attached to the HTTP request by the gateway/adapter — never written into the prompt text.

3. **Password vaults, keychains, and credential stores are never-exfiltrate surfaces.** The assistant may read them for local operations (credential rotation, audit) but must never include their contents in any outbound prompt. This is a hard rule, not a heuristic.

4. **If a credential must be used in a prompt (e.g. "use this API key to call service X"), the prompt must be routed to a local lane only.** Cloud providers must never see raw credentials.

---

### 4. NEVER-EXFILTRATE SURFACES

**HARD-FACT:** The protected surface list in `lane-kernel.mjs` defines the universal block surfaces. These are the "never-exfiltrate" surfaces by design.

**HARD-FACT:** The `cyber-authorized-replay-scope.mjs` adds: "no secrets copied into prompts or reports", "client evidence redacted before durable storage", "protected paths remain sealed".

**MINIMAL NEVER-EXFILTRATE RULE-SET:**

The following surfaces are **never** included in any outbound provider call, regardless of anonymization:

| Surface | Rationale |
|---------|-----------|
| `.env` files | API keys, database URLs, secrets |
| `backend/data/` | Application data, user data, PII |
| `.claude/state/`, `.claude/history/`, `.claude/projects/` | Session state, conversation history, project memory |
| Credential files (`.credentials.json`, `dev-credential.json`) | Authentication material |
| Password vaults, keychain exports | Credential stores |
| `node_modules/` | Supply-chain noise, irrelevant to reasoning |
| SSH keys, `.pem` files, `.p12` files | Private keys |
| Browser session stores, cookies | Session hijacking risk |

---

### 5. THE MINIMAL RULE-SET (CONCISE)

A single pre-dispatch gate that checks three things before any cloud provider call:

1. **PROTECTED-SURFACE CHECK:** Does the prompt contain content from any path in `PROTECTED_SURFACE_PREFIXES`? If yes → BLOCK (cannot go to cloud).

2. **SECRET SCAN:** Does the prompt text match any pattern in `secret-leak-scan.mjs`'s regex list? If yes → BLOCK (cannot go to cloud). The scanner already exists — wire it as a pre-dispatch hook.

3. **PII CLASSIFIER:** Does the prompt contain email addresses, phone numbers, government IDs, full names + context? If yes → BLOCK (cannot go to cloud). This is the one new component needed — a lightweight regex/pattern classifier for common PII patterns.

If all three pass → route to cheapest capable cloud lane (per existing `llm-compat-contract.mjs` routing).

If any fail → route to local lane (gemma-local / ollama-local). If local lane cannot handle → surface "cannot process — data too sensitive for available lanes".

---

### BUILD LIST

| # | Item | Priority | Claim |
|---|------|----------|-------|
| B1 | **Pre-dispatch privacy gate** — a single hook that runs protected-surface check + secret scan + PII classifier before any cloud provider call. Wires existing `secret-leak-scan.mjs` patterns and `PROTECTED_SURFACE_PREFIXES` into the dispatch path. | P0 | HARD-FACT (components exist, wiring is new) |
| B2 | **Lane privacy tag as routing authority** — the `privacy` field in `lane-capability-manifest.json` becomes the dispatch gate. Cloud lanes refuse prompts that fail the privacy check. | P0 | HARD-FACT (field exists, enforcement is new) |
| B3 | **Lightweight PII classifier** — regex-based scanner for emails, phones, SSNs, credit cards, addresses. 50-100 lines, not a research project. Runs as part of the pre-dispatch gate. | P1 | RECALLED-PATTERN (common pattern, not in YURI corpus) |
| B4 | **Transport-layer credential injection** — API keys live in env/vault, attached by the gateway/adapter, never in prompt text. Already the pattern in `llm-lane.mjs` and the Nexus gateway design. | P0 | HARD-FACT (existing pattern, formalize as rule) |
| B5 | **"Cannot process — data too sensitive" fallback state** — when a task requires cloud reasoning but the data is too sensitive for cloud, surface this explicitly instead of silently failing or falling through. | P1 | RECALLED-PATTERN |
| B6 | **Anonymization wrapper** — strips PII, file paths, machine identifiers from prompt text before cloud dispatch. Uses existing `secret-leak-scan.mjs` mask patterns as the base. | P1 | HARD-FACT (mask function exists, wrapper is new) |

### CUT LIST

| # | Item | Rationale | Claim |
|---|------|-----------|-------|
| C1 | **Full PII entity extraction pipeline** (NER model, training data, confidence scoring) | Over-engineering. Regex-based classifier catches 95% of accidental PII leaks. The threat model is accidental inclusion, not adversarial extraction. | RECALLED-PATTERN |
| C2 | **Per-tenant encryption keys for local data** | The assistant is for a single founder. Multi-tenant key management is a SaaS problem, not a personal-assistant problem. | RECALLED-PATTERN |
| C3 | **Differential privacy layer on outbound prompts** | Adds complexity with no practical benefit for a single-user assistant. The threat is credential/PII leakage, not membership inference. | RECALLED-PATTERN |
| C4 | **Federated learning / on-device fine-tuning** | Massive over-engineering. The local lane already keeps data local. Fine-tuning adds model management, data versioning, and evaluation overhead. | RECALLED-PATTERN |
| C5 | **Homomorphic encryption for cloud inference** | Not practically usable with current LLM architectures. Adds latency and cost with zero real privacy benefit. | RECALLED-PATTERN |
| C6 | **Per-file access control lists** | The assistant already has full read access. Adding ACLs creates maintenance burden without meaningful protection — the pre-dispatch gate is the right layer. | RECALLED-PATTERN |
| C7 | **Audit log of every PII detection** | Logging PII detections creates a PII store that itself needs protection. Log only: "BLOCKED: protected surface detected" without the content. | RECALLED-PATTERN |
| C8 | **Browser-based client-side inference as privacy layer** | Shifts compute to the browser with worse models, higher latency, and no access to the YURI corpus. The local Ollama lane already provides local inference. | RECALLED-PATTERN |

---

**TERM_COUNT** term=PROTECTED_SURFACE_PREFIXES count=1
**FILE_COUNT** file=_SYSTEM/Scripts/lane-kernel.mjs count=1
**MATCH** file=_SYSTEM/Scripts/lane-kernel.mjs term=PROTECTED_SURFACE_PREFIXES line=30 excerpt="export const PROTECTED_SURFACE_PREFIXES = Object.freeze(["
**TERM_COUNT** term=secret-leak-scan count=1
**FILE_COUNT** file=_SYSTEM/Scripts/secret-leak-scan.mjs count=1
**MATCH** file=_SYSTEM/Scripts/secret-leak-scan.mjs term=secretPatterns line=20 excerpt="const secretPatterns = ["
**TERM_COUNT** term=privacy:cloud count=8
**FILE_COUNT** file=_SYSTEM/Scripts/lane-capability-manifest.json count=1
**MATCH** file=_SYSTEM/Scripts/lane-capability-manifest.json term=privacy line=5 excerpt="\"privacy\": \"cloud\""
**TERM_COUNT** term=privacy:local count=3
**FILE_COUNT** file=_SYSTEM/Scripts/lane-capability-manifest.json count=1
**MATCH** file=_SYSTEM/Scripts/lane-capability-manifest.json term=privacy line=40 excerpt="\"privacy\": \"local\""

**08DS_DATA_ROUTING_PRIVACY_SURVEY_X_PASS_COMMITTED**