# AI Org Prior Art — Multi-Agent Framework Role Taxonomies & Coordination Patterns
**Date:** 2026-06-22  
**Purpose:** Reference for designing a ~20-agent self-governing AI organization with STAR+blackboard topology  
**Primary sources:** arXiv papers + official GitHub READMEs + AG2 docs

---

## 1. ChatDev (arXiv:2307.07924, OpenBMB)

**Citation:** Qian et al. "Communicative Agents for Software Development." arXiv:2307.07924 (2023).  
**Source:** https://arxiv.org/abs/2307.07924 | https://github.com/OpenBMB/ChatDev

### Role Model
Seven specialized roles mimicking a software company:
- **CEO** — executive decision-making, requirements sign-off
- **CPO** (Chief Product Officer) — product direction
- **CTO** — technical architecture and coding supervision
- **Programmer** — code implementation (uses Git)
- **Art Designer** — GUI/visual assets
- **Reviewer** — peer code review (static analysis by inspection)
- **Tester** — system testing, executes code via interpreter

### Coordination Mechanism: Chat Chain
- Waterfall-phased: **Designing → Coding → Testing → Documenting**
- Each phase runs a sequence of atomic **dual-agent dialogues**: one agent as Instructor, one as Assistant
- Chat-chain propagates outcomes forward: previous dialogue output becomes next dialogue's context
- Agents switch between natural language (design) and code (debugging) as needed
- Human-agent-interaction mode: owner can assume Reviewer role for direct feedback
- v2.0 supports >1,000 agent topologies via YAML zero-code orchestration

### Governance/Verification
- **Peer review** (Reviewer agent inspects code) + **system testing** (Tester executes code)
- Git version control by Programmer agents
- Communicative dehallucination: structured dialogue templates suppress context drift
- Inception prompting (from CAMEL) for role stability

### Metrics
- ~86.66% of software executed flawlessly; avg ~7 min, ~$0.30/project
- Avg 2–8 code files, 4–5 doc files

### Adopt / Avoid
- **ADOPT:** Phase-gating (prevents premature code before design is settled); dual-agent dialogue for high-stakes decisions; Reviewer+Tester as separate verification roles
- **AVOID:** Strict waterfall — breaks on iterative tasks; fixed pairwise dialogue doesn't scale to >10 simultaneous concerns; no global shared state (each chat is local)

---

## 2. MetaGPT (arXiv:2308.00352, DeepWisdom)

**Citation:** Hong et al. "MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework." ICLR 2024. arXiv:2308.00352.  
**Source:** https://arxiv.org/abs/2308.00352 | https://github.com/geekan/MetaGPT

### Role Model
Assembly-line paradigm modeled on a software company:
- **Product Manager** — user stories, competitive analysis, requirements (PRD)
- **Architect** — system design, data structures, APIs
- **Project Manager** — task breakdown, sprint planning
- **Engineer** — code implementation, unit tests
- **QA Engineer** — test plans, test cases, bug reports

Each role produces **typed structured artifacts** (PRD → Tech Design → Code → Test Report) which are the units of inter-agent communication.

### Coordination Mechanism: Shared Message Pool + Publish-Subscribe
- All agents publish typed messages to a **global shared message pool**
- Agents subscribe only to message types relevant to their role (not all-to-all broadcast)
- Asynchronous pull model: agents query the pool when they need upstream artifacts
- SOPs are **encoded as prompt sequences**: each role's prompt template embeds its SOP obligations and expected input/output types
- "Code = SOP(Team)" — the framework IS the SOP materialized as code

### Governance/Verification
- Intermediate artifact verification: each role validates upstream outputs before using them (breaks cascade hallucination)
- Executable feedback loop: code is run during generation; errors fed back for self-correction
- Structured artifact types enforce schema contracts between roles (not free-text handoffs)
- 100% task completion rate on HumanEval-style benchmarks; 5.4% improvement on MBPP

### Adopt / Avoid
- **ADOPT:** Typed message pool (structured schema prevents ambiguity); SOP-as-prompt (encode expectations directly into system prompt); artifact-gated handoffs (no next phase without typed upstream output); role-specific subscriptions (reduces noise per agent)
- **AVOID:** Fixed software-company role structure is rigid for non-dev tasks; assembly-line order breaks when tasks require back-referencing earlier stages

---

## 3. AutoGen / AG2 (arXiv:2308.08155, Microsoft)

**Citation:** Wu et al. "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." arXiv:2308.08155 (2023).  
**Source:** https://arxiv.org/abs/2308.08155 | https://github.com/microsoft/autogen | https://docs.ag2.ai

### Role Model
Flexible, developer-defined roles via ConversableAgent base class:
- **AssistantAgent** — LLM-backed code generation, task completion, reasoning
- **UserProxyAgent** — human-in-the-loop proxy, code execution, approval gate
- **GroupChatManager** — orchestrates multi-agent group conversations, speaker selection
- **Swarm Agents** — emit HandoffMessages to route control explicitly
- Custom: math_expert, chemistry_expert, domain specialists — any role via system_message

### Coordination Mechanism: GroupChat + Handoff
- **GroupChat container**: all agents share a common channel; GroupChatManager enforces turn-taking
- **Orchestration patterns** (AG2 v0.9): AutoPattern (LLM picks next speaker), RoundRobinPattern, RandomPattern, ManualPattern (human picks), DefaultPattern (state-machine control)
- **Swarm pattern**: agents emit `HandoffMessage` to explicitly route to next agent; entire context broadcast to all participants
- **OnContextCondition**: deterministic rule-based routing using context variable expressions (e.g., `${issue_priority} == 'high'` → escalation_agent); no LLM judgment needed

### Governance/Verification
- Human-in-the-loop via `human_input_mode` — pause for approval at any turn
- `OnContextCondition` enables auditable, deterministic escalation rules
- `ExpressionContextCondition` evaluates typed context variables for routing decisions
- Iteration limits via `max_rounds` prevent infinite loops
- Note: AutoGen v0.2 is in maintenance mode; AG2 (community fork) is the active development surface

### Adopt / Avoid
- **ADOPT:** OnContextCondition for deterministic escalation (critical for governance); Swarm HandoffMessage for explicit routing chains; GroupChatManager as orchestrator hub maps directly onto STAR topology; human_input_mode for owner-gated decisions
- **AVOID:** Pure LLM speaker selection (AutoPattern) at scale — non-deterministic and expensive; GroupChat all-to-all broadcasting grows O(n²) with agents

---

## 4. CrewAI (joaomdmoura/crewAI → crewAIInc/crewAI)

**Source:** https://github.com/crewAIInc/crewAI | https://docs.crewai.com  
**Note:** No arXiv paper; empirical failure analysis from: https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/

### Role Model
Tripartite agent identity:
- **Role** — functional title ("Senior Data Researcher", "Code Reviewer")
- **Goal** — one-sentence mission statement shaping decisions
- **Backstory** — contextual expertise narrative grounding the persona

Manager agent (hierarchical mode) coordinates worker agents via task delegation and result validation.

### Coordination Mechanism
- **Sequential Process**: tasks execute in defined order, output feeds next task
- **Hierarchical Process**: manager LLM allocates tasks, validates outcomes; `allow_delegation=True` enables agent-to-agent delegation
- **Flows**: fine-grained state-machine control for complex conditional branching
- YAML-defined task specs: description, expected_output, assigned agent, output file, dependencies

### Governance/Verification
- Manager LLM validates outcomes before accepting (in theory)
- Task `output_file` creates durable artifacts per task

### Known Failure Modes (empirically documented)
1. **Hierarchical mode broken**: does not delegate — executes all tasks sequentially regardless; "conditional branching" is not enforced
2. **Delegation unreliability at scale**: `allow_delegation=True` fails as agent count grows
3. **Cost explosion**: 5-agent crew = minimum 5 API calls/task, often 5–10×
4. **No observability**: OSS version has minimal built-in logging; debugging requires custom tooling
5. **14 failure mode taxonomy** (1,600+ annotated traces): System Design Issues, Inter-Agent Misalignment, Task Verification Failures

### Adopt / Avoid
- **ADOPT:** Role/Goal/Backstory tripartite identity pattern (excellent for role-stability in prompts); YAML task spec with typed expected_output; `output_file` per task (maps to blackboard write)
- **AVOID:** Hierarchical process in production (broken); delegation at scale; uncapped `allow_delegation`; relying on manager LLM for routing without deterministic fallback

---

## 5. Generative Agents (arXiv:2304.03442, Stanford)

**Citation:** Park et al. "Generative Agents: Interactive Simulacra of Human Behavior." UIST 2023. arXiv:2304.03442.  
**Source:** https://arxiv.org/abs/2304.03442

### Agent Architecture (no fixed role taxonomy — 25 individual agents with emergent behavior)
- Not role-typed — each agent is an individual with name, personality, relationships
- Four architectural components: **memory + retrieval**, **reflection**, **planning**, **reacting**

### Coordination Mechanism: Memory Stream + Emergent Communication
- **Memory Stream**: append-only log of all experiences as natural language sentences
- **Retrieval scoring**: `score = α_recency × recency + α_relevance × relevance + α_importance × importance`
  - Recency: exponential decay γ=0.995/hour from last access
  - Relevance: cosine similarity (embedding) between query and memory
  - Importance: LLM-rated 1–10 at write time (1=mundane, 10=life-changing)
  - Equal weighting (α=1 for all three)
- Agents observe environment and other agents' actions via natural language percepts
- Dialogue via natural language — no typed schema
- No central bus; coordination is emergent from shared environment observation

### Governance/Verification
- Reflection: triggered when cumulative importance score of recent memories exceeds threshold
  - LLM clusters related memories → generates higher-order insight → stored back as memory
  - Example: "Klaus has been eating alone" → "Klaus seems withdrawn and isolated"
- Planning: recursive decomposition — daily plan → hourly plan → 5-minute action
- No explicit verification layer — self-consistency via reflection, not adversarial check

### Adopt / Avoid
- **ADOPT:** Memory stream architecture (persistent append-only log per agent); recency×relevance×importance retrieval scoring (three-signal composite beats pure cosine); reflection mechanism for periodic synthesis; recursive planning decomposition
- **AVOID:** Emergent-only coordination at scale (no schema, no routing — breaks for task-oriented systems); no adversarial verification; no typed artifacts; high API cost for 25+ agents with full memory retrieval per turn

---

## 6. Voyager (arXiv:2305.16291, NVIDIA + UT Austin)

**Citation:** Wang et al. "Voyager: An Open-Ended Embodied Agent with Large Language Models." arXiv:2305.16291 (2023).  
**Source:** https://arxiv.org/abs/2305.16291

### Role Model: Hierarchical Sub-Agent Architecture (4 functional roles)
- **Curriculum Agent** (GPT-3.5/4) — proposes next task based on current state, inventory, completed/failed history; maximizes exploration diversity
- **Action Agent** (GPT-4) — generates executable JavaScript code; retrieves top-5 relevant skills from library
- **Critic Agent** (GPT-4) — validates task completion; if failing, generates critique with suggested strategies
- **Skill Manager** (vector DB) — institutional memory: stores, indexes, and retrieves executable skill programs

### Coordination Mechanism: Iterative Feedback Loop + Skill Library
- Action Agent retrieves top-5 skills via embedding similarity (text-embedding-ada-002)
- Iterative prompting: up to 4 rounds of refinement per task (environment feedback → execution errors → self-verification)
- Success → Critic approves → skill added to library with embedding description
- Failure after 4 rounds → Curriculum reattempts with new task
- Skills are **composable**: complex skills scaffold from simpler retrieved skills

### Governance/Verification
- Critic Agent as independent verifier: receives current state + task description, determines pass/fail + critique
- Self-verification is "more comprehensive than self-reflection" — explicit success/failure signal, not just introspection
- Skill library prevents catastrophic forgetting (persistent institutional knowledge)
- Failure handling: flexible curriculum reattempt (not hard fail)

### Known Limitations
- High GPT-4 cost (15× vs GPT-3.5)
- Self-verification failures (missing success indicators)
- Hallucinations in task proposals (non-existent items)

### Adopt / Avoid
- **ADOPT:** Curriculum Agent pattern (automatic task-queue management); Critic Agent as independent adversarial verifier (separate from executor); Skill Library with embedding retrieval (institutional memory that compounds); composable skill design; iterative refinement loop (up to N rounds before escalation)
- **AVOID:** Single-agent Curriculum (no parallel task dispatch); 15× GPT-4 cost at scale; self-verification failures in ambiguous tasks

---

## 7. AutoGPT / BabyAGI (Significant Gravitas / Yohei Nakajima, 2023)

**Sources:** https://github.com/Significant-Gravitas/AutoGPT | https://www.ibm.com/think/topics/babyagi  
**Note:** No peer-reviewed arXiv paper; empirical analysis from production deployments.

### Role Model: Task Loop Agents (minimal role taxonomy)
**BabyAGI** (3 specialized agents):
- **Task Creation Agent** — generates new tasks from completed task results + objective
- **Prioritization Agent** — reorders task queue based on objective alignment
- **Context Agent** — retrieves relevant context from vector memory (Pinecone)

**AutoGPT** (single autonomous agent with tools):
- One agent decomposes goal → subtasks → executes → evaluates → loops
- Tools: web browser, code execution, file I/O, 50+ API plugins

### Coordination Mechanism: Task Queue Loop
- Append-only task queue; each completed task spawns new tasks
- Vector DB memory (Pinecone) for context retrieval
- BabyAGI: context agent provides past results to execution agent per turn
- AutoGPT: hierarchical subtask decomposition within single agent

### Governance/Verification
- **None** — no independent verifier, no adversarial check
- Stopping condition: task queue empty OR max iterations (manual config)
- Human must inspect outputs; no automated quality gate

### Documented Failure Modes
1. **Infinite loops** — task creation feeds itself; no convergence signal
2. **Cost runaway** — GPT-4 backbone burns through API budget rapidly
3. **Model quality cliff** — GPT-3.5 dramatically degrades; hard dependency on strongest model
4. **Benchmark gap** — 24% success rate on EPICS (1–2 hour professional tasks) vs >90% on standard benchmarks
5. **No verification** — incorrect outputs silently propagate into next tasks

### Adopt / Avoid
- **ADOPT:** Task queue pattern (asynchronous task dispatch); vector DB context retrieval per task; decompose-then-execute loop structure
- **AVOID:** No verification layer (critical failure); uncapped task creation (infinite loop risk); single-agent design for multi-concern tasks; no schema enforcement on task outputs

---

## Synthesis: What Fails at Scale (Cross-Framework Patterns)

| Failure Class | Observed In | Mechanism |
|---|---|---|
| Cascade hallucination | ChatDev, AutoGPT, BabyAGI | Unverified output feeds next agent; errors compound |
| Infinite loops | AutoGPT, BabyAGI, uncapped CrewAI | No convergence signal; task creation self-reinforces |
| Cost explosion | All GPT-4-heavy systems | Every agent = N API calls; unparallelized serial chains |
| Delegation failure | CrewAI hierarchical, AutoGPT | Manager LLM picks wrong agent or delegates sequentially |
| Context explosion | Generative Agents, AutoGen full-broadcast | All-to-all communication grows O(n²) |
| No verification | AutoGPT, BabyAGI, CrewAI | Silent propagation of incorrect intermediate outputs |
| Role drift | ChatDev without inception prompting | Agents abandon assigned role under conversation pressure |
| Skill forgetting | AutoGPT single-agent | No persistent skill library; each run starts from zero |

---

## What Works (Positive Patterns to Carry Forward)

| Pattern | Source | Why It Works |
|---|---|---|
| Typed artifact schema between roles | MetaGPT | Prevents ambiguous free-text handoffs; enables schema validation |
| Publish-subscribe shared message pool | MetaGPT | Scales to N agents without O(n²) broadcast |
| Phase-gating (no next phase without upstream artifact) | MetaGPT, ChatDev | Prevents premature execution |
| Independent Critic/Verifier agent | Voyager | Adversarial check separate from executor breaks confirmation bias |
| Skill library with embedding retrieval | Voyager | Institutional memory; compounds capability; prevents forgetting |
| Iterative refinement loop (up to N rounds) | Voyager | Bounded retries with escalation fallback |
| Memory stream + recency×relevance×importance | Generative Agents | Three-signal retrieval outperforms pure cosine; temporal decay is critical |
| Reflection for periodic synthesis | Generative Agents | Converts raw events into higher-order knowledge |
| OnContextCondition deterministic routing | AG2 | Auditable, non-LLM-dependent escalation rules |
| Role/Goal/Backstory identity | CrewAI | Strong role-stability in system prompt |
| Automatic curriculum / task queue | Voyager, BabyAGI | Decouples task discovery from execution |
| Human-in-the-loop gate | AutoGen UserProxy | Owner-gated approval for high-blast decisions |

---

## Sources (Primary)

1. ChatDev: https://arxiv.org/abs/2307.07924 | https://github.com/OpenBMB/ChatDev
2. MetaGPT: https://arxiv.org/abs/2308.00352 | https://github.com/geekan/MetaGPT
3. AutoGen: https://arxiv.org/abs/2308.08155 | https://github.com/microsoft/autogen
4. AG2 docs: https://docs.ag2.ai/latest/docs/blog/2025/04/28/0.9-Release-Announcement/
5. Generative Agents: https://arxiv.org/abs/2304.03442
6. Voyager: https://arxiv.org/abs/2305.16291
7. AutoGPT/BabyAGI: https://www.ibm.com/think/topics/babyagi | https://is4.ai/blog/our-blog-1/autogpt-vs-babyagi-comparison-2026-199
8. CrewAI failure analysis: https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/
9. CrewAI docs: https://docs.crewai.com/en/learn/hierarchical-process
10. Blackboard LLM paper: https://arxiv.org/pdf/2507.01701
11. Multi-agent failure taxonomy (14 modes): https://arxiv.org/pdf/2310.03659
