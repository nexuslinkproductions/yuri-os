---
source_file: "01_PROJECTS/openspace/openspace/skill_engine/patch.py"
type: "code"
community: "EvolutionSuggestion"
location: "L89"
tags:
  - graphify/code
  - graphify/INFERRED
  - community/EvolutionSuggestion
---

# SkillEditResult

## Connections
- [[Apply an edit with retry on failure.          If the first attempt fails (patch]] - `uses` [INFERRED]
- [[Ask LLM to confirm whether a rule-based evolution candidate         truly needs]] - `uses` [INFERRED]
- [[Await all outstanding background evolution tasks.          Call this during shut]] - `uses` [INFERRED]
- [[Build EvolutionContext from a single analysis suggestion.          Loads all tar]] - `uses` [INFERRED]
- [[Capture a novel pattern as a brand-new skill.          Uses agent loop for infor]] - `uses` [INFERRED]
- [[Create enhanced version in a new directory.          Supports single-parent (enh]] - `uses` [INFERRED]
- [[Diagnose what type of evolution a skill needs based on metrics.          Returns]] - `uses` [INFERRED]
- [[Enforce naming rules for skill names (used as directory names).      - Lowercase]] - `uses` [INFERRED]
- [[EvolutionContext]] - `uses` [INFERRED]
- [[EvolutionTrigger]] - `uses` [INFERRED]
- [[Execute a list of evolution contexts in parallel (throttled).          Used by a]] - `uses` [INFERRED]
- [[Execute one evolution action. Returns new SkillRecord or None.          The glob]] - `uses` [INFERRED]
- [[Execute skill evolution actions.      Single entry point ``evolve()`` takes an]] - `uses` [INFERRED]
- [[Extract edit content or failure reason from LLM output.          MUST only be ca]] - `uses` [INFERRED]
- [[Fix skills that depend on degraded tools.          Two-phase rule-based candida]] - `uses` [INFERRED]
- [[Format all text files in a skill directory for prompt inclusion.          Return]] - `uses` [INFERRED]
- [[Format recent analyses into a concise context block for prompts.]] - `uses` [INFERRED]
- [[In-place fix same name, same directory, new version record.          Uses agent]] - `uses` [INFERRED]
- [[Infer the best skill root for a CAPTURED skill from analysis context.          W]] - `uses` [INFERRED]
- [[Inner body of process_tool_degradation, called under _degradation_lock.]] - `uses` [INFERRED]
- [[Launch a coroutine as a background ``asyncio.Task``.          Used by the caller]] - `uses` [INFERRED]
- [[Load SKILL.md content from disk via registry or direct read.]] - `uses` [INFERRED]
- [[Log the outcome of a background evolution task.]] - `uses` [INFERRED]
- [[Logger]] - `uses` [INFERRED]
- [[Parse LLM confirmation response (expects JSON with 'proceed' field).]] - `uses` [INFERRED]
- [[Process all evolution suggestions from a completed analysis.          Called imm]] - `uses` [INFERRED]
- [[Result of a skill edit operation.      Attributes         skill_dir Final skil]] - `rationale_for` [EXTRACTED]
- [[Run evolution as a token-driven agent loop.          Modeled after ``GroundingAg]] - `uses` [INFERRED]
- [[Scan active skills and evolve those with poor health metrics.          Two-phase]] - `uses` [INFERRED]
- [[SkillEvolver]] - `uses` [INFERRED]
- [[SkillEvolver — execute skill evolution actions.  Three evolution types   FIX]] - `uses` [INFERRED]
- [[Unified context for all evolution triggers.      For trigger 1 (ANALYSIS) sourc]] - `uses` [INFERRED]
- [[Update the tools available for evolution agent loops.]] - `uses` [INFERRED]
- [[What initiated this evolution.]] - `uses` [INFERRED]
- [[create_skill()]] - `calls` [EXTRACTED]
- [[derive_skill()]] - `calls` [EXTRACTED]
- [[fix_skill()_1]] - `calls` [EXTRACTED]
- [[patch.py]] - `contains` [EXTRACTED]

#graphify/code #graphify/INFERRED #community/EvolutionSuggestion