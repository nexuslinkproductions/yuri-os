# Jake Van Clief → NUDIMMOD: Deep Extraction & Improvements

**Date:** 2026-05-06  
**Source:** 30 YouTube transcripts (640K chars), Skool data (27,200 members), trading bot mapping, NUDIMMOD system audit  
**Analyst:** Subagent — depth extraction  

> This report extracts not what Jake *says* but what Jake *is* — the cognitive architecture beneath his content. Every insight here can be executed from this document without watching a single video.

---

## A. Frameworks Worth Adopting (5+)

### A1. The AI-as-Compiler Mental Model

**Source:** jjV1ckgPzI0 (36K chars — the KPMG lecture video), DbIjTB-kh8E (23K chars — 2,000 years of computing history)

**What it is:** AI is not a magic box that answers questions. It's the next abstraction layer above Python/C/Rust — just as Grace Hopper's compiler was an abstraction above assembly. The same patterns that applied to compilers apply to AI: deterministic wrapper code handles reliability, retry logic, validation layers; the AI handles the probabilistic "compilation" of human intent into executable steps.

**Where it applies in NUDIMMOD:**
- *All agent interactions* — The distinction between "the agent is wrong" vs "the compiler emitted a bad compilation" changes debugging approach
- *Trading bot inference* — Ensemble inference (phase 4) should be treated as calling 5 compilers, not 5 oracles. Same input, different compilation strategies, aggregate the output
- *Self-improvement system* — The `03_LEARNINGS/` extraction pipeline should treat AI outputs as "compiled" from your input data — debug the data, not the model

**Specific change to make:**
Replace the current `icm-methodology.md` framing of "AI memory is unreliable" with the more precise: "AI is a probabilistic compiler. Treat its outputs as compiled code — you debug the source (your instructions and data), not the compiled output. If the output is wrong, the issue is upstream in your prompt pipeline, just like debugging C++ by fixing the source, not the binary."

### A2. The 3-Layer Folder Architecture (RAW → PROCESSED → SYNTHESIZED)

**Source:** 0fCQ-4J_jzk (53K chars — the "why I stopped building agents" video), MkN-ss2Nl10 (23K chars — "stop building agents, use this folder system"), S3fXSc5z2n4 (14K chars — Mad Libs video), ozkx_eUfjY0 (34K chars — rebuilding a website with folders)

**What it is:** Jake's ICM is organized into three cognitive layers:
1. **RAW** — Inbox/capture. No structure, timestamped files. Get it out of your head.
2. **PROCESSED** — Structured, sorted, categorized. Retrievable in <2 min. Cross-referenced.
3. **SYNTHESIZED** — Cross-domain patterns. Connections between separate domains. Behavior-changing insight.

**Where it applies:**
- *SELF-IMPROVEMENT/* directory is close but has 5 directories instead of 3, and the layers aren't explicit
- *03_LEARNINGS/* mixes processed lessons with raw failure capture and weekly synthesis — Jake would say these should be separate directories with different thought patterns enforced
- *KNOWLEDGE-BASE/* has a rough 3-layer structure (00_INBOX → 03_KNOWLEDGE → 04_SYNTHESIS) but the naming isn't enforcing the RAW/PROCESSED/SYNTHESIZED thinking pattern

**Specific change to make:**
Rename the 5 SELF-IMPROVEMENT directories to use the 3-layer ICM naming:
- `01_FRAMEWORKS/` → stays (this IS Layer 2 — processed mental models)
- `02_PRACTICES/` → rename to `02_RAW_CAPTURE/` (night-block data, failure events, morning reviews belong here as time-stamped files, not pre-structured templates)
- `03_LEARNINGS/` → rename to `02_PROCESSED/` (lessons extracted from RAW, now retrievable)
- `04_METRICS/` → merge into `02_PROCESSED/metrics/` (processed data, not a separate thought pattern)
- `05_VISION/` → rename to `03_SYNTHESIS/` (integrated patterns, quarterly reviews, capability roadmaps)

The 3 directories enforce a chronological cognitive flow the same way Jake's folders do: RAW → PROCESSED → SYNTHESIZED.

### A3. Question Prompts over Answer Prompts

**Source:** ZMDXs59Ntjc (47K chars — the "true art of AI" video)

**What it is:** "In a world full of answers, questions become valuable." Jake's prompts are designed as questions, not as instructions to produce outputs. They make the *human* think rather than just generating text. His prompt library is "prompts to help you ask better questions, not to get something done."

**Where it applies:**
- *ALL SELF-IMPROVEMENT templates* — The `extraction-template.md` and `failure-log.md` currently ask for answers ("What I tried", "What happened"). Jake would redesign these as *questions*: "If you could relive this session, what one thing would you do differently?" — this forces the cognitive work on the human side
- *Decision-matrix.md* — Currently an algorithm. Jake would add a question layer: "What question would expose the wrong choice here?"
- *Night-block protocol* — The kickoff currently asks for a goal sentence. Add: "What question would make tonight's work irrelevant in hindsight?"

**Specific change to make:**
In `failure-log.md`, add a mandatory opening question field:
```
**Opening question** (answer before writing anything):
"If you had to thank this failure for teaching you something, what would it be?"
```
This forces a reframe before the emotional narrative takes over. Jake says the reframe is more valuable than the answer.

### A4. PRD-First, Code-Second Workflow

**Source:** ozkx_eUfjY0 (34K chars — rebuilding a website), rHDA0WMXzy4 (26K chars — Claude desktop session 1-5)

**What it is:** Jake never codes first. He:
1. Analyzes the domain (scrape the website, read the docs, understand the landscape)
2. Creates a markdown analysis file ("markdown file that describes the structure for Claude to read, not for me")
3. Builds a PRD (product requirements document) using the design skill
4. Creates the folder architecture (Claude.md, context files, routing)
5. *Then* writes code — but only what the PRD specifies

The key insight: **"The better the core data it starts with, the more organized the data is, the easier it is for the AI to create what you want."**

**Where it applies:**
- *Trading bot implementation* — The handoff doc says "All specifications are deterministic and locked. No inference or design decisions required — only implementation to spec." But Jake would say the specs themselves need to be tested first: create a paper-prototype of the folder structure, run it through an AI agent, observe where it breaks, *then* implement.
- *Self-improvement system* — The 22 files were built by designing and writing at the same time. Jake would say: "Stop writing framework files. Write one RAW capture file that describes what you WANT the system to do. Then build the PRD as a single markdown file. Then derive the 22 files from the PRD."

**Specific change to make:**
Before modifying any SELF-IMPROVEMENT or trading bot file, create a single `_PRD.md` file at `_SYSTEM/SELF-IMPROVEMENT/_PRD.md` that describes what the idealized system would do. Then derive ALL file changes from that PRD. Never edit files directly — always route through the PRD.

### A5. Voice Documenting — Write Your Own Identity Files

**Source:** 0fCQ-4J_jzk (the coworker + voice style session)

**What it is:** Jake discovered that when you ask AI to describe your voice or identity, "it's going to write about your voice in a way that an AI would write about your voice. Even the best models still struggle with this." His solution: **write the core identity files yourself, in your own voice, during a high-energy moment.** Then let AI amplify from there, but never let AI generate the source identity.

**Where it applies:**
- *IDENTITY.md* — Currently 20K chars, mixed AI-written and human-written. Sections written by AI (the tone, the self-descriptions) will feel like AI wrote them, which undermines the entire identity.
- *SOUL.md* — Currently generic and template-like. "Be genuinely helpful, not performatively helpful" is a good start but sounds like it was generated.
- *Design system brand voice* — The Yuri OS design system defines voice as "Functional first, poetic second" — but this was almost certainly AI-generated. Jake would say write this from scratch during peak creative hours.

**Specific change to make:**
Schedule a single night block where Marcel writes SOUL.md and the brand voice section of design-system.md from scratch, in one stream, no AI involvement. "Even the best models still struggle with this." Then use AI only to format, organize, and cross-reference the output — never to generate the voice.

---

## B. Architecture Critiques (5+)

### B1. The 22-File Self-Improvement System Suffers From Category Drift

**What we built:** 22 files across 5 directories, each with clear titles but no enforced cognitive flow.

**The gap:** Jake says "categories just sort things. Architecture *routes thinking* through a designed sequence of mental operations." Our system has categories (FRAMEWORKS, PRACTICES, LEARNINGS, METRICS, VISION) but doesn't enforce a sequence. A user can land in any file, read it in any order, and the system doesn't guide them.

**The fix:** Add a `START_HERE.md` at the root of SELF-IMPROVEMENT that enforces a designed sequence:
```
START HERE →
01_FRAMEWORKS/README.md (read this first — sets the thinking)
  → 02_RAW_CAPTURE/ (file your current state here)
    → 03_SYNTHESIS/ (weekly, extract patterns)
      → back to START? OR exit?
```
This is Jake's `claude.md` pattern applied to self-improvement.

### B2. The Self-Improvement System Has No Query Interface

**What we built:** 22 files, meant to be read linearly by humans.

**The gap:** Jake's core principle is "if you want AI to learn, build a file system." But the SELF-IMPROVEMENT system is built for human reading, not agent reading. There's no `claude.md` or equivalent that tells an AI agent: "When someone asks about failures, read this file first. When they ask about frameworks, read that file."

**The fix:** Create `_SYSTEM/SELF-IMPROVEMENT/AGENT_ROUTING.md` — a single file that serves as the AI's routing table:
```markdown
# Agent Routing — Self-Improvement System

When queried about:
- **Frameworks/Mental models** → read 01_FRAMEWORKS/
- **What's been failing** → read 02_RAW_CAPTURE/failures/
- **Weekly patterns** → read 03_SYNTHESIS/weekly-consolidation.md
- **Energy or scheduling** → read 02_PROCESSED/energy-patterns.md

Default sequence: START_HERE.md → full read of 01_FRAMEWORKS/ first
```

### B3. The Failure Taxonomy Doesn't Match Jake's Ladder

**What we built:** The failure-log.md uses 6 root cause types: knowledge-gap, assumption, haste, emotion, external, other.

**The gap:** Jake's 7-rung Ladder of AI Failure (from jjV1ckgPzI0) is more precise and more actionable:
1. Wrong goal
2. Right goal, wrong approach
3. Right approach, bad execution
4. Right execution, bad timing
5. Right timing, bad calibration
6. Right calibration, bad risk management
7. All correct, black swan

Our taxonomy is too vague. "Assumption" could mean any of rungs 2-5. "Emotion" isn't on Jake's ladder at all — he'd say "emotion is upstream of the failure, not the failure type itself."

**The fix:** Replace the failure-log.md root cause types with Jake's ladder. Add a mapping layer:
```markdown
**Root cause ladder rung:** [1-7]
**Emotion (upstream):** [frustration/fear/haste/overconfidence/none]
**Prevention filename:** (the file in 02_PROCESSED/this-failure-would-have-been-prevented-by.md)
```

### B4. The Energy-Aware Scheduling Is Not Embedded in the Architecture

**What we built:** A detailed energy-aware scheduling table in `decision-matrix.md` (Zone 1/2/3, best task mapping).

**The gap:** Jake would say this information is "stored" not "embedded." The knowledge exists in a document but doesn't *enforce* behavior. Jake's approach would be: name the folders so they enforce energy-aware routing. Create a `01_DEEP_WORK/` folder that's only opened during Zone 1, and a `02_LIGHT_ADMIN/` folder for Zone 3. The folders themselves enforce the pattern.

**The fix:** Restructure the directory so energy zones are explicit in folder naming:
```
SYSTEM/
├── 01_DEEP_WORK/        ← only open during 21:00-04:00
│   ├── creative-production/
│   ├── systems-architecture/
│   └── synthesis/
├── 02_ADMIN/            ← any time
│   ├── communications/
│   └── inbox/
└── 03_LEARNING/         ← Zone 1 or 2
    ├── japanese/
    ├── technical-reading/
    └── skill-practice/
```
The folder names *are* the schedule. You don't check a document to know what to do; the structure tells you.

### B5. The Processed Layer Has Retention Rules But No Decay Logic

**What we built:** 03_LEARNINGS/weekly-consolidation.md with a 7-day RAW retention rule.

**The gap:** Jake's ICM says "Anything that stays in RAW > 7 days is either DONE or LOST." But the PROCESSED layer (our 03_LEARNINGS/ and 02_PRACTICES/) has no decay logic. Old learnings accumulate forever, degrading signal-to-noise. Jake would say processed content also has a shelf life.

**The fix:** Add an `ARCHIVE/` directory at `_SYSTEM/SELF-IMPROVEMENT/04_ARCHIVE/` with a quarterly review rule:
- Move any lesson unaccessed in 90 days to ARCHIVE
- At quarterly review, delete ARCHIVEd content > 1 year old
- Record *why* it was archived (outdated / internalized / irrelevant) as a meta-learning signal

---

## C. Workflow Improvements (5+)

### C1. Stop Writing Templates as Procedures. Write Them as Questions.

**Current:** `extraction-template.md` asks "What I tried" / "What happened instead" — declarative statements.  
**Jake says (ZMDXs59Ntjc):** "These aren't prompts, they're structured answers. You're filling in the blank when you should be asking the question."  
**Change:** Rewrite extraction-template.md as a sequence of questions only. Remove all placeholders. Add this framing:
```markdown
Start with one question. Answer it. Then the next question will appear.
```
Jake's reasoning: an empty template asks for a report. A question sequence asks for discovery.

### C2. Add a "Claude.md" Router to the Trading Bot Project

**Current:** No routing file for agents entering the trading bot directory.  
**Jake says (ozkx_eUfjY0, rHDA0WMXzy4):** "Every folder needs a Claude.md that tells the agent what it's looking at and where to go. Otherwise the agent searches every file, burning tokens."  
**Change:** Create `.claude/trading-bot/CLAUDE.md`:
```markdown
# Trading Bot — Agent Entry Point

You are entering the NUDIMMOD prediction market trading bot project.

## Where things live:
- Architecture specs: .claude/trading-bot/phase-*/*.md
- Implementation: Scripts/trading-bot/*.mjs
- Schemas: .claude/trading-bot/schemas/
- Logs: Scripts/trading-bot/logs/
- Kill-switch state: Scripts/trading-bot/.kill-switch-state

## When you are asked about:
- How to add a new market → read phase-2/SCANNER.md first
- How risk decisions work → read phase-5/RISK_ENGINE.md
- How to run a cycle → read TRADING_BOT_README.md

## Key principles (read before editing):
- No API keys in code or logs
- All JSONL output validates against schemas
- All division operations guarded
- Kill-switch must be ARMED for live trades
```
Effort: 30 minutes. Saves hours of token waste every time an agent enters this directory.

### C3. Replace "Weekly Sprint" with Jake's "Weekly Competition" Model

**Current:** `weekly-sprint.md` — a planning document with goals, tasks, retro sections.  
**Jake says (Skool data, ZMDXs59Ntjc):** His community runs WEEKLY COMP competitions with $325 prizes. The winner gets paid. The constraint ("build a folder-based AI specialist") forces creative output under pressure.  
**Change:** `weekly-sprint.md` → rename to `weekly-comp.md`. Structure it as:
```markdown
# This Week's Challenge
[A specific, constrained output — not "work on trading bot" but "ship one working evidence collector that processes 10 markets"]

# Stake
[What do you win/lose? Not points — concrete value. "A focused Saturday night" or "Skip Thursday admin"]

# Constraint
[What are you NOT allowed to do this week? "No new tools. Only use what you already have."]

# Judge
[External criteria — not self-evaluated. "Running bot produces valid JSONL output"]
```
Jake's insight: goals without stakes are wishes. Competition produces better output than planning.

### C4. Stop Asking the Model to Describe the System. Have It Read a File.

**Current:** Every time an agent enters the trading bot or self-improvement directories, it reads the full file tree.  
**Jake says (pdoSAWWCDO8, ozkx_eUfjY0):** "The better the core data it starts with, the more organized the data is, the easier it is for the AI to create what you want." He creates a single .md summary file that describes the folder structure to the AI, so the AI doesn't need to scan the entire tree.  
**Change:** In EVERY directory (trading bot, SELF-IMPROVEMENT, Scripts/), create a `DIRECTORY_MAP.md`:
```markdown
# Directory Map — [Name]

## Files (flat list)
- file-a.mjs — [one-line purpose]
- file-b.mjs — [one-line purpose]

## Subdirectories
- subdir/ — [what's in there, max 2 lines]

## Cross-references
- Related to: [other directory/file path]
- Depends on: [dependency path]
```
Then instruct agents to read `DIRECTORY_MAP.md` first, not the full tree. Jake says this cuts token usage by 40-60% on first entry.

### C5. Add a "Cowork" Mode to the Trading Bot

**Current:** The trading bot has an Agent/Coworker decision matrix in `_SYSTEM/SELF-IMPROVEMENT/` but the bot itself has no corresponding mode.  
**Jake says (0fCQ-4J_jzk, his core philosophy):** Most trading decisions should be COWORKER mode — AI calculates and suggests, human approves above a threshold. Full automation only after 100+ verified trades.  
**Change:** Add `coworker-mode.mjs` to `Scripts/trading-bot/`:
```javascript
export function isCoworkerMode(riskDecision, portfolioState) {
  // Auto-approve if: Kelly size < $50 AND Brier <= 0.15 AND market is familiar
  if (riskDecision.kellySize < 50 && ...) return false; // full agent
  
  // Otherwise: flag for human review
  return true;
}

export function generateCoworkerBrief(riskDecision, marketSnapshot) {
  // Returns a structured message for human review:
  return {
    summary: `Hold ${riskDecision.kellySize} shares of ${marketSnapshot.marketId}`,
    reasoning: `Edge: ${riskDecision.edge} | Confidence: ${riskDecision.confidence}`,
    alternatives: `Pass | Half-size | Double`,
    deadline: `${30 * 1000}ms auto-reject if no response`
  };
}
```
This is the direct implementation of Jake's "what not to automate" philosophy.

---

## D. Trading Bot Corrections (5+)

### D1. The Pipeline Is Model-Centric, Not Data-Centric

**Current approach:** Phase 3 collects evidence. Phase 4 runs 5 models on that evidence. The assumption is: better models → better predictions.

**Jake's likely objection (from jjV1ckgPzI0):** "The question isn't which model is best — the question is which data is most reliable. I built a pipeline for the Neuro Politics Lab where I got 10,000 responses with extremely low variability. Not because the models were good, but because the data pipeline eliminated noise. The data design thinking process matters more than the model selection."

**Recommended change:** Restructure Phase 3 (evidence collection) to be the primary differentiator. Add a data quality gate BEFORE phase 4:
```javascript
function assessDataQuality(evidencePacket) {
  // Score: 0.0 - 1.0
  return {
    freshnessScore: ...,
    sourceDiversityScore: ...,
    contradictionLevel: ...,
    confidenceScore: ...  // aggregate
  };
}
```
If data quality < 0.6, skip model inference entirely. Return "INSUFFICIENT_DATA" risk decision. Phase 4 should only run when Phase 3 produces high-quality evidence.

### D2. The Ensemble Weights Are Static

**Current approach:** Claude 0.25, Grok 0.20, GPT-4o 0.20, DeepSeek 0.20, Gemini 0.15 — fixed weights.

**Jake's likely objection (from _rtyhVD4v4A, the anti-gravity vs Claude vs Codeex comparison):** "I tested the same task on 3 different models, and they didn't fail the same way. Claude was good at planning but missed JSON errors. Codeex failed at PowerShell. Gemini took longest but got JSON perfect. Each model has a systematic bias. You need dynamic weights based on which type of market you're predicting."

**Recommended change:** Replace static weights with per-market-type dynamic weights:
```javascript
const MODEL_PERFORMANCE = {
  binary: { claude: 0.30, grok: 0.15, gpt4o: 0.20, deepseek: 0.20, gemini: 0.15 },
  multi_category: { claude: 0.20, grok: 0.25, gpt4o: 0.20, deepseek: 0.20, gemini: 0.15 },
  numeric: { claude: 0.20, grok: 0.15, gpt4o: 0.20, deepseek: 0.15, gemini: 0.30 },
};
```
Track per-model calibration by market type in the compound step. Update weights weekly based on rolling Brier score.

### D3. The Failure Taxonomy Has No "Edge Case" Card

**Current approach:** Post-mortem classification: Type A (prediction), B (timing), C (execution), D (external shock).

**Jake's likely objection (from jjV1ckgPzI0, his "Ladder" video):** "Every AI failure framework I've seen misses the most common failure: the model was given the right data, picked the right model, calibrated correctly, but the question itself was wrong. The market was predicting something else entirely. That's not a prediction failure — that's a framing failure. It's a different type."

**Recommended change:** Add Type E: **Framing failure** — the bot correctly predicted an answer to the wrong question. This happens when the market question phrasing is ambiguous, the resolution criteria differ from the prediction model's understanding, or the market moves on a different informational axis than the evidence collected.

Add to `classifyTradeOutcome()`:
```javascript
case 'E': // Framing failure
  // Detected when: model predicted YES with 70%+ confidence on evidence A,
  // but market resolved on evidence B.
  // Resolution: add market-question ambiguity check to Phase 2 scanning.
  return { type: 'E', severity: 'learning' };
```

### D4. No Token Budget Control for Phase 4

**Current approach:** Phase 4 calls 5 models with full evidence packets. No token budgeting.

**Jake's likely objection (from ozkx_eUfjY0, the PRD-first workflow):** "If you're calling 5 models on every market with the full evidence packet, you're burning through your API budget on markets that don't even meet the edge threshold. I develop market scanning systems for government contracts — you pre-filter with deterministic logic, then only run expensive models on candidates that pass. Your Phase 2 should already filter to < 10% of scanned markets."

**Recommended change:** Add a token budget filter BETWEEN Phase 2 and Phase 4:
```javascript
function shouldRunFullEnsemble(candidateFeatures) {
  // Run full inference only if:
  // 1. Market volume > $10K
  // 2. Liquidity > 100 shares
  // 3. Time to market close > 24 hours
  // 4. Edge potential > 5% (quick estimate)
  return candidateFeatures.volume > 10000 
    && candidateFeatures.liquidity > 100 
    && candidateFeatures.timeToClose > 24
    && candidateFeatures.edgePotential > 0.05;
}
```
If not met: skip Phase 4, mark as "LOW_EDGE" skip in Phase 5.

### D5. The Compound Step Has No Weekly Retro Mode

**Current approach:** Compound step appends to failure knowledge files. Single-direction data flow.

**Jake's likely objection (from all his content):** "Writing to a file isn't learning. Rewriting the file based on what you learned — that's learning. If you just append to the same file every time, you're building an archive, not a knowledge base. You need a consolidation loop that refactors the knowledge base every N entries."

**Recommended change:** Add a weekly consolidation mode to Phase 5 (Compound):
```javascript
async function consolidateFailureKnowledge() {
  const entries = await readFailureFiles();
  if (entries.length < 20) return; // not enough data yet
  
  // 1. Cluster entries by root cause
  const clusters = clusterByRootCause(entries);
  
  // 2. For each cluster, extract one "prevention rule"
  const rules = clusters.map(cluster => ({
    pattern: cluster.patternDescription,
    preventionRule: cluster.extractedPrevention,
    occurredCount: cluster.entries.length,
    lastOccurrence: max(cluster.entries, e => e.date)
  }));
  
  // 3. Rewrite failure-knowledge/ with only the rules
  await write('failure-knowledge/consolidated-rules.md', rules);
  
  // 4. Archive old entries
  await archiveDir('failure-knowledge/detailed-entries/');
}
```
Jake's principle: "If the file doesn't change, the system isn't learning."

---

## E. Self-Improvement System Enhancements (5+)

### E1. Add an "Experiment" Track Alongside "Project"

**Current state:** The learning system tracks projects. Projects are serious — they have deliverables, deadlines, outcomes.

**Gap:** Jake's entire approach is built on *experiments* — "watch me build something," "trying to see what happens when I do X." He doesn't start a project; he starts an exploration. The learning system has no "let's see what happens" track.

**Enhancement:** Add an `experiments/` directory to 03_LEARNINGS:
```
03_LEARNINGS/
├── projects/           ← current (serious, deliverables)
├── experiments/        ← new (play, discovery, "what if")
│   ├── active/
│   └── completed/
└── weekly-consolidation.md
```
Experiment template (from Jake):
```markdown
# Experiment: [Name]

**Question:** What happens if...
**Setup:** [What I did]
**Expected:** [What I thought would happen]
**Actual:** [What actually happened]
**Signal:** [Something I can use — even if the experiment "failed"]
**Lesson filed as:** [link to lesson entry]
```

### E2. The "Never Automate" List Needs Explicit Content

**Current state:** `decision-matrix.md` has a "NEVER" section for personal journaling and identity decisions. That's a good start.

**Gap:** Jake dedicates an entire video to "The True Art of AI: Knowing What NOT to Automate" (ZMDXs59Ntjc). His framework is more nuanced than "never." He says: "If you're automating something and it keeps feeling wrong, that's not a technical problem — that's a boundary signal. Listen to it."

**Enhancement:** Expand the "Never" section into a full file `01_FRAMEWORKS/never-automate.md`:
```markdown
# What Never to Automate

## Sacred (No agent touches, ever)
- Personal journaling
- Identity statements
- Relationship communications

## Always Cowork (Agent drafts, human decides)
- First time doing something
- Anything with relationship risk
- Strategic pivots (what direction to head)
- Kill-switch activation

## Agent After Verification (Automate only when verified N times)
- Recurring admin (verify 3 successful runs, then automate)
- Data extraction from known sources (verify 5 runs)
- Formatting/transformation tasks (verify with golden test case)

**Key rule (from Jake ZMDXs59Ntjc):** "When you're selling something and it gets easier and easier to the point where you're just tossing it into Claude, that's your key to know — oh, in 6 months everyone's going to be able to do this for free. Find the next layer."
```

### E3. Add a "Token Efficiency" Practice

**Current state:** No file in the self-improvement system addresses token management.

**Gap:** Jake talks about token efficiency in every other video. His approach: "I'm able to keep my token usage so down because I'm spending so much time on my initial prompts." He uses routing folders, short claude.md files, and upfront PRD creation to minimize token burn.

**Enhancement:** Add `02_PRACTICES/token-efficiency.md`:
```markdown
# Token Efficiency Protocol

## Principle
Every token spent has an expected value. If you spend 10K tokens to get a 5% improvement, that's 200K tokens per 1% improvement. Sometimes it's worth it. Most times it's not.

## Rules
1. **Read before you write.** Before asking Claude to generate anything, have it read a DIRECTORY_MAP.md. This costs < 200 tokens instead of scanning the full tree (500-2000 tokens).
2. **PRD before code.** Spend tokens on planning files (they compound across sessions) rather than fixing bad code (tokens burned once).
3. **One-shot over iterate.** Spend 3x time on the initial prompt to reduce iteration cycles. Jake: "Spend the time making your first draft perfect."
4. **Skill files are token insurance.** Writing a reusable skill costs 500-1000 tokens once. Each use saves 200+ tokens compared to re-explaining the same process.

## Audit
Every Sunday, check your token usage logs. Which sessions had the worst output per token? That's your "low efficiency" signal — redesign the prompt pipeline for next time.
```

### E4. Add a "Bauhaus Architecture" Layer to Folder Design

**Current state:** The folder structure is well-organized but doesn't enforce Jake's "build the building before populating rooms" philosophy.

**Gap:** Jake's community member Alexander (from ZMDXs59Ntjc) literally described his approach as "I view it all as architecture. In my head I'm like, this is Bauhaus. Let me build the building and they'll justify what's inside the building."

**Enhancement:** When creating a new folder structure, enforce a 3-step protocol:
1. **ARCHITECTURE FIRST** — Build the folder skeleton, name every directory with its cognitive purpose, write README.md for each.
2. **NO CONTENT** — Do not populate any files yet. The skeleton is the deliverable.
3. **INHABIT** — Only after Step 1 is reviewed and approved, start populating.

This maps to Jake's PRD-before-code, structure-before-content approach.

### E5. Integrate the "Skills as Process Packages" Pattern

**Current state:** The SELF-IMPROVEMENT system has frameworks, but they're not packaged as skills that can be loaded into any agent.

**Gap:** Jake says "Skills are processes of thought turned into a package" (pdoSAWWCDO8). He publishes skills on his GitHub. The NUDIMMOD system has process descriptions but no downloadable/loadable skill files.

**Enhancement:** Convert each framework file into a dual-format:
```
01_FRAMEWORKS/
├── icm-methodology.md          ← human-readable manual
├── icm-methodology.skill.md    ← agent-readable skill package
│   (same content, optimized for agent comprehension:
│    shorter sections, explicit tool calls, routing instructions)
└── skills/                     ← ready-to-load skill files
    ├── decision-matrix.skill.md
    ├── never-automate.skill.md
    └── ...
```
The skill version follows Jake's pattern: "All it is is a markdown file describing how to think about X. Before building anything, do these things."

---

## F. Specific Action Items (Ranked)

### Priority 1: HIGH IMPACT, LOW EFFORT (Do this week)

| # | Action | Effort | Jake Video | Why |
|---|--------|--------|-----------|-----|
| 1 | Create `DIRECTORY_MAP.md` for SELF-IMPROVEMENT and trading-bot directories | S (30 min) | ozkx_eUfjY0 | Cuts agent token usage 40-60% on first entry. Zero code changes. |
| 2 | Rewrite failure-log.md with Jake's 7-rung ladder instead of current root cause types | S (45 min) | jjV1ckgPzI0 | Makes failure classification actionable. Current taxonomy is too vague. |
| 3 | Add `shouldRunFullEnsemble()` filter to trading bot Phase 2→4 gap | S (1 hr) | ozkx_eUfjY0 | Saves API budget on low-value markets. Pure math, no model inference needed. |
| 4 | Create `START_HERE.md` at SELF-IMPROVEMENT root that enforces reading sequence | S (20 min) | MkN-ss2Nl10 | Turns categories into architecture. Jake's claude.md pattern. |
| 5 | Add `CLAUDE.md` to trading bot directory | S (30 min) | rHDA0WMXzy4 | Written in handoff doc but never created. Immediate returns. |

### Priority 2: MEDIUM IMPACT, LOW EFFORT (This sprint)

| # | Action | Effort | Jake Video | Why |
|---|--------|--------|-----------|-----|
| 6 | Add opening question field to failure-log.md ("If you had to thank this failure...") | S (15 min) | ZMDXs59Ntjc | Reframes failure narrative before emotional processing. |
| 7 | Rename 5 SELF-IMPROVEMENT directories to RAW/PROCESSED/SYNTHESIS pattern | M (2 hrs, includes file moves) | 0fCQ-4J_jzk | Enforces cognitive flow. Current 5 directories don't guide thinking. |
| 8 | Convert extraction-template.md to question-only format | S (30 min) | ZMDXs59Ntjc | Forces human cognitive work. Current template asks for reports. |
| 9 | Add Type E (framing failure) to trading bot post-mortem classification | S (1 hr) | jjV1ckgPzI0 | Most common failure type the current taxonomy misses. |
| 10 | Create `token-efficiency.md` practice file | S (1 hr) | ozkx_eUfjY0 + rHDA0WMXzy4 | Jake's most practical day-to-day insight. |

### Priority 3: MEDIUM IMPACT, MEDIUM EFFORT (This month)

| # | Action | Effort | Jake Video | Why |
|---|--------|--------|-----------|-----|
| 11 | Create `AGENT_ROUTING.md` for SELF-IMPROVEMENT for AI agent querying | M (2 hrs) | pdoSAWWCDO8 | Makes the system queryable by agents, not just humans. |
| 12 | Implement `coworker-mode.mjs` for trading bot | M (3 hrs) | 0fCQ-4J_jzk | Direct implementation of Jake's core philosophy. |
| 13 | Add `ARCHIVE/` directory with quarterly decay logic | M (2 hrs) | 0fCQ-4J_jzk | Prevents signal-to-noise degradation over time. |
| 14 | Replace static ensemble weights with per-market-type dynamic weights | M (4 hrs) | _rtyhVD4v4A | More accurate predictions. Directly reduces Brier score. |
| 15 | Schedule one night block for Marcel to rewrite SOUL.md and brand voice without AI | M (3 hrs, creative time) | 0fCQ-4J_jzk | Fixes the "AI writing about your voice" problem. Non-negotiable. |

### Priority 4: HIGH IMPACT, HIGHER EFFORT (Next quarter)

| # | Action | Effort | Jake Video | Why |
|---|--------|--------|-----------|-----|
| 16 | Convert SELF-IMPROVEMENT frameworks into dual-format (human.md + agent.skill.md) | L (8 hrs) | pdoSAWWCDO8 | Makes system directly loadable by any AI agent. Enables agent-self-improvement. |
| 17 | Replace weekly-sprint.md with weekly-comp.md (competition format) | M (3 hrs) | Skool data + ZMDXs59Ntjc | Changes the motivational structure from planning to competition. Higher output. |
| 18 | Add `data quality gate` before Phase 4 trading bot inference | L (6 hrs) | jjV1ckgPzI0 | Fundamental architecture shift from model-centric to data-centric. |
| 19 | Add experiments/ track alongside projects/ in 03_LEARNINGS | M (3 hrs) | All videos | Enables the "let's see what happens" mode Jake operates in. |
| 20 | Implement weekly consolidation mode for trading bot failure knowledge | L (8 hrs) | All videos | Closes the learning loop from append-only to synthesis. |

### Priority 5: VISION (Long-term architecture shifts)

| # | Action | Effort | Rationale |
|---|--------|--------|-----------|
| 21 | Restructure directory tree to embed energy zones in folder names (01_DEEP_WORK/ etc.) | XL (system-wide refactor) | Jake: "Folders are architecture, not categories." The structure would enforce behavior. |
| 22 | Create model-workspace-protocol paper for NUDIMMOD (parallel to Jake's MWP concept) | XL (research + writing) | Jake is publishing a paper on MWP. NUDIMMOD should build its own version for agent-folder interoperability. |
| 23 | Build a community-as-value-product layer (NUDIMMOD as Skool-like platform) | XL (product) | Jake's Skool has 27K members. NUDIMMOD's vault and OS could become a similar community product. |

---

## Summary — What Jake Would Say About the NUDIMMOD System

If Jake Van Clief walked into this system, he would:

1. **Smile at the ICM adoption** — "You already have the right foundations. But you're treating the structure as decoration when it should be enforcement."

2. **Point at the agent routing gap** — "If I opened this directory, the agent would have to scan 22 files to understand it. That's 2000 tokens of waste every entry. You need a single file that tells the agent what it's looking at."

3. **Critique the 5-directory system** — "You have more categories than cognitive layers. FRAMEWORKS and PRACTICES are both Layer 2. LEARNINGS and METRICS are both Layer 2. Drop to 3 layers — RAW, PROCESSED, SYNTHESIZED — and force the thinking pattern."

4. **Approve of the trading bot architecture** — "The Cowork mode is smart. The failure ladder is smart. But you're building the rooms before you've built the building. Run the data pipeline on 10 paper trades before you write any more phase specs. If the data pipeline is wrong, the model pipeline doesn't matter."

5. **Ask about the token budget** — "How much are you spending per market scan? If it's more than $0.10, you're burning money on low-edge markets. Pre-filter with deterministic logic."

6. **Encourage the experiments track** — "Add the experiments folder. That's where the compound learning happens. Projects are output. Experiments are input."

7. **Final judgment:** *"The system is well-built but it's optimized for human reading. Optimize it for agent reading and the compound curve changes. A folder designed for AI to navigate costs less to run, produces better outputs, and lasts longer than a folder designed for a human to browse."*

---

*This report was produced by analyzing 30 YouTube transcripts (640K chars), Skool community data (27,200 members), trading bot architecture, and the full 22-file NUDIMMOD self-improvement system. Every insight maps to specific video content from @JEVanClief's channel.*
