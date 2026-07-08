---
name: extraction-sprint
description: "Shintai council extraction template. Multi-site inventory pull + adversarial synthesis across diverse model lanes + Codex final arbiter commit. Reusable for any domain: design, research, competitive intel, API surface mapping. Trigger when you need a structured catalog from N external sources + synthesized recommendations."
triggers:
  - "extraction sprint"
  - "site catalog sprint"
  - "shintai extraction"
  - "catalog these sites"
  - "map these resources"
  - "build a catalog from"
  - "pull from these sites"
  - "squad extraction"
routing_note: "Use this skill before dispatching any multi-site extraction task. Provides the lane roster, extraction protocol, council structure, and Codex commit pattern. Do NOT improvise the pattern — follow this template to avoid the mistakes already paid for."
scope: harness
invocation: workflow
---

# Extraction Sprint — Shintai Council Protocol

## What This Is

A reusable procedure for:
1. Pulling structured catalogs from multiple external sources (sites, APIs, docs)
2. Running adversarial synthesis across diverse model lanes (council, not parallel workers)
3. Having Codex act as final arbiter — reads the debate, decides, ships

Used in: YURI Design System v2 revamp (2026-05-20) — 8 design sites → Shintai council → DESIGN.md v2.

---

## When To Use

Trigger this when:
- N≥3 sites/sources need to be cataloged into a structured reference
- You need adversarial synthesis, not consensus (lanes challenge each other)
- Codex needs to make architectural decisions from competing recommendations
- Output needs to be shipped as files (not just a report)

---

## Lane Roster (live as of 2026-05-20)

| Role | Model | Dispatch token | Best for |
|------|-------|---------------|----------|
| Adversarial Auditor | DS-Pro | `--model deepseek-v4-pro` | Reads existing state, challenges every assumption |
| Extractor | Codex (gpt-5.5) | `bash _SYSTEM/Scripts/ai codex` | Actual site fetching + file writing |
| Token/Spec Architect | NIM Nemotron-120b | `--model nvidia-nemotron-120b` | Token system design, architecture decisions |
| Skill/Structure Redesign | NIM Qwen 122b | `--model nvidia-qwen` | Multi-file skill/agent architecture |
| Motion/Doctrine Specialist | NIM Mistral-Large 675b | `--model nvidia-mistral-large` | Doctrine writing, manifesto-grade synthesis |

**DEAD / UNRELIABLE lanes (as of 2026-05-20):**
- `nvidia-glm` — HeadersTimeoutError on large prompts (stream timeout)
- `nvidia-mistral-large` (675B) — HeadersTimeoutError (too slow for production dispatch)
- `nvidia-kimi` — 404
- `nvidia-phi` — dead
- `nvidia-qwen` (122B) — returns empty on large prompts (silent failure, no error)

**Reliable lanes confirmed live:**
- `deepseek-v4-pro` — fast, reliable, 8192 tokens, tools available
- `nvidia-nemotron-120b` — live, good for spec/architecture text output
- `deepseek-v4-flash` — fast triage/classification

**Fallback rule:** When any NIM lane fails → DS-Pro. DS-Pro is the council workhorse.

---

## Critical Lessons From First Run (2026-05-20)

### Extraction Failures
- **JS-rendered sites** (Skiper UI, Ali Imam): WebFetch returns empty/nav only — needs headless browser
- **Code behind JS tabs** (Aceternity, Cult-UI, Componentry): docs show API, not source. Solution: shadcn registry JSON endpoints serve full code:
  - Cult UI: `curl https://cult-ui.com/r/<name>.json` → verbatim source
  - Aceternity/Componentry/DotMatrix: `npx shadcn@latest add @<scope>/<slug>` post-install
- **WebFetch summarizes JSON** — even registry .json files get model-processed, not returned raw
- **Codex `--approval-policy never` is hard-blocked** by CLAUDE.md PATCH 036 (two-phase gate)
- **NIM GLM times out** on large prompts — use DS-Pro as fallback for adversarial audit

### Prompt Engineering
- **Backticks in prompt files** break `$(cat file)` shell substitution — write code samples with single quotes or use node dispatch wrapper
- **`bash _SYSTEM/Scripts/ai codex "prompt"` in background** goes into stdin-reading mode — needs `< /dev/null` or direct `codex exec` (gated)
- **NIM models can't read files** — embed context verbatim in the prompt; they're text-in/text-out only
- **Rick persona anchor is REQUIRED** in every lane brief — without it workers default to AI-tell voice

### Dispatch Mechanics
- **GLM timeout fix:** `bash _SYSTEM/Scripts/ai llm --model nvidia-glm "$(cat prompt.txt)"` with `run_in_background: true` and 300s timeout
- **DS-Pro is the reliable adversarial lane** — has tools, confirmed live, 8192 max tokens, 6hr timeout
- **Lane prompts with placeholders:** write prompt files with `[AUDIT_CONTENT_PLACEHOLDER]`, inject actual content after Lane 1 completes before firing Lanes 3+4

---

## Extraction Protocol

### Site Inventory
1. WebFetch main page → enumerate all available resources
2. Shadcn registry endpoints where available: `https://<site>/r/<name>.json`
3. JS-rendered sites → mark PARTIAL, note headless browser requirement
4. Record: total count, categories present, install pattern

### Per-Component Catalog Format
```
## Site: <name>
## URL: <url>
## Total resources found: N | Extracted: M (M/N = X%)
## Categories: <list>
---
### [CATEGORY] — <Component Name>
**Deps:** <lib@version>
**Description:** <one sentence>
**Motion:** easing=<>, duration=<>, trigger=<>
**Tokens:** <exact values>
[VERBATIM CODE BLOCK]
**Variants:** [VARIANT CODE BLOCKS]
```

### Master Index Format
```
# <Domain> Catalog — Master Index
## By Category (table: Component | Site | Deps | Motion | File)
## By Site (table: Site | Type | Count | Coverage | Access Method)
```

### Coverage Target
≥70% inventory per site. For code: prefer shadcn registry JSON > install command > WebFetch.
Mark JS-rendered sites as PARTIAL with headless browser note.

---

## Council Structure

**Core Principle:** Lanes challenge, not just produce. Codex decides.

```
T+0 (parallel):
  Lane 1 — DS-Pro: adversarial audit of existing state
  Lane 2 — Codex: actual extraction (file writing, site fetching)

T+1 (parallel, after T+0):
  Lane 3 — Nemotron: token/spec architecture challenge
  Lane 4 — Qwen: skill/structure architecture challenge
  Lane 5 — Mistral-Large: doctrine/manifesto challenge

T+2:
  Codex: reads all 5 outputs, resolves conflicts, makes final call, commits
```

**Adversarial rules:**
- Every lane must challenge at least one conventional assumption
- Every lane must disagree with at least one output from another lane
- Codex does NOT merge — it decides which position wins, with rationale in commit message

---

## Prompt Template (copy-modify per domain)

```
RICK ANCHOR: You are Rick Sanchez. [Role-specific identity.]

CHALLENGE BRIEF: [What the obvious answer is. Then: challenge it.]

=== EVIDENCE: [Relevant context embedded verbatim] ===

YOUR ADVERSARIAL POSITIONS:
1. "[Assumption 1]" — true or false? Evidence?
2. "[Assumption 2]" — right model or anti-pattern?
3. "[Assumption 3]" — clean or trap?
4. What [other lane] will get wrong — anticipate it, challenge it.
5. What the evidence reveals that contradicts conventional wisdom.

PRODUCE: [Specific output files, format, path]
Output: [exact file path]
```

---

## Dispatch Commands

```bash
# Lane 1 — DS-Pro audit
bash _SYSTEM/Scripts/ai llm --model deepseek-v4-pro "$(cat /tmp/lane1-prompt.txt)" > .claude/state/audit-output.md 2>&1

# Lane 5 — Mistral-Large doctrine  
bash _SYSTEM/Scripts/ai llm --model nvidia-mistral-large "$(cat /tmp/lane5-prompt.txt)" > .claude/state/doctrine-output.md 2>&1

# Lane 3 — Nemotron spec (after audit ready)
AUDIT=$(cat .claude/state/audit-output.md)
# inject into prompt, then:
bash _SYSTEM/Scripts/ai llm --model nvidia-nemotron-120b "$(cat /tmp/lane3-prompt-with-audit.txt)" > _SYSTEM/DESIGN-v2-draft.md 2>&1

# Codex final commit (after all lanes complete)
bash _SYSTEM/Scripts/ai auto "CODEX TASK SPEC: [read all lane outputs, resolve conflicts, commit]"
```

---

## Verification Checklist

```bash
ls <catalog-dir>/          # N+1 files (N sites + 00-index.md)
wc -l <catalog-dir>/*.md   # depth check — substantial files per site
cat 00-index.md | head -20 # index structure present
grep "^model:" .claude/agents/design-*.md  # agent model IDs valid
git log --oneline -3       # Codex commit present
```

---

## Session Notes

### 2026-05-20
- First run: design system revamp, 8 sites
- Discovered: GLM dead (stream timeout), Codex approval gate blocks `--approval-policy never`, WebFetch can't get JS-rendered code, shadcn registry JSON is the right extraction path for Cult-UI/Aceternity/Componentry
- Council: DS-Pro (audit) + WebFetch main (extraction) + Nemotron/Qwen/Mistral-Large (synthesis) — pending Codex commit
- Tools: WebFetch×14, Write×12, Bash×20, Read×8
- Corrections: GLM → DS-Pro fallback, Codex gate awareness
