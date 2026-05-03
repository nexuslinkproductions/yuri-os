# Yuri OS / NUDIMMUD Session Continuation Handoff

**Generated:** 2026-05-03  
**Project:** Yuri OS / NUDIMMUD  
**Repo root:** `/Users/marcelspatz/NUDIMMUD`  
**Branch:** `main`  
**Primary user goal:** Make DeepSeek a real, safe, low-cost, high-capability executor lane for Yuri OS / NUDIMMUD while preserving local truth, reducing token burn, and stabilizing the NUDIMMUD terminal/HUD workflow.

---

## 1. Critical conversation rules to preserve

- Do **not** generate images unless explicitly asked.
- For HUD/image/design work, act as **visual architect and prompt/spec writer**, not image generator.
- Serious sprint prompts must be:
  - `ONE_TRANSACTION`
  - `FINAL_REPORT_ONLY_UNLESS_BLOCKED`
  - copy-paste ready in **one complete block**
  - explicit about executor/model and where to paste/run
  - tokenmaxxing-aware
- Do not let model output become accepted truth for:
  - commits
  - HEAD
  - staged state
  - validation
  - mutation
  - file changes
- Direct local shell/git truth beats all model claims.
- Keep reports compact.
- Avoid giant prompt bloat and repeated huge context.
- Avoid broad repo commands in dirty repos.
- Use exact-path status and marker-only checks.

---

## 2. Current known repo state

The last confirmed successful HUD-related local commit from Codex was:

```text
HEAD: 81722e778
Commit: fix(cli): refine NUDIMMUD HUD from restored baseline
Result label: 08T_NUDIMMUD_HUD_REFINEMENT_FROM_RESTORATION_AND_GOAL_PASS_COMMITTED
Changed files:
- Scripts/nudimmud-repl.mjs
- Scripts/nudimmud/status-line.mjs
```

Validation from that Codex run:

```text
NODE_CHECK_REPL: PASS
NODE_CHECK_STATUS_LINE: PASS
SELFTEST: PASS
HUD_LARGE_NUDIMMUD_IDENTITY: PASS
HUD_SUBTITLE_PRESENT: PASS
HUD_NO_VISIBLE_STARTUP_BUDGET: PASS
HUD_RESTORATION_BASELINE_STRENGTH: PASS
HUD_GOAL_LANGUAGE_PARTIALLY_ADOPTED: PASS
ROUTE_LOG_SEPARATION_PRESERVED: PASS
OUTPUT_MD_CLEAN_PRESERVED: PASS
CLAIM_VERIFIER_PRESERVED: PASS
COMPOSER_PRESERVED: PASS
```

Important visual summary from that commit:

- Startup shows small mark, large `NUDIMMUD` identity, and `YURI OS / DEEPSEEK HUD REPL` subtitle.
- Startup status is a compact modular panel:
  - operator
  - session
  - model
  - OS
  - state
  - TMX
  - branch
  - head
  - staged
  - last
- Visible startup budget clutter was removed:
  - no `40k`
  - no `40000`
  - no CTX bar
  - no budget warning line
- Active turn flow preserved:
  - USER REQUEST
  - NUDIMMUD ROUTE
  - MODEL OUTPUT
  - OUTPUT SAVED
- Route separation and output.md cleanliness remain intact.

---

## 3. HUD issue that remains

After the HUD baseline restore, there was still a visual double-layer problem.

A later audit found:

```text
Result: 08T_NUDIMMUD_BOOT_LAYER_DUPLICATE_HUD_AUDIT_P_PASS
```

### Diagnosis

The upper block is **not** rendered by `Scripts/nudimmud-repl.mjs`.

It is rendered by:

```text
/Users/marcelspatz/NUDIMMUD/_SYSTEM/nudimmud-boot.zsh
```

It is sourced from:

```text
/Users/marcelspatz/.zshrc
```

Known lines from audit:

```text
~/.zshrc line ~51: sources _SYSTEM/nudimmud-boot.zsh
~/.zshrc line ~64: binds nudimmud to node /Users/marcelspatz/NUDIMMUD/Scripts/nudimmud-repl.mjs
_SYSTEM/nudimmud-boot.zsh line ~38: render_context_bar() / precmd() renders upper boot HUD
```

The duplicated visual layers are:

1. **Boot shell layer**
   - OPERATOR
   - SESSION
   - MODEL
   - WS
   - INDEX
   - help/oracle hints
   - CTX bar
   - prompt hooks

2. **NUDIMMUD REPL layer**
   - logo
   - status
   - DeepSeek route/model output

### Safe next HUD direction

Do **not** keep patching `Scripts/nudimmud-repl.mjs` blindly.

The next HUD fix should target boot-layer gating:

- allowed likely files:
  - `/Users/marcelspatz/.zshrc`
  - `/Users/marcelspatz/NUDIMMUD/_SYSTEM/nudimmud-boot.zsh`
- goal:
  - gate the boot banner and CTX prompt behind an environment flag
  - keep REPL HUD unchanged
  - default boot HUD off for the `nudimmud` launch path only
  - preserve boot HUD for normal shell sessions if wanted
- acceptance:
  - no stacked double logos
  - no duplicate OPERATOR / SESSION / MODEL / INDEX blocks
  - no pre-REPL CTX bar when launching `nudimmud`
  - REPL HUD from `81722e778` remains the visible base

---

## 4. DeepSeek executor architecture state

There was confusion about DeepSeek being a real executor.

Current verified local state:

```text
deepseek binary:
  /Users/marcelspatz/.local/bin/deepseek

Current deepseek CLI behavior:
  simple API wrapper only
  accepts prompt + model args
  no file tools
  no shell execution
  no git
  no read/write agent loop

NUDIMMUD current DeepSeek route:
  Scripts/ai / Scripts/offload.sh / Scripts/offload-runner.mjs / Scripts/nudimmud-repl.mjs
  model-only lane
  text in → text out
```

Important correction:

- NUDIMMUD using DeepSeek V4 Pro does **not** currently mean DeepSeek can mutate files.
- False `PASS_COMMITTED` claims from model output are correctly downgraded by local verifier when local git does not confirm.
- The local verifier is a key safety asset and must be preserved.

---

## 5. DeepSeek agent candidate research

A Sonnet 4.6 research sprint was run to assess whether `pi` would be best and whether DeepSeek can become a Claude/Codex-like executor.

Result:

```text
08U_DEEPSEEK_AGENT_EXECUTOR_COMPATIBILITY_RESEARCH_P_PASS
```

### Local inventory

```text
pi:       not installed
omp:      not installed
reasonix: not installed
deepcode: not installed
crush:    not installed
opencode: not installed

VS Code CLI: available
node/npm: available
```

### Candidate ranking from the report

Primary candidate:

```text
Deep Code / @vegamo/deepcode-cli
```

Reason:

- It appears to read skills from:
  - `~/.agents/skills/<name>/SKILL.md`
  - possibly project-level `.deepcode/skills/<name>/SKILL.md`
- This aligns with Yuri/NUDIMMUD’s existing `.agents/skills/` structure.
- It appears to support DeepSeek V4 Pro / Flash.
- It may have VS Code extension support.

Secondary future candidate:

```text
Crush / @charmland/crush
```

Reason:

- Best-documented OpenAI-compatible/custom provider path.
- Better future OpenRouter candidate.

Deferred or rejected for now:

```text
Pi: deferred
Oh My Pi: rejected/deferred
Reasonix: reasoning-only lane, not executor
OpenCode: rejected/deferred due uncertainty
Custom guarded bridge: end-state architecture, but not first sprint
```

One follow-up candidate from the awesome-deepseek-agent repo:

```text
Langcli
```

Reason:

- Claimed “Claude Code compatible”.
- Should be audited later if Deep Code provenance is weak.

---

## 6. DeepCode provenance audit in progress / likely issue

A prompt was created:

```text
08V_DEEPSEEK_DEEPCODE_INSTALL_PROVENANCE_AUDIT_P_WITH_DEEPSEEK_REINFORCEMENT
```

It was intended to run with:

```text
Claude Code CLI
claude-sonnet-4-6
high reasoning
cwd: /Users/marcelspatz/NUDIMMUD
```

Purpose:

- Read-only audit of `@vegamo/deepcode-cli`
- No install
- No mutation
- No commit
- Optional DeepSeek V4 Pro reinforcement pass after local evidence collection

### Problem observed

Sonnet started using expensive subagents and large WebFetch/source fetches:

- `Fetch deepcode public source docs`
- `Fetch deepcode source config/tools files`
- multiple 34k–38k token subagents

This became too expensive and needs to be stopped.

### Immediate instruction to give if still running

```text
Stop any further subagents or broad WebFetch. Use already collected evidence. If one field is missing, use npm view or one raw GitHub file with sed line caps only. Produce the final report now.
```

---

## 7. New priority: cheap web/search research pipeline

The session concluded that web/search token burn is now a system issue.

This must be remembered as a priority:

> For Yuri OS / NUDIMMUD workflows, improve web/search research cost control. Avoid expensive subagent/WebFetch patterns by default, especially full rendered GitHub/doc fetches. Prefer cheap research ladders: local/cache/grep, npm registry metadata, raw GitHub files with line caps, `gh api`, `curl`, `jq`, `sed`, snippet/highlight search, and only then targeted extracts. Add hard prompt rules: no subagents unless explicitly authorized, no full WebFetch of rendered GitHub pages, compact evidence packs, line/token caps, and DeepSeek reinforcement only from compact evidence. Treat excessive web-search token burn as a system issue to fix.

---

## 8. Cheap research ladder to enforce

Use this for all future research/package/web prompts:

```text
SEARCH_COST_PROTOCOL:
1. Local/cache first.
2. Package registry metadata second.
3. Raw source files with line caps third.
4. Search snippets/highlights fourth.
5. Targeted page extract fifth.
6. Full WebFetch/crawl only with explicit approval.

Never spawn subagents for routine web/package research.
Never fetch rendered GitHub pages when raw files or gh api can answer it.
DeepSeek reinforcement receives only compact evidence.
```

### Hard token rules

```text
TOKEN COST HARD RULES:
- Do not spawn subagents unless explicitly authorized.
- Do not use WebFetch on rendered GitHub pages unless raw files are unavailable.
- Prefer npm view, GitHub raw files, gh api, curl + sed, jq, rg, grep.
- Do not fetch whole docs when a package.json, README section, or config example is enough.
- If any single tool call may exceed 120 lines or 8k tokens, stop and use a narrower command.
- Web evidence pack must be compact: max 80 lines total.
- DeepSeek reinforcement gets only compact evidence, never raw fetched docs.
- Final report max 120 lines unless blocked.
```

---

## 9. Suggested cheap Claude wrapper idea

For now, the cleanest temporary setup is a Claude Code cheap-research mode, not a new MCP stack.

One-off pattern:

```bash
cd /Users/marcelspatz/NUDIMMUD

claude -p "$(
cat <<'EOF'
Research this with the cheap research ladder only:

<TASK HERE>

Rules:
- No subagents.
- No full WebFetch.
- No rendered GitHub pages.
- Prefer npm view, gh api, raw GitHub files, curl + sed, jq, rg, grep.
- If a command may output over 120 lines, narrow it first.
- Evidence pack max 80 lines.
- Final report max 80 lines.
- Do not install, mutate, stage, commit, or print secrets.
EOF
)" \
--append-system-prompt "You are in TOKENMAXXING cheap-research mode. Prefer exact metadata and capped raw sources. Do not spawn subagents. Do not fetch full rendered web pages. Stop and report if the task requires broad crawling." \
--allowedTools "Bash(pwd),Bash(git branch *),Bash(git rev-parse *),Bash(git diff --cached *),Bash(git status --short *),Bash(npm view *),Bash(npm info *),Bash(command -v *),Bash(curl -L *),Bash(gh api *),Bash(jq *),Bash(sed *),Bash(grep *),Bash(rg *)"
```

Possible shell helper later:

```bash
cheapclaude() {
  claude -p "$1" \
    --append-system-prompt "TOKENMAXXING cheap-research mode. No subagents. No full WebFetch. No rendered GitHub pages. Use local files, npm view, gh api, raw GitHub, curl+sed, jq, rg/grep first. Evidence max 80 lines. Final max 80 lines. No installs, no mutation, no secrets." \
    --allowedTools "Bash(pwd),Bash(git branch *),Bash(git rev-parse *),Bash(git diff --cached *),Bash(git status --short *),Bash(npm view *),Bash(npm info *),Bash(command -v *),Bash(curl -L *),Bash(gh api *),Bash(jq *),Bash(sed *),Bash(grep *),Bash(rg *)"
}
```

Do **not** immediately install Brave/Exa/Tavily/Firecrawl MCP until the pipeline is audited.

---

## 10. Next recommended sprint

The next best sprint is not more HUD work and not more DeepCode install work.

It should be the low-cost research pipeline audit:

```text
08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P
```

Recommended executor:

```text
Claude Code CLI
claude-sonnet-4-6
high reasoning
cwd: /Users/marcelspatz/NUDIMMUD
```

### Copy-ready prompt for next chat

```text
08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P

You are Claude Code CLI acting as TokenOps architect, LLMOps engineer, research-pipeline architect, DevEx engineer, and Yuri OS / NUDIMMUD cost-control coordinator.

This is a read-only audit.

Goal:
Design a cheaper research pipeline for Yuri OS / NUDIMMUD so web/package/source research does not burn massive Claude/Codex tokens.

Current problem:
Recent package research spawned subagents and used full WebFetch on large GitHub/doc pages, causing 30k+ tokens per agent. This is not acceptable for routine provenance/package audits.

Do not install anything.
Do not run npx.
Do not modify files.
Do not stage.
Do not commit.
Do not print secrets.
Do not call live paid APIs.
Do not fetch huge pages unless absolutely necessary.

Hard rules:
- No subagents.
- No WebFetch of rendered GitHub pages.
- No full file dumps.
- No broad repo grep.
- No command output over 120 lines.
- Prefer exact metadata and raw sources.
- Final report only unless blocked.

Preflight:
pwd
git branch --show-current
git rev-parse --short HEAD
git diff --cached --name-only

Audit these cheaper research methods:

1. npm package metadata
- npm view <package> --json
- npm view <package> scripts dependencies dist.integrity bin repository

2. GitHub raw/source metadata
- raw.githubusercontent.com for README/package/config files
- gh api if available
- curl -L with sed line caps
- grep exact terms only

3. Existing local tools
- command -v gh
- command -v jq
- command -v curl
- command -v python3
- command -v npm
- command -v rg

4. MCP/API candidates for later
Assess only from public docs or known source references:
- Brave Search MCP/API
- Exa MCP/highlights
- Tavily search/extract chunks
- Firecrawl MCP
- Perplexity MCP as future lane
- SearxNG/self-hosted option if practical

For each candidate, evaluate:
- token efficiency
- cost / free tier
- MCP compatibility with Claude Code / VS Code / Cursor where documented
- snippet/chunk mode availability
- risk of huge content dumps
- API key handling
- best use case
- whether it should be added to Yuri OS later

Design required:
Create a research ladder:

Tier 0:
Local docs/cache/grep only.

Tier 1:
Package registry metadata only.

Tier 2:
Raw source files with line caps.

Tier 3:
Search snippets / highlights only.

Tier 4:
Targeted extract of one page section.

Tier 5:
Full scrape/crawl only with explicit approval.

Also design:
- no-subagent rule
- evidence-pack size caps
- DeepSeek reinforcement compact handoff format
- package audit template
- web search template
- source-doc audit template
- stop conditions

Final report format:

RESULT:
08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P_PASS
or
08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P_BLOCKED

CURRENT:
- cwd:
- branch:
- HEAD:
- staged:

LOCAL_TOOLING:
- gh:
- jq:
- curl:
- python3:
- npm:
- rg:

DIAGNOSIS:
- what caused the token burn:
- why subagents were expensive:
- why WebFetch was expensive:

RESEARCH_LADDER:
- Tier 0:
- Tier 1:
- Tier 2:
- Tier 3:
- Tier 4:
- Tier 5:

WEB_SEARCH_OPTIONS:
- Brave:
- Exa:
- Tavily:
- Firecrawl:
- Perplexity:
- SearxNG/self-hosted:

RECOMMENDED_DEFAULT:
- package audits:
- GitHub docs:
- broad web research:
- exact source verification:
- DeepSeek reinforcement:

PROMPT_RULE_BLOCK:
- provide a reusable copy-paste block for all future research prompts

NEXT_MUTATION_SPRINT:
- title:
- purpose:
- allowed files:
- forbidden files:
- install allowed:
- expected output:

NON_CLAIMS:
- no install performed
- no mutation performed
- no commit performed
- no paid API call performed
```

---

## 11. Future DeepSeek executor roadmap

After 08W cost-control is fixed, continue with DeepCode/DeepSeek agent setup in phases:

1. **Finish 08V DeepCode provenance audit** using cheap research rules.
2. If safe, run controlled Phase 2 install in a throwaway sandbox.
3. Confirm CLI behavior:
   - help surface
   - config path
   - skill discovery
   - read-only repo access
   - no unintended mutation
4. Only later allow write scope.
5. Wrap all agent output through local verifier.
6. No commit-capable lane until local truth and per-operation approval are solid.
7. Add Obsidian read-only later.
8. Add RAG/MLM read-only later.
9. Add write access only after separate sprint approval.
10. Add OpenRouter/Crush lane later.

---

## 12. Important user preference / frustration context

The user is frustrated by:

- having to puzzle together prompts manually
- agents hallucinating commits
- huge token bills
- DeepSeek being treated as model-only when the user wants it to become a real executor
- HUD work drifting and getting worse
- repeated prompt bloat
- Claude/Codex/DeepSeek solving the wrong layer

Future responses should:

- give one clean copy-ready block
- state executor/model and where to paste
- avoid over-explaining unless asked
- avoid mentioning offloading unless directly relevant
- keep architecture precise but not bloated
- separate “what is true now” from “future desired architecture”
- not claim DeepSeek can mutate until real agent lane exists
- use DeepSeek as reinforcement/quality layer only until a real executor harness is installed

---

## 13. Very short next-chat opening summary

Use this if starting a fresh chat:

```text
Continue Yuri OS / NUDIMMUD from the 2026-05-03 handoff.

Current accepted repo state:
HEAD 81722e778 fix(cli): refine NUDIMMUD HUD from restored baseline.
REPL HUD is improved and committed. Remaining duplicate visual layer comes from _SYSTEM/nudimmud-boot.zsh sourced by ~/.zshrc, not from Scripts/nudimmud-repl.mjs.

Current priority:
Stop expensive web/search behavior. We need 08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P before continuing DeepCode install/provenance or DeepSeek executor setup.

Rules:
No image generation unless explicitly asked.
Serious prompts must be one copy-ready block.
Tokenmaxxing mandatory.
No subagents or full WebFetch unless explicitly authorized.
Use cheap research ladder: local/cache → npm view → raw GitHub/gh api/curl+sed → snippets/highlights → targeted extract → full crawl only with approval.
DeepSeek reinforcement gets compact evidence only.
Direct local shell/git truth beats model claims.
```
