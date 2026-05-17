# Anime DNA Lens Analysis
## Jake Van Clief Deep Extraction × 5 Superpower Filters

**Date:** 2026-05-06  
**Method:** Each of 23 improvements from the deep extraction report is analyzed through 5 Anime DNA Superpower lenses, plus the Sharingan protocol for derivation tracking.

---

## Preamble: The Lenses

| Lens | Skill File | Origin | Core Question |
|------|-----------|--------|---------------|
| **Pattern Mirror** | `pattern-mirror-core/SKILL.md` | Sharingan / Copy Technique | What pattern did Jake use that we can extract? |
| **Domain Core** | `execution-domain-core/SKILL.md` | Domain Expansion | What is the exact scope? What should NOT change? |
| **Infinity Guard** | `non-destructive-infinity-guard/SKILL.md` | Limitless / Infinity | What could go wrong? What guardrails? |
| **Clone Orchestrator** | `parallel-clone-orchestrator/SKILL.md` | Shadow Clone Jutsu | How to parallelize? Optimal agent assignment? |
| **Failure Evolution** | `failure-evolution-loop/SKILL.md` | Zenkai / Saiyan Power | How to measure success? What would failure look like? |

**Sharingan derivation traces each improvement back to its source in Jake's content,** noting what was extracted as technique (not property) per the Sharingan prime directive: *"Extract the pattern, not the property."*

---

## Improvement 1: Create DIRECTORY_MAP.md for Key Directories
*Source: C4 (Stop Asking Model to Describe System; Have It Read a File)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake discovered that when an AI agent enters a directory without a map, it scans the full file tree — burning 500-2000 tokens every time. His solution: a single `.md` summary file that describes the folder structure to the AI, so the AI doesn't scan.

**Weakness revealed in our approach:** Every agent entering the trading bot or SELF-IMPROVEMENT directories reads the full tree. No routing shortcut exists. Per the Pattern Mirror core skill's decomposition step: the artifact (our directory) has a clear structure but no "provenance capture" — nothing tells an incoming agent what it's looking at without expending tokens.

**Sharingan derivation:** Jake's technique (from `ozkx_eUfjY0` and `pdoSAWWCDO8`) is *data-first, scan-later*. The pattern is: create a token-efficient entry point before the agent enters. We are not copying his file structure — we're copying the *principle* of pre-baked agent routing.

### Domain Core Lens
**Scope:** Create a single `DIRECTORY_MAP.md` file per key directory (trading bot, SELF-IMPROVEMENT). Flat list of files with one-line purposes. Subdirectory descriptions max 2 lines.

**In bounds:** File creation only. Flat listing of existing files. Cross-reference links to related directories.

**Out of bounds:** No directory restructuring. No file renames. No content changes to existing files. No architectural changes. No agent behavior changes.

**Boundary clarity per Domain Core:** "a bounded task environment with explicit rules, allowed tools, target files, risk limits." The boundary here is file-creation-only. No mutations to existing content.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Stale DIRECTORY_MAP.md after files are added/removed (signal degradation)
- Agent reads DIRECTORY_MAP.md INSTEAD of scanning, missing new files
- Map becomes more trusted than the actual tree (false confidence)

**Guardrails needed:**
- Add a "Last verified" date field at the top
- Include an auto-generated section: `# Auto-detected files not in this map`
- Non-destructive default: create the file in stage-only mode first, verify it's accurate, then activate
- Rollback plan: delete the DIRECTORY_MAP.md if it causes any agent to miss files

**Per Infinity Guard:** "Produce a rollback plan for any proposed mutation. Route high-risk actions through non-destructive-infinity-guard." This is LOW risk, so the rollback plan is simple: delete the file.

### Clone Orchestrator Lens
**Should this be parallelized?** PARTIALLY.

**Optimal breakdown:**
- Clone A: Create DIRECTORY_MAP.md for trading-bot directory (has clear file structure)
- Clone B: Create DIRECTORY_MAP.md for SELF-IMPROVEMENT directory (22 files, 5 dirs)
- Both clones work independently, no shared state needed
- Merge: combine into one report, verify no files are missing from either map

**Per Clone Orchestrator:** "Split complex work into specialized sub-agents with bounded budgets, clear output contracts." Each map is independent — perfect clone task.

### Failure Evolution Lens
**Success criteria:**
- Agent entering directory with map reads it first (verify via token log reduction)
- Time-to-first-useful-output drops by measurable amount (track 3 sessions before/after)
- No agent misses files that the map doesn't list

**Failure mode:** Agent ignores the map and scans tree anyway — fix: rename to `CLAUDE.md` as standard agent entry point name. Jake says Claude looks for `CLAUDE.md` first.

**Per Failure Evolution:** "Convert real failures and weak outputs into structured improvement without rewarding avoidable damage." If the map degrades, the fix is a periodic auto-verification script, not abandoning the pattern.

---

## Improvement 2: Rewrite failure-log.md with Jake's 7-Rung Ladder
*Source: B3 (Failure Taxonomy Mismatch)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's "Ladder of AI Failure" (from `jjV1ckgPzI0`) has 7 rungs: Wrong goal → Wrong approach → Bad execution → Bad timing → Bad calibration → Bad risk management → Black swan. Each rung is a *specific failure vector*, not an emotional category.

**Weakness revealed:** Our failure-log.md uses 6 root cause types: knowledge-gap, assumption, haste, emotion, external, other. These are too vague. "Assumption" could mean any of rungs 2-5. "Emotion" is upstream of the failure, not the type itself. Jake's ladder is more actionable because each rung points to a specific *prevention strategy*.

**Sharingan derivation:** We are not copying Jake's ladder structure (that's property-level). We are extracting the *technique* of hierarchical failure classification where each rung maps to a specific prevention action. Our 6 types are fuzzy; his 7 rungs are deterministic.

### Domain Core Lens
**Scope:** Replace the root cause taxonomy in `failure-log.md` (the dropdown/list of root cause types). Add a mapping from each rung to a prevention strategy.

**In bounds:** Change the classification field in failure-log.md. Add rung-to-prevention mapping as a reference table.

**Out of bounds:** No changes to failure-log.md's structure (preserve the date, session, narrative fields). No changes to other files. No new files. No deletion of existing root cause data.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Existing failures classified under old taxonomy become unsearchable
- Users resist learning 7 rungs vs 6 categories (adoption friction)
- Rung mapping is subjective — two people classify same failure differently

**Guardrails needed:**
- Phase the migration: keep old taxonomy as secondary tag for 30 days
- Add a `confidence_in_rung` [1-5] field to surface ambiguity
- Create a quick-reference card in the template header
- Non-destructive path: add Jake's ladder AS A SECONDARY classification, keep old types

**Reversibility check:** Reverting the taxonomy means editing one file. If the rungs cause confusion, revert to old types in 30 minutes.

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file change, sequential.

**Alternative decomposition:**
- Clone A: Create the rung-to-prevention mapping table (research from Jake's ladder content)
- Clone B: Migrate 3 most recent failure-log entries to new format (validation)
- Sequential: A must complete before B can work

### Failure Evolution Lens
**Success criteria:**
- 3 new failures classified with rungs in first week
- Each classification is unambiguous (no "I don't know which rung" notes)
- Prevention strategy is derivable from the rung (verify: does rung 3→"wrong approach" → "try different approach" follow logically?)

**Failure mode:** Users skip rung field because it's confusing — fix: simplify to "1-7 number picker" with rung names as hover text.

---

## Improvement 3: Add shouldRunFullEnsemble() Filter
*Source: D4 (Token Budget Control)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake develops market scanning systems for government contracts — you pre-filter with deterministic logic, then only run expensive models on candidates that pass. His principle: "Phase 2 should already filter to < 10% of scanned markets."

**Weakness revealed:** Our Phase 4 runs 5 models with full evidence packets on every market. No pre-filter. Every market burns the same token budget regardless of edge potential. The pattern we're missing is: *use cheap deterministic logic before expensive probabilistic inference*.

**Sharingan derivation:** The technique is a *tiered computation pipeline*. The surface behavior (pre-filter) is common, but the specific insight — that Phase 2 should filter to <10% of markets — is the valuable pattern. We need our own threshold values derived from our own data.

### Domain Core Lens
**Scope:** Add a `shouldRunFullEnsemble()` function in the Phase 2→3 handoff. Pure JavaScript, no model calls. Filters on volume, liquidity, time-to-close, edge potential.

**In bounds:** New function only. Existing Phase 2 and Phase 4 code untouched.

**Out of bounds:** No changes to Phase 4 code. No changes to evidence collection (Phase 3). No model weight changes. No new API calls.

### Infinity Guard Lens
**Risk classification:** LOW to MEDIUM

**What could go wrong:**
- Filter is too aggressive → misses high-edge markets that don't meet surface criteria (e.g., low volume but extremely high edge)
- Thresholds are wrong → filtering out 50% of profitable markets
- Edge potential estimation is inaccurate → garbage threshold

**Guardrails needed:**
- Log all filtered markets (with their features) to a review file
- Start with conservative thresholds: filter <5% in week 1, increase only after manual review confirms misses were correct
- Add an override: if edge potential estimate is > 10% despite low volume, still run full ensemble
- Rollback: comment out the filter call, restore old behavior

**Non-destructive path:** Add `shouldRunFullEnsemble()` but always return `true` initially. Log what it WOULD have filtered. Review after 50 markets. Then activate.

### Clone Orchestrator Lens
**Should this be parallelized?** PARTIALLY.

- Clone A: Write the filter function (pure logic, no dependencies)
- Clone B: Research and suggest threshold values by analyzing 50 historical markets
- Merge: Clone A's function with Clone B's thresholds

### Failure Evolution Lens
**Success criteria:**
- Token cost per market drops by at least 30% (measure before/after)
- Precision of filtered-out markets is > the edge threshold (verify no profitable markets were filtered)
- False positive rate (markets filtered that shouldn't have been) < 1%

**Failure scenario:** Filter catches too few markets to matter → tighten thresholds. Filter catches too many profitable markets → loosen thresholds or improve edge estimation. Each failure produces a specific threshold adjustment — the "Zenkai" is tuned thresholds, not a new filter design.

---

## Improvement 4: Create START_HERE.md at SELF-IMPROVEMENT Root
*Source: B1 (Category Drift in 22-File System)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's `claude.md` pattern is not just a file — it's an *entry protocol*. It says: "read this first, then this, then this." Categories sort things; architecture routes thinking through a designed sequence.

**Weakness revealed:** Our 22 files have categories (FRAMEWORKS, PRACTICES, LEARNINGS, METRICS, VISION) but no enforced sequence. A user lands in any file and reads it in any order. The system doesn't guide cognitive flow.

**Sharingan derivation:** The technique is *sequential cognitive routing*. Jake's claude.md for agents = our START_HERE.md for humans. Same pattern, different reader.

### Domain Core Lens
**Scope:** Create one file at `_SYSTEM/SELF-IMPROVEMENT/START_HERE.md`. Defines a guided reading sequence with directional arrows.

**In bounds:** Single file creation. Links to existing directories. 3-5 step sequence.

**Out of bounds:** No changes to existing files or directories. No new directories. No changes to agent behavior. No routing files outside SELF-IMPROVEMENT.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Users skip START_HERE.md (adoption problem — fix: add a brief reference in every file's footer)
- Sequence becomes wrong as system evolves (stale map problem — fix: quarterly review)
- Users feel constrained by the sequence (fix: add "or read in any order" note)

**Non-destructive path:** File creation only. No existing files touched. Rollback = delete the file.

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file, 20 minutes.

**If it were larger:** The reading sequence could be generated by having one clone analyze the 22 files for dependencies (what must be read first to understand X) and another clone order them by reading time.

### Failure Evolution Lens
**Success criteria:**
- 3 users (including self) can follow the sequence and reach "I understand the system" in < 15 minutes
- Exit rate from SELF-IMPROVEMENT drops (people don't leave confused)
- Agent enters directory and reads START_HERE.md first (verify via behavior)

**Failure mode:** Users still browse randomly — fix: add mandatory reading time counter or "you haven't read START_HERE.md" warnings.

---

## Improvement 5: Add CLAUDE.md to Trading Bot Directory
*Source: C2 (Claude.md Router)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "Every folder needs a Claude.md that tells the agent what it's looking at and where to go." This is a routing file, not a documentation file. It's for the *agent*, not the *human*.

**Weakness revealed:** The trading bot directory has no agent entry point. Every time an agent enters, it must discover the structure from scratch. The handoff doc explicitly says "Create .claude/trading-bot/CLAUDE.md" — but it was never created.

**Sharingan derivation:** CLAUDE.md is a standard Claude Code feature (auto-discovered). But Jake's specific pattern is: *write it for agent consumption first, human second*. Different structure, shorter sentences, explicit "when you are asked about X → read Y" routing.

### Domain Core Lens
**Scope:** Create `.claude/trading-bot/CLAUDE.md`. Contains routing table, key principles, file locations.

**In bounds:** Single file creation. Reference to existing specs, schemas, logs.

**Out of bounds:** No changes to trading bot code. No new directories. No changes to existing CLAUDE.md files elsewhere in the system.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Agent follows stale routing (if files move but CLAUDE.md isn't updated)
- CLAUDE.md conflicts with DIRECTORY_MAP.md (two entry points causing confusion)

**Guardrail:** Keep CLAUDE.md as the *primary* entry point (Claude auto-reads it). DIRECTORY_MAP.md is a fallback for manual inspection. Standardize: CLAUDE.md for agents, DIRECTORY_MAP.md for humans.

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file.

**If decomposed:** Clone A maps all trading bot files/directories. Clone B writes the routing table. Clone C writes the key principles section. Merge into one file.

### Failure Evolution Lens
**Success criteria:**
- Agent enters trading bot directory and reads < 300 tokens to understand structure (was 2000+)
- Agent answers "where is X?" correctly without scanning
- Token usage on first entry drops by 40-60%

**Failure mode:** Agent ignores CLAUDE.md — fix: this is a Claude behavior issue, not a file issue. Possibly need to reference CLAUDE.md from the prompt or use a `.claude` configuration.

---

## Improvement 6: Add Opening Question Field to failure-log.md
*Source: A3 (Question Prompts over Answer Prompts)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "In a world full of answers, questions become valuable." Jake's prompts are designed as questions that make the *human* think, not as instructions to produce output. The reframe is more valuable than the answer.

**Weakness revealed:** Our failure-log.md starts with "What I tried" and "What happened" — declarative statement templates. They ask for a report. Jake would redesign them as questions that force cognitive work *before* the narrative takes over: "If you could relive this session, what one thing would you do differently?"

**Sharingan derivation:** Jake's technique is *question-first cognitive forcing* — ask the reframe question before the emotional narrative solidifies. This is distinct from "prompt engineering" (optimizing model output). This optimizes *human thinking*.

### Domain Core Lens
**Scope:** Add one mandatory opening question field to failure-log.md. The specific question: "If you had to thank this failure for teaching you something, what would it be?"

**In bounds:** One field addition to one file. The question text.

**Out of bounds:** No changes to other fields. No changes to other files. No removal of existing fields. No change to the template format.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Question feels forced / performative (user writes "idk" → negative experience)
- Question distracts from genuine failure analysis (user writes answer but skips real reflection)
- Adding ANY field increases friction → fewer entries overall

**Guardrails:**
- Make the field optional on first use (add a note: "Try this once. If it doesn't work, skip it.")
- Keep ALL existing fields unchanged — this is additive only
- Non-destructive path: single field addition, reversible in 2 minutes

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single field, trivial.

### Failure Evolution Lens
**Success criteria:**
- 3 consecutive failure-log entries have meaningful answers to the opening question (not "idk" or blank)
- User reports that the question changed how they approached the entry

**Failure mode:** Question is consistently skipped or answered with "N/A" → remove it, try a different question. The *technique* (question-first framing) is sound — the specific question may need tuning.

---

## Improvement 7: Rename SELF-IMPROVEMENT Directories to RAW/PROCESSED/SYNTHESIS
*Source: A2 (3-Layer Folder Architecture)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's ICM is organized into three cognitive layers: RAW (inbox/capture, timestamped), PROCESSED (structured, retrievable in < 2 min), SYNTHESIZED (cross-domain patterns). The *names enforce the thinking pattern*.

**Weakness revealed:** Our 5 directories (FRAMEWORKS, PRACTICES, LEARNINGS, METRICS, VISION) don't enforce cognitive flow. FRAMEWORKS and PRACTICES are both Layer 2. LEARNINGS and METRICS are both Layer 2. The 5 categories don't guide which mode of thought to use.

**Sharingan derivation:** The technique is *cognitive-environment design* — directory names act as psychological primes. "RAW" says "dump, don't structure." "PROCESSED" says "organize." "SYNTHESIS" says "connect." Our names describe content; Jake's names describe *cognitive operations*.

### Domain Core Lens
**Scope:** Rename 5 directories under SELF-IMPROVEMENT. Move file contents between directories as needed. Update all cross-references.

**In bounds:** Directory renames. File moves (e.g., METRICS content into PROCESSED/metrics/). Cross-reference updates. README updates.

**Out of bounds:** No content changes to individual files (preserve all content). No new files. No deletions. No changes outside SELF-IMPROVEMENT.

### Infinity Guard Lens
**Risk classification:** HIGH (per the guard — this touches many files and cross-references)

**What could go wrong:**
- Broken cross-reference links (files reference old directory paths)
- File moves lose git history (use `git mv` not `mv`)
- Cognitive friction from renaming (users have re-learned locations)
- External links/bookmarks to old paths break

**Guardrails:**
- Use `git mv` for all moves (preserves history)
- Create symlinks from old names to new names for 30 days (e.g., `02_PRACTICES -> 02_RAW_CAPTURE`)
- Run a cross-reference scanner before/after to catch broken links
- Update DIRECTORY_MAP.md and CLAUDE.md simultaneously
- Rollback plan: `git revert` the commit sequence

**Non-destructive path:** Keep old directory structure AS IS and create a NEW parallel structure with symlinks. Verify all flows work on the new structure before removing old.

### Clone Orchestrator Lens
**Should this be parallelized?** YES — this is a textbook clone task.

**Clone assignments:**
- Clone A: Map all cross-references (find every file that links to old paths)
- Clone B: Execute `git mv` operations in dry-run mode
- Clone C: Update DIRECTORY_MAP.md and CLAUDE.md
- Clone D: Create symlinks from old→new
- Orchestrator: Review and approve the full plan before any clone executes mutations

**Per Clone Orchestrator:** "Budget allocation" — this is a medium-effort task (2 hrs). Give each clone 30 min budget.

### Failure Evolution Lens
**Success criteria:**
- All cross-references updated (scanner finds 0 broken links)
- 3 sessions of normal system use with no "file not found" errors
- User reports the structure "feels more natural" after 1 week

**Failure mode:** Broken links persist → `git revert` the rename, document which links were missed, try again with the fix. The learning is in the cross-reference scanning pattern, not in the directory names themselves.

---

## Improvement 8: Convert extraction-template.md to Question-Only Format
*Source: C1 (Stop Writing Templates as Procedures)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "These aren't prompts, they're structured answers. You're filling in the blank when you should be asking the question." An empty template asks for a report; a question sequence asks for discovery.

**Weakness revealed:** Our extraction-template.md asks "What I tried" / "What happened instead" — declarative placeholders. This produces narrative reports, not insight. A sequence of questions produces *discovery*.

**Sharingan derivation:** The technique is *question-chaining* — each question's answer creates the context for the next question. Unlike a form (parallel fields filled independently), a question chain is sequential — you can't answer question 5 without having answered question 1. The constraint produces better thinking.

### Domain Core Lens
**Scope:** Rewrite extraction-template.md. Remove all placeholders ("What I tried: ___"). Replace with question-only format ("What question would your last breakthrough answer?"). Add sequential framing.

**In bounds:** Full rewrite of extraction-template.md file. Add the "Start with one question" framing.

**Out of bounds:** No changes to other templates. No changes to file names or locations.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Users hate the change (too abstract, too slow, too philosophical)
- Loss of structure reduces completion rate (people don't fill in question-only templates)
- Questions are too broad → answers are unfocused

**Guardrails:**
- Keep ONE copy of old template as `extraction-template.old.md` for 30 days
- Add a shorter "quick mode" with 3 questions (vs 7-10 question deep dive)
- Provide example answers for the first 3 questions
- Non-destructive: rename old file to `.old`, create new file. Revert = swap names.

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file rewrite.

**If decomposed:** Clone A writes the question chain (deep work). Clone B writes the "quick mode" abridged version. Clone C reads the old template and extracts implicit categories that must be addressed in question form.

### Failure Evolution Lens
**Success criteria:**
- User fills in 2 extraction entries with new format
- Each answer is substantive (> 2 sentences, shows reflection)
- User reports the question format was "helpful" or "interesting"

**Failure mode:** User reverts to old template — fix: shorten the question count, add more specific questions. The technique (question-chaining) is sound — the specific questions need tuning.

---

## Improvement 9: Add Type E (Framing Failure) to Trading Bot
*Source: D3 (Edge Case Failure Taxonomy)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "Every AI failure framework I've seen misses the most common failure: the model was given the right data, picked the right model, calibrated correctly, but the question itself was wrong."

**Weakness revealed:** Our trading bot post-mortem has 4 types (prediction, timing, execution, external shock). None covers *framing* — the bot predicted the right answer to the wrong question. Jake says this is the most common failure type.

**Sharingan derivation:** The technique is *meta-failure classification* — looking one level up from the answer to the question itself. The specific Type E classification is property-level (Jake's framework); the pattern of having a "question-is-wrong" category is what we adopt.

### Domain Core Lens
**Scope:** Add Type E (framing failure) to `classifyTradeOutcome()`. Add detection logic. Update failure taxonomy docs.

**In bounds:** One new case in the classifier. Detection criteria in comments. Documentation update.

**Out of bounds:** No changes to existing Type A-D logic. No changes to post-mortem format or compound step.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Over-classification of Type E (every ambiguous outcome is "framing failure" — data loss)
- Detection criteria are too vague (can't consistently identify framing failures)
- Type E doesn't interact well with existing learning compound (compound step doesn't know how to process it)

**Guardrails:**
- Require BOTH of: (1) model confidence > 70% on wrong outcome AND (2) evidence clearly supported the wrong question
- Type E → "learning" severity only (never "critical" or "fatal")
- Log the specific question-answer mismatch for review

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single function addition.

**If decomposed:** Clone A writes detection logic. Clone B reviews 10 historical trade outcomes and classifies any as Type E (validates detection criteria work).

### Failure Evolution Lens
**Success criteria:**
- 2-3 trades classified as Type E in first 50 trades (any fewer means criteria are too strict)
- Each Type E classification has clear evidence of question-answer mismatch
- Compound step processes Type E entries without errors

**Failure mode:** Zero Type E classifications → detection criteria are too strict or framing failures truly don't happen (unlikely). Adjust criteria.

---

## Improvement 10: Create token-efficiency.md Practice File
*Source: E3 (Token Efficiency Practice)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "I'm able to keep my token usage so down because I'm spending so much time on my initial prompts." Jake discusses token efficiency in every other video — it's his most practical daily insight.

**Weakness revealed:** The self-improvement system has no file addressing token management. For a system that burns tokens on every agent interaction (model calls, file scans, routing), this is a significant gap.

**Sharingan derivation:** The technique is *token-value calculus* — every token spent should have expected value. DIRECTORY_MAP.md saves tokens per entry. PRD-first saves tokens by reducing iterations. Skill files are token insurance (invest once, save repeatedly). The specific practice file structure is ours; the calculus principle is Jake's.

### Domain Core Lens
**Scope:** Create `02_PRACTICES/token-efficiency.md` with principles, rules, and a weekly audit template.

**In bounds:** Single file creation in existing directory.

**Out of bounds:** No changes to other files. No automation or scripts. No changes to agent routing behavior.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Token optimization becomes an obsession (optimizing token count over output quality)
- "Spend 3x time on initial prompt" rule slows down rapid prototyping
- Token audit becomes another administrative burden

**Guardrails:**
- Frame token efficiency as a *constraint*, not an *optimization target*
- "Read before you write" is a default, not a mandatory rule
- Weekly audit takes < 5 minutes

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file, creative/opinion work.

### Failure Evolution Lens
**Success criteria:**
- Token usage per agent entry drops after implementing the rules
- User reports at least one "aha" moment from the principles
- File is referenced in at least one other practice (cross-pollination)

**Failure mode:** File is created but never read — fix: link to it from the MAIN PROMPT and routing files. If it's invisible, it's useless.

---

## Improvement 11: Create AGENT_ROUTING.md for Self-Improvement
*Source: B2 (No Query Interface)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's core principle: "If you want AI to learn, build a file system." The SELF-IMPROVEMENT system is built for human reading, not agent reading. No file tells an AI: "When someone asks about failures, read this file first."

**Weakness revealed:** The 22 files are organized for human browsing. An agent querying "what's failing" has to search all files. No routing table exists for agent queries.

**Sharingan derivation:** The technique is *query-to-file routing* — a single file that maps agent queries to specific source files. This is different from CLAUDE.md (which routes on directory entry) and DIRECTORY_MAP.md (which routes on file location). AGENT_ROUTING.md routes on *semantic query*.

### Domain Core Lens
**Scope:** Create `_SYSTEM/SELF-IMPROVEMENT/AGENT_ROUTING.md`. Maps query types to specific files.

**In bounds:** Single file creation in SELF-IMPROVEMENT. Routing table with 8-12 query mappings.

**Out of bounds:** No changes to agent prompts or CLAUDE.md. No automation.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Stale routing (files move, routing doesn't update)
- Query-to-file mapping is too specific (agent can't find what it needs if query phrasing differs)

**Guardrails:**
- Use broad query categories ("failures / failures + patterns") not exact phrases
- Add "default: read START_HERE.md first" as fallback
- Quarterly review of routing accuracy

### Clone Orchestrator Lens
**Should this be parallelized?** PARTIALLY.

- Clone A: Analyze 22 files and extract their native query domains
- Clone B: Write the routing table from Clone A's output
- Sequential: A must complete before B

### Failure Evolution Lens
**Success criteria:**
- Agent can answer "what are our top 3 failure patterns?" by reading 2 files (was scanning all 22)
- Time-to-answer drops by measurable amount

**Failure mode:** Agent doesn't use the routing file — fix: reference AGENT_ROUTING.md from the CLAUDE.md or DIRECTORY_MAP.md. Create a chain: START_HERE.md → DIRECTORY_MAP.md → AGENT_ROUTING.md.

---

## Improvement 12: Implement coworker-mode.mjs
*Source: C5 (Cowork Mode for Trading Bot)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Most trading decisions should be COWORKER mode — AI calculates and suggests, human approves above a threshold. Full automation only after 100+ verified trades. This is the direct implementation of Jake's "what not to automate" philosophy.

**Weakness revealed:** The trading bot has an Agent/Coworker decision matrix in the self-improvement system, but the bot itself has no corresponding code mode. The philosophy exists but the implementation doesn't.

**Sharingan derivation:** The technique is *graduated autonomy with thresholds* — the bot has full autonomy below a threshold and switches to advisory mode above it. The specific threshold values are ours to determine based on our risk tolerance, not Jake's.

### Domain Core Lens
**Scope:** Create `Scripts/trading-bot/coworker-mode.mjs`. Export `isCoworkerMode()` and `generateCoworkerBrief()`.

**In bounds:** Single file creation in Scripts/trading-bot/. Pure functions only (no side effects).

**Out of bounds:** No changes to existing trading bot files. No changes to risk engine, Phase 4, Phase 5. No integration yet (integration is a separate task).

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Thresholds are wrong — auto-approves when it shouldn't (financial risk)
- Thresholds are too conservative — never enters full automation (wasted potential)
- Coworker brief is too long (human can't review in time window)
- Deadline for human response causes missed trades

**Guardrails:**
- Start with EVERYTHING in coworker mode (no full automation) for 100 trades
- Kelly size threshold starts at $25 (not $50) — conservative first
- Coworker brief must fit in a single terminal window (< 25 lines)
- 30-second auto-reject, not auto-approve (fail safe)
- Add a "whitelist" of fully automated markets after 20 consecutive correct predictions

**Rollback plan:** Comment out the coworker module import from Phase 5. Single-line revert.

### Clone Orchestrator Lens
**Should this be parallelized?** YES — pure code, clear interface.

- Clone A: Write `isCoworkerMode()` with configurable thresholds
- Clone B: Write `generateCoworkerBrief()` with structured output
- Clone C: Write tests for both functions
- Orchestrator: Review interface contracts, merge, verify tests pass

### Failure Evolution Lens
**Success criteria:**
- 50 trades running in coworker mode
- Human response rate > 70% (human is actually reviewing)
- Human override rate < 20% (AI suggestions are generally correct)
- After 100 trades, at least 1 market qualifies for full automation

**Failure mode:** Human ignores coworker briefs entirely → reduce frequency or switch to full agent. Human overrides every suggestion → thresholds are wrong or model accuracy is too low.

---

## Improvement 13: Add ARCHIVE/ Directory with Quarterly Decay
*Source: B5 (Processed Layer Decay Logic)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "Anything that stays in RAW > 7 days is either DONE or LOST." But Jake's logic applies to processed content too — old learnings accumulate, degrading signal-to-noise. Processed content also has a shelf life.

**Weakness revealed:** Our 03_LEARNINGS/ has a 7-day RAW retention rule but no decay logic for processed lessons. Old entries accumulate forever. Over time, finding the useful signal becomes harder.

**Sharingan derivation:** The technique is *tiered decay with review cadence* — RAW: 7 days, PROCESSED: 90 days, SYNTHESIS: 1 year. Each tier has different retention rules. The specific durations are ours to set; the tiered-decay pattern is Jake's.

### Domain Core Lens
**Scope:** Add `_SYSTEM/SELF-IMPROVEMENT/04_ARCHIVE/` directory. Add quarterly review rule to README.

**In bounds:** New directory creation. README with decay logic. Move rule documentation.

**Out of bounds:** No automated moves (manual review only for now). No changes to other directories. No deletion scripts.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Over-archiving — lessons still useful get archived prematurely
- Archive becomes a black hole (things go in, nothing comes out)
- Quarterly review is too infrequent or too frequent
- User feels loss of content (emotional attachment to old entries)

**Guardrails:**
- Archives are READ-ONLY, not deleted (reversible)
- Deletion only after 1 year and only with explicit confirmation
- Add an "access log" to archive: if something is accessed while archived, auto-unarchive it
- Non-destructive: create archive directory but don't move anything for 30 days

### Clone Orchestrator Lens
**Should this be parallelized?** NO — architectural change, needs sequential implementation.

**If decomposed:** Clone A writes the decay rules. Clone B writes the archive README. Clone C creates an "access log" template.

### Failure Evolution Lens
**Success criteria:**
- 5+ lessons archived in first quarterly review
- No user complaint about lost content
- At least 1 archived item is unarchived (proving the system brought it back correctly)

**Failure mode:** Nothing gets archived (user doesn't review) → reduce review interval or automate. Everything gets archived (too aggressive) → increase the access threshold.

---

## Improvement 14: Replace Static Ensemble Weights with Dynamic Weights
*Source: D2 (Static Ensemble Weights)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake tested the same task on 3 models and found they didn't fail the same way. "Claude was good at planning but missed JSON errors. Codeex failed at PowerShell. Gemini took longest but got JSON perfect." Each model has a *systematic bias* by task type.

**Weakness revealed:** Our ensemble weights (Claude 0.25, Grok 0.20, etc.) are static — same weights for every market type. Binary, multi-category, and numeric markets likely need different model weighting.

**Sharingan derivation:** The technique is *per-market-type model calibration* — weigh models differently based on what type of task they're performing. The specific bias observations are Jake's (property). Our bias mapping must come from our own data.

### Domain Core Lens
**Scope:** Replace static `MODEL_WEIGHTS` with per-market-type `MODEL_PERFORMANCE` object. Add Brier-score tracking by market type. Add weekly weight update logic.

**In bounds:** Changes to ensemble weighting code. New tracking data structure. Weekly update function.

**Out of bounds:** No changes to model inference calls. No changes to evidence collection. No changes to Phase 2 or Phase 5.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Dynamic weights overfit to small sample sizes (5 trades → wrong weights)
- Brier score tracking has a cold-start problem (no data → uniform weights)
- Weekly updates cause oscillation (weights swing wildly week to week)
- Per-market-type categorization is wrong (markets classified incorrectly)

**Guardrails:**
- Minimum 20 trades per market type before dynamic weights activate
- Start with uniform weights + 10% variance cap (weights can't change more than 10% per week)
- Use exponential moving average for Brier score (not simple average)
- Weekly update is proposal-only (human approves the weight changes)
- Rollback: restore static weights from git

### Clone Orchestrator Lens
**Should this be parallelized?** YES

- Clone A: Rewrite `MODEL_WEIGHTS` → `MODEL_PERFORMANCE` structure
- Clone B: Implement Brier score tracking by market type
- Clone C: Implement weekly weight update from Brier scores
- Clone D: Write tests (minimum 20 sample, edge cases: zero data, one type)
- Orchestrator: Verify interface contracts, merge, run integration tests

### Failure Evolution Lens
**Success criteria:**
- After 100 trades, model weights have diverged by market type (different weights for binary vs numeric)
- Overall Brier score improves by at least 5% compared to static weights
- Weekly weight changes stabilize (not oscillating) by week 8

**Failure mode:** Brier score doesn't improve → the market-type categorization is wrong, not the weight mechanism. Iterate on how markets are classified before iterating on weights. *The question isn't "which weights" but "which category."*

---

## Improvement 15: Schedule Night Block for SOUL.md and Brand Voice Rewrite (No AI)
*Source: A5 (Voice Documenting)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "When you ask AI to describe your voice, it writes about your voice in a way AI would write about your voice. Even the best models still struggle with this." Jake's solution: write the core identity files yourself, in your own voice, during a high-energy moment. Then let AI amplify from there.

**Weakness revealed:** SOUL.md is partially template-generated. Brand voice in the design system was likely AI-generated. The sections that feel "AI-written" undermine the entire identity. An AI can format voice but can't generate it.

**Sharingan derivation:** The technique is *human-origin constraint* — certain artifacts must originate from human cognition to avoid the "AI writing about AI" recursive degradation. This is not "AI is bad at writing" — it's "AI can't have experienced what you experienced."

### Domain Core Lens
**Scope:** Schedule a single night block. No AI tools during writing. After writing, use AI only for formatting, cross-referencing, and organization.

**In bounds:** SOUL.md rewrite. Brand voice section of design-system.md. One session, no AI during generation.

**Out of bounds:** No changes to other identity files (IDENTITY.md is larger and needs separate treatment). No automated generation. No AI editing during the writing block.

### Infinity Guard Lens
**Risk classification:** LOW (emotional/creative risk, not system risk)

**What could go wrong:**
- Creative block — nothing comes out (pressure of "no AI" feels paralyzing)
- Written voice still feels "wrong" (expectation too high)
- Takes too long (one night block may not be enough)

**Guardrails:**
- Timer: 2 hours max. The constraint IS the guardrail.
- Permission to write badly: "The first draft is the enemy of the good draft. Just write."
- If blocked after 30 min: switch to editing existing content (still no AI)
- Rollback plan: git stash the new version, restore old SOUL.md

### Clone Orchestrator Lens
**Should this be parallelized?** NO — this is fundamentally a single-human creative act. Clones can't write in Marcel's voice.

**Support tasks that CAN be parallelized:**
- Clone A: Read old SOUL.md and identify "AI-sounding" sections to flag for rewrite
- Clone B: Read old brand voice and identify the same
- Both produce MARKED-UP versions for Marcel to reference during the writing block

### Failure Evolution Lens
**Success criteria:**
- Marcel reviews the rewritten SOUL.md and feels it matches his actual voice
- Brand voice section reads differently from other system files (distinctly human vs AI-sourced)
- Marcel reports the session was worth doing

**Failure mode:** Rewritten version feels no different → the problem wasn't AI generation, it was lack of clarity on what "voice" means. Pivot: write a "voice note" (audio recording) first, transcribe, then edit. The medium change (writing → speaking) forces different cognitive architecture.

---

## Improvement 16: Convert Frameworks to Dual-Format (Human + Agent)
*Source: E5 (Skills as Process Packages)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "Skills are processes of thought turned into a package." Jake publishes skill files on GitHub. The skill version is a markdown file describing "how to think about X" — optimized for agent comprehension with shorter sections, explicit tool calls, routing instructions.

**Weakness revealed:** Our framework files are human-readable only. An agent entering the system must parse human-oriented text to extract the operational logic. The agent version would be a single optimized markdown file.

**Sharingan derivation:** The technique is *format duality* — same content, different readers, optimized formats. The agent version is shorter, more structured, with explicit "when asked about X, do Y" routing. The human version has narrative, examples, reasoning.

### Domain Core Lens
**Scope:** For each framework file in 01_FRAMEWORKS/, create an agent-optimized `.skill.md` version. Organize into `01_FRAMEWORKS/skills/` directory.

**In bounds:** New skill files in a `skills/` subdirectory. Agent-optimized content (shorter, tool-call explicit, routing directives).

**Out of bounds:** No changes to existing human-readable framework files. No changes to agent prompts or routing. No changes outside 01_FRAMEWORKS/.

### Infinity Guard Lens
**Risk classification:** LOW to MEDIUM

**What could go wrong:**
- Agent reads skill version instead of human version → misses context/examples
- Skill files duplicate content → maintenance burden (update both when framework changes)
- Skill format drifts from framework content → agent gets stale instructions

**Guardrails:**
- Add a header to each skill file: `# Generated from: <framework.md> | Last synced: <date>`
- Add a footer: `# Out of sync? Re-read <framework.md> and update`
- Use identical content hashes or git hooks to detect drift
- Non-destructive: create skill files, don't change any existing behavior

### Clone Orchestrator Lens
**Should this be parallelized?** YES — independent framework conversions.

- Clone A: Convert icm-methodology.md → agent skill
- Clone B: Convert decision-matrix.md → agent skill
- Clone C: Convert never-automate.md → agent skill
- Each clone has: same template, same rules, independent output
- Orchestrator: Verify all skill files follow the same format, are internally consistent

**Per Clone Orchestrator budget:** Each conversion is ~30 min. With 5+ framework files, parallel clones save 2-3 hours.

### Failure Evolution Lens
**Success criteria:**
- 3+ skill files created
- Agent reads skill file and follows its instructions correctly (test with a probe query)
- When framework.md changes, skill.md is updated within 1 session (or auto-detected)

**Failure mode:** Skill files are created but never used → add a routing rule in AGENT_ROUTING.md: "If query matches a skill, read skills/<skill>.md first." If agents still don't read them, the problem is routing, not content.

---

## Improvement 17: Replace weekly-sprint.md with weekly-comp.md
*Source: C3 (Weekly Competition Model)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's community runs WEEKLY COMP competitions with $325 prizes. The constraint ("build a folder-based AI specialist") forces creative output under pressure. Goals without stakes are wishes.

**Weakness revealed:** Our weekly-sprint.md is a planning document with goals, tasks, retro sections. It's a productivity template, not a motivational structure. Competition produces better output than planning.

**Sharingan derivation:** The technique is *structured constraint + stakes* — the constraint ("not allowed to use new tools") forces creative reuse. The stakes ($325 prize) make it matter. The specific constraint-stakes mechanism is the pattern; the $325 amount and specific challenge format are Jake's (property).

### Domain Core Lens
**Scope:** Rename `weekly-sprint.md` → `weekly-comp.md`. Restructure from "goals/tasks/retro" to "challenge/stake/constraint/judge."

**In bounds:** Single file rename and rewrite. Same directory.

**Out of bounds:** No changes to other files. No new directories. No automation of competitions. No monetary stakes (stakes are personal: "skip Thursday admin" or "focused Saturday night").

### Infinity Guard Lens
**Risk classification:** LOW (motivational change, not system change)

**What could go wrong:**
- Competition format feels artificial (single person can't have a "weekly comp" with themselves)
- Without external stakes (prize), the format loses its power
- "Stake" becomes performative ("I'll lose 1 hour of gaming" — meaningless)

**Guardrails:**
- Stake must be COSTLY if lost. If the user doesn't care about losing the stake, it won't work.
- Suggested stakes: "No new tools next week" or "Donate $10 to a cause I dislike" or "Delete a video file"
- Keep old sprint template as `.old.md` for 30 days in case the format doesn't stick

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single file, creative decision.

### Failure Evolution Lens
**Success criteria:**
- User completes 2 weekly comps
- Each comp produces an actual output (code, analysis, insight)
- User reports the competition format was "more motivating" than the sprint format

**Failure mode:** Format doesn't motivate — revert to sprint format but add ONE element from comp: either a constraint ("what you're NOT allowed to do") or a concrete stake. Hybrid might work better than full replacement.

---

## Improvement 18: Add Data Quality Gate Before Phase 4 Inference
*Source: D1 (Data-Centric Pipeline)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "The question isn't which model is best — the question is which data is most reliable." Jake built a pipeline with 10,000 responses and low variability — not because models were good, but because the data pipeline eliminated noise. The data design thinking process matters more than the model selection.

**Weakness revealed:** Our pipeline is model-centric. Phase 3 collects evidence. Phase 4 runs 5 models on that evidence. The assumption: better models → better predictions. Jake flips this: better data → better predictions. Models amplify data quality; they don't fix it.

**Sharingan derivation:** The technique is *data-quality-first threshold* — assess data quality before model inference. If data quality < 0.6, skip inference entirely. The specific scoring methodology is ours; the skip-bad-data pattern is Jake's.

### Domain Core Lens
**Scope:** Add `assessDataQuality()` function between Phase 3 and Phase 4. Check freshness, source diversity, contradiction level, confidence.

**In bounds:** New quality assessment function. Scoring criteria. Skip logic (return INSUFFICIENT_DATA).

**Out of bounds:** No changes to Phase 3 evidence collection. No changes to Phase 4 inference. No changes to Phase 2 or Phase 5.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Quality threshold is too high → skip profitable markets (data rarely "perfect")
- Quality assessment methodology is flawed → scores don't correlate with actual prediction quality
- Data quality gate creates a bottleneck (Phase 3 finishes but Phase 4 doesn't run → confusion)
- Contradiction scoring is too aggressive (contradictory evidence is often the most informative)

**Guardrails:**
- Start with LOW threshold (0.3) and log skipped markets for review
- Validate quality scores against actual outcomes after 50 trades
- If quality-gate-skipped markets would have been profitable, lower the threshold
- Never skip on contradiction alone — contradiction is information
- Rollback: comment out the quality gate, restore unconditional inference

### Clone Orchestrator Lens
**Should this be parallelized?** YES

- Clone A: Write `assessDataQuality()` with scoring criteria
- Clone B: Research historical markets to find the correlation between data quality and outcome
- Clone C: Write integration test (Phase 3 → quality gate → Phase 4 or skip)
- Sequential: B informs A's threshold values

### Failure Evolution Lens
**Success criteria:**
- After 50 markets with quality gate, < 5% of skipped markets would have been profitable
- Phase 4 token usage drops by at least 20% (fewer inferences)
- Quality score correlates with prediction accuracy (p < 0.05)

**Failure mode:** Quality score doesn't correlate with outcomes → the scoring methodology is wrong, not the concept. Iterate on the scoring dimensions (add timeliness weight, remove "source diversity" if it's not predictive).

---

## Improvement 19: Add experiments/ Track
*Source: E1 (Experiment Track Alongside Project)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's entire approach is built on experiments — "watch me build something," "trying to see what happens when I do X." He doesn't start a project; he starts an exploration. Projects are output; experiments are input.

**Weakness revealed:** Our learning system tracks projects only. Projects have deliverables, deadlines, outcomes. There's no "let's see what happens" track. The experiment mode is where compound learning happens — where failure is expected and any result is valuable data.

**Sharingan derivation:** The technique is *epistemic mode separation* — separate "production mode" (projects, deliverables) from "discovery mode" (experiments, "what if"). Different templates, different success criteria, different mental models.

### Domain Core Lens
**Scope:** Add `experiments/` directory under 03_LEARNINGS/. Create experiment template (Question, Setup, Expected, Actual, Signal, Lesson).

**In bounds:** New directory and one template file.

**Out of bounds:** No changes to existing projects/ directory. No changes to weekly-consolidation.md. No changes to other files.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Experiments and projects blur together (what makes something an experiment vs project?)
- Experiment template is too structured (defeats the purpose of free exploration)
- Experiments are abandoned (started but never completed — infinite backlog)

**Guardrails:**
- Clear definition: "If the goal is uncertain output, it's an experiment. If the goal is specific output, it's a project."
- Experiment template is OPTIONAL — free-form markdown also welcome
- 30-day auto-archive for experiments with no update (de-clutter)
- Non-destructive: add directory, no changes to anything else

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single directory + template.

### Failure Evolution Lens
**Success criteria:**
- 2+ experiments logged in first month
- At least 1 experiment produces a useful signal even if it "failed"
- At least 1 experiment transitioned to a project (shows the pipeline works)

**Failure mode:** Zero experiments → the concept isn't compelling. Fix: start one experiment FOR Marcel and demonstrate the value. The first experiment should be quick (< 1 hour) and produce a surprising result.

---

## Improvement 20: Implement Weekly Consolidation for Failure Knowledge
*Source: D5 (Compound Step Retro Mode)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** "Writing to a file isn't learning. Rewriting the file based on what you learned — that's learning." Jake's principle: if the file doesn't change, the system isn't learning. Appending is archiving; rewriting is learning.

**Weakness revealed:** The compound step appends to failure knowledge files. Single-direction data flow. Entries accumulate but the knowledge base doesn't evolve. There's no consolidation loop that refactors the knowledge base every N entries.

**Sharingan derivation:** The technique is *consolidation loop* — cluster entries by root cause, extract prevention rules, rewrite the knowledge file, archive old entries. The specific clustering algorithm is ours; the rewrite-instead-of-append pattern is Jake's.

### Domain Core Lens
**Scope:** Add `consolidateFailureKnowledge()` to Phase 5 compound step. Triggered when entries > 20. Clusters by root cause, extracts prevention rules, rewrites consolidated-rules.md, archives detailed entries.

**In bounds:** One new function in Phase 5. One new `consolidated-rules.md` output file. Archive directory for old entries.

**Out of bounds:** No changes to other Phase 5 steps. No changes to existing failure-knowledge/ directory structure.

### Infinity Guard Lens
**Risk classification:** MEDIUM

**What could go wrong:**
- Clustering produces wrong groupings → wrong prevention rules
- Rewriting loses individual context (nuance of each failure)
- Archive makes detailed entries unreachable (lost forever in archive)
- Consolidation runs too frequently (every 20 entries is too aggressive for rare failures)

**Guardrails:**
- Copy detailed entries to archive BEFORE rewriting (never delete originals)
- Add a "confidence" score to each prevention rule (low = needs more data)
- Include 3 "concrete examples" links in each consolidated rule (keeps context)
- Manual approval required before consolidation runs (output is proposed, not applied)

### Clone Orchestrator Lens
**Should this be parallelized?** YES

- Clone A: Write clustering function
- Clone B: Write prevention-rule extraction function
- Clone C: Write archive function
- Orchestrator: Define interface contract between A, B, C (what does each input/output look like?)

### Failure Evolution Lens
**Success criteria:**
- First consolidation produces ≥ 3 prevention rules
- Each rule references ≥ 2 concrete failure examples
- User reports the consolidated rules are "useful" or "surprising"
- After 3 consolidations, some rules reappear (means the prevention didn't work → deeper pattern)

**Failure mode:** Consolidation produces rules that are too obvious ("don't use wrong data") → the clustering granularity is too coarse. Iterate: more specific root cause categories or add "prevention action" as a required field.

---

## Improvement 21: Energy-Zone Directory Restructure
*Source: B4 (Energy-Aware Scheduling Not Embedded)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake would say energy-aware scheduling information is "stored not embedded." The knowledge exists in a document but doesn't enforce behavior. Jake's approach: name the folders so they enforce energy-aware routing. The folder names *are* the schedule.

**Weakness revealed:** The decision-matrix.md has an energy-aware scheduling table (Zone 1/2/3, best task mapping). But this knowledge is stored in a document, not embedded in the architecture. A user can open Zone 3 tasks during Zone 1.

**Sharingan derivation:** The technique is *behavior-enforcing architecture* — structure enforces behavior better than documentation. Folder names that encode time/energy zones create spatial constraints that guide decisions without conscious effort.

### Domain Core Lens
**Scope:** Restructure top-level SYSTEM/ directory into energy-zoned folders: 01_DEEP_WORK/, 02_ADMIN/, 03_LEARNING/. Move existing content into appropriate zones.

**In bounds:** Directory restructuring. File moves between new directories. README updates. Cross-reference updates.

**Out of bounds:** No content changes to files. No new files. No deletions.

### Infinity Guard Lens
**Risk classification:** HIGH (system-wide refactor)

**What could go wrong:**
- Major disruption to all workflows (everything moves at once)
- Broken paths in every file that references old directory structure
- Cognitive overload (user has to re-learn system layout)
- Energy zones don't match actual usage patterns (Zone 1 tasks mixed with Zone 2)

**Guardrails:**
- Phase the migration: create new structure, move files in batches over 1 week
- Symlinks from old paths to new paths for 60 days
- Run a full cross-reference scanner before/after
- Keep an `_LEGACY_` directory at old root with a README explaining the new structure
- Rollback plan: full `git revert` of the restructuring commit

**Non-destructive path:** Create the new structure AS A PARALLEL overlay with symlinks. Don't remove old structure for 30 days. Verify all tools and agents work with new paths before removing old.

### Clone Orchestrator Lens
**Should this be parallelized?** YES — this is a large refactor.

- Clone A: Map all files to new energy zones (categorization work)
- Clone B: Create new directory structure (pure `mkdir -p`)
- Clone C: Write cross-reference scanner (find all path references)
- Clone D: Create symlinks from old→new paths
- Clone E: Update ALL internal cross-references
- Orchestrator: Stage plan, verify batch 1 (5 files), approve batch 2 (all files)

**Per Clone Orchestrator budget:** This is an XL task (full day). Budget 2 hours per clone.

### Failure Evolution Lens
**Success criteria:**
- System runs for 1 week with no broken path errors
- User reports it's easier to find the right task for their energy level
- No file is lost or orphaned

**Failure mode:** User finds the new structure actively worse → full revert. Document what specifically was bad about the new layout, try a different zoning scheme. The pattern (energy-embedded folder names) is sound; the specific zone categories may need adjustment.

---

## Improvement 22: Create Model-Workspace-Protocol Paper
*Source: F22 (Model-Workspace-Protocol)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake is publishing a paper on Model-Workspace Protocol (MWP). This is his attempt to formalize the relationship between AI models and folder-based workspaces into a reusable standard.

**Weakness revealed:** NUDIMMOD has a working agent-folder system but no formalized protocol for how agents interact with workspaces. No standardized rules for agent entry, file reading, token budgets, or output contracts.

**Sharingan derivation:** The technique is *formalization-as-evolution* — taking working patterns and codifying them into a protocol document. The protocol becomes the reference standard that all future decisions route through. We develop our own protocol (not copy Jake's MWP) based on our system's specific patterns.

### Domain Core Lens
**Scope:** Research and write a model-workspace protocol paper. Define agent entry rules, file reading hierarchy, token budget defaults, output contract templates.

**In bounds:** Single document creation. Protocol specification format.

**Out of bounds:** No system changes. No implementation. No automation. Protocol-only.

### Infinity Guard Lens
**Risk classification:** LOW

**What could go wrong:**
- Protocol is too theoretical (never implemented)
- Protocol is too specific (doesn't generalize to new situations)
- Protocol duplicates existing documentation (no new value)

**Guardrails:**
- Protocol must be DERIVED FROM existing working patterns, not designed in abstract
- Include "implementation status" for each rule (proposed / tested / active)
- Keep it under 10 pages (enforceable length)
- Non-destructive: document only, no system changes required

### Clone Orchestrator Lens
**Should this be parallelized?** NO — single document, requires synthesis.

**If decomposed:** Clone A extracts existing implicit agent-workspace patterns. Clone B researches Jake's MWP. Clone C writes the protocol. Sequential: A→B→C.

### Failure Evolution Lens
**Success criteria:**
- Protocol is published and referenced in system documentation
- At least 2 system changes are made because the protocol revealed a gap
- Protocol is updated within 1 month of creation (proves it's alive)

**Failure mode:** Protocol is written and never referenced — the exercise still produced value (the thinking). Fix: use the protocol as a checklist for new system components.

---

## Improvement 23: Community-as-Value Product Layer
*Source: F23 (NUDIMMOD as Skool-like Platform)*

### Pattern Mirror Lens
**Pattern extracted from Jake:** Jake's Skool has 27,200 members. The community is not an add-on — it IS the product. Members pay for access to the system, the community, and the compound learning that happens there.

**Weakness revealed:** NUDIMMOD's vault and OS are a personal system. There's no community layer. The system produces compound value for one person but doesn't scale that value to others.

**Sharingan derivation:** The technique is *value-multiplication through community* — the system's output becomes the community's input, and the community's output improves the system. We develop our own community layer (not Skool clone) based on our specific value proposition.

### Domain Core Lens
**Scope:** Research community product models. Design a community layer for NUDIMMOD. No implementation yet — design phase only.

**In bounds:** Research document. Product specification. Architecture sketch. Community onboarding flow.

**Out of bounds:** No implementation. No platform decisions. No monetization decisions. No changes to existing system.

### Infinity Guard Lens
**Risk classification:** LOW (design phase) / CRITICAL (if rushed to implementation)

**What could go wrong:**
- Community distracts from core system development
- Premature implementation (building platform before proving community demand)
- Personal system becomes "productized" and loses its intimate value for Marcel

**Guardrails:**
- Design phase only — no code, no platform signups
- "Do I have 5 people who would pay for access?" — only move to build after validating demand
- Personal system stays PRIVATE — community gets a separate layer
- Non-destructive: design only, no system changes

### Clone Orchestrator Lens
**Should this be parallelized?** YES (design phase only)

- Clone A: Research Jake's Skool model and 27K member ecosystem
- Clone B: Research other community-product models (Discourse, Patreon, Substack)
- Clone C: Design NUDIMMOD community architecture (what's shared, what's private)
- Merge: All three inform a single product spec

### Failure Evolution Lens
**Success criteria:**
- Design document is complete with community architecture, onboarding flow, value proposition
- At least 3 clear "what NUDIMMOD offers that nothing else does" differentiators
- Implementation is NOT started (success = waiting, not building)

**Failure mode:** The design phase proves the community layer doesn't add value → documented "not now" decision is a success outcome. The learning is in the analysis, not the build.

---

## Summary: Grouped by Impact × Risk

### 🔥 Highest Impact + Lowest Risk → Do Immediately

| # | Improvement | Impact | Risk | Rationale |
|---|------------|--------|------|-----------|
| 1 | Create DIRECTORY_MAP.md for key dirs | HIGH | LOW | 40-60% token reduction. File creation only. Zero mutations. |
| 4 | Create START_HERE.md | MEDIUM | LOW | Enables architectural flow. Single file creation. |
| 5 | Add CLAUDE.md to trading bot | HIGH | LOW | Immediate token savings for agent interactions. |
| 6 | Add opening question to failure-log.md | MEDIUM | LOW | Single field addition. Reversible in 2 min. |
| 8 | Convert extraction-template to questions | MEDIUM | LOW | Full rewrite but single file, old copy kept. |
| 10 | Create token-efficiency.md | MEDIUM | LOW | Zero risk. File creation only. |
| 11 | Create AGENT_ROUTING.md | HIGH | LOW | Agent query routing. File creation only. |
| 22 | MWP paper (design phase) | HIGH | LOW | Document only. No system changes. |

### ⚠️ High Impact + Needs Guardrails → Do with Safety

| # | Improvement | Impact | Risk | Guardrails Needed |
|---|------------|--------|------|-------------------|
| 2 | Rewrite failure-log taxonomy | HIGH | MED | Keep old taxonomy as secondary tag for 30 days |
| 7 | Rename dirs to RAW/PROCESSED/SYNTHESIS | HIGH | HIGH | Symlinks, git mv, cross-ref scanner, 30-day parallel |
| 12 | Implement coworker-mode.mjs | MED | MED | $25 threshold start, 100-trade verification window |
| 13 | Add ARCHIVE/ with decay | MED | MED | Read-only archive, access log auto-unarchive |
| 14 | Dynamic ensemble weights | HIGH | MED | 20-trade minimum, 10% weekly cap, manual approval |
| 16 | Dual-format framework skills | HIGH | MED | Sync tracking header, drift detection |
| 19 | Add experiments/ track | MED | MED | 30-day auto-archive for abandoned experiments |
| 20 | Weekly failure consolidation | HIGH | MED | Manual approval, never delete originals, confidence scoring |
| 21 | Energy-zone directory restructure | HIGH | HIGH | Phase over 1 week, symlinks for 60 days, legacy dir |

### 🧪 Low Risk + Experimental → Try and Learn

| # | Improvement | Impact | Risk | Experimental Parameter |
|---|------------|--------|------|----------------------|
| 3 | shouldRunFullEnsemble() filter | HIGH | LOW→MED | Start conservative (5%), log-only mode first |
| 9 | Add Type E framing failure | MED | LOW | "learning" severity only, no critical impact |
| 15 | Night block SOUL.md rewrite | HIGH (creative) | LOW | 2-hour timer, permission to write badly |
| 17 | weekly-sprint → weekly-comp | MED | LOW | Keep old template, hybrid if competition doesn't stick |
| 18 | Data quality gate | HIGH | MED | Start at 0.3 threshold, validate against outcomes |

### 🚧 High Risk + Uncertain → Requires Design Phase First

| # | Improvement | Risk Level | Design Phase Required Before |
|---|------------|-----------|-----------------------------|
| 21 | Energy-zone directory restructure | CRITICAL | Full file mapping, cross-reference audit, approved rollout plan |
| 23 | Community-as-value product layer | CRITICAL | Community demand validation (5 paying users), separate layer design |

---

## Appendix: Lens Usage Summary

Each lens was applied according to its skill's core methodology:

| Lens | Skill Methodology Applied | Key Patterns Used |
|------|--------------------------|-------------------|
| **Pattern Mirror** | Pattern Mirror Core execution steps 1-5 (Intake → Decomposition → Pattern Extraction → Prerequisite Detection → Weakness Scan) | Checking each improvement for: what pattern was extracted, what weakness it reveals, Sharingan derivation tracking |
| **Domain Core** | Execution Domain Core steps 1-4 (Goal Intake → Boundary Definition → Policy Selection → Tool/File Permission Mapping) | Explicit IN/OUT of bounds for each improvement, no content changes unless specified |
| **Infinity Guard** | Non-Destructive Infinity Guard steps 1-6 (Intercept → Classify → Reversibility Check → Permission Check → Risk Scoring → Decision) | Risk classification (LOW/MED/HIGH/CRITICAL), guardrails, rollback plans, non-destructive defaults |
| **Clone Orchestrator** | Parallel Clone Orchestrator steps 1-4, 8 (Decomposition → Role Assignment → Budget Allocation → Parallel Execution → Synthesis) | YES/NO/PARTIAL parallelization decision, specific clone role assignments, budget notes |
| **Failure Evolution** | Failure Evolution Loop steps 1-7 (Intake → Impact Classification → Root Cause Analysis → Pattern Matching → Regression Design → Improvement Plan → Memory Proposal) | Success criteria, failure mode + fix, learning loop design |

---

*Report produced by subagent using Anime DNA Superpower methodology. Each of 23 improvements analyzed through 5 lenses derived from: non-destructive-infinity-guard, pattern-mirror-core, parallel-clone-orchestrator, execution-domain-core, failure-evolution-loop, and sharingan skills.*
