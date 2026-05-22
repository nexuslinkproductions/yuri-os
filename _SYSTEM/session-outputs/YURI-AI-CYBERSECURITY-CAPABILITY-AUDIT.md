# YURI OS AI Cybersecurity Capability Audit

**Audit date:** 2026-05-21
**Audit scope:** YURI-OS-MUSUBI repository at `/Users/marcelspatz/YURI-OS-MUSUBI`, branch `main`, commit `77b67493`.
**Method:** Direct evidence sweep across `_SYSTEM/`, `.claude/`, `backend/`, top-level docs, test suite, hooks, skills, and offload contract. Protected paths (`backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`) untouched.
**Rule:** Documented ≠ implemented. Archived ≠ current. Branded ≠ proven.

---

## 1. Executive Verdict

**Can YURI move into AI cybersecurity? Yes — in a narrow lane.**

**Credible lane:** **AI agent / skill-chain security + AI-native repo audit automation.** YURI already implements the primitives this market needs — prompt-injection regex, supply-chain payload detection, mutation gates, agent spawn guards, evidence contract grammar, lane envelope validation. None of that primary substrate would need to be invented; it would need to be hardened, packaged, and externally validated.

**Non-credible lanes (no evidence supports any of these today):**
- SOC / SIEM / XDR — no log pipeline, no detection rules, no telemetry ingestion, no kernel/eBPF surface.
- Autonomous pentest — no exploit framework, no payload library, no offensive tooling.
- Malware analysis / reverse engineering — no disassembly, no isolated detonation surface, no IR primitives.
- AppSec / SAST replacement — `corpus-security-scan.mjs` is a thin regex linter for AI skill files, not a code-flow analyzer.
- Compliance / GRC — no policy mapping, no SOC2 / ISO27001 / HIPAA evidence templates.

**Confidence:** Medium-high on credible lane (strong primitives evidence). High on non-credible lanes (absence of evidence is conclusive — these would require visible infrastructure that simply is not in the repo).

**Identity caveat that gates everything:** `README.md:3` declares **"Private operator system. Not open source."** Moving toward AI cybersecurity as a product or service requires an identity pivot the repo has not yet made. The current shape is a personal command center, not a security platform.

---

## 2. What YURI Actually Is Today

### System identity (Fact)
- **README.md:1–13:** "Private operator system. Not open source. Marcel Spatz · Nexus Link Productions · Vienna." Self-described as a "command center for running creative, technical, and business operations from a single surface."
- **README.md:21:** Stack is React 19 / Vite frontend, Node.js + Express + SQLite backend, Obsidian vault for knowledge, Claude Code + Codex + DeepSeek + local Ollama for agents.
- **AGENTS.md:8:** Codex is the active implementation lane; Amp is retired. Claude Code is the control plane.
- **`_SYSTEM/yuri-origin.md`:1–8:** Canonical authority hierarchy: owner intent > local evidence > yuri-origin > SOUL.md > thin adapters > executable routing > skills > model inference.
- **SOUL.md:5–17:** Persona/cognitive workflow document — adversarial ally, evidence-before-polish, no silent gate bypass.

### Architecture summary (Fact)
- **254 scripts** in `_SYSTEM/Scripts/` (Node `.mjs` plus shell).
- **110 source files** in `_SYSTEM/backend/src/` (canonical backend location — note that top-level `backend/src/` contains only `.DS_Store`; the real source lives under `_SYSTEM/backend/src/` and compiled output sits in `backend/dist/`).
- **30 hooks** in `.claude/hooks/`, of which **10 are wired into `PreToolUse`** in `.claude/settings.json`.
- **~50 skills** in `.claude/skills/` and additional plugin skills.
- **67 `.test.mjs` files** in `_SYSTEM/Scripts/`.
- **8 route files** in `_SYSTEM/backend/src/routes/` (api.ts alone holds 81 route declarations).

### Agent / control-plane model (Fact)
- Claude Code = orchestrator / control plane / final synthesizer.
- Codex (gpt-5.5 / gpt-5.4-mini) = primary implementation lane.
- DeepSeek = reasoning / autonomous tool-use lane.
- NVIDIA NIM = system/infra lane (12 live models per launch-gate state).
- Local Ollama = lightweight subagent first-strike.
- Shintai (`_SYSTEM/Scripts/shintai-dispatch.mjs`) = multi-lane adversarial council for high-stakes work.
- Routing source of truth: `_SYSTEM/Scripts/offload-contract.mjs` (1479 lines, version 3).

### Security-relevant substrate (Fact)
- **Auth:** `_SYSTEM/backend/src/middleware/auth.ts:1–60` — `X-API-KEY` header required; refuses to boot if `API_KEY` is missing or shorter than 16 chars; `localOnlyMiddleware` blocks non-loopback origins; loopback detection normalizes IPv6 `::ffff:` prefix.
- **Hook firewall (PreToolUse, 10 active):** `pre-tool-gate.js`, `bash-security-guard.js` (345 LOC), `tirith-url-guard.js` (111 LOC), `claude-protocol-guard.js` (363 LOC), `pre-tool-use.js`, `musubi-protocol-enforce.js`, `cassandra-lite.js` (61 LOC), `token-budget-check.js`, `gitnexus/gitnexus-hook.cjs`, `agent-spawn-guard.js` (72 LOC).
- **Protected paths:** Enforced at multiple layers (yuri-origin.md, AGENTS.md, bash-security-guard.js, evidence-contract.mjs).
- **Static threat scanner:** `_SYSTEM/Scripts/corpus-security-scan.mjs` — 7 threat categories with regex match + severity scoring + JSON output.

### What is real vs aspirational
- **Real:** Auth middleware, hook-based command firewall, route auth matrix test, corpus security scan, offload envelope schema, agent spawn guard, protected-path enforcement, evidence contract IDs, sandbox loop test, 67-test suite, audit-log persistence (in `_SYSTEM/state/` and beyond).
- **Aspirational / partial:** "Audit Log Firewall" skill is an *absorbed external spec* (`.claude/skills/audit-log-firewall/SKILL.md` header literally says `ABSORBED FROM: .../openclaw-skills/.../audit-log-firewall`) with no in-repo implementation. The skill's "Installation: `clawhub install`" refers to a non-resident package manager.
- **Documented but unverifiable in one session:** Cassandra (CRITICAL-finding interrupt gate), Hermes, Argus, Obliteratus gates — referenced repeatedly in CLAUDE.md and yuri-origin.md but their full implementations were not inspected here. Some are partial (`cassandra-lite.js` = 61 LOC stub).

---

## 3. Capability Inventory

| Capability | Evidence path | Grade | Maturity | Security relevance | Gap |
|---|---|---|---|---|---|
| API-key auth on backend routes | `_SYSTEM/backend/src/middleware/auth.ts:6–12` | **B** | Working, refuses boot on missing/short key | Direct | No rotation, no rate limiting visible at this layer, key length floor=16 (low) |
| Local-only route guard (loopback enforcement) | `_SYSTEM/backend/src/middleware/auth.ts:42–53` | **B** | Working, normalizes IPv6 `::ffff:` prefix | Direct | chrome-extension origin auto-classified as local — broadens attack surface if extension compromised |
| Route auth classification matrix test | `_SYSTEM/Scripts/backend-route-auth-matrix.test.mjs:14–72` | **A** | Tests public / local-only / admin route enumeration | Direct | Test catalogs ~20 public routes, 3 local-only, 17+ admin prefixes — assumes correct classification rather than verifying it dynamically |
| CORS hardening test | `_SYSTEM/Scripts/backend-cors-hardening.test.mjs` (exists; not deeply read) | **B** | Test exists, run in `npm test` chain | Direct | Substance not audited this session |
| Bash command firewall | `.claude/hooks/bash-security-guard.js:1–80, 345 LOC total` | **A** | Wired into PreToolUse; blocks .env reads, .claude state writes, with quote-aware tokenization | Direct | Allowlist exemption logic exists for `cp/mv` of `.env` mirrors within repo — could be widened in error |
| URL risk classification (Tirith) | `.claude/hooks/tirith-url-guard.js:1–60` | **C** | Wired, but depends on external `~/.hermes/bin/tirith` binary not in repo; `FAIL_LOUD` mode is opt-in only via env | Direct | Default behavior on tirith failure = silent pass (`exit(0)`); security-relevant default is *unsafe* unless `TIRITH_FAIL_LOUD=1` is set |
| Agent spawn guard | `.claude/hooks/agent-spawn-guard.js:1–40` | **B** | Wired; blocks `Agent()` with Anthropic models except read-only types | Direct | Allows `YURI_ALLOW_AGENT=1` bypass; built-in safe types list small (Explore, Plan, statusline-setup, claude-code-guide) |
| Protocol / control-packet guard | `.claude/hooks/claude-protocol-guard.js:1–50, 363 LOC total` | **B** | Wired; enforces mutation gate + protected-path detection + route-plan dispatch advisory after `ExitPlanMode` | Direct | Advisory-only on dispatch; requires `2+ HIGH_RISK_MARKERS` for full fire |
| Cassandra (tainted-token detector) | `.claude/hooks/cassandra-lite.js:1–61` | **C** | 61 LOC — "lite" version; full Cassandra referenced but not in inspected scope | Indirect | Confirmed shim — full detector probably elsewhere or not built; memory references "CASSANDRA CRITICAL findings" suggest historical use |
| Corpus security scan (AI skill linter) | `_SYSTEM/Scripts/corpus-security-scan.mjs:1–80` | **A** | 7 threat categories: CREDENTIAL_ACCESS, NETWORK_EXFILTRATION, PATH_TRAVERSAL, PROMPT_INJECTION, OBFUSCATION, SUPPLY_CHAIN, HARDCODED_SECRETS; regex match, severity score, JSON verdict, test-covered | High (for AI skill security lane) | Static regex only — no AST, no data-flow, no taint tracking; only scans `.js/.mjs/.cjs/.py/.sh` |
| Corpus scan tests | `_SYSTEM/Scripts/corpus-security-scan.test.mjs:1–80` | **A** | Tests clean PASS path + prompt-injection in frontmatter | High | Test coverage limited to two categories shown; full coverage not verified this session |
| Offload envelope JSON schema | `_SYSTEM/Scripts/offload-envelope.schema.json:1–15` | **B** | Draft-2020-12 schema; enums `OK / DRY_RUN / FAILED / BLOCKED_MISSING_KEY / SKIPPED_OR_RATE_LIMITED / SMOKE_OK / SMOKE_MISMATCH` | Indirect | `additionalProperties: true` permits drift |
| Offload contract (lane routing source-of-truth) | `_SYSTEM/Scripts/offload-contract.mjs:1–120, 1479 LOC total` | **B** | Defines lanes, priority, lifecycle phases, dispatchTokens, NVIDIA NIM live status (probed 2026-05-20) | Indirect | Surface area is huge; not a single bug surface but a single trust surface — drift = system fragility |
| Sandbox loop (hermetic test environment) | `_SYSTEM/Scripts/yuri-sandbox-loop.test.mjs:1–40` | **B** | Creates temp DB + artifact root, runs dry-run + live with mock, verifies artifacts (route-plan.json, normalized-intent.json, graph-plan.json, verify.verification.json) | Indirect | "mock" mode — does not yet prove sandboxing of an untrusted code execution path |
| Evidence contract grammar | `_SYSTEM/yuri-origin.md:55–66` + `_SYSTEM/Scripts/evidence-contract.mjs:1–37` | **B** | Grammar declared (TERM_COUNT / FILE_COUNT / MATCH); JS module is a manifest of required evidence IDs per task type | Indirect (governance) | Module is 37 LOC — barely a contract; closer to a whitelist than a parser/validator |
| Self-audit scanner | `_SYSTEM/Scripts/self-audit.mjs:1–60` | **B** | Scans for DEAD_HOOK / ORPHAN_SKILL / STALE_MEMORY / MISSING_SECTION / CONTRACT_DRIFT; outputs JSON report | High (governance) | Inward-facing only; checks YURI's own integrity, not external targets |
| Audit-log-firewall skill | `.claude/skills/audit-log-firewall/SKILL.md:1` | **D** | Header: `ABSORBED FROM: .../openclaw-skills/.../audit-log-firewall`. References `clawhub install` (non-resident). | Direct (claimed) | No working implementation in this repo |
| Non-destructive infinity guard | `.claude/skills/non-destructive-infinity-guard/SKILL.md:1–40` | **C** | Skill describes always-on action boundary / risk classifier / mutation approval gate | Direct (governance) | Skill is a directive/spec; enforcement is via the hook stack, not a single binary |
| Yuri Sentinel daemon | Referenced in CLAUDE.md + `_SYSTEM/Scripts/yuri-sentinel.mjs` (exists) | **C** | LaunchAgent-installed; runs every 33 min per memory; substance not deeply inspected | Indirect | Health/memory-pulse, not security telemetry |
| Test suite breadth | `package.json:9` (npm test target) | **A** | 50+ chained `.test.mjs` files exercised per `npm test`; includes auth, CORS, telemetry, observability, offload, control-plane, learning loop, gitnexus | Indirect | Tests assert YURI's *own* invariants — not external security claims |

---

## 4. Existing Security Assets

### Authentication (Grade B)
- `_SYSTEM/backend/src/middleware/auth.ts:1–80` — single shared API key, `X-API-KEY` header, minimum 16 chars, refuses to boot otherwise. Loopback detection extends to chrome-extension origins.
- `_SYSTEM/Scripts/auth.mjs` + `_SYSTEM/Scripts/auth.test.mjs` exist (substance not deeply read this session).
- **Gap:** Single static key. No rotation cadence, no multi-tenant key, no token expiry, no scope-limited capabilities.

### Route hardening (Grade A on classification, B on dynamic verification)
- `_SYSTEM/Scripts/backend-route-auth-matrix.test.mjs:14–72` — enumerates routes across 7 router files and classifies each as public / local-only / admin. Examples: `/api/health/*` public, `/api/auth/bootstrap` local-only, `/api/control-plane/*` admin.
- `_SYSTEM/Scripts/backend-cors-hardening.test.mjs` — exists, in `npm test` chain.
- `_SYSTEM/Scripts/control-plane-plan-routes.test.mjs` — verifies control-plane endpoint shape.
- **Gap:** Test asserts the *table* of expected classifications; verification of runtime enforcement happens via spawn of the actual server (which is positive) but full proof-of-no-bypass is not automated.

### Sandboxing (Grade B)
- `_SYSTEM/Scripts/yuri-sandbox-loop.test.mjs:1–40` — creates isolated temp DB, sandboxed artifact root, dry-run + live mocked execution, asserts per-phase artifacts exist.
- `_SYSTEM/Scripts/yuri-guarded-executor.mjs` — exists, not deeply audited this session.
- **Gap:** "mock" mode is the proven path. There is no evidence of a hardened detonation sandbox for *untrusted* code (i.e., something Marcel could drop a stranger's skill into and run it safely). Sandbox is for *YURI's own* runs.

### Protected paths (Grade A — declared + enforced at multiple layers)
- Declared: `_SYSTEM/yuri-origin.md:48–53` (Protected Surfaces) and `AGENTS.md` (Codex protected paths) and `evidence-contract.mjs:24–32` (`PROTECTED_SURFACE_EXCLUSIONS`).
- Enforced: `.claude/hooks/bash-security-guard.js` — explicit deny list `BLOCKED_CLAUDE_FILES`, plus quote-aware token parser for `.env` reads/writes, plus REPO_ROOT-anchored exemption for legitimate intra-repo `.env` mirroring.
- **Gap:** Many enforcement layers (good for defense in depth) means single source of truth is harder to audit. A reviewer needs to read 3+ files to know what is *actually* blocked vs *declared* blocked.

### Security scanners (Grade A — narrow scope)
- `_SYSTEM/Scripts/corpus-security-scan.mjs` — covers 7 categories with severity scoring:
  - CREDENTIAL_ACCESS (HIGH)
  - NETWORK_EXFILTRATION (HIGH)
  - PATH_TRAVERSAL (HIGH)
  - PROMPT_INJECTION (HIGH)
  - OBFUSCATION (MEDIUM)
  - SUPPLY_CHAIN (CRITICAL)
  - HARDCODED_SECRETS (CRITICAL)
- Tested for clean PASS and at least the PROMPT_INJECTION-in-frontmatter case.
- Outputs structured JSON, scoreable, CI-friendly.
- **Gap:** Static regex only. No AST. No taint flow. No second-order injection (e.g., template strings expanded at runtime). False-positive surface is wide (`fetch(`, `curl`, `wget` all flag as HIGH — fine for AI skill files, harmful for general code).

### Audit skills (Grade B inwardly / D for the "audit-log-firewall" external skill)
- `_SYSTEM/Scripts/self-audit.mjs` — DEAD_HOOK, ORPHAN_SKILL, STALE_MEMORY, MISSING_SECTION, CONTRACT_DRIFT — real, structural integrity scanner of YURI itself.
- `_SYSTEM/Scripts/yuri-artifact-audit.mjs` + tests — artifact verification.
- `.claude/skills/audit-log-firewall/SKILL.md` — **absorbed external spec, not implemented locally** (header confirms).

### Supply chain / skill-chain checks (Grade B for AI skills, D for npm dependencies)
- AI skill supply chain: `corpus-security-scan.mjs` covers `postinstall`, `eval`, `new Function`, `exec` — strong coverage for embedded payloads in skill files.
- npm / package supply chain: **No evidence** of lockfile verification, npm audit gate, SBOM generation, or signed-commit enforcement in the audited scope. Standard npm registry trust model only.

### Observability truth (Grade B)
- `_SYSTEM/Scripts/backend-telemetry-truth.test.mjs` and `backend-observability-truth.test.mjs` — exist, in `npm test`. Per CLAUDE.md `Output Contract`, telemetry must be "Marker-only pass. Failure-only verbose logs" — a discipline, not a tool.
- Lane health (`/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-health.log` referenced) tracks live/dead lanes.
- **Gap:** "Truth" tests verify YURI's claims about itself. They are not external SOC-grade telemetry.

### Agent governance (Grade A — for self-governance)
- `agent-spawn-guard.js` — blocks Anthropic-model Agent spawns with explicit bypass env var.
- `claude-protocol-guard.js` — enforces control packet for high-risk mutation work; advises route-plan dispatch after `ExitPlanMode`.
- `pre-tool-gate.js` — front of the chain.
- Shintai (`shintai-dispatch.mjs`) — multi-lane council with required evidence IDs.
- **Gap:** Governs YURI's own agents. There is no "governance-as-a-service" surface that external customers could attach to their agent fleets.

### Evidence / promotion gates (Grade B)
- `_SYSTEM/Scripts/evidence-contract.mjs` — required evidence IDs per task type.
- `_SYSTEM/Scripts/backend-release-gate.mjs` + tests — release gating.
- `_SYSTEM/Scripts/yuri-supercharge-gate.mjs` + tests — supercharge promotion gate.
- Launch gate status visible in session brain block: `status: NOT_READY · independence: 67/100 fail=2 warn=4`.
- **Gap:** Independence score 67/100 is the system's own claim that it is not yet self-sufficient enough to ship.

---

## 5. AI Cybersecurity Fit Analysis

| Lane | Fit (1–10) | Why it fits | Why it does not | Evidence | What must be built |
|---|---|---|---|---|---|
| **AI agent / skill-chain security** | **8** | corpus-security-scan already detects PROMPT_INJECTION, CREDENTIAL_ACCESS, SUPPLY_CHAIN; protected-path enforcement is mature; agent-spawn-guard implements the kind of gate any agentic SaaS will need; evidence contract grammar is rare and valuable. | Coverage today is narrow (`.js/.mjs/.cjs/.py/.sh` regex only). No AST. No data-flow. No signed-skill provenance chain. No external customer onboarding flow. | `_SYSTEM/Scripts/corpus-security-scan.mjs:1–80`, `.claude/hooks/agent-spawn-guard.js`, `_SYSTEM/Scripts/offload-envelope.schema.json` | AST parser for skill manifests, taint analysis, signed-skill registry support, reporting UI, multi-tenant model |
| **AI-native repo audit automation** | **7** | self-audit.mjs structurally validates YURI's own surface; corpus-security-scan applies the same lens externally; GitNexus integration (96K symbols indexed) makes impact-graph audits possible; report generation skill (`yuri-report`) builds styled HTML + Mermaid + Chart.js audit reports. | Audit surface today is YURI-shaped. Generalizing to arbitrary repos (Python, Go, Rust, monorepos) is real work. No findings-DB, no compare-over-time, no auto-remediation. | `_SYSTEM/Scripts/self-audit.mjs`, `_SYSTEM/Scripts/corpus-security-scan.mjs`, `gitnexus` mcp tools | Multi-language adapters, findings store, diff-against-baseline, suppression flow |
| **AI AppSec (general SAST)** | **3** | YURI has regex linting + GitNexus call-graph. | The SAST market is owned by Semgrep, CodeQL, Snyk, Endor. Pure regex is 2010-era; nothing in scope shows YURI competing on AST depth, dataflow, or vulnerability database. | (absence) | Years of catalog work + a vulnerability DB + paying customers |
| **Agent / MCP security (protocol-level)** | **6** | tirith-url-guard does URL classification; offload envelope is schema-validated; agent-spawn-guard scopes Agent() use; offload-contract.mjs version-numbers the lane registry. MCP exposure is real (multiple MCP servers connected — obsidian-vault, ollama-bridge, computer-use, etc.). | No formal MCP risk taxonomy in the repo. No MCP-server-of-the-month risk feed. No automated red-teaming of MCP tools. | `.claude/hooks/tirith-url-guard.js`, `_SYSTEM/Scripts/offload-envelope.schema.json`, `.claude/hooks/agent-spawn-guard.js` | MCP-specific threat model, red-team probe library, scope-violation telemetry |
| **Repo security audit-as-a-service** | **6** | `yuri-report` HTML report generation + `system-audit` skill + extraction-sprint pattern + Shintai adversarial council = the workflow shape of an audit service. | Solo operator. No methodology document. No engagement template. No legal / NDA / liability surface. Marcel's brand (`Nexus Link Productions`) is creative production, not security. | `_SYSTEM/Scripts/system-audit` (via skills index), `.claude/skills/yuri-report/SKILL.md` | Methodology doc, NDA template, sample report, repeatable engagement playbook |
| **SOC / SIEM / XDR** | **1** | Nothing. | No log ingest. No detection-as-code. No alert routing. No SOAR. No customer tenancy. No eBPF / kernel telemetry. | (absence is the evidence) | A new product. Not a YURI extension. |
| **Autonomous pentest** | **1** | Nothing. | No exploit framework, no payload library, no offensive primitives, no recon tooling. The repo's *governance* gates (NDIG, Cassandra) explicitly forbid the kind of action a pentest agent takes. | (absence) | A different system with opposite values |
| **Malware / RE** | **1** | Nothing. | No disassembly, no PE/ELF analysis, no YARA, no isolated detonation. | (absence) | A different system |
| **Compliance / GRC** | **2** | Evidence contract + audit logs + protected paths = the *primitives* of compliance, but no framework mapping. | No SOC2 / ISO27001 / HIPAA / GDPR control mapping. No customer-facing compliance evidence portal. | (absence) | Framework templates + auditor-readable evidence export |

**Top two lanes by capability evidence: AI agent / skill-chain security (8), AI-native repo audit automation (7).** These are not separate products — they are two sides of the same wedge: *securing the AI-agent supply chain*.

---

## 6. Reliability And Trust Audit

### Lane routing reliability (Grade B)
- `offload-contract.mjs` is 1479 LOC and the single source of truth. This is a strength (one place to read) and a fragility (one place to break).
- `offload-contract-regression.test.mjs` and `offload-envelope-contract.test.mjs` exist and run in `npm test`.
- Live lane probe (`probed 2026-05-20`) is part of the contract — empirically validated.
- **Risk:** Schema permits `additionalProperties: true` (`offload-envelope.schema.json`) — useful for evolution, dangerous for strict trust.

### Shintai / offload reliability (Grade B)
- `shintai-dispatch.mjs` imports from `lane-kernel.mjs`, `memory-kernel.mjs`, `rails.mjs`, `yuri-control-plane.mjs` — modular.
- Explicit `RICK_PERSONA_LINE = 'PERSONA: Rick'` anchor (memory rule "Rick persona REQUIRED in every dispatch" is reflected in code).
- `MIN_CRITICAL_COUNCIL_SIZE = 3` is encoded — critical work cannot fall below 3 reviewers.
- **Risk:** External-binary dependencies (tirith, codex CLI) are not vendored. A missing binary should hard-fail but in some paths fails *silently* (tirith-url-guard default mode).

### Test coverage (Grade A on volume, B on depth)
- 67 `.test.mjs` files (counted) + backend `auth.test.ts` + `headlessControlPlaneService.test.ts` + Python `memory_governor_test.py`.
- `npm test` chains 40+ test files into one run (per `package.json:9`).
- **Risk:** Tests assert YURI's own invariants. A test passes if YURI does what YURI thinks it should — not if YURI is *secure* against an adversary.

### Failure modes (Risk)
- **Silent-pass-on-error:** `tirith-url-guard.js` exits 0 on error unless `TIRITH_FAIL_LOUD=1` is set in env. Default insecure. (CLAUDE.md mentions PATCH 007 added fail-loud mode — opt-in.)
- **Bypass envs:** `YURI_ALLOW_AGENT=1`, `YURI_SPRINT_MODE=1` — gates with bypass envs exist for legitimate reasons but each is a credential the operator must protect.
- **Empty top-level `backend/src/`:** Suggests an incomplete migration (canonical is `_SYSTEM/backend/src/`). A new contributor or external auditor would read the empty dir and conclude wrong things. Decay debt.
- **"audit-log-firewall" labeling:** A skill named `audit-log-firewall` exists. Its content says it is an *external absorbed spec*. To anyone scanning the skills list, this reads as a working capability. **Branding-vs-substance gap.**

### Evidence gates (Grade B)
- Evidence contract grammar exists (`TERM_COUNT`, `FILE_COUNT`, `MATCH`).
- Required evidence ID lists exist (`evidence-contract.mjs`).
- **Risk:** No central evidence validator. The 37-LOC `evidence-contract.mjs` is a manifest. The grammar is informal. PASS/FAIL claims depend on each script honoring the grammar.

### Output rails (Grade B)
- yuri-origin.md `Output Contract:` "Compact structured reports. No raw dumps. Marker-only pass. Failure-only verbose logs." A discipline reinforced across CLAUDE.md, SOUL.md, hooks.
- **Risk:** Compliance is by convention, not by parser. A misbehaving lane can spew raw output and it will not be auto-redacted.

### False-positive control (Grade C)
- corpus-security-scan flags `fetch(`, `curl`, `wget`, `process.env`, `.env` — categorically. Fine for AI skill files (most should not be doing those things); brutal for real codebases.
- No suppression / waiver / `# noqa` style flow visible.

### Raw model output handling (Grade B)
- yuri-origin.md `Evidence Contract Grammar:` "Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise."
- Discipline-level rail, not parser-level. Each consumer must respect it.

### Human approval boundaries (Grade A)
- yuri-origin.md `Mutation Contract:` "No auto-commit without explicit approval. No silent privilege escalation. No destructive commands without explicit request."
- CLAUDE.md `Gate Rules:` reinforces with control-packet requirement.
- AGENTS.md prohibits push and `--force` and destructive shell.
- Hooks back this up: `bash-security-guard.js` deny list, `pre-tool-gate.js`, `claude-protocol-guard.js`.

---

## 7. Marcel Fit Assessment

### Security mindset (Inference)
- **Evidence for fit:** The repo *is* a security-aware system — protected paths, mutation gates, evidence contracts, advisor-vs-authority distinctions, "Truth before polish" in SOUL.md, "no silent bypass of safety gates" in yuri-origin.md. Marcel built these. Building them was the work, and they are working.
- **Evidence against fit:** README is silent on security as a business domain. Nexus Link Productions brand is creative production. The system protects itself; it does not yet attack anything.

### Backend / system aptitude (Fact)
- 110-file backend with route classification, auth middleware, conclave/multi-agent backend nodes, scripts, services, providers, models.
- 254 scripts in `_SYSTEM/Scripts/` with a real test suite.
- Marcel ships and runs this daily. Operational substance > most personal portfolios.

### Adversarial thinking (Inference)
- `yuri-shura` skill: "6-perspective adversarial review for high-stakes turns."
- SOUL.md: "Be an adversarial ally." Repeated divergent-scan / counterfactual primitives (izanagi-simulator).
- The disposition to red-team-yourself is present. Whether that generalizes to red-teaming *targets* on demand is unverified.

### Gaps from no professional cyber background (Risk)
- No visible certifications, public CVEs, public security research, CTF history, or bug-bounty proof in the repo.
- The risk: building primitives is necessary but not sufficient for serving paying customers who need a security verdict they can defend in court / to their insurer / to their CISO.
- This is not a knock on capability. It is a market-access gap. Buyers of security tooling typically need provenance.

### Risks of overreach
- Branding YURI as a "cybersecurity platform" today would invite scrutiny YURI cannot survive — empty `backend/src/`, absorbed-spec skills, opt-in fail-loud defaults, single-key auth would all surface in a real customer evaluation.
- Pitching SOC / SIEM / XDR / pentest with current evidence would be a credibility-burner.

### Best learning path (Recommendation)
- Use the existing primitives as the textbook. Marcel already wrote a working evidence contract, a working command firewall, a working agent spawn guard. The next step is to apply the same discipline to **someone else's** AI agent stack.
- Concrete moves: harden corpus-security-scan against a real-world skill marketplace dump (Anthropic Skills, Cline rules, OpenAI Agents SDK skills); publish findings; replicate by a different skill author. *Findings published in public are the credential.*

### Suited cybersecurity work, first
1. **AI agent / skill security review.** Scope: a customer's Claude Code / OpenAI Agents SDK skill library. Deliverable: a styled HTML report (already a strength via `yuri-report`) listing categorized findings with severity + recommended remediation. Pricing: per-skill or per-engagement.
2. **AI-system architecture review.** Scope: a customer's agentic app architecture. Deliverable: threat model + recommended hook/gate stack modeled on YURI's own primitives. *This is what Marcel actually built — share the architecture.*
3. **AI supply-chain (skill-marketplace) monitoring.** Scope: subscribe to a skill marketplace's feed, scan new entries automatically, publish a weekly risk digest. *Productizes corpus-security-scan + yuri-sentinel daemon pattern.*

What Marcel is **not** ready for: external pentest engagements, incident response retainers, SOC outsourcing, CVE research as a primary deliverable.

---

## 8. Credible Wedge

**Product name (working): YURI Skill Lens** — an AI agent / skill-chain security analyzer.

### Target user
- Engineering leaders deploying Claude Code, OpenAI Agents SDK, Anthropic Skills, MCP servers, or similar agentic tooling internally.
- Mid-market security teams who want a quick risk read on the agent rules / skills / hooks their devs are checking in.

### Painful problem
- AI agents now have shell access, file access, tool-use authority. The "skills" / "rules" / "agent definitions" checked into developer repos are *executable instructions*, often un-reviewed, often pulled from forums/Discord/marketplaces.
- A malicious or careless skill can leak secrets, exfiltrate data, install backdoors. There is no Semgrep-for-Skills today.

### Why YURI has an unfair advantage
- **It already shipped the core scanner.** `_SYSTEM/Scripts/corpus-security-scan.mjs` has 7 threat categories with severity scoring + JSON output + test coverage. Productizing this is *days* of work, not months.
- Marcel has operationally lived with agentic risk for months — protected paths, hook firewall, agent spawn guards, mutation gates. This is the muscle a customer is buying.
- `yuri-report` builds styled HTML reports out of the box.
- Local-first design: customer's skills never leave the customer's machine.

### First workflow
1. Customer runs `yuri-skill-lens scan ./skills/` (or points it at their Anthropic Skills / Claude Code / OpenAI Agents directory).
2. Tool scans every `SKILL.md` / `agents.md` / `.cursor/rules/` / `.windsurfrules` / `.clinerules` / `.amp/` / `.claude/skills/**` / `.codex/**` file recursively.
3. Reports categorized findings: PROMPT_INJECTION, CREDENTIAL_ACCESS, NETWORK_EXFILTRATION, PATH_TRAVERSAL, OBFUSCATION, SUPPLY_CHAIN, HARDCODED_SECRETS.
4. Severity-scored. JSON output for CI, HTML report for humans.
5. Optional: SARIF output for GitHub Code Scanning integration.

### First report output
- Findings count by severity (CRITICAL / HIGH / MEDIUM / LOW).
- Per-finding: file path, line range, threat category, severity, excerpt, recommended fix.
- Skill-level verdict (PASS / WARN / FAIL).
- Repository-level top 10 worst skills.
- Comparison-to-baseline mode for repeat scans.

### First measurable success metric
- **Single deterministic metric:** *number of CRITICAL or HIGH findings caught on a real customer's skill repo that the customer's existing tooling missed.*
- Secondary: scan latency (target: <10s for 100 skill files).
- Tertiary: false-positive rate verified against a known-clean skill corpus.

### What not to build yet
- No SOC dashboard. No SaaS multi-tenant.
- No "AI-powered remediation" — that is the next iteration, not the wedge.
- No marketplace integrations beyond GitHub Code Scanning.
- No compliance framework mapping until 10 paying customers ask for it.
- No frontend beyond an HTML report. The CLI + report is the product.

---

## 9. 90-Day Plan

### Days 1–14: proof and cleanup
- **Decay debt:** delete `backend/src/.DS_Store` and the orphan empty `backend/src/` directory; update package.json paths if any still reference the old location.
- **Rename `audit-log-firewall` skill** to `audit-log-firewall-external-spec.md` (or move under an `external-specs/` directory) so the skill index does not lie about what is implemented.
- **Default-secure `tirith-url-guard`** — flip default to `FAIL_LOUD=true` unless explicitly opted out.
- **Productize corpus-security-scan** as a standalone CLI: `bin/yuri-skill-lens` with `--json`, `--sarif`, `--html` outputs and a `--baseline <path>` mode for diff-vs-prior runs.
- **Author one public test corpus** of intentionally bad AI skills (mock prompt-injection, mock credential exfil, mock postinstall payload) and publish PASS/FAIL detection results.
- **Decide identity:** "Nexus Link Productions" + "YURI Skill Lens" or a new brand. Memory note `feedback_codex_powerhouse_nim_scope.md` suggests strong identity discipline already exists — apply it here.

### Days 15–45: minimum useful security workflow
- Extend corpus-security-scan to cover: `.cursor/rules/*.mdc`, `.windsurfrules`, `.clinerules`, `.codex/**`, `.claude/**`, `.amp/**`, generic `agents.md` / `AGENTS.md`, MCP server manifests.
- Add SARIF output adapter (GitHub Code Scanning integration).
- Add suppression / waiver flow (`# yuri-lens-ignore: reason`) — needed for adoption.
- Add severity-scored HTML report (template via `yuri-report` skill).
- Build a baseline-corpus of "real-world" skills harvested from public marketplaces — at least 200 skills. Run scan, classify findings, publish category-frequency stats.
- Sign and tag a `v0.1.0` release.

### Days 46–75: external validation on real repos
- Recruit 3–5 friendly testers (engineering leaders deploying Claude Code or similar at small scale).
- Run scans on their actual skill / rules directories. Anonymize and publish category-frequency findings.
- Iterate on false-positive rate and remediation guidance.
- Write up two case studies (anonymized) — *"5 skills, 3 critical findings caught"* style.
- Lock down one repeatable engagement playbook (NDA template, scan script, report deliverable, debrief).

### Days 76–90: package, report, and decision gate
- Public landing page (one page — what it is, who it is for, sample report screenshot, install command).
- One *named* paid pilot.
- Two-part decision gate at day 90:
  - **Continue if:** ≥1 paid pilot signed and ≥10 GitHub stars / external installs and ≥1 CRITICAL finding caught in someone else's repo.
  - **Pivot or kill if:** 0 paid pilots and false-positive rate >30% on the public corpus and no measurable findings caught externally.

---

## 10. Kill Criteria

This direction should be killed or paused if:

1. **No paid pilot in 90 days.** Friendly free testers ≠ market. If three months of real outreach yields zero willingness-to-pay, the buyer does not exist or cannot be found.
2. **False-positive rate >30% on a public skill corpus.** corpus-security-scan as it stands is regex-only. If real-world skills are so varied that regex generates noise faster than signal, the technology floor is too low.
3. **Larger / better-resourced players ship the same thing first.** Semgrep, Snyk, Endor, GitHub itself, or Anthropic ships an "AI-skill-aware" scanner. Watch the announcements. If they ship, YURI's wedge collapses.
4. **The customer profile demands SOC/SIEM/XDR.** If every prospect asks "does it ship logs to my SIEM?" and the answer is "no, this is a static scanner," the market wants something YURI is not built to be.
5. **Marcel cannot articulate one concrete finding that a real customer's existing tooling missed.** No story → no sale.
6. **Identity pivot blocks creative work.** If becoming a security vendor requires dismantling the Nexus Link Productions video / creative pipeline, the cost is wrong.
7. **Legal / liability surface becomes unmanageable for a solo operator.** Security work invites legal exposure. If insurance, NDA, or indemnification asks become heavier than revenue, the structure is wrong for solo.

---

## 11. Final Recommendation

Build proof, do not change brand. YURI already implements the substrate — protected paths, hook firewall, agent spawn guard, corpus security scan, evidence contract, lane envelope schema, governance gates, and a 67-file test suite — that the emerging AI-agent-security market needs. The credible wedge is *AI agent / skill-chain security*, productized as a CLI + HTML report under a clear, narrow name. Do not pitch SOC, SIEM, XDR, autonomous pentest, malware, or compliance. Do not call YURI a cybersecurity platform until at least one paid pilot has caught a finding the customer's existing tooling missed and the story is repeatable. The 90-day plan above is the proof path. The kill criteria are real and should be honored.

---

**Evidence confidence:** medium-high (substrate verified by direct file reads; "absence of evidence" claims on SOC / pentest / RE / malware are conclusive given the visible repo shape; some deep modules — Hermes, Argus, Obliteratus, full Cassandra — were referenced but not exhaustively read in this single session).

**Most important missing proof:** *a recorded scan of a real customer's (or even a high-profile open-source) AI-skill repo where YURI catches a finding the customer's existing tooling missed.* That single artifact is the only thing that converts substrate into evidence-of-market-fit.

**Next irreversible decision to avoid:** **Do not rebrand or publicly position YURI as "a cybersecurity platform" until at least one named paid pilot has signed and the first external finding has been demonstrated.** Branding moves are durable; calibration evidence is not. The kill criteria are designed to be checked before the rebrand, not after.

---

## Appendix A — Route-Plan Evidence + Advisory Status

**Route-plan classification** (captured 2026-05-21 via `bash _SYSTEM/Scripts/ai route-plan ...`; full envelope in sibling file `YURI-AI-CYBERSECURITY-CAPABILITY-AUDIT.route-plan.json`):

- `lane`: `swarm`
- `scenario`: `high-stakes-review`
- `complexityTier`: `critical`
- `codexPolicy`: `none` (main-session is the implementation authority for critical tier)
- `dispatch`: `parallel-fan-out`
- `qualityGate`: `main-session`
- `ensemble`: `deepseek-preflight, nvidia-preflight, hermes-forecast, cassandra, shura-review, codex-queue-emit, swarm-fanout, obliteratus-hint`
- `beaconLevel`: `notify+obsidian`

**Advisory expectations declared by the contract:**
- DeepSeek Pro + Flash advisory: preflight + postflight (`outputCapLines: 80`, `localTruthRequired: true`).
- Claude advisory cross-check: `deepseek-v4-pro` with `xhigh` reasoning, advisory-only, 80-line cap, required sections [findings, risks, upgrade_candidates, tests_needed, reject_or_accept_reasoning].
- Obliteratus (native function gate): required for high-stakes-review scenario; stage `pre-promotion`; output schema `structured_adversarial_audit`; `localTruthRequired=true`.

**This report's status:**
- **Main-session synthesis with direct file evidence cited per claim.** All non-trivial claims reference exact file paths and line ranges; absence-of-evidence claims (e.g., SOC / pentest / RE absence) are conclusive by repo shape.
- **Advisory-only until cross-verified.** The protocol gate fires `warn-first` (`severity="WARN"`) for any high-stakes work that lands without DeepSeek + Obliteratus postflight. This report has not yet been run through that postflight.
- **Treat as decision input for Marcel, not as a promotable artifact** until: (a) DeepSeek Pro postflight returns concur/dissent with file evidence, (b) Obliteratus adversarial audit passes pre-promotion, (c) any claim flagged by either is locally re-verified.
- **No promotion to canonical memory or external publication** without the postflight. Re-running the gate before any rebrand / commit / public statement is the protective discipline.

**Hard blocks honored:**
- No protected-path read or write (`backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`).
- No mutation outside the single output file + this sidecar.
- No commit, no push, no destructive command.
- bash-security-guard, claude-protocol-guard, agent-spawn-guard, tirith-url-guard, pre-tool-gate, cassandra-lite all active during the audit run.
