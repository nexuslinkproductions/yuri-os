# Jake Van Klief → Trading Bot Architecture Mapping

**Created:** 2026-05-05
**Status:** No transcripts ingested yet — mapping derived from video titles (30 videos from @JEVanClief, channel content = AI/systems engineering, not trading)
**Bot Architecture Source:** `How_to_Build_an_AI-Powered_Prediction_Market_Trading_Bot_Using_Claude_Skills.docx`

---

## I. OVERVIEW: Jake Van Klief's Domain

Jake Van Clief (channel: @JEVanClief) produces AI/systems engineering content. His core themes:

| Theme | Description | Relevance to Trading Bot |
|-------|-------------|--------------------------|
| **Claude Skill Architecture** | Building modular, markdown-based skill folders for Claude | Directly maps to the 5-step skill-pipeline architecture |
| **Agent System Design** | When to use agents vs. folders vs. scripts | Informs bot architecture decisions at each step |
| **Memory Systems** | AI memory limitations, external knowledge bases | Critical for the Compound step (learning from trades) |
| **Failure Analysis** | "The Ladder That Explains Every AI Failure" — failure classification framework | Directly maps to Risk Management bot failures |
| **Human Judgment Scaling** | When and how to keep humans in the loop | Relevant to override/kill-switch design |
| **Pipeline Automation** | Multi-step automated workflows (scan→analyze→execute) | The bot IS a pipeline — Jake builds pipeline patterns |
| **AI Auditing** | Systematic evaluation of AI outputs | Maps to prediction calibration & post-mortem analysis |

**Critical finding:** Jake Van Klief's content contains **no direct trading content** — no ICT concepts, no market structure analysis, no order-flow psychology. His value to the bot project is entirely in **AI systems architecture patterns** that apply to building the bot infrastructure.

---

## II. MAP: Jake's Content → Bot Pipeline (5 Steps)

### Step 1: SCAN — Market Discovery, Liquidity Filtering, Anomaly Detection

| Jake Video/Concept | Bot Component | Mapping |
|---|---|---|
| *"I Used AI to Fix Government Contracting"* | Market discovery / scanning logic | Parallel pattern: scanning a large space for signal. Jake's approach to filtering government contracting opportunities maps to filtering prediction markets. |
| *"How One Line of Python Triggers 12,000 Lines of Code"* | Chain-of-execution architecture | Understanding how a single scan trigger fans out into the full pipeline. Maps to the scan agent's scheduling and trigger logic. |
| *"Becoming an AI Psychologist: A data Pipeline for Researchers"* | Pipeline design for data collection | Jake's method for setting up systematic data collection pipelines directly applies to the scan agent's market data harvesting. |
| *"Stop Building AI Agents. Use This Folder System Instead."* | Modularity of scan skills | **Most-viewed video (75K).** Jake's folder-based skill system is the exact architecture the bot uses — each step as its own markdown/script folder. The scan step should be a self-contained skill folder. |

**Jake's unique insight for Scan:**
He argues that AI agents are often overkill — a deterministic script with clear filters is more reliable. For the Scan step, this means: use deterministic code for liquidity/volume filtering, not LLM calls. Only escalate to AI inference for anomaly detection (which requires judgment).

---

### Step 2: RESEARCH — Multi-Source Scraping, Sentiment Analysis, Narrative Consensus

| Jake Video/Concept | Bot Component | Mapping |
|---|---|---|
| *"From Nazi Psychology to AI Auditing: Inside the System I Built"* | Systematic information quality assessment | Jake's auditing framework (evaluating source reliability, bias detection, cross-referencing) directly maps to evaluating news/sentiment sources for prediction markets. |
| *"How a 1953 Word Game Explains AI Memory"* | Context management for research agents | The game (likely ELIZA or Turing-derived) illustrates how AI systems lose context — critical for research agents that need to maintain thread coherence across multiple sources. |
| *"Claude Design – Vollständige Aufschlüsselung: GitHub-Importe, Skills und lokale Modellübergabe"* | Multi-model orchestration | Jake's detailed breakdown of Claude design patterns (GitHub integration, skill import/export, local model handoff) maps to the research step's need to orchestrate multiple scraping models. |
| *"Wie ich kreative, Software- und Geschäftsarbeit als ein System verwalte"* | Cross-domain information management | Jake's personal system for managing creative + software + business work as one system is a template for the research step's multi-source information architecture. |

**Jake's unique insight for Research:**
He emphasizes that AI memory is fundamentally limited and that you need an external knowledge structure (folders/files/embeddings) rather than relying on context window. For research: store scraped+processed data in structured files, not in the AI's context. Use retrieval from those files when needed.

---

### Step 3: PREDICT — Probability Calibration, Ensemble Models, Edge Calculation

| Jake Video/Concept | Bot Component | Mapping |
|---|---|---|
| *"The Ladder That Explains Every AI Failure (And How to Avoid Them)"* | Calibration and failure modes | While this video is about AI system failures, its failure classification framework can be adapted for prediction calibration failures. Every way an AI prediction fails maps to a way the bot's probability estimates can be wrong. |
| *"Du denkst, also bin ich: Die 400-jährige Geschichte der denkenden Maschinen"* | Probability reasoning foundations | The history of thinking machines (Descartes→Turing→modern AI) provides the philosophical grounding for how AI estimates probabilities — critical for understanding when the model's "reasoning" is trustworthy vs. hallucinated. |
| *"Afternoon Tea #1: Joe Fioramonti on Constellation, Dark Square, and Scaling Human Judgment"* | Scaling from human to model judgment | Joe Fioramonti's work on scaling human judgment (Constellation/Dark Square) directly maps to the challenge of calibrating AI predictions against market prices. The episode likely discusses how to combine human and machine probability estimates. |
| *"Watch Me Build Something Claude Code Can't Do Yet"* | Knowing model limitations | **Key insight:** Jake identifies what Claude can't do — this maps to knowing when the prediction model lacks sufficient context/capability to generate a reliable probability. |

**Jake's unique insight for Predict:**
His "Ladder of AI Failure" framework categorizes failures by root cause. For the bot, this should be adapted into a "Calibration Failure Ladder":
1. **Bad input data** → research step failed
2. **Wrong model applied** → using a general model for a domain-specific prediction
3. **Context contamination** → prompt injection from malicious research sources
4. **Overconfidence** → model predicts outside its calibrated range
5. **Temporal drift** → prediction made on stale information

---

### Step 4: RISK / EXECUTE — Kelly Criterion, Position Sizing, Kill Switch

| Jake Video/Concept | Bot Component | Mapping |
|---|---|---|
| *"The Ladder That Explains Every AI Failure"* | Bot failure modes → kill switch triggers | Direct adaptation: each rung of Jake's failure ladder becomes a condition that triggers the bot's kill switch. If the bot exhibits any of these failure patterns, halt execution. |
| *"The True Art of AI: Knowing What NOT to Automate"* | Human override architecture | Jake's most philosophical video. **Core insight:** The most important trading decisions may be the ones you DON'T let the bot make. Risk management should always have a human override path for edge cases. |
| *"Warum ich aufgehört habe, KI-Agenten zu entwickeln und stattdessen Claude Cowork genutzt habe"* | Bot architecture: agent vs. tool | Jake's transition from agents to "cowork" (AI as collaborator, not autonomous agent) maps to the bot's risk/execute step: the bot should execute trades with human supervision for large positions, not autonomously. |
| *"One of These AI Coding Tools Failed Completely"* | Identifying unreliable components | Jake's framework for identifying which AI tools fail and why maps to the bot's execution reliability — which API endpoints are flaky, which models give inconsistent results, which market conditions cause fill failures. |

**Jake's unique insight for Risk/Execute:**
Jake's "cowork" philosophy (AI as collaborator, not agent) is a major insight for bot architecture: **run in "co-pilot" mode by default.** The bot suggests trades, calculates Kelly sizing, flags markets — but a human must approve execution above a threshold (e.g., >$200). Full autonomy only after 100+ trades with verified calibration. This prevents the bot from blowing up during its early, uncalibrated phase.

Additionally, his view on automation limits ("knowing what not to automate") maps directly to: **never automate the kill switch.** The kill switch should be a manual file drop. The bot should never be able to override its own stop condition.

---

### Step 5: COMPOUND — Post-Mortem Analysis, Performance Tracking, Knowledge Base

| Jake Video/Concept | Bot Component | Mapping |
|---|---|---|
| *"How a 1953 Word Game Explains AI Memory"* | Knowledge base architecture | The 1953 word game (likely Shannon's work or the Turing test) demonstrates how AI memory is pattern-matching, not true recall. Maps to: don't assume your bot "remembers" lessons — you must explicitly write them to a knowledge base file. |
| *"The Ladder That Explains Every AI Failure"* | Failure classification taxonomy | Jake's ladder directly becomes the post-mortem classification system: categorize every losing trade by which rung of the failure ladder it belongs to. |
| *"Stop Building AI Agents. Use This Folder System Instead."* | Persistent knowledge structure | The folder-based system Jake advocates is the exact architecture for the bot's compound step: one folder per lesson type (calibration failures, execution failures, timing failures, external shocks), updated after each trade. |
| *"Wie ich kreative, Software- und Geschäftsarbeit als ein System verwalte (KI-Gedächtnis vs. mensch...)"* | Learning system design | Jake's personal system for managing multi-domain knowledge is a blueprint for how the bot should organize its learning across different market types and event categories. |

**Jake's unique insight for Compound:**
His central thesis across multiple videos: **"If you want AI to learn, don't rely on context window — build a file system."** For the bot:

```
failure-knowledge/
├── calibration/       # Model was wrong about probability
│   ├── overconfidence.md
│   └── underconfidence.md
├── execution/         # Fill failed or slippage
│   ├── slippage.md
│   └── api_failure.md
├── timing/            # Entered/exited at wrong time
│   ├── early_entry.md
│   └── late_exit.md
└── black-swan/        # External shocks (classified by type)
    ├── regulatory.md
    ├── news_event.md
    └── market_manipulation.md
```

Each trade's post-mortem appends to the relevant file. Before the Scan step runs each cycle, the bot reads the failure knowledge base to avoid repeating mistakes.

---

## III. JAKE'S CROSS-CUTTING FRAMEWORKS

### Framework 1: The Ladder of AI Failure

Jake's most applicable framework. The implied ladder (from his titles and AI content):

| Rung | Type | Bot Equivalent |
|------|------|----------------|
| 7 (Top) | **Wrong goal** | Bot trades for volume instead of edge |
| 6 | **Correct goal, wrong approach** | Using wrong prediction model for market type |
| 5 | **Right approach, bad execution** | Limit order not filling, API timeout |
| 4 | **Right execution, bad timing** | Entering too early before information is priced in |
| 3 | **Right timing, bad calibration** | Model says 80% but true probability is 55% |
| 2 | **Right calibration, bad risk mgmt** | Correct call but too large position (Kelly violation) |
| 1 (Bottom) | **All correct, black swan** | Unpredictable external event — accept and move on |

**Application:** Post-mortem classification for every losing trade. Track which rungs are most common for your bot. If you're consistently failing at rung 3 (calibration), improve your prediction models. If rung 4 (timing), improve your research step latency.

---

### Framework 2: Agent vs. Cowork Decision Matrix

Jake's evolution from "build AI agents" to "use Claude cowork" implies a decision framework:

| Bot Step | Best Mode | Rationale |
|----------|-----------|-----------|
| Scan | **Script** (deterministic) | LLMs unnecessary for volume/liquidity filters |
| Research | **Cowork** (AI + human selection) | AI gathers data, human selects which sources to trust |
| Predict | **Agent** (full autonomy) | Models need independent judgment, no bias |
| Risk | **Cowork** | AI calculates, human approves above threshold |
| Execute | **Script** (deterministic) | API calls should be deterministic code, not LLM |
| Compound | **Cowork + File system** | AI writes post-mortem, human reviews and confirms classification |

---

### Framework 3: The Memory = File System Principle

Most consistently repeated insight across Jake's content: **AI memory is unreliable. Write everything to files.**

| Bot Integration |
|-----------------|
| Before each scan → read `failure-knowledge/*.md` |
| After each trade → append to `failure-knowledge/` |
| Weekly → consolidate failure files, extract patterns |
| Monthly → generate performance report from trade log |

---

### Framework 4: The "What NOT to Automate" Principle

Jake's video on this topic implies a filter:

| Should NOT Automate | Why |
|---------------------|-----|
| Kill switch activation | Manual file drop only. Bot cannot override. |
| Market choice in new categories | Human selects first market in unfamiliar category |
| Kelly fraction adjustment | Human chooses conservative/conservative/aggressive mode |
| Post-mortem classification | AI drafts, human confirms the root cause |
| Scale-up decisions | Bot suggests, human approves bankroll increases |

---

## IV. GAPS: What the Bot Needs Beyond Jake's Content

| Gap | Severity | Source Needed |
|-----|----------|---------------|
| **ICT / Smart Money Concepts** | HIGH | Jake has no trading content. The bot needs external ICT material for market structure analysis (order blocks, liquidity zones, displacement). |
| **Market Structure Analysis** | HIGH | No supply/demand zone identification, no order flow analysis in Jake's content. |
| **Trading Psychology** | HIGH | Jake's psychology content is about AI psychology, not trader psychology (fear/greed/discipline). Bot needs trading-specific psychology material. |
| **Kelly Criterion Mathematics** | MEDIUM | Covered in the DOCX guide. Jake has no Kelly content. |
| **Platform API Details** | MEDIUM | Polymarket/Kalshi API details are in the DOCX guide. Jake's API content is about Claude Code API, not market APIs. |
| **Probability Calibration** | MEDIUM | Jake's failure ladder provides the framework but not the math (Brier Score, calibration curves). Need external stats material. |
| **Position Sizing Math** | MEDIUM | Covered in DOCX. Jake has no position sizing content. |
| **Slippage and Order Book Analysis** | MEDIUM | Only covered in the DOCX guide's Risk section. |
| **Multi-model Ensemble Methods** | LOW | Jake's Claude design videos touch on multi-model orchestration but not ensemble prediction mathematics. |

**Summary:** Jake Van Klief provides the **systems architecture DNA** for the bot — how to structure skills, manage memory, classify failures, and architect the pipeline. He provides **zero trading content.** The bot needs separate trading-specific resources for: market structure analysis, probability calibration, position sizing, and trading psychology.

---

## V. ACTIONABLE RECOMMENDATIONS

### From Jake's Content (Implement Now)

1. **Folder-based skill architecture** → Already in the DOCX guide. Double down on Jake's approach: each step gets its own `SKILL.md` folder with deterministic scripts where possible.
2. **Failure ladder as post-mortem taxonomy** → Implement immediately in the Compound step. Classify every losing trade by Jake's 7-rung ladder.
3. **Cowork mode for risk step** → Run bot in semi-autonomous mode until 100+ trades verified. Require human approval for positions >$200.
4. **File system memory** → Replace any in-context memory with `failure-knowledge/*.md` files. The bot reads them at startup, appends after each trade.
5. **Know when NOT to automate** → Hard-code the kill switch as a manual operation. Never let the bot bypass its own stop.

### For External Acquisition (Priority Order)

1. **ICT trading content** (Smart Money Concepts, liquidity sweeps, order blocks) — for the Scan step's market structure intelligence
2. **Trading psychology material** (Mark Douglas, trading discipline) — for risk management psychology checks
3. **Statistical calibration guides** (Brier Score, probability calibration curves) — for the Predict step
4. **Kelly Criterion deep dives** (fractional Kelly, optimal f, risk of ruin) — for the Risk step
5. **Order flow and tape reading** — for execution timing optimization

---

## VI. VIDEO-TO-COMPONENT REFERENCE TABLE

| Video ID | Title | Primary Bot Component | Secondary |
|----------|-------|----------------------|-----------|
| MkN-ss2Nl10 | Stop Building AI Agents. Use This Folder System Instead. | **Architecture (All)** | Compound |
| SjlCJIU9ODs | The Ladder That Explains Every AI Failure | **Risk / Compound** | Predict |
| ZMDXs59Ntjc | Die wahre Kunst der KI: Zu wissen, was man nicht automatisieren sollte | **Risk** | All |
| 0fCQ-4J_jzk | Warum ich aufgehört habe, KI-Agenten zu entwickeln und stattdessen Claude Cowork genutzt habe | **Risk / Execute** | Architecture |
| S3fXSc5z2n4 | How a 1953 Word Game Explains AI Memory | **Compound** | Research |
| 5B6W2OGfxq0 | How One Line of Python Triggers 12,000 Lines of Code | **Scan** | Architecture |
| pdoSAWWCDO8 | Claude Design – Vollständige Aufschlüsselung | **Research / Architecture** | All |
| Wtf6E-fwuwI | Becoming an AI Psychologist: A data Pipeline for Researchers | **Scan / Research** | Compound |
| UGyTimVObus | From Nazi Psychology to AI Auditing | **Research** | Risk |
| I-enT6szVQQ | I Used AI to Fix Government Contracting | **Scan** | Research |
| hALln9wrrQo | Wie ich kreative, Software- und Geschäftsarbeit als ein System verwalte | **Compound / Memory** | All |
| 6hF2K4YGZbY | Afternoon Tea #1: Joe Fioramonti on Constellation, Dark Square | **Predict** | Risk |
| KC0VEZuo4OI | Watch Me Build Something Claude Code Can't Do Yet | **Predict** | Risk |
| _rtyhVD4v4A | One of These AI Coding Tools Failed Completely | **Risk / Execute** | Architecture |

---

## VII. MAPPING SUMMARY

```
Jake Van Klief Content
        │
        ├── Skill/Folder Architecture ─────────────→ Bot Pipeline Structure (All 5 Steps)
        ├── Failure Ladder Framework ──────────────→ Post-Mortem Classification (Compound)
        │                                             + Kill Switch Triggers (Risk)
        ├── Agent vs. Cowork Philosophy ───────────→ Execution Mode Selection (Risk/Execute)
        ├── Memory = File System Principle ────────→ Knowledge Base Design (Compound)
        ├── "What NOT to Automate" ────────────────→ Manual Override Architecture (Risk)
        ├── AI Auditing Framework ─────────────────→ Research Quality Control (Research)
        ├── Multi-Model Orchestration ─────────────→ Ensemble Prediction Design (Predict)
        └── Pipeline Automation Patterns ──────────→ Scan → Research Chain (Scan)
        
        ⚠ GAPS (Jake has none of these):
        ├── ICT / Market Structure ────────────────→ Scan intelligence (EXTERNAL NEEDED)
        ├── Trading Psychology ────────────────────→ Risk management (EXTERNAL NEEDED)
        ├── Probability Calibration Math ──────────→ Predict (EXTERNAL NEEDED)
        └── Kelly Criterion / Position Sizing ─────→ Risk (IN DOCX GUIDE)
```

---

*This mapping will be updated when transcripts are extracted and analyzed via `03-analyze-content.mjs`.*
