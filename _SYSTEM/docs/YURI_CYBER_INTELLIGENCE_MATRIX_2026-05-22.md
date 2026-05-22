# YURI Cyber Intelligence Matrix

Date: 2026-05-22
Owner: Codex main orchestrator
Purpose: turn global cyber threat intelligence into YURI build priorities.

## Operating Thesis

YURI's first defensible proof surface remains AI-agent, skill-chain, MCP, memory, RAG, browser-agent, and model-route security. That is not the final company scope. The company-scale direction is a cyber operating system that joins threat intelligence, assessment, lab validation, guardrails, runtime monitoring, memory/RAG defense, client reporting, and later managed security operations.

Every row below maps a threat to a YURI action or a watch-only decision. A threat is not accepted into build scope unless it has a clear customer pain, a YURI capability path, and a proof artifact that can be produced in owned or explicitly authorized environments.

## Source Registry

| ID | Source |
|---|---|
| S1 | Microsoft Digital Defense Report 2025: https://www.microsoft.com/en-us/corporate-responsibility/cybersecurity/microsoft-digital-defense-report-2025/ |
| S2 | Google Cloud Cybersecurity Forecast 2026: https://cloud.google.com/blog/topics/threat-intelligence/cybersecurity-forecast-2026/ |
| S3 | CrowdStrike Global Threat Report 2026: https://www.crowdstrike.com/en-us/global-threat-report/ |
| S4 | Fortinet Global Threat Landscape Report 2026: https://www.fortinet.com/resources/reports/threat-landscape-report |
| S5 | Cloudflare 2026 Threat Report: https://blog.cloudflare.com/2026-threat-report/ |
| S6 | ENISA Threat Landscape 2025: https://www.enisa.europa.eu/sites/default/files/2025-10/ENISA%20Threat%20Landscape%202025%20Booklet.pdf |
| S7 | CERT-EU Threat Landscape Report 2025: https://cert.europa.eu/blog/threat-landscape-report-2025 |
| S8 | FBI IC3 2025 Internet Crime Report: https://www.fbi.gov/file-repository/2025_ic3report.pdf |
| S9 | Verizon Data Breach Investigations Report 2025: https://www.verizon.com/business/resources/reports/dbir/ |
| S10 | IBM Cost of a Data Breach Report 2025: https://www.ibm.com/reports/data-breach |
| S11 | NIST AI Risk Management Framework: Generative AI Profile: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf |
| S12 | NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework |
| S13 | OWASP Top 10 for LLM Applications 2025: https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/ |
| S14 | OWASP Agentic Skills Top 10: https://owasp.org/www-project-agentic-skills-top-10/ |
| S15 | MITRE ATLAS: https://atlas.mitre.org/ |
| S16 | MCP Threat Modeling, arXiv 2603.22489: https://arxiv.org/abs/2603.22489 |
| S17 | Breaking the Protocol, arXiv 2601.17549: https://arxiv.org/abs/2601.17549 |
| S18 | Singapore AI Verify: https://www.imda.gov.sg/how-we-can-help/ai-verify |
| S19 | Singapore Cyber Landscape 2024/2025: https://isomer-user-content.by.gov.sg/36/995dbbd7-a1de-4edb-b731-8fa36eb5546e/Singapore%20Cyber%20Landscape%202024_2025.pdf |
| S20 | Japan METI Cybersecurity: https://www.meti.go.jp/english/policy/safety_security/cybersecurity/index.html |
| S21 | China TC260 Generative AI Security Requirements tracker: https://digitalpolicyalert.org/change/8857 |
| S22 | CISA Known Exploited Vulnerabilities Catalog: https://www.cisa.gov/known-exploited-vulnerabilities-catalog |
| S23 | Anthropic Mythos Preview cyber assessment: https://red.anthropic.com/2026/mythos-preview/ |
| S24 | OpenAI disruption of malicious uses by state-affiliated threat actors: https://openai.com/index/disrupting-malicious-uses-of-ai-by-state-affiliated-threat-actors/ |
| S25 | Upgreat Baseline Security: https://www.upgreat.ch/consulting/baseline-security |
| S26 | YURI cybersecurity audit: _SYSTEM/session-outputs/YURI-AI-CYBERSECURITY-CAPABILITY-AUDIT.md |
| S27 | Perplexity cyber sprint: _SYSTEM/session-outputs/YURI-OS-GLOBAL-CYBERSECURITY-INTELLIGENCE-SPRINT-2026-05-21.md |

## YURI Cyber Intelligence Matrix

| # | Domain | Threat | Regions | Evidence | Customer Pain | YURI Capability | Missing Proof | Action |
|---:|---|---|---|---|---|---|---|---|
| 1 | Ransomware | Ransomware-as-a-Service affiliate sprawl | Global | S3,S4,S6,S8 | SMEs cannot defend every exposed path or recover cleanly | Threat radar, assessment reporting, backup/segmentation checklist | No customer ransomware resilience workflow yet | Build report mapping, watch for runtime |
| 2 | Ransomware | Data theft before encryption | Global | S3,S6,S8 | Breach impact persists even if systems restore | Exfiltration rails, data classification, tool-output controls | No data discovery module | Build for agent/tool surfaces |
| 3 | Ransomware | Double/triple extortion pressure | Global | S4,S6,S8 | Legal, PR, customer panic during incidents | Incident evidence pack templates | No incident response retainer | Watch-only now |
| 4 | Ransomware | Targeting of MSPs and service providers | Europe, West | S6,S7,S25 | One provider compromise reaches many clients | Partner risk reports for Upgreat-like MSPs | No MSP connector inventory yet | Build partner assessment lane |
| 5 | Ransomware | Backup destruction and recovery sabotage | Global | S6,S8,S12 | Recovery plans fail under attacker pressure | Lab checklist and report controls | No backup validation harness | Watch then lab |
| 6 | Infostealers | Browser session token theft | Global | S1,S4,S8,S9 | MFA can be bypassed by stolen sessions | Secret handling, browser-harness redaction, session-risk checks | No endpoint telemetry | Build browser-agent lab |
| 7 | Infostealers | Commodity stealer-log markets | Global | S4,S8 | Initial access becomes cheap and automated | Credential-risk reasoning in reports | No dark-web/log ingestion | Watch-only unless authorized feed exists |
| 8 | Infostealers | Developer credential exposure | West, Europe, Asia | S1,S4,S9 | Repos, tokens, package registries exposed | Repo scanner, secrets policy, CI/CD guardrails | Scanner needs broader file coverage | Build in Security Lens |
| 9 | Identity | Password spraying and credential stuffing | Global | S1,S8,S9 | Weak identity hygiene still causes breaches | Assessment checklist and simulated login telemetry lab | No IdP integration | Watch then partner via MSP |
| 10 | Identity | MFA fatigue and push bombing | Global | S1,S9 | Users approve malicious auth requests | Executive/user training report module | No phishing/MFA sim harness | Build awareness lab later |
| 11 | Identity | Session hijacking in SaaS | Global | S1,S6,S9 | SaaS access persists after compromise | SaaS/browser-agent boundary policies | No SaaS API integrations | Build threat model only |
| 12 | Identity | Over-privileged service accounts | Global | S1,S12 | One token grants too much blast radius | Model-route trust inventory, least-privilege tool policy | No cloud IAM collector | Build local/tool version first |
| 13 | Identity | OAuth consent phishing | West, Europe | S1,S9 | Users authorize malicious apps | Connector scanner concept for OAuth/MCP | No OAuth test lab | Add to lab roadmap |
| 14 | Identity | API key sprawl | Global | S1,S9,S26 | Keys leak through repos, logs, agents | Repo scanner, output redaction, protected path rails | Need language/path expansion | Build now |
| 15 | Fraud | Business email compromise | Global | S8,S9 | Payment rerouting and invoice fraud | Client report templates and process controls | No mail integration | Watch/report only |
| 16 | Fraud | AI-assisted phishing quality jump | Global | S1,S2,S8,S24 | Lures become cheaper, multilingual, personalized | Phishing-awareness lab and report evidence | No consent-based simulation package | Build later |
| 17 | Fraud | Deepfake executive impersonation | Global, APAC | S8,S19 | Finance/HR verification breaks | Synthetic awareness lab with safe media | No media pipeline | Watch/lab later |
| 18 | Fraud | Crypto wallet drain and seed phrase theft | Global | S8 | Private users and founders lose assets fast | Personal cyber hygiene package future | No wallet-security module | Watch-only now |
| 19 | Fraud | SIM swap and account takeover | Global | S8 | High-value accounts bypass normal controls | Advisory checklist and identity threat model | No telco workflows | Watch-only now |
| 20 | Cloud | Cloud misconfiguration exposure | Global | S1,S9,S12 | Public buckets, broad roles, exposed services | Future cloud posture scan adapter | No cloud account connectors | Watch then build after agent proof |
| 21 | Cloud | IAM policy blast radius | Global | S1,S12 | Excess privilege turns bugs into breaches | Least-privilege policy engine for tools | Needs cloud/IAM lab | Build lab track |
| 22 | Cloud | Publicly exposed management interfaces | Global | S22,S12 | Fast exploitation after exposure | Attack-surface inventory concept | No external scanner | Watch-only without authorization |
| 23 | Cloud | Serverless secret leakage | West, Asia | S1,S9 | Logs and env vars leak secrets | Output rails, repo scan, secret redaction | No serverless-specific parser | Add scanner rules |
| 24 | Cloud | Container/Kubernetes control-plane abuse | Global | S1,S9,S12 | Mis-scoped workloads leak or pivot | Future lab and assessment checklist | No K8s scanner | Watch/lab later |
| 25 | SaaS | SaaS connector over-permission | Global | S1,S9,S13,S16 | AI tools inherit broad SaaS powers | Connector trust posture inventory | No connector manifest corpus | Build MCP/OAuth scanner |
| 26 | SaaS | Shadow SaaS + shadow AI adoption | Global, Asia | S1,S2,S19,S27 | IT does not know what tools employees use | Model-route inventory and regional pack | No discovery integration | Build intake questionnaire first |
| 27 | SaaS | Browser automation on privileged portals | Global | S13,S14,S16 | Agents click through sensitive workflows | Browser-harness guardrails and replay lab | Need synthetic portals | Build lab now |
| 28 | SaaS | Logs leaking sensitive AI prompts | Global | S11,S13 | Prompt logs become data breach artifacts | Output rails, redaction, retention mapping | Need log sanitizer tests | Build in Guardrail Kernel |
| 29 | Supply Chain | Open-source package compromise | Global | S1,S6,S9 | Malicious packages enter dev workflows | Repo/supply-chain scanner | Needs package-lock/parser expansion | Build in Security Lens |
| 30 | Supply Chain | Typosquatting and dependency confusion | Global | S1,S9 | CI installs hostile dependency | Scanner rule and CI report | Need test corpus | Build now |
| 31 | Supply Chain | Maintainer account takeover | Global | S1,S9 | Trusted packages become malicious | Watchlist/report guidance | No package registry telemetry | Watch-only |
| 32 | Supply Chain | CI/CD secret exfiltration | Global | S1,S9,S26 | Build systems leak tokens | Repo scanner, shell guard patterns | Need CI config coverage | Build scanner expansion |
| 33 | Supply Chain | Malicious GitHub Actions/workflows | Global | S1,S9 | Workflows execute attacker code | Repo scanner for workflow permissions | Need YAML parser/rules | Build now |
| 34 | Supply Chain | AI-generated dependency risk | Global | S2,S11 | Code agents add packages without review | Agent guardrail and dependency approval | Need code-agent eval harness | Build lab |
| 35 | Vulnerability | Known exploited vulnerabilities exploited faster | Global | S22,S1,S6 | Patch windows shrink | Triage/report automation | No vuln inventory connector | Watch/report now |
| 36 | Vulnerability | N-day exploitation of exposed services | Global | S22,S4 | Public exploit availability accelerates | Lab-only learning and patch report | No external scan permission | Watch/lab |
| 37 | Vulnerability | AI-assisted vulnerability research | West, Asia | S2,S23,S24 | Discovery cycles compress | Evolution Engine for defensive tests | Need benchmark/lab | Build research track |
| 38 | Vulnerability | API authorization bugs | Global | S9,S12 | Business logic holes bypass auth | Vulnerable API lab | Need lab apps | Build lab now |
| 39 | Web | SQLi/XSS/SSRF still recurring | Global | S9,S12 | Basic web flaws persist in SMEs | Learning labs and report templates | No SAST engine | Lab/watch |
| 40 | Web | SSRF into metadata services | Global | S9,S12 | Cloud creds leaked from web bug | Vulnerable web/cloud lab | Need local cloud simulator | Build lab later |
| 41 | DDoS | Hyper-volumetric DDoS | Global | S5,S6 | Availability loss exceeds human response speed | Resilience checklist and local load tests | No edge telemetry | Watch/lab locally |
| 42 | DDoS | HTTP/2 and L7 protocol abuse | Global | S5 | Application layers buckle under shaped traffic | Local load-test harness | No public stress testing | Build local-only lab |
| 43 | DDoS | Botnet-for-hire attacks | Global | S5,S6 | SMEs cannot absorb traffic spikes | MSP report guidance | No mitigation service | Watch-only |
| 44 | OT/ICS | IT/OT convergence exposure | Europe, Asia, West | S6,S20 | Legacy systems meet Internet and AI ops | Toy ICS lab and report mapping | No OT expertise/proof | Watch/lab only |
| 45 | OT/ICS | Manufacturing ransomware disruption | Europe, Asia | S6,S20 | Downtime hits revenue fast | Partner checklist | No plant telemetry | Watch-only |
| 46 | OT/ICS | Building management system exposure | Europe, Asia | S6,S20 | Facilities can be disrupted | Toy lab concept | No field data | Watch-only |
| 47 | OT/ICS | Medical device security | West, Europe, Asia | S6,S12 | Patient risk and compliance pressure | Long-term threat radar | No medical lab | Watch-only |
| 48 | AI Attack | Direct prompt injection | Global | S13,S15 | Model follows malicious user instructions | Prompt replay harness | Need benchmark corpus | Build now |
| 49 | AI Attack | Indirect prompt injection through docs/web | Global | S13,S15 | Trusted content hijacks agent behavior | Browser/RAG lab | Need synthetic hostile docs | Build now |
| 50 | AI Attack | Jailbreak regression after model updates | Global | S13,S15,S23 | Old evals stop representing live risk | Continuous eval harness | Need per-lane history | Build in Evolution Engine |
| 51 | AI Attack | Tool invocation abuse | Global | S13,S14,S16 | Agents call dangerous tools from hostile context | Tool-input rails and command policy | Need tool eval suite | Build now |
| 52 | AI Attack | Cross-tool privilege escalation | Global | S14,S16,S17 | One low-risk tool enables high-risk action chain | Tool graph and action lineage | Need tool graph model | Build |
| 53 | AI Attack | MCP server tool poisoning | Global | S14,S16,S17 | Connector lies about capabilities or returns hostile instructions | MCP scanner and malicious server lab | Need MCP corpus | Build now |
| 54 | AI Attack | MCP capability attestation failure | Global | S16,S17 | Clients trust unverified tool descriptions | Capability manifest validator | Need schema/policy | Build |
| 55 | AI Attack | Agent-to-agent instruction propagation | Global | S14,S15 | One compromised agent contaminates others | Shintai lineage and kill-switch policies | Need multi-agent lab | Build later |
| 56 | AI Attack | Browser-agent form exfiltration | Global | S13,S14 | Agent submits data to attacker-controlled form | Browser navigation/form rails | Need synthetic portal lab | Build now |
| 57 | AI Attack | Code-agent sabotage | Global | S13,S15 | Agent makes plausible malicious code edits | Repo guardrails, diff review, scanner | Need malicious patch corpus | Build later |
| 58 | AI Attack | AI command injection through terminal output | Global | S13,S15,S26 | Tool output becomes next instruction | Output trust tiers and terminal rails | Need replay test | Build |
| 59 | Memory | Memory poisoning gradual drift | Global | S11,S13 | Long-term assistant behavior degrades | MemoryKernel provenance and rollback | Need synthetic memory lab | Build |
| 60 | Memory | RAG corpus poisoning | Global | S11,S13 | Retrieval makes bad facts authoritative | Source registry and retrieval rails | Need RAG poison corpus | Build |
| 61 | Memory | Context window trust collapse | Global | S13,S15 | Mixed-trust content shares one context | Context segmentation policy | Need prompt assembly tests | Build |
| 62 | Memory | Sensitive memory retention | Europe, West | S11,S12 | User/company secrets persist too long | Retention and redaction rules | Need memory audit ledger | Build |
| 63 | Model Supply | Model artifact tampering | Global | S11,S15 | Weights/adapters carry hidden behavior | Model provenance/checksum intake | Need model registry design | Build later |
| 64 | Model Supply | Fine-tune data poisoning | Global | S11,S15 | Poisoned training data embeds behavior | Data provenance policy | No fine-tune pipeline | Watch/later |
| 65 | Model Supply | Unsafe model route selection | Europe, Asia, West | S11,S21,S27 | Data goes to wrong jurisdiction/provider | Model-route trust-posture inventory | Need lane metadata | Build now |
| 66 | Model Supply | Shadow use of Asian model providers | Global, Asia-linked firms | S18,S19,S21,S27 | Policy misses non-Western AI usage | Regional Intelligence Pack | Need intake questionnaire | Build |
| 67 | Regulation | NIS2 operational pressure | Europe | S6,S12 | More companies need provable controls | Europe report mapping | No legal compliance engine | Build mapping, not legal claims |
| 68 | Regulation | DORA resilience expectations | Europe | S12 | Financial firms need resilience evidence | Report mapping and lab evidence | No DORA module | Watch/map |
| 69 | Regulation | GDPR / revFADP data handling risk | Europe, Switzerland | S12,S25 | AI tools may process personal data badly | Data flow and route inventory | Need data-classifier | Build later |
| 70 | Regulation | EU AI Act governance pressure | Europe | S11 | AI systems need risk documentation | Evidence and eval reports | Need claim discipline | Build mapping |
| 71 | Regulation | Singapore AI assurance/testing | Asia | S18,S19 | Buyers expect testable AI governance | Asia pack and eval framing | Need AI Verify mapping | Build research mapping |
| 72 | Regulation | China GenAI security requirements divergence | Asia | S21 | Western assumptions fail for China-linked deployments | Regional model governance lane | Need deeper China source corpus | Build research lane |
| 73 | Regulation | Japan industrial cyber/AI procurement controls | Asia | S20 | Industrial buyers expect sober security method | Japan/OT/AI report mapping | Need Japan-specific evidence | Build research lane |
| 74 | Regulation | Korea zero trust / AI security investments | Asia | S19,S27 | Regional buyer expectations differ | Asia pack | Need more Korea primary sources | Extend research |
| 75 | Business | Cyber insurance scrutiny | West, Europe | S10,S12 | Insurers ask for evidence of controls | Evidence report format | No insurance mapping | Watch/map |
| 76 | Business | Board-level AI risk pressure | Global | S1,S11 | Executives want simple proof and accountability | Executive + technical split reports | Need sample reports | Build |
| 77 | Business | SME security capacity gap | Europe, Asia, West | S6,S25 | Small teams cannot run heavy security programs | Lightweight assessment workflow | Need partner pilot | Build for Upgreat |
| 78 | Business | Security vendor AI-washing | Global | S1,S2,S11 | Buyers distrust vague AI claims | Claims matrix and evidence-first reports | Need public methodology | Build |
| 79 | Business | Hyperscaler ecosystem lock-in | West | S1,S2,S3 | Customers get security only inside one cloud/model stack | Multi-model, cross-provider YURI posture | Need lane metadata | Build |
| 80 | Business | Regional data sovereignty pressure | Europe, Asia | S11,S18,S21 | Buyers need route and storage clarity | Model-route inventory and trust labels | Need jurisdiction metadata | Build |
| 81 | Runtime | Missing telemetry for AI actions | Global | S13,S14,S16 | Security teams cannot see agent decisions | Action lineage and audit ledger | Need runtime event schema | Build |
| 82 | Runtime | Output channel exfiltration | Global | S13,S15 | Agent leaks data in responses/logs/files | Output rails and caps | Need DLP-like tests | Build |
| 83 | Runtime | Tool result prompt poisoning | Global | S13,S16 | Tool output becomes hidden instruction | Tool-output rails and trust tags | Need parser/eval | Build |
| 84 | Runtime | Unsafe autonomous retries | Global | S13,S14 | Agents repeat harmful actions faster than humans notice | Execution rails, round caps, kill switches | Need regression tests | Build |
| 85 | Runtime | Browser profile/session bleed | Global | S13,S14 | One task inherits another session's secrets | Browser profile isolation | Need harness support | Build |
| 86 | Runtime | Local daemon stale health | YURI/internal, client ops later | S26,S27 | Automation looks healthy when evidence is stale | AutomationKernel health split | Need completed implementation | Build |
| 87 | Runtime | Research source poisoning | Global | S13,S15 | Web research injects bad instructions/data | Browser-harness DOM trust, source ranking | Need research ingestion rails | Build |
| 88 | Runtime | Multi-agent advisory drift | YURI/internal, later client | S26,S27 | Advisors invent policy or stale names | Shintai Gate 0 evidence contracts | Need contradiction pass | Build |
| 89 | Runtime | Skill library sprawl | Global | S14,S26 | Users cannot know what skills/rules do | Skill scanner + registry | Need semantic scanner | Build |
| 90 | Runtime | Policy bypass through aliases | YURI/internal, client agent stacks | S26 | Old aliases route around current policy | Lane kernel and alias audit | Needs regression gates | Build |

## Regional Operating Models

### Europe / DACH / Switzerland

Primary buyer pressure: regulation, baseline security, SME/MSP support, data protection, conservative purchasing, and proof-heavy reports. YURI should speak in controls, evidence, scoped findings, and partner augmentation. Do not sell a generic SOC story here. Sell AI-specific assessment and hardening that complements existing baseline security work.

Build emphasis:
- ENISA/NIS2/DORA/EU AI Act mapping without legal claims.
- Upgreat-style partner workflow.
- AI route inventory for data sovereignty.
- Buyer reports that separate executive risk from technical remediation.

### West / US / UK / Canada

Primary buyer pressure: identity, cloud, SaaS, hyperscaler AI adoption, incident cost, cyber insurance, and established vendor stack fatigue. YURI should compete by being cross-model, agent-behavior-native, and evidence-first rather than trying to replace Microsoft, Google, CrowdStrike, or Palo Alto.

Build emphasis:
- Agent/tool/RAG/MCP adversarial eval harness.
- Cloud/SaaS connector risk modeling.
- Runtime action lineage.
- NIST AI RMF / CSF mapping.

### Asia / China / Japan / Korea / Singapore / India / Taiwan / SEA

Primary buyer pressure: regional AI ecosystems, model/provider diversity, data routing, government assurance programs, industrial security, and divergent regulatory assumptions. Asia is not a subsection of western cyber. It gets its own intelligence lane because DeepSeek, Qwen, Kimi, Minimax, GLM, Baidu, Tencent, Huawei/Ascend, Singapore AI Verify, Japan industrial cyber, and China TC260-style requirements all shape real risk.

Build emphasis:
- Regional model-route trust metadata.
- Asia AI provider watchlist.
- Singapore AI Verify mapping.
- Japan/Korea industrial and zero-trust evidence capture.
- China regulatory divergence notes with explicit UNKNOWN markers where sources are thin.

## Capability Ladders

| Ladder | Near Proof | Next Proof | Later Company Capability |
|---|---|---|---|
| Intelligence | Source-backed threat matrix | ThreatIntelKernel with updates and source scoring | Continuous cyber intelligence product |
| Assessment | AI-agent/security repo report | Partner-ready pilot workflow | Paid assessment practice |
| Lab Validation | Prompt/MCP/RAG/browser local labs | Multi-lane adversarial eval harness | Cyber range / assurance lab |
| Guardrails | Tool/input/output rails | Runtime action lineage and policy engine | Deployable client guardrail layer |
| Runtime Monitoring | YURI health/automation evidence | Agent telemetry schema | Managed monitoring service |
| Memory/RAG Security | Poisoning labs | Provenance and rollback controls | Enterprise memory/RAG security product |
| Client Reporting | Markdown/HTML report | Executive/technical split deliverables | Repeatable partner package |
| Managed Operations | Watch-only | Partner-supported triage | Later managed security operations |

## ThreatIntelKernel Concept

Every source-backed threat becomes a structured object:

```json
{
  "threat_id": "string",
  "domain": "string",
  "regions": ["europe", "west", "asia"],
  "evidence": ["S1", "S2"],
  "customer_pain": "string",
  "yuri_capability": "string",
  "missing_proof": "string",
  "lab_scenario": "string|null",
  "scanner_rule": "string|null",
  "guardrail": "string|null",
  "report_section": "string",
  "decision": "build|watch|reject"
}
```

The kernel is not an implementation dependency yet. It is the required mental shape for the next implementation wave so research does not become a graveyard of impressive paragraphs.

