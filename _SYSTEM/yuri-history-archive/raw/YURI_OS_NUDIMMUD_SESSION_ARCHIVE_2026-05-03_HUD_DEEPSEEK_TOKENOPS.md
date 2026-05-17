---
title: "Yuri OS / YURI — Session Archive: HUD, DeepSeek Direct Routing, TokenOps, Websearch Cost Control"
date: "2026-05-03"
prepared_for: "Yuri OS / YURI ingestion archive"
prepared_by: "GPT-5.5 Thinking"
repo_root: "/Users/marcelspatz/YURI-OS-MUSUBI"
branch: "main"
status: "Archive-ready continuity file, not an independently executed repo audit"
scope: "Current ChatGPT Web session plus user-pasted local Claude/Codex/DeepSeek/YURI results"
primary_lanes:
  - "08N local claim authority / verifier integrity"
  - "08O YURI composer auto-send paste repair"
  - "08P route-log / model-output separation"
  - "08Q claim-verifier local-truth verification"
  - "08R HUD budget-line removal"
  - "08S visual HUD smoke"
  - "08T HUD visual polish and repair attempts"
  - "DeepSeek direct-route architecture correction"
  - "DeepCode / DeepSeek executor research"
  - "Cheap web/search research protocol"
---

# Yuri OS / YURI — Session Archive  
## HUD, DeepSeek Direct Routing, TokenOps, and Websearch Cost Control

Prepared: 2026-05-03  
Repo root: `/Users/marcelspatz/YURI-OS-MUSUBI`  
Branch: `main`  
Timezone context: Europe/Vienna  

This archive captures the full operational continuity of the session. It is meant for ingestion into Yuri OS / YURI as a tracked internal archive, not as proof that the local repository currently matches every claim.

Direct shell/local git evidence still outranks this document.

---

## 1. Trust and Evidence Rules

### 1.1 Evidence status

This file is based on:

- User-provided execution reports from Claude, Codex, DeepSeek/YURI, and terminal screenshots.
- ChatGPT Web reasoning and prompt-gating decisions.
- Previously uploaded continuity handoffs and current session context.
- No independent local repository execution by ChatGPT Web.

### 1.2 Local truth rule

Never treat model claims as accepted truth for:

- commit creation,
- current HEAD,
- staged files,
- dirty state,
- file mutation,
- validation success,
- artifact existence,
- route/model/backend state.

Accepted truth requires direct local verification through exact scoped shell/git/file evidence.

### 1.3 Current session rule correction

A major correction from this session:

```text
YURI direct DeepSeek route is model/reasoning output only.
It is not currently a local file-editing executor.
```

Therefore, prompts pasted directly into `YURI ›` must not ask DeepSeek to:

- mutate files,
- stage files,
- commit files,
- verify local repo state,
- call DeepSeek again,
- open DeepSeek,
- offload to DeepSeek,
- pretend shell/file tools exist.

Direct YURI/DeepSeek prompts should ask for:

```text
audit → self-assess → design/spec → produce executor prompt
```

Actual local mutation must be handled afterward by Claude, Codex, or direct local shell.

---

## 2. Global User Workflow Requirements Preserved

### 2.1 Prompt format

For Yuri OS / YURI sprint prompts:

- Always provide the recommended executor/model.
- Always tell the user exactly where to paste/run the prompt.
- Serious sprint prompts must be one complete copy-ready block.
- Do not split required instructions across multiple boxes.
- Treat steps/stages as internal sequencing inside one transaction.
- Use `ONE_TRANSACTION`.
- Use `FINAL_REPORT_ONLY_UNLESS_BLOCKED`.
- Use compact output.
- Avoid broad repo commands.
- Use exact scoped status only.
- No full file dumps unless failure requires it.
- No repeated evidence dumps.
- No verbose progress narration.

### 2.2 Tokenmaxxing rules

Tokenmaxxing is mandatory.

Preferred prompt/report style:

```text
- marker-only on pass
- failure-only verbose logs on failure
- no tool-output dumps
- no broad grep/find/status/diff
- scoped command outputs
- concise final reports
- hard stop before token overflow
```

### 2.3 Image-generation rule

Hard correction:

```text
Do not generate images in ChatGPT Web unless explicitly asked.
```

For HUD/image/design tasks in this project, ChatGPT Web should act as:

- visual architect,
- prompt/spec writer,
- gatekeeper,
- design reviewer,

not an image generator.

This applies especially to YURI HUD work.

---

## 3. Starting State at the Beginning of This Session

The session began from a handoff that placed the project after the 08N local claim authority lane.

Accepted local truth at that point:

```text
Repo: /Users/marcelspatz/YURI-OS-MUSUBI
Branch: main
Latest accepted HEAD:
1549dd2a4 test(cli): add YURI claim verifier artifact smoke
Staged files: none
_SYSTEM/Scripts/yuri-repl.mjs: clean after accepted commit
```

Known tolerated dirty state:

```text
.claude/settings.json
backend/data/yuri.db-shm
backend/data/yuri.db-wal
src/index.tsx
src/main.ts
src/components/NeuralViz/
src/yuri/
```

Important correction inherited from 08N:

```text
DEEPSEEK_BASE_URL=http://127.0.0.1:11434/v1
DEEPSEEK_PRO_MODEL=qwen2.5:7b
```

was local Ollama/Qwen through a DeepSeek-compatible path, not real DeepSeek V4 Pro.

The claim verifier was proven through deterministic no-model harness, so no further Qwen/DeepSeek verifier smoke was needed.

---

## 4. Completed Lane: 08N Local Claim Authority / Verifier Integrity

Accepted result:

```text
08N_LOCAL_CLAIM_AUTHORITY_LANE_CLOSED
```

Key accepted commits:

### 4.1 `6b188fb83 fix(cli): verify YURI model local-state claims`

File changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
```

Behavior added:

- Local post-run claim verifier.
- Detects suspicious model claims such as:
  - `PASS_COMMITTED`
  - `HEAD:`
  - `STAGED:`
  - `FILES_CHANGED:`
  - `VALIDATION:`
  - git commit success-like claims
- Saves `local_claim_verifier` into `meta.json`.
- Prints warning on unverified suspicious claims.
- Preserves raw `output.md`.
- Self-test downgrades fake committed-state claim to `MODEL_CLAIM_ONLY`.

### 4.2 `1549dd2a4 test(cli): add YURI claim verifier artifact smoke`

File changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
```

Added deterministic no-model artifact smoke:

```bash
YURI_REPL_CLAIM_VERIFIER_SMOKE=1 node _SYSTEM/Scripts/yuri-repl.mjs
```

Verified markers:

```text
CLAIM_VERIFIER_ARTIFACT_SMOKE_PASS
META_VERDICT::MODEL_CLAIM_ONLY
RAW_OUTPUT_PRESERVED::true
HEAD_UNCHANGED::true
```

---

## 5. Completed Lane: 08O Composer Auto-Send Paste Repair

Sprint:

```text
08O_YURI_COMPOSER_AUTO_SEND_PASTE_REPAIR_X
```

Goal:

- Remove need to hit Enter twice after paste.
- Avoid duplicate `MULTILINE` prompt while pasting.
- Auto-send pasted multiline input once after capture.
- Do not touch HUD redesign.

Result:

```text
08O_YURI_COMPOSER_AUTO_SEND_PASTE_REPAIR_X_PASS_COMMITTED
```

Commit:

```text
3e7398bcc fix(cli): auto-send YURI pasted multiline input
```

File changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
```

Key behavior:

- Bracketed paste no longer opens visible multiline composer.
- Paste path calls `submitBracketedPaste`.
- Long pasted multiline content is composed once and sent once.
- Prompt returns normally after send.
- Manual multiline fallback remains available.

Validation markers passed:

```text
NODE_CHECK
SELFTEST
NATURAL_COMPOSER
MULTILINE_CAPTURE
ENTER_SENDS_CAPTURE
LONG_PASTE_SINGLE_REQUEST
AUTO_SEND_PASTE_ONCE
NO_DUPLICATE_MULTILINE_PROMPT
ESC_CANCELS_CAPTURE
QUIET_TURN_END
LOCAL_CLAIM_VERIFIER
CLAIM_VERIFIER_ARTIFACT_SMOKE
```

Verification sprint result:

```text
08O_V_YURI_COMPOSER_AUTO_SEND_PASTE_REPAIR_VERIFIED
```

Artifact path from verification:

```text
/Users/marcelspatz/.yuri/runs/NMD-20260503-002415-001
```

Primary artifact path status:

```text
PASS
```

---

## 6. Completed Lane: 08P Route-Log / Model-Output Separation

Planning result:

```text
08P_YURI_ROUTE_LOG_OUTPUT_SEPARATION_P_PASS_PLAN_READY
```

Problem diagnosed:

- Route logs from `_SYSTEM/Scripts/offload.sh` and `_SYSTEM/Scripts/ai` could leak into visible terminal/wrapper output.
- `output.md` was already model-only in many paths, but terminal/wrapper capture still had contamination risk.
- `_SYSTEM/Scripts/ai` used combined `2>&1` capture in some paths.

Implementation result:

```text
08P_YURI_ROUTE_LOG_OUTPUT_SEPARATION_X_PASS_COMMITTED
```

Commit:

```text
ee60bccd3 fix(cli): separate YURI route logs from model output
```

Files changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
_SYSTEM/Scripts/offload.sh
_SYSTEM/Scripts/ai
```

Key changes:

- Broader route-log detection vocabulary.
- Split captured text into model output and route output.
- `stderr` route logs treated as route metadata.
- `route_output` stored in `meta.json`.
- `output.md` stays model-only.
- `_SYSTEM/Scripts/offload.sh` route/dry-run logs moved to stderr.
- `_SYSTEM/Scripts/ai` triage/swarm wrappers split stdout model text and stderr route text.

Validation markers passed:

```text
NODE_CHECK
SHELL_CHECK_OFFLOAD
SHELL_CHECK_AI
SELFTEST
ROUTE_LOG_SEPARATED
MODEL_OUTPUT_CLEAN
ROUTE_METADATA_CAPTURED
OUTPUT_MD_CLEAN
CLAIM_VERIFIER_ARTIFACT_SMOKE
COMPOSER_08O_REGRESSION
```

Verification result:

```text
08P_V_YURI_ROUTE_LOG_OUTPUT_SEPARATION_VERIFIED
```

Artifact path:

```text
/Users/marcelspatz/.yuri/runs/NMD-20260503-004352-001
```

Primary path status:

```text
PASS
```

---

## 7. Completed Lane: 08Q Claim Verifier Local Truth Boundary Verification

Result:

```text
08Q_YURI_CLAIM_VERIFIER_LOCAL_TRUTH_V_PASS_VERIFIED
```

HEAD verified:

```text
ee60bccd3 fix(cli): separate YURI route logs from model output
```

Key boundary confirmed:

```text
verifier source: model output only
route metadata: separate in meta.json
output.md route contamination: none
```

Smoke artifact:

```text
/private/tmp/yuri-runs/NMD-20260503-005036-001
```

Important artifact verification:

- `request.md` exists.
- `output.md` exists.
- `meta.json` exists.
- `transcript.md` exists.
- `meta.json` includes `local_claim_verifier`.
- `meta.json` verdict is `MODEL_CLAIM_ONLY`.
- Fake model claim output preserved in `output.md`.
- Route metadata and local verifier metadata do not contaminate `output.md`.

Recommendation preserved:

```text
Keep this smoke in the review path for any future _SYSTEM/Scripts/yuri-repl.mjs change.
```

---

## 8. Completed Lane: 08R HUD Budget-Line Removal

Planning result:

```text
08R_YURI_HUD_BUDGET_LINE_REMOVE_P_PASS_PLAN_READY
```

Goal:

- Remove visible workflow budget text from HUD/footer.
- Preserve internal `workflow_budget_*` metadata.
- Preserve tokenmaxxing state.
- Do not change composer, route logs, claim verifier, or live model behavior.

Implementation result:

```text
08R_YURI_HUD_BUDGET_LINE_REMOVE_X_PASS_COMMITTED
```

Commit:

```text
61b4689a1 fix(cli): hide YURI HUD budget line
```

File changed:

```text
_SYSTEM/Scripts/yuri/status-line.mjs
```

Key change:

- Visible compact status line no longer renders `budget 1234/40000`.
- `renderBudgetStatusLine` was effectively hidden/empty for display use.
- Snapshot metadata still preserves:
  - `workflow_budget_hard`
  - `workflow_budget_target`
  - `workflow_budget_used`
  - `tokenmaxxing_state`

Validation markers:

```text
NODE_CHECK
SELFTEST
HUD_BUDGET_LINE_HIDDEN
TOKENMAXXING_STATE_PRESERVED
COMPOSER_08O_REGRESSION
ROUTE_LOG_SEPARATION_REGRESSION
CLAIM_VERIFIER_BOUNDARY_REGRESSION
CLAIM_VERIFIER_ARTIFACT_SMOKE
```

Verification result:

```text
08R_V_YURI_HUD_BUDGET_LINE_REMOVE_VERIFIED
```

Artifact:

```text
/Users/marcelspatz/.yuri/runs/NMD-20260503-010043-001
```

---

## 9. Completed Lane: 08S Static Visual Precheck and Manual HUD Smoke

Static visual precheck result:

```text
08S_STATIC_VISUAL_PRECHECK_PASS
```

Key rendering outputs:

```text
COMPACT_RENDER::mode normal | ctx 0/1000000 | tmx TOKENMAXXING::ACTIVE
BUSY_RENDER::thinking | elapsed 0s | output 0 chars | no-output
BUDGET_RENDER::
HUD_VISUAL_BUDGET_LINE_HIDDEN_PASS
HUD_METADATA_PRESERVED_PASS
```

Regression marker command initially failed due missing `rg`:

```text
zsh: command not found: rg
```

Repaired using `grep`.

Regression marker result:

```text
08S_REGRESSION_MARKERS_PASS
```

Manual visual smoke:

```text
08S_YURI_VISUAL_HUD_SMOKE_PASS
```

Interpretation:

- The 40k / workflow-budget visual bug was gone.
- Prompt appeared normally.
- 08S accepted closed.

---

## 10. HUD Lane: 08T Visual Polish and Repair Attempts

The HUD lane became the major difficult visual/UI thread of this session.

### 10.1 Visual target

The desired terminal HUD is not just functional. It should feel like:

- premium sci-fi command terminal,
- green phosphor,
- tactical,
- cybernetic,
- terminal-native,
- modular cockpit,
- high contrast,
- calm, not noisy,
- sharp technical interface,
- branded but usable.

Visual elements desired:

- large `YURI OS` identity,
- large `YURI` identity,
- purple `OS` accent,
- green dominant HUD,
- modular green bordered panels,
- useful system/route/model/request/output sections,
- no fake metrics,
- no visible budget,
- prompt remains usable.

### 10.2 Prior visual references

The user showed several screenshots.

Important interpretation:

#### Older prior HUD baseline

This older HUD was closer structurally than later compact attempts.

It had:

- large green `YURI` identity,
- subtitle `YURI OS / DEEPSEEK HUD REPL`,
- boxed `STATUS` panel,
- `USER REQUEST`,
- `YURI ROUTE`,
- `MODEL OUTPUT`,
- saved cue,
- prompt below.

Problems:

- too dense,
- too tall,
- visible budget,
- too much diagnostic detail,
- model output could dominate.

#### Target direction screenshot

The target direction was more polished and dashboard-like:

- dark VS Code terminal setting,
- green modular panels,
- large `YURI OS` and `YURI`,
- full sci-fi command HUD feeling,
- still terminal-native,
- visually composed rather than generic boxes.

### 10.3 08T-X1 compact HUD polish

Result:

```text
08T_YURI_HUD_USEFUL_POLISH_X1_PASS_COMMITTED
```

Commit:

```text
49731654f fix(cli): polish YURI compact HUD
```

Files changed:

```text
_SYSTEM/Scripts/yuri/status-line.mjs
_SYSTEM/Scripts/yuri-repl.mjs
```

Validation markers passed:

```text
NODE_CHECK
SELFTEST
INLINE_NODE_VALIDATION
HUD_USEFUL_POLISH_RENDERED
HUD_REFERENCE_SHAPE_PRESENT
HUD_BUDGET_LINE_STILL_HIDDEN
TOKENMAXXING_STATE_PRESERVED
COMPOSER_08O_REGRESSION
ROUTE_LOG_SEPARATION_REGRESSION
CLAIM_VERIFIER_BOUNDARY_REGRESSION
CLAIM_VERIFIER_ARTIFACT_SMOKE
```

Manual visual result:

```text
Failed visual expectation.
```

Screenshot showed it was significantly worse:

- too small,
- mostly flat text,
- no rich HUD,
- not close to reference.

### 10.4 08T-X2 GPT-5.5-inspired visual repair

Result:

```text
08T_YURI_HUD_VISUAL_REPAIR_X2_PASS_COMMITTED
```

Commit:

```text
f2b7a1640 fix(cli): repair YURI HUD visual layout
```

Changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
_SYSTEM/Scripts/yuri/status-line.mjs
```

Visual result:

```text
Still bad.
```

Manual screenshot showed:

- old upper boot block,
- small text-only `YURI`,
- then `YURI OS / YURI`,
- still looked like a small debug panel,
- not close to target.

### 10.5 08T-X3 Claude HUD shell rebuild

Result:

```text
08T_YURI_HUD_VISUAL_REPAIR_X3_PASS_COMMITTED
```

Commit:

```text
701e24add fix(cli): rebuild YURI HUD shell
```

Changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
```

Behavior:

- `printStatusBlock()` renders compact boxed `YURI / YURI OS` HUD.
- Startup and `/clear` no longer call `printHeader()` separately.
- `printHeader()` retained for help path.

Manual result:

```text
Mechanically accepted, visually not final.
```

It was cleaner/minimal but:

- too small,
- no large identity,
- no modular route/model/request/output structure,
- not close to target.

### 10.6 08T-X4 DeepSeek-summoned HUD build attempt

The user wanted Claude as “summoner” and DeepSeek V4 Pro as the heavy designer/executor.

Problem:

- Claude/Sonnet still read too much and consumed huge tokens.
- DeepSeek was invoked, but the overall process got expensive.
- X4 produced an unstaged patch that validated but was paused due token overflow.

Recorded pause label:

```text
08T_X4_DEEPSEEK_SUMMONED_PAUSED_TOKEN_OVERFLOW
```

Reason:

```text
token usage exceeded acceptable ceiling during HUD rebuild
```

DeepSeek status:

```text
used — _SYSTEM/Scripts/offload.sh --model deepseek-v4-pro, exit 0, design plan received
```

Mutation status:

```text
Mutated files: _SYSTEM/Scripts/yuri-repl.mjs
Staged files: none
Validation state:
  NODE_CHECK_PASS
  SELFTEST_PASS
  CLAIM_VERIFIER_ARTIFACT_SMOKE_PASS
```

Manual visual smoke:

- Improved over X3.
- Still not enough.
- Showed:
  - big `YURI OS`,
  - `YURI OS ◆ YURI` panel,
  - SYSTEM and ROUTE/MODEL columns,
  - prompt below.
- But still primitive and not close to target.

Important correction:

```text
DeepSeek inside YURI cannot mutate files.
When using direct YURI DeepSeek route, ask for spec/prompt only, not mutation.
```

### 10.7 08T-X5 DeepSeek direct prompt failure

A prompt was created for YURI direct route, but it still incorrectly asked for:

- capability gates,
- local mutation,
- validation,
- staging,
- commit.

Inside YURI, DeepSeek responded with:

```text
08T_X5_BLOCKED_OUTPUT_ONLY_NO_LOCAL_MUTATION_TOOLS
```

This was judged a prompt design failure, not a model failure.

Corrected architecture:

```text
YURI direct DeepSeek prompt should produce:
- blueprint audit
- weak spot analysis
- improved X5 visual design
- render behavior
- implementation strategy
- validation markers
- manual smoke checklist
- one copy-ready local executor prompt
```

It should not attempt to mutate.

### 10.8 Later accepted HUD restoration/refinement from current uploaded handoff

The latest uploaded handoff indicates a later accepted HUD-related local commit:

```text
HEAD: 81722e778
Commit: fix(cli): refine YURI HUD from restored baseline
Result label:
08T_YURI_HUD_REFINEMENT_FROM_RESTORATION_AND_GOAL_PASS_COMMITTED
```

Changed:

```text
_SYSTEM/Scripts/yuri-repl.mjs
_SYSTEM/Scripts/yuri/status-line.mjs
```

Validation reported:

```text
NODE_CHECK_REPL: PASS
NODE_CHECK_STATUS_LINE: PASS
SELFTEST: PASS
HUD_LARGE_YURI_IDENTITY: PASS
HUD_SUBTITLE_PRESENT: PASS
HUD_NO_VISIBLE_STARTUP_BUDGET: PASS
HUD_RESTORATION_BASELINE_STRENGTH: PASS
HUD_GOAL_LANGUAGE_PARTIALLY_ADOPTED: PASS
ROUTE_LOG_SEPARATION_PRESERVED: PASS
OUTPUT_MD_CLEAN_PRESERVED: PASS
CLAIM_VERIFIER_PRESERVED: PASS
COMPOSER_PRESERVED: PASS
```

Visual summary:

- Startup shows small mark, large `YURI`, and `YURI OS / DEEPSEEK HUD REPL`.
- Startup status is a compact modular panel.
- Visible budget clutter removed.
- Active turn flow preserved:
  - `USER REQUEST`
  - `YURI ROUTE`
  - `MODEL OUTPUT`
  - `OUTPUT SAVED`

---

## 11. Remaining HUD Problem: Boot-Layer Duplicate HUD

A later audit found:

```text
08T_YURI_BOOT_LAYER_DUPLICATE_HUD_AUDIT_P_PASS
```

Diagnosis:

The upper block is not from:

```text
_SYSTEM/Scripts/yuri-repl.mjs
```

It is rendered by:

```text
/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-boot.zsh
```

and sourced by:

```text
/Users/marcelspatz/.zshrc
```

Known facts:

```text
~/.zshrc line ~51: sources _SYSTEM/yuri-boot.zsh
~/.zshrc line ~64: binds yuri to node /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/yuri-repl.mjs
_SYSTEM/yuri-boot.zsh line ~38: render_context_bar() / precmd() renders upper boot HUD
```

Duplicate visual layers:

### 11.1 Boot shell layer

Renders:

- OPERATOR
- SESSION
- MODEL
- WS
- INDEX
- help/oracle hints
- CTX bar
- prompt hooks

### 11.2 YURI REPL layer

Renders:

- logo,
- status,
- DeepSeek route/model output,
- YURI prompt.

### 11.3 Safe next HUD direction

Do not keep blindly patching `_SYSTEM/Scripts/yuri-repl.mjs`.

Next HUD fix should target boot-layer gating.

Likely allowed files:

```text
/Users/marcelspatz/.zshrc
/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-boot.zsh
```

Goal:

- Gate boot banner and CTX prompt behind an environment flag.
- Keep REPL HUD unchanged.
- Default boot HUD off for the `yuri` launch path only.
- Preserve boot HUD for normal shell sessions if wanted.

Acceptance criteria:

- No stacked double logos.
- No duplicate OPERATOR / SESSION / MODEL / INDEX blocks.
- No pre-REPL CTX bar when launching `yuri`.
- REPL HUD from `81722e778` remains the visible base.

---

## 12. DeepSeek Executor Architecture State

### 12.1 Actual local DeepSeek CLI inventory

The local DeepSeek binary exists:

```text
/Users/marcelspatz/.local/bin/deepseek
```

Current behavior:

```text
simple API wrapper only
accepts prompt + model args
no file tools
no shell execution
no git
no read/write agent loop
```

### 12.2 Current YURI DeepSeek route

YURI route path:

```text
_SYSTEM/Scripts/ai
_SYSTEM/Scripts/offload.sh
_SYSTEM/Scripts/offload-runner.mjs
_SYSTEM/Scripts/yuri-repl.mjs
```

Current behavior:

```text
model-only lane
text in → text out
```

Therefore:

```text
DeepSeek V4 Pro inside YURI is not yet a Claude/Codex-style local executor.
```

### 12.3 Safety asset preserved

The local claim verifier is crucial.

When DeepSeek/YURI model output claims:

```text
PASS_COMMITTED
HEAD:
STAGED:
FILES_CHANGED:
VALIDATION:
git commit success
```

the local verifier must downgrade it unless direct local evidence confirms.

This must remain in place for all future DeepSeek executor work.

---

## 13. DeepSeek Agent / Executor Candidate Research

A Sonnet 4.6 research sprint was run:

```text
08U_DEEPSEEK_AGENT_EXECUTOR_COMPATIBILITY_RESEARCH_P_PASS
```

### 13.1 Local inventory

Not installed:

```text
pi
omp
reasonix
deepcode
crush
opencode
```

Available:

```text
VS Code CLI
node/npm
```

### 13.2 Candidate ranking

Primary candidate:

```text
Deep Code / @vegamo/deepcode-cli
```

Reasons:

- Appears to read skills from:
  - `~/.agents/skills/<name>/SKILL.md`
  - possibly project `.deepcode/skills/<name>/SKILL.md`
- Aligns with Yuri/YURI `.agents/skills/` structure.
- Appears to support DeepSeek V4 Pro / Flash.
- May have VS Code extension support.

Secondary candidate:

```text
Crush / @charmland/crush
```

Reason:

- Better-documented OpenAI-compatible/custom provider path.
- Possible future OpenRouter candidate.

Deferred/rejected for now:

```text
Pi: deferred
Oh My Pi: rejected/deferred
Reasonix: reasoning-only lane, not executor
OpenCode: rejected/deferred due uncertainty
Custom guarded bridge: end-state architecture, not first sprint
```

Additional future candidate:

```text
Langcli
```

Reason:

- Claimed “Claude Code compatible.”
- Should be audited later if Deep Code provenance is weak.

---

## 14. DeepCode Provenance Audit Issue

A prompt was created:

```text
08V_DEEPSEEK_DEEPCODE_INSTALL_PROVENANCE_AUDIT_P_WITH_DEEPSEEK_REINFORCEMENT
```

Intended executor:

```text
Claude Code CLI
claude-sonnet-4-6
high reasoning
cwd: /Users/marcelspatz/YURI-OS-MUSUBI
```

Purpose:

- Read-only audit of `@vegamo/deepcode-cli`.
- No install.
- No mutation.
- No commit.
- Optional DeepSeek V4 Pro reinforcement pass after local compact evidence collection.

Problem:

Claude started expensive subagents and broad WebFetch/source fetches:

```text
Fetch deepcode public source docs
Fetch deepcode source config/tools files
multiple 34k–38k token subagents
```

This violated the emerging cheap research protocol.

Immediate stop instruction if still running:

```text
Stop any further subagents or broad WebFetch.
Use already collected evidence.
If one field is missing, use npm view or one raw GitHub file with sed line caps only.
Produce the final report now.
```

---

## 15. Web/Search Cost Control Priority

A major system priority emerged:

```text
Improve web/search research cost control.
```

Problem:

- Full rendered GitHub/doc WebFetch and subagents can burn huge tokens.
- Some source fetches were unnecessary for package provenance.
- Gemini/Codex/Claude can over-fetch unless prompt constraints are strict.

New rule:

```text
Treat excessive web-search token burn as a system issue to fix.
```

### 15.1 Cheap research ladder

Use for package/web/source research:

```text
SEARCH_COST_PROTOCOL:
1. Local/cache first.
2. Package registry metadata second.
3. Raw source files with line caps third.
4. gh api / curl / jq / sed targeted extracts fourth.
5. Snippet/highlight search fifth.
6. Full WebFetch only with explicit justification.
7. No subagents unless explicitly authorized.
```

### 15.2 Future research prompt hard rules

Future research prompts must include:

- no subagents unless explicitly authorized,
- no full WebFetch of rendered GitHub pages,
- use registry metadata first,
- use raw GitHub files only with line caps,
- compact evidence packs,
- no repeated queries after denial,
- DeepSeek reinforcement only from compact evidence,
- report unknowns instead of crawling everything.

---

## 16. DeepSeek Workflow Lessons

### 16.1 DeepSeek should be used heavily, but correctly

The user repeatedly emphasized:

```text
DeepSeek heavy focus.
```

Current best interpretation:

- DeepSeek V4 Pro is a powerful reasoning/synthesis lane.
- DeepSeek V4 Flash is a cheap scout/classifier/validator lane.
- YURI direct route currently provides model output only.
- DeepSeek is not local mutation authority unless integrated through a real agent/executor shell.

### 16.2 Correct current DeepSeek use cases

Use DeepSeek V4 Pro for:

- visual architecture,
- system design,
- prompt audit,
- self-analysis,
- code review from compact evidence,
- implementation planning,
- design spec generation,
- critique of local executor prompts.

Use DeepSeek V4 Flash for:

- cheap classification,
- compact summarization,
- first-pass source/evidence review,
- prompt sanity checks,
- candidate comparison.

Do not use DeepSeek direct route for:

- claiming commits,
- local git status,
- shell execution,
- patching files,
- staging files,
- validating local artifacts,
- final clean-room/IP authority.

### 16.3 Needed future work

Build or integrate a real DeepSeek-backed executor that can:

- read files safely,
- patch files,
- run scoped commands,
- validate markers,
- stage and commit under guard,
- preserve local-truth verifier,
- enforce scope,
- use Yuri skills/Anime-DNA gates.

Potential path:

```text
DeepCode / @vegamo/deepcode-cli provenance audit → controlled install plan → sandbox smoke → skill integration → guarded executor lane
```

---

## 17. Important Prompt Design Corrections

### 17.1 Do not include “open DeepSeek” inside YURI prompt

Wrong:

```text
Use DeepSeek V4 Pro with max reasoning.
Check whether you can mutate files.
Call _SYSTEM/Scripts/offload.sh.
Commit the patch.
```

Correct:

```text
You are already running inside YURI through DeepSeek V4 Pro.
Do not call DeepSeek.
Do not offload.
Do not mutate files.
Audit this blueprint.
Self-assess.
Produce implementation spec.
Produce one copy-ready local executor prompt.
```

### 17.2 Condensed blueprint is better than full old prompt

The user asked whether the prompt included the prompt being audited.

Answer:

- It included a compact blueprint under `BEGIN BLUEPRINT`.
- That was better than pasting the full massive old prompt.
- For YURI direct prompts, use condensed authoritative blueprint to reduce token burn.

### 17.3 Future prompt shape for YURI direct DeepSeek

Recommended structure:

```text
<LANE_LABEL>

You are already inside YURI through DeepSeek V4 Pro.
Do not call/offload/open DeepSeek.
Do not mutate files.
Do not claim local truth.

Task:
audit → improve → self-assess → produce spec → produce executor prompt.

Output:
final report only,
dyslexic-friendly,
short lines,
clear labels,
no giant tables,
no fake repo claims.
```

---

## 18. Current Recommended Next Moves

### 18.1 If continuing HUD lane

Next safe lane:

```text
08T_YURI_BOOT_LAYER_GATE_P
```

Purpose:

- Plan boot-layer gating.
- Do not patch blindly.
- Identify exact behavior in:
  - `_SYSTEM/yuri-boot.zsh`
  - `~/.zshrc`
- Plan how to suppress boot HUD only for `yuri` launch path.
- Preserve normal shell boot HUD if desired.
- Preserve REPL HUD from `81722e778`.

Executor recommendation:

```text
Claude Sonnet 4.6 or Codex GPT-5.4-mini
```

Reason:

- This involves shell startup files and user-level `.zshrc`.
- Needs careful scope.
- Should not be done by YURI direct DeepSeek alone.

### 18.2 If continuing DeepSeek executor lane

Next safe lane:

```text
08V_DEEPSEEK_DEEPCODE_INSTALL_PROVENANCE_AUDIT_P_REPAIRED
```

Goal:

- Repair the provenance audit prompt to enforce cheap research protocol.
- No subagents.
- No full WebFetch.
- No install.
- No mutation.
- Use npm registry metadata.
- Use at most 3 raw GitHub files with line caps if needed.
- Optional DeepSeek V4 Pro reinforcement from compact evidence only.

Executor recommendation:

```text
Claude Haiku or Sonnet depending on risk, with strict no-subagent rules.
```

### 18.3 If continuing archive ingestion lane

The user has a full archive of Yuri OS / YURI project history markdown files in Downloads.

Goal:

- Move them to proper repo archive directory.
- Digest into ecosystem.
- Track internally.
- Shift planning/execution toward Claude/Codex/DeepSeek/Gemini self-analysis.
- ChatGPT Web becomes double-check/gatekeeper.

This is a major next lane after current HUD/DeepSeek executor stabilization.

Suggested lane:

```text
08W_ARCHIVE_IMPORT_PLAN_P
```

No mutation until plan is reviewed.

---

## 19. Current Accepted / Mentioned Commits From This Session

```text
1549dd2a4 test(cli): add YURI claim verifier artifact smoke
3e7398bcc fix(cli): auto-send YURI pasted multiline input
ee60bccd3 fix(cli): separate YURI route logs from model output
61b4689a1 fix(cli): hide YURI HUD budget line
49731654f fix(cli): polish YURI compact HUD
f2b7a1640 fix(cli): repair YURI HUD visual layout
701e24add fix(cli): rebuild YURI HUD shell
81722e778 fix(cli): refine YURI HUD from restored baseline
```

Note:

- Some intermediate commits were visually failed but mechanically accepted.
- `81722e778` is the latest reported HUD refinement commit in the uploaded continuation handoff.
- Direct local verification is still required before future mutation.

---

## 20. Current Open Risks

### 20.1 HUD risks

- Boot-layer duplicate HUD not yet fixed.
- `.zshrc` mutation is outside repo and must be handled carefully.
- `_SYSTEM/yuri-boot.zsh` may affect normal terminal sessions.
- Further REPL HUD patching may make things worse unless boot-layer issue is resolved first.

### 20.2 DeepSeek executor risks

- DeepSeek current CLI is not a local executor.
- Model can generate false commit/status claims.
- DeepCode provenance not established.
- Installing agent packages without provenance audit is unsafe.
- DeepSeek direct route can waste time if asked to do impossible local actions.

### 20.3 Token/cost risks

- Claude subagents and broad WebFetch can explode token usage.
- Gemini/other agents can produce verbose unreliable outputs.
- Full file reads and broad source fetching must be banned by default.
- Web research should be tightly laddered.

### 20.4 Local truth risks

- Lower-lane summaries can hallucinate local state.
- Always verify commits/staged/diff/HEAD directly.
- Claim verifier must remain preserved.

---

## 21. Canonical Continuation Prompt for Fresh GPT Chat

Use this if continuing from this archive in a new GPT session:

```text
Continue Yuri OS / YURI from this archive-ready session handoff.

You are GPT-5.5 Thinking acting as senior AI systems architect, terminal UI architect, CLI UX designer, LLMOps engineer, TokenOps engineer, prompt architect, Anime-DNA gatekeeper, clean-room/IP gatekeeper, and Yuri OS / YURI strategic coordinator.

Repo root: /Users/marcelspatz/YURI-OS-MUSUBI
Branch: main
Timezone: Europe/Vienna
Current date context: 2026-05-03

Hard rules:
- Do not generate images unless I explicitly ask for image generation.
- For HUD/image/design work, act as visual architect and prompt/spec writer only.
- Always tell me the recommended executor/model and where to paste/run a prompt.
- Serious sprint prompts must be one complete copy-ready block.
- Treat stages as internal sequencing inside ONE_TRANSACTION.
- Use FINAL_REPORT_ONLY_UNLESS_BLOCKED.
- Use tokenmaxxing.
- Avoid broad git/status/diff/find/log commands.
- Use exact-path status and marker-only checks.
- Direct local git/shell truth beats all model claims.
- Keep reports compact.

Current key state:
- Latest reported HUD refinement commit: 81722e778 fix(cli): refine YURI HUD from restored baseline.
- HUD duplicate layer audit found upper block comes from _SYSTEM/yuri-boot.zsh sourced by ~/.zshrc, not _SYSTEM/Scripts/yuri-repl.mjs.
- Next HUD fix should target boot-layer gating, not more REPL HUD patching.
- YURI direct DeepSeek route is model-only, not a local file executor.
- DeepSeek direct prompts should audit/spec/self-assess and produce executor prompts, not mutate.
- DeepCode / @vegamo/deepcode-cli is the primary candidate for a future DeepSeek-backed executor, but provenance audit was too expensive and must be rerun with cheap research protocol.
- Web/search cost control is now a priority. No subagents/full WebFetch unless explicitly authorized.

First task:
Acknowledge the trusted state and ask me which lane to continue:
1. HUD boot-layer gating plan,
2. DeepCode provenance audit repair,
3. archive import / ingestion plan.
```

---

## 22. Short Current State Summary

If only one compact memory atom is ingested, use this:

```text
As of 2026-05-03, Yuri OS / YURI HUD work passed several mechanical commits but visual work remained difficult. The latest reported useful HUD commit is 81722e778, restoring/refining a stronger YURI baseline HUD while preserving route separation, output.md cleanliness, claim verifier, composer, and no visible budget. A later audit found the remaining double-HUD problem comes from _SYSTEM/yuri-boot.zsh sourced by ~/.zshrc, not _SYSTEM/Scripts/yuri-repl.mjs. Next HUD work should gate the boot layer for yuri launches, not patch the REPL blindly. DeepSeek V4 Pro should be used heavily but correctly: current YURI DeepSeek route is model-only and cannot mutate files. Direct DeepSeek prompts should audit/design/spec and produce local executor prompts, not commit. DeepCode/@vegamo/deepcode-cli is the main candidate for future DeepSeek-backed executor, but provenance audit must be repaired with strict cheap research protocol. Web/search token burn is now a system issue: no subagents/full WebFetch by default, use local/cache/npm/raw-line-capped source ladder, compact evidence, DeepSeek reinforcement only from compact evidence. ChatGPT Web should not generate images unless explicitly requested and should act as visual architect/gatekeeper for HUD/design work.
```
